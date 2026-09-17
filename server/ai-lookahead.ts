import { buildMoveRequest } from './ai-state';
import { applyMove, legalMoves, other, type Game, type Move, type Side } from '../shared/game';

export type Variant = 'baseline' | 'lookahead3';
export type MoveRequest = ReturnType<typeof buildMoveRequest>;

// Rank sums are deliberately a crude, disclosed material proxy, not Jungle piece values.
export function materialBalance(game: Game, side: Side) {
  return game.pieces.reduce((sum, p) => sum + (p.side === side ? p.rank : -p.rank), 0);
}

function leafValue(game: Game, side: Side) {
  return game.winner === side
    ? 10_000
    : game.winner === other(side)
      ? -10_000
      : game.winner === 'draw'
        ? 0
        : materialBalance(game, side);
}

function describeLeaf(root: Game, leaf: Game, line: Move[]) {
  return {
    line: line.map((m) => ({ id: m.id, action: m.label })),
    winner: leaf.winner,
    materialBalance: materialBalance(leaf, root.turn),
    materialChange: materialBalance(leaf, root.turn) - materialBalance(root, root.turn),
    lostPieces: root.pieces
      .filter((p) => !leaf.pieces.some((remaining) => remaining.id === p.id))
      .map((p) => ({ id: p.id, side: p.side, rank: p.rank })),
  };
}

type CandidateAnalysis =
  | {
      complete: true;
      nodes: number;
      forcedWinWithinThreePlies: boolean;
      opponentReplyCount: number;
      repliesAllowingOurImmediateWin: number;
      worstCase: ReturnType<typeof describeLeaf>;
    }
  | { complete: false; nodes: number; reason: string };

export function analyzeCandidate(
  root: Game,
  move: Move,
  maxNodes: number,
  enumerateMoves = legalMoves,
): CandidateAnalysis {
  let nodes = 0;
  function advance(game: Game, next: Move) {
    if (nodes >= maxNodes) throw new Error('node-budget');
    nodes++;
    return applyMove(game, next.id);
  }
  try {
    const after = advance(root, move);
    if (after.winner !== null) {
      return {
        complete: true as const,
        nodes,
        forcedWinWithinThreePlies: after.winner === root.turn,
        opponentReplyCount: 0,
        repliesAllowingOurImmediateWin: 0,
        worstCase: describeLeaf(root, after, [move]),
      };
    }
    let worst: { game: Game; line: Move[]; value: number } | undefined;
    const replies = enumerateMoves(after);
    if (!replies.length)
      return {
        complete: false,
        nodes,
        reason: 'AI move restriction leaves no opponent continuation; game is not adjudicated',
      };
    let winningReplies = 0;
    for (const reply of replies) {
      const replied = advance(after, reply);
      let best: { game: Game; line: Move[]; value: number } | undefined;
      let canWin = false;
      if (replied.winner !== null) {
        best = { game: replied, line: [move, reply], value: leafValue(replied, root.turn) };
        canWin = replied.winner === root.turn;
      } else {
        const responses = enumerateMoves(replied);
        if (!responses.length)
          return {
            complete: false,
            nodes,
            reason: 'AI move restriction leaves no own continuation; game is not adjudicated',
          };
        for (const response of responses) {
          const leaf = advance(replied, response);
          const value = leafValue(leaf, root.turn);
          if (leaf.winner === root.turn) canWin = true;
          if (!best || value > best.value)
            best = { game: leaf, line: [move, reply, response], value };
        }
      }
      if (!best) throw new Error('Nonterminal Jungle state has no legal continuation');
      if (canWin) winningReplies++;
      if (!worst || best.value < worst.value) worst = best;
    }
    if (!worst) throw new Error('Nonterminal Jungle state has no legal reply');
    return {
      complete: true as const,
      nodes,
      forcedWinWithinThreePlies: winningReplies === replies.length,
      opponentReplyCount: replies.length,
      repliesAllowingOurImmediateWin: winningReplies,
      worstCase: describeLeaf(root, worst.game, worst.line),
    };
  } catch (error) {
    if (!(error instanceof Error) || error.message !== 'node-budget') throw error;
    // A partial enumeration must never become a proof or an optimistic minimax score.
    return { complete: false as const, nodes, reason: 'Per-candidate node budget exhausted' };
  }
}

export function buildJungleAnalysis(
  game: Game,
  model: string,
  variant: Variant,
  maxNodes = 50_000,
  enumerateMoves = legalMoves,
) {
  if (game.kind !== 'jungle') throw new Error('Jungle search only');
  if (!Number.isSafeInteger(maxNodes) || maxNodes < 1) throw new Error('Invalid node budget');
  const request = buildMoveRequest(game, model, enumerateMoves);
  if (variant === 'baseline') return { request, nodes: 0, incompleteCandidates: 0 };
  const offered = new Set(Object.keys(request.questions.move.criteria));
  const moves = enumerateMoves(game).filter((m) => offered.has(m.id));
  const budgetPerCandidate = Math.floor(maxNodes / moves.length);
  const candidates = Object.fromEntries(
    moves.map((move) => [
      move.id,
      analyzeCandidate(game, move, budgetPerCandidate, enumerateMoves),
    ]),
  );
  // Identical Choice question and offered moves: only evidence in state changes.
  return {
    request: {
      ...request,
      state: {
        ...request.state,
        lookahead: {
          horizon:
            'At most three plies: currentPlayer move, opponent reply, currentPlayer response.',
          method:
            'Exhaustive legal continuations per complete candidate. Opponent minimizes and currentPlayer maximizes a leaf value: terminal win +10000, loss -10000, draw 0, otherwise own rank sum minus enemy rank sum. Ties use engine move order. worstCase is one representative line under this heuristic, not a prediction.',
          limitations:
            'Rank sums are a crude material proxy, not true piece values. Nonterminal leaves are not proven safe: a piece can be recaptured on ply four. No strategic value beyond this horizon is computed. Incomplete candidates have no score or proof. All facts use room rules and full repetition/activity history.',
          candidates,
        },
      },
    },
    nodes: Object.values(candidates).reduce((sum, c) => sum + c.nodes, 0),
    incompleteCandidates: Object.values(candidates).filter((c) => !c.complete).length,
  };
}
