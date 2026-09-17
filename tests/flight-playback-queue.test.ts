import { flightRollCue } from '../src/features/room/selectors';
import { expect, test } from 'bun:test';
import { QueryClient } from '@tanstack/react-query';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RoomService } from '../server/rooms/service';
import type { Game, RoomView } from '../shared/contracts';
import { applyMove, createGame, legalMoves, rollDice } from '../shared/game';
import { cacheRoom } from '../src/lib/room-cache';
import { flightScenes, FLIGHT_ROLL_MS } from '../src/features/room/flight-playback';
import {
  FlightPlaybackQueue,
  subscribeFlightRoom,
  type FlightPlayback,
} from '../src/features/room/flight-playback-queue';

const room = (game: Game, revision: number): RoomView => ({
  code: 'ABCDEF',
  kind: 'flight',
  mode: 'ai',
  side: 0,
  ready: true,
  players: [
    { name: 'Human', connected: true },
    { name: 'AI', connected: true },
  ],
  game,
  revision,
  moves: legalMoves(game),
  thinking: false,
  aiError: null,
  rematch: [],
});
function harness(initial: RoomView) {
  const seen: FlightPlayback[] = [];
  const timers = new Map<number, () => void>();
  let id = 0;
  const player = new FlightPlaybackQueue(
    initial,
    (frame) => seen.push(frame),
    (callback) => {
      const token = ++id;
      timers.set(token, callback);
      return () => {
        timers.delete(token);
      };
    },
  );
  const flush = () => {
    for (let n = 0; timers.size && n < 100; n++) {
      const [token, callback] = timers.entries().next().value!;
      timers.delete(token);
      callback();
    }
    expect(timers.size).toBe(0);
  };
  return { player, seen, timers, flush };
}

test('landing pauses, colour jump and shortcut are distinct, slower scenes', () => {
  const start = createGame('flight');
  start.planes[0][0] = 12;
  const rolled = rollDice(start, 2);
  const after = applyMove(rolled, 'plane-0');
  const allScenes = flightScenes(rolled, after)!;
  const scenes = allScenes.filter((frame) => frame.motionMs > 0 || frame.phase === 'idle');
  expect(scenes.map((frame) => frame.phase)).toEqual(['step', 'step', 'jump', 'shortcut', 'idle']);
  expect(scenes.map((frame) => frame.game.planes[0][0])).toEqual([13, 14, 18, 30, 30]);
  for (const frame of scenes.slice(0, -1)) {
    expect(frame.duration).toBe(frame.motionMs);
    expect(frame.game.turn).toBe(0);
    expect(frame.game.log).toEqual(rolled.log);
  }
  expect(allScenes.filter((frame) => frame.motionMs === 0 && frame.phase !== 'idle')).toHaveLength(
    4,
  );
  expect(scenes[2].motionMs).toBeGreaterThan(scenes[0].motionMs);
  expect(scenes.at(-1)?.game).toEqual(after);
  expect(flightScenes(start, rolled)![0].duration).toBeGreaterThan(FLIGHT_ROLL_MS);
});

test('synchronous AI cache writes preserve every roll, move and final turn in order', () => {
  const start = createGame('flight');
  start.turn = 1;
  start.planes[1][0] = 0;
  const initial = room(start, 1);
  const { player, seen, flush } = harness(initial);
  const client = new QueryClient();
  const credentials = { code: initial.code, token: 'test-seat' };
  cacheRoom(client, credentials, initial);
  const unsubscribe = subscribeFlightRoom(client, credentials, (next) => player.receive(next));
  let game = start;
  let revision = 1;
  for (let count = 0; count < 3; count++) {
    game = rollDice(game, 6);
    cacheRoom(client, credentials, room(game, ++revision));
    if (game.die !== null) {
      game = applyMove(game, 'plane-0');
      cacheRoom(client, credentials, room(game, ++revision));
    }
  }
  expect(seen).toHaveLength(1);
  expect(seen[0].phase).toBe('roll');
  expect(seen[0].game.planes[1][0]).toBe(0);
  expect(seen[0].room.game.turn).toBe(1);
  flush();
  expect(
    seen.filter((frame) => frame.phase === 'roll').map((frame) => frame.game.rollCount),
  ).toEqual([1, 2, 3]);
  expect(
    seen
      .filter((frame) => frame.phase !== 'idle')
      .every((frame) => frame.playing && frame.room.game.turn === 1),
  ).toBe(true);
  expect(seen.at(-1)?.room.game).toEqual(game);
  expect(seen.at(-1)?.playing).toBe(false);
  expect(game.turn).toBe(0);
  const count = seen.length;
  cacheRoom(client, credentials, initial);
  expect(seen).toHaveLength(count);
  unsubscribe();
  player.dispose();
  client.clear();
});

test('disposing playback cancels queued work without further notifications', () => {
  const start = createGame('flight');
  const { player, seen, timers, flush } = harness(room(start, 1));
  const rolled = rollDice(start, 6);
  const moved = applyMove(rolled, 'plane-0');
  player.receive(room(rolled, 2));
  player.receive(room(moved, 3));
  expect(timers.size).toBe(1);
  const count = seen.length;
  player.dispose();
  expect(timers.size).toBe(0);
  flush();
  expect(seen).toHaveLength(count);
});

