import {
  applyMove,
  createGame,
  other,
  positionKey,
  type Game,
  type Piece,
} from '../../shared/game';

export type Fixture = {
  id: string;
  game: Game;
  acceptableMoves: string[] | null;
};

function position(pieces: Piece[], quiet = 0): Game {
  const game = { ...createGame('jungle'), pieces, quiet };
  game.positions = { [positionKey(game)]: 1 };
  return game;
}
function p(id: string, side: 0 | 1, rank: number, x: number, y: number): Piece {
  return { id, side, rank, x, y };
}

function mirrorMove(id: string) {
  const [piece, coords] = id.split(':');
  const [x, y] = coords.split(',').map(Number);
  return `${piece}:${6 - x},${8 - y}`;
}

export function mirrorGame(source: Game): Game {
  const game = structuredClone(source);
  game.turn = other(source.turn);
  game.winner =
    source.winner === null || source.winner === 'draw' ? source.winner : other(source.winner);
  game.pieces = source.pieces.map((piece) => ({
    ...piece,
    side: other(piece.side),
    x: 6 - piece.x,
    y: 8 - piece.y,
  }));
  game.positions = Object.fromEntries(
    Object.entries(source.positions).map(([key, count]) => {
      const [turn, ...pieces] = key.split('|');
      return [`${other(Number(turn) as 0 | 1)}|${pieces.map(mirrorMove).sort().join('|')}`, count];
    }),
  );
  game.jungleHistory = source.jungleHistory?.map((entry) => ({
    ...entry,
    side: other(entry.side),
    fromX: 6 - entry.fromX,
    fromY: 8 - entry.fromY,
    x: 6 - entry.x,
    y: 8 - entry.y,
  }));
  game.lastMove = undefined;
  game.log = [];
  return game;
}

// Small engine positions for search and move-policy regression tests.
export function fixtures(): Fixture[] {
  const base: Fixture[] = [
    {
      id: 'den-now',
      game: position([p('rat', 0, 1, 3, 1), p('enemy', 1, 2, 6, 4)]),
      acceptableMoves: ['rat:3,0'],
    },
    {
      id: 'defend-den',
      game: position([
        p('dog', 0, 3, 3, 6),
        p('cat', 0, 2, 4, 7),
        p('attacker', 1, 2, 3, 7),
        p('enemy', 1, 1, 0, 0),
      ]),
      acceptableMoves: ['dog:3,7', 'cat:3,7'],
    },
    {
      id: 'den-in-three',
      game: position([p('cat', 0, 2, 3, 2), p('guard', 0, 3, 3, 6), p('enemy', 1, 1, 0, 4)]),
      acceptableMoves: ['cat:3,1'],
    },
    {
      id: 'den-vs-bait',
      game: position([
        p('cat', 0, 2, 3, 2),
        p('rat', 0, 1, 6, 5),
        p('elephant', 1, 8, 6, 4),
        p('enemy', 1, 2, 0, 5),
      ]),
      acceptableMoves: ['cat:3,1'],
    },
    {
      id: 'side-den-approach',
      game: position([p('dog', 0, 3, 1, 0), p('guard', 0, 2, 3, 6), p('enemy', 1, 1, 6, 4)]),
      acceptableMoves: ['dog:2,0'],
    },
    {
      id: 'river-capture',
      game: position([
        p('lion', 0, 7, 0, 3),
        p('guard', 0, 3, 3, 6),
        p('enemy-lion', 1, 7, 3, 3),
        p('rat', 1, 1, 6, 2),
      ]),
      acceptableMoves: ['lion:3,3'],
    },
    {
      id: 'rat-takes-elephant',
      game: position([
        p('rat', 0, 1, 0, 4),
        p('guard', 0, 3, 3, 6),
        p('elephant', 1, 8, 0, 3),
        p('cat', 1, 2, 6, 2),
      ]),
      acceptableMoves: ['rat:0,3'],
    },
    {
      id: 'exchange-recapture',
      game: position([
        p('cat', 0, 2, 0, 3),
        p('lion', 0, 7, 0, 4),
        p('dog', 1, 3, 0, 2),
        p('enemy', 1, 1, 6, 2),
      ]),
      // The cat cannot capture a dog. Moving it aside lets the lion advance;
      // this fixture stays unlabeled because several quiet plans are plausible.
      acceptableMoves: null,
    },
    {
      id: 'quiet-reset',
      game: position([p('lion', 0, 7, 0, 3), p('enemy', 1, 2, 3, 3)], 99),
      acceptableMoves: ['lion:3,3'],
    },
    {
      id: 'poisoned-capture',
      game: position([
        p('elephant', 0, 8, 0, 4),
        p('guard', 0, 3, 3, 6),
        p('cat', 1, 2, 0, 3),
        p('rat', 1, 1, 0, 2),
      ]),
      acceptableMoves: ['elephant:0,5', 'guard:4,6', 'guard:2,6', 'guard:3,7', 'guard:3,5'],
    },
  ];
  // Explicit repetition context, including mirrored history keys.
  const repetition = position([p('cat', 0, 2, 3, 2), p('enemy', 1, 1, 6, 4)]);
  repetition.positions[positionKey(applyMove(repetition, 'cat:3,1'))] = 2;
  base.push({
    id: 'repetition-draw',
    game: repetition,
    acceptableMoves: null,
  });

  return base.flatMap((fixture) => [
    fixture,
    {
      ...fixture,
      id: `${fixture.id}-mirrored`,
      game: mirrorGame(fixture.game),
      acceptableMoves: fixture.acceptableMoves?.map(mirrorMove) ?? null,
    },
  ]);
}
