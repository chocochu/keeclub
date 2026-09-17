import { Check, Clock3 } from 'lucide-react';
import { createGame, type GameKind } from '../../../shared/game';
import { FlightBoard, JungleBoard } from '../../Boards';
import { GAME_INFO } from '../../lib/game-info';
import { useAppStore } from '../../stores/app-store';
export function GamePicker() {
  const kind = useAppStore((s) => s.kind),
    setKind = useAppStore((s) => s.setKind);
  return (
    <section className="game-selection" aria-labelledby="game-picker-label">
      <h2 id="game-picker-label" className="section-label">
        選擇遊戲
      </h2>
      <div className="game-options">
        {(['jungle', 'flight'] as GameKind[]).map((g) => (
          <button
            key={g}
            className={`game-card ${kind === g ? 'chosen' : ''}`}
            onClick={() => setKind(g)}
            aria-pressed={kind === g}
            aria-label={`選擇${GAME_INFO[g].name}`}
          >
            <div className={`game-art ${g}`} aria-hidden="true">
              <div className="mini-board">
                {g === 'jungle' ? (
                  <JungleBoard game={createGame(g)} preview />
                ) : (
                  <FlightBoard game={createGame(g)} preview />
                )}
              </div>
            </div>
            <div className="game-card-copy">
              <h3>{GAME_INFO[g].name}</h3>
              <span className="selection-check" aria-hidden="true">
                {kind === g && <Check size={15} />}
              </span>
              <span className="game-meta">
                <Clock3 size={13} />
                {GAME_INFO[g].time}
              </span>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}
