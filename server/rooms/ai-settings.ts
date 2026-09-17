import { applyMove, type Move, type Side } from '../../shared/game';
import { isAiPlayer } from '../../shared/players';
import { moveIdentity } from '../ai-move-policy';
import type { AiOptions } from '../ai-request';
import type { Room } from './model';

export function roomAiOptions(room: Room): AiOptions {
  return {
    // Existing snapshots retain their baseline difficulty; new rooms set Normal explicitly.
    difficulty: room.aiDifficulty ?? 'easy',
    moveCounts: room.aiMoveCounts ?? {},
    aiSides: room.players.flatMap((_, side) => (isAiPlayer(room, side) ? [side as Side] : [])),
  };
}

/** Record only an accepted AI move, in the same persistence step as its new game state. */
export function applyAiMove(room: Room, move: Move) {
  const before = room.game;
  const next = applyMove(before, move.id);
  if (before.kind === 'jungle') {
    const identity = moveIdentity(before, move);
    room.aiMoveCounts = {
      ...room.aiMoveCounts,
      [identity]: (room.aiMoveCounts?.[identity] ?? 0) + 1,
    };
  }
  room.game = next;
}
