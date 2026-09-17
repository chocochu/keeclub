import type { Game, Side } from '../../../shared/contracts';

export const FLIGHT_STEP_MS = 320;
export const FLIGHT_ROLL_MS = 650;
const ROLL_HOLD_MS = 550;
const LANDING_HOLD_MS = 220;
const LEAP_MS = 650;
export type FlightPhase =
  | 'idle'
  | 'roll'
  | 'step'
  | 'jump'
  | 'shortcut'
  | 'capture'
  | 'return'
  | 'finish';
export type FlightScene = {
  game: Game;
  phase: FlightPhase;
  duration: number;
  motionMs: number;
  leap?: { side: Side; index: number; phase: FlightPhase; from: number; to: number };
  landing?: { side: Side; index: number };
};

/** null means a discontinuity (reconnect/rematch), which should snap rather than replay. */
export function flightFrames(before: Game, after: Game): Game['planes'][] | null {
  if (after.ply < before.ply || after.ply > before.ply + 1) return null;
  const moved = after.ply === before.ply + 1;
  const penalty = (after.rollCount ?? 0) > (before.rollCount ?? 0) && after.lastFlight;
  if (moved || penalty) return after.lastFlight?.steps.map((step) => step.planes) ?? null;
  return [];
}

/** Timeline for one authoritative update. No timers or gameplay decisions live here. */
export function flightScenes(before: Game, after: Game): FlightScene[] | null {
  const rolls = (after.rollCount ?? 0) - (before.rollCount ?? 0);
  if (rolls < 0 || rolls > 1) return null;
  const frames = flightFrames(before, after);
  if (frames === null) return null;
  const scenes: FlightScene[] = [];
  const rolled = {
    ...before,
    lastDie: after.lastDie,
    rollCount: after.rollCount,
    sixes: after.sixes,
    sixPenalty: after.sixPenalty,
    die: after.lastDie,
  };
  if (rolls === 1) {
    scenes.push({
      game: rolled,
      phase: 'roll',
      duration: FLIGHT_ROLL_MS + ROLL_HOLD_MS,
      motionMs: 0,
    });
  }
  if (frames.length && after.lastFlight) {
    const { side, piece: index, steps } = after.lastFlight;
    let progress = before.planes[side][index] ?? -1;
    const base = rolls === 1 ? rolled : before;
    for (const step of steps) {
      const phase = step.kind;
      const leap =
        phase === 'jump' || phase === 'shortcut'
          ? { side, index, phase, from: progress, to: step.progress }
          : undefined;
      const landing = step.progress === 56 && phase !== 'finish' ? { side, index } : undefined;
      const motionMs = leap || phase === 'finish' ? LEAP_MS : FLIGHT_STEP_MS;
      const scene = { game: { ...base, planes: step.planes }, phase, motionMs, landing };
      scenes.push({ ...scene, leap, duration: motionMs });
      // At rest the plane faces its next ordinary cell again, after flying toward the leap target.
      scenes.push({ ...scene, motionMs: 0, duration: LANDING_HOLD_MS });
      progress = step.progress;
    }
  }
  // Only publish the resulting turn, log, score and winner after the landing completes.
  scenes.push({ game: after, phase: 'idle', duration: 0, motionMs: 0 });
  return scenes;
}
