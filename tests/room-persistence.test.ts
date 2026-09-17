import { afterEach, expect, test } from 'bun:test';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RoomService } from '../server/rooms/service';
import { RoomRepository } from '../server/rooms/repository';
import { ROOM_TTL_MS } from '../server/rooms/model';

const directories: string[] = [];
afterEach(() => {
  for (const dir of directories.splice(0)) rmSync(dir, { recursive: true, force: true });
});
function filePath() {
  const dir = mkdtempSync(join(tmpdir(), 'kee-room-persistence-'));
  directories.push(dir);
  return join(dir, 'rooms.json');
}

test('a move writes only its room; presence and no-op pruning never rewrite snapshots', () => {
  const file = filePath();
  const service = new RoomService({ dataFile: file, apiKey: '' });
  const a = service.create({ kind: 'jungle', mode: 'local', name: 'A' }).room;
  const b = service.create({ kind: 'jungle', mode: 'local', name: 'B' }).room;
  const pathA = join(`${file}.d`, `${a.code}.json`);
  const pathB = join(`${file}.d`, `${b.code}.json`);
  const beforeB = readFileSync(pathB, 'utf8');
  const inodeB = statSync(pathB).ino;
  // A dirty unrelated in-memory room must not be serialized by A's move.
  service.get(b.code).players[0]!.name = 'unsaved';
  service.act(service.get(a.code), 0, { type: 'move', id: a.moves[0].id, revision: a.revision });
  expect(JSON.parse(readFileSync(pathA, 'utf8')).game.ply).toBe(1);
  expect(readFileSync(pathB, 'utf8')).toBe(beforeB);
  expect(statSync(pathB).ino).toBe(inodeB);
  const inodeA = statSync(pathA).ino;
  service.setPresence(a.code, 0, 'tab', true);
  service.prune();
  expect(statSync(pathA).ino).toBe(inodeA);
  expect(statSync(pathB).ino).toBe(inodeB);
  expect(new RoomRepository(file).rooms.get(a.code)?.game.ply).toBe(1);
});

test('legacy rooms migrate atomically and a pruned room is never resurrected from the backup', () => {
  const file = filePath();
  const original = new RoomService({ apiKey: '' });
  const a = original.create({ kind: 'jungle', mode: 'friend', name: 'A' });
  const b = original.create({ kind: 'flight', mode: 'local', name: 'B' });
  const backup = JSON.stringify([...original.rooms.values()]);
  writeFileSync(file, backup);
  const migrated = new RoomService({ dataFile: file, apiKey: '' });
  expect(migrated.authorize(a.room.code, a.token).side).toBe(0);
  expect(migrated.get(b.room.code).game).toEqual(original.get(b.room.code).game);
  expect(readdirSync(`${file}.d`)).toHaveLength(2);
  expect(readFileSync(file, 'utf8')).toBe(backup);
  migrated.get(a.room.code).updated = Date.now() - ROOM_TTL_MS - 1;
  migrated.prune();
  expect(existsSync(join(`${file}.d`, `${a.room.code}.json`))).toBe(false);
  expect(new RoomRepository(file).rooms.has(a.room.code)).toBe(false);
  expect(new RoomRepository(file).rooms.has(b.room.code)).toBe(true);
  expect(readFileSync(file, 'utf8')).toBe(backup);
});

test('restart preserves AI match identity and credentials but exposes interrupted work for manual retry', () => {
  const file = filePath();
  const service = new RoomService({ dataFile: file, apiKey: 'test-not-used' });
  const result = service.create({ kind: 'jungle', mode: 'ai', name: 'A' });
  const room = service.get(result.room.code);
  room.game.turn = 1;
  room.thinking = true;
  room.aiGameId = 'same-match';
  service.repository.save(room);
  const restored = new RoomService({ dataFile: file, apiKey: 'test-not-used' });
  expect(restored.authorize(room.code, result.token).side).toBe(0);
  expect(restored.get(room.code)).toMatchObject({ thinking: false, aiGameId: 'same-match' });
  expect(restored.get(room.code).aiError).toContain('重試');
});

test('invalid legacy data is preserved without publishing a partial migration', () => {
  const file = filePath();
  const service = new RoomService({ apiKey: '' });
  const room = service.create({ kind: 'jungle', mode: 'local', name: 'A' }).room;
  const data = JSON.stringify([
    service.get(room.code),
    { ...service.get(room.code), code: '../escape' },
  ]);
  writeFileSync(file, data);
  expect(() => new RoomRepository(file)).toThrow('Invalid room snapshot');
  expect(readFileSync(file, 'utf8')).toBe(data);
  expect(existsSync(`${file}.d`)).toBe(false);
});

test('invalid per-room snapshots fail loudly and abandoned temporary writes are ignored', () => {
  const file = filePath();
  const service = new RoomService({ dataFile: file, apiKey: '' });
  const room = service.create({ kind: 'jungle', mode: 'local', name: 'A' }).room;
  const snapshot = join(`${file}.d`, `${room.code}.json`);
  writeFileSync(`${snapshot}.tmp`, '{partial');
  expect(new RoomRepository(file).rooms.has(room.code)).toBe(true);
  writeFileSync(snapshot, '{}');
  expect(() => new RoomRepository(file)).toThrow('Invalid room snapshot');
  expect(readFileSync(snapshot, 'utf8')).toBe('{}');
});
