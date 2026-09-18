import { expect, test } from 'vitest';
import { chooseMove } from '../server/ai';
import { createGame } from '../shared/game';
import { buildMoveRequest } from '../server/ai-state';

test('the SDK transport preserves the native fetch receiver contract', async () => {
  const game = createGame('jungle');
  const id = Object.keys(buildMoveRequest(game, 'jev-latest').questions.move.criteria)[0];
  let calls = 0;
  const move = await chooseMove(game, 'test-key', 'jev-latest', async function (this: unknown) {
    calls++;
    // Workers rejects calling native fetch with the SDK instance as `this`.
    expect(this === undefined || this === globalThis).toBe(true);
    return Response.json({ answers: { move: { type: 'choice', choice: id } } });
  });
  expect(move.id).toBe(id);
  expect(calls).toBe(1);
});

test('the installed SDK aborts a stalled response body in workerd without retries', async () => {
  let calls = 0;
  const started = performance.now();
  await expect(
    chooseMove(createGame('jungle'), 'test-key', 'jev-latest', async (_url, init) => {
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
    }),
  ).rejects.toThrow('AI 連線逾時或網絡中斷');
  expect(performance.now() - started).toBeGreaterThanOrEqual(19_900);
  expect(calls).toBe(1);
}, 25_000);

test('OpenRouter Decisions works in workerd and preserves the fetch receiver', async () => {
  const game = createGame('jungle');
  const move = await chooseMove(
    game,
    'router-key',
    'typesafe/jev-1.13',
    async function (this: unknown, url, init) {
      expect(this === undefined || this === globalThis).toBe(true);
      const sent = new Request(url, init as RequestInit);
      expect(sent.url).toBe('https://openrouter.ai/api/alpha/decisions');
      expect(sent.headers.get('Authorization')).toBe('Bearer router-key');
      const request = JSON.parse(await sent.text());
      return Response.json({
        model: 'typesafe/jev-1.13',
        usage: { input_tokens: 42, output_tokens: 0 },
        answers: {
          move: { type: 'choice', choice: Object.keys(request.questions.move.criteria)[0] },
        },
      });
    },
    undefined,
    { provider: 'openrouter' },
  );
  expect(move.id).toBeTruthy();
});

test('OpenRouter aborts stalled body delivery in workerd without retries', async () => {
  let calls = 0;
  const started = performance.now();
  await expect(
    chooseMove(
      createGame('jungle'),
      'router-key',
      'typesafe/jev-1.13',
      async (url, init) => {
        const sent = new Request(url, init as RequestInit);
        calls++;
        return new Response(
          new ReadableStream({
            start(controller) {
              sent.signal.addEventListener(
                'abort',
                () => controller.error(new Error('private abort details')),
                { once: true },
              );
            },
          }),
        );
      },
      undefined,
      { provider: 'openrouter' },
    ),
  ).rejects.toThrow('網絡中斷');
  expect(performance.now() - started).toBeGreaterThanOrEqual(19_900);
  expect(calls).toBe(1);
}, 25_000);
