import { useAppStore } from '../stores/app-store';

export type Sound =
  | 'select'
  | 'move'
  | 'capture'
  | 'roll'
  | 'step'
  | 'jump'
  | 'shortcut'
  | 'return'
  | 'finish'
  | 'win'
  | 'draw';

// Short, softly enveloped sounds generated locally also work in the offline PWA.
type Note = [frequency: number, duration: number, delay?: number, endFrequency?: number];
const notes: Record<Sound, Note[]> = {
  select: [[740, 0.055]],
  move: [[310, 0.11, 0, 150]],
  capture: [
    [180, 0.15, 0, 65],
    [460, 0.12, 0.045, 220],
  ],
  roll: Array.from({ length: 7 }, (_, i) => [240 + (i % 3) * 110, 0.045, i * 0.085, 100]),
  step: [[520, 0.065, 0, 380]],
  jump: [[330, 0.24, 0, 780]],
  shortcut: [[390, 0.4, 0, 1200]],
  return: [[440, 0.3, 0, 110]],
  finish: [
    [660, 0.16],
    [880, 0.24, 0.12],
  ],
  win: [
    [523.25, 0.2],
    [659.25, 0.2, 0.14],
    [783.99, 0.2, 0.28],
    [1046.5, 0.45, 0.42],
  ],
  draw: [
    [440, 0.25],
    [349.23, 0.35, 0.2],
  ],
};

let context: AudioContext | undefined;
const active = new Set<OscillatorNode>();

/** Called only from a user gesture; never queue sounds while autoplay is blocked. */
export function unlockSound() {
  if (!useAppStore.getState().soundEnabled || typeof AudioContext === 'undefined') return;
  try {
    if (!context || context.state === 'closed') context = new AudioContext();
    if (context.state !== 'running') void context.resume().catch(() => {});
  } catch {
    // Audio is optional: unavailable devices must not interrupt a game.
  }
}

export function stopSounds() {
  for (const oscillator of active) {
    oscillator.stop();
    oscillator.disconnect();
  }
  active.clear();
}

export function playSound(sound: Sound) {
  if (
    !useAppStore.getState().soundEnabled ||
    typeof document === 'undefined' ||
    document.hidden ||
    !context ||
    context.state !== 'running'
  )
    return;
  try {
    const now = context.currentTime;
    for (const [frequency, duration, delay = 0, endFrequency = frequency] of notes[sound]) {
      const oscillator = context.createOscillator();
      const envelope = context.createGain();
      const start = now + delay;
      oscillator.type =
        sound === 'move' || sound === 'roll' || sound === 'capture' ? 'triangle' : 'sine';
      oscillator.frequency.setValueAtTime(frequency, start);
      oscillator.frequency.exponentialRampToValueAtTime(endFrequency, start + duration);
      envelope.gain.setValueAtTime(0, start);
      envelope.gain.linearRampToValueAtTime(sound === 'step' ? 0.045 : 0.09, start + 0.005);
      envelope.gain.exponentialRampToValueAtTime(0.001, start + duration);
      envelope.gain.linearRampToValueAtTime(0, start + duration + 0.015);
      oscillator.connect(envelope);
      envelope.connect(context.destination);
      active.add(oscillator);
      oscillator.onended = () => {
        oscillator.disconnect();
        envelope.disconnect();
        active.delete(oscillator);
      };
      oscillator.start(start);
      oscillator.stop(start + duration + 0.02);
    }
  } catch {
    stopSounds();
  }
}

/** Keep listening so an interrupted mobile audio context can unlock on the next gesture. */
export function listenForSound() {
  const visibility = () => {
    if (document.hidden) stopSounds();
  };
  document.addEventListener('pointerup', unlockSound, true);
  document.addEventListener('keydown', unlockSound, true);
  document.addEventListener('click', unlockSound, true);
  document.addEventListener('visibilitychange', visibility);
  const unsubscribe = useAppStore.subscribe((state) => {
    if (!state.soundEnabled) stopSounds();
  });
  return () => {
    document.removeEventListener('pointerup', unlockSound, true);
    document.removeEventListener('keydown', unlockSound, true);
    document.removeEventListener('click', unlockSound, true);
    document.removeEventListener('visibilitychange', visibility);
    unsubscribe();
    stopSounds();
  };
}
