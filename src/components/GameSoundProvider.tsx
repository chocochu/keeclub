import { createContext, useCallback, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { useSound } from '../hooks/use-sound';
import { getAudioContext } from '../lib/sound-engine';
import { gameSounds, type Sound } from '../lib/sound';
import { useAppStore } from '../stores/app-store';

type GameSoundControls = { playSound: (sound: Sound) => void; stopSounds: () => void };
const GameSoundContext = createContext<GameSoundControls | null>(null);

function useCue(cue: Sound) {
  const soundEnabled = useAppStore((s) => s.soundEnabled);
  const { asset, volume } = gameSounds[cue];
  const [play, { stop }] = useSound(asset, { volume, interrupt: true, soundEnabled });
  return useMemo(() => ({ play, stop }), [play, stop]);
}

export function GameSoundProvider({ children }: { children: ReactNode }) {
  const select = useCue('select');
  const move = useCue('move');
  const capture = useCue('capture');
  const roll = useCue('roll');
  const step = useCue('step');
  const jump = useCue('jump');
  const shortcut = useCue('shortcut');
  const returnCue = useCue('return');
  const finish = useCue('finish');
  const win = useCue('win');
  const draw = useCue('draw');
  const bank = useMemo(
    () => ({
      select,
      move,
      capture,
      roll,
      step,
      jump,
      shortcut,
      return: returnCue,
      finish,
      win,
      draw,
    }),
    [select, move, capture, roll, step, jump, shortcut, returnCue, finish, win, draw],
  );
  const stopSounds = useCallback(() => {
    for (const cue of Object.values(bank)) cue.stop();
  }, [bank]);
  const playSound = useCallback(
    (sound: Sound) => {
      if (
        !useAppStore.getState().soundEnabled ||
        document.hidden ||
        typeof AudioContext === 'undefined'
      )
        return;
      // Never schedule old game events into a suspended context to replay on the next gesture.
      try {
        if (getAudioContext().state !== 'running') return;
        bank[sound].play();
      } catch {
        // Audio device failures must not interrupt a game action.
      }
    },
    [bank],
  );

  useEffect(() => {
    const unlock = () => {
      if (!useAppStore.getState().soundEnabled || typeof AudioContext === 'undefined') return;
      try {
        const context = getAudioContext();
        if (context.state !== 'running') void context.resume().catch(() => {});
      } catch {
        /* Audio is optional when the browser has no available output device. */
      }
    };
    const visibility = () => {
      if (document.hidden) stopSounds();
    };
    document.addEventListener('pointerup', unlock, true);
    document.addEventListener('keydown', unlock, true);
    document.addEventListener('click', unlock, true);
    document.addEventListener('visibilitychange', visibility);
    const unsubscribe = useAppStore.subscribe((state) => {
      if (!state.soundEnabled) stopSounds();
    });
    return () => {
      document.removeEventListener('pointerup', unlock, true);
      document.removeEventListener('keydown', unlock, true);
      document.removeEventListener('click', unlock, true);
      document.removeEventListener('visibilitychange', visibility);
      unsubscribe();
      stopSounds();
    };
  }, [stopSounds]);

  const controls = useMemo(() => ({ playSound, stopSounds }), [playSound, stopSounds]);
  return <GameSoundContext.Provider value={controls}>{children}</GameSoundContext.Provider>;
}

export function useGameSounds() {
  const controls = useContext(GameSoundContext);
  if (!controls) throw new Error('Game sounds require GameSoundProvider.');
  return controls;
}
