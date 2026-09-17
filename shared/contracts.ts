import { Type, type Static } from '@sinclair/typebox';

export const GameKindSchema = Type.Union([Type.Literal('jungle'), Type.Literal('flight')]);
export const SideSchema = Type.Union([
  Type.Literal(0),
  Type.Literal(1),
  Type.Literal(2),
  Type.Literal(3),
]);
export const ModeSchema = Type.Union([
  Type.Literal('friend'),
  Type.Literal('ai'),
  Type.Literal('local'),
]);
export const PieceSchema = Type.Object({
  id: Type.String(),
  side: SideSchema,
  rank: Type.Integer({ minimum: 1, maximum: 8 }),
  x: Type.Integer({ minimum: 0, maximum: 6 }),
  y: Type.Integer({ minimum: 0, maximum: 8 }),
});
export const MoveSchema = Type.Object({
  id: Type.String(),
  piece: Type.String(),
  label: Type.String(),
  x: Type.Optional(Type.Integer()),
  y: Type.Optional(Type.Integer()),
  progress: Type.Optional(Type.Integer()),
});
export const FlightSettingsSchema = Type.Object({
  tripleSix: Type.Union([Type.Literal('all'), Type.Literal('closest')]),
  playerCount: Type.Integer({ minimum: 2, maximum: 4 }),
});
export const JungleSettingsSchema = Type.Object({
  ratCaptureAcrossBank: Type.Boolean(),
  jumpOverOwnRat: Type.Boolean(),
});
export type JungleSettings = Static<typeof JungleSettingsSchema>;
const JungleHistorySchema = Type.Array(
  Type.Object({
    side: SideSchema,
    piece: Type.String(),
    fromX: Type.Integer({ minimum: 0, maximum: 6 }),
    fromY: Type.Integer({ minimum: 0, maximum: 8 }),
    x: Type.Integer({ minimum: 0, maximum: 6 }),
    y: Type.Integer({ minimum: 0, maximum: 8 }),
  }),
  { maxItems: 34 },
);
const FlightStepSchema = Type.Object({
  progress: Type.Integer({ minimum: -1, maximum: 56 }),
  kind: Type.Union([
    Type.Literal('step'),
    Type.Literal('jump'),
    Type.Literal('shortcut'),
    Type.Literal('capture'),
    Type.Literal('return'),
    Type.Literal('finish'),
  ]),
  planes: Type.Array(Type.Array(Type.Integer({ minimum: -1, maximum: 56 }))),
});
export type FlightSettings = Static<typeof FlightSettingsSchema>;
export const GameSchema = Type.Object({
  kind: GameKindSchema,
  turn: SideSchema,
  winner: Type.Union([SideSchema, Type.Literal('draw'), Type.Null()]),
  pieces: Type.Array(PieceSchema),
  planes: Type.Array(Type.Array(Type.Integer({ minimum: -1, maximum: 56 }))),
  die: Type.Union([Type.Integer({ minimum: 1, maximum: 6 }), Type.Null()]),
  lastDie: Type.Union([Type.Integer({ minimum: 1, maximum: 6 }), Type.Null()]),
  // Optional so rooms saved before roll animations remain compatible.
  rollCount: Type.Optional(Type.Integer({ minimum: 0 })),
  sixes: Type.Integer(),
  sixPenalty: Type.Optional(Type.Boolean()),
  flightSettings: Type.Optional(FlightSettingsSchema),
  jungleSettings: Type.Optional(JungleSettingsSchema),
  jungleHistory: Type.Optional(JungleHistorySchema),
  rankings: Type.Optional(Type.Array(SideSchema)),
  withdrawn: Type.Optional(Type.Array(SideSchema)),
  lastFlight: Type.Optional(
    Type.Object({ side: SideSchema, piece: Type.Integer(), steps: Type.Array(FlightStepSchema) }),
  ),
  ply: Type.Integer(),
  log: Type.Array(Type.String()),
  quiet: Type.Integer(),
  positions: Type.Record(Type.String(), Type.Integer()),
  lastMove: Type.Optional(MoveSchema),
});
const PlayerSchema = Type.Object({
  name: Type.String(),
  connected: Type.Boolean(),
  ai: Type.Optional(Type.Boolean()),
});
export const FlightPlayerSchema = Type.Object({
  name: Type.String({ maxLength: 24 }),
  ai: Type.Boolean(),
});
export type FlightPlayer = Static<typeof FlightPlayerSchema>;
export const RoomViewSchema = Type.Object({
  code: Type.String(),
  kind: GameKindSchema,
  mode: ModeSchema,
  players: Type.Array(Type.Union([PlayerSchema, Type.Null()])),
  game: GameSchema,
  side: SideSchema,
  ready: Type.Boolean(),
  moves: Type.Array(MoveSchema),
  thinking: Type.Boolean(),
  aiError: Type.Union([Type.String(), Type.Null()]),
  rematch: Type.Array(SideSchema),
  revision: Type.Integer(),
});
export const RoomCodeSchema = Type.String({ pattern: '^[A-Z2-9]{6}$' });
export const RoomParamsSchema = Type.Object({ code: RoomCodeSchema });
export const CredentialsSchema = Type.Object({
  code: RoomCodeSchema,
  token: Type.String({ pattern: '^[a-f0-9]{64}$' }),
});
const NameSchema = Type.String({ minLength: 1, maxLength: 24, pattern: '\\S' });
export const CreateRoomSchema = Type.Object({
  kind: GameKindSchema,
  mode: ModeSchema,
  name: NameSchema,
  flightSettings: Type.Optional(FlightSettingsSchema),
  flightPlayers: Type.Optional(Type.Array(FlightPlayerSchema, { minItems: 2, maxItems: 4 })),
  jungleSettings: Type.Optional(JungleSettingsSchema),
});
export const JoinRoomSchema = Type.Object({ name: NameSchema });
export const RoomActionSchema = Type.Union([
  Type.Object({
    type: Type.Literal('move'),
    id: Type.String({ maxLength: 50 }),
    revision: Type.Integer({ minimum: 0 }),
  }),
  Type.Object({ type: Type.Literal('roll'), revision: Type.Integer({ minimum: 0 }) }),
  Type.Object({ type: Type.Literal('resign') }),
  Type.Object({ type: Type.Literal('rematch') }),
  Type.Object({ type: Type.Literal('retry') }),
]);
export const ConfigSchema = Type.Object({ aiAvailable: Type.Boolean(), model: Type.String() });
export const RoomResponseSchema = Type.Object({ room: RoomViewSchema });
export const SessionResponseSchema = Type.Object({ token: Type.String(), room: RoomViewSchema });
export type GameKind = Static<typeof GameKindSchema>;
export type Side = Static<typeof SideSchema>;
export type Game = Static<typeof GameSchema>;
export type Result = Game['winner'];
export type Piece = Static<typeof PieceSchema>;
export type Move = Static<typeof MoveSchema>;
export type Mode = Static<typeof ModeSchema>;
export type RoomView = Static<typeof RoomViewSchema>;
export type Credentials = Static<typeof CredentialsSchema>;
export type CreateRoom = Static<typeof CreateRoomSchema>;
export type RoomAction = Static<typeof RoomActionSchema>;
export type Config = Static<typeof ConfigSchema>;
export type SessionResponse = Static<typeof SessionResponseSchema>;
export type RoomCommand = RoomAction extends infer Action
  ? Action extends RoomAction
    ? Omit<Action, 'revision'>
    : never
  : never;
