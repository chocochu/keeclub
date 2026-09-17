import { isAiPlayer } from '../../../shared/players';
import type { Game, RoomView } from '../../../shared/contracts';
export function flightRollCue(game: Game): 'extra' | 'forfeit' | null {
  if (game.kind !== 'flight' || game.lastDie !== 6 || game.winner !== null) return null;
  return game.sixPenalty ? 'forfeit' : game.sixes > 0 ? 'extra' : null;
}
export function isMyTurn(room: RoomView) {
  return (
    !isAiPlayer(room, room.game.turn) && (room.mode === 'local' || room.game.turn === room.side)
  );
}
export function roomStatus(room: RoomView, myTurn = isMyTurn(room)) {
  const { game } = room;
  if (game.winner === 'draw') return '和局';
  if (game.winner !== null) return `${room.players[game.winner]?.name} 勝出！`;
  if (!room.ready) return '等候朋友加入';
  if (room.thinking) return 'AI 思考中…';
  if (!myTurn) return '等候對方走棋…';
  return game.kind === 'flight' && game.die === null ? '輪到你擲骰' : '輪到你走棋';
}
