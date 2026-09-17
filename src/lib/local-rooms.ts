import { Value } from '@sinclair/typebox/value';
import {
  CreateRoomSchema,
  RoomActionSchema,
  RoomViewSchema,
  type CreateRoom,
  type RoomAction,
  type RoomView,
} from '../../shared/contracts';
import { applyMove, createGame, legalMoves, resign, rollDice } from '../../shared/game';
import { isBrowserRoom } from './room-location';
import { storage } from './storage';

export const isHumanLocalGame = (input: CreateRoom) =>
  input.mode === 'local' && !input.flightPlayers?.some((player) => player.ai);
export const localRoomKey = (code: string) => `kee:local-room:${code}`;

function randomDie() {
  // Rejection sampling keeps all six outcomes equally likely.
  const value = new Uint32Array(1);
  do crypto.getRandomValues(value);
  while (value[0] >= 4_294_967_292);
  return (value[0] % 6) + 1;
}

function localCode() {
  // getRandomValues also works on LAN HTTP origins, where randomUUID may be unavailable.
  const hex = Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
  return `local-${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export class LocalRoomStore {
  private readonly rooms = new Map<string, RoomView>();
  constructor(
    private readonly persistence: Pick<Storage, 'getItem' | 'setItem'>,
    private readonly dice = randomDie,
  ) {}

  create(input: CreateRoom) {
    if (!Value.Check(CreateRoomSchema, input) || !isHumanLocalGame(input))
      throw new Error('本機遊戲只支援同機真人對戰。');
    const count = input.kind === 'flight' ? (input.flightSettings?.playerCount ?? 2) : 2;
    if (input.flightPlayers && (input.kind !== 'flight' || input.flightPlayers.length !== count))
      throw new Error('玩家設定須符合人數。');
    const game = createGame(
      input.kind,
      input.kind === 'jungle' ? input.jungleSettings : input.flightSettings,
    );
    const room: RoomView = {
      code: localCode(),
      kind: input.kind,
      mode: 'local',
      players: Array.from({ length: count }, (_, side) => ({
        name:
          side === 0
            ? input.name.trim()
            : input.flightPlayers?.[side].name.trim() || `玩家${side + 1}`,
        ai: false,
        connected: true,
      })),
      game,
      side: 0,
      ready: true,
      moves: legalMoves(game),
      thinking: false,
      aiError: null,
      rematch: [],
      revision: 0,
    };
    this.save(room);
    // Empty token is a local session marker, never sent to the server.
    return { token: '', room };
  }

  read(code: string): RoomView {
    if (!isBrowserRoom(code)) throw new Error('無效的本機遊戲。');
    let room = this.rooms.get(code);
    const raw = this.persistence.getItem(localRoomKey(code));
    if (raw) {
      let saved: unknown;
      try {
        saved = JSON.parse(raw);
      } catch {
        throw new Error('本機存檔無法讀取，請返回大廳開新局。');
      }
      if (
        !Value.Check(RoomViewSchema, saved) ||
        saved.code !== code ||
        saved.mode !== 'local' ||
        saved.kind !== saved.game.kind ||
        saved.players.length !== (saved.kind === 'flight' ? saved.game.planes.length : 2) ||
        !saved.players.every((player) => player && player.ai === false) ||
        saved.thinking ||
        !saved.ready
      )
        throw new Error('本機存檔無效，請返回大廳開新局。');
      if (!room || saved.revision > room.revision) room = saved;
    }
    if (!room) throw new Error('這台裝置沒有此局存檔，請返回大廳開新局。');
    this.rooms.set(code, room);
    return structuredClone(room);
  }

  act(code: string, action: RoomAction) {
    if (!Value.Check(RoomActionSchema, action)) throw new Error('無效的操作。');
    const room = this.read(code);
    switch (action.type) {
      case 'move':
      case 'roll':
        if (action.revision !== room.revision) throw new Error('棋局已更新，請重新選擇。');
        room.game =
          action.type === 'roll'
            ? rollDice(room.game, this.dice())
            : applyMove(room.game, action.id);
        break;
      case 'resign':
        room.game = resign(room.game, room.game.turn);
        break;
      case 'rematch':
        if (room.game.winner === null) throw new Error('請先完成這局。');
        room.game = createGame(
          room.kind,
          room.kind === 'jungle' ? room.game.jungleSettings : room.game.flightSettings,
        );
        room.rematch = [];
        break;
      case 'retry':
        throw new Error('本機真人對戰不需要重試 AI。');
    }
    room.revision++;
    room.moves = legalMoves(room.game);
    this.save(room);
    return { room };
  }

  private save(room: RoomView) {
    this.persistence.setItem(localRoomKey(room.code), JSON.stringify(room));
    this.rooms.set(room.code, structuredClone(room));
  }
}

export const localRooms = new LocalRoomStore(storage);
