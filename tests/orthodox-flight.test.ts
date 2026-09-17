import { expect, test } from 'bun:test';
import {
  applyMove,
  createGame,
  flightMovePath,
  legalMoves,
  rollDice,
  trackIndex,
  type Side,
} from '../shared/game';
import { RoomService } from '../server/rooms/service';
import {
  flightPoint,
  flightHomePoint,
  FLIGHT_TILES,
} from '../src/features/room/flight-board-geometry';
import { flightScenes } from '../src/features/room/flight-playback';

test('separate launch pad leaves two shared cells unreachable for every colour', () => {
  for (const side of [0, 1, 2, 3] as Side[]) {
    expect(FLIGHT_TILES.some((tile) => tile.center.join() === flightPoint(side, 0, 0).join())).toBe(
      false,
    );
    const reachable = new Set(Array.from({ length: 50 }, (_, i) => trackIndex(side, i + 1)));
    expect(reachable.size).toBe(50);
    expect(reachable.has(trackIndex(side, 0))).toBe(false);
    expect(reachable.has(trackIndex(side, 51))).toBe(false);
  }
});

test('direct shortcut captures all dice/bonus landing stacks and the home crossing', () => {
  const start = createGame('flight');
  start.planes = [
    [16, -1, -1, -1],
    [44, 4, 8, 53],
  ];
  const after = applyMove(rollDice(start, 2), 'plane-0');
  expect(after.planes).toEqual([
    [34, -1, -1, -1],
    [-1, -1, -1, -1],
  ]);
  expect(
    after.lastFlight?.steps.filter((step) => step.kind === 'capture').map((step) => step.progress),
  ).toEqual([18, 30, 34]);
});

test('jumping into a shortcut stops at 30 and never captures a plane at 34', () => {
  const start = createGame('flight');
  start.planes = [
    [12, -1, -1, -1],
    [40, 44, 4, 8],
  ];
  const after = applyMove(rollDice(start, 2), 'plane-0');
  expect(after.planes).toEqual([
    [30, -1, -1, -1],
    [-1, -1, -1, 8],
  ]);
});

test('ordinary passed cells do not capture, but all enemies at a landing do', () => {
  const start = createGame('flight', { tripleSix: 'all', playerCount: 4 });
  start.planes[0][0] = 0;
  start.planes[1][0] = 27;
  start.planes[2] = [42, 42, -1, -1]; // yellow offset 13, progress 42 = red cell 3
  const after = applyMove(rollDice(start, 3), 'plane-0');
  expect(after.planes[1][0]).toBe(27);
  expect(after.planes[2]).toEqual([-1, -1, -1, -1]);
});

test('bounce travels the remaining dice steps and does not finish at an intermediate touch', () => {
  expect(flightMovePath(54, 5)).toEqual([55, 56, 55, 54, 53]);
  const start = createGame('flight');
  start.planes[0] = [56, 56, 56, 54];
  const after = applyMove(rollDice(start, 5), 'plane-3');
  expect(after.planes[0][3]).toBe(53);
  expect(after.winner).toBeNull();
  expect(after.lastFlight?.steps.some((step) => step.kind === 'finish')).toBe(false);
});

test('third six all-mode preserves completed planes and returns every unfinished plane', () => {
  const start = createGame('flight');
  start.planes[0] = [56, 55, 0, -1];
  start.sixes = 2;
  const after = rollDice(start, 6);
  expect(after.planes[0]).toEqual([56, -1, -1, -1]);
  expect(after.turn).toBe(1);
  expect(legalMoves(after)).toEqual([]);
  expect(flightScenes(start, after)!.map((scene) => scene.phase)).toContain('return');
});

test('third six closest-mode automatically picks greatest unfinished progress and stable ties', () => {
  const start = createGame('flight', { tripleSix: 'closest', playerCount: 2 });
  start.planes[0] = [56, 55, 55, 34];
  start.sixes = 2;
  const after = rollDice(start, 6);
  expect(after.planes[0]).toEqual([56, -1, 55, 34]);
  expect(after.lastFlight?.piece).toBe(1);
  expect(after.turn).toBe(1);
  expect(legalMoves(after)).toEqual([]);
});

