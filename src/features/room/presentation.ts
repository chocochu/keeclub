import type { Game, Side } from '../../../shared/contracts';
import { SIDE_NAMES } from '../../../shared/game';

/** Old saved logs are plain strings. Only known turn continuations inherit a side. */
export function coloredHistory(lines: string[]) {
  let previous: Side | undefined;
  return lines.map((text) => {
    const named = SIDE_NAMES.findIndex((name) => text.startsWith(name));
    const continuation = /^(連續三次 6|沒有可移動的飛機)/.test(text);
    const side = named >= 0 ? (named as Side) : continuation ? previous : undefined;
    previous = side;
    return { text, side };
  });
}

/** First place is decided before a four-player match ends; celebrate it only once. */
export function celebrationWinner(game: Game): Side | null {
  if (game.winner === 'draw') return null;
  return game.kind === 'flight' ? (game.rankings?.[0] ?? game.winner) : game.winner;
}
