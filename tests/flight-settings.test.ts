import { afterEach, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Value } from '@sinclair/typebox/value';
import { CreateRoomSchema, type CreateRoom } from '../shared/contracts';
import { legalMoves } from '../shared/game';
import { RoomService } from '../server/rooms/service';
import { isMyTurn } from '../src/features/room/selectors';

const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })));
const input = (mode: 'friend' | 'local', ai: number[] = []): CreateRoom => ({
  kind: 'flight',
  mode,
  name: 'Host',
  flightSettings: { playerCount: 4, tripleSix: 'closest' },
  flightPlayers: ['Host', '  阿晴  ', '小明', '   '].map((name, side) => ({
    name,
    ai: ai.includes(side),
  })),
});
async function settled(service: RoomService, code: string) {
  for (let i = 0; service.get(code).thinking && i < 100; i++) await Bun.sleep(1);
  expect(service.get(code).thinking).toBe(false);
}

test('four same-device names are trimmed, defaulted and preserved through rematch', () => {
  const service = new RoomService({ apiKey: '' });
  const session = service.create(input('local'));
  expect(session.room.players.map((p) => p?.name)).toEqual(['Host', '阿晴', '小明', '玩家4']);
  expect(session.room.ready).toBe(true);
  const room = service.get(session.room.code);
  room.game.winner = 0;
  service.act(room, 0, { type: 'rematch' });
  expect(room.players.map((p) => p?.name)).toEqual(['Host', '阿晴', '小明', '玩家4']);
});

for (const mode of ['friend', 'local'] as const) {
  test(`${mode}: AI fills selected seats, returns control to the next human and only humans vote`, async () => {
    const service = new RoomService({
      apiKey: 'test',
      dice: () => 1,
      choose: async (g) => legalMoves(g)[0],
    });
    const session = service.create(input(mode, [2, 3]));
    const room = service.get(session.room.code);
    expect(session.room.players.map((p) => p?.ai ?? null)).toEqual([
      false,
      mode === 'friend' ? null : false,
      true,
      true,
    ]);
    if (mode === 'friend') {
      expect(session.room.ready).toBe(false);
      const guest = service.join(room.code, 'Guest');
      expect(guest.room.side).toBe(1);
      expect(service.authorize(room.code, guest.token).side).toBe(1);
      expect(guest.room.ready).toBe(true);
      expect(guest.room.players[2]?.connected).toBe(true);
      expect(() => service.join(room.code, 'Extra')).toThrow('房間已滿');
    }
    service.act(room, 0, { type: 'roll', revision: room.revision });
    await settled(service, room.code);
    expect(room.game.turn).toBe(1); // Turn order is red, yellow (AI), green, blue (AI).
    expect(room.game.rollCount).toBe(2);
    expect(isMyTurn(service.view(room, 0))).toBe(mode === 'local');
    service.act(room, mode === 'local' ? 0 : 1, { type: 'roll', revision: room.revision });
    await settled(service, room.code);
    expect(room.game.turn).toBe(0);
    expect(room.game.rollCount).toBe(4);
    room.game.winner = 0;
    service.act(room, 0, { type: 'rematch' });
    if (mode === 'friend') {
      expect(room.game.winner).toBe(0);
      service.act(room, 1, { type: 'rematch' });
    }
    expect(room.game.winner).toBeNull();
    expect(room.players[2]?.ai).toBe(true);
    expect(room.game.flightSettings).toEqual(input(mode).flightSettings);
  });

  test(`${mode}: all extra seats can be AI, including an immediate online rematch`, async () => {
    const service = new RoomService({ apiKey: 'test', dice: () => 1 });
    const session = service.create(input(mode, [1, 2, 3]));
    const room = service.get(session.room.code);
    expect(session.room.ready).toBe(true);
    service.act(room, 0, { type: 'roll', revision: room.revision });
    await settled(service, room.code);
    expect(room.game.turn).toBe(0);
    expect(room.game.rollCount).toBe(4);
    room.game.winner = 0;
    service.act(room, 0, { type: 'rematch' });
    expect(room.game.winner).toBeNull();
  });

  test(`${mode}: failed AI turns block human moves and resume on retry after restart`, async () => {
    const dir = mkdtempSync(join(tmpdir(), 'kee-mixed-'));
    dirs.push(dir);
    const dataFile = join(dir, 'rooms.json');
    const service = new RoomService({
      dataFile,
      apiKey: 'test',
      dice: () => 1,
      choose: async () => {
        throw new Error('AI 暫時忙碌，請稍後重試。');
      },
    });
    const session = service.create(input(mode, [2, 3]));
    const room = service.get(session.room.code);
    if (mode === 'friend') service.join(room.code, 'Guest');
    room.game.planes[2][0] = 0; // AI now has a legal move after rolling.
    service.act(room, 0, { type: 'roll', revision: room.revision });
    await settled(service, room.code);
    expect(room.game.turn).toBe(2);
    expect(room.aiError).toContain('AI');
    expect(isMyTurn(service.view(room, 0))).toBe(false);
    expect(() =>
      service.act(room, 0, { type: 'move', id: 'plane-0', revision: room.revision }),
    ).toThrow();
    if (mode === 'local')
      expect(() => service.act(room, 0, { type: 'resign' })).toThrow('真人回合');
    const restored = new RoomService({
      dataFile,
      apiKey: 'test',
      dice: () => 1,
      choose: async (g) => legalMoves(g)[0],
    });
    const saved = restored.authorize(room.code, session.token).room;
    expect(saved.aiError).toContain('已恢復');
    expect(saved.players[2]?.ai).toBe(true);
    restored.act(saved, 0, { type: 'retry' });
    await settled(restored, room.code);
    expect(saved.aiError).toBeNull();
    expect(saved.game.turn).toBe(1);
    expect(saved.game.planes[2][0]).toBe(1);
  });
}

test('seat configuration rejects mismatched counts, AI hosts, invalid names and missing AI setup', () => {
  const service = new RoomService({ apiKey: '' });
  expect(() => service.create(input('local', [0]))).toThrow('房主必須是真人');
  expect(() =>
    service.create({ ...input('local'), flightPlayers: input('local').flightPlayers!.slice(0, 2) }),
  ).toThrow('符合人數');
  for (const mode of ['friend', 'local'] as const) {
    expect(() => service.create(input(mode, [2]))).toThrow('AI 暫未啟用');
  }
  expect(Value.Check(CreateRoomSchema, input('local'))).toBe(true);
  expect(
    Value.Check(CreateRoomSchema, {
      ...input('local'),
      flightPlayers: [
        { name: 'x'.repeat(25), ai: false },
        { name: '', ai: true },
      ],
    }),
  ).toBe(false);
  expect(
    Value.Check(CreateRoomSchema, {
      ...input('local'),
      flightPlayers: [
        { name: '', ai: 'yes' },
        { name: '', ai: false },
      ],
    }),
  ).toBe(false);
});

test('legacy AI seats and errors have provider-neutral public names', () => {
  const service = new RoomService({ apiKey: 'test' });
  const session = service.create({ name: 'Host', kind: 'flight', mode: 'ai' });
  const room = service.get(session.room.code);
  delete room.players[1]!.ai;
  room.players[1]!.name = 'TypeSafe AI 1';
  room.aiError = 'TypeSafe 暫時忙碌，請稍後重試。';
  const view = service.view(room, 0);
  expect(view.players[1]).toEqual({ name: 'AI 1', ai: true, connected: true });
  expect(view.aiError).toBe('AI 暫時忙碌，請稍後重試。');
});
