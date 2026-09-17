import { Monitor, Sparkles, Users } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { SIDE_NAMES } from '../../../shared/game';
import { useAppStore } from '../../stores/app-store';

export function FlightSetup() {
  const { mode, setMode, name, setName, settings, setSettings, players, setPlayer } = useAppStore(
    useShallow((s) => ({
      mode: s.mode === 'ai' ? 'local' : s.mode,
      setMode: s.setMode,
      name: s.name,
      setName: s.setName,
      settings: s.flightSettings,
      setSettings: s.setFlightSettings,
      players: s.flightPlayers,
      setPlayer: s.setFlightPlayer,
    })),
  );
  const seats = players.slice(0, settings.playerCount);
  const aiCount = seats.filter((seat) => seat.ai).length;
  const humanCount = seats.length - aiCount;
  return (
    <div className="flight-setup">
      <fieldset className="flight-mode opponent-options">
        <legend className="field-label">一起怎樣玩？</legend>
        {(
          [
            { value: 'friend', label: '好友連線', detail: '分享房間，各自加入', Icon: Users },
            { value: 'local', label: '同機對戰', detail: '共用裝置，輪流操作', Icon: Monitor },
          ] as const
        ).map(({ value, label, detail, Icon }) => (
          <button
            key={value}
            type="button"
            aria-pressed={mode === value}
            className={mode === value ? 'active' : ''}
            onClick={() => setMode(value)}
          >
            <span>
              <Icon size={17} />
              {label}
            </span>
            <small>{detail}</small>
          </button>
        ))}
      </fieldset>
      <fieldset className="flight-roster">
        <legend>安排玩家</legend>
        <div className="flight-count-row">
          <span id="flight-count-label">總人數</span>
          <fieldset className="flight-count" aria-labelledby="flight-count-label">
            {[2, 3, 4].map((count) => (
              <button
                key={count}
                type="button"
                aria-pressed={settings.playerCount === count}
                onClick={() => setSettings({ ...settings, playerCount: count })}
              >
                {count} 人
              </button>
            ))}
          </fieldset>
        </div>
        <p className="flight-roster-note">
          {mode === 'local'
            ? '每位真人都可以填暱稱；留白會使用預設名稱。'
            : '你是房主，朋友加入時可填自己的暱稱。'}
        </p>
        <div className="flight-seats">
          {seats.map((seat, index) => (
            <div className="flight-seat" data-player={index} key={index}>
              <div className="flight-seat-heading">
                <label htmlFor={index === 0 ? 'player-name' : `flight-seat-${index}`}>
                  <span className="flight-seat-dot" />
                  {SIDE_NAMES[index]}方
                </label>
                {index === 0 ? (
                  <span className="flight-host">{mode === 'friend' ? '你 · 房主' : '玩家 1'}</span>
                ) : (
                  <select
                    id={`flight-seat-${index}`}
                    aria-label={`${SIDE_NAMES[index]}方玩家類型`}
                    value={seat.ai ? 'ai' : 'human'}
                    onChange={(event) =>
                      setPlayer(index, { ...seat, ai: event.target.value === 'ai' })
                    }
                  >
                    <option value="human">{mode === 'friend' ? '邀請朋友' : '真人'}</option>
                    <option value="ai">AI</option>
                  </select>
                )}
              </div>
              {index === 0 || (mode === 'local' && !seat.ai) ? (
                <input
                  id={index === 0 ? 'player-name' : `flight-name-${index}`}
                  aria-label={`${SIDE_NAMES[index]}方暱稱`}
                  placeholder={
                    index === 0 ? '你的暱稱（選填）' : `玩家 ${index + 1} 的暱稱（選填）`
                  }
                  maxLength={24}
                  autoComplete="off"
                  value={index === 0 ? name : seat.name}
                  onChange={(event) =>
                    index === 0
                      ? setName(event.target.value)
                      : setPlayer(index, { ...seat, name: event.target.value })
                  }
                />
              ) : (
                <div className="flight-seat-detail">
                  {seat.ai ? (
                    <>
                      <Sparkles size={14} />
                      AI {index} · 自動擲骰與走棋
                    </>
                  ) : (
                    <>
                      <Users size={14} />
                      建立房間後，分享邀請連結
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
        <p className="flight-roster-summary" aria-live="polite">
          <Users size={15} />
          {humanCount} 位真人<span>＋</span>
          <Sparkles size={14} />
          {aiCount} 位 AI
        </p>
      </fieldset>
      <details className="flight-rules">
        <summary>
          <span>三次六規則</span>
          <span>{settings.tripleSix === 'all' ? '全部返回' : '最近一架返回'}</span>
        </summary>
        <label className="field-label" htmlFor="triple-six">
          連續擲出三次 6
        </label>
        <select
          id="triple-six"
          value={settings.tripleSix}
          onChange={(event) =>
            setSettings({
              ...settings,
              tripleSix: event.target.value === 'closest' ? 'closest' : 'all',
            })
          }
        >
          <option value="all">全部未完成飛機返回機場</option>
          <option value="closest">最接近終點的一架返回</option>
        </select>
        <p className="setup-footnote">已完成的飛機不受罰。</p>
      </details>
    </div>
  );
}
