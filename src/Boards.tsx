import { Castle, Crosshair, Waves } from 'lucide-react';
import { ANIMALS, coord, den, trap, water, type Game, type Move } from '../shared/game';

export function JungleBoard({
  game,
  moves = [],
  selected,
  onSelect,
  onMove,
  preview = false,
}: {
  game: Game;
  moves?: Move[];
  selected?: string | null;
  onSelect?: (id: string) => void;
  onMove?: (id: string) => void;
  preview?: boolean;
}) {
  const destinations = moves.filter((m) => m.piece === selected);
  return (
    <div
      className={`jungle-board ${preview ? 'preview' : ''}`}
      aria-label={preview ? '鬥獸棋棋盤預覽' : '鬥獸棋棋盤'}
    >
      <div className="jungle-grid">
        <div className="jungle-pieces" aria-hidden="true">
          {game.pieces.map((piece) => (
            <div
              key={piece.id}
              className="jungle-piece"
              style={{ transform: `translate(${piece.x * 100}%, ${piece.y * 100}%)` }}
            >
              <span
                className={`animal side-${piece.side} ${selected === piece.id ? 'selected' : ''}`}
              >
                <span>{ANIMALS[piece.rank]}</span>
                <sup>{piece.rank}</sup>
              </span>
            </div>
          ))}
        </div>
        {Array.from({ length: 63 }, (_, i) => {
          const x = i % 7,
            y = Math.floor(i / 7),
            piece = game.pieces.find((p) => p.x === x && p.y === y);
          const destination = destinations.find((m) => m.x === x && m.y === y);
          const isDen = den(x, y),
            isTrap = trap(x, y),
            isWater = water(x, y);
          const label = `${coord(x, y)}${piece ? ` ${piece.side === 0 ? '朱紅' : '青綠'}${ANIMALS[piece.rank]}` : isDen !== null ? ' 獸穴' : isTrap !== null ? ' 陷阱' : isWater ? ' 河流' : ''}`;
          const content = (
            <>
              {isWater && !piece && <Waves className="terrain water-mark" />}
              {isDen !== null && <Castle className="terrain den-mark" />}
              {isTrap !== null && !piece && <Crosshair className="terrain trap-mark" />}
              {destination && <span className={`destination ${piece ? 'capture' : ''}`} />}
            </>
          );
          const className = `jungle-cell ${isWater ? 'river' : ''} ${isDen !== null ? 'den' : ''} ${game.lastMove?.x === x && game.lastMove?.y === y ? 'last-cell' : ''}`;
          return preview ? (
            <div key={i} className={className}>
              {content}
            </div>
          ) : (
            <button
              type="button"
              key={i}
              className={className}
              aria-label={label}
              aria-pressed={!!piece && selected === piece.id}
              onClick={() =>
                destination
                  ? onMove?.(destination.id)
                  : piece
                    ? onSelect?.(piece.id)
                    : onSelect?.('')
              }
              disabled={!destination && (!piece || !moves.some((m) => m.piece === piece.id))}
            >
              {content}
            </button>
          );
        })}
      </div>
      {!preview && (
        <div className="board-files">
          {'ABCDEFG'.split('').map((c) => (
            <span key={c}>{c}</span>
          ))}
        </div>
      )}
    </div>
  );
}
export { FlightBoard } from './features/room/FlightBoard';
