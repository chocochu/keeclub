import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server/app';
import { legalMoves, type Game } from '../shared/game';
import type { RoomView } from '../shared/contracts';
const instances: ReturnType<typeof createApp>[] = [];
const tempDirs: string[] = [];
afterEach(async () => {
  for (const i of instances) await i.close();
  instances.length = 0;
  for (const d of tempDirs) rmSync(d, { recursive: true, force: true });
  tempDirs.length = 0;
});
function setup(options: Parameters<typeof createApp>[0] = {}) {
  const instance = createApp({ apiKey: '', ...options });
  instances.push(instance);
  instance.app.listen({ hostname: '127.0.0.1', port: 0 });
  const base = `http://127.0.0.1:${instance.app.server!.port}`;
  const call = async (
    path: string,
    body?: unknown,
    token?: string,
  ): Promise<{
    status: number;
    room: RoomView;
    token: string;
    aiAvailable: boolean;
    error?: string;
  }> => {
    const res = await fetch(`${base}/api${path}`, {
      method: body ? 'POST' : 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    return {
      status: res.status,
      ...((await res.json()) as {
        room: RoomView;
        token: string;
        aiAvailable: boolean;
        error?: string;
      }),
    };
  };
  return { ...instance, base, call };
}
async function eventually(fn: () => boolean) {
  for (let i = 0; i < 100; i++) {
    if (fn()) return;
    await Bun.sleep(10);
  }
  throw new Error('Condition not met within 1s');
}
describe('Elysia room API', () => {
  test('two seats, private credentials, correct turns, stale moves and rematch consent', async () => {
    const { call } = setup();
    const host = await call('/rooms', { name: 'Host', kind: 'jungle', mode: 'friend' });
    const code = host.room.code;
    expect(host.status).toBe(201);
    expect(host.room.ready).toBe(false);
    expect(JSON.stringify(host.room)).not.toContain('hash');
    expect((await call(`/rooms/${code}`)).status).toBe(401);
    expect(
      (
        await call(
          `/rooms/${code}/action`,
          { type: 'move', id: '0-1:6,5', revision: 0 },
          host.token,
        )
      ).status,
    ).toBe(400);
    const guest = await call(`/rooms/${code}/join`, { name: 'Friend' });
    expect(guest.room.side).toBe(1);
    expect(guest.room.ready).toBe(true);
    expect((await call(`/rooms/${code}/join`, { name: 'Third' })).status).toBe(409);
    expect(
      (
        await call(
          `/rooms/${code}/action`,
          { type: 'move', id: '0-1:6,5', revision: 1 },
          guest.token,
        )
      ).status,
    ).toBe(400);
    const moved = await call(
      `/rooms/${code}/action`,
      { type: 'move', id: '0-1:6,5', revision: 1 },
      host.token,
    );
    expect(moved.room.game.turn).toBe(1);
    expect(
      (
        await call(
          `/rooms/${code}/action`,
          { type: 'move', id: '0-1:6,5', revision: 1 },
          host.token,
        )
      ).status,
    ).toBe(400);
    expect((await call(`/rooms/${code}/action`, { type: 'rematch' }, host.token)).status).toBe(400);
    await call(`/rooms/${code}/action`, { type: 'resign' }, guest.token);
    const vote = await call(`/rooms/${code}/action`, { type: 'rematch' }, host.token);
    expect(vote.room.game.winner).toBe(0);
    const replay = await call(`/rooms/${code}/action`, { type: 'rematch' }, guest.token);
    expect(replay.room.game.winner).toBeNull();
    expect(replay.room.game.ply).toBe(0);
  });
  test('server generates dice and never trusts a client-supplied value', async () => {
    const { call } = setup({ dice: () => 6 });
    const host = await call('/rooms', { name: 'Host', kind: 'flight', mode: 'local' });
    const result = await call(
      `/rooms/${host.room.code}/action`,
      { type: 'roll', revision: 0, value: 1 },
      host.token,
    );
    expect(result.room.game.die).toBe(6);
    const moved = await call(
      `/rooms/${host.room.code}/action`,
      { type: 'move', revision: 1, id: 'plane-0' },
      host.token,
    );
    expect(moved.room.game.planes[0][0]).toBe(0);
  });
  test('malformed input and cross-origin requests are rejected', async () => {
    const { call, base } = setup();
    expect((await call('/rooms', { kind: 'unknown' })).status).toBe(400);
    const res = await fetch(`${base}/api/rooms`, {
      method: 'POST',
      headers: { Origin: 'https://evil.example', 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'A', kind: 'jungle', mode: 'local' }),
    });
    expect(res.status).toBe(403);
  });
  test('rooms survive restart with the same seat tokens and state', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'kee-test-'));
    tempDirs.push(dir);
    const dataFile = join(dir, 'rooms.json');
    const first = setup({ dataFile });
    const jungleSettings = { ratCaptureAcrossBank: true, jumpOverOwnRat: true };
    const host = await first.call('/rooms', {
      name: 'Host',
      kind: 'jungle',
      mode: 'local',
      jungleSettings,
    });
    await first.call(
      `/rooms/${host.room.code}/action`,
      { type: 'move', id: '0-1:6,5', revision: 0 },
      host.token,
    );
    await first.close();
    const second = setup({ dataFile });
    const restored = await second.call(`/rooms/${host.room.code}`, undefined, host.token);
    expect(restored.status).toBe(200);
    expect(restored.room.game.ply).toBe(1);
    expect(restored.room.game.jungleSettings).toEqual(jungleSettings);
    expect(restored.room.game.jungleHistory).toEqual([
      { side: 0, piece: '0-1', fromX: 6, fromY: 6, x: 6, y: 5 },
    ]);
    expect(restored.room.side).toBe(0);
  });
  test('missing TypeSafe configuration is explicit', async () => {
    const { call } = setup();
    expect((await call('/config')).aiAvailable).toBe(false);
    expect((await call('/rooms', { name: 'Host', kind: 'jungle', mode: 'ai' })).status).toBe(503);
  });
  test('AI error preserves state and retry resumes with a legal move', async () => {
    let fail = true;
    const { call, rooms } = setup({
      apiKey: 'test',
      choose: async (game) => {
        if (fail) throw new Error('Service unavailable');
        return legalMoves(game)[0];
      },
    });
    const host = await call('/rooms', { name: 'Host', kind: 'jungle', mode: 'ai' });
    const code = host.room.code;
    await call(`/rooms/${code}/action`, { type: 'move', id: '0-1:6,5', revision: 0 }, host.token);
    await eventually(() => !!rooms.get(code)?.aiError);
    expect(rooms.get(code)!.game.turn).toBe(1);
    expect(rooms.get(code)!.game.ply).toBe(1);
    fail = false;
    await call(`/rooms/${code}/action`, { type: 'retry' }, host.token);
    await eventually(() => rooms.get(code)!.game.turn === 0);
    expect(rooms.get(code)!.game.ply).toBe(2);
    expect(rooms.get(code)!.aiError).toBeNull();
  });
  test('late AI response cannot overwrite a resignation', async () => {
    let release: ((value: ReturnType<typeof legalMoves>[number]) => void) | undefined;
    let state: Game | undefined;
    const { call, rooms } = setup({
      apiKey: 'test',
      choose: (game) => {
        state = game;
        return new Promise((resolve) => {
          release = resolve;
        });
      },
    });
    const host = await call('/rooms', { name: 'Host', kind: 'jungle', mode: 'ai' });
    const code = host.room.code;
    await call(`/rooms/${code}/action`, { type: 'move', id: '0-1:6,5', revision: 0 }, host.token);
    await eventually(() => !!release);
    await call(`/rooms/${code}/action`, { type: 'resign' }, host.token);
    release!(legalMoves(state!)[0]);
    await eventually(() => !rooms.get(code)!.thinking);
    expect(rooms.get(code)!.game.winner).toBe(1);
    expect(rooms.get(code)!.game.ply).toBe(1);
  });
  test('native WebSockets authenticate, publish both seats, and restore state on reconnect', async () => {
    const { call, base } = setup();
    const host = await call('/rooms', { name: 'Host', kind: 'jungle', mode: 'friend' });
    const code = host.room.code;
    const updates: RoomView[] = [];
    const socket = new WebSocket(base.replace('http', 'ws') + '/ws');
    socket.onopen = () => socket.send(JSON.stringify({ code, token: host.token }));
    socket.onmessage = (e) => updates.push(JSON.parse(String(e.data)));
    await eventually(() => updates.length > 0);
    expect(updates.at(-1)!.players[0]!.connected).toBe(true);
    const guest = await call(`/rooms/${code}/join`, { name: 'Guest' });
    await eventually(() => !!updates.at(-1)?.ready);
    const guestUpdates: RoomView[] = [];
    const socket2 = new WebSocket(base.replace('http', 'ws') + '/ws');
    socket2.onopen = () => socket2.send(JSON.stringify({ code, token: guest.token }));
    socket2.onmessage = (e) => guestUpdates.push(JSON.parse(String(e.data)));
    await eventually(() => guestUpdates.length > 0);
    expect(guestUpdates.at(-1)!.side).toBe(1);
    await call(`/rooms/${code}/action`, { type: 'move', id: '0-1:6,5', revision: 1 }, host.token);
    await eventually(() => guestUpdates.at(-1)?.game.ply === 1 && updates.at(-1)?.game.ply === 1);
    socket2.close();
    await eventually(() => updates.at(-1)?.players[1]?.connected === false);
    const restored: RoomView[] = [];
    const reconnect = new WebSocket(base.replace('http', 'ws') + '/ws');
    reconnect.onopen = () => reconnect.send(JSON.stringify({ code, token: guest.token }));
    reconnect.onmessage = (e) => restored.push(JSON.parse(String(e.data)));
    await eventually(() => restored.length > 0);
    expect(restored[0].game.ply).toBe(1);
    socket.close();
    reconnect.close();
  });
});

