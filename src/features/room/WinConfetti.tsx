import { useLayoutEffect, useRef } from 'react';
import type { Game } from '../../../shared/contracts';
import { celebrationWinner } from './presentation';
import { PIECE_COLOURS } from './flight-board-geometry';

const PARTICLES = Array.from({ length: 48 }, (_, i) => i);

export function WinConfetti({ game }: { game: Game }) {
  const winner = celebrationWinner(game);
  const previous = useRef(winner);
  const ref = useRef<HTMLDivElement>(null);
  const animations = useRef<Animation[]>([]);

  useLayoutEffect(() => {
    const cancel = () => animations.current.forEach((animation) => animation.cancel());
    return cancel;
  }, []);

  useLayoutEffect(() => {
    const isNewWin = previous.current === null && winner !== null;
    previous.current = winner;
    if (winner === null) {
      animations.current.forEach((animation) => animation.cancel());
      return;
    }
    if (!isNewWin) return;
    animations.current = Array.from(ref.current?.children ?? []).map((particle, i) =>
      particle.animate(
        [
          { transform: `translate(0, -20px) rotate(${i * 31}deg)`, opacity: 0, offset: 0 },
          { opacity: 1, offset: 0.08 },
          { opacity: 1, offset: 0.75 },
          {
            transform: `translate(${((i * 17) % 160) - 80}px, ${window.innerHeight + 40}px) rotate(${i * 31 + 540}deg)`,
            opacity: 0,
            offset: 1,
          },
        ],
        { duration: 1800 + (i % 4) * 150, delay: (i % 8) * 35, easing: 'linear' },
      ),
    );
  }, [winner]);

  return (
    <div className="win-confetti" ref={ref} aria-hidden="true">
      {PARTICLES.map((i) => (
        <i
          key={i}
          style={{
            left: `${(i * 37) % 100}%`,
            backgroundColor: i % 3 === 0 ? '#d9ad42' : PIECE_COLOURS[winner ?? 0],
          }}
        />
      ))}
    </div>
  );
}