test('equal-revision presence refreshes idle and queued frames without replaying moves', () => {
  const start = createGame('flight');
  const initial = room(start, 1);
  const { player, seen, timers, flush } = harness(initial);
  const disconnected = structuredClone(initial);
  disconnected.players[1]!.connected = false;
  player.receive(disconnected);
  expect(seen.at(-1)?.room.players[1]?.connected).toBe(false);
  expect(timers.size).toBe(0);

  const rolled = rollDice(start, 6);
  const moved = applyMove(rolled, 'plane-0');
  player.receive(room(rolled, 2));
  player.receive(room(moved, 3));
  const active = seen.at(-1)!;
  const pending = [...timers.keys()];
  const update = room(moved, 3);
  update.players[1]!.connected = false;
  player.receive(update);
  expect(seen.at(-1)?.phase).toBe(active.phase);
  expect(seen.at(-1)?.game).toBe(active.game);
  expect(seen.at(-1)?.room.players[1]?.connected).toBe(false);
  expect([...timers.keys()]).toEqual(pending);
  const refreshed = seen.length;
  player.receive(initial); // Older game revisions still cannot replace playback.
  player.receive(update); // Re-observing the same cache object is a no-op.
  expect(seen).toHaveLength(refreshed);
  flush();
  expect(seen.slice(refreshed).every((frame) => !frame.room.players[1]?.connected)).toBe(true);
  expect(seen.at(-1)?.game).toEqual(moved);
  expect(seen.at(-1)?.playing).toBe(false);
});

test('an open Aeroplane presentation exposes retry after a persisted AI turn is recovered', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'kee-playback-recovery-'));
  const client = new QueryClient();
  try {
    const dataFile = join(dir, 'rooms.json');
    const service = new RoomService({
      dataFile,
      apiKey: 'test',
      dice: () => 1,
      choose: () => new Promise(() => {}),
    });
    const session = service.create({ kind: 'flight', mode: 'ai', name: 'Host' });
    const saved = service.get(session.room.code);
    saved.game.planes[1][0] = 0;
    service.act(saved, 0, { type: 'roll', revision: saved.revision });
    expect(saved.thinking).toBe(true);
    const initial = structuredClone(service.view(saved, 0));
    const { player, seen, timers } = harness(initial);
    const credentials = { code: initial.code, token: session.token };
    cacheRoom(client, credentials, initial);
    const unsubscribe = subscribeFlightRoom(client, credentials, (next) => player.receive(next));
    const recovered = new RoomService({
      dataFile,
      apiKey: 'test',
      choose: async (game) => legalMoves(game)[0],
    });
    const restored = recovered.authorize(initial.code, session.token).room;
    expect(restored.revision).toBe(initial.revision);
    cacheRoom(client, credentials, recovered.view(restored, 0));
    expect(seen.at(-1)?.room.thinking).toBe(false);
    expect(seen.at(-1)?.room.aiError).toContain('已恢復');
    expect(seen.at(-1)?.game).toEqual(initial.game);
    expect(timers.size).toBe(0);
    recovered.act(restored, 0, { type: 'retry' });
    for (let n = 0; restored.thinking && n < 100; n++) await Bun.sleep(1);
    expect(restored.thinking).toBe(false);
    expect(restored.aiError).toBeNull();
    expect(restored.game.turn).toBe(0);
    expect(restored.game.planes[1][0]).toBe(1);
    unsubscribe();
    player.dispose();
  } finally {
    client.clear();
    rmSync(dir, { recursive: true, force: true });
  }
});

for (const mode of ['ai', 'friend', 'local'] as const) {
  test(`${mode}: instant keyboard actions do not skip the following AI roll`, () => {
    const snapshot = (game: Game, revision: number): RoomView => ({
      ...room(game, revision),
      mode,
      players: [
        { name: 'Human', connected: true },
        { name: 'AI', connected: true, ...(mode === 'ai' ? {} : { ai: true }) },
      ],
    });
    const start = createGame('flight');
    const { player, seen, flush } = harness(snapshot(start, 1));
    player.setKeyboardInstant(true);
    const humanRoll = rollDice(start, 2); // No plane can move; AI takes the next turn.
    player.receive(snapshot(humanRoll, 2));
    expect(seen.at(-1)?.playing).toBe(false);
    const aiRoll = rollDice(humanRoll, 3);
    player.receive(snapshot(aiRoll, 3));
    expect(seen.at(-1)?.phase).toBe('roll');
    expect(seen.at(-1)?.instant).toBe(false);
    flush();
    player.dispose();
  });
}

test('six cues agree with each rendered roll and clear when the bonus ends', () => {
  let game = createGame('flight');
  for (let count = 1; count <= 3; count++) {
    const rolled = rollDice(game, 6);
    const scene = flightScenes(game, rolled)![0];
    expect(flightRollCue(scene.game)).toBe(count < 3 ? 'extra' : 'forfeit');
    expect(flightRollCue(rolled)).toBe(count < 3 ? 'extra' : 'forfeit');
    if (count < 3) {
      game = applyMove(rolled, 'plane-0');
      expect(flightRollCue(game)).toBe('extra');
    } else {
      expect(flightRollCue(rollDice(rolled, 2))).toBeNull();
    }
  }
  expect(flightRollCue(createGame('flight'))).toBeNull();
  expect(flightRollCue({ ...game, winner: 0 })).toBeNull();
});
