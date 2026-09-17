import { expect, test } from 'bun:test';
import { trackIndex } from '../shared/game';
import {
  AIRPORTS,
  AIRPORT_HEADINGS,
  FLIGHT_TILES,
  SIDE_COLOURS,
  flightPoint,
  flightHomePoint,
  flightHeading,
  planeHeading,
} from '../src/features/room/flight-board-geometry';

test('plane headings follow displacement in every direction', () => {
  expect(planeHeading([0, 0], [0, -1])).toBe(0);
  expect(planeHeading([0, 0], [1, 0])).toBe(90);
  expect(planeHeading([0, 0], [0, 1])).toBe(180);
  expect(planeHeading([0, 0], [-1, 0])).toBe(-90);
  expect(planeHeading([0, 0], [1, 1])).toBe(135);
});

test('opposite sides face along shortcuts and toward the centre in their home lanes', () => {
  expect(planeHeading(flightPoint(0, 18, 0), flightPoint(0, 30, 0))).toBeCloseTo(-90);
  expect(planeHeading(flightPoint(1, 18, 0), flightPoint(1, 30, 0))).toBeCloseTo(90);
  for (let progress = 50; progress <= 55; progress++) {
    expect(flightHeading(0, progress, 0)).toBe(180);
    expect(flightHeading(1, progress, 0)).toBe(0);
  }
});

test('classic board has 52 distinct track spaces and four airports', () => {
  expect(FLIGHT_TILES).toHaveLength(52);
  expect(new Set(FLIGHT_TILES.map((tile) => tile.center.join(','))).size).toBe(52);
  expect(AIRPORTS.map((airport) => airport.colour).sort()).toEqual([
    'blue',
    'green',
    'red',
    'yellow',
  ]);
  for (const tile of FLIGHT_TILES) {
    for (const [x, y] of [tile.center, ...tile.outline]) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(17);
      expect(y).toBeLessThanOrEqual(17);
    }
  }
});

test('painted jump spaces, shortcuts and home entrances agree with existing rules', () => {
  for (const side of [0, 1] as const) {
    for (let progress = 2; progress <= 50; progress += 4) {
      expect(FLIGHT_TILES[trackIndex(side, progress)].colour).toBe(SIDE_COLOURS[side]);
    }
    const start = flightPoint(side, 18, 0);
    const end = flightPoint(side, 30, 0);
    expect(start[1]).toBeCloseTo(end[1]);
    expect(Math.abs(start[0] - end[0])).toBeCloseTo(6);
    const entry = flightPoint(side, 50, 0);
    const home = flightPoint(side, 51, 0);
    expect(entry[0]).toBe(home[0]);
    expect(Math.abs(entry[1] - home[1])).toBe(1.5);
    expect(flightHomePoint(side, 56)).toEqual(side === 0 ? [8.5, 7.5] : [8.5, 9.5]);
    expect(flightPoint(side, 56, 0)).toEqual(flightPoint(side, -1, 0));
  }
});

test('tokens stay aligned with saved progress and four distinct hangar spaces', () => {
  for (const side of [0, 1] as const) {
    const hangar = Array.from({ length: 4 }, (_, index) => flightPoint(side, -1, index));
    expect(new Set(hangar.map((point) => point.join(','))).size).toBe(4);
    for (let progress = 1; progress <= 50; progress++) {
      expect(flightPoint(side, progress, 0)).toEqual(
        FLIGHT_TILES[trackIndex(side, progress)].center,
      );
    }
  }
});

test('airport headings reset and every track position faces its next cell', () => {
  for (const side of [0, 1] as const) {
    for (let index = 0; index < 4; index++) {
      expect(flightHeading(side, -1, index)).toBe(0);
      expect(flightHeading(side, -1, index)).toBe(AIRPORT_HEADINGS[SIDE_COLOURS[side]]);
    }
    for (let progress = 0; progress < 56; progress++) {
      const from = flightPoint(side, progress, 0);
      const next = progress === 55 ? flightHomePoint(side, 56) : flightPoint(side, progress + 1, 0);
      const radians = (flightHeading(side, progress, 0) * Math.PI) / 180;
      const distance = Math.hypot(next[0] - from[0], next[1] - from[1]);
      expect(Math.sin(radians)).toBeCloseTo((next[0] - from[0]) / distance);
      expect(-Math.cos(radians)).toBeCloseTo((next[1] - from[1]) / distance);
    }
  }
});
