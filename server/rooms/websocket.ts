import { Elysia } from 'elysia';
import { CredentialsSchema, RoomViewSchema, type Side } from '../../shared/contracts';
import type { RoomService } from './service';

export function roomWebSocket<const Path extends '/ws' | '/api/rooms/:code/ws'>(
  service: RoomService,
  path: Path,
) {
  const sessions = new Map<string, { code: string; side: Side }>();
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  let unsubscribe: (() => void) | undefined;
  return new Elysia({ name: `room-websocket-${path}` })
    .onStart(({ server }) => {
      unsubscribe = service.subscribe((room) => {
        for (const side of room.players.map((_, index) => index as Side))
          server?.publish(`${room.code}:${side}`, JSON.stringify(service.view(room, side)));
      });
    })
    .onStop(() => {
      unsubscribe?.();
      for (const timer of timers.values()) clearTimeout(timer);
    })
    .ws(path, {
      body: CredentialsSchema,
      response: RoomViewSchema,
      maxPayloadLength: 1024,
      open(ws) {
        timers.set(
          ws.id,
          setTimeout(() => ws.close(1008, 'Authentication required'), 5000),
        );
      },
      message(ws, credentials) {
        if (sessions.has(ws.id)) return;
        try {
          if (path !== '/ws' && (ws.data.params as { code?: string }).code !== credentials.code)
            throw new Error('Wrong room');
          const { room, side } = service.authorize(credentials.code, credentials.token);
          clearTimeout(timers.get(ws.id));
          timers.delete(ws.id);
          sessions.set(ws.id, { code: room.code, side });
          ws.subscribe(`${room.code}:${side}`);
          service.setPresence(room.code, side, ws.id, true);
          ws.send(service.view(room, side));
        } catch {
          ws.close(1008, 'Invalid room credentials');
        }
      },
      close(ws) {
        clearTimeout(timers.get(ws.id));
        timers.delete(ws.id);
        const session = sessions.get(ws.id);
        if (session) {
          sessions.delete(ws.id);
          service.setPresence(session.code, session.side, ws.id, false);
        }
      },
    });
}
