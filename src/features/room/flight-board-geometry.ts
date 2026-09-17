import { trackIndex, FLIGHT_QUARTERS } from '../../../shared/game';
import type { Side } from '../../../shared/contracts';

export type Point = readonly [number, number];
export type BoardColour = 'red' | 'yellow' | 'green' | 'blue';
type Tile = { center: Point; outline: Point[] };

export const BOARD_SIZE = 17;
export const COLOURS: Record<BoardColour, string> = {
  red: '#e98072',
  yellow: '#efd16e',
  green: '#6cbb9a',
  blue: '#80b9df',
};
export const PIECE_COLOURS = ['#ad302b', '#086b50', '#96620c', '#23628e'] as const;
export const SIDE_COLOURS = ['red', 'green', 'yellow', 'blue'] as const;
export const AIRPORT_HEADINGS: Record<BoardColour, number> = {
  red: 0,
  green: 0,
  yellow: 90,
  blue: 90,
};

export function rotate([x, y]: Point, turns: number): Point {
  for (let i = 0; i < turns; i++) [x, y] = [BOARD_SIZE - y, x];
  return [x, y];
}

const rectangle = (x: number, y: number, width: number, height: number): Tile => ({
  center: [x + width / 2, y + height / 2],
  outline: [
    [x, y],
    [x + width, y],
    [x + width, y + height],
    [x, y + height],
  ],
});
const triangle = (a: Point, b: Point, c: Point): Tile => ({
  center: [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3],
  outline: [a, b, c],
});

// One quarter of the classic cross-shaped track, starting beside the red airport.
const QUARTER: Tile[] = [
  rectangle(10, 0, 1, 2),
  triangle([11, 0], [13, 2], [11, 2]),
  rectangle(11, 2, 2, 1),
  rectangle(11, 3, 2, 1),
  triangle([11, 4], [13, 4], [11, 6]),
  triangle([13, 4], [13, 6], [11, 6]),
  rectangle(13, 4, 1, 2),
  rectangle(14, 4, 1, 2),
  triangle([15, 4], [17, 6], [15, 6]),
  rectangle(15, 6, 2, 1),
  rectangle(15, 7, 2, 1),
  rectangle(15, 8, 2, 1),
  rectangle(15, 9, 2, 1),
];
export const FLIGHT_TILES = Array.from({ length: 52 }, (_, index) => {
  const tile = QUARTER[index % 13];
  const turns = Math.floor(index / 13);
  return {
    center: rotate(
      index % 13 === 4 ? [11.5, 4.5] : index % 13 === 5 ? [12.5, 5.5] : tile.center,
      turns,
    ),
    outline: tile.outline.map((point) => rotate(point, turns)),
    colour: (['green', 'blue', 'red', 'yellow'] as const)[index % 4],
  };
});

export const AIRPORTS = [
  { colour: 'red', x: 13.15, y: 0, side: 0 },
  { colour: 'yellow', x: 13.15, y: 13.15 },
  { colour: 'green', x: 0, y: 13.15, side: 1 },
  { colour: 'blue', x: 0, y: 0 },
] as const;

export function hangarPoint(colour: BoardColour, index: number): Point {
  const airport = AIRPORTS.find((item) => item.colour === colour)!;
  return [airport.x + 1 + (index % 2) * 1.85, airport.y + 1 + Math.floor(index / 2) * 1.85];
}

/** Keep persisted progress and all game rules independent of the SVG's geometry. */
export function flightPoint(side: Side, progress: number, index: number): Point {
  if (progress === -1 || progress === 56) return hangarPoint(SIDE_COLOURS[side], index);
  if (progress === 0) return rotate([12.55, 0.65], FLIGHT_QUARTERS[side]);
  if (progress >= 51) return flightHomePoint(side, progress);
  return FLIGHT_TILES[trackIndex(side, progress)].center;
}

export function flightHomePoint(side: Side, progress: number): Point {
  return rotate([8.5, 2.5 + progress - 51], FLIGHT_QUARTERS[side]);
}

/** Plane artwork points north at zero degrees; SVG's y axis points down. */
export function planeHeading(from: Point, to: Point): number {
  return (Math.atan2(to[0] - from[0], from[1] - to[1]) * 180) / Math.PI;
}

export function flightHeading(side: Side, progress: number, index: number): number {
  if (progress === -1) return AIRPORT_HEADINGS[SIDE_COLOURS[side]];
  if (progress === 56) return AIRPORT_HEADINGS[SIDE_COLOURS[side]] + 180;
  const from = flightPoint(side, Math.min(progress, 55), index);
  const to = progress === 55 ? flightHomePoint(side, 56) : flightPoint(side, progress + 1, index);
  return planeHeading(from, to);
}

export const polygonPoints = (points: readonly Point[]) => points.map((p) => p.join(',')).join(' ');
