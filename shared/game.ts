import {
  DEFAULT_FLIGHT_SETTINGS,
  activeFlightSides,
  finishFlightGame,
  flightMovePath,
  flightMoveTrace,
  nextFlightSide,
  returnFlightPlanes,
  trackIndex,
} from './flight';
import type { FlightSettings, JungleSettings } from './contracts';
export { flightMovePath, trackIndex, FLIGHT_QUARTERS, flightSides } from './flight';
import type { GameKind, Side, Piece, Move, Game } from './contracts';
export type { GameKind, Side, Result, Piece, Move, Game } from './contracts';

export const ANIMALS = ['', '鼠', '貓', '狗', '狼', '豹', '虎', '獅', '象'];
export const ANIMAL_NAMES = [
  '',
  'Rat',
  'Cat',
  'Dog',
  'Wolf',
  'Leopard',
  'Tiger',
  'Lion',
  'Elephant',
];
export const SIDE_NAMES = ['朱紅', '青綠', '金黃', '天藍'];
export const DEFAULT_JUNGLE_SETTINGS: JungleSettings = {
  ratCaptureAcrossBank: false,
  jumpOverOwnRat: false,
};
export const other = (side: Side): Side => (side === 0 ? 1 : 0);
export const water = (x: number, y: number) => y >= 3 && y <= 5 && [1, 2, 4, 5].includes(x);
export function den(x: number, y: number): Side | null {
  return x === 3 && y === 8 ? 0 : x === 3 && y === 0 ? 1 : null;
}
export function trap(x: number, y: number): Side | null {
  if ((y === 8 && [2, 4].includes(x)) || (y === 7 && x === 3)) return 0;
  if ((y === 0 && [2, 4].includes(x)) || (y === 1 && x === 3)) return 1;
  return null;
}
export function createGame(kind: GameKind, settings?: FlightSettings | JungleSettings): Game {
  const flightSettings = settings && 'tripleSix' in settings ? settings : DEFAULT_FLIGHT_SETTINGS;
  const jungleSettings =
    settings && 'ratCaptureAcrossBank' in settings ? settings : DEFAULT_JUNGLE_SETTINGS;
  const start = [
    [7, 0, 0],
    [6, 6, 0],
    [3, 1, 1],
    [2, 5, 1],
    [1, 0, 2],
    [5, 2, 2],
    [4, 4, 2],
    [8, 6, 2],
  ];
  const pieces = ([0, 1] as Side[]).flatMap((side) =>
    start.map(([rank, x, y]) => ({
      id: `${side}-${rank}`,
      side,
      rank,
      x: side === 0 ? 6 - x : x,
      y: side === 0 ? 8 - y : y,
    })),
  );
  const game: Game = {
    kind,
    turn: 0,
    winner: null,
    pieces: kind === 'jungle' ? pieces : [],
    planes: Array.from({ length: kind === 'flight' ? flightSettings.playerCount : 2 }, () => [
      -1, -1, -1, -1,
    ]),
    ...(kind === 'flight'
      ? { flightSettings: { ...flightSettings }, rankings: [], withdrawn: [] }
      : { jungleSettings: { ...jungleSettings }, jungleHistory: [] }),
    die: null,
    lastDie: null,
    sixes: 0,
    ply: 0,
    log: [],
    quiet: 0,
    positions: {},
  };
  game.positions[positionKey(game)] = 1;
  return game;
}
export const coord = (x: number, y: number) => `${'ABCDEFG'[x]}${9 - y}`;
export function effectiveRank(piece: Piece) {
  const owner = trap(piece.x, piece.y);
  return owner !== null && owner !== piece.side ? 0 : piece.rank;
}
function canCapture(a: Piece, b: Piece, settings: JungleSettings) {
  if (a.side === b.side) return false;
  if (
    water(a.x, a.y) !== water(b.x, b.y) &&
    !(settings.ratCaptureAcrossBank && a.rank === 1 && b.rank === 1)
  )
    return false;
  const ar = effectiveRank(a),
    br = effectiveRank(b);
  if (br === 0) return true;
  if (ar === 0) return false;
  if (ar === 1 && br === 8) return true;
  if (ar === 8 && br === 1) return false;
  return ar >= br;
}
export function legalMoves(game: Game): Move[] {
  if (game.winner !== null) return [];
  if (game.kind === 'flight') {
    if (game.die === null) return [];
    return game.planes[game.turn].flatMap((p, index) => {
      const progress = flightMovePath(p, game.die!).at(-1);
      if (progress === undefined) return [];
      return [
        {
          id: `plane-${index}`,
          piece: String(index),
          progress,
          label: `${index + 1} 號機 ${p === -1 ? '起飛' : progress === 56 ? '抵達終點' : `前進至 ${progress}`}`,
        },
      ];
    });
  }
  const moves = jungleMoves(game);
  const restricted = new Set(jungleRestrictions(game, moves).map(({ move }) => move.id));
  return moves.filter((move) => !restricted.has(move.id));
}

