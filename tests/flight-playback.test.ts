import { expect, test } from 'bun:test';
import { applyMove, createGame, flightMovePath, rollDice } from '../shared/game';
import { flightFrames } from '../src/features/room/flight-playback';

test('dice steps visit every cell before colour jumps and shortcuts', () => {
  expect(flightMovePath(0, 5)).toEqual([1, 2, 3, 4, 5]);
  expect(flightMovePath(3, 3)).toEqual([4, 5, 6, 10]);
  expect(flightMovePath(12, 2)).toEqual([13, 14, 18, 30]);
  expect(flightMovePath(16, 2)).toEqual([17, 18, 30, 34]);
  expect(flightMovePath(17, 2)).toEqual([18, 19]);
  expect(flightMovePath(-1, 6)).toEqual([0]);
  expect(flightMovePath(-1, 5)).toEqual([]);
  expect(flightMovePath(50, 6)).toEqual([51, 52, 53, 54, 55, 56]);
  expect(flightMovePath(54, 3)).toEqual([55, 56, 55]);
  expect(flightMovePath(56, 1)).toEqual([]);
});

test('playback follows each side and defers captures until the final landing', () => {
  for (const side of [0, 1] as const) {
    const start = createGame('flight');
    start.turn = side;
    start.planes[side][0] = 0;
    start.planes[1 - side][0] = 31; // Same shared cell as this side's progress 5.
    const before = rollDice(start, 5);
    const after = applyMove(before, 'plane-0');
    const frames = flightFrames(before, after)!;
    expect(frames.map((planes) => planes[side][0])).toEqual([1, 2, 3, 4, 5, 5]);
    expect(frames.slice(0, -1).every((planes) => planes[1 - side][0] === 31)).toBe(true);
    expect(frames.at(-1)).toEqual(after.planes);
    expect(before.planes[side][0]).toBe(0);
  }
});

test('restored positions and rematches snap; non-move updates do not replay', () => {
  const before = rollDice(createGame('flight'), 6);
  const after = applyMove(before, 'plane-0');
  expect(flightFrames(before, after)).toEqual([after.planes]);
  expect(flightFrames(after, rollDice(after, 2))).toEqual([]);
  expect(flightFrames(after, createGame('flight'))).toBeNull();
  expect(flightFrames(before, { ...after, ply: after.ply + 1 })).toBeNull();
});
