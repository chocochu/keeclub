import { Type, type Static } from '@sinclair/typebox';
import { GameKindSchema, GameSchema, ModeSchema, SideSchema } from '../../shared/contracts';
import type { chooseMove } from '../ai';

export const StoredRoomSchema = Type.Object({
  code: Type.String(),
  kind: GameKindSchema,
  mode: ModeSchema,
  players: Type.Array(
    Type.Union([
      Type.Object({ name: Type.String(), hash: Type.String(), ai: Type.Optional(Type.Boolean()) }),
      Type.Null(),
    ]),
  ),
  game: GameSchema,
  updated: Type.Number(),
  thinking: Type.Boolean(),
  aiError: Type.Union([Type.String(), Type.Null()]),
  rematch: Type.Array(SideSchema),
  revision: Type.Integer(),
  // Optional so snapshots created before usage logging remain readable.
  aiGameId: Type.Optional(Type.String()),
});
export type Room = Static<typeof StoredRoomSchema>;
export interface RoomOptions {
  dataFile?: string;
  apiKey?: string;
  model?: string;
  choose?: typeof chooseMove;
  dice?: () => number;
}
export const ROOM_TTL_MS = 24 * 60 * 60 * 1000;
export const MAX_ROOMS = 2000;
