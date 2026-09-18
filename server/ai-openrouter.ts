import { OpenRouter } from '@openrouter/sdk';
import { HTTPClient } from '@openrouter/sdk/lib/http.js';
import { OpenRouterError, SDKValidationError } from '@openrouter/sdk/models/errors';
import type { Fetch } from '@typesafe-ai/sdk';
import type { buildAiRequest } from './ai-request';

export class OpenRouterHttpError extends Error {
  constructor(readonly status: number) {
    super(`OpenRouter HTTP ${status}`);
  }
}

/** The official SDK handles Decisions serialization and validates its response. */
export async function openRouterDecision(
  request: ReturnType<typeof buildAiRequest>,
  apiKey: string,
  fetcher: Fetch,
) {
  const controller = new AbortController();
  // Keep an explicit deadline active through SDK response parsing.
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const client = new OpenRouter({
      apiKey,
      serverURL: 'https://openrouter.ai',
      retryConfig: { strategy: 'none' },
      timeoutMs: 20_000,
      httpClient: new HTTPClient({
        // Standalone invocation also preserves native Workers fetch's receiver.
        fetcher: async (input, init) => {
          // Adapt the SDK Request to the existing injectable string transport.
          const sent =
            typeof input === 'string' || input instanceof URL
              ? new Request(String(input), init)
              : new Request(input, init);
          return fetcher(sent.url, {
            method: sent.method,
            headers: sent.headers,
            body: await sent.text(),
            signal: sent.signal,
            redirect: sent.redirect,
          });
        },
      }),
    });
    const response = await client.alpha.decisions.create(
      {
        decisionsRequest: {
          ...request,
          questions: {
            move: {
              ...request.questions.move,
              instructions: request.questions.move.instructions ?? '',
            },
          },
        },
      },
      { fetchOptions: { signal: controller.signal, redirect: 'manual' } },
    );
    return {
      ...response,
      usage: {
        input_tokens: response.usage.inputTokens,
        output_tokens: response.usage.outputTokens,
      },
    };
  } catch (error) {
    if (controller.signal.aborted) throw new Error('AI 連線逾時或網絡中斷，棋局已保留，請重試。');
    if (error instanceof OpenRouterError) {
      if (error.statusCode >= 200 && error.statusCode < 300)
        throw new Error('AI 未回傳有效步法，請重試。');
      throw new OpenRouterHttpError(error.statusCode);
    }
    if (error instanceof SDKValidationError || error instanceof SyntaxError)
      throw new Error('AI 未回傳有效步法，請重試。');
    throw new Error('AI 連線逾時或網絡中斷，棋局已保留，請重試。');
  } finally {
    clearTimeout(timer);
  }
}
