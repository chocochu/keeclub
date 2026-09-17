import { http, HttpResponse, delay } from 'msw';
import { network } from './network';
import { env } from 'cloudflare:workers';
import {
  evictDurableObject,
  reset,
  runDurableObjectAlarm,
  runInDurableObject,
} from 'cloudflare:test';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { treaty } from '@elysiajs/eden';
import type { App } from '../server/app';
import worker from '../server/worker';
import type { Envelope, RpcResult } from '../server/cloudflare/game-room';
import type { RoomView, SessionResponse } from '../shared/contracts';
import { ROOM_TTL_MS } from '../server/rooms/model';

const sockets: WebSocket[] = [];
beforeEach(() => {
  // Keep native alarms in the future; runDurableObjectAlarm drives them explicitly.
  // Otherwise its manual invocation can race the runtime firing the same deadline.
  vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 86_400_000);
  vi.spyOn(console, 'info').mockImplementation(() => {});
  // Never send paid requests in routine tests, including alarm-triggered calls.
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Unexpected external request'));
});
afterEach(async () => {
  await Promise.all(
    sockets.splice(0).map(
      (s) =>
        new Promise<void>((resolve) => {
          if (s.readyState === WebSocket.CLOSED) {
            resolve();
            return;
          }
          s.addEventListener('close', () => resolve(), { once: true });
          if (s.readyState === WebSocket.OPEN) s.close();
        }),
    ),
  );
  await reset();
  vi.restoreAllMocks();
});
function value<T>(result: RpcResult<T>) {
  if (!result.ok) throw new Error(result.error);
  return result.value;
}
const stub = (code = 'ABC234') => env.ROOMS.getByName(code);
async function create(code = 'ABC234', ai = false) {
  return value(
    await stub(code).create(code, { name: 'Host', kind: 'jungle', mode: ai ? 'ai' : 'friend' }),
  );
}
function request(path: string, body?: unknown, token?: string) {
  return worker.fetch(
    new Request(`https://test${path}`, {
      method: body ? 'POST' : 'GET',
      headers: {
        ...(body ? { 'content-type': 'application/json' } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    }),
  );
}
async function saved(code = 'ABC234') {
  return runInDurableObject(stub(code), (_, ctx) => ctx.storage.kv.get<Envelope>('room')!);
}
async function write(saved: Envelope) {
  await runInDurableObject(stub(saved.room.code), (_, ctx) => {
    ctx.storage.kv.put('room', saved);
  });
}
async function open(code: string, direct = false) {
  const response = await request(`/api/rooms/${code}/ws`); // Upgrade header is required.
  expect(response.status).toBe(426);
  await response.text(); // Drain the rejected upgrade before attempting object eviction.
  const upgraded = await (direct ? stub(code) : worker).fetch(
    new Request(`https://test/api/rooms/${code}/ws`, { headers: { Upgrade: 'websocket' } }),
  );
  expect(upgraded.status).toBe(101);
  const socket = upgraded.webSocket!;
  socket.accept();
  sockets.push(socket);
  return socket;
}
function next(socket: WebSocket) {
  return new Promise<RoomView>((resolve) =>
    socket.addEventListener('message', (e) => resolve(JSON.parse(e.data as string)), {
      once: true,
    }),
  );
}
async function auth(code: string, token: string, direct = false) {
  const s = await open(code, direct);
  const first = next(s);
  s.send(JSON.stringify({ code, token }));
  return { socket: s, room: await first };
}

test('Eden HTTP validation, authorization, same-origin checks and bounded bodies work in workerd', async () => {
  const api = treaty<App>('https://test', {
    fetcher: ((input: RequestInfo | URL, init?: RequestInit) =>
      worker.fetch(
        input instanceof Request ? new Request(input, init) : new Request(String(input), init),
      )) as typeof fetch,
  });
  const created = await api.api.rooms.post({ name: 'Host', kind: 'jungle', mode: 'friend' });
  expect(created.status).toBe(201);
  const session = created.data!;
  expect(session.token).toMatch(/^[a-f0-9]{64}$/);
  expect((await request(`/api/rooms/${session.room.code}`, undefined, session.token)).status).toBe(
    200,
  );
  expect((await request(`/api/rooms/${session.room.code}`, undefined, '0'.repeat(64))).status).toBe(
    401,
  );
  expect((await request('/api/rooms', { name: '', kind: 'chess', mode: 'friend' })).status).toBe(
    400,
  );
  expect((await request('/api/rooms', { padding: 'x'.repeat(9000) })).status).toBe(413);
  const origin = await worker.fetch(
    new Request('https://test/api/rooms', {
      method: 'POST',
      headers: { origin: 'https://other' },
      body: '{}',
    }),
  );
  expect(origin.status).toBe(403);
  const missing = await request('/api/not-found');
  expect(missing.status).toBe(404);
  expect(missing.headers.get('cache-control')).toBe('no-store');
  expect(await missing.json()).toHaveProperty('error');
});

test('concurrent final-seat joins and same-revision commands commit exactly once', async () => {
  const host = await create();
  const joins = await Promise.all([stub().join('B'), stub().join('C')]);
  expect(joins.filter((r) => r.ok)).toHaveLength(1);
  const current = value(await stub().getView(host.token)).room;
  const results = await Promise.all([
    stub().act(host.token, { type: 'move', id: current.moves[0].id, revision: current.revision }),
    stub().act(host.token, { type: 'move', id: current.moves[1].id, revision: current.revision }),
  ]);
  expect(results.filter((r) => r.ok)).toHaveLength(1);
  expect(value(await stub().getView(host.token)).room.game.ply).toBe(1);
  expect(
    await stub().create('ABC234', { name: 'Overwrite', kind: 'flight', mode: 'friend' }),
  ).toMatchObject({ ok: false, status: 409 });
  expect((await saved()).room.players[0]?.name).toBe('Host');
});

test('invalid actions do not mutate durable storage; absent rooms do not allocate snapshots or alarms', async () => {
  expect(await stub().getView('bad')).toMatchObject({ ok: false, status: 404 });
  await runInDurableObject(stub(), async (_, ctx) => {
    expect(ctx.storage.kv.get('room')).toBeUndefined();
    expect(await ctx.storage.getAlarm()).toBeNull();
  });
  const host = await create();
  await stub().join('B');
  const before = await saved();
  expect(
    await stub().act(host.token, { type: 'move', id: 'illegal', revision: before.room.revision }),
  ).toMatchObject({ ok: false, status: 400 });
  expect(await saved()).toEqual(before);
});

test('stored credentials and state survive object eviction', async () => {
  const host = await create();
  await stub().join('B');
  const before = value(await stub().getView(host.token));
  await evictDurableObject(stub());
  expect(value(await stub().getView(host.token))).toEqual(before);
});

test('authenticated sockets hibernate and rebuild presence without writing the room', async () => {
  const host = await create();
  const guest = value(await stub().join('B'));
  const before = await saved();
  const a = await auth('ABC234', host.token, true);
  const a2 = await auth('ABC234', host.token, true);
  const b = await auth('ABC234', guest.token, true);
  expect(b.room.side).toBe(1);
  expect(b.room.players.every((p) => p?.connected)).toBe(true);
  expect(JSON.stringify(b.room)).not.toContain('hash');
  expect(JSON.stringify(b.room)).not.toContain(host.token);
  expect(await saved()).toEqual(before);
  await evictDurableObject(stub());
  const update = next(b.socket);
  const room = value(await stub().getView(host.token)).room;
  await stub().act(host.token, { type: 'move', id: room.moves[0].id, revision: room.revision });
  expect((await update).game.ply).toBe(1);
  const presence = next(b.socket);
  a.socket.close();
  expect((await presence).players[0]?.connected).toBe(true);
  a2.socket.close();
  b.socket.close();
});

test('unauthenticated and wrong-room sockets cannot obtain a room view', async () => {
  const host = await create();
  const s = await open('ABC234');
  const close = new Promise<number>((resolve) =>
    s.addEventListener('close', (e) => resolve(e.code), { once: true }),
  );
  s.send(JSON.stringify({ code: 'XYZ234', token: host.token }));
  expect(await close).toBe(1008);
  const silent = await open('ABC234');
  const expired = new Promise<number>((resolve) =>
    silent.addEventListener('close', (e) => resolve(e.code), { once: true }),
  );
  await runInDurableObject(stub(), (_, ctx) => {
    for (const socket of ctx.getWebSockets()) {
      const a = socket.deserializeAttachment();
      if (a.kind === 'pending') socket.serializeAttachment({ ...a, deadline: Date.now() - 1 });
    }
  });
  await runDurableObjectAlarm(stub());
  expect(await expired).toBe(1008);
  expect((await saved()).room.revision).toBe(0);
});

test('four seats receive private views and rematch consent is preserved', async () => {
  const host = value(
    await stub().create('ABC234', {
      name: 'Host',
      kind: 'flight',
      mode: 'friend',
      flightSettings: { playerCount: 4, tripleSix: 'closest' },
    }),
  );
  const sessions: SessionResponse[] = [host];
  for (const name of ['B', 'C', 'D']) sessions.push(value(await stub().join(name)));
  for (let side = 0; side < 4; side++)
    expect((await auth('ABC234', sessions[side].token)).room.side).toBe(side);
  for (let side = 0; side < 3; side++)
    value(await stub().act(sessions[side].token, { type: 'resign' }));
  for (let side = 0; side < 3; side++)
    value(await stub().act(sessions[side].token, { type: 'rematch' }));
  expect(value(await stub().getView(host.token)).room.game.winner).not.toBeNull();
  const rematch = value(await stub().act(sessions[3].token, { type: 'rematch' })).room;
  expect(rematch.game.winner).toBeNull();
  expect(rematch.game.flightSettings?.playerCount).toBe(4);
});

test('expiry deletes disconnected rooms, but connected players retain their game', async () => {
  const host = await create();
  const active = await auth('ABC234', host.token);
  const old = await saved();
  old.room.updated = Date.now() - ROOM_TTL_MS - 1;
  await write(old);
  await runDurableObjectAlarm(stub());
  expect((await stub().getView(host.token)).ok).toBe(true);
  const closed = new Promise((resolve) =>
    active.socket.addEventListener('close', resolve, { once: true }),
  );
  active.socket.close();
  await closed;
  await runDurableObjectAlarm(stub());
  expect(await saved()).toBeUndefined();
  await runInDurableObject(stub(), async (_, ctx) =>
    expect(await ctx.storage.getAlarm()).toBeNull(),
  );
});

test('AI inference logs usage, applies once, and survives a subsequent duplicate alarm', async () => {
  const log = vi.spyOn(console, 'info').mockImplementation(() => {});
  const host = await create('ABC234', true);
  vi.mocked(fetch).mockImplementation(async (_input, init) => {
    const body = JSON.parse(String(init?.body));
    const choice = Object.keys(body.questions.move.criteria)[0];
    return Response.json({
      answers: { move: { type: 'choice', choice } },
      usage: { input_tokens: 123 },
    });
  });
  value(await stub().act(host.token, { type: 'move', id: host.room.moves[0].id, revision: 0 }));
  await runDurableObjectAlarm(stub());
  const after = await saved();
  expect(after.room.game.ply).toBe(2);
  expect(after.room.thinking).toBe(false);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(JSON.parse(String(log.mock.calls[0][0]))).toMatchObject({
    event: 'typesafe.usage',
    input_tokens: 123,
    attempt_id: expect.any(String),
  });
  await runDurableObjectAlarm(stub());
  expect((await saved()).room.game).toEqual(after.room.game);
  expect(fetch).toHaveBeenCalledTimes(1);
});

test('ambiguous inference recovers to manual retry after eviction without calling the provider', async () => {
  const host = await create('ABC234', true);
  const data = await saved();
  data.room.game.turn = 1;
  data.room.thinking = true;
  data.room.aiGameId = 'same-match';
  data.aiWork = {
    status: 'inFlight',
    attemptId: 'interrupted',
    revision: data.room.revision,
    gameId: 'same-match',
  };
  await write(data);
  await evictDurableObject(stub());
  const recovered = value(await stub().getView(host.token)).room;
  expect(recovered.thinking).toBe(false);
  expect(recovered.aiError).toContain('重試');
  expect((await saved()).room.aiGameId).toBe('same-match');
  await runDurableObjectAlarm(stub());
  expect(fetch).not.toHaveBeenCalled();
  expect(value(await stub().act(host.token, { type: 'retry' })).room.thinking).toBe(true);
});

test('provider errors persist retry state without automatic paid retries', async () => {
  const host = await create('ABC234', true);
  vi.mocked(fetch).mockImplementation(async () =>
    Response.json({ error: 'busy' }, { status: 429 }),
  );
  value(await stub().act(host.token, { type: 'move', id: host.room.moves[0].id, revision: 0 }));
  await runDurableObjectAlarm(stub());
  expect((await saved()).room.aiError).toContain('忙碌');
  await runDurableObjectAlarm(stub());
  expect(fetch).toHaveBeenCalledTimes(1);
});

test('a resignation during inference stays responsive and discards the stale AI result', async () => {
  // Use real workerd fetch through the local mock outbound service, not a
  // JavaScript promise that crosses two Durable Object I/O contexts.
  vi.mocked(fetch).mockRestore();
  let calls = 0;
  network.use(
    http.post('https://api.typesafe.ai/*', async ({ request }) => {
      calls++;
      const body = (await request.json()) as {
        questions: { move: { criteria: Record<string, unknown> } };
      };
      await delay(200);
      return HttpResponse.json({
        answers: { move: { type: 'choice', choice: Object.keys(body.questions.move.criteria)[0] } },
        usage: { input_tokens: 42 },
      });
    }),
  );
  const host = await create('ABC234', true);
  value(await stub().act(host.token, { type: 'move', id: host.room.moves[0].id, revision: 0 }));
  await runInDurableObject(stub(), (_, ctx) => ctx.storage.setAlarm(new Date().getTime()));
  for (let i = 0; i < 100 && (await saved()).aiWork?.status !== 'inFlight'; i++)
    await new Promise((r) => setTimeout(r, 5));
  expect((await saved()).aiWork?.status).toBe('inFlight');
  const resigned = value(await stub().act(host.token, { type: 'resign' })).room;
  expect(resigned.game.winner).toBe(1);
  expect(resigned.thinking).toBe(true);
  for (let i = 0; i < 100 && (await saved()).room.thinking; i++)
    await new Promise((r) => setTimeout(r, 5));
  const final = await saved();
  expect(final.room.game.winner).toBe(1);
  expect(final.room.game.ply).toBe(1);
  expect(final.aiWork).toBeNull();
  expect(final.room.thinking).toBe(false);
  expect(calls).toBe(1);
});

test('AI Flight persists each roll before dispatch and reuses it after interrupted recovery', async () => {
  const host = value(
    await stub().create('ABC234', {
      name: 'Host',
      kind: 'flight',
      mode: 'local',
      flightSettings: { playerCount: 4, tripleSix: 'closest' },
      flightPlayers: [
        { name: 'Host', ai: false },
        { name: 'AI1', ai: true },
        { name: 'AI2', ai: true },
        { name: 'D', ai: false },
      ],
    }),
  );
  const initial = await saved();
  initial.room.game.turn = 1;
  initial.room.game.die = 6;
  initial.room.game.lastDie = 6;
  initial.room.game.rollCount = 1;
  initial.room.thinking = true;
  initial.room.aiGameId = 'flight-match';
  initial.aiWork = {
    status: 'inFlight',
    attemptId: 'interrupted-flight',
    revision: initial.room.revision,
    gameId: 'flight-match',
  };
  await write(initial);
  await evictDurableObject(stub());
  expect(value(await stub().getView(host.token)).room.game.die).toBe(6);
  vi.mocked(fetch).mockImplementation(async (_input, init) => {
    const body = JSON.parse(String(init?.body));
    return Response.json({
      answers: { move: { type: 'choice', choice: Object.keys(body.questions.move.criteria)[0] } },
    });
  });
  value(await stub().act(host.token, { type: 'retry' }));
  await runDurableObjectAlarm(stub());
  const after = await saved();
  expect(after.room.game.ply).toBeGreaterThanOrEqual(1);
  expect(after.room.game.planes[1].some((p) => p >= 0)).toBe(true);
  // The persisted six launches a plane, and the extra roll is queued durably.
  expect(after.room.aiGameId).toBe('flight-match');
});

test('unknown storage versions fail as recoverable server errors instead of clearing credentials', async () => {
  const host = await create();
  await runInDurableObject(stub(), (_, ctx) => ctx.storage.kv.put('room', { schemaVersion: 999 }));
  const response = await request('/api/rooms/ABC234', undefined, host.token);
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ error: '伺服器暫時無法處理，請稍後重試。' });
});

