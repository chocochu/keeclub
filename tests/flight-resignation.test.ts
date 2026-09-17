import { expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Value } from '@sinclair/typebox/value';
import { GameSchema, type Game, type Side } from '../shared/contracts';
import { applyMove, canResign, createGame, legalMoves, resign, rollDice } from '../shared/game';
import { RoomService } from '../server/rooms/service';
import { buildMoveRequest } from '../server/ai-state';

test('withdrawal preserves first place and lets the remaining players finish', () => {
  let game = createGame('flight', { playerCount: 4, tripleSix: 'all' });
  game.planes[0] = [56, 56, 56, 55];
  game = applyMove(rollDice(game, 1), 'plane-3');
  expect(game.rankings).toEqual([0]);
  const before = structuredClone(game);
  game = resign(game, 1);
  expect(before.withdrawn).toEqual([]);
  expect(game.rankings).toEqual([0]);
  expect(game.withdrawn).toEqual([1]);
  expect(game.winner).toBeNull();
  expect(game.turn).toBe(2);
  expect(canResign(game, 0)).toBe(false);
  expect(canResign(game, 1)).toBe(false);
  expect(() => resign(game, 0)).toThrow('已完成或退出');
  expect(() => resign(game, 1)).toThrow('已完成或退出');
  game.planes[2] = [56, 56, 56, 55];
  game = applyMove(rollDice(game, 1), 'plane-3');
  expect(game.rankings).toEqual([0, 2, 3]);
  expect(game.winner).toBe(0);
  expect(Value.Check(GameSchema, game)).toBe(true);
});

test('withdrawing the current player clears their pending roll and removes only unfinished planes', () => {
  let game = createGame('flight', { playerCount: 4, tripleSix: 'all' });
  game.planes[0] = [56, 0, 53, -1];
  game = resign(rollDice(game, 6), 0);
  expect(game.planes[0]).toEqual([56, -1, -1, -1]);
  expect(game.turn).toBe(2);
  expect(game.die).toBeNull();
  expect(game.sixes).toBe(0);
  expect(game.rankings).toEqual([]);
  expect(game.winner).toBeNull();
  const turns: Side[] = [];
  for (let n = 0; n < 4; n++) {
    turns.push(game.turn);
    game = rollDice(game, 1);
  }
  expect(turns).toEqual([2, 1, 3, 2]);
});

test('out-of-turn withdrawal preserves the current roll and AI descriptions skip the withdrawn seat', () => {
  let game = createGame('flight', { playerCount: 4, tripleSix: 'all' });
  game.planes[0][0] = 0;
  game = rollDice(game, 3);
  const moves = legalMoves(game);
  game = resign(game, 2);
  expect(game.turn).toBe(0);
  expect(game.die).toBe(3);
  expect(legalMoves(game)).toEqual(moves);
  const request = buildMoveRequest(game, 'jev-latest');
  if (request.state.game !== 'flight') throw new Error('Expected flight');
  expect(request.state.position.withdrawn).toEqual([2]);
  expect(request.state.candidates['plane-0'].nextPlayer).toBe(1);
  expect(request.state.candidates['plane-0'].nextRolls.every((roll) => roll.roller === 1)).toBe(
    true,
  );
});

test('successive withdrawals award the last active player and old snapshots remain playable', () => {
  let game = createGame('flight', { playerCount: 3, tripleSix: 'all' });
  delete game.withdrawn;
  expect(Value.Check(GameSchema, game)).toBe(true);
  game = resign(game, 2);
  expect(game.winner).toBeNull();
  game = resign(game, 0);
  expect(game.winner).toBe(1);
  expect(game.rankings).toEqual([1]);
  expect(game.withdrawn).toEqual([2, 0]);
  expect(legalMoves(game)).toEqual([]);
  expect(resign(createGame('flight'), 0).winner).toBe(1);
  expect(resign(createGame('jungle'), 0).winner).toBe(1);
});

test('authorized withdrawals persist, reject settled seats and reset on rematch', () => {
  const dir = mkdtempSync(join(tmpdir(), 'kee-withdrawal-'));
  try {
    const dataFile = join(dir, 'rooms.json');
    const service = new RoomService({ dataFile, apiKey: '', dice: () => 1 });
    const session = service.create({
      kind: 'flight',
      mode: 'friend',
      name: 'Host',
      flightSettings: { playerCount: 3, tripleSix: 'all' },
    });
    const guest = service.join(session.room.code, 'Guest');
    service.join(session.room.code, 'Third');
    const room = service.get(session.room.code);
    room.game.planes[0] = [56, 56, 56, 55];
    service.act(room, 0, { type: 'roll', revision: room.revision });
    service.act(room, 0, { type: 'move', id: 'plane-3', revision: room.revision });
    expect(() => service.act(room, 0, { type: 'resign' })).toThrow('已完成或退出');
    const authorized = service.authorize(room.code, guest.token);
    service.act(authorized.room, authorized.side, { type: 'resign' });
    expect(room.game.rankings).toEqual([0, 2]);
    expect(room.game.winner).toBe(0);
    const recovered = new RoomService({ dataFile, apiKey: '' });
    const saved = recovered.authorize(room.code, session.token).room;
    expect(saved.game.withdrawn).toEqual([1]);
    expect(saved.game.rankings).toEqual([0, 2]);
    for (const side of [0, 1, 2] as Side[]) recovered.act(saved, side, { type: 'rematch' });
    expect(saved.game.withdrawn).toEqual([]);
    expect(saved.game.rankings).toEqual([]);
    expect(saved.game.winner).toBeNull();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('withdrawal during an AI choice causes a fresh choice and the turn continues', async () => {
  let completeFirst: (() => void) | undefined;
  const choices: Game[] = [];
  const service = new RoomService({
    apiKey: 'test',
    dice: () => 1,
    choose: (game) => {
      choices.push(game);
      if (choices.length === 1)
        return new Promise((resolve) => {
          completeFirst = () => resolve(legalMoves(game)[0]);
        });
      return Promise.resolve(legalMoves(game)[0]);
    },
  });
  const session = service.create({
    kind: 'flight',
    mode: 'friend',
    name: 'Host',
    flightSettings: { playerCount: 4, tripleSix: 'all' },
    flightPlayers: [false, false, true, false].map((ai) => ({ name: '', ai })),
  });
  service.join(session.room.code, 'Guest');
  service.join(session.room.code, 'Third');
  const room = service.get(session.room.code);
  room.game.planes[2][0] = 0;
  service.act(room, 0, { type: 'roll', revision: room.revision });
  expect(room.thinking).toBe(true);
  service.act(room, 1, { type: 'resign' });
  completeFirst!();
  for (let n = 0; room.thinking && n < 100; n++) await Bun.sleep(1);
  expect(choices).toHaveLength(2);
  expect(choices[1].withdrawn).toEqual([1]);
  expect(room.thinking).toBe(false);
  expect(room.aiError).toBeNull();
  expect(room.game.turn).toBe(3);
  expect(room.game.planes[2][0]).toBe(1);
  expect(room.game.ply).toBe(1);
});
