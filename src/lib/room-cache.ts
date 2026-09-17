import type { QueryClient } from '@tanstack/react-query';
import type { Credentials, RoomView } from '../../shared/contracts';

export const roomKey = (credentials: Credentials) =>
  ['room', credentials.code, credentials.token] as const;
/** HTTP responses may arrive after a newer WebSocket event. Never roll the board back. */
export function newestRoom(current: RoomView | undefined, next: RoomView): RoomView {
  return current && current.revision > next.revision ? current : next;
}
export function cacheRoom(client: QueryClient, credentials: Credentials, room: RoomView) {
  client.setQueryData<RoomView>(roomKey(credentials), (current) => newestRoom(current, room));
}
