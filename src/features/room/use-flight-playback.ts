import { useQueryClient } from '@tanstack/react-query';
import { useLayoutEffect, useState } from 'react';
import type { Credentials, RoomView } from '../../../shared/contracts';
import { roomKey } from '../../lib/room-cache';
import { FlightPlaybackQueue, idlePlayback, subscribeFlightRoom } from './flight-playback-queue';

export function useFlightPlayback(
  room: RoomView,
  credentials: Credentials,
  keyboardInstant: boolean,
) {
  const client = useQueryClient();
  const [playback, setPlayback] = useState(() => idlePlayback(room));
  const [player] = useState(() => new FlightPlaybackQueue(room, setPlayback));

  useLayoutEffect(() => {
    player.setKeyboardInstant(keyboardInstant);
  }, [player, keyboardInstant]);

  useLayoutEffect(() => {
    const unsubscribe = subscribeFlightRoom(client, credentials, (next) => player.receive(next));
    const cached = client.getQueryData<RoomView>(roomKey(credentials));
    if (cached) player.receive(cached);
    return () => {
      unsubscribe();
      player.dispose();
    };
  }, [client, credentials, player]);

  useLayoutEffect(() => player.receive(room), [player, room]);
  return room.kind === 'flight' ? playback : idlePlayback(room);
}
