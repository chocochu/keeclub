import { MutationCache, QueryClient, queryOptions } from '@tanstack/react-query';
import type { Credentials, RoomView } from '../../shared/contracts';
import { useAppStore } from '../stores/app-store';
import { api, ApiError } from './api';
import { newestRoom, roomKey } from './room-cache';
import { isBrowserRoom } from './room-location';

export const queryClient = new QueryClient({
  mutationCache: new MutationCache({
    onError: (error) => useAppStore.getState().setError(error.message),
  }),
  defaultOptions: {
    queries: {
      retry: (count, error) => !(error instanceof ApiError && error.status < 500) && count < 2,
      staleTime: 30_000,
    },
    mutations: { retry: false },
  },
});
export const configQuery = queryOptions({
  queryKey: ['config'],
  queryFn: ({ signal }) => api.config(signal),
});
export const roomQuery = (credentials: Credentials) =>
  queryOptions({
    queryKey: roomKey(credentials),
    networkMode: isBrowserRoom(credentials.code) ? 'always' : 'online',
    queryFn: async ({ signal }) => (await api.room(credentials, signal)).room,
    structuralSharing: (oldData, newData) =>
      newestRoom(oldData as RoomView | undefined, newData as RoomView),
  });
