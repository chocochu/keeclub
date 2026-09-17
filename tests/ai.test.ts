import { expect, test } from 'bun:test';
import type { Fetch } from '@typesafe-ai/sdk';
import { chooseMove } from '../server/ai';
import { AI_INSTRUCTIONS } from '../server/ai-state';
import { createGame, legalMoves, rollDice } from '../shared/game';

for (const kind of ['jungle', 'flight'] as const) {
  test(`TypeSafe SDK sends legal ${kind} choices and keeps the key in the auth header`, async () => {
    const game = kind === 'flight' ? rollDice(createGame(kind), 6) : createGame(kind);
    const moves = legalMoves(game);
    const move = moves[2];
    const before = structuredClone(game);
    let request: unknown;
    const fetcher: Fetch = async (url, init) => {
      expect(url).toBe('https://api.typesafe.ai/v1/systemone');
      expect(init?.method).toBe('POST');
      request = JSON.parse(init!.body as string);
      const headers = new Headers(init?.headers);
      expect(headers.get('Authorization')).toBe('Bearer test-secret');
      expect(headers.get('X-TypeSafe-SDK')).toStartWith('typesafe-sdk/');
      expect(init!.body).not.toContain('test-secret');
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      return Response.json({
        model: 'jev-latest',
        answers: {
          move: {
            type: 'choice',
            choice: move.id,
            confidence: 1,
            probabilities: Object.fromEntries(moves.map((m) => [m.id, m.id === move.id ? 1 : 0])),
          },
        },
        usage: { input_tokens: 100, output_tokens: 20 },
      });
    };
    expect(await chooseMove(game, 'test-secret', 'jev-latest', fetcher)).toEqual(move);
    expect(game).toEqual(before);
    expect(request).toMatchObject({
      model: 'jev-latest',
      questions: {
        move: {
          type: 'choice',
          instructions: AI_INSTRUCTIONS[kind],
          criteria: Object.fromEntries(
            moves.map((candidate) => [
              candidate.id,
              { action: candidate.label, evidence: expect.any(String) },
            ]),
          ),
        },
      },
      state: {
        game: kind,
        position: kind === 'flight' ? { die: game.die } : { draw: { quietHalfMoves: 0 } },
        candidates: { [move.id]: { winner: null, nextPlayer: expect.any(Number) } },
      },
    });
  });
}

test.each([
  null,
  {},
  { answers: {} },
  { answers: { move: { type: 'noul', noul: 0.8 } } },
  { answers: { move: { type: 'choice', choice: 42 } } },
  { answers: { move: { type: 'choice', choice: 'invented' } } },
])('malformed or illegal AI answers never become game moves: %j', async (body) => {
  const fetcher: Fetch = async () => Response.json(body);
  await expect(chooseMove(createGame('jungle'), 'key', 'jev-latest', fetcher)).rejects.toThrow(
    '有效步法',
  );
});

test('non-JSON provider responses are rejected', async () => {
  const fetcher: Fetch = async () => new Response('<html>upstream failure</html>');
  await expect(chooseMove(createGame('jungle'), 'key', 'jev-latest', fetcher)).rejects.toThrow(
    '有效步法',
  );
});

test.each([
  [401, 'AI 金鑰未獲授權，請檢查伺服器設定。'],
  [403, 'AI 金鑰未獲授權，請檢查伺服器設定。'],
  [429, 'AI 暫時忙碌，請稍後重試。'],
  [529, 'AI 暫時忙碌，請稍後重試。'],
  [500, 'AI 連線失敗（500），請重試。'],
  [422, 'AI 連線失敗（422），請重試。'],
] as const)(
  'HTTP %i produces a safe error without automatic SDK retries',
  async (status, message) => {
    let calls = 0;
    const fetcher: Fetch = async () => {
      calls++;
      return Response.json(
        { error: 'sensitive provider diagnostics and test-secret' },
        { status, headers: { 'retry-after-ms': '1' } },
      );
    };
    await expect(chooseMove(createGame('jungle'), 'key', 'jev-latest', fetcher)).rejects.toThrow(
      message,
    );
    expect(calls).toBe(1);
  },
);

test('SDK connection failures have a safe retry message and no automatic retries', async () => {
  let calls = 0;
  const fetcher: Fetch = async () => {
    calls++;
    throw new TypeError('private network details');
  };
  await expect(chooseMove(createGame('jungle'), 'key', 'jev-latest', fetcher)).rejects.toThrow(
    'AI 連線逾時或網絡中斷，棋局已保留，請重試。',
  );
  expect(calls).toBe(1);
});

test('forced moves and positions without legal moves do not call TypeSafe', async () => {
  let calls = 0;
  const fetcher: Fetch = async () => {
    calls++;
    throw new Error('Unexpected inference');
  };
  const game = createGame('flight');
  await expect(chooseMove(game, '', 'jev-latest', fetcher)).rejects.toThrow('沒有合法步法');
  game.planes[0] = [0, -1, -1, -1];
  const rolled = rollDice(game, 1);
  expect(await chooseMove(rolled, '', 'jev-latest', fetcher)).toEqual(legalMoves(rolled)[0]);
  expect(calls).toBe(0);
});

test('SDK aborts a stalled response after 20 seconds without retrying', async () => {
  let calls = 0;
  const fetcher: Fetch = async (_url, init) => {
    calls++;
    return new Response(
      new ReadableStream({
        start(controller) {
          init!.signal!.addEventListener('abort', () => controller.error(new Error('aborted')), {
            once: true,
          });
        },
      }),
    );
  };
  const started = performance.now();
  await expect(chooseMove(createGame('jungle'), 'key', 'jev-latest', fetcher)).rejects.toThrow(
    'AI 連線逾時或網絡中斷，棋局已保留，請重試。',
  );
  expect(performance.now() - started).toBeGreaterThanOrEqual(19_900);
  expect(calls).toBe(1);
}, 25_000);
