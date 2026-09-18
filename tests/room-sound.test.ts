import { expect, test } from 'bun:test';
import type { Game, RoomView } from '../shared/contracts';
import { applyMove, createGame, legalMoves, rollDice } from '../shared/game';
import { flightScenes } from '../src/features/room/flight-playback';
import { idlePlayback, type FlightPlayback } from '../src/features/room/flight-playback-queue';
import { roomSound } from '../src/features/room/room-sound';

function frame(game: Game, revision = game.ply): FlightPlayback {
  const room: RoomView = {
    code: 'ABCDEF',
    kind: game.kind,
    mode: 'local',
    side: 0,
    ready: true,
    players: [
      { name: 'Red', connected: true },
      { name: 'Green', connected: true },
    ],
    game,
    revision,
    moves: legalMoves(game),
    thinking: false,
    aiError: null,
    rematch: [],
  };
  return idlePlayback(room);
}

function sequence(before: Game, after: Game) {
  let previous = frame(before, 1);
  return flightScenes(before, after)!.flatMap((scene) => {
    const next = { ...frame(scene.game, 2), ...scene };
    const sound = roomSound(previous, next);
    // A presence refresh must not replay an animated sound.
    expect(roomSound(next, structuredClone(next))).toBeNull();
    previous = next;
    return sound ? [sound] : [];
  });
}

test('Jungle sounds follow accepted moves and distinguish captures', () => {
  const before = createGame('jungle');
  const after = applyMove(before, legalMoves(before)[0].id);
  expect(roomSound(frame(before), frame(after))).toBe('move');
  expect(roomSound(frame(after), frame(structuredClone(after)))).toBeNull();
  const capture = createGame('jungle');
  capture.pieces = [
    { id: 'red', side: 0, rank: 8, x: 0, y: 4 },
    { id: 'green', side: 1, rank: 2, x: 0, y: 5 },
    { id: 'green-cat', side: 1, rank: 2, x: 6, y: 6 },
  ];
  const move = legalMoves(capture).find((m) => m.x === 0 && m.y === 5)!;
  expect(roomSound(frame(capture), frame(applyMove(capture, move.id)))).toBe('capture');
});

test('each flight step, jump and shortcut sounds once, without landing-hold duplicates', () => {
  const start = createGame('flight');
  start.planes[0][0] = 12;
  const rolled = rollDice(start, 2);
  expect(sequence(start, rolled)).toEqual(['roll']);
  expect(sequence(rolled, applyMove(rolled, 'plane-0'))).toEqual([
    'step',
    'step',
    'jump',
    'shortcut',
  ]);
});

test('flight capture, finish and third-six return have their own cues', () => {
  const start = createGame('flight');
  start.planes[0][0] = 0;
  start.planes[1][0] = 31;
  const rolled = rollDice(start, 5);
  expect(sequence(rolled, applyMove(rolled, 'plane-0'))).toEqual([
    'step',
    'step',
    'step',
    'step',
    'step',
    'capture',
  ]);
  start.planes[0][0] = 55;
  const finish = rollDice(start, 1);
  expect(sequence(finish, applyMove(finish, 'plane-0'))).toEqual(['step', 'finish']);
  start.sixes = 2;
  expect(sequence(start, rollDice(start, 6))).toEqual(['roll', 'return']);
});

test('instant keyboard flight moves still sound without animation', () => {
  const rolled = rollDice(createGame('flight'), 6);
  expect(roomSound(frame(rolled), frame(applyMove(rolled, 'plane-0')))).toBe('step');
});

test('results sound once and restored snapshots, rematches and room changes remain silent', () => {
  const before = createGame('jungle');
  const after = applyMove(before, legalMoves(before)[0].id);
  const win = { ...after, winner: 0 as const };
  expect(roomSound(frame(before), frame(win))).toBe('win');
  expect(roomSound(frame(win), frame(structuredClone(win)))).toBeNull();
  expect(roomSound(frame(before), frame({ ...after, winner: 'draw' }))).toBe('draw');
  expect(roomSound(frame(win), frame(before, 5))).toBeNull();
  expect(roomSound(frame(before), frame({ ...win, ply: 10 }))).toBeNull();
  const other = frame(after);
  other.room.code = 'UVWXYZ';
  expect(roomSound(frame(before), other)).toBeNull();
  const flight = createGame('flight');
  expect(roomSound(frame(flight), frame({ ...flight, rollCount: 8 }))).toBeNull();
});
