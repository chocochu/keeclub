import { expect, test } from 'bun:test';
import { buildMoveRequest } from '../server/ai-state';
import { applyMove, createGame, legalMoves, positionKey } from '../shared/game';
import { fixtures } from './fixtures/jungle-ai';
import { buildJungleAnalysis } from '../server/ai-lookahead';
import { filterAiMoves, moveIdentity, restrictedMoves } from '../server/ai-move-policy';

test('third directed move is removed only when an alternative exists', () => {
  const game = createGame('jungle');
  const legal = legalMoves(game);
  const key = moveIdentity(game, legal[0]);
  expect(restrictedMoves(game, { [key]: 1 })(game)).toContainEqual(legal[0]);
  expect(restrictedMoves(game, { [key]: 2 })(game)).not.toContainEqual(legal[0]);
  expect(restrictedMoves(game, { [key]: 2 })(game)).toHaveLength(legal.length - 1);
  const allRepeated = Object.fromEntries(legal.map((m) => [moveIdentity(game, m), 2]));
  expect(restrictedMoves(game, allRepeated)(game)).toEqual(legal);
});

function beforeOpeningRepetitionDraw() {
  let game = createGame('jungle');
  for (const id of ['0-7:5,8', '1-8:5,2', '0-7:6,8', '1-8:6,2', '0-7:5,8', '1-8:5,2', '0-7:6,8'])
    game = applyMove(game, id);
  return game;
}

test('blocks a real threefold-position draw even when the directed move was only played once', () => {
  const game = beforeOpeningRepetitionDraw();
  const repeat = legalMoves(game).find((m) => m.id === '1-8:6,2')!;
  expect(applyMove(game, repeat.id).winner).toBe('draw');
  const policy = filterAiMoves(game, { [moveIdentity(game, repeat)]: 1 });
  expect(policy.moves.length).toBeGreaterThan(0);
  expect(policy.moves).not.toContainEqual(repeat);
  expect(policy.drawMovesBlocked).toBeGreaterThan(0);
  expect(policy.unavoidableDraw).toBe(false);
  expect(policy.moves.every((m) => applyMove(game, m.id).winner !== 'draw')).toBe(true);
});

test('quiet-limit draws are excluded in favor of a capture that resets the clock', () => {
  const game = createGame('jungle');
  game.pieces = [
    { id: 'lion', side: 0, rank: 7, x: 0, y: 3 },
    { id: 'cat', side: 1, rank: 2, x: 3, y: 3 },
    { id: 'rat', side: 1, rank: 1, x: 6, y: 2 },
  ];
  game.quiet = 99;
  game.positions = { [positionKey(game)]: 1 };
  const capture = legalMoves(game).find((m) => m.id === 'lion:3,3')!;
  // Even if the only non-drawing move hits the old directed-move cap, play on.
  const policy = filterAiMoves(game, { [moveIdentity(game, capture)]: 2 });
  expect(policy.moves).toEqual([capture]);
  expect(policy.repeatRuleFallback).toBe(true);
  expect(applyMove(game, capture.id).quiet).toBe(0);
  expect(applyMove(game, capture.id).winner).toBeNull();
});

test('allows unavoidable draws and never filters an immediate win as a draw', () => {
  const game = createGame('jungle');
  game.quiet = 99;
  const policy = filterAiMoves(game, {});
  expect(policy.moves).toEqual(legalMoves(game));
  expect(policy.unavoidableDraw).toBe(true);
  expect(policy.drawMovesBlocked).toBe(0);
  const win = fixtures().find((f) => f.id === 'quiet-reset')!.game;
  const winningMove = legalMoves(win).find((m) => applyMove(win, m.id).winner === win.turn)!;
  expect(filterAiMoves(win, {}).moves).toContainEqual(winningMove);
  expect(filterAiMoves(win, {}).unavoidableDraw).toBe(false);
});

test('baseline and lookahead exclude the same draw, including at simulated replies', () => {
  let root = createGame('jungle');
  for (const id of ['0-7:5,8', '1-8:5,2', '0-7:6,8', '1-8:6,2', '0-7:5,8', '1-8:5,2'])
    root = applyMove(root, id);
  const enumerate = restrictedMoves(root, {});
  const after = applyMove(root, '0-7:6,8');
  expect(enumerate(after).map((m) => m.id)).not.toContain('1-8:6,2');
  const request = buildMoveRequest(root, 'test', enumerate);
  if (request.state.game !== 'jungle') throw new Error('Expected Jungle');
  expect(request.state.candidates['0-7:6,8'].opponentReplies.draws).toEqual([]);
  const game = beforeOpeningRepetitionDraw();
  const policy = restrictedMoves(game, {});
  const baseline = buildJungleAnalysis(game, 'test', 'baseline', 50_000, policy);
  const lookahead = buildJungleAnalysis(game, 'test', 'lookahead3', 50_000, policy);
  expect(lookahead.request.questions).toEqual(baseline.request.questions);
  expect(Object.keys(baseline.request.questions.move.criteria)).not.toContain('1-8:6,2');
});

test('forward and reverse moves have different identities', () => {
  const game = createGame('jungle');
  const move = legalMoves(game)[0];
  const start = game.pieces.find((p) => p.id === move.piece)!;
  let next = applyMove(game, move.id);
  next = applyMove(next, legalMoves(next)[0].id);
  const reverse = legalMoves(next).find(
    (m) => m.piece === move.piece && m.x === start.x && m.y === start.y,
  )!;
  expect(moveIdentity(next, reverse)).not.toBe(moveIdentity(game, move));
});

test('simulated own and opponent moves use played counts plus the branch history', () => {
  const game = createGame('jungle');
  const move = legalMoves(game)[0];
  const next = applyMove(game, move.id);
  const reply = legalMoves(next)[0];
  const counts = { [moveIdentity(game, move)]: 1, [moveIdentity(next, reply)]: 2 };
  const enumerate = restrictedMoves(game, counts);
  expect(enumerate(game)).toContainEqual(move);
  expect(enumerate(next)).not.toContainEqual(reply);
  const simulated = { ...game, ply: game.ply + 2, jungleHistory: next.jungleHistory };
  expect(enumerate(simulated)).not.toContainEqual(move);
  expect(counts[moveIdentity(game, move)]).toBe(1);
});

test('filter precedes immediate-win policy so banned wins do not hide legal alternatives', () => {
  const game = fixtures().find((f) => f.id === 'den-now')!.game;
  const win = legalMoves(game).find((m) => m.id === 'rat:3,0')!;
  const enumerate = restrictedMoves(game, { [moveIdentity(game, win)]: 2 });
  const normal = buildMoveRequest(game, 'test');
  expect(Object.keys(normal.questions.move.criteria)).toEqual(['rat:3,0']);
  const baseline = buildJungleAnalysis(game, 'test', 'baseline', 50_000, enumerate);
  const lookahead = buildJungleAnalysis(game, 'test', 'lookahead3', 50_000, enumerate);
  const offered = Object.keys(baseline.request.questions.move.criteria);
  expect(offered.length).toBeGreaterThan(0);
  expect(offered).not.toContain(win.id);
  expect(lookahead.request.questions).toEqual(baseline.request.questions);
});
