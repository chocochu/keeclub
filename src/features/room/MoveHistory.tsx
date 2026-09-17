import type { Game } from '../../../shared/contracts';
import { SIDE_NAMES } from '../../../shared/game';
import { coloredHistory } from './presentation';
export function MoveHistory({ game }: { game: Game }) {
  return (
    <section className="move-history">
      <div className="section-heading">
        <h3>棋局紀錄</h3>
        <span>{game?.ply ?? 0} 步</span>
      </div>
      {!game?.log.length ? (
        <div className="history-empty">
          <p>走棋後會顯示紀錄。</p>
        </div>
      ) : (
        <ol aria-live="polite">
          {coloredHistory(game.log)
            .slice(-8)
            .reverse()
            .map(({ text, side }, i) => (
              <li key={`${game.log.length}-${i}`} data-player={side}>
                <span className="history-number">
                  {String(game.log.length - i).padStart(2, '0')}
                </span>
                <span className="history-marker" aria-hidden="true" />
                <span className="history-text">
                  {side !== undefined && !text.startsWith(SIDE_NAMES[side]) && (
                    <span className="sr-only">{SIDE_NAMES[side]} · </span>
                  )}
                  {text}
                </span>
              </li>
            ))}
        </ol>
      )}
    </section>
  );
}
