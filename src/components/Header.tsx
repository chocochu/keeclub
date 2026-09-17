import { BookOpen } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import type { Credentials } from '../../shared/contracts';
import { GAME_INFO } from '../lib/game-info';
import { roomQuery } from '../lib/query-client';
import { useAppStore } from '../stores/app-store';
import { isBrowserRoom } from '../lib/room-location';

function RoomHeading({ credentials }: { credentials: Credentials }) {
  const { data: room } = useQuery(roomQuery(credentials));
  const connected = useAppStore((s) => s.connection === 'connected');
  if (!room) return null;
  return (
    <div className="play-heading">
      <h1>
        {GAME_INFO[room.kind].name}
        <span className="room-mode">
          {room.mode === 'ai' ? 'AI 對戰' : room.mode === 'local' ? '同機對戰' : '好友對戰'}
        </span>
      </h1>
      <output className="connection">
        <span className={`tiny-dot ${connected ? '' : 'offline'}`} />
        {isBrowserRoom(room.code) ? '本機遊戲' : connected ? '已連線' : '正在重新連線…'}
      </output>
    </div>
  );
}

export function Header() {
  const home = useAppStore((s) => s.home),
    credentials = useAppStore((s) => s.credentials),
    rules = useAppStore((s) => s.rules),
    toggleRules = useAppStore((s) => s.toggleRules);
  return (
    <header className={`site-header${credentials ? ' in-room' : ''}`}>
      <button className="brand" onClick={home} aria-label="棋聚首頁">
        <span className="brand-mark">棋</span>
        <span className="brand-name">
          棋聚<small>KEE CLUB</small>
        </span>
      </button>
      {credentials && <RoomHeading credentials={credentials} />}
      <nav>
        <button className={!rules ? 'nav-link current' : 'nav-link'} onClick={home}>
          遊戲大廳
        </button>
        <button className={rules ? 'nav-link current' : 'nav-link'} onClick={toggleRules}>
          <BookOpen size={15} />
          玩法
        </button>
      </nav>
    </header>
  );
}
