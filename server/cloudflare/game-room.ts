import { DurableObject } from 'cloudflare:workers';
import { randomInt, randomUUID } from 'node:crypto';
import { Type, type Static } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';
import {
  CredentialsSchema,
  CreateRoomSchema,
  JoinRoomSchema,
  RoomActionSchema,
  RoomCodeSchema,
  type CreateRoom,
  type RoomAction,
  type Side,
} from '../../shared/contracts';
import { rollDice } from '../../shared/game';
import { applyAiMove, roomAiOptions } from '../rooms/ai-settings';
import { chooseMove } from '../ai';
import { HttpError } from '../http/errors';
import { actOnRoom, createRoom, joinRoom, needsAi, roomView } from '../rooms/domain';
import { authenticate } from '../rooms/identity';
import { ROOM_TTL_MS, StoredRoomSchema, type Room } from '../rooms/model';

const WorkSchema = Type.Union([
  Type.Object({ status: Type.Literal('queued') }),
  Type.Object({
    status: Type.Literal('inFlight'),
    attemptId: Type.String(),
    revision: Type.Integer(),
    gameId: Type.String(),
  }),
]);
export const EnvelopeSchema = Type.Object({
  schemaVersion: Type.Literal(1),
  incarnationId: Type.String(),
  room: StoredRoomSchema,
  aiWork: Type.Union([WorkSchema, Type.Null()]),
});
export type Envelope = Static<typeof EnvelopeSchema>;
type Attachment =
  | { version: 1; incarnationId: string; kind: 'pending'; deadline: number }
  | { version: 1; incarnationId: string; kind: 'authenticated'; side: Side };
export type RpcResult<T> = { ok: true; value: T } | { ok: false; status: number; error: string };
const AUTH_MS = 5000;
const MAX_PENDING = 16;
const MAX_SOCKETS = 32;
const RECOVERY_ERROR = 'AI 回合已中斷，棋局已保留；請重試。';

