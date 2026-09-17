import { Hero } from './Hero';
import { GamePicker } from './GamePicker';
import { SetupPanel } from './SetupPanel';
export function Lobby() {
  return (
    <section className="lobby">
      <Hero />
      <div className="lobby-layout">
        <GamePicker />
        <SetupPanel />
      </div>
    </section>
  );
}
