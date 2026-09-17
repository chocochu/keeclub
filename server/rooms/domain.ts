import { randomUUID } from 'node:crypto';
import { applyMove, createGame, legalMoves, resign, rollDice } from '../../shared/game';
import type { CreateRoom, RoomAction, RoomView, Side } from '../../shared/contracts';
import { isAiPlayer } from '../../shared/players';
import { HttpError } from '../http/errors';
import { createSeat } from './identity';
import type { Room } from './model';

export const ready = (room: Room) => room.players.every(Boolean);
export const needsAi = (room: Room) =>
  ready(room) && room.game.winner === null && isAiPlayer(room, room.game.turn);

export function createRoom(code: string, input: CreateRoom, aiAvailable: boolean) {
  const count = input.kind === 'flight' ? (input.flightSettings?.playerCount ?? 2) : 2;
  const seats = input.flightPlayers;
  if (seats && (input.kind !== 'flight' || seats.length !== count || seats[0].ai))
    throw new HttpError(400, '玩家設定須符合人數，房主必須是真人。');
  if (seats && input.mode === 'ai')
    throw new HttpError(400, '請選擇好友或同機模式，再設定 AI 席位。');
  if ((input.mode === 'ai' || seats?.some((seat) => seat.ai)) && !aiAvailable)
    throw new HttpError(503, 'AI 暫未啟用，請先選擇真人對戰。');
  const { seat, token } = createSeat(input.name);
  const room: Room = {
    code,
    kind: input.kind,
    mode: input.mode,
    ...(input.kind === 'jungle' && input.mode === 'ai'
      ? { aiDifficulty: input.aiDifficulty ?? 'normal', aiMoveCounts: {} }
      : {}),
    players: Array.from({ length: count }, (_, index) => {
      if (index === 0) return seat;
      const ai = seats?.[index].ai ?? input.mode === 'ai';
      if (ai) return { name: `AI ${index}`, hash: '', ai: true };
      if (input.mode === 'friend') return null;
      return { name: seats?.[index].name.trim() || `玩家${index + 1}`, hash: '', ai: false };
    }),
    game: createGame(
      input.kind,
      input.kind === 'jungle' ? input.jungleSettings : input.flightSettings,
    ),
    updated: Date.now(),
    thinking: false,
    aiError: null,
    rematch: [],
    revision: 0,
  };
  return { room, token };
}

export function joinRoom(room: Room, name: string): { token: string; side: Side } {
  const side = room.players.findIndex((player) => !player);
  if (room.mode !== 'friend' || side < 0)
    throw new HttpError(409, '房間已滿。若你是原玩家，請使用原本的瀏覽器。');
  const { seat, token } = createSeat(name);
  room.players[side] = seat;
  return { token, side: side as Side };
}

export function roomView(room: Room, side: Side, connected: (side: Side) => boolean): RoomView {
  return {
    code: room.code,
    kind: room.kind,
    mode: room.mode,
    ...(room.kind === 'jungle' && room.mode === 'ai'
      ? { aiDifficulty: room.aiDifficulty ?? 'easy' }
      : {}),
    game: room.game,
    side,
    ready: ready(room),
    players: room.players.map((p, index) =>
      p
        ? {
            name: isAiPlayer(room, index) ? `AI ${index}` : p.name,
            ai: isAiPlayer(room, index),
            connected:
              isAiPlayer(room, index) || room.mode !== 'friend' || connected(index as Side),
          }
        : null,
    ),
    moves: ready(room) ? legalMoves(room.game) : [],
    thinking: room.thinking,
    aiError: room.aiError?.replace(/typesafe/gi, 'AI') ?? null,
    rematch: room.rematch,
    revision: room.revision,
  };
}

/** Mutates only the caller's draft. Persistence and AI scheduling belong to the host. */
export function actOnRoom(room: Room, side: Side, action: RoomAction, dice: () => number) {
  if (!ready(room)) throw new HttpError(400, '等朋友加入後便可開始。');
  try {
    switch (action.type) {
      case 'rematch':
        if (room.game.winner === null || room.thinking)
          throw new Error(room.thinking ? 'AI 正在結束回合，請稍後再試。' : '請先完成這局。');
        if (!room.rematch.includes(side)) room.rematch.push(side);
        if (
          room.mode !== 'friend' ||
          room.players.every(
            (_, index) => isAiPlayer(room, index) || room.rematch.includes(index as Side),
          )
        ) {
          room.game = createGame(
            room.kind,
            room.kind === 'jungle' ? room.game.jungleSettings : room.game.flightSettings,
          );
          if (room.players.some((_, index) => isAiPlayer(room, index)))
            room.aiGameId = randomUUID();
          room.aiMoveCounts = {};
          room.rematch = [];
          room.aiError = null;
        }
        break;
      case 'resign':
        if (room.mode === 'local' && isAiPlayer(room, room.game.turn))
          throw new Error('請等候真人回合再認輸。');
        room.game = resign(room.game, room.mode === 'local' ? room.game.turn : side);
        break;
      case 'retry':
        if (!needsAi(room) || !room.aiError || room.thinking) throw new Error('現在不需要重試。');
        room.aiError = null;
        break;
      default:
        if (action.revision !== room.revision) throw new Error('棋局已更新，請重新選擇。');
        if (room.mode !== 'local' && room.game.turn !== side) throw new Error('請等候對方回合。');
        if (room.thinking || isAiPlayer(room, room.game.turn))
          throw new Error('請等候 AI 完成回合。');
        room.game =
          action.type === 'roll' ? rollDice(room.game, dice()) : applyMove(room.game, action.id);
    }
  } catch (error) {
    throw new HttpError(400, error instanceof Error ? error.message : '無效的操作。');
  }
}
