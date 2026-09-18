import { isAiPlayer } from '../../../shared/players';
import { useState } from 'react';
import { Sparkles, Users } from 'lucide-react';
import { ANIMALS, SIDE_NAMES } from '../../../shared/game';
import type { Move, RoomView, RoomCommand } from '../../../shared/contracts';
import type { FlightScene } from './flight-playback';
import { FlightBoard, JungleBoard } from '../../Boards';
import { useGameSounds } from '../../components/GameSoundProvider';
export function GameTable({
  room,
  moves,
  action,
  motionMs,
  leap,
  landing,
}: {
  room: RoomView;
  moves: Move[];
  action: (command: RoomCommand) => void;
  motionMs: number;
  leap?: FlightScene['leap'];
  landing?: FlightScene['landing'];
}) {
  const { playSound } = useGameSounds();
  const { game, kind } = room;
  const [selection, setSelection] = useState<{ id: string; revision: number } | null>(null);
  const selected = selection?.revision === room.revision ? selection.id : null;
  return (
    <section className="table-area">
      <div
        className="table-opponents"
        style={{ gridTemplateColumns: `repeat(${room.players.length - 1}, minmax(0, 1fr))` }}
      >
        {room.players.slice(1).map((player, offset) => {
          const side = offset + 1;
          return (
            <div
              className="table-player"
              key={side}
              data-player={side}
              data-current={(room.ready && game.winner === null && game.turn === side) || undefined}
            >
              <span className={`player-disc side-${side}`}>
                {isAiPlayer(room, side) ? <Sparkles size={17} /> : <Users size={17} />}
              </span>
              <strong title={player?.name}>{player?.name ?? '等朋友加入…'}</strong>
              <small>
                {SIDE_NAMES[side]}方{room.side === side ? ' · 你' : ''}
              </small>
              {player?.connected && <span className="presence-dot" />}
              {game.turn === side && game.winner === null && room.ready && (
                <span className="turn-tag">▶ {room.thinking ? '思考中' : '目前回合'}</span>
              )}
            </div>
          );
        })}
      </div>
      <div className="board-surface">
        {game &&
          (kind === 'jungle' ? (
            <JungleBoard
              game={game}
              moves={moves}
              selected={selected}
              onSelect={(id) => {
                if (id && id !== selected) playSound('select');
                setSelection({ id, revision: room.revision });
              }}
              onMove={(id) => void action({ type: 'move', id })}
            />
          ) : (
            <FlightBoard
              game={game}
              motionMs={motionMs}
              leap={leap}
              landing={landing}
              moves={moves}
              onMove={(id) => void action({ type: 'move', id })}
            />
          ))}
      </div>
      <div
        className="table-player bottom"
        data-player={0}
        data-current={(room.ready && game.winner === null && game.turn === 0) || undefined}
      >
        <span className="player-disc side-0">
          <Users size={17} />
        </span>
        <strong>{room.players[0]?.name}</strong>
        <small>朱紅方{room.side === 0 && room.mode !== 'local' ? ' · 你' : ''}</small>
        {game?.turn === 0 && game.winner === null && room.ready && (
          <span className="turn-tag">▶ 目前回合</span>
        )}
      </div>
      {moves.length > 0 && (
        <p className="board-hint">
          {kind === 'jungle'
            ? selected
              ? `已選${ANIMALS[game.pieces.find((p) => p.id === selected)?.rank ?? 0]} · 點選圓點移動，光圈表示可吃子`
              : '點選自己的棋子，查看可走的位置。'
            : '擲骰後，點選有光圈的飛機移動。'}
        </p>
      )}
    </section>
  );
}