/** Each object owns exactly one room. Every durable mutation uses a fresh draft. */
export class GameRoom extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // A fresh instance cannot know whether an interrupted provider call was billed.
    ctx.blockConcurrencyWhile(async () => {
      const saved = this.load();
      if (saved?.aiWork?.status === 'inFlight') {
        saved.aiWork = null;
        saved.room.thinking = false;
        saved.room.aiError = needsAi(saved.room) ? RECOVERY_ERROR : null;
        this.touch(saved.room);
        await ctx.storage.transaction(async () => this.commit(saved));
        this.broadcast(saved);
      }
    });
  }

  private load(): Envelope | undefined {
    const value = this.ctx.storage.kv.get<unknown>('room');
    if (value === undefined) return;
    if (!Value.Check(EnvelopeSchema, value)) throw new Error('Invalid durable room snapshot');
    return value;
  }
  private attachment(socket: WebSocket, saved: Envelope): Attachment | undefined {
    const value = socket.deserializeAttachment() as Attachment | null;
    if (value?.version !== 1 || value.incarnationId !== saved.incarnationId) return;
    if (value.kind === 'pending' && Number.isFinite(value.deadline)) return value;
    if (
      value.kind === 'authenticated' &&
      Number.isInteger(value.side) &&
      value.side >= 0 &&
      value.side < saved.room.players.length
    )
      return value;
  }
  private sockets(saved: Envelope) {
    return this.ctx
      .getWebSockets()
      .filter((socket) => socket.readyState === WebSocket.OPEN && this.attachment(socket, saved));
  }
  private connected(saved: Envelope, side?: Side) {
    return this.sockets(saved).some((socket) => {
      const auth = this.attachment(socket, saved);
      return auth?.kind === 'authenticated' && (side === undefined || auth.side === side);
    });
  }
  private expired(saved: Envelope) {
    return (
      !saved.aiWork && saved.room.updated + ROOM_TTL_MS <= Date.now() && !this.connected(saved)
    );
  }
  private requireRoom() {
    const saved = this.load();
    if (!saved || this.expired(saved)) throw new HttpError(404, '房間不存在或已過期。');
    return saved;
  }
  private view(saved: Envelope, side: Side) {
    return roomView(saved.room, side, (seat) => this.connected(saved, seat));
  }
  private touch(room: Room) {
    room.updated = Date.now();
    room.revision++;
  }
  private queue(saved: Envelope) {
    // A human may resign while inference is pending. Keep the attempt until its result
    // is discarded; no second paid call or rematch can overtake it.
    if (saved.aiWork?.status === 'inFlight') {
      saved.room.thinking = true;
      return;
    }
    saved.aiWork = needsAi(saved.room) && !saved.room.aiError ? { status: 'queued' } : null;
    saved.room.thinking = saved.aiWork !== null;
    if (saved.aiWork) saved.room.aiGameId ??= randomUUID();
  }
  private async schedule(saved: Envelope) {
    const now = Date.now();
    let deadline = saved.room.updated + ROOM_TTL_MS;
    if (deadline <= now && (this.connected(saved) || saved.aiWork)) deadline = now + 60 * 60 * 1000;
    if (saved.aiWork?.status === 'queued') deadline = now + 1;
    // A watchdog survives termination after dispatch; reconstruction retires the attempt.
    if (saved.aiWork?.status === 'inFlight') deadline = Math.min(deadline, now + 30_000);
    for (const socket of this.sockets(saved)) {
      const auth = this.attachment(socket, saved);
      if (auth?.kind === 'pending') deadline = Math.min(deadline, auth.deadline);
    }
    const next = Math.max(now + 1, deadline);
    const current = await this.ctx.storage.getAlarm();
    if (current === null || current > next) await this.ctx.storage.setAlarm(next);
  }
  private async commit(saved: Envelope) {
    await this.ctx.storage.put('room', saved);
    await this.schedule(saved);
  }
  private broadcast(saved: Envelope) {
    for (const socket of this.sockets(saved)) {
      const auth = this.attachment(socket, saved);
      if (auth?.kind !== 'authenticated') continue;
      try {
        socket.send(JSON.stringify(this.view(saved, auth.side)));
      } catch {
        socket.close(1011, 'Reconnect');
      }
    }
  }
  private async result<T>(operation: () => Promise<T>): Promise<RpcResult<T>> {
    try {
      return { ok: true, value: await operation() };
    } catch (error) {
      if (error instanceof HttpError)
        return { ok: false, status: error.status, error: error.message };
      throw error;
    }
  }
  create(code: string, input: CreateRoom) {
    return this.result(() =>
      this.ctx.storage.transaction(async () => {
        if (!Value.Check(RoomCodeSchema, code) || !Value.Check(CreateRoomSchema, input))
          throw new HttpError(400, '資料格式不正確。');
        if (this.load()) throw new HttpError(409, '房間碼已使用。');
        const { room, token } = createRoom(code, input, !!this.env.TYPESAFE_API_KEY);
        const saved: Envelope = {
          schemaVersion: 1,
          incarnationId: randomUUID(),
          room,
          aiWork: null,
        };
        await this.commit(saved);
        return { token, room: this.view(saved, 0) };
      }),
    );
  }
  join(name: string) {
    return this.result(async () => {
      const result = await this.ctx.storage.transaction(async () => {
        if (!Value.Check(JoinRoomSchema, { name })) throw new HttpError(400, '資料格式不正確。');
        const saved = this.requireRoom();
        const { token, side } = joinRoom(saved.room, name);
        this.queue(saved);
        this.touch(saved.room);
        await this.commit(saved);
        return { saved, token, side };
      });
      this.broadcast(result.saved);
      return { token: result.token, room: this.view(result.saved, result.side) };
    });
  }
  getView(token?: string) {
    return this.result(async () => {
      const saved = this.requireRoom();
      return { room: this.view(saved, authenticate(saved.room, token)) };
    });
  }
  act(token: string | undefined, action: RoomAction) {
    return this.result(async () => {
      const { saved, side } = await this.ctx.storage.transaction(async () => {
        if (!Value.Check(RoomActionSchema, action)) throw new HttpError(400, '無效的操作。');
        const saved = this.requireRoom();
        const side = authenticate(saved.room, token);
        actOnRoom(saved.room, side, action, () => randomInt(1, 7));
        this.queue(saved);
        this.touch(saved.room);
        await this.commit(saved);
        return { saved, side };
      });
      this.broadcast(saved);
      return { room: this.view(saved, side) };
    });
  }

  async fetch(request: Request) {
    if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket')
      return new Response('Expected WebSocket', { status: 426 });
    let saved: Envelope;
    try {
      saved = this.requireRoom();
    } catch (error) {
      if (error instanceof HttpError)
        return Response.json({ error: error.message }, { status: error.status });
      throw error;
    }
    const sockets = this.sockets(saved);
    if (
      sockets.length >= MAX_SOCKETS ||
      sockets.filter((s) => this.attachment(s, saved)?.kind === 'pending').length >= MAX_PENDING
    )
      return Response.json({ error: '連線太多，請稍後再試。' }, { status: 429 });
    const pair = new WebSocketPair();
    pair[1].serializeAttachment({
      version: 1,
      incarnationId: saved.incarnationId,
      kind: 'pending',
      deadline: Date.now() + AUTH_MS,
    } satisfies Attachment);
    this.ctx.acceptWebSocket(pair[1]);
    await this.ctx.storage.transaction(async () => this.schedule(saved));
    return new Response(null, { status: 101, webSocket: pair[0] });
  }
  async webSocketMessage(socket: WebSocket, message: string | ArrayBuffer) {
    const saved = this.load();
    if (
      !saved ||
      typeof message !== 'string' ||
      new TextEncoder().encode(message).byteLength > 1024
    ) {
      socket.close(1008, 'Invalid credentials');
      return;
    }
    const auth = this.attachment(socket, saved);
    if (auth?.kind === 'authenticated') return;
    try {
      if (auth?.kind !== 'pending' || Date.now() >= auth.deadline || this.expired(saved))
        throw new Error('Expired');
      const credentials: unknown = JSON.parse(message);
      if (!Value.Check(CredentialsSchema, credentials) || credentials.code !== saved.room.code)
        throw new Error('Invalid credentials');
      const side = authenticate(saved.room, credentials.token);
      socket.serializeAttachment({
        version: 1,
        incarnationId: saved.incarnationId,
        kind: 'authenticated',
        side,
      } satisfies Attachment);
      this.broadcast(saved);
    } catch {
      socket.close(1008, 'Invalid room credentials');
    }
    await this.ctx.storage.transaction(async () => this.schedule(saved));
  }
  async webSocketClose(socket: WebSocket, code: number) {
    socket.close(code === 1005 || code === 1006 ? 1000 : code);
    const saved = this.load();
    if (saved) {
      this.broadcast(saved);
      await this.ctx.storage.transaction(async () => this.schedule(saved));
    }
  }
  async webSocketError(socket: WebSocket) {
    await this.webSocketClose(socket, 1011);
  }

  async alarm() {
    let saved = this.load();
    if (!saved) return;
    for (const socket of this.sockets(saved)) {
      const auth = this.attachment(socket, saved);
      if (auth?.kind === 'pending' && auth.deadline <= Date.now())
        socket.close(1008, 'Authentication required');
    }
    if (this.expired(saved)) {
      for (const socket of this.ctx.getWebSockets()) socket.close(1001, 'Room expired');
      await this.ctx.storage.deleteAll();
      return;
    }
    // One roll and at most one inference per alarm, preserving every visible revision.
    saved = await this.ctx.storage.transaction(async () => {
      const draft = this.requireRoom();
      if (draft.aiWork?.status === 'queued') {
        if (
          needsAi(draft.room) &&
          draft.room.game.kind === 'flight' &&
          draft.room.game.die === null
        ) {
          draft.room.game = rollDice(draft.room.game, randomInt(1, 7));
          this.touch(draft.room);
        }
        this.queue(draft);
        await this.commit(draft);
      } else await this.schedule(draft);
      return draft;
    });
    this.broadcast(saved);
    // A roll which passed to another player is handled by a subsequent alarm.
    if (
      saved.aiWork?.status !== 'queued' ||
      (saved.room.game.kind === 'flight' && saved.room.game.die === null)
    )
      return;
    const attempt = await this.ctx.storage.transaction(async () => {
      const draft = this.requireRoom();
      if (draft.aiWork?.status !== 'queued' || !needsAi(draft.room)) return null;
      draft.room.aiGameId ??= randomUUID();
      const work = {
        status: 'inFlight' as const,
        attemptId: randomUUID(),
        revision: draft.room.revision,
        gameId: draft.room.aiGameId,
      };
      draft.aiWork = work;
      await this.commit(draft);
      return { saved: draft, work };
    });
    if (!attempt) return;
    let move: Awaited<ReturnType<typeof chooseMove>> | undefined;
    let failure: string | undefined;
    try {
      move = await chooseMove(
        attempt.saved.room.game,
        this.env.TYPESAFE_API_KEY ?? '',
        this.env.TYPESAFE_MODEL,
        fetch,
        {
          roomCode: attempt.saved.room.code,
          gameId: attempt.work.gameId,
          attemptId: attempt.work.attemptId,
        },
        roomAiOptions(attempt.saved.room),
      );
    } catch (error) {
      failure =
        error instanceof Error && error.name !== 'TypeError' && error.name !== 'TimeoutError'
          ? error.message
          : 'AI 連線逾時或網絡中斷，棋局已保留，請重試。';
    }
    const completed = await this.ctx.storage.transaction(async () => {
      const draft = this.load();
      if (
        !draft ||
        draft.incarnationId !== attempt.saved.incarnationId ||
        draft.aiWork?.status !== 'inFlight' ||
        draft.aiWork.attemptId !== attempt.work.attemptId
      )
        return null;
      const current =
        draft.room.aiGameId === attempt.work.gameId &&
        draft.room.revision === attempt.work.revision &&
        needsAi(draft.room);
      draft.aiWork = null;
      draft.room.thinking = false;
      if (current) {
        if (failure) draft.room.aiError = failure;
        else if (move) applyAiMove(draft.room, move);
      }
      this.queue(draft);
      this.touch(draft.room);
      await this.commit(draft);
      return draft;
    });
    if (completed) this.broadcast(completed);
  }
}
