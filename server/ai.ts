import { Type } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';
import { APIConnectionError, APIError, TypeSafeClient, type Fetch } from '@typesafe-ai/sdk';
import { legalMoves, type Game, type Move } from '../shared/game';
import { buildAiRequest, type AiOptions } from './ai-request';
import { openRouterDecision, OpenRouterHttpError } from './ai-openrouter';

const ChoiceResponseSchema = Type.Object({
  answers: Type.Object({
    move: Type.Object({ type: Type.Literal('choice'), choice: Type.String() }),
  }),
});

export async function chooseMove(
  game: Game,
  apiKey: string,
  model: string,
  fetcher: Fetch = fetch,
  usageContext?: { roomCode: string; gameId: string; attemptId?: string },
  options: AiOptions = {},
): Promise<Move> {
  const moves = legalMoves(game);
  if (!moves.length) throw new Error('沒有合法步法。');
  if (moves.length === 1) return moves[0];
  const request = buildAiRequest(game, model, options);
  const offered = new Set(Object.keys(request.questions.move.criteria));
  const eligible = moves.filter((move) => offered.has(move.id));
  if (eligible.length === 1) return eligible[0];
  const provider = options.provider ?? 'openrouter';
  const client = new TypeSafeClient({
    apiKey,
    baseURL: 'https://api.typesafe.ai',
    // The SDK calls its fetch property as a method. Native Workers fetch rejects
    // that SDK instance as its receiver; invoke the supplied function standalone.
    fetch: (input, init) => fetcher(input, init),
    timeout: 20_000,
    retry: { maxRetries: 0 },
    logLevel: 'off',
  });
  try {
    const response =
      provider === 'openrouter'
        ? await openRouterDecision(request, apiKey, fetcher)
        : await client.systemOne(request);
    const inputTokens = response?.usage?.input_tokens;
    // Record provider usage before move validation: rejected answers can still be billable.
    // Unknown usage stays null rather than looking like a free request.
    console.info(
      JSON.stringify({
        event: provider === 'openrouter' ? 'openrouter.usage' : 'typesafe.usage',
        ...(usageContext?.attemptId ? { attempt_id: usageContext.attemptId } : {}),
        timestamp: new Date().toISOString(),
        room_code: usageContext?.roomCode ?? null,
        game_id: usageContext?.gameId ?? null,
        game_kind: game.kind,
        ply: game.ply,
        model: typeof response?.model === 'string' ? response.model : model,
        input_tokens: Number.isSafeInteger(inputTokens) && inputTokens >= 0 ? inputTokens : null,
      }),
    );
    // SDK inference describes the contract; validate untrusted JSON and current legal moves too.
    if (!Value.Check(ChoiceResponseSchema, response))
      throw new Error('AI 未回傳有效步法，請重試。');
    const move = eligible.find((candidate) => candidate.id === response.answers.move.choice);
    if (!move) throw new Error('AI 未回傳有效步法，請重試。');
    return move;
  } catch (error) {
    // Provider bodies and transport details must never reach public room snapshots.
    if (error instanceof APIError || error instanceof OpenRouterHttpError) {
      if (error.status === 402) throw new Error('AI 服務額度不足，請聯絡管理員補充額度。');
      if (error.status === 401 || error.status === 403)
        throw new Error('AI 金鑰未獲授權，請檢查伺服器設定。');
      if (error.status === 429 || error.status === 529)
        throw new Error('AI 暫時忙碌，請稍後重試。');
      throw new Error(`AI 連線失敗（${error.status}），請重試。`);
    }
    if (error instanceof APIConnectionError)
      throw new Error('AI 連線逾時或網絡中斷，棋局已保留，請重試。');
    throw error;
  }
}
