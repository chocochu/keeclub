import { useEffect } from 'react';
import { ErrorBanner, Toast } from './components/Feedback';
import { Header } from './components/Header';
import { RulesPanel } from './components/RulesPanel';
import { PwaControls } from './components/PwaControls';
import { Lobby } from './features/lobby/Lobby';
import { RoomRoute } from './features/room/RoomRoute';
import { useAppStore } from './stores/app-store';
import { GameSoundProvider } from './components/GameSoundProvider';

export default function App() {
  const credentials = useAppStore((s) => s.credentials),
    rules = useAppStore((s) => s.rules),
    kind = useAppStore((s) => s.kind),
    jungleSettings = useAppStore((s) => s.jungleSettings);
  useEffect(() => {
    const sync = useAppStore.getState().syncLocation;
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, []);
  return (
    <GameSoundProvider>
      <div className="app-shell">
        <Header />
        <main>
          <PwaControls />
          <ErrorBanner />
          {credentials ? <RoomRoute key={credentials.code} credentials={credentials} /> : <Lobby />}
          {rules && !credentials && <RulesPanel kind={kind} jungleSettings={jungleSettings} />}
        </main>
        <Toast />
      </div>
    </GameSoundProvider>
  );
}
