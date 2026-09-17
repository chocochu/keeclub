import type { AiDifficulty, Game, Side } from '../shared/contracts';
import { buildMoveRequest } from './ai-state';
import { buildJungleAnalysis } from './ai-lookahead';
import { describeAiMovePolicy, restrictedMoves } from './ai-move-policy';

export type AiOptions = {
  difficulty?: AiDifficulty;
  moveCounts?: Readonly<Record<string, number>>;
  aiSides?: readonly Side[];
};

export function buildAiRequest(game: Game, model: string, options: AiOptions = {}) {
  if (game.kind !== 'jungle') return buildMoveRequest(game, model);
  const aiSides = options.aiSides ?? [game.turn];
  const enumerate = restrictedMoves(game, options.moveCounts ?? {}, 2, aiSides);
  const { request } = buildJungleAnalysis(
    game,
    model,
    options.difficulty === 'easy' ? 'baseline' : 'lookahead3',
    50_000,
    enumerate,
  );
  return {
    ...request,
    state: {
      ...request.state,
      aiMovePolicy: `${describeAiMovePolicy(2)} These restrictions apply only to AI-controlled sides ${aiSides.join(', ')}. Human replies may use every engine-legal move.`,
    },
  };
}