test('Jungle options are validated, shared with guests and retained on rematch with fresh history', async () => {
  const { call } = setup();
  const jungleSettings = { ratCaptureAcrossBank: true, jumpOverOwnRat: false };
  const invalid = await call('/rooms', {
    name: 'Host',
    kind: 'jungle',
    mode: 'friend',
    jungleSettings: { ...jungleSettings, ratCaptureAcrossBank: 'yes' },
  });
  expect(invalid.status).toBe(400);
  const host = await call('/rooms', {
    name: 'Host',
    kind: 'jungle',
    mode: 'friend',
    jungleSettings,
  });
  const path = `/rooms/${host.room.code}`;
  const guest = await call(`${path}/join`, { name: 'Guest' });
  expect(guest.room.game.jungleSettings).toEqual(jungleSettings);
  await call(
    `${path}/action`,
    { type: 'move', id: '0-1:6,5', revision: guest.room.revision },
    host.token,
  );
  await call(`${path}/action`, { type: 'resign' }, host.token);
  await call(`${path}/action`, { type: 'rematch' }, host.token);
  const rematch = await call(`${path}/action`, { type: 'rematch' }, guest.token);
  expect(rematch.room.game.jungleSettings).toEqual(jungleSettings);
  expect(rematch.room.game.jungleHistory).toEqual([]);
  expect(rematch.room.game.winner).toBeNull();
});
