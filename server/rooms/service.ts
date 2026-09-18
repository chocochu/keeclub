import { randomInt } from 'node:crypto';
import type { Config, CreateRoom, RoomAction, RoomView, Side } from '../../shared/contracts';
import { resolveAiConfig, type AiProvider } from '../ai-config';
import { chooseMove } from '../ai';
import { HttpError } from '../http/errors';
import { playAiTurn } from './ai-turn';
import { authenticate } from './identity';
import { actOnRoom, createRoom, joinRoom, ready, roomView } from './domain';
import { MAX_ROOMS, ROOM_TTL_MS, type Room, type RoomOptions } from './model';
import { RoomRepository } from './repository';

type RoomListener = (room: Room) => void;
export class RoomService {
  readonly repository: RoomRepository;
  readonly config: Config;
  private readonly apiKey: string;
  private readonly provider: AiProvider;
  private readonly dice: () => number;
  private readonly choose: typeof chooseMove;
  private readonly presence = new Map<string, Set<string>>();
  private readonly listeners = new Set<RoomListener>();
  constructor(options: RoomOptions = {}) {
    this.repository = new RoomRepository(options.dataFile);
    const ai = resolveAiConfig({
      ...process.env,
      AI_PROVIDER: options.provider ?? process.env.AI_PROVIDER,
    });
    this.provider = ai.provider;
    this.apiKey = options.apiKey ?? ai.apiKey;
    this.config = {
      aiAvailable: !!this.apiKey,
      model: options.model ?? ai.model,
    };
    this.dice = options.dice ?? (() => randomInt(1, 7));
    this.choose = options.choose ?? chooseMove;
  }
  get rooms() {
    return this.repository.rooms;
  }
  subscribe(listener: RoomListener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  private notify(room: Room) {
    for (const listener of this.listeners) listener(room);
  }
  private changed = (room: Room) => {
    room.updated = Date.now();
    room.revision++;
    this.repository.save(room);
    this.notify(room);
  };
  get(code: string) {
    const room = this.rooms.get(code);
    if (!room) throw new HttpError(404, '房間不存在或已過期。');
    return room;
  }
  authorize(code: string, token: string | undefined) {
    const room = this.get(code);
    return { room, side: authenticate(room, token) };
  }
  getView(code: string, token?: string) {
    const { room, side } = this.authorize(code, token);
    return { room: this.view(room, side) };
  }
  command(code: string, token: string | undefined, action: RoomAction) {
    const { room, side } = this.authorize(code, token);
    return this.act(room, side, action);
  }
  isReady(room: Room) {
    return ready(room);
  }
  view(room: Room, side: Side): RoomView {
    return roomView(room, side, (seat) => !!this.presence.get(`${room.code}:${seat}`)?.size);
  }
  create(input: CreateRoom) {
    if (this.rooms.size >= MAX_ROOMS) throw new HttpError(503, '房間已滿，請稍後再試。');
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code: string;
    do {
      code = Array.from({ length: 6 }, () => alphabet[randomInt(alphabet.length)]).join('');
    } while (this.rooms.has(code));
    const { room, token } = createRoom(code, input, this.config.aiAvailable);
    this.rooms.set(code, room);
    this.repository.save(room);
    return { token, room: this.view(room, 0) };
  }
  join(code: string, name: string) {
    const room = this.get(code);
    const { token, side } = joinRoom(room, name);
    this.changed(room);
    return { token, room: this.view(room, side as Side) };
  }
  act(room: Room, side: Side, action: RoomAction) {
    actOnRoom(room, side, action, this.dice);
    this.changed(room);
    void playAiTurn(room, {
      apiKey: this.apiKey,
      provider: this.provider,
      model: this.config.model,
      dice: this.dice,
      choose: this.choose,
      changed: this.changed,
    });
    return { room: this.view(room, side) };
  }
  setPresence(code: string, side: Side, id: string, connected: boolean) {
    const key = `${code}:${side}`;
    const members = this.presence.get(key) ?? new Set<string>();
    if (connected) members.add(id);
    else members.delete(id);
    if (members.size) this.presence.set(key, members);
    else this.presence.delete(key);
    const room = this.rooms.get(code);
    if (room) this.notify(room);
  }
  prune() {
    for (const [code, room] of this.rooms) {
      if (
        !room.thinking &&
        Date.now() - room.updated > ROOM_TTL_MS &&
        !room.players.some((_, side) => this.presence.has(`${code}:${side}`))
      )
        this.repository.delete(code);
    }
  }
}
