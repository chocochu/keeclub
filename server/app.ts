import { Elysia } from 'elysia';
import { securityMiddleware } from './http/security';
import type { RoomOptions } from './rooms/model';
import { roomRoutes } from './rooms/routes';
import { RoomService } from './rooms/service';
import { roomWebSocket } from './rooms/websocket';

export function createApp(options: RoomOptions = {}) {
  const service = new RoomService(options);
  const cleanup = setInterval(() => service.prune(), 60_000);
  cleanup.unref();
  const app = new Elysia({ serve: { maxRequestBodySize: 8192 } })
    .use(securityMiddleware())
    .use(roomRoutes(service))
    .use(roomWebSocket(service, '/ws'))
    .use(roomWebSocket(service, '/api/rooms/:code/ws'))
    .onStop(() => {
      clearInterval(cleanup);
    });
  return {
    app,
    rooms: service.rooms,
    close: async () => {
      clearInterval(cleanup);
      if (app.server) await app.stop(true);
    },
  };
}
export type App = ReturnType<typeof createApp>['app'];
