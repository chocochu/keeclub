import { expect, test } from 'bun:test';
import { buildMoveRequest } from '../server/ai-state';
import { applyMove, createGame, legalMoves, other, positionKey, type Game } from '../shared/game';
import { fixtures, mirrorGame } from './fixtures/jungle-ai';
import { analyzeCandidate, buildJungleAnalysis } from '../server/ai-lookahead';

test('baseline preserves the original request and lookahead preserves its question and options', () => {
  const game = fixtures().find((f) => f.id === 'den-vs-bait')!.game;
  const snapshot = structuredClone(game);
  const production = buildMoveRequest(game, 'test-model');
  expect(buildJungleAnalysis(game, 'test-model', 'baseline').request).toEqual(production);
  const experiment = buildJungleAnalysis(game, 'test-model', 'lookahead3');
  expect(experiment.request.questions).toEqual(production.questions);
  const { lookahead, ...state } = experiment.request.state as typeof production.state & {
    lookahead: unknown;
  };
  expect(lookahead).toBeDefined();
  expect(state).toEqual(production.state);
  expect(JSON.stringify(experiment.request)).not.toContain('acceptableMoves');
  expect(JSON.stringify(experiment.request)).not.toContain('objective');
  expect(game).toEqual(snapshot);
});

test('authored labels are legal and offered; mirrored histories and labels preserve outcomes', () => {
  const all = fixtures();
  expect(new Set(all.map((f) => f.id)).size).toBe(all.length);
  for (const fixture of all) {
    const offered = new Set(
      Object.keys(buildMoveRequest(fixture.game, 'test').questions.move.criteria),
    );
    for (const id of fixture.acceptableMoves ?? []) expect(offered.has(id)).toBe(true);
    expect(fixture.game.positions[positionKey(fixture.game)]).toBeGreaterThan(0);
    const twice = mirrorGame(mirrorGame(fixture.game));
    expect(twice.pieces).toEqual(fixture.game.pieces);
    expect(twice.positions).toEqual(fixture.game.positions);
    expect(twice.jungleHistory).toEqual(fixture.game.jungleHistory);
  }
  for (const id of ['repetition-draw', 'repetition-draw-mirrored']) {
    const fixture = all.find((f) => f.id === id)!;
    const move = id.endsWith('mirrored') ? 'cat:3,7' : 'cat:3,1';
    expect(applyMove(fixture.game, move).winner).toBe('draw');
    const result = analyzeCandidate(
      fixture.game,
      legalMoves(fixture.game).find((m) => m.id === move)!,
      1000,
    );
    expect(result.complete && result.forcedWinWithinThreePlies).toBe(false);
  }
});

// A terminal-only oracle: no material score is used to judge forced wins.
function canForceWin(game: Game, side: Game['turn'], depth: number): boolean {
  if (game.winner !== null) return game.winner === side;
  if (depth === 0) return false;
  const outcomes = legalMoves(game).map((m) => canForceWin(applyMove(game, m.id), side, depth - 1));
  return game.turn === side
    ? outcomes.some(Boolean)
    : outcomes.length > 0 && outcomes.every(Boolean);
}

test('three-ply forced wins agree with a terminal-only oracle for both sides and draw histories', () => {
  for (const fixture of fixtures()) {
    for (const move of legalMoves(fixture.game)) {
      const result = analyzeCandidate(fixture.game, move, 5000);
      expect(result.complete).toBe(true);
      if (!result.complete) throw new Error('Unexpected truncation');
      expect(result.forcedWinWithinThreePlies).toBe(
        canForceWin(applyMove(fixture.game, move.id), fixture.game.turn, 2),
      );
      let replay = fixture.game;
      expect(result.worstCase.line.length).toBeLessThanOrEqual(3);
      for (const step of result.worstCase.line) replay = applyMove(replay, step.id);
      expect(replay.winner).toBe(result.worstCase.winner);
    }
  }
});

test('three-ply evidence proves the labeled den plans but does not confuse existential wins with forced wins', () => {
  const all = fixtures();
  for (const id of ['den-in-three', 'den-vs-bait', 'side-den-approach']) {
    const fixture = all.find((f) => f.id === id)!;
    const winning = legalMoves(fixture.game).filter((move) => {
      const result = analyzeCandidate(fixture.game, move, 5000);
      return result.complete && result.forcedWinWithinThreePlies;
    });
    expect(winning.map((m) => m.id).sort()).toEqual([...fixture.acceptableMoves!].sort());
  }
  const game = structuredClone(all.find((f) => f.id === 'den-in-three')!.game);
  // A defender can capture the cat in the enemy trap; unrelated replies still lose.
  game.pieces.push({ id: 'defender', rank: 1, side: other(game.turn), x: 2, y: 1 });
  game.positions = { [positionKey(game)]: 1 };
  const result = analyzeCandidate(
    game,
    legalMoves(game).find((m) => m.id === 'cat:3,1')!,
    5000,
  );
  expect(result.complete).toBe(true);
  if (result.complete) {
    expect(result.repliesAllowingOurImmediateWin).toBeGreaterThan(0);
    expect(result.forcedWinWithinThreePlies).toBe(false);
  }
});

test('node exhaustion never emits a partial proof or score and total nodes stay bounded', () => {
  const game = createGame('jungle');
  const result = analyzeCandidate(game, legalMoves(game)[0], 1);
  expect(result).toEqual({
    complete: false,
    nodes: 1,
    reason: 'Per-candidate node budget exhausted',
  });
  expect(result).not.toHaveProperty('worstCase');
  expect(result).not.toHaveProperty('forcedWinWithinThreePlies');
  const built = buildJungleAnalysis(game, 'test', 'lookahead3', 10);
  expect(built.nodes).toBeLessThanOrEqual(10);
  expect(built.incompleteCandidates).toBeGreaterThan(0);
});
