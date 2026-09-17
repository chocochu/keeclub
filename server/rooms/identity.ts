import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Side } from '../../shared/contracts';
import { HttpError } from '../http/errors';
import type { Room } from './model';

const digest = (token: string) => createHash('sha256').update(token).digest('hex');
export function createSeat(name: string) {
  const token = randomBytes(32).toString('hex');
  return { token, seat: { name: name.trim(), hash: digest(token) } };
}
export function authenticate(room: Room, token: string | undefined): Side {
  if (!token || !/^[a-f0-9]{64}$/.test(token)) throw new HttpError(401, '請重新加入房間。');
  const hash = digest(token);
  const side = room.players.findIndex(
    (player) => player?.hash && timingSafeEqual(Buffer.from(player.hash), Buffer.from(hash)),
  );
  if (side < 0 || side >= room.players.length)
    throw new HttpError(401, '房間憑證已失效，請重新加入。');
  return side as Side;
}
export function bearer(request: Request) {
  return request.headers.get('authorization')?.replace(/^Bearer /, '');
}
