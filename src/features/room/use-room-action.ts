import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Credentials, RoomCommand, RoomView } from '../../../shared/contracts';
import { api } from '../../lib/api';
import { cacheRoom, roomKey } from '../../lib/room-cache';
import { useAppStore } from '../../stores/app-store';
import { isBrowserRoom } from '../../lib/room-location';

export function useRoomAction(credentials: Credentials) {
  const client = useQueryClient();
  return useMutation({
    mutationKey: ['room-action', credentials.code],
    networkMode: isBrowserRoom(credentials.code) ? 'always' : 'online',
    mutationFn: async (command: RoomCommand) => {
      useAppStore.getState().setError('');
      const room = client.getQueryData<RoomView>(roomKey(credentials));
      if (!room) throw new Error('棋局仍在連線，請稍後再試。');
      const action =
        command.type === 'move' || command.type === 'roll'
          ? { ...command, revision: room.revision }
          : command;
      return (await api.action(credentials, action)).room;
    },
    onSuccess: (room) => cacheRoom(client, credentials, room),
    onError: () => {
      void client.invalidateQueries({ queryKey: roomKey(credentials) });
    },
  });
}
