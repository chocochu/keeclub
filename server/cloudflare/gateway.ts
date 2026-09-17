import { env } from 'cloudflare:workers';
import { randomInt } from 'node:crypto';
import type { CreateRoom, RoomAction } from '../../shared/contracts';
import { HttpError } from '../http/errors';
import type { RpcResult } from './game-room';

function unwrap<T>(result: RpcResult<T>): T {
  if (!result.ok) throw new HttpError(result.status, result.error);
  return result.value;
}
export const gateway = {
  get config() {
    return { aiAvailable: !!env.TYPESAFE_API_KEY, model: env.TYPESAFE_MODEL };
  },
  async create(input: CreateRoom) {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    for (let i = 0; i < 5; i++) {
      const code = Array.from({ length: 6 }, () => alphabet[randomInt(alphabet.length)]).join('');
      const result = await env.ROOMS.getByName(code).create(code, input);
      if (result.ok || result.status !== 409) return unwrap(result);
    }
    throw new HttpError(503, '暫時無法建立房間，請重試。');
  },
  async join(code: string, name: string) {
    return unwrap(await env.ROOMS.getByName(code).join(name));
  },
  async getView(code: string, token?: string) {
    return unwrap(await env.ROOMS.getByName(code).getView(token));
  },
  async command(code: string, token: string | undefined, action: RoomAction) {
    return unwrap(await env.ROOMS.getByName(code).act(token, action));
  },
};