test('four players take clockwise turns, finished players are skipped and rankings continue', () => {
  let game = createGame('flight', { tripleSix: 'all', playerCount: 4 });
  const turns = [];
  for (let n = 0; n < 4; n++) {
    turns.push(game.turn);
    game = rollDice(game, 1);
  }
  expect(turns).toEqual([0, 2, 1, 3]);
  for (const side of [0, 2, 1] as Side[]) {
    expect(game.turn).toBe(side);
    game.planes[side] = [56, 56, 56, 55];
    game = applyMove(rollDice(game, 1), 'plane-3');
    if (side !== 1) expect(game.winner).toBeNull();
  }
  expect(game.rankings).toEqual([0, 2, 1, 3]);
  expect(game.winner).toBe(0);
});

test('all four shortcut lines cross exactly the opposing middle home-lane centre', () => {
  for (const side of [0, 1, 2, 3] as Side[]) {
    const opposite = (side === 0 ? 1 : side === 1 ? 0 : side === 2 ? 3 : 2) as Side;
    const start = flightPoint(side, 18, 0);
    const end = flightPoint(side, 30, 0);
    const crossing = flightHomePoint(opposite, 53);
    expect(
      (end[0] - start[0]) * (crossing[1] - start[1]) -
        (end[1] - start[1]) * (crossing[0] - start[0]),
    ).toBeCloseTo(0);
    expect(crossing[0]).toBeGreaterThanOrEqual(Math.min(start[0], end[0]));
    expect(crossing[0]).toBeLessThanOrEqual(Math.max(start[0], end[0]));
    expect(crossing[1]).toBeGreaterThanOrEqual(Math.min(start[1], end[1]));
    expect(crossing[1]).toBeLessThanOrEqual(Math.max(start[1], end[1]));
  }
});

test('room settings default, four-seat authorization and rematch setting retention', () => {
  const service = new RoomService({ apiKey: '' });
  const first = service.create({
    kind: 'flight',
    mode: 'friend',
    name: 'Host',
    flightSettings: { tripleSix: 'closest', playerCount: 4 },
  });
  expect(first.room.ready).toBe(false);
  for (const side of [1, 2, 3] as const) {
    const joined = service.join(first.room.code, `Guest ${side}`);
    expect(joined.room.side).toBe(side);
    expect(service.authorize(first.room.code, joined.token).side).toBe(side);
    expect(joined.room.ready).toBe(side === 3);
  }
  const saved = service.get(first.room.code);
  saved.game.winner = 0;
  for (const side of [0, 1, 2, 3] as Side[]) service.act(saved, side, { type: 'rematch' });
  expect(saved.game.flightSettings).toEqual({ tripleSix: 'closest', playerCount: 4 });
  expect(saved.game.planes).toHaveLength(4);
  expect(
    service.create({ kind: 'flight', mode: 'local', name: 'Default' }).room.game.flightSettings
      ?.tripleSix,
  ).toBe('all');
});

test('a finished player receiving a rank after six is not mislabeled as a three-six penalty', () => {
  const start = createGame('flight', { tripleSix: 'all', playerCount: 4 });
  start.planes[0] = [56, 56, 56, 50];
  const after = applyMove(rollDice(start, 6), 'plane-3');
  expect(after.rankings).toEqual([0]);
  expect(after.sixPenalty).toBe(false);
  expect(after.sixes).toBe(0);
});

test('four-player AI completes each non-human turn without a manual retry', async () => {
  const service = new RoomService({
    apiKey: 'test',
    dice: () => 1,
    choose: async (game) => legalMoves(game)[0],
  });
  const session = service.create({
    kind: 'flight',
    mode: 'ai',
    name: 'Human',
    flightSettings: { tripleSix: 'closest', playerCount: 4 },
  });
  const state = service.get(session.room.code);
  service.act(state, 0, { type: 'roll', revision: state.revision });
  for (let i = 0; state.thinking && i < 20; i++) await Bun.sleep(1);
  expect(state.game.turn).toBe(0);
  expect(state.game.rollCount).toBe(4);
  expect(state.aiError).toBeNull();
});
