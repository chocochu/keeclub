import { Elysia } from 'elysia';
import {
  ConfigSchema,
  CreateRoomSchema,
  JoinRoomSchema,
  RoomActionSchema,
  RoomParamsSchema,
  RoomResponseSchema,
  SessionResponseSchema,
} from '../../shared/contracts';
import { bearer } from './identity';
import type {
  Config,
  CreateRoom,
  RoomAction,
  RoomView,
  SessionResponse,
} from '../../shared/contracts';
type MaybePromise<T> = T | Promise<T>;
export interface RoomGateway {
  readonly config: Config;
  create(input: CreateRoom): MaybePromise<SessionResponse>;
  join(code: string, name: string): MaybePromise<SessionResponse>;
  getView(code: string, token?: string): MaybePromise<{ room: RoomView }>;
  command(
    code: string,
    token: string | undefined,
    action: RoomAction,
  ): MaybePromise<{ room: RoomView }>;
}

/** HTTP is an adapter: Elysia validates boundaries; RoomService owns game transitions. */
export function roomRoutes(service: RoomGateway) {
  return new Elysia({ prefix: '/api' })
    .get('/config', () => service.config, { response: ConfigSchema })
    .post(
      '/rooms',
      ({ body, set }) => {
        set.status = 201;
        return service.create(body);
      },
      { body: CreateRoomSchema, response: { 201: SessionResponseSchema } },
    )
    .post('/rooms/:code/join', ({ params, body }) => service.join(params.code, body.name), {
      params: RoomParamsSchema,
      body: JoinRoomSchema,
      response: SessionResponseSchema,
    })
    .get('/rooms/:code', ({ params, request }) => service.getView(params.code, bearer(request)), {
      params: RoomParamsSchema,
      response: RoomResponseSchema,
    })
    .post(
      '/rooms/:code/action',
      ({ body, params, request }) => service.command(params.code, bearer(request), body),
      { params: RoomParamsSchema, body: RoomActionSchema, response: RoomResponseSchema },
    );
}
