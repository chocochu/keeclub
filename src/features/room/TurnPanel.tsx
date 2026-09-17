import { Copy, Crown, Dice5, LoaderCircle, RotateCcw, Users } from 'lucide-react';
import { SIDE_NAMES, jungleRestrictions } from '../../../shared/game';
import type { RoomView, RoomCommand } from '../../../shared/contracts';
import { copyInvite } from './copy-invite';
import { flightRollCue, roomStatus } from './selectors';
import type { FlightPhase, FlightScene } from './flight-playback';
import { Dice } from './Dice';
import { Scoreboard } from './Scoreboard';
export function TurnPanel({
  room,
  busy,
  canPlay,
  myTurn,
  action,
  rolling,
  instantMotion,
  playbackPhase,
  landing,
}: {
  room: RoomView;
  busy: boolean;
  canPlay: boolean;
  myTurn: boolean;
  action: (command: RoomCommand) => void;
  rolling: boolean;
  instantMotion: boolean;
  playbackPhase: FlightPhase;
  landing?: FlightScene['landing'];
}) {
  const { game, kind } = room;
  const rollCue = flightRollCue(game);
  const phaseLabels: Record<FlightPhase, string> = {
    idle: '',
    roll: `${room.players[game.turn]?.name ?? ''} 擲出 ${game.lastDie}`,
    step: '飛機前進中',
    jump: '同色跳躍',
    shortcut: '捷徑飛行',
    capture: '敵機返回機場',
    return: '三次六 · 返回機場',
    finish: '完成飛行',
  };
  const status = phaseLabels[playbackPhase] || roomStatus(room, myTurn);
  const active = room.ready && game.winner === null;
  const restrictions = kind === 'jungle' && active ? jungleRestrictions(game) : [];
  const copy = () => copyInvite(room.code);
  return (
    <section
      className="turn-panel"
      data-player={active ? game.turn : undefined}
      data-current={active || undefined}
    >
      {room.ready && (
        <div className="eyebrow">
          {game?.winner !== null
            ? '對局結束'
            : game?.kind === 'flight'
              ? `目前回合 · ${SIDE_NAMES[game.turn]}方`
              : `第 ${Math.floor((game?.ply ?? 0) / 2) + 1} 回合 · ${SIDE_NAMES[game.turn]}方`}
        </div>
      )}
      <h2>
        {game?.winner !== null ? (
          <Crown />
        ) : room.thinking ? (
          <LoaderCircle className="spin" />
        ) : !room.ready ? (
          <Users />
        ) : (
          <span className={`status-piece side-${game?.turn}`} />
        )}{' '}
        {active ? room.players[game.turn]?.name : status}
        {active && room.mode !== 'local' && myTurn && <span className="your-turn-label">你</span>}
      </h2>
      {active && <output className="turn-instruction">{status}</output>}
      {!room.ready ? (
        <>
          <p>朋友加入後即可開始。</p>
          <button className="primary-button" onClick={() => void copy()}>
            <Copy size={17} />
            複製邀請連結
          </button>
        </>
      ) : game?.winner !== null ? (
        <>
          <button
            className="primary-button"
            disabled={busy || room.rematch.includes(room.side)}
            onClick={() => void action({ type: 'rematch' })}
          >
            <RotateCcw size={17} />
            {room.rematch.includes(room.side)
              ? '等候對方同意…'
              : room.rematch.length
                ? '接受再來一局'
                : '再來一局'}
          </button>
        </>
      ) : kind === 'flight' ? (
        <div className="dice-section" data-roll-cue={rollCue ?? undefined}>
          <Dice
            value={game.lastDie}
            rollCount={game.rollCount ?? 0}
            rolling={rolling}
            instantMotion={instantMotion}
          />
          <button
            className="primary-button"
            disabled={!canPlay || game?.die !== null}
            onClick={() => void action({ type: 'roll' })}
          >
            {playbackPhase !== 'idle' ? (
              '播放中…'
            ) : game?.die !== null ? (
              '選一架飛機'
            ) : (
              <>
                {rolling ? <LoaderCircle size={17} className="spin" /> : <Dice5 size={17} />}
                {rollCue === 'extra' ? '再擲一次' : '擲骰子'}
              </>
            )}
          </button>
          {rollCue && (
            <output className={`roll-cue ${rollCue}`}>
              {rollCue === 'extra' ? <RotateCcw size={17} /> : <Dice5 size={17} />}
              <span>
                {rollCue === 'extra'
                  ? '擲出 6 · 再擲一次'
                  : game.flightSettings?.tripleSix === 'closest'
                    ? '三次六 · 最近終點的一架返回'
                    : '三次六 · 未完成飛機全部返回'}
              </span>
            </output>
          )}
        </div>
      ) : null}
      {kind === 'jungle' && room.mode === 'ai' && (
        <p className="room-ai-difficulty">
          AI 難度 · <strong>{room.aiDifficulty === 'normal' ? 'Normal' : 'Easy'}</strong>
        </p>
      )}
      {kind === 'jungle' && (
        <p className="room-rule-setting">
          鼠跨水陸互吃：{game.jungleSettings?.ratCaptureAcrossBank ? '允許' : '不允許'}
          <br />
          獅虎跳過己方鼠：{game.jungleSettings?.jumpOverOwnRat ? '允許' : '不允許'}
        </p>
      )}
      {restrictions.length > 0 && (
        <output className="room-rule-setting">
          暫時禁走：{restrictions.map(({ move, rule }) => `${move.label}（${rule}）`).join('；')}
          。請選擇其他走法。
        </output>
      )}
      {room.aiError && (
        <div className="ai-error" role="alert">
          <p>{room.aiError}</p>
          <button
            className="text-button"
            disabled={busy}
            onClick={() => void action({ type: 'retry' })}
          >
            <RotateCcw size={15} />
            重試 AI 回合
          </button>
        </div>
      )}
      {kind === 'flight' && room.ready && <Scoreboard room={room} landing={landing} />}
    </section>
  );
}
