import { expect, test } from 'bun:test';
import { Value } from '@sinclair/typebox/value';
import { CreateRoomSchema, GameSchema, type JungleSettings } from '../shared/contracts';
import {
  applyMove,
  createGame,
  jungleRestrictions,
  legalMoves,
  type Game,
  type Piece,
} from '../shared/game';
import { buildMoveRequest } from '../server/ai-state';

const piece = (id: string, side: 0 | 1, rank: number, x: number, y: number): Piece => ({
  id,
  side,
  rank,
  x,
  y,
});
const game = (pieces: Piece[], settings?: JungleSettings): Game => ({
  ...createGame('jungle', settings),
  pieces,
});
const has = (g: Game, id: string) => legalMoves(g).some((move) => move.id === id);
const enabled = { ratCaptureAcrossBank: true, jumpOverOwnRat: true };
function trail(
  points: number[][],
  count: number,
  id = 'cat',
  side: 0 | 1 = 0,
): NonNullable<Game['jungleHistory']> {
  return Array.from({ length: count }, (_, i) => ({
    side,
    piece: id,
    fromX: points[i % points.length][0],
    fromY: points[i % points.length][1],
    x: points[(i + 1) % points.length][0],
    y: points[(i + 1) % points.length][1],
  }));
}
function sevenGame() {
  const g = game([piece('cat', 0, 2, 0, 5), piece('dog', 1, 3, 6, 2)]);
  g.jungleHistory = trail(
    [
      [0, 6],
      [0, 5],
    ],
    7,
  );
  return g;
}
function seventeenGame() {
  const g = game([piece('cat', 0, 2, 1, 6), piece('dog', 1, 3, 6, 2)]);
  g.jungleHistory = trail(
    [
      [0, 6],
      [1, 6],
      [1, 7],
      [0, 7],
    ],
    17,
  );
  return g;
}

test('new and legacy games default to no bank captures and no jumping over own rat', () => {
  const g = game([piece('rat', 0, 1, 1, 3), piece('enemy', 1, 1, 1, 2)]);
  expect(g.jungleSettings).toEqual({ ratCaptureAcrossBank: false, jumpOverOwnRat: false });
  expect(has(g, 'rat:1,2')).toBe(false);
  delete g.jungleSettings;
  delete g.jungleHistory;
  expect(Value.Check(GameSchema, g)).toBe(true);
  expect(has(g, 'rat:1,2')).toBe(false);
  g.pieces = [piece('lion', 0, 7, 0, 3), piece('rat', 0, 1, 1, 3), piece('enemy', 1, 2, 6, 2)];
  expect(has(g, 'lion:3,3')).toBe(false);
});

test('bank setting allows rats to capture both ways, without allowing water rat to eat elephant', () => {
  const g = game([piece('rat', 0, 1, 1, 3), piece('enemy', 1, 1, 1, 2)], enabled);
  expect(has(g, 'rat:1,2')).toBe(true);
  expect(applyMove(g, 'rat:1,2').pieces.map((p) => p.id)).toEqual(['rat']);
  g.turn = 1;
  expect(has(g, 'enemy:1,3')).toBe(true);
  g.turn = 0;
  g.pieces[1].rank = 8;
  expect(has(g, 'rat:1,2')).toBe(false);
  g.turn = 1;
  g.pieces[1].rank = 2;
  expect(has(g, 'enemy:1,3')).toBe(false);
});

test('lion and tiger may jump over own rats in both axes, but enemy rats and stronger landings block', () => {
  for (const rank of [6, 7])
    for (const vertical of [false, true]) {
      const g = game(
        [
          piece('jumper', 0, rank, vertical ? 1 : 0, vertical ? 2 : 3),
          piece('rat', 0, 1, 1, 3),
          piece('target', 1, 2, vertical ? 1 : 3, vertical ? 6 : 3),
        ],
        enabled,
      );
      const id = vertical ? 'jumper:1,6' : 'jumper:3,3';
      expect(has(g, id)).toBe(true);
      expect(applyMove(g, id).pieces.some((p) => p.id === 'rat')).toBe(true);
      g.pieces[1].side = 1;
      expect(has(g, id)).toBe(false);
      g.pieces[1].side = 0;
      g.pieces[2].rank = 8;
      expect(has(g, id)).toBe(false);
    }
});

