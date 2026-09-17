import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { cacheRoom } from '../../lib/room-cache';
import { readCredentials } from '../../lib/storage';
import { useAppStore } from '../../stores/app-store';

export function useEnterRoom() {
  const client = useQueryClient();
  const local = useAppStore(
    (s) =>
      !s.joining &&
      (s.mode === 'local' || (s.kind === 'flight' && s.mode === 'ai')) &&
      (s.kind !== 'flight' ||
        !s.flightPlayers.slice(0, s.flightSettings.playerCount).some((p) => p.ai)),
  );
  return useMutation({
    mutationKey: ['enter-room'],
    networkMode: local ? 'always' : 'online',
    mutationFn: async () => {
      const {
        joining,
        code,
        name,
        kind,
        mode,
        flightSettings,
        flightPlayers,
        jungleSettings,
        setError,
      } = useAppStore.getState();
      setError('');
      const existing = joining ? readCredentials(code.trim().toUpperCase()) : null;
      if (existing) return { credentials: existing, room: (await api.room(existing)).room };
      const result = joining
        ? await api.join(code.trim().toUpperCase(), name.trim() || '朋友')
        : await api.create({
            kind,
            mode: kind === 'flight' && mode === 'ai' ? 'local' : mode,
            name: name.trim() || '玩家一',
            ...(kind === 'flight'
              ? {
                  flightSettings,
                  flightPlayers: flightPlayers.slice(0, flightSettings.playerCount),
                }
              : { jungleSettings }),
          });
      return { credentials: { code: result.room.code, token: result.token }, room: result.room };
    },
    onSuccess: ({ credentials, room }) => {
      cacheRoom(client, credentials, room);
      useAppStore.getState().enterRoom(credentials);
    },
  });
}
