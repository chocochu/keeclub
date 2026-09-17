import { expect, test } from 'bun:test';
import { buildMoveRequest } from '../server/ai-state';
import { chooseMove } from '../server/ai';
import {
  applyMove,
  createGame,
  legalMoves,
  positionKey,
  other,
  rollDice,
  type Game,
} from '../shared/game';

function jungleState(game: Game) {
  const request = buildMoveRequest(game, 'jev-latest');
  if (request.state.game !== 'jungle') throw new Error('Expected Jungle');
  return request.state;
}
function flightState(game: Game) {
  const request = buildMoveRequest(game, 'jev-latest');
  if (request.state.game !== 'flight') throw new Error('Expected Aeroplane');
  return request.state;
}

function threatenedDen() {
  const game = createGame('jungle');
  game.pieces = [
    { id: 'dog', side: 0, rank: 3, x: 3, y: 6 },
    { id: 'cat', side: 0, rank: 2, x: 4, y: 7 },
    { id: 'attacker', side: 1, rank: 2, x: 3, y: 7 },
    { id: 'rat', side: 1, rank: 1, x: 0, y: 0 },
  ];
  return game;
}

test('Jungle distinguishes quiet history and exposes opponent drawing replies', () => {
  const early = createGame('jungle');
  const near = { ...early, quiet: 98 };
  const earlyState = jungleState(early);
  const nearState = jungleState(near);
  expect(earlyState).not.toEqual(nearState);
  const id = legalMoves(near)[0].id;
  expect(nearState.position.draw.quietHalfMoves).toBe(98);
  expect(nearState.candidates[id].draw.quietHalfMoves).toBe(99);
  expect(nearState.candidates[id].opponentReplies.draws).toHaveLength(24);
  expect(earlyState.candidates[id].opponentReplies.draws).toHaveLength(0);
  const terminal = jungleState({ ...early, quiet: 99 }).candidates[id];
  expect(terminal.winner).toBe('draw');
  expect(terminal.nextPlayer).toBeNull();
  expect(terminal.opponentReplies.count).toBe(0);
});

test('Jungle reports repetition outcomes without transmitting private logs or full history', () => {
  const game = createGame('jungle');
  const id = legalMoves(game)[0].id;
  const next = applyMove(game, id);
  game.positions[positionKey(next)] = 2;
  game.log = ['private player log'];
  const state = jungleState(game);
  expect(state.candidates[id].winner).toBe('draw');
  expect(state.candidates[id].draw.positionOccurrences).toBe(3);
  expect(JSON.stringify(state)).not.toContain('private player log');
  expect(state.position).not.toHaveProperty('positions');
});

test('Jungle supplies terrain ownership and engine effective strength after leaving a trap', () => {
  const game = createGame('jungle');
  game.pieces = [
    { id: 'elephant', side: 0, rank: 8, x: 2, y: 0 },
    { id: 'cat', side: 1, rank: 2, x: 6, y: 2 },
  ];
  const state = jungleState(game);
  expect(state.board.rivers).toHaveLength(12);
  expect(state.board.traps).toHaveLength(6);
  expect(state.board.dens).toContainEqual({ x: 3, y: 8, owner: 0 });
  expect(state.position.pieces[0]).toMatchObject({
    animal: 'Elephant',
    effectiveRank: 0,
    trapOwner: 1,
  });
  expect(state.candidates['elephant:2,1'].movedPiece).toMatchObject({
    effectiveRank: 8,
    trapOwner: null,
  });
  expect(state).not.toHaveProperty('planes');
});

test('Jungle reports a river jump capture and a rat blocking that jump', () => {
  const game = createGame('jungle');
  game.pieces = [
    { id: 'lion', side: 0, rank: 7, x: 0, y: 3 },
    { id: 'cat', side: 1, rank: 2, x: 3, y: 3 },
    { id: 'rat', side: 1, rank: 1, x: 6, y: 2 },
  ];
  expect(jungleState(game).candidates['lion:3,3'].captured).toMatchObject([
    { id: 'cat', animal: 'Cat' },
  ]);
  game.pieces[2] = { id: 'rat', side: 1, rank: 1, x: 1, y: 3 };
  const blocked = jungleState(game);
  expect(blocked.candidates).not.toHaveProperty('lion:3,3');
  expect(blocked.position.pieces[2].terrain).toBe('river');
});

test('code offers immediate Jungle wins before strategic alternatives', async () => {
  for (const side of [0, 1] as const) {
    const game = createGame('jungle');
    game.turn = side;
    game.pieces = [
      { id: 'rat', side, rank: 1, x: 3, y: side === 0 ? 1 : 7 },
      { id: 'cat', side: side === 0 ? 1 : 0, rank: 2, x: 6, y: 4 },
    ];
    const expected = `rat:3,${side === 0 ? 0 : 8}`;
    expect(Object.keys(buildMoveRequest(game, 'jev-latest').questions.move.criteria)).toEqual([
      expected,
    ]);
    expect(
      (
        await chooseMove(game, '', 'jev-latest', async () => {
          throw new Error('Must not call API');
        })
      ).id,
    ).toBe(expected);
  }
});

