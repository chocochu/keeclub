import type { Mode } from './contracts';

/** Explicit seat types support mixed tables; the fallback keeps older rooms playable. */
export function isAiPlayer(
  room: { mode: Mode; players: ({ ai?: boolean } | null)[] },
  side: number,
) {
  return room.players[side]?.ai ?? (room.mode === 'ai' && side !== 0);
}
