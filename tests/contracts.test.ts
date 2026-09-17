import { expect, test } from 'bun:test';
import { Value } from '@sinclair/typebox/value';
import {
  CreateRoomSchema,
  CredentialsSchema,
  GameSchema,
  RoomActionSchema,
} from '../shared/contracts';
import { createGame } from '../shared/game';

test('shared TypeBox schemas reject malformed commands before the game service', () => {
  expect(Value.Check(CreateRoomSchema, { name: '   ', kind: 'jungle', mode: 'friend' })).toBe(
    false,
  );
  expect(Value.Check(CreateRoomSchema, { name: 'Friend', kind: 'flight', mode: 'friend' })).toBe(
    true,
  );
  expect(Value.Check(RoomActionSchema, { type: 'move', id: '0-1:6,5' })).toBe(false);
  expect(Value.Check(RoomActionSchema, { type: 'roll', revision: -1 })).toBe(false);
  expect(Value.Check(RoomActionSchema, { type: 'teleport', revision: 0 })).toBe(false);
  expect(Value.Check(CredentialsSchema, { code: 'ABC234', token: 'x'.repeat(64) })).toBe(false);
});
test('both game engines produce valid wire and persistence snapshots', () => {
  for (const kind of ['jungle', 'flight'] as const)
    expect(Value.Check(GameSchema, createGame(kind))).toBe(true);
  const malformed = createGame('jungle');
  malformed.pieces[0].x = 100;
  expect(Value.Check(GameSchema, malformed)).toBe(false);
});
