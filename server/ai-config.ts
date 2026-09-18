export type AiProvider = 'typesafe' | 'openrouter';

type AiEnvironment = {
  AI_PROVIDER?: string;
  TYPESAFE_API_KEY?: string;
  TYPESAFE_MODEL?: string;
  OPENROUTER_API_KEY?: string;
  OPENROUTER_MODEL?: string;
};

/** Resolve one provider explicitly; never fall back to another paid account. */
export function resolveAiConfig(env: AiEnvironment): {
  provider: AiProvider;
  apiKey: string;
  model: string;
} {
  const provider = env.AI_PROVIDER || 'openrouter';
  if (provider !== 'typesafe' && provider !== 'openrouter')
    throw new Error('AI_PROVIDER must be typesafe or openrouter');
  return {
    provider,
    apiKey: (provider === 'openrouter' ? env.OPENROUTER_API_KEY : env.TYPESAFE_API_KEY) ?? '',
    model:
      provider === 'openrouter'
        ? env.OPENROUTER_MODEL || 'typesafe/jev-1.13'
        : env.TYPESAFE_MODEL || 'jev-latest',
  };
}
