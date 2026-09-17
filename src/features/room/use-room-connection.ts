import { Value } from '@sinclair/typebox/value';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { RoomViewSchema, type Credentials } from '../../../shared/contracts';
import { api } from '../../lib/api';
import { cacheRoom } from '../../lib/room-cache';
import { useAppStore } from '../../stores/app-store';
import { isBrowserRoom } from '../../lib/room-location';
import { localRoomKey, localRooms } from '../../lib/local-rooms';

export function useRoomConnection(credentials: Credentials) {
  const client = useQueryClient();
  useEffect(() => {
    const { setConnection, setError } = useAppStore.getState();
    if (isBrowserRoom(credentials.code)) {
      setConnection('connected');
      const onStorage = (event: StorageEvent) => {
        if (event.key !== localRoomKey(credentials.code)) return;
        try {
          cacheRoom(client, credentials, localRooms.read(credentials.code));
        } catch (error) {
          setError(error instanceof Error ? error.message : '本機存檔無法讀取。');
        }
      };
      window.addEventListener('storage', onStorage);
      return () => window.removeEventListener('storage', onStorage);
    }
    let active = true,
      socket: ReturnType<typeof api.subscribe>,
      retry: ReturnType<typeof setTimeout>,
      attempts = 0;
    const connect = () => {
      if (!active) return;
      setConnection('connecting');
      socket = api.subscribe(credentials.code);
      socket.on('open', () => {
        if (active) socket.send(credentials);
      });
      socket.subscribe(({ data: room }) => {
        if (!active) return;
        try {
          if (!Value.Check(RoomViewSchema, room) || room.code !== credentials.code)
            throw new Error('Invalid room');
          attempts = 0;
          setConnection('connected');
          cacheRoom(client, credentials, room);
        } catch {
          setError('收到無效棋局，正在重新連線。');
          socket.close();
        }
      });
      socket.on('close', (event) => {
        if (!active) return;
        setConnection('disconnected');
        if (event.code === 1008) {
          void client.invalidateQueries({ queryKey: ['room', credentials.code] });
          return;
        }
        retry = setTimeout(connect, Math.min(5000, 750 * 2 ** attempts++));
      });
      socket.on('error', () => socket.close());
    };
    connect();
    return () => {
      active = false;
      clearTimeout(retry);
      socket.close();
    };
  }, [client, credentials]);
}