// Geometry and capture rules only; also used to identify animals under attack
// without recursively applying the chased-animal exception.
function jungleMoves(game: Game): Move[] {
  const settings = game.jungleSettings ?? DEFAULT_JUNGLE_SETTINGS;
  const moves: Move[] = [];
  for (const piece of game.pieces.filter((p) => p.side === game.turn)) {
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      let x = piece.x + dx,
        y = piece.y + dy;
      if (water(x, y) && [6, 7].includes(piece.rank)) {
        let blocked = false;
        while (water(x, y)) {
          if (
            game.pieces.some(
              (p) =>
                p.x === x &&
                p.y === y &&
                !(settings.jumpOverOwnRat && p.side === piece.side && p.rank === 1),
            )
          )
            blocked = true;
          x += dx;
          y += dy;
        }
        if (blocked) continue;
      }
      if (
        x < 0 ||
        x > 6 ||
        y < 0 ||
        y > 8 ||
        den(x, y) === piece.side ||
        (water(x, y) && piece.rank !== 1)
      )
        continue;
      const target = game.pieces.find((p) => p.x === x && p.y === y);
      if (target && !canCapture(piece, target, settings)) continue;
      moves.push({
        id: `${piece.id}:${x},${y}`,
        piece: piece.id,
        x,
        y,
        label: `${ANIMALS[piece.rank]} ${coord(piece.x, piece.y)} → ${coord(x, y)}${target ? `，吃${ANIMALS[target.rank]}` : ''}`,
      });
    }
  }
  return moves;
}

