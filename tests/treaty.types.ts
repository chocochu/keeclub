import type { Treaty } from '@elysiajs/eden';
import type { Credentials, RoomView, Side } from '../shared/contracts';
import type { createTreatyClient } from '../src/lib/api-client';

type Client = ReturnType<typeof createTreatyClient>;

/** Compiled by typecheck/build, never executed. Unused @ts-expect-error fails the check. */
export async function checkTreatyContract(client: Client, credentials: Credentials) {
  const result = await client.api.rooms.post({ name: 'Host', kind: 'jungle', mode: 'friend' });
  const session: Treaty.Data<Client['api']['rooms']['post']> | null = result.data;
  if (session) {
    session.room satisfies RoomView;
    session.room.game.turn satisfies Side;
    // @ts-expect-error Server responses do not expose private seat token hashes.
    void session.room.tokenHashes;
    // @ts-expect-error Game turns are numeric sides, never strings.
    session.room.game.turn satisfies string;
  }

  // @ts-expect-error Unknown routes must not compile.
  await client.api.missing.get();
  // @ts-expect-error Only the server's supported games can be created.
  await client.api.rooms.post({ name: 'Host', kind: 'chess', mode: 'friend' });
  // @ts-expect-error A player name is required by the server schema.
  await client.api.rooms.post({ kind: 'jungle', mode: 'friend' });

  const room = client.api.rooms({ code: credentials.code });
  // @ts-expect-error Move commands must include the expected room revision.
  await room.action.post({ type: 'move', id: 'rat' });
  // @ts-expect-error Clients cannot choose the result of a dice roll.
  await room.action.post({ type: 'roll', revision: 0, value: 6 });

  const socket = client.ws.subscribe();
  socket.send(credentials);
  // @ts-expect-error WebSocket authentication requires a token.
  socket.send({ code: credentials.code });
  // @ts-expect-error Game commands belong to the HTTP action route.
  socket.send({ type: 'resign' });
  socket.subscribe(({ data }) => {
    data satisfies RoomView;
    // @ts-expect-error Treaty decodes the server's RoomView, not an untyped JSON string.
    data satisfies string;
  });
}
