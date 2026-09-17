import { isAiPlayer } from '../../../shared/players';
import type { QueryClient } from '@tanstack/react-query';
import type { Credentials, RoomView } from '../../../shared/contracts';
import { roomKey } from '../../lib/room-cache';
import { flightScenes, type FlightScene } from './flight-playback';

export type FlightPlayback = FlightScene & { room: RoomView; playing: boolean; instant: boolean };
export const idlePlayback = (room: RoomView): FlightPlayback => ({
  room,
  game: room.game,
  phase: 'idle',
  duration: 0,
  motionMs: 0,
  playing: false,
  instant: true,
});
type Schedule = (callback: () => void, delay: number) => () => void;
const scheduleTimeout: Schedule = (callback, delay) => {
  const timer = setTimeout(callback, delay);
  return () => clearTimeout(timer);
};

/** A disposable rendering timeline. It never writes to the cache or sends game commands. */
export class FlightPlaybackQueue {
  private latest: RoomView;
  private current: FlightPlayback;
  private queue: FlightPlayback[] = [];
  private cancel: (() => void) | null = null;
  private keyboardInstant = false;

  constructor(
    room: RoomView,
    private notify: (frame: FlightPlayback) => void,
    private schedule: Schedule = scheduleTimeout,
  ) {
    this.latest = room;
    this.current = idlePlayback(room);
  }

  receive(room: RoomView) {
    if (room === this.latest || room.revision < this.latest.revision) return;
    const before = this.latest;
    this.latest = room;
    if (room.revision === before.revision) {
      // Presence and restart recovery can change metadata without a game transition.
      // Refresh it without restarting the active animation or exposing a future board.
      const refresh = (frame: FlightPlayback): FlightPlayback => {
        const metadata = frame.room.revision === room.revision ? room : frame.room;
        return {
          ...frame,
          room: {
            ...metadata,
            players: room.players,
            game: frame.game,
            thinking: frame.phase === 'idle' && metadata.thinking,
          },
        };
      };
      this.queue = this.queue.map(refresh);
      this.publish(refresh(this.current));
      return;
    }
    const scenes = room.kind === 'flight' ? flightScenes(before.game, room.game) : null;
    if (scenes === null) {
      this.snap();
      return;
    }
    // A keyboard move may be instant without skipping the AI's subsequent turn.
    const instant = this.keyboardInstant && !isAiPlayer(before, before.game.turn);
    this.queue.push(
      ...scenes.map((scene) => ({
        ...scene,
        duration: instant ? 0 : scene.duration,
        room: { ...room, game: scene.game, thinking: scene.phase === 'idle' && room.thinking },
        playing: scene.duration > 0,
        instant,
      })),
    );
    if (!this.cancel) this.advance();
  }

  setKeyboardInstant(instant: boolean) {
    this.keyboardInstant = instant;
  }

  private snap() {
    this.dispose();
    this.publish(idlePlayback(this.latest));
  }

  private publish(frame: FlightPlayback) {
    this.current = frame;
    this.notify(frame);
  }

  private advance = () => {
    this.cancel = null;
    while (this.queue.length) {
      const frame = this.queue.shift()!;
      if (frame.duration > 0) {
        this.publish({ ...frame, playing: true });
        this.cancel = this.schedule(this.advance, frame.duration);
        return;
      }
      // Zero-duration metadata updates needn't flash between two animated scenes.
      if (!this.queue.length) this.publish({ ...frame, playing: false });
    }
  };

  dispose() {
    this.cancel?.();
    this.cancel = null;
    this.queue = [];
  }
}

/** Observe every accepted cache write before React can batch several AI rolls into one render. */
export function subscribeFlightRoom(
  client: QueryClient,
  credentials: Credentials,
  receive: (room: RoomView) => void,
) {
  const key = roomKey(credentials);
  return client.getQueryCache().subscribe((event) => {
    if (
      event.type !== 'updated' ||
      event.action.type !== 'success' ||
      !key.every((part, index) => event.query.queryKey[index] === part)
    )
      return;
    const room = client.getQueryData<RoomView>(key);
    if (room) receive(room);
  });
}