test('7-3 blocks fourth arrival after seven own moves, not other cells or animals', () => {
  const g = sevenGame();
  expect(has(g, 'cat:0,6')).toBe(false);
  expect(has(g, 'cat:0,4')).toBe(true);
  expect(() => applyMove(g, 'cat:0,6')).toThrow('7-3');
  const early = sevenGame();
  early.jungleHistory = early.jungleHistory!.slice(0, 6);
  expect(has(early, 'cat:0,6')).toBe(true);
  g.pieces.push(piece('friend', 0, 3, 1, 6));
  expect(has(g, 'friend:0,6')).toBe(true);
  g.jungleHistory![0].side = 1;
  expect(has(g, 'cat:0,6')).toBe(true);
});

test('7-3 exempts trap entry and a currently chased animal, but not an unthreatened stronger animal', () => {
  const g = sevenGame();
  g.jungleHistory![0].x = 2;
  g.jungleHistory![0].y = 8;
  expect(has(g, 'cat:0,6')).toBe(true);
  const chased = sevenGame();
  chased.pieces[1].x = 0;
  chased.pieces[1].y = 4;
  expect(has(chased, 'cat:0,6')).toBe(true);
  chased.pieces[1].rank = 1;
  expect(has(chased, 'cat:0,6')).toBe(false);
});

test('17-5 forbids the small area after 17 moves, allowing escape and a different animal', () => {
  const g = seventeenGame();
  expect(has(g, 'cat:0,6')).toBe(false);
  expect(has(g, 'cat:1,7')).toBe(false);
  expect(has(g, 'cat:2,6')).toBe(true);
  expect(() => applyMove(g, 'cat:1,7')).toThrow('17-5');
  g.pieces.push(piece('friend', 0, 3, 0, 5));
  expect(has(g, 'friend:0,6')).toBe(true);
  const early = seventeenGame();
  early.jungleHistory!.shift();
  expect(has(early, 'cat:1,7')).toBe(true);
});

test('17-5 counts the starting square, requires one animal, and exempts trap entry but not chasing', () => {
  const g = seventeenGame();
  // Four loop cells plus one extra landing = five; starting outside adds the sixth.
  g.jungleHistory![0].fromX = 2;
  g.jungleHistory![0].fromY = 6;
  g.jungleHistory![1].x = 2;
  g.jungleHistory![1].y = 7;
  expect(has(g, 'cat:1,7')).toBe(true);
  g.jungleHistory![0].fromX = 0;
  expect(has(g, 'cat:1,7')).toBe(false);
  g.jungleHistory![0].piece = 'friend';
  expect(has(g, 'cat:1,7')).toBe(true);
  const trapped = seventeenGame();
  trapped.jungleHistory![0].x = 2;
  trapped.jungleHistory![0].y = 8;
  expect(has(trapped, 'cat:1,7')).toBe(true);
  const chased = seventeenGame();
  chased.pieces[1].x = 2;
  chased.pieces[1].y = 6;
  expect(has(chased, 'cat:1,7')).toBe(false);
});

test('accepted moves record history before immobility checks, cap it, and never mutate input', () => {
  const g = seventeenGame();
  g.jungleHistory = [
    ...g.jungleHistory!,
    ...trail(
      [
        [6, 1],
        [6, 2],
      ],
      17,
      'dog',
      1,
    ),
  ];
  const next = applyMove(g, 'cat:2,6');
  expect(next.jungleHistory).toHaveLength(34);
  expect(next.jungleHistory!.at(-1)).toEqual({
    side: 0,
    piece: 'cat',
    fromX: 1,
    fromY: 6,
    x: 2,
    y: 6,
  });
  expect(g.pieces[0].x).toBe(1);
  expect(Value.Check(GameSchema, next)).toBe(true);
});

