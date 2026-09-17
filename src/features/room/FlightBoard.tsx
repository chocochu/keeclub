import { SIDE_NAMES } from '../../../shared/game';
import type { Game, Move, Side } from '../../../shared/contracts';
import { FLIGHT_STEP_MS, type FlightScene } from './flight-playback';
import {
  AIRPORTS,
  AIRPORT_HEADINGS,
  SIDE_COLOURS,
  COLOURS,
  FLIGHT_TILES,
  PIECE_COLOURS,
  flightPoint,
  flightHomePoint,
  planeHeading,
  flightHeading,
  hangarPoint,
  polygonPoints,
  rotate,
  type BoardColour,
  type Point,
} from './flight-board-geometry';

const PAPER = '#fffef9';
const INK = '#293f49';
const HOME_LANE: Point[] = [
  [8, 2],
  [9, 2],
  [9, 7],
  [8, 7],
];
const FINISH: Point[] = [
  [7, 7],
  [10, 7],
  [8.5, 8.5],
];

function PlaneMark({ colour, angle = 0 }: { colour: string; angle?: number }) {
  return (
    <path
      transform={`rotate(${angle})`}
      d="M0 -.33 L.08 -.08 L.3 .08 L.3 .16 L.08 .08 L.06 .27 L.15 .34 L.15 .4 L0 .32 L-.15 .4 L-.15 .34 L-.06 .27 L-.08 .08 L-.3 .16 L-.3 .08 L-.08 -.08 Z"
      fill={colour}
    />
  );
}

function Arrow({ point, angle, colour }: { point: Point; angle: number; colour: string }) {
  return (
    <path
      transform={`translate(${point.join(' ')}) rotate(${angle})`}
      d="M-.28 -.1 H.02 V-.25 L.31 0 L.02 .25 V.1 H-.28Z"
      fill={colour}
      stroke={INK}
      strokeWidth=".025"
      strokeLinejoin="round"
    />
  );
}

