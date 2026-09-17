import { expect, test } from 'vitest';
import { chooseMove } from '../server/ai';
import { createGame } from '../shared/game';

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
