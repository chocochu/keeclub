import type { FlightSettings, Game, Side } from './contracts';
export const DEFAULT_FLIGHT_SETTINGS: FlightSettings = { tripleSix: 'all', playerCount: 2 };
// Keep existing two-player seat identities: red, green, then yellow and blue.
export const FLIGHT_QUARTERS = [0, 2, 1, 3] as const;
export const trackIndex = (side: Side, progress: number) =>
  (progress + FLIGHT_QUARTERS[side] * 13) % 52;
export const flightSides = (game: Game) =>
  ([0, 2, 1, 3] as Side[]).filter((side) => side < game.planes.length);
export const activeFlightSides = (game: Game) =>
  flightSides(game).filter(
    (side) => !game.rankings?.includes(side) && !game.withdrawn?.includes(side),
  );
export function nextFlightSide(game: Game): Side {
  const order = flightSides(game);
  const active = activeFlightSides(game);
  const current = order.indexOf(game.turn);
  for (let step = 1; step <= order.length; step++) {
    const side = order[(current + step) % order.length];
    if (active.includes(side)) return side;
  }
  return game.turn;
}

/** The last remaining player receives the final place; withdrawals never replace earned ranks. */
export function finishFlightGame(game: Game) {
  const remaining = activeFlightSides(game);
  if (remaining.length > 1) return;
  game.rankings = [...(game.rankings ?? []), ...remaining];
  game.winner = game.rankings[0] ?? 'draw';
}

/** Every dice step, including a finish-line bounce, then the permitted bonus landings. */
export function flightMovePath(from: number, die: number): number[] {
  if (from === 56 || (from === -1 && die !== 6)) return [];
  if (from === -1) return [0];
  const path: number[] = [];
  let landing = from;
  let direction = 1;
  for (let step = 0; step < die; step++) {
    if (landing === 56) direction = -1;
    landing += direction;
    path.push(landing);
  }
  if (landing === 18) path.push(30, 34);
  else if (landing > 0 && landing < 50 && landing % 4 === 2) {
    path.push(landing + 4);
    if (landing + 4 === 18) path.push(30);
  }
  return path;
}

/** Engine-produced snapshots keep captures and rendered travel on exactly the same route. */
export function flightMoveTrace(game: Game, index: number): NonNullable<Game['lastFlight']> {
  const side = game.turn;
  const planes = game.planes.map((row) => [...row]);
  const from = planes[side][index];
  const path = flightMovePath(from, game.die!);
  const steps: NonNullable<Game['lastFlight']>['steps'] = [];
  let previous = from;
  const snapshot = (progress: number, kind: (typeof steps)[number]['kind']) => {
    steps.push({ progress, kind, planes: planes.map((row) => [...row]) });
  };
  path.forEach((progress, step) => {
    const shortcut = previous === 18 && progress === 30;
    const kind = shortcut ? 'shortcut' : progress - previous > 1 ? 'jump' : 'step';
    planes[side][index] = progress;
    snapshot(progress, kind);
    let captured = false;
    // Passing a cell does not capture; each dice/bonus landing does.
    const landing = from !== -1 && step >= game.die! - 1;
    for (const enemy of flightSides(game).filter((s) => s !== side)) {
      planes[enemy] = planes[enemy].map((p) => {
        const onTrack =
          landing &&
          progress >= 1 &&
          progress <= 50 &&
          p >= 1 &&
          p <= 50 &&
          trackIndex(enemy, p) === trackIndex(side, progress);
        const onCrossing =
          shortcut && p === 53 && (FLIGHT_QUARTERS[enemy] + 2) % 4 === FLIGHT_QUARTERS[side];
        if (onTrack || onCrossing) {
          captured = true;
          return -1;
        }
        return p;
      });
    }
    if (captured) snapshot(progress, 'capture');
    previous = progress;
  });
  if (path.at(-1) === 56) snapshot(56, 'finish');
  return { side, piece: index, steps };
}

export function returnFlightPlanes(game: Game, index?: number) {
  game.planes[game.turn] = game.planes[game.turn].map((p, i) =>
    p !== 56 && (index === undefined || index === i) ? -1 : p,
  );
  game.lastFlight = {
    side: game.turn,
    piece: index ?? -1,
    steps: [{ kind: 'return', progress: -1, planes: game.planes.map((row) => [...row]) }],
  };
  game.sixes = 0;
  game.die = null;
  game.turn = nextFlightSide(game);
}