export function FlightBoard({
  game,
  moves = [],
  onMove,
  preview = false,
  motionMs = FLIGHT_STEP_MS,
  leap,
  landing,
}: {
  game: Game;
  moves?: Move[];
  onMove?: (id: string) => void;
  preview?: boolean;
  motionMs?: number;
  leap?: FlightScene['leap'];
  landing?: FlightScene['landing'];
}) {
  return (
    <div className={`flight-board ${preview ? 'preview' : ''}`}>
      <svg
        viewBox="-1 -1 19 19"
        role={preview ? 'img' : 'group'}
        aria-label={`飛行棋棋盤，${game.planes.length} 人對戰`}
      >
        <g aria-hidden="true">
          <rect x="-.92" y="-.92" width="18.84" height="18.84" rx=".3" fill={INK} />
          <rect x="-.7" y="-.7" width="18.4" height="18.4" rx=".16" fill="#d5e4e8" />
          <rect
            x="-.35"
            y="-.35"
            width="17.7"
            height="17.7"
            rx=".38"
            fill={PAPER}
            stroke={INK}
            strokeWidth=".025"
            strokeDasharray=".2 .15"
          />
          {AIRPORTS.map(({ colour, x, y }) => (
            <g key={colour}>
              <rect x={x} y={y} width="3.85" height="3.85" fill={COLOURS[colour]} />
              {[0, 1, 2, 3].map((index) => {
                const point = hangarPoint(colour, index);
                return (
                  <g key={index} transform={`translate(${point.join(' ')})`}>
                    <circle r=".67" fill={PAPER} stroke={INK} strokeWidth=".035" />
                    <PlaneMark
                      colour={
                        SIDE_COLOURS.slice(0, game.planes.length).includes(colour)
                          ? '#d9ddd1'
                          : COLOURS[colour]
                      }
                      angle={AIRPORT_HEADINGS[colour]}
                    />
                  </g>
                );
              })}
            </g>
          ))}
          {FLIGHT_TILES.map((tile, index) => (
            <g key={index}>
              <polygon
                points={polygonPoints(tile.outline)}
                fill={COLOURS[tile.colour]}
                stroke={INK}
                strokeWidth=".028"
                strokeLinejoin="round"
              />
              <circle
                cx={tile.center[0]}
                cy={tile.center[1]}
                r=".43"
                fill={PAPER}
                stroke={INK}
                strokeWidth=".02"
              />
            </g>
          ))}
          {(['red', 'yellow', 'green', 'blue'] as BoardColour[]).map((colour, quarter) => (
            <g key={colour}>
              <polygon
                points={polygonPoints(HOME_LANE.map((p) => rotate(p, quarter)))}
                fill={COLOURS[colour]}
                stroke={INK}
                strokeWidth=".028"
              />
              <polygon
                points={polygonPoints(FINISH.map((p) => rotate(p, quarter)))}
                fill={COLOURS[colour]}
                stroke={INK}
                strokeWidth=".028"
              />
              {Array.from({ length: 6 }, (_, step) => {
                const point = rotate([8.5, 2.5 + step], quarter);
                return (
                  <circle
                    key={step}
                    cx={point[0]}
                    cy={point[1]}
                    r=".43"
                    fill={PAPER}
                    stroke={INK}
                    strokeWidth=".02"
                  />
                );
              })}
              <Arrow
                point={rotate([8.5, 1], quarter)}
                angle={90 + quarter * 90}
                colour={COLOURS[colour]}
              />
              <Arrow
                point={rotate([12.55, 0.65], quarter)}
                angle={90 + quarter * 90}
                colour={COLOURS[colour]}
              />
              <g transform={`translate(${rotate([8.5, 7.5], quarter).join(' ')})`}>
                <PlaneMark colour={COLOURS[colour]} angle={180 + quarter * 90} />
              </g>
            </g>
          ))}
          {/* Shortcut endpoints share the same geometry as the game engine's route. */}
          {(['red', 'yellow', 'green', 'blue'] as BoardColour[]).map((colour, quarter) => {
            const start = rotate(flightPoint(0, 18, 0), quarter);
            const end = rotate(flightPoint(0, 30, 0), quarter);
            return (
              <g key={colour}>
                <path
                  d={`M${start.join(' ')} L${end.join(' ')}`}
                  stroke={COLOURS[colour]}
                  strokeWidth=".09"
                  strokeDasharray=".12 .12"
                />
                <circle
                  cx={start[0]}
                  cy={start[1]}
                  r=".43"
                  fill={PAPER}
                  stroke={INK}
                  strokeWidth=".02"
                />
                <circle
                  cx={end[0]}
                  cy={end[1]}
                  r=".43"
                  fill={PAPER}
                  stroke={INK}
                  strokeWidth=".02"
                />
                <Arrow point={start} angle={180 + quarter * 90} colour={COLOURS[colour]} />
                <Arrow point={end} angle={180 + quarter * 90} colour={COLOURS[colour]} />
                <g transform={`translate(${rotate([7, 12.5], quarter).join(' ')})`}>
                  <PlaneMark colour={COLOURS[colour]} angle={270 + quarter * 90} />
                </g>
              </g>
            );
          })}
        </g>
        {game.planes.flatMap((planes, s) =>
          planes.map((progress, index) => {
            const side = s as Side;
            const atFinish = landing?.side === side && landing.index === index;
            const completed = progress === 56 && !atFinish;
            const point = atFinish ? flightHomePoint(side, 56) : flightPoint(side, progress, index);
            const peers = planes.map((p, i) => (p === progress ? i : -1)).filter((i) => i >= 0);
            const stacked = progress >= 0 && progress < 56 && peers.length > 1;
            const slot = peers.indexOf(index);
            const x = point[0] + (stacked ? (slot % 2 ? 0.23 : -0.23) : 0);
            const y = point[1] + (stacked ? (slot < 2 ? -0.23 : 0.23) : 0);
            const move = moves.find((m) => m.piece === String(index));
            const active = !preview && !!move && game.turn === side;
            const colour = PIECE_COLOURS[side];
            return (
              <g
                key={`${side}-${index}`}
                style={{
                  transform: `translate(${x}px, ${y}px)`,
                  transitionDuration: `${motionMs}ms`,
                }}
                className={active ? 'plane-token active' : 'plane-token'}
                data-completed={completed || undefined}
                role={preview ? undefined : 'button'}
                tabIndex={active ? 0 : undefined}
                aria-disabled={!active}
                aria-label={`${SIDE_NAMES[side]} ${index + 1} 號機${progress === -1 ? '，待起飛' : progress === 56 && !atFinish ? '，已完成' : ''}`}
                onClick={() => active && onMove?.(move!.id)}
                onKeyDown={(event) => {
                  if (active && (event.key === 'Enter' || event.key === ' ')) {
                    event.preventDefault();
                    onMove?.(move!.id);
                  }
                }}
              >
                <circle r=".78" fill="transparent" />
                {active && (
                  <>
                    <circle
                      className="plane-focus-ring"
                      r=".76"
                      fill="#fff3bb"
                      stroke={INK}
                      strokeWidth=".1"
                    />
                    <circle
                      className="plane-keyboard-focus"
                      r=".84"
                      fill="none"
                      stroke={INK}
                      strokeWidth=".1"
                    />
                  </>
                )}
                <g
                  className={
                    leap?.side === side && leap.index === index
                      ? 'plane-body leaping'
                      : 'plane-body'
                  }
                  key={leap?.side === side && leap.index === index ? leap.phase : 'rest'}
                  style={{ animationDuration: `${motionMs}ms` }}
                >
                  {completed && <circle r=".7" fill={PAPER} stroke={colour} strokeWidth=".04" />}
                  <circle
                    r=".59"
                    fill={completed ? PAPER : colour}
                    stroke={completed ? colour : PAPER}
                    strokeWidth=".06"
                  />
                  <circle r=".61" fill="none" stroke={INK} strokeWidth=".025" />
                  <g
                    className="plane-heading"
                    opacity={completed ? 0.25 : 1}
                    transform={`rotate(${
                      leap?.side === side && leap.index === index
                        ? planeHeading(
                            flightPoint(side, leap.from, index),
                            flightPoint(side, leap.to, index),
                          )
                        : atFinish
                          ? 180 + [0, 2, 1, 3][side] * 90
                          : flightHeading(side, progress, index)
                    })`}
                  >
                    <PlaneMark colour={completed ? colour : PAPER} />
                  </g>
                  {completed && (
                    <path
                      className="plane-complete-check"
                      d="M-.3 -.04 L-.09 .18 L.32 -.26"
                      fill="none"
                      stroke={colour}
                      strokeWidth=".15"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  )}
                  <circle cx=".4" cy=".4" r=".22" fill={PAPER} stroke={colour} strokeWidth=".035" />
                  <text
                    x=".4"
                    y=".475"
                    textAnchor="middle"
                    fontSize=".23"
                    fontWeight="700"
                    fill={colour}
                  >
                    {index + 1}
                  </text>
                </g>
              </g>
            );
          }),
        )}
      </svg>
    </div>
  );
}
