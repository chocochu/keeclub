import { isAiPlayer } from '../../shared/players';
import { Type } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { ROOM_TTL_MS, StoredRoomSchema, type Room } from './model';

const validCode = (code: string) => /^[A-Z2-9]{6}$/.test(code);
const invalidSnapshot = () =>
  new Error('Invalid room snapshot. Preserve the data file and inspect it before restarting.');

/** Single-process store: one atomic snapshot per room, with a one-time legacy import. */
export class RoomRepository {
  readonly rooms = new Map<string, Room>();
  private readonly directory?: string;
  constructor(file?: string) {
    if (!file) return;
    this.directory = `${file}.d`;
    if (!existsSync(this.directory)) {
      const saved: unknown = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : [];
      if (
        !Value.Check(Type.Array(StoredRoomSchema), saved) ||
        saved.some((room) => !validCode(room.code)) ||
        new Set(saved.map((room) => room.code)).size !== saved.length
      )
        throw invalidSnapshot();
      mkdirSync(dirname(this.directory), { recursive: true });
      const staging = mkdtempSync(`${this.directory}.migrate-`);
      try {
        for (const room of saved)
          writeFileSync(join(staging, `${room.code}.json`), JSON.stringify(room), { mode: 0o600 });
        // Publish only a complete import. Keep the original file as a backup; never re-import it.
        renameSync(staging, this.directory);
      } catch (error) {
        rmSync(staging, { recursive: true, force: true });
        throw error;
      }
    }
    for (const entry of readdirSync(this.directory).filter((name) => name.endsWith('.json'))) {
      const room: unknown = JSON.parse(readFileSync(join(this.directory, entry), 'utf8'));
      if (
        !Value.Check(StoredRoomSchema, room) ||
        !validCode(room.code) ||
        entry !== `${room.code}.json`
      )
        throw invalidSnapshot();
      if (Date.now() - room.updated >= ROOM_TTL_MS) {
        rmSync(join(this.directory, entry));
        continue;
      }
      this.rooms.set(room.code, {
        ...room,
        thinking: false,
        aiError:
          isAiPlayer(room, room.game.turn) && room.game.winner === null
            ? '已恢復棋局，請重試 AI 回合。'
            : null,
      });
    }
  }
  save(room: Room) {
    if (!this.directory) return;
    if (!validCode(room.code)) throw invalidSnapshot();
    const file = join(this.directory, `${room.code}.json`);
    writeFileSync(`${file}.tmp`, JSON.stringify(room), { mode: 0o600 });
    renameSync(`${file}.tmp`, file);
  }
  delete(code: string) {
    if (!validCode(code)) throw invalidSnapshot();
    if (this.directory) rmSync(join(this.directory, `${code}.json`), { force: true });
    this.rooms.delete(code);
  }
}
