import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RoomService } from '../server/rooms/service';
import { expect, spyOn, test } from 'bun:test';
import { resolveAiConfig } from '../server/ai-config';
import { chooseMove } from '../server/ai';
import { createGame, legalMoves, rollDice } from '../shared/game';

const model = 'typesafe/jev-1.13';
const options = { provider: 'openrouter' } as const;

test('provider selection keeps keys and model namespaces separate', () => {
  const env = { TYPESAFE_API_KEY: 'direct', OPENROUTER_API_KEY: 'router' };
  expect(resolveAiConfig({ ...env, AI_PROVIDER: 'typesafe' })).toEqual({
    provider: 'typesafe',
    apiKey: 'direct',
    model: 'jev-latest',
  });
  expect(resolveAiConfig(env)).toEqual({
    provider: 'openrouter',
    apiKey: 'router',
    model,
  });
  expect(resolveAiConfig({ AI_PROVIDER: 'openrouter', TYPESAFE_API_KEY: 'direct' }).apiKey).toBe(
    '',
  );
  expect(
    resolveAiConfig({ ...env, AI_PROVIDER: 'openrouter', OPENROUTER_MODEL: 'custom' }).model,
  ).toBe('custom');
  expect(() => resolveAiConfig({ AI_PROVIDER: 'typo' })).toThrow('AI_PROVIDER');
});

for (const kind of ['jungle', 'flight'] as const) {
  test(`OpenRouter sends typed ${kind} choices and records usage without secrets`, async () => {
    const game = kind === 'flight' ? rollDice(createGame(kind), 6) : createGame(kind);
    const before = structuredClone(game);
    const log = spyOn(console, 'info').mockImplementation(() => {});
    let calls = 0;
    try {
      const move = await chooseMove(
        game,
        'router-secret',
        model,
        async function (url, init) {
          calls++;
          const sent = new Request(url, init as RequestInit);
          expect(sent.url).toBe('https://openrouter.ai/api/alpha/decisions');
          expect(sent.headers.get('Authorization')).toBe('Bearer router-secret');
          expect(sent.signal).toBeInstanceOf(AbortSignal);
          expect(sent.redirect).toBe('manual');
          const body = await sent.text();
          expect(body).not.toContain('router-secret');
          const request = JSON.parse(body);
          expect(request.model).toBe(model);
          expect(request.messages).toBeUndefined();
          expect(request.questions.move.type).toBe('choice');
          return Response.json({
            model,
            answers: {
              move: { type: 'choice', choice: Object.keys(request.questions.move.criteria)[0] },
            },
            usage: { input_tokens: 321, output_tokens: 0, cost: 0.00001 },
            privateDiagnostics: 'private',
          });
        },
        undefined,
        options,
      );
      expect(legalMoves(game)).toContainEqual(move);
      expect(game).toEqual(before);
      expect(calls).toBe(1);
      const entry = JSON.parse(String(log.mock.calls[0][0]));
      expect(entry).toMatchObject({ event: 'openrouter.usage', input_tokens: 321, model });
      expect(JSON.stringify(entry)).not.toContain('private');
      expect(JSON.stringify(entry)).not.toContain('router-secret');
    } finally {
      log.mockRestore();
    }
  });
}

test.each([302, 401, 402, 403, 429, 500, 529])(
  'OpenRouter HTTP %i is safe and never retried',
  async (status) => {
    let calls = 0;
    const message =
      status === 402
        ? '額度不足'
        : status === 401 || status === 403
          ? '未獲授權'
          : status === 429 || status === 529
            ? '暫時忙碌'
            : '連線失敗';
    await expect(
      chooseMove(
        createGame('jungle'),
        'key',
        model,
        async () => {
          calls++;
          return Response.json(
            { error: { code: status, message: 'sensitive provider details' } },
            { status },
          );
        },
        undefined,
        options,
      ),
    ).rejects.toThrow(message);
    expect(calls).toBe(1);
  },
);

test.each([
  null,
  {},
  {
    model,
    usage: { input_tokens: 25, output_tokens: 0 },
    answers: { move: { type: 'choice', choice: 'illegal' } },
  },
])('OpenRouter rejects invalid answers: %j', async (body) => {
  await expect(
    chooseMove(
      createGame('jungle'),
      'key',
      model,
      async () => Response.json(body),
      undefined,
      options,
    ),
  ).rejects.toThrow('有效步法');
});

test('OpenRouter rejects non-JSON and sanitizes network exceptions', async () => {
  await expect(
    chooseMove(
      createGame('jungle'),
      'key',
      model,
      async () => new Response('private HTML'),
      undefined,
      options,
    ),
  ).rejects.toThrow('有效步法');
  await expect(
    chooseMove(
      createGame('jungle'),
      'key',
      model,
      async () => {
        throw new Error('secret');
      },
      undefined,
      options,
    ),
  ).rejects.toThrow('網絡中斷');
});

test('Bun rooms carry the selected provider into AI turns and keep the key private', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'kee-openrouter-'));
  try {
    let calls = 0;
    const service = new RoomService({
      dataFile: join(dir, 'rooms.json'),
      provider: 'openrouter',
      apiKey: 'router-secret',
      model,
      choose: async (game, key, selectedModel, _fetch, _context, options) => {
        calls++;
        expect(key).toBe('router-secret');
        expect(selectedModel).toBe(model);
        expect(options?.provider).toBe('openrouter');
        return legalMoves(game)[0];
      },
    });
    expect(service.config).toEqual({ aiAvailable: true, model });
    const created = service.create({ name: 'Player', kind: 'jungle', mode: 'ai' });
    const room = service.get(created.room.code);
    service.act(room, 0, {
      type: 'move',
      id: legalMoves(room.game)[0].id,
      revision: room.revision,
    });
    await Promise.resolve();
    expect(calls).toBe(1);
    expect(room.game.ply).toBe(2);
    expect(JSON.stringify(service.view(room, 0))).not.toContain('router-secret');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
