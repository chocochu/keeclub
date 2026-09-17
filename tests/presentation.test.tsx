import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { createGame } from '../shared/game';
import type { RoomView } from '../shared/contracts';
import { coloredHistory, celebrationWinner } from '../src/features/room/presentation';
import { Scoreboard } from '../src/features/room/Scoreboard';

test('history colors identify all players, captured sides and legacy turn continuations', () => {
  const entries = coloredHistory([
    '朱紅 · 擲出 6',
    '連續三次 6，1 號機返回機場',
    '金黃 · 1 號機 前進至 34',
    '青綠的飛機返回機場',
    '天藍 · 擲出 3',
    '沒有可移動的飛機',
    '和局 · 三次重複局面',
    '沒有可移動的飛機',
  ]);
  expect(entries.map((entry) => entry.side)).toEqual([0, 0, 2, 1, 3, 3, undefined, undefined]);
  expect(coloredHistory(['沒有可移動的飛機'])[0].side).toBeUndefined();
});

test('celebration follows first place before match end and excludes draws', () => {
  const game = createGame('flight', { playerCount: 4, tripleSix: 'all' });
  expect(celebrationWinner(game)).toBeNull();
  game.rankings = [2];
  expect(celebrationWinner(game)).toBe(2);
  game.rankings = [2, 0, 1, 3];
  game.winner = 2;
  expect(celebrationWinner(game)).toBe(2);
  const jungle = createGame('jungle');
  jungle.winner = 1;
  expect(celebrationWinner(jungle)).toBe(1);
  jungle.winner = 'draw';
  expect(celebrationWinner(jungle)).toBeNull();
});

test('scoreboard distinguishes completed counts and excludes transient finish-line bounces', () => {
  const game = createGame('flight');
  game.planes = [
    [56, 56, 56, 56],
    [56, -1, -1, -1],
  ];
  const room: RoomView = {
    code: 'VISUAL',
    kind: 'flight',
    mode: 'local',
    side: 0,
    ready: true,
    game,
    players: [
      { name: 'Red', connected: true },
      { name: 'Green', connected: true },
    ],
    moves: [],
    thinking: false,
    aiError: null,
    rematch: [],
    revision: 1,
  };
  const html = renderToStaticMarkup(<Scoreboard room={room} landing={{ side: 0, index: 3 }} />);
  expect(html).toContain('data-player="0" data-completed="3"');
  expect(html).toContain('data-player="1" data-completed="1"');
  expect(html).toContain('尚餘 1 架');
  expect(html).toContain('尚餘 3 架');
  expect(html).toContain('value="3"');
  game.rankings = [0];
  expect(renderToStaticMarkup(<Scoreboard room={room} />)).toContain('第 1 名');
  game.withdrawn = [1];
  const withdrawn = renderToStaticMarkup(<Scoreboard room={room} />);
  expect(withdrawn).toContain('第 1 名');
  expect(withdrawn).toContain('已認輸');
  expect(withdrawn).not.toContain('尚餘 3 架');
});