test('Jungle difficulty survives eviction and reaches the durable AI request; rematch clears move counts', async () => {
  for (const [code, difficulty] of [
    ['EASY23', 'easy'],
    ['NORM23', 'normal'],
  ] as const) {
    const host = value(
      await stub(code).create(code, {
        name: 'Host',
        kind: 'jungle',
        mode: 'ai',
        aiDifficulty: difficulty,
      }),
    );
    expect(host.room.aiDifficulty).toBe(difficulty);
    await evictDurableObject(stub(code));
    const room = value(await stub(code).getView(host.token)).room;
    expect(room.aiDifficulty).toBe(difficulty);
    const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
      const request = JSON.parse(init!.body as string);
      expect(!!request.state.lookahead).toBe(difficulty === 'normal');
      return Response.json({
        answers: {
          move: { type: 'choice', choice: Object.keys(request.questions.move.criteria)[0] },
        },
        usage: { input_tokens: 100 },
      });
    });
    value(
      await stub(code).act(host.token, {
        type: 'move',
        id: room.moves[0].id,
        revision: room.revision,
      }),
    );
    await runDurableObjectAlarm(stub(code));
    expect(fetch).toHaveBeenCalledTimes(1);
    const after = await saved(code);
    expect(Object.values(after.room.aiMoveCounts ?? {})).toEqual([1]);
    expect(after.room.game.ply).toBe(2);
    expect(value(await stub(code).getView(host.token)).room).not.toHaveProperty('aiMoveCounts');
    after.room.game.winner = 0;
    await write(after);
    const rematch = value(await stub(code).act(host.token, { type: 'rematch' })).room;
    expect(rematch.aiDifficulty).toBe(difficulty);
    expect((await saved(code)).room.aiMoveCounts).toEqual({});
    fetch.mockClear();
  }
});
