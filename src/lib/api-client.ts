import { treaty } from '@elysiajs/eden';
import type { App } from '../../server/app';
import type { Credentials } from '../../shared/contracts';
import { isHumanLocalGame, localRooms } from './local-rooms';
import { isBrowserRoom } from './room-location';

/** Import only the server type: server code and secrets never enter the browser bundle. */
export const createTreatyClient = (origin: string) => treaty<App>(origin);
type Client = ReturnType<typeof createTreatyClient>;
type RoomEndpoint = ReturnType<Client['api']['rooms']>;
type CreateRoomInput = Parameters<Client['api']['rooms']['post']>[0];
type RoomActionInput = Parameters<RoomEndpoint['action']['post']>[0];
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
function unwrap<T>(result: {
  data: T | null;
  error: { status: number; value: unknown } | null;
}): T {
  if (result.error) {
    const value = result.error.value;
    // Treaty wraps fetch failures in an error result, including cancelled queries.
    if (value instanceof Error && value.name === 'AbortError') throw value;
    const message =
      typeof value === 'object' && value !== null && 'error' in value
        ? String(value.error)
        : '暫時無法連線，請稍後重試。';
    throw new ApiError(result.error.status, message);
  }
  if (result.data === null) throw new Error('伺服器未回傳資料。');
  return result.data;
}
const headers = (credentials: Credentials) => ({ authorization: `Bearer ${credentials.token}` });
export function createApi(origin: string) {
  const client = createTreatyClient(origin);
  return {
    config: async (signal?: AbortSignal) =>
      unwrap(await client.api.config.get({ fetch: { signal } })),
    create: async (input: CreateRoomInput) =>
      isHumanLocalGame(input)
        ? localRooms.create(input)
        : unwrap(await client.api.rooms.post(input)),
    join: async (code: string, name: string) =>
      unwrap(await client.api.rooms({ code }).join.post({ name })),
    room: async (credentials: Credentials, signal?: AbortSignal) =>
      isBrowserRoom(credentials.code)
        ? { room: localRooms.read(credentials.code) }
        : unwrap(
            await client.api
              .rooms({ code: credentials.code })
              .get({ headers: headers(credentials), fetch: { signal } }),
          ),
    action: async (credentials: Credentials, action: RoomActionInput) =>
      isBrowserRoom(credentials.code)
        ? localRooms.act(credentials.code, action)
        : unwrap(
            await client.api
              .rooms({ code: credentials.code })
              .action.post(action, { headers: headers(credentials) }),
          ),
    subscribe: (code?: string) =>
      code ? client.api.rooms({ code }).ws.subscribe() : client.ws.subscribe(),
  };
}
