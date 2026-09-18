import { useEffect, useRef } from 'react';
import { useGameSounds } from '../../components/GameSoundProvider';
import type { FlightPlayback } from './flight-playback-queue';
import { roomSound } from './room-sound';

export function useRoomSound(playback: FlightPlayback) {
  const { playSound, stopSounds } = useGameSounds();
  const previous = useRef(playback);
  useEffect(() => {
    const sound = roomSound(previous.current, playback);
    previous.current = playback;
    if (sound) playSound(sound);
  }, [playback, playSound]);
  useEffect(() => () => stopSounds(), [stopSounds]);
}