test('real alternating play accumulates seven own moves and blocks the eighth return', () => {
  let g = game([piece('cat', 0, 2, 0, 6), piece('dog', 1, 3, 6, 0)]);
  const opponent = [
    [5, 0],
    [4, 0],
    [4, 1],
    [4, 2],
    [5, 2],
    [6, 2],
    [6, 1],
  ];
  for (let i = 0; i < 7; i++) {
    g = applyMove(g, `cat:0,${i % 2 === 0 ? 5 : 6}`);
    g = applyMove(g, `dog:${opponent[i].join(',')}`);
  }
  expect(g.winner).toBeNull();
  expect(g.jungleHistory).toHaveLength(14);
  expect(has(g, 'cat:0,6')).toBe(false);
});

test('real play reaches 17-5 without triggering repetition or 7-3, then permits leaving the area', () => {
  let g = game([piece('cat', 0, 2, 0, 6), piece('dog', 1, 3, 6, 0)]);
  const loop = [
    [1, 6],
    [1, 7],
    [0, 7],
    [0, 6],
  ];
  const enemy = [
    [6, 1],
    [5, 1],
    [4, 1],
    [4, 0],
    [5, 0],
    [6, 0],
    [6, 1],
    [5, 1],
    [4, 1],
    [4, 2],
    [3, 2],
    [3, 3],
    [3, 4],
    [3, 5],
    [3, 6],
    [4, 6],
    [5, 6],
  ];
  for (let i = 0; i < 17; i++) {
    g = applyMove(g, `cat:${loop[i % 4].join(',')}`);
    g = applyMove(g, `dog:${enemy[i].join(',')}`);
  }
  expect(g.winner).toBeNull();
  expect(jungleRestrictions(g).map(({ rule }) => rule)).toEqual(['17-5', '17-5']);
  expect(has(g, 'cat:2,6')).toBe(true);
  expect(applyMove(g, 'cat:2,6').jungleHistory).toHaveLength(34);
});

test('violations apply symmetrically to either side and lose trap exemptions outside the rolling window', () => {
  for (const fixture of [sevenGame, seventeenGame]) {
    const g = fixture();
    const expected = jungleRestrictions(g).map(({ move, rule }) => [move.id, rule]);
    g.turn = 1;
    g.pieces.forEach((p) => {
      p.side = p.side === 0 ? 1 : 0;
    });
    g.jungleHistory!.forEach((entry) => {
      entry.side = 1;
    });
    expect(jungleRestrictions(g).map(({ move, rule }) => [move.id, rule])).toEqual(expected);
    g.jungleHistory!.unshift({ side: 1, piece: 'cat', fromX: 2, fromY: 7, x: 2, y: 8 });
    expect(jungleRestrictions(g).map(({ move, rule }) => [move.id, rule])).toEqual(expected);
  }
});

test('opponent immobility includes anti-chase bans and ends the game', () => {
  const g = seventeenGame();
  // Cat can only enter its old loop: river above, stronger enemy to the right.
  g.pieces = [piece('cat', 0, 2, 1, 6), piece('blocker', 1, 8, 2, 6), piece('dog', 1, 3, 6, 2)];
  g.turn = 1;
  expect(applyMove(g, 'dog:6,1').winner).toBe(1);
});

test('settings are validated and AI candidates and rules agree with the room', () => {
  expect(
    Value.Check(CreateRoomSchema, {
      name: 'Host',
      kind: 'jungle',
      mode: 'local',
      jungleSettings: enabled,
    }),
  ).toBe(true);
  expect(
    Value.Check(CreateRoomSchema, {
      name: 'Host',
      kind: 'jungle',
      mode: 'local',
      jungleSettings: { ...enabled, jumpOverOwnRat: 'true' },
    }),
  ).toBe(false);
  const g = game([piece('rat', 0, 1, 1, 3), piece('enemy', 1, 1, 1, 2)], enabled);
  const request = buildMoveRequest(g, 'test-model');
  if (request.state.game !== 'jungle') throw new Error('Expected Jungle');
  expect(request.state.settings).toEqual(enabled);
  expect(request.state.rules[2]).toContain('鼠可跨水陸互吃');
  expect(request.state.candidates).toHaveProperty('rat:1,2');
  const restricted = buildMoveRequest(sevenGame(), 'test-model');
  expect(restricted.state.candidates).not.toHaveProperty('cat:0,6');
  expect(jungleRestrictions(createGame('flight'))).toEqual([]);
});
