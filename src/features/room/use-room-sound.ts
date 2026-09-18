import { useEffect, useRef } from 'react';
import { playSound, stopSounds } from '../../lib/sound';
import type { FlightPlayback } from './flight-playback-queue';
import { roomSound } from './room-sound';

export function useRoomSound(playback: FlightPlayback) {
  const previous = useRef(playback);
  useEffect(() => {
    const sound = roomSound(previous.current, playback);
    previous.current = playback;
    if (sound) playSound(sound);
  }, [playback]);
  useEffect(() => () => stopSounds(), []);
}