export function jungleRestrictions(
  game: Game,
  moves = jungleMoves(game),
): { move: Move; rule: '7-3' | '17-5' }[] {
  if (game.kind !== 'jungle' || game.winner !== null) return [];
  const history = (game.jungleHistory ?? []).filter((entry) => entry.side === game.turn);
  const seven = history.slice(-7);
  const seventeen = history.slice(-17);
  const enteredTrap = (entries: typeof history) => entries.some(({ x, y }) => trap(x, y) !== null);
  const checkSeven = seven.length === 7 && !enteredTrap(seven);
  const checkSeventeen =
    seventeen.length === 17 &&
    !enteredTrap(seventeen) &&
    seventeen.every((entry) => entry.piece === seventeen[0].piece);
  // Activity includes both the starting cell and every landing in the window.
  const area = new Set(
    seventeen.flatMap(({ fromX, fromY, x, y }) => [`${fromX},${fromY}`, `${x},${y}`]),
  );
  const attacks = checkSeven ? jungleMoves({ ...game, turn: other(game.turn) }) : [];
  const chased = new Set(
    game.pieces
      .filter(
        (piece) =>
          piece.side === game.turn &&
          attacks.some((move) => move.x === piece.x && move.y === piece.y),
      )
      .map((piece) => piece.id),
  );
  return moves.flatMap<{ move: Move; rule: '7-3' | '17-5' }>((move) => {
    if (
      checkSeventeen &&
      area.size <= 5 &&
      move.piece === seventeen[0].piece &&
      area.has(`${move.x},${move.y}`)
    )
      return [{ move, rule: '17-5' as const }];
    if (
      checkSeven &&
      !chased.has(move.piece) &&
      seven.filter(
        (entry) => entry.piece === move.piece && entry.x === move.x && entry.y === move.y,
      ).length >= 3
    )
      return [{ move, rule: '7-3' as const }];
    return [];
  });
}
export function positionKey(g: Game) {
  return `${g.turn}|${g.pieces
    .map((p) => `${p.id}:${p.x},${p.y}`)
    .sort()
    .join('|')}`;
}
function log(g: Game, message: string) {
  g.log = [...g.log, message].slice(-100);
}
export function applyMove(state: Game, moveId: string): Game {
  const move = legalMoves(state).find((m) => m.id === moveId);
  if (!move) {
    const restriction =
      state.kind === 'jungle'
        ? jungleRestrictions(state).find(({ move }) => move.id === moveId)
        : undefined;
    if (restriction)
      throw new Error(`${restriction.rule} 違例：這隻動物暫時不能進入該格，請選擇其他走法。`);
    throw new Error('這一步不能走，請重新選擇。');
  }
  const g = structuredClone(state),
    side = g.turn;
  g.ply++;
  g.lastMove = move;
  log(g, `${SIDE_NAMES[side]} · ${move.label}`);
  if (g.kind === 'jungle') {
    const target = g.pieces.find((p) => p.x === move.x && p.y === move.y);
    g.pieces = g.pieces.filter((p) => p !== target);
    const piece = g.pieces.find((p) => p.id === move.piece)!;
    g.jungleHistory = [
      ...(g.jungleHistory ?? []),
      {
        side,
        piece: piece.id,
        fromX: piece.x,
        fromY: piece.y,
        x: move.x!,
        y: move.y!,
      },
    ].slice(-34);
    piece.x = move.x!;
    piece.y = move.y!;
    g.quiet = target ? 0 : g.quiet + 1;
    g.turn = other(side);
    if (
      den(piece.x, piece.y) === other(side) ||
      !g.pieces.some((p) => p.side === other(side)) ||
      legalMoves(g).length === 0
    )
      g.winner = side;
    const key = positionKey(g);
    g.positions[key] = (g.positions[key] ?? 0) + 1;
    if (g.winner === null && (g.positions[key] >= 3 || g.quiet >= 100)) {
      g.winner = 'draw';
      log(g, '和局 · 三次重複局面或連續 100 步沒有吃子');
    }
  } else {
    const index = Number(move.piece);
    g.lastFlight = flightMoveTrace(g, index);
    const previousPlanes = g.planes;
    g.planes = g.lastFlight.steps.at(-1)!.planes;
    g.planes.forEach((row, enemy) => {
      if (enemy !== side && row.some((p, i) => p === -1 && previousPlanes[enemy][i] >= 0))
        log(g, `${SIDE_NAMES[enemy]}的飛機返回機場`);
    });
    if (g.planes[side].every((p) => p === 56)) {
      g.rankings = [...(g.rankings ?? []), side];
      log(g, `${SIDE_NAMES[side]}獲得第 ${g.rankings.length} 名`);
      finishFlightGame(g);
    }
    if (g.die !== 6 || g.rankings?.includes(side)) {
      g.turn = nextFlightSide(g);
      g.sixes = 0;
    }
    g.die = null;
  }
  return g;
}
export function rollDice(state: Game, value: number): Game {
  if (
    state.kind !== 'flight' ||
    state.winner !== null ||
    state.die !== null ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > 6
  )
    throw new Error('現在不能擲骰。');
  const g = structuredClone(state);
  g.die = value;
  g.lastFlight = undefined;
  g.rollCount = (g.rollCount ?? 0) + 1;
  g.lastDie = value;
  g.sixes = value === 6 ? g.sixes + 1 : 0;
  g.sixPenalty = g.sixes === 3;
  log(g, `${SIDE_NAMES[g.turn]} · 擲出 ${value}`);
  if (g.sixes === 3) {
    g.die = null;
    if ((g.flightSettings?.tripleSix ?? 'all') === 'closest') {
      const eligible = g.planes[g.turn]
        .map((progress, index) => ({ progress, index }))
        .filter(({ progress }) => progress >= 0 && progress < 56)
        .sort((a, b) => b.progress - a.progress || a.index - b.index);
      log(
        g,
        eligible.length
          ? `連續三次 6，${eligible[0].index + 1} 號機返回機場`
          : '連續三次 6，沒有未完成飛機在場，回合結束',
      );
      returnFlightPlanes(g, eligible[0]?.index ?? -1);
    } else {
      log(g, '連續三次 6，未完成的飛機全部返回機場');
      returnFlightPlanes(g);
    }
  } else if (legalMoves(g).length === 0) {
    log(g, '沒有可移動的飛機');
    g.die = null;
    if (value !== 6) {
      g.turn = nextFlightSide(g);
      g.sixes = 0;
    }
  }
  return g;
}
export function canResign(game: Game, side: Side) {
  return (
    game.winner === null &&
    (game.kind === 'flight' ? activeFlightSides(game).includes(side) : side === 0 || side === 1)
  );
}
export function resign(state: Game, side: Side): Game {
  if (state.winner !== null) throw new Error('這局已經結束。');
  if (!canResign(state, side)) throw new Error('你已完成或退出這局，不能再認輸。');
  const g = structuredClone(state);
  if (g.kind === 'flight') {
    g.withdrawn = [...(g.withdrawn ?? []), side];
    g.planes[side] = g.planes[side].map((p) => (p === 56 ? p : -1));
    g.lastFlight = undefined;
    if (g.turn === side) {
      g.turn = nextFlightSide(g);
      g.die = null;
      g.sixes = 0;
      g.sixPenalty = false;
    }
    finishFlightGame(g);
  } else g.winner = other(side);
  log(g, `${SIDE_NAMES[side]}認輸`);
  return g;
}
// A continuous clockwise, 52-space cross-shaped circuit. Each coordinate occurs once.
export const TRACK: number[][] = [
  [6, 13],
  [6, 12],
  [6, 11],
  [6, 10],
  [6, 9],
  [5, 8],
  [4, 8],
  [3, 8],
  [2, 8],
  [1, 8],
  [0, 8],
  [0, 7],
  [0, 6],
  [1, 6],
  [2, 6],
  [3, 6],
  [4, 6],
  [5, 6],
  [6, 5],
  [6, 4],
  [6, 3],
  [6, 2],
  [6, 1],
  [6, 0],
  [7, 0],
  [8, 0],
  [8, 1],
  [8, 2],
  [8, 3],
  [8, 4],
  [8, 5],
  [9, 6],
  [10, 6],
  [11, 6],
  [12, 6],
  [13, 6],
  [14, 6],
  [14, 7],
  [14, 8],
  [13, 8],
  [12, 8],
  [11, 8],
  [10, 8],
  [9, 8],
  [8, 9],
  [8, 10],
  [8, 11],
  [8, 12],
  [8, 13],
  [8, 14],
  [7, 14],
  [6, 14],
];
export function planeCoord(side: Side, progress: number, index: number): number[] {
  if (progress === -1)
    return side === 0
      ? [1.5 + (index % 2) * 2, 10.5 + Math.floor(index / 2) * 2]
      : [10.5 + (index % 2) * 2, 1.5 + Math.floor(index / 2) * 2];
  if (progress >= 51) return side === 0 ? [7, 13 - (progress - 51)] : [7, 1 + (progress - 51)];
  return TRACK[trackIndex(side, progress)];
}
export const RULES: Record<GameKind, string[]> = {
  jungle: [
    '先進入對方獸穴，或令對方無棋可走即勝出。朱紅先行，每回合直行一格。',
    '象 > 獅 > 虎 > 豹 > 狼 > 狗 > 貓 > 鼠；可吃同級或較弱棋子。鼠可吃象，象不可吃鼠。',
    '只有鼠可以下水；水陸之間不可吃子。獅、虎可直線跳河，途中有鼠便不能跳。',
    '進入敵方陷阱會失去力量，離開後恢復。不可進入自己的獸穴。',
    '同一局面出現三次，或連續 100 步沒有吃子，自動和局。',
    '7-3：完成 7 步己方走棋後，若同一動物在最近 7 步已進入同格 3 次，下一步不可第 4 次進入。期間曾走入陷阱則豁免；當下正被敵獸威脅吃掉的動物亦豁免。',
    '17-5：最近 17 步己方走棋只動同一動物，且活動範圍不超過 5 格，下一步該動物不可進入這些格；期間曾走入陷阱則豁免。活動範圍包含起點及落點。',
  ],
  flight: [
    '2–4 人順時針輪流擲骰，各有四架飛機。四架全部完成者依序排名。',
    '擲出 6 才可起飛至獨立起飛格，下一次擲骰才前進。擲出 6 走棋後再擲一次。',
    '同一回合連續三次擲出 6，第三次不走棋並結束回合。預設所有未完成飛機返回機場；房間可改為自動退回最接近終點的一架未完成飛機，同距離取編號較小者。已完成飛機不受罰。',
    '落在自己的顏色格可跳四格，終點航道除外。直接擲到虛線起點，飛到對面後再跳四格；先跳到虛線起點，則飛到對面後停止。',
    '擲骰落點、每次跳躍落點上的所有敵機均返回機場；飛越虛線時，也吃掉對角方航道交叉格上的敵機。普通前進途中不吃子。',
    '同隊可疊放，每次只移動一架，不可整疊移動。由己方拐彎箭頭進入終點航道，因此每方都有兩格外圈無法到達。',
    '步數超出終點時，必須在終點反彈，向後走完剩餘步數。例如距終點兩格時擲出 3，前進兩格後退回一格，不算完成。',
    '剛好抵達終點的飛機返回機場，反轉標示完成；完成的玩家退出輪流，其他玩家繼續排名。',
    '認輸只退出自己的對局，未完成飛機移回機場，不再參與輪流或排名；其他玩家繼續，已取得的名次不變。只剩一位未完成玩家時，該玩家取得最後名次並結束對局。已完成或認輸的玩家不能再認輸。',
  ],
};

export const RULE_TITLES: Record<GameKind, string[]> = {
  jungle: ['勝負與行棋', '棋子強弱', '河流與跳河', '陷阱與獸穴', '和局', '7-3 禁走', '17-5 禁走'],
  flight: [
    '人數與排名',
    '起飛與再擲',
    '三次六',
    '同色跳躍與捷徑',
    '吃子',
    '疊棋與航道',
    '終點反彈',
    '完成飛行',
    '認輸與退出',
  ],
};

export function jungleRules(settings: JungleSettings = DEFAULT_JUNGLE_SETTINGS) {
  return RULES.jungle.map((rule, index) =>
    index === 2
      ? `只有鼠可以下水；${settings.ratCaptureAcrossBank ? '鼠可跨水陸互吃，其他動物不可跨水陸吃子' : '水陸之間不可吃子'}。獅、虎可直線跳河，${settings.jumpOverOwnRat ? '可跳過己方鼠，敵方鼠仍會阻擋' : '途中有任何一方的鼠便不能跳'}。`
      : rule,
  );
}
