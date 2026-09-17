import { randomUUID } from 'node:crypto';
import { applyMove, legalMoves, rollDice } from '../../shared/game';
import { chooseMove } from '../ai';
import type { Room } from './model';
import { isAiPlayer } from '../../shared/players';

interface AiTurnOptions {
  apiKey: string;
  model: string;
  dice: () => number;
  choose: typeof chooseMove;
  changed: (room: Room) => void;
}
/** The room lock and revision check keep awaited provider responses from replacing newer state. */
export async function playAiTurn(room: Room, options: AiTurnOptions) {
  if (
    !room.players.every(Boolean) ||
    !isAiPlayer(room, room.game.turn) ||
    room.thinking ||
    room.game.winner !== null
  )
    return;
  const { changed, dice, choose, apiKey, model } = options;
  room.aiGameId ??= randomUUID();
  const usageContext = { roomCode: room.code, gameId: room.aiGameId };
  room.thinking = true;
  room.aiError = null;
  changed(room);
  try {
    while (isAiPlayer(room, room.game.turn) && room.game.winner === null) {
      if (room.game.kind === 'flight' && room.game.die === null) {
        room.game = rollDice(room.game, dice());
        changed(room);
      }
      if (!isAiPlayer(room, room.game.turn) || room.game.winner !== null) break;
      if (!legalMoves(room.game).length) continue;
      const revision = room.revision;
      const move = await choose(structuredClone(room.game), apiKey, model, undefined, usageContext);
      if (room.game.winner !== null || !isAiPlayer(room, room.game.turn)) break;
      // Another human may withdraw while this choice is pending. Reconsider the new board.
      if (room.revision !== revision) continue;
      room.game = applyMove(room.game, move.id);
      changed(room);
    }
  } catch (error) {
    if (room.game.winner === null)
      room.aiError =
        error instanceof Error && error.name !== 'TimeoutError' && error.name !== 'TypeError'
          ? error.message
          : 'AI 連線逾時或網絡中斷，棋局已保留，請重試。';
  } finally {
    room.thinking = false;
    changed(room);
  }
}
