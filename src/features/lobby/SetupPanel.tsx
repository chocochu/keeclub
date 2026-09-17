import { ArrowRight, LoaderCircle, Monitor, RotateCcw, Sparkles, Users } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useShallow } from 'zustand/react/shallow';
import { configQuery } from '../../lib/query-client';
import { readCredentials } from '../../lib/storage';
import { useAppStore } from '../../stores/app-store';
import { FlightSetup } from './FlightSetup';
import { useEnterRoom } from './use-enter-room';
import { isBrowserRoom } from '../../lib/room-location';
import { useOnline } from '../../lib/use-online';
export function SetupPanel() {
  const {
    kind,
    flightSettings,
    flightPlayers,
    jungleSettings,
    setJungleSettings,
    joining,
    setJoining,
    name,
    setName,
    code,
    setCode,
    mode,
    setMode,
    resumeCode,
    enterRoom,
  } = useAppStore(
    useShallow((s) => ({
      kind: s.kind,
      flightSettings: s.flightSettings,
      flightPlayers: s.flightPlayers,
      jungleSettings: s.jungleSettings,
      setJungleSettings: s.setJungleSettings,
      joining: s.joining,
      setJoining: s.setJoining,
      name: s.name,
      setName: s.setName,
      code: s.code,
      setCode: s.setCode,
      mode: s.mode,
      setMode: s.setMode,
      resumeCode: s.resumeCode,
      enterRoom: s.enterRoom,
    })),
  );
  const entry = useEnterRoom();
  const busy = entry.isPending;
  const online = useOnline();
  const hasAi =
    kind === 'flight'
      ? flightPlayers.slice(0, flightSettings.playerCount).some((player) => player.ai)
      : mode === 'ai';
  const needsConnection = !online && (joining || mode === 'friend' || hasAi);
  const { data: config } = useQuery({ ...configQuery, enabled: !joining && hasAi });
  return (
    <aside className="setup-panel">
      <div className="setup-tabs">
        <button
          aria-pressed={!joining}
          className={!joining ? 'active' : ''}
          onClick={() => setJoining(false)}
        >
          開新局
        </button>
        <button
          aria-pressed={joining}
          className={joining ? 'active' : ''}
          onClick={() => setJoining(true)}
        >
          加入房間
        </button>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!busy && !needsConnection) entry.mutate();
        }}
      >
        {(joining || kind !== 'flight') && (
          <>
            <label className="field-label" htmlFor="player-name">
              暱稱<span>選填</span>
            </label>
            <input
              id="player-name"
              placeholder="你的暱稱"
              maxLength={24}
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="off"
            />
          </>
        )}
        {joining ? (
          <>
            <label className="field-label" htmlFor="room-code">
              房間碼
            </label>
            <input
              id="room-code"
              className="code-input"
              placeholder="例如 ABC234"
              value={code}
              required
              minLength={6}
              maxLength={6}
              pattern="[A-Za-z2-9]{6}"
              onChange={(e) => setCode(e.target.value.toUpperCase())}
            />
          </>
        ) : kind === 'flight' ? (
          <FlightSetup />
        ) : (
          <>
            <div className="field-label" id="opponent-label">
              對戰模式
            </div>
            <fieldset className="opponent-options" aria-labelledby="opponent-label">
              {(
                [
                  { value: 'friend', label: '好友', Icon: Users },
                  { value: 'ai', label: 'AI', Icon: Sparkles },
                  { value: 'local', label: '同機', Icon: Monitor },
                ] as const
              ).map(({ value, label, Icon }) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={mode === value}
                  className={mode === value ? 'active' : ''}
                  onClick={() => setMode(value)}
                >
                  <Icon size={17} />
                  {label}
                </button>
              ))}
            </fieldset>
          </>
        )}
        {!joining && kind === 'jungle' && (
          <fieldset className="game-settings">
            <legend>遊戲設定</legend>
            <label className="field-label" htmlFor="rat-bank-capture">
              鼠跨水陸互吃
            </label>
            <select
              id="rat-bank-capture"
              value={String(jungleSettings.ratCaptureAcrossBank)}
              onChange={(event) =>
                setJungleSettings({
                  ...jungleSettings,
                  ratCaptureAcrossBank: event.target.value === 'true',
                })
              }
            >
              <option value="false">不允許（預設）</option>
              <option value="true">允許</option>
            </select>
            <label className="field-label" htmlFor="jump-own-rat">
              獅虎跳過己方鼠
            </label>
            <select
              id="jump-own-rat"
              value={String(jungleSettings.jumpOverOwnRat)}
              onChange={(event) =>
                setJungleSettings({
                  ...jungleSettings,
                  jumpOverOwnRat: event.target.value === 'true',
                })
              }
            >
              <option value="false">不允許（預設）</option>
              <option value="true">允許</option>
            </select>
            <p className="setup-footnote">敵方鼠仍會擋河；7-3、17-5 禁走規則適用於所有對局。</p>
          </fieldset>
        )}
        <button
          type="submit"
          className="primary-button start-button"
          disabled={busy || needsConnection}
        >
          {busy && <LoaderCircle size={18} className="spin" />}
          {busy ? '準備中…' : joining ? '加入房間' : mode === 'friend' ? '建立房間' : '開始對戰'}
          <ArrowRight size={18} />
        </button>
        {needsConnection && (
          <p className="setup-footnote">
            此模式需要網絡；離線時可選同機對戰，並將所有席位設為真人。
          </p>
        )}
        {!joining && hasAi && config && !config.aiAvailable && (
          <p className="setup-footnote">AI 暫未啟用，請將 AI 席位改為真人。</p>
        )}
      </form>
      {resumeCode && readCredentials(resumeCode) && (
        <button
          className="resume-button"
          onClick={() => {
            const credentials = readCredentials(resumeCode);
            if (credentials) enterRoom(credentials);
          }}
        >
          <RotateCcw size={14} />
          返回上一局<span>{isBrowserRoom(resumeCode) ? '本機遊戲' : resumeCode}</span>
        </button>
      )}
    </aside>
  );
}
