import { choice } from '@typesafe-ai/sdk';
import {
  ANIMAL_NAMES,
  applyMove,
  den,
  effectiveRank,
  legalMoves,
  other,
  positionKey,
  rollDice,
  RULES,
  jungleRules,
  DEFAULT_JUNGLE_SETTINGS,
  trackIndex,
  FLIGHT_QUARTERS,
  trap,
  water,
  type Game,
  type Move,
  type Piece,
  type Side,
} from '../shared/game';

export const AI_INSTRUCTIONS = {
  jungle: {
    question: 'Which offered move gives `currentPlayer` the best position in Jungle?',
    evidence:
      "Use the current `position`, `board`, and each option's `candidates` entry. Candidate changes apply to the current position; unmentioned pieces stay put. All facts and one-reply outcomes were computed by the game engine.",
    priorities: [
      'Prefer a favorable exchange while keeping the own den defended.',
      'Use effective strength and terrain to judge the remaining tradeoff between defense and attacking the enemy den.',
      'Account for candidate draws and opponent drawing replies when comparing continued play with a draw.',
    ],
    limits:
      'Code already restricts options to immediate wins when available, otherwise to moves avoiding an immediate opponent win when possible. Replies cover one opponent move only; no listed threat is not proof of long-term safety. Do not reconstruct hidden history or assume standard rules beyond `rules`.',
  },
  flight: {
    question: 'Which offered move best advances `currentPlayer` toward finishing all four planes?',
    evidence:
      "Use `position` and each option's `candidates` entry. Captures, final landing, finished counts, next player, and outcomes conditional on the next die roll are engine-computed. Unmentioned planes stay put.",
    priorities: [
      'Balance finishing planes and making safe progress against captures and exposure on the shared track.',
      'Compare launching another plane with advancing one already in play, using the supplied next-roll options.',
    ],
    limits:
      'Code restricts options to immediate game wins when available. `nextRolls` describes only the next roll and one move by the named roller, who may still be the current player after a six. Possible captures are opportunities, not capture probabilities. Later rolls and opponent responses after an extra turn are not evaluated.',
  },
};

function describePiece(piece: Piece) {
  return {
    ...piece,
    animal: ANIMAL_NAMES[piece.rank],
    effectiveRank: effectiveRank(piece),
    terrain: water(piece.x, piece.y) ? 'river' : 'land',
    trapOwner: trap(piece.x, piece.y),
    denOwner: den(piece.x, piece.y),
  };
}

// Derive the legend from the same terrain functions the rules engine uses.
const cells = Array.from({ length: 63 }, (_, i) => ({ x: i % 7, y: Math.floor(i / 7) }));
const JUNGLE_BOARD = {
  width: 7,
  height: 9,
  coordinates: 'Zero-based x increases rightward; y increases downward.',
  rivers: cells.filter(({ x, y }) => water(x, y)),
  traps: cells.flatMap(({ x, y }) => {
    const owner = trap(x, y);
    return owner === null ? [] : [{ x, y, owner }];
  }),
  dens: cells.flatMap(({ x, y }) => {
    const owner = den(x, y);
    return owner === null ? [] : [{ x, y, owner }];
  }),
  strength:
    'A piece in an enemy trap has effective rank zero and can be captured by any enemy. Against an unweakened defender, a weakened attacker cannot capture; otherwise equal or higher rank captures, except rat can capture elephant and elephant cannot capture rat. Riverbank rat captures depend on the room settings.',
};

function drawState(game: Game) {
  return {
    quietHalfMoves: game.quiet,
    quietHalfMoveLimit: 100,
    positionOccurrences: game.positions[positionKey(game)] ?? 0,
    repetitionLimit: 3,
  };
}

