import { expect, test } from 'bun:test';
import { Value } from '@sinclair/typebox/value';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CreateRoomSchema } from '../shared/contracts';
import { applyMove, createGame, legalMoves, positionKey, rollDice } from '../shared/game';
import { buildAiRequest } from '../server/ai-request';
import { chooseMove } from '../server/ai';
import { buildMoveRequest } from '../server/ai-state';
import { buildJungleAnalysis } from '../server/ai-lookahead';
import { moveIdentity, restrictedMoves } from '../server/ai-move-policy';
import { actOnRoom, createRoom, roomView } from '../server/rooms/domain';
import { applyAiMove, roomAiOptions } from '../server/rooms/ai-settings';
import { playAiTurn } from '../server/rooms/ai-turn';
import { RoomRepository } from '../server/rooms/repository';
import { StoredRoomSchema } from '../server/rooms/model';

const input = { name: 'Player', kind: 'jungle' as const, mode: 'ai' as const };

test('new AI rooms default to Normal, validate difficulty, and preserve legacy Easy rooms', () => {
  for (const aiDifficulty of ['easy', 'normal'] as const) {
    expect(Value.Check(CreateRoomSchema, { ...input, aiDifficulty })).toBe(true);
    const { room } = createRoom('ABC234', { ...input, aiDifficulty }, true);
    expect(roomView(room, 0, () => false).aiDifficulty).toBe(aiDifficulty);
    expect(roomAiOptions(room).difficulty).toBe(aiDifficulty);
  }
  expect(Value.Check(CreateRoomSchema, { ...input, aiDifficulty: 'hard' })).toBe(false);
  const { room } = createRoom('ABC234', input, true);
  expect(room.aiDifficulty).toBe('normal');
  delete room.aiDifficulty;
  delete room.aiMoveCounts;
  expect(Value.Check(StoredRoomSchema, room)).toBe(true);
  expect(roomView(room, 0, () => false).aiDifficulty).toBe('easy');
  expect(roomAiOptions(room).difficulty).toBe('easy');
  expect(
    createRoom('ABC234', { ...input, mode: 'friend' }, true).room.aiDifficulty,
  ).toBeUndefined();
});

test('Normal uses three-ply evidence; Easy has baseline evidence and Flight is unchanged', () => {
  const game = createGame('jungle');
  const enumerate = restrictedMoves(game, {}, 2, [0, 1]);
  const normal = buildAiRequest(game, 'test', { aiSides: [0, 1] });
  const search = buildJungleAnalysis(game, 'test', 'lookahead3', 50_000, enumerate);
  if (!('lookahead' in search.request.state)) throw new Error('Missing lookahead evidence');
  expect(normal.state).toHaveProperty('lookahead', search.request.state.lookahead);
  expect(normal.questions).toEqual(search.request.questions);
  const easy = buildAiRequest(game, 'test', { difficulty: 'easy', aiSides: [0, 1] });
  expect(easy.state).not.toHaveProperty('lookahead');
  expect(easy.questions).toEqual(buildMoveRequest(game, 'test', enumerate).questions);
  const flight = rollDice(createGame('flight'), 6);
  expect(buildAiRequest(flight, 'test')).toEqual(buildMoveRequest(flight, 'test'));
});

test('production transport defaults to lookahead and explicitly selects Easy', async () => {
  for (const difficulty of [undefined, 'easy'] as const) {
    await chooseMove(
      createGame('jungle'),
      'test',
      'test',
      async (_, init) => {
        const request = JSON.parse(init!.body as string);
        expect(!!request.state.lookahead).toBe(difficulty !== 'easy');
        return Response.json({
          answers: {
            move: { type: 'choice', choice: Object.keys(request.questions.move.criteria)[0] },
          },
          usage: { input_tokens: 100 },
        });
      },
      undefined,
      { difficulty },
    );
  }
});

test('both difficulties exclude avoidable draws and third directed moves; simulated humans keep all legal replies', () => {
  const game = createGame('jungle');
  const [draw, repeat] = legalMoves(game);
  game.positions[positionKey(applyMove(game, draw.id))] = 2;
  const counts = { [moveIdentity(game, repeat)]: 2 };
  for (const difficulty of ['easy', 'normal'] as const) {
    const request = buildAiRequest(game, 'test', { difficulty, moveCounts: counts });
    expect(request.questions.move.criteria).not.toHaveProperty(draw.id);
    expect(request.questions.move.criteria).not.toHaveProperty(repeat.id);
  }
  const reply = applyMove(game, repeat.id);
  const enumerate = restrictedMoves(game, counts, 2, [game.turn]);
  for (const move of legalMoves(reply)) counts[moveIdentity(reply, move)] = 2;
  expect(enumerate(reply)).toEqual(legalMoves(reply));
});

test('difficulty and full AI move counts survive persistence, are private, and reset counts on rematch', () => {
  const dir = mkdtempSync(join(tmpdir(), 'kee-difficulty-'));
  try {
    const file = join(dir, 'rooms.json');
    const { room } = createRoom('ABC234', { ...input, aiDifficulty: 'easy' }, true);
    room.game = applyMove(room.game, legalMoves(room.game)[0].id);
    const move = legalMoves(room.game)[0];
    const identity = moveIdentity(room.game, move);
    applyAiMove(room, move);
    expect(room.aiMoveCounts?.[identity]).toBe(1);
    const repository = new RoomRepository(file);
    repository.save(room);
    const saved = new RoomRepository(file).rooms.get(room.code)!;
    expect(saved.aiDifficulty).toBe('easy');
    expect(saved.aiMoveCounts).toEqual({ [identity]: 1 });
    expect(roomView(saved, 0, () => false)).not.toHaveProperty('aiMoveCounts');
    saved.game.winner = 0;
    actOnRoom(saved, 0, { type: 'rematch' }, () => 1);
    expect(saved.aiDifficulty).toBe('easy');
    expect(saved.aiMoveCounts).toEqual({});
    expect(saved.game.ply).toBe(0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('Bun AI turn passes persisted difficulty and counts only accepted moves', async () => {
  for (const difficulty of ['easy', 'normal'] as const) {
    const { room } = createRoom('ABC234', { ...input, aiDifficulty: difficulty }, true);
    room.game = applyMove(room.game, legalMoves(room.game)[0].id);
    await playAiTurn(room, {
      apiKey: 'test',
      model: 'test',
      dice: () => 1,
      changed: () => {},
      choose: async (game, _key, _model, _fetch, _usage, options) => {
        expect(options).toMatchObject({ difficulty, aiSides: [1], moveCounts: {} });
        return legalMoves(game)[0];
      },
    });
    expect(Object.values(room.aiMoveCounts ?? {})).toEqual([1]);
    expect(room.game.ply).toBe(2);
  }
  const { room } = createRoom('ABC234', input, true);
  room.game = applyMove(room.game, legalMoves(room.game)[0].id);
  await playAiTurn(room, {
    apiKey: 'test',
    model: 'test',
    dice: () => 1,
    changed: () => {},
    choose: async () => {
      throw new Error('Service unavailable');
    },
  });
  expect(room.aiMoveCounts).toEqual({});
  expect(room.game.ply).toBe(1);
});
