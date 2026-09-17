import { expect, test } from 'bun:test';
import { QueryClient } from '@tanstack/react-query';
import type { RoomView } from '../shared/contracts';
import { createGame, legalMoves } from '../shared/game';
import { cacheRoom, newestRoom, roomKey } from '../src/lib/room-cache';

function snapshot(revision: number): RoomView {
  const game = createGame('jungle');
  return {
    code: 'ABC234',
    kind: 'jungle',
    mode: 'friend',
    players: [
      { name: 'Host', connected: true },
      { name: 'Guest', connected: true },
    ],
    game,
    side: 0,
    ready: true,
    moves: legalMoves(game),
    thinking: false,
    aiError: null,
    rematch: [],
    revision,
  };
}
test('a late HTTP response cannot replace a newer websocket snapshot', () => {
  const current = snapshot(4);
  expect(newestRoom(current, snapshot(3))).toBe(current);
  const next = snapshot(5);
  expect(newestRoom(current, next)).toBe(next);
});
test('query cache separates rooms and seat credentials while accepting presence updates', () => {
  const client = new QueryClient(),
    host = { code: 'ABC234', token: 'host' },
    guest = { code: 'ABC234', token: 'guest' };
  cacheRoom(client, host, snapshot(4));
  cacheRoom(client, host, snapshot(2));
  expect(client.getQueryData<RoomView>(roomKey(host))?.revision).toBe(4);
  expect(client.getQueryData(roomKey(guest))).toBeUndefined();
  const presence = snapshot(4);
  presence.players[1]!.connected = false;
  cacheRoom(client, host, presence);
  expect(client.getQueryData<RoomView>(roomKey(host))?.players[1]?.connected).toBe(false);
  client.clear();
});
