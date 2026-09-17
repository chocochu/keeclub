import { Crown, Plane } from 'lucide-react';
import type { RoomView, Side } from '../../../shared/contracts';
import { SIDE_NAMES } from '../../../shared/game';
import type { FlightScene } from './flight-playback';

export function Scoreboard({
  room,
  landing,
}: {
  room: RoomView;
  landing?: FlightScene['landing'];
}) {
  const { game } = room;
  return (
    <section className="plane-progress" aria-label="飛行進度">
      <div className="score-heading">
        <span>飛行進度</span>
        <span>已完成</span>
      </div>
      {room.players.map((player, side) => {
        const completed = game.planes[side].filter(
          (p, index) => p === 56 && !(landing?.side === side && landing.index === index),
        ).length;
        const rank = game.rankings?.indexOf(side as Side) ?? -1;
        return (
          <div
            className="score-row"
            key={side}
            data-player={side}
            data-completed={completed}
            data-current={(game.winner === null && game.turn === side) || undefined}
          >
            <div className="score-player">
              {rank === 0 ? <Crown size={15} /> : <Plane size={15} />}
              <strong>{player?.name}</strong>
              <span>{SIDE_NAMES[side]}</span>
              {game.winner === null && game.turn === side && (
                <span className="score-turn">▶ 回合中</span>
              )}
            </div>
            <b className="score-count" aria-label={`已完成 ${completed} 架，共 4 架`}>
              {completed}/4
            </b>
            <meter
              className="sr-only"
              aria-label={`${player?.name}已完成飛機`}
              min={0}
              max={4}
              value={completed}
            />
            <div className="score-track" aria-hidden="true">
              {[0, 1, 2, 3].map((n) => (
                <i key={n} data-filled={n < completed || undefined} />
              ))}
            </div>
            <span className={`score-remaining ${rank >= 0 ? 'ranked' : ''}`}>
              {game.withdrawn?.includes(side as Side)
                ? '已認輸'
                : rank >= 0
                  ? `第 ${rank + 1} 名`
                  : `尚餘 ${4 - completed} 架`}
            </span>
          </div>
        );
      })}
    </section>
  );
}
