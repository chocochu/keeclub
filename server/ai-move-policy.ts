import { applyMove, legalMoves, type Game, type Move, type Side } from '../shared/game';

function key(side: number, piece: string, fromX: number, fromY: number, x: number, y: number) {
  return `${side}/${piece}/${fromX},${fromY}>${x},${y}`;
}

export function moveIdentity(game: Game, move: Move) {
  const piece = game.pieces.find((p) => p.id === move.piece)!;
  return key(game.turn, piece.id, piece.x, piece.y, move.x!, move.y!);
}

export const AI_MOVE_POLICY_VERSION = 'avoid-immediate-draws-v1';

export function describeAiMovePolicy(maxRepeats: number) {
  return `Exclude any move whose engine-computed outcome is a draw by board repetition or the quiet-move limit whenever at least one legal non-drawing move exists. If every legal move draws, a draw is allowed. Within that pool, exclude a directed move (same piece, origin, destination) already played ${maxRepeats} times during AI play whenever another move in the pool exists. Avoiding an immediate draw takes priority over the directed-move limit. Offered moves and simulated continuations obey this rule, including simulated history. This is a strict play-on policy, not a claim that continuing is strategically better than a defensive draw.`;
}

export function filterAiMoves(
  game: Game,
  playedCounts: Readonly<Record<string, number>>,
  maxRepeats = 2,
) {
  const legal = legalMoves(game);
  const nonDrawing = legal.filter((move) => applyMove(game, move.id).winner !== 'draw');
  // Draw prevention has priority: a repeated move can be the only way to play on.
  const pool = nonDrawing.length ? nonDrawing : legal;
  const fresh = pool.filter((move) => (playedCounts[moveIdentity(game, move)] ?? 0) < maxRepeats);
  return {
    moves: fresh.length ? fresh : pool,
    drawMovesBlocked: nonDrawing.length ? legal.length - nonDrawing.length : 0,
    unavoidableDraw: legal.length > 0 && nonDrawing.length === 0,
    repeatRuleFallback: pool.length > 0 && fresh.length === 0,
  };
}

export function restrictedMoves(
  root: Game,
  playedCounts: Readonly<Record<string, number>>,
  maxRepeats = 2,
  aiSides: readonly Side[] = [0, 1],
) {
  if (!Number.isSafeInteger(maxRepeats) || maxRepeats < 1)
    throw new Error('Invalid move repeat limit');
  return (game: Game): Move[] => {
    if (!aiSides.includes(game.turn)) return legalMoves(game);
    const simulatedPlies = game.ply - root.ply;
    if (simulatedPlies < 0 || simulatedPlies > 3)
      throw new Error('Move policy simulation horizon exceeded');
    const extra = simulatedPlies > 0 ? (game.jungleHistory ?? []).slice(-simulatedPlies) : [];
    const counts = { ...playedCounts };
    for (const entry of extra) {
      const identity = key(entry.side, entry.piece, entry.fromX, entry.fromY, entry.x, entry.y);
      counts[identity] = (counts[identity] ?? 0) + 1;
    }
    return filterAiMoves(game, counts, maxRepeats).moves;
  };
}
