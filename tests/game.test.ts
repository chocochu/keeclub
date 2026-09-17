import { describe, expect, test } from 'bun:test';
import {
  applyMove,
  createGame,
  legalMoves,
  rollDice,
  TRACK,
  trackIndex,
  type Game,
  type Piece,
} from '../shared/game';
const piece = (id: string, side: 0 | 1, rank: number, x: number, y: number): Piece => ({
  id,
  side,
  rank,
  x,
  y,
});
function jungle(pieces: Piece[], turn: 0 | 1 = 0): Game {
  return { ...createGame('jungle'), pieces, turn };
}
const has = (g: Game, id: string, x: number, y: number) =>
  legalMoves(g).some((m) => m.piece === id && m.x === x && m.y === y);

describe('Jungle rules', () => {
  test('sets up 16 distinct pieces and only permits the current side', () => {
    const g = createGame('jungle');
    expect(g.pieces).toHaveLength(16);
    expect(new Set(g.pieces.map((p) => `${p.x},${p.y}`)).size).toBe(16);
    expect(legalMoves(g).every((m) => m.piece.startsWith('0-'))).toBe(true);
    expect(() => applyMove(g, '1-7:1,0')).toThrow();
    const next = applyMove(g, legalMoves(g)[0].id);
    expect(next.turn).toBe(1);
    expect(g.ply).toBe(0);
  });
  test('rat captures elephant but elephant cannot capture rat', () => {
    const g = jungle([piece('rat', 0, 1, 0, 2), piece('elephant', 1, 8, 0, 1)]);
    expect(has(g, 'rat', 0, 1)).toBe(true);
    g.turn = 1;
    expect(has(g, 'elephant', 0, 2)).toBe(false);
  });
  test('rank and friendly occupancy prevent illegal captures', () => {
    const g = jungle([
      piece('cat', 0, 2, 0, 2),
      piece('dog', 1, 3, 0, 1),
      piece('rat', 0, 1, 1, 2),
    ]);
    expect(has(g, 'cat', 0, 1)).toBe(false);
    expect(has(g, 'cat', 1, 2)).toBe(false);
  });
  test('only rats enter water and cannot capture across a bank', () => {
    const g = jungle([
      piece('rat', 0, 1, 1, 3),
      piece('enemy', 1, 1, 1, 2),
      piece('cat', 0, 2, 2, 2),
    ]);
    expect(has(g, 'rat', 1, 2)).toBe(false);
    expect(has(g, 'rat', 2, 3)).toBe(true);
    expect(has(g, 'cat', 2, 3)).toBe(false);
    g.turn = 1;
    expect(has(g, 'enemy', 1, 3)).toBe(false);
  });
  test('rats capture each other in water', () => {
    expect(has(jungle([piece('a', 0, 1, 1, 3), piece('b', 1, 1, 2, 3)]), 'a', 2, 3)).toBe(true);
  });
  test('lion jumps river but either side rat blocks its path', () => {
    const g = jungle([piece('lion', 0, 7, 0, 3), piece('cat', 1, 2, 3, 3)]);
    expect(has(g, 'lion', 3, 3)).toBe(true);
    for (const side of [0, 1] as const) {
      g.pieces.push(piece('rat', side, 1, 1, 3));
      expect(has(g, 'lion', 3, 3)).toBe(false);
      g.pieces.pop();
    }
  });
  test('vertical jumps end on the far bank and obey rank', () => {
    const g = jungle([piece('tiger', 0, 6, 1, 6), piece('lion', 1, 7, 1, 2)]);
    expect(has(g, 'tiger', 1, 2)).toBe(false);
    g.pieces[1].rank = 3;
    expect(has(g, 'tiger', 1, 2)).toBe(true);
  });
  test('enemy traps weaken defenders and attackers; own traps do not', () => {
    const g = jungle([piece('cat', 0, 2, 2, 7), piece('elephant', 1, 8, 2, 8)]);
    expect(has(g, 'cat', 2, 8)).toBe(true);
    g.turn = 1;
    expect(has(g, 'elephant', 2, 7)).toBe(false);
    g.pieces[1].side = 0;
    g.pieces[0].side = 1;
    g.turn = 1;
    expect(has(g, 'cat', 2, 8)).toBe(false);
  });
  test('cannot enter own den, and enemy den ends the game', () => {
    const g = jungle([piece('rat', 0, 1, 3, 1), piece('cat', 1, 2, 6, 2)]);
    expect(applyMove(g, 'rat:3,0').winner).toBe(0);
    g.pieces[0].y = 7;
    expect(has(g, 'rat', 3, 8)).toBe(false);
  });
  test('capturing final opponent wins', () => {
    const g = jungle([piece('lion', 0, 7, 0, 3), piece('cat', 1, 2, 3, 3)]);
    expect(applyMove(g, 'lion:3,3').winner).toBe(0);
  });
  test('immobilized opponent loses', () => {
    const g = jungle([
      piece('rat', 1, 1, 0, 0),
      piece('cat', 0, 2, 1, 0),
      piece('dog', 0, 3, 0, 1),
      piece('lion', 0, 7, 6, 8),
    ]);
    expect(applyMove(g, 'lion:6,7').winner).toBe(0);
  });
  test('100 non-capturing half-moves is a draw', () => {
    const g = createGame('jungle');
    g.quiet = 99;
    expect(applyMove(g, legalMoves(g)[0].id).winner).toBe('draw');
  });
  test('threefold repetition draws without permitting endless loops', () => {
    let g = jungle([piece('cat', 0, 2, 0, 6), piece('dog', 1, 3, 6, 2)]);
    const sequence = ['cat:0,5', 'dog:6,3', 'cat:0,6', 'dog:6,2'];
    for (let i = 0; i < 3 && g.winner === null; i++)
      for (const move of sequence) {
        if (g.winner === null) g = applyMove(g, move);
      }
    expect(g.winner).toBe('draw');
  });
});
describe('Aeroplane rules', () => {
  test('each roll has a new animation sequence, including equal dice and legacy saves', () => {
    let game = createGame('flight');
    delete game.rollCount;
    game = rollDice(game, 2);
    expect(game.rollCount).toBe(1);
    const next = rollDice(game, 2);
    expect(next.lastDie).toBe(game.lastDie);
    expect(next.rollCount).toBe(2);
    expect(game.rollCount).toBe(1);
    expect(applyMove(rollDice(next, 6), 'plane-0').rollCount).toBe(3);
  });
  test('52 unique cells and opposite launch points', () => {
    expect(TRACK).toHaveLength(52);
    expect(new Set(TRACK.map((p) => p.join(','))).size).toBe(52);
    expect(trackIndex(1, 0)).toBe(26);
  });
  test('requires a six to launch; unusable rolls pass', () => {
    let g = rollDice(createGame('flight'), 2);
    expect(g.turn).toBe(1);
    expect(g.die).toBeNull();
    g = rollDice(g, 6);
    expect(legalMoves(g)).toHaveLength(4);
    g = applyMove(g, 'plane-0');
    expect(g.planes[1][0]).toBe(0);
    expect(g.turn).toBe(1);
    expect(g.die).toBeNull();
  });
  test('direct shortcuts add four while jump-into-shortcut stops at the far end', () => {
    let g = createGame('flight');
    g.planes[0][0] = 0;
    g = rollDice(g, 2);
    expect(legalMoves(g)[0].progress).toBe(6);
    g = createGame('flight');
    g.planes[0][0] = 12;
    g = rollDice(g, 2);
    expect(legalMoves(g)[0].progress).toBe(30);
    g = createGame('flight');
    g.planes[0][0] = 16;
    g = rollDice(g, 2);
    expect(legalMoves(g)[0].progress).toBe(34);
  });
  test('landing sends all enemy planes home but does not move friendly stacks', () => {
    let g = createGame('flight');
    g.planes = [
      [0, 0, -1, -1],
      [27, 27, -1, -1],
    ];
    g = rollDice(g, 1);
    g = applyMove(g, 'plane-0');
    expect(g.planes[1]).toEqual([-1, -1, -1, -1]);
    expect(g.planes[0]).toEqual([1, 0, -1, -1]);
  });
  test('overshoots bounce and an exact final landing wins', () => {
    let g = createGame('flight');
    g.planes[0] = [56, 56, 56, 55];
    g = rollDice(g, 2);
    expect(legalMoves(g)[0].progress).toBe(55);
    g = applyMove(g, 'plane-3');
    expect(g.turn).toBe(1);
    expect(g.planes[0][3]).toBe(55);
    g.turn = 0;
    g = rollDice(g, 1);
    g = applyMove(g, 'plane-3');
    expect(g.winner).toBe(0);
  });
  test('three consecutive sixes return all unfinished planes by default', () => {
    let g = createGame('flight');
    g = rollDice(g, 6);
    g = applyMove(g, 'plane-0');
    g = rollDice(g, 6);
    g = applyMove(g, 'plane-1');
    g = rollDice(g, 6);
    expect(g.turn).toBe(1);
    expect(g.die).toBeNull();
    expect(g.planes[0]).toEqual([-1, -1, -1, -1]);
  });
  test('cannot roll twice while a move awaits selection', () => {
    expect(() => rollDice(rollDice(createGame('flight'), 6), 6)).toThrow();
  });
  test('home lanes are safe from capture', () => {
    let g = createGame('flight');
    g.planes = [
      [49, -1, -1, -1],
      [25, -1, -1, -1],
    ];
    g = rollDice(g, 2);
    g = applyMove(g, 'plane-0');
    expect(g.planes[0][0]).toBe(51);
    expect(g.planes[1][0]).toBe(25);
  });
  test('both sides can complete full deterministic simulated games', () => {
    for (let seed = 1; seed <= 8; seed++) {
      let n = seed,
        g = createGame('flight'),
        turns = 0;
      const random = () => {
        n = (n * 1664525 + 1013904223) >>> 0;
        return n;
      };
      while (g.winner === null && turns++ < 3000) {
        if (g.die === null) g = rollDice(g, (random() % 6) + 1);
        const moves = legalMoves(g);
        if (moves.length) g = applyMove(g, moves[random() % moves.length].id);
        expect(g.planes.flat().every((p) => p >= -1 && p <= 56)).toBe(true);
      }
      expect(g.winner).not.toBeNull();
    }
  });
});
