import { useId, useLayoutEffect, useRef } from 'react';
import { FLIGHT_ROLL_MS } from './flight-playback';

const PIPS: Record<number, number[][]> = {
  1: [[30, 30]],
  2: [
    [14, 14],
    [46, 46],
  ],
  3: [
    [14, 14],
    [30, 30],
    [46, 46],
  ],
  4: [
    [14, 14],
    [46, 14],
    [14, 46],
    [46, 46],
  ],
  5: [
    [14, 14],
    [46, 14],
    [30, 30],
    [14, 46],
    [46, 46],
  ],
  6: [
    [14, 14],
    [46, 14],
    [14, 30],
    [46, 30],
    [14, 46],
    [46, 46],
  ],
};

export function Dice({
  value,
  rollCount,
  rolling,
  instantMotion,
}: {
  value: number | null;
  rollCount: number;
  rolling: boolean;
  instantMotion: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const previousRoll = useRef(rollCount);
  const animation = useRef<Animation | null>(null);
  const pipId = useId();

  useLayoutEffect(() => {
    return () => animation.current?.cancel();
  }, []);

  useLayoutEffect(() => {
    const isNewRoll = rollCount > previousRoll.current;
    previousRoll.current = rollCount;
    const element = ref.current;
    if (!element) return;
    const from =
      animation.current?.playState === 'running'
        ? getComputedStyle(element).transform
        : 'rotate(-180deg) scale(0.92)';
    animation.current?.cancel();
    if (!isNewRoll || instantMotion) return;
    const styles = getComputedStyle(element);
    animation.current = element.animate(
      [{ transform: from }, { transform: 'rotate(0deg) scale(1)' }],
      {
        duration: FLIGHT_ROLL_MS,
        easing: styles.getPropertyValue('--ease-out').trim(),
      },
    );
  }, [rollCount, instantMotion]);

  return (
    <div ref={ref} className="die" aria-busy={rolling} aria-label={`骰子：${value ?? '尚未擲骰'}`}>
      <svg viewBox="0 0 60 60" aria-hidden="true" className="die-face">
        <defs>
          <radialGradient id={pipId} cx="65%" cy="75%" r="85%">
            <stop offset="0" stopColor={value === 1 ? '#c44b3b' : '#465044'} />
            <stop offset="1" stopColor={value === 1 ? '#78231e' : '#18251f'} />
          </radialGradient>
        </defs>
        {(PIPS[value ?? 0] ?? []).map(([x, y]) => (
          <circle
            className="die-pip"
            key={`${x}-${y}`}
            cx={x}
            cy={y}
            r={value === 1 ? 6 : 5}
            fill={`url(#${pipId})`}
            stroke="#fffdf1"
            strokeWidth=".8"
          />
        ))}
        {value === null && (
          <path d="M24 30h12" stroke="#aba693" strokeWidth="3" strokeLinecap="round" />
        )}
      </svg>
    </div>
  );
}