function jungleCandidate(game: Game, move: Move) {
  const next = applyMove(game, move.id);
  const captured = game.pieces.filter(
    (p) => !next.pieces.some((remaining) => remaining.id === p.id),
  );
  const replies = legalMoves(next).map((reply) => {
    const afterReply = applyMove(next, reply.id);
    return {
      move: reply,
      winner: afterReply.winner,
      captured: next.pieces.filter(
        (p) => !afterReply.pieces.some((remaining) => remaining.id === p.id),
      ),
    };
  });
  return {
    action: move.label,
    movedPiece: describePiece(next.pieces.find((p) => p.id === move.piece)!),
    captured: captured.map(describePiece),
    winner: next.winner,
    nextPlayer: next.winner === null ? next.turn : null,
    draw: drawState(next),
    remainingPieces: [0, 1].map((side) => ({
      side,
      count: next.pieces.filter((p) => p.side === side).length,
    })),
    opponentReplies: {
      horizon: 'One legal opponent move after this candidate; terminal candidates have no replies.',
      count: replies.length,
      immediateWins: replies.filter((r) => r.winner === other(game.turn)).map((r) => r.move.id),
      draws: replies.filter((r) => r.winner === 'draw').map((r) => r.move.id),
      captures: replies
        .filter((r) => r.captured.length > 0)
        .map((r) => ({
          moveId: r.move.id,
          attacker: r.move.piece,
          captured: r.captured.map(describePiece),
        })),
    },
  };
}

function describePlane(side: Side, index: number, progress: number) {
  return {
    id: `${side}-${index}`,
    side,
    index,
    progress,
    zone:
      progress === -1
        ? 'hangar'
        : progress === 0
          ? 'launch'
          : progress === 56
            ? 'finished'
            : progress > 50
              ? 'home-lane'
              : 'shared-track',
    sharedCell: progress >= 1 && progress <= 50 ? trackIndex(side, progress) : null,
    remainingProgressToFinish: progress === -1 ? null : 56 - progress,
  };
}

function describePlanes(game: Game) {
  return game.planes.flatMap((planes, side) =>
    planes.map((p, index) => describePlane(side as Side, index, p)),
  );
}

function planeCounts(game: Game) {
  return game.planes.map((_, side) => ({
    side,
    hangar: game.planes[side].filter((p) => p === -1).length,
    launch: game.planes[side].filter((p) => p === 0).length,
    sharedTrack: game.planes[side].filter((p) => p >= 1 && p <= 50).length,
    homeLane: game.planes[side].filter((p) => p >= 51 && p <= 55).length,
    finished: game.planes[side].filter((p) => p === 56).length,
  }));
}

function capturedPlanes(before: Game, after: Game) {
  return describePlanes(before).filter(
    (p) => p.progress >= 0 && after.planes[p.side][p.index] === -1,
  );
}

function flightCandidate(game: Game, move: Move) {
  const next = applyMove(game, move.id);
  const nextRolls =
    next.winner !== null
      ? []
      : [1, 2, 3, 4, 5, 6].map((die) => {
          const rolled = rollDice(next, die);
          return {
            die,
            roller: next.turn,
            forfeitedThirdSix: next.sixes === 2 && die === 6,
            returnedByRoll: capturedPlanes(next, rolled).map((p) => p.id),
            nextPlayer: rolled.turn,
            consecutiveSixes: rolled.sixes,
            // If a roll passed the turn, legalMoves returns no moves because die is null.
            moves: legalMoves(rolled).map((reply) => {
              const after = applyMove(rolled, reply.id);
              return {
                moveId: reply.id,
                destinationProgress: reply.progress!,
                finishesPlane: reply.progress === 56,
                capturedPlaneIds: capturedPlanes(rolled, after).map((p) => p.id),
                winner: after.winner,
                nextPlayer: after.winner === null ? after.turn : null,
              };
            }),
          };
        });
  const startProgress = game.planes[game.turn][Number(move.piece)];
  return {
    action: move.label,
    movedPlane: describePlane(game.turn, Number(move.piece), move.progress!),
    launched: startProgress === -1,
    finishesPlane: move.progress === 56,
    bonusProgress: startProgress === -1 ? 0 : move.progress! - startProgress - game.die!,
    captured: capturedPlanes(game, next),
    route: next.lastFlight?.steps.map(({ kind, progress }) => ({ kind, progress })) ?? [],
    finishedAll: next.rankings?.includes(game.turn) ?? false,
    rankings: next.rankings ?? [],
    counts: planeCounts(next),
    winner: next.winner,
    nextPlayer: next.winner === null ? next.turn : null,
    extraRoll: next.winner === null && next.turn === game.turn,
    consecutiveSixes: next.sixes,
    nextRolls,
  };
}

