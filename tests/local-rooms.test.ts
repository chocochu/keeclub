import { expect, test } from 'bun:test';
import { applyMove } from '../shared/game';
import { LocalRoomStore, isHumanLocalGame, localRoomKey } from '../src/lib/local-rooms';
import { isBrowserRoom, roomCodeFromPath, roomPath } from '../src/lib/room-location';
import { createApi } from '../src/lib/api-client';

function setup(dice = () => 6) {
  const data = new Map<string, string>();
  const storage = {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
  };
  return { data, storage, rooms: new LocalRoomStore(storage, dice) };
}

test('local Jungle uses shared rules, persists moves and settings, and rejects stale actions', () => {
  const { rooms, storage } = setup();
  const settings = { ratCaptureAcrossBank: true, jumpOverOwnRat: true };
  const first = rooms.create({
    kind: 'jungle',
    mode: 'local',
    name: 'Host',
    jungleSettings: settings,
  });
  const { code } = first.room;
  expect(first.token).toBe('');
  expect(roomCodeFromPath(roomPath(code))).toBe(code);
  expect(isBrowserRoom(code)).toBe(true);
  const action = { type: 'move' as const, revision: 0, id: first.room.moves[0].id };
  const next = rooms.act(code, action).room;
  expect(next.game).toEqual(applyMove(first.room.game, action.id));
  expect(() => rooms.act(code, action)).toThrow('棋局已更新');
  expect(new LocalRoomStore(storage).read(code)).toEqual(next);
  rooms.act(code, { type: 'resign' });
  const rematch = rooms.act(code, { type: 'rematch' }).room;
  expect(rematch.game.ply).toBe(0);
  expect(rematch.game.jungleSettings).toEqual(settings);
  expect(rematch.players.map((p) => p?.name)).toEqual(['Host', '玩家2']);
  expect(new LocalRoomStore(storage).read(code)).toEqual(rematch);
});

test('four-player local Flight preserves roll/move playback, resignations, names and rematch settings', () => {
  const { rooms, storage } = setup();
  const settings = { playerCount: 4, tripleSix: 'closest' as const };
  const first = rooms.create({
    kind: 'flight',
    mode: 'local',
    name: 'Host',
    flightSettings: settings,
    flightPlayers: ['Host', 'B', 'C', 'D'].map((name) => ({ name, ai: false })),
  }).room;
  const rolled = rooms.act(first.code, { type: 'roll', revision: first.revision }).room;
  expect(rolled.game.die).toBe(6);
  expect(rolled.game.rollCount).toBe(1);
  const moved = rooms.act(first.code, {
    type: 'move',
    id: rolled.moves[0].id,
    revision: rolled.revision,
  }).room;
  expect(moved.game.lastFlight?.steps.length).toBeGreaterThan(0);
  expect(new LocalRoomStore(storage).read(first.code)).toEqual(moved);
  expect(() => rooms.act(first.code, { type: 'rematch' })).toThrow('請先完成');
  for (let i = 0; i < 3; i++) rooms.act(first.code, { type: 'resign' });
  const finished = rooms.read(first.code);
  expect(finished.game.winner).not.toBeNull();
  expect(finished.game.withdrawn).toHaveLength(3);
  const rematch = rooms.act(first.code, { type: 'rematch' }).room;
  expect(rematch.game.flightSettings).toEqual(settings);
  expect(rematch.game.withdrawn).toEqual([]);
  expect(rematch.players.map((p) => p?.name)).toEqual(['Host', 'B', 'C', 'D']);
});

test('local storage rejects AI, corrupt saves and invalid moves without changing the saved game', () => {
  const { rooms, data } = setup();
  expect(() => rooms.create({ kind: 'jungle', mode: 'ai', name: 'Host' })).toThrow();
  expect(
    isHumanLocalGame({
      kind: 'flight',
      mode: 'local',
      name: 'Host',
      flightPlayers: [
        { name: 'Host', ai: false },
        { name: 'AI', ai: true },
      ],
    }),
  ).toBe(false);
  const room = rooms.create({ kind: 'jungle', mode: 'local', name: 'Host' }).room;
  const before = data.get(localRoomKey(room.code));
  expect(() => rooms.act(room.code, { type: 'move', id: 'bad', revision: 0 })).toThrow();
  expect(data.get(localRoomKey(room.code))).toBe(before);
  data.set(localRoomKey(room.code), '{bad');
  expect(() => rooms.read(room.code)).toThrow('存檔');
  data.set(
    localRoomKey(room.code),
    JSON.stringify({ ...room, players: [{ name: 'AI', ai: true, connected: true }] }),
  );
  expect(() => rooms.read(room.code)).toThrow('存檔');
});

test('browser transport creates, reads, plays and rematches without a reachable API', async () => {
  const api = createApi('http://127.0.0.1:1');
  const result = await api.create({ kind: 'jungle', mode: 'local', name: 'Offline' });
  const credentials = { code: result.room.code, token: result.token };
  expect((await api.room(credentials)).room).toEqual(result.room);
  const moved = await api.action(credentials, {
    type: 'move',
    id: result.room.moves[0].id,
    revision: 0,
  });
  expect(moved.room.game.ply).toBe(1);
  await api.action(credentials, { type: 'resign' });
  expect((await api.action(credentials, { type: 'rematch' })).room.game.ply).toBe(0);
});

test('a second store reads the latest saved revision and cannot overwrite it with a stale move', () => {
  const { rooms, storage } = setup();
  const initial = rooms.create({ kind: 'jungle', mode: 'local', name: 'Host' }).room;
  const other = new LocalRoomStore(storage);
  other.read(initial.code);
  const moved = rooms.act(initial.code, {
    type: 'move',
    id: initial.moves[0].id,
    revision: 0,
  }).room;
  expect(other.read(initial.code)).toEqual(moved);
  expect(() =>
    other.act(initial.code, { type: 'move', id: initial.moves[0].id, revision: 0 }),
  ).toThrow('棋局已更新');
});
