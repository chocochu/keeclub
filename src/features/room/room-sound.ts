import type { Sound } from '../../lib/sound';
import type { FlightPlayback } from './flight-playback-queue';

/** Compare displayed states, so remote/AI actions sound at the same time as their animation. */
export function roomSound(before: FlightPlayback, after: FlightPlayback): Sound | null {
  const previous = before.game;
  const game = after.game;
  const rolls = (game.rollCount ?? 0) - (previous.rollCount ?? 0);
  if (
    before.room.code !== after.room.code ||
    before.room.kind !== after.room.kind ||
    !before.room.ready ||
    !after.room.ready ||
    after.room.revision < before.room.revision ||
    game.ply < previous.ply ||
    game.ply > previous.ply + 1 ||
    rolls < 0 ||
    rolls > 1
  )
    return null;

  if (previous.winner === null && game.winner !== null) {
    return game.winner === 'draw' ? 'draw' : 'win';
  }
  if (game.kind === 'jungle') {
    if (game.ply !== previous.ply + 1) return null;
    return game.pieces.length < previous.pieces.length ? 'capture' : 'move';
  }

  if (rolls === 1) return 'roll';
  const changedPlanes = game.planes.some((planes, side) =>
    planes.some((position, index) => position !== previous.planes[side]?.[index]),
  );
  // Landing holds and presence updates reuse a scene; never repeat its sound.
  if (after.phase !== 'idle') {
    if (after.phase === 'finish' && before.phase !== 'finish') return 'finish';
    if (after.motionMs === 0 || !changedPlanes) return null;
    return after.phase === 'roll' ? null : after.phase;
  }
  // Keyboard actions skip animation; still give one concise cue for the final result.
  if (before.phase === 'idle' && game.ply === previous.ply + 1 && changedPlanes) {
    const steps = game.lastFlight?.steps ?? [];
    if (steps.some((step) => step.kind === 'finish')) return 'finish';
    if (steps.some((step) => step.kind === 'capture')) return 'capture';
    if (steps.some((step) => step.kind === 'shortcut')) return 'shortcut';
    if (steps.some((step) => step.kind === 'jump')) return 'jump';
    return 'step';
  }
  return null;
}