function moveQuestion<T extends { action: string; winner: Game['winner'] }>(
  candidates: Record<string, T>,
  offered: string[],
  instructions: (typeof AI_INSTRUCTIONS)[keyof typeof AI_INSTRUCTIONS],
) {
  return choice(
    instructions,
    Object.fromEntries(
      offered.map((id) => [
        id,
        {
          action: candidates[id].action,
          evidence: `Use \`candidates[${JSON.stringify(id)}]\` for the engine-computed outcome.`,
        },
      ]),
    ),
  );
}

/** Pure request builder: code computes facts; Choice judges the remaining strategic tradeoff. */
export function buildMoveRequest(game: Game, model: string) {
  const moves = legalMoves(game);
  if (!moves.length) throw new Error('沒有合法步法。');
  return game.kind === 'jungle'
    ? buildJungleRequest(game, model, moves)
    : buildFlightRequest(game, model, moves);
}

function buildJungleRequest(game: Game, model: string, moves: Move[]) {
  const candidates = Object.fromEntries(moves.map((m) => [m.id, jungleCandidate(game, m)]));
  const wins = moves.filter((m) => candidates[m.id].winner === game.turn);
  const safe = moves.filter((m) => candidates[m.id].opponentReplies.immediateWins.length === 0);
  const offered = (wins.length ? wins : safe.length ? safe : moves).map((m) => m.id);
  return {
    model,
    state: {
      game: 'jungle' as const,
      currentPlayer: game.turn,
      board: JUNGLE_BOARD,
      rules: jungleRules(game.jungleSettings),
      settings: game.jungleSettings ?? DEFAULT_JUNGLE_SETTINGS,
      position: { pieces: game.pieces.map(describePiece), draw: drawState(game) },
      selectionPolicy:
        'Immediate wins first; otherwise avoid a one-move opponent win when possible. All other choices remain available.',
      candidates,
    },
    questions: { move: moveQuestion(candidates, offered, AI_INSTRUCTIONS.jungle) },
  };
}

function buildFlightRequest(game: Game, model: string, moves: Move[]) {
  const candidates = Object.fromEntries(moves.map((m) => [m.id, flightCandidate(game, m)]));
  const wins = moves.filter((m) => candidates[m.id].finishedAll);
  const offered = (wins.length ? wins : moves).map((m) => m.id);
  return {
    model,
    state: {
      game: 'flight' as const,
      currentPlayer: game.turn,
      rules: RULES.flight,
      board: {
        sharedTrackCells: 52,
        launchOffsets: Object.fromEntries(
          game.planes.map((_, side) => [side, FLIGHT_QUARTERS[side] * 13]),
        ),
        jumpLandingProgress: Array.from({ length: 12 }, (_, i) => 2 + 4 * i),
        shortcut: { from: 18, to: 30 },
        jumpRule:
          'A dice landing at 18 flies to 30 then jumps to 34. A colour jump from 14 to 18 flies to 30 and stops. Other same-colour landings jump four. Home-lane overshoots bounce back from 56.',
        progress:
          'Each side: -1 hangar, 0 separate launch pad, 1–50 shared track, 51–55 home lane, 56 finished and parked inverted at the airport. Opposite-side shortcut flights can capture a home-lane plane at progress 53. Finished planes cannot be captured or penalized.',
        landing:
          'Each dice landing and each bonus landing captures all stacked opponents there, and shortcuts capture the opposite home-lane crossing. Passing ordinary cells does not capture. Friendly stacks move one plane at a time. Candidate routes and captured lists include all these events.',
      },
      position: {
        die: game.die,
        consecutiveSixes: game.sixes,
        tripleSixPenalty: game.flightSettings?.tripleSix ?? 'all',
        tripleSixDescription:
          'On a third consecutive six, end the turn and return all unfinished planes or the unfinished plane with greatest progress (lowest index breaks ties), per tripleSixPenalty. Finished planes stay finished.',
        rankings: game.rankings ?? [],
        withdrawn: game.withdrawn ?? [],
        planes: describePlanes(game),
        counts: planeCounts(game),
      },
      selectionPolicy:
        'Immediate game wins first. Otherwise all legal moves are offered; next-roll capture opportunities are not certain future losses.',
      analysisHorizon:
        'Exactly the next die roll and one legal move by its roller. No later rolls or later opponent turns are evaluated.',
      candidates,
    },
    questions: { move: moveQuestion(candidates, offered, AI_INSTRUCTIONS.flight) },
  };
}