test('Jungle avoids immediate losses and rejects a legal but excluded provider choice', async () => {
  const game = threatenedDen();
  const request = buildMoveRequest(game, 'jev-latest');
  expect(Object.keys(request.questions.move.criteria).sort()).toEqual(['cat:3,7', 'dog:3,7']);
  expect(jungleState(game).candidates['dog:2,6'].opponentReplies.immediateWins).toContain(
    'attacker:3,8',
  );
  await expect(
    chooseMove(game, 'key', 'jev-latest', async () =>
      Response.json({
        answers: { move: { type: 'choice', choice: 'dog:2,6' } },
      }),
    ),
  ).rejects.toThrow('有效步法');
});

test('Jungle still offers moves when every candidate permits an immediate loss', () => {
  const game = threatenedDen();
  game.pieces = game.pieces.filter((p) => p.side === 1);
  game.pieces.push({ id: 'cat', side: 0, rank: 2, x: 0, y: 6 });
  expect(Object.keys(buildMoveRequest(game, 'jev-latest').questions.move.criteria)).toHaveLength(
    legalMoves(game).length,
  );
});

test('Aeroplane distinguishes the first and second six and identifies the extra-turn roller', () => {
  const first = rollDice(createGame('flight'), 6);
  const second = { ...first, sixes: 2 };
  const before = structuredClone(second);
  const a = flightState(first);
  const b = flightState(second);
  expect(a.position.consecutiveSixes).toBe(1);
  expect(b.position.consecutiveSixes).toBe(2);
  expect(b.candidates['plane-0']).toMatchObject({
    extraRoll: true,
    nextPlayer: 0,
    consecutiveSixes: 2,
  });
  expect(a.candidates['plane-0'].nextRolls[5]).toMatchObject({
    roller: 0,
    forfeitedThirdSix: false,
    nextPlayer: 0,
  });
  expect(a.candidates['plane-0'].nextRolls[5].moves).toHaveLength(4);
  expect(b.candidates['plane-0'].nextRolls[5]).toMatchObject({
    roller: 0,
    forfeitedThirdSix: true,
    nextPlayer: 1,
    moves: [],
  });
  expect(second).toEqual(before);
});

test('Aeroplane exposes next-roll captures for either side without claiming a probability', () => {
  for (const side of [0, 1] as const) {
    const game = createGame('flight');
    game.turn = side;
    game.planes[side] = [0, 10, -1, -1];
    game.planes[1 - side] = [26, -1, -1, -1];
    const candidate = flightState(rollDice(game, 1)).candidates['plane-0'];
    expect(candidate.nextRolls[0].roller).toBe(other(side));
    expect(candidate.nextRolls[0].moves[0]).toMatchObject({
      moveId: 'plane-0',
      capturedPlaneIds: [`${side}-0`],
    });
    expect(candidate).not.toHaveProperty('opponentCaptures');
    expect(candidate).not.toHaveProperty('captureProbability');
  }
});

test('Aeroplane reports stacked captures, safe-lane entry, and exact finishes', () => {
  const game = createGame('flight');
  game.planes = [
    [0, 50, 55, -1],
    [27, 27, -1, -1],
  ];
  const state = flightState(rollDice(game, 1));
  expect(state.candidates['plane-0'].captured.map((p) => p.id)).toEqual(['1-0', '1-1']);
  expect(state.candidates['plane-0'].counts[1].hangar).toBe(4);
  expect(state.candidates['plane-1'].movedPlane).toMatchObject({
    zone: 'home-lane',
    sharedCell: null,
    remainingProgressToFinish: 5,
  });
  expect(state.candidates['plane-2']).toMatchObject({
    finishesPlane: true,
    counts: [
      { side: 0, finished: 1 },
      { side: 1, finished: 0 },
    ],
  });
  expect(state.candidates['plane-2'].movedPlane).toMatchObject({
    zone: 'finished',
    remainingProgressToFinish: 0,
  });
  expect(state.position).not.toHaveProperty('pieces');
});

test('Aeroplane describes jump-plus-shortcut progress and rolls with no legal moves', () => {
  const game = createGame('flight');
  game.planes[0] = [12, 55, -1, -1];
  const candidate = flightState(rollDice(game, 2)).candidates['plane-0'];
  expect(candidate).toMatchObject({ bonusProgress: 16, movedPlane: { progress: 30 } });
  expect(candidate.nextRolls[0]).toMatchObject({ roller: 1, nextPlayer: 0, moves: [] });
});

test('Aeroplane immediate win is selected and has no hypothetical next rolls', async () => {
  const game = createGame('flight');
  game.planes[0] = [55, 56, 56, 56];
  const pending = rollDice(game, 1);
  const candidate = flightState(pending).candidates['plane-0'];
  expect(candidate).toMatchObject({ winner: 0, nextPlayer: null, extraRoll: false, nextRolls: [] });
  expect((await chooseMove(pending, '', 'jev-latest')).id).toBe('plane-0');
});
