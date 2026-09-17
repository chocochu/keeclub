import { useEffect, useRef } from 'react';
import { BookOpen, X } from 'lucide-react';
import { RULES, RULE_TITLES, jungleRules, type GameKind } from '../../shared/game';
import type { FlightSettings, JungleSettings } from '../../shared/contracts';
import { GAME_INFO } from '../lib/game-info';
import { useAppStore } from '../stores/app-store';
export function RulesPanel({
  kind,
  jungleSettings,
  flightSettings,
}: {
  kind: GameKind;
  jungleSettings?: JungleSettings;
  flightSettings?: FlightSettings;
}) {
  const closeRules = useAppStore((s) => s.closeRules);
  const info = GAME_INFO[kind];
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    ref.current?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
  }, []);
  return (
    <section className="rules-panel" id="rules" ref={ref}>
      <div className="section-heading">
        <h2>
          <BookOpen size={20} />
          {info.name}・玩法指南
        </h2>
        <button onClick={closeRules} aria-label="關閉玩法指南">
          <X size={18} />
        </button>
      </div>
      <p className="rules-intro">
        {kind === 'flight' ? '傳統玩法 · 2–4 人 · 每人 4 架飛機' : '2 人對弈 · 朱紅先行'}
      </p>
      {kind === 'flight' && flightSettings && (
        <p className="rules-setting">
          <strong>本局設定</strong> 三次六：
          {flightSettings.tripleSix === 'closest'
            ? '最近終點的一架未完成飛機返回機場'
            : '未完成飛機全部返回機場'}
        </p>
      )}
      <ol>
        {(kind === 'jungle' ? jungleRules(jungleSettings) : RULES[kind]).map((r, i) => (
          <li key={r}>
            <span className="rule-number">{String(i + 1).padStart(2, '0')}</span>
            <div>
              <h3>{RULE_TITLES[kind][i]}</h3>
              <p>{r}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
