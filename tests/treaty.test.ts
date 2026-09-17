import { afterEach, expect, test } from 'bun:test';
import { createApp } from '../server/app';
import type { Credentials, RoomView } from '../shared/contracts';
import { ApiError, createApi } from '../src/lib/api-client';

const instances: ReturnType<typeof createApp>[] = [];
const sockets: ReturnType<ReturnType<typeof createApi>['subscribe']>[] = [];

afterEach(async () => {
  for (const socket of sockets.splice(0)) socket.close();
  for (const instance of instances.splice(0)) await instance.close();
});

function setup() {
  const instance = createApp({ apiKey: '' });
  instances.push(instance);
  instance.app.listen({ hostname: '127.0.0.1', port: 0 });
  return createApi(`http://127.0.0.1:${instance.app.server!.port}`);
}

async function eventually(predicate: () => boolean) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (predicate()) return;
    await Bun.sleep(10);
  }
  throw new Error('Treaty subscription did not update within 1s');
}

function subscribe(api: ReturnType<typeof createApi>, credentials: Credentials) {
  const socket = api.subscribe();
  sockets.push(socket);
  const updates: RoomView[] = [];
  socket.on('open', () => socket.send(credentials));
  socket.subscribe(({ data }) => updates.push(data));
  return { socket, updates };
}

test('Treaty creates and joins rooms, synchronizes both seats, and restores subscriptions', async () => {
  const api = setup();
  expect((await api.config()).aiAvailable).toBe(false);
  const host = await api.create({ name: 'Host', kind: 'jungle', mode: 'friend' });
  const code = host.room.code;
  const guest = await api.join(code, 'Guest');
  const hostCredentials = { code, token: host.token };
  const guestCredentials = { code, token: guest.token };
  expect((await api.room(guestCredentials)).room.side).toBe(1);

  const hostFeed = subscribe(api, hostCredentials);
  const guestFeed = subscribe(api, guestCredentials);
  await eventually(() => hostFeed.updates.length > 0 && guestFeed.updates.length > 0);
  const { room } = await api.room(hostCredentials);
  const moved = await api.action(hostCredentials, {
    type: 'move',
    id: room.moves[0].id,
    revision: room.revision,
  });
  await eventually(
    () => hostFeed.updates.at(-1)?.game.ply === 1 && guestFeed.updates.at(-1)?.game.ply === 1,
  );
  expect(hostFeed.updates.at(-1)?.game).toEqual(moved.room.game);
  expect(guestFeed.updates.at(-1)?.game).toEqual(moved.room.game);
  expect(hostFeed.updates.at(-1)?.side).toBe(0);
  expect(guestFeed.updates.at(-1)?.side).toBe(1);

  hostFeed.socket.close();
  await eventually(() => guestFeed.updates.at(-1)?.players[0]?.connected === false);
  const reconnected = subscribe(api, hostCredentials);
  await eventually(() => reconnected.updates.length > 0);
  expect(reconnected.updates.at(-1)?.game).toEqual(moved.room.game);
  expect(reconnected.updates.at(-1)?.side).toBe(0);
});

test('Treaty preserves API errors and query cancellation', async () => {
  const api = setup();
  const host = await api.create({ name: 'Host', kind: 'flight', mode: 'friend' });
  const invalid = { code: host.room.code, token: '0'.repeat(64) };
  await expect(api.room(invalid)).rejects.toBeInstanceOf(ApiError);
  await expect(api.room(invalid)).rejects.toMatchObject({ status: 401 });
  await expect(api.create({ name: 'Host', kind: 'jungle', mode: 'ai' })).rejects.toMatchObject({
    status: 503,
  });
  await expect(
    api.create({
      name: 'Host',
      kind: 'flight',
      mode: 'local',
      flightPlayers: [
        { name: 'Host', ai: false },
        { name: 'AI', ai: true },
      ],
    }),
  ).rejects.toMatchObject({ status: 503 });
  const controller = new AbortController();
  controller.abort();
  await expect(api.config(controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
});

test('Treaty subscriptions reject invalid seat credentials', async () => {
  const api = setup();
  const host = await api.create({ name: 'Host', kind: 'jungle', mode: 'friend' });
  const { socket, updates } = subscribe(api, {
    code: host.room.code,
    token: '0'.repeat(64),
  });
  let closeCode: number | undefined;
  socket.on('close', (event) => {
    closeCode = event.code;
  });
  await eventually(() => closeCode !== undefined);
  expect(closeCode).toBe(1008);
  expect(updates).toHaveLength(0);
});
