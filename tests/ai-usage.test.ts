import { expect, spyOn, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chooseMove } from '../server/ai';
import { RoomService } from '../server/rooms/service';
import { createGame, legalMoves, rollDice } from '../shared/game';

test.each([false, true])('usage is logged even when a choice is rejected: %s', async (illegal) => {
  const log = spyOn(console, 'info').mockImplementation(() => {});
  try {
    const game = createGame('jungle');
    const choice = illegal ? 'invalid-choice' : legalMoves(game)[0].id;
    const result = chooseMove(
      game,
      'private-api-key',
      'jev-latest',
      async () =>
        Response.json({
          model: 'jev-1.13.0',
          answers: { move: { type: 'choice', choice } },
          usage: { input_tokens: 1234, output_tokens: 20 },
          privateDiagnostics: 'do-not-log',
        }),
      { roomCode: 'ABC123', gameId: 'match-1' },
    );
    if (illegal) await expect(result).rejects.toThrow('有效步法');
    else await result;
    expect(log).toHaveBeenCalledTimes(1);
    const entry = JSON.parse(String(log.mock.calls[0][0]));
    expect(entry).toEqual({
      event: 'typesafe.usage',
      timestamp: expect.any(String),
      room_code: 'ABC123',
      game_id: 'match-1',
      game_kind: 'jungle',
      ply: 0,
      model: 'jev-1.13.0',
      input_tokens: 1234,
    });
  } finally {
    log.mockRestore();
  }
});

test.each([undefined, -1, 1.5, '1234', 0])(
  'untrusted usage does not break valid moves or invent a zero: %j',
  async (inputTokens) => {
    const log = spyOn(console, 'info').mockImplementation(() => {});
    try {
      const game = createGame('jungle');
      const choice = legalMoves(game)[0];
      const result = await chooseMove(game, 'key', 'jev-latest', async () =>
        Response.json({
          answers: { move: { type: 'choice', choice: choice.id } },
          usage: inputTokens === undefined ? undefined : { input_tokens: inputTokens },
        }),
      );
      expect(result).toEqual(choice);
      expect(JSON.parse(String(log.mock.calls[0][0])).input_tokens).toBe(
        inputTokens === 0 ? 0 : null,
      );
    } finally {
      log.mockRestore();
    }
  },
);

test('forced moves do not emit a provider usage event', async () => {
  const log = spyOn(console, 'info').mockImplementation(() => {});
  try {
    const game = createGame('flight');
    game.planes[0] = [0, -1, -1, -1];
    await chooseMove(rollDice(game, 1), 'key', 'jev-latest', async () => {
      throw new Error('Unexpected API call');
    });
    expect(log).not.toHaveBeenCalled();
  } finally {
    log.mockRestore();
  }
});

test('match attribution survives restart, stays private, and changes on rematch', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'kee-usage-'));
  try {
    const contexts: unknown[] = [];
    const options = {
      dataFile: join(dir, 'rooms.json'),
      apiKey: 'key',
      choose: (async (game, _key, _model, _fetch, context) => {
        contexts.push(context);
        return legalMoves(game)[0];
      }) satisfies typeof chooseMove,
    };
    const service = new RoomService(options);
    const created = service.create({ name: 'Player', kind: 'jungle', mode: 'ai' });
    const room = service.get(created.room.code);
    // No ID yet also exercises compatibility with older persisted rooms.
    expect(room.aiGameId).toBeUndefined();
    service.act(room, 0, {
      type: 'move',
      id: legalMoves(room.game)[0].id,
      revision: room.revision,
    });
    await Promise.resolve();
    expect(room.thinking).toBe(false);
    const firstId = room.aiGameId;
    expect(firstId).toBeString();
    expect(contexts[0]).toEqual({ roomCode: room.code, gameId: firstId });
    expect(service.view(room, 0)).not.toHaveProperty('aiGameId');

    const restoredService = new RoomService(options);
    const restored = restoredService.get(room.code);
    expect(restored.aiGameId).toBe(firstId);
    restoredService.act(restored, 0, { type: 'resign' });
    restoredService.act(restored, 0, { type: 'rematch' });
    expect(restored.aiGameId).not.toBe(firstId);
    restoredService.act(restored, 0, {
      type: 'move',
      id: legalMoves(restored.game)[0].id,
      revision: restored.revision,
    });
    await Promise.resolve();
    expect(contexts[1]).toEqual({ roomCode: room.code, gameId: restored.aiGameId });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
