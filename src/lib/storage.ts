import type { Credentials } from '../../shared/contracts';
import { isBrowserRoom } from './room-location';

export const storage = {
  getItem(key: string) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem(key: string, value: string) {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* Private browsing can disable persistence; in-memory play still works. */
    }
  },
  removeItem(key: string) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* See setItem. */
    }
  },
};
export function readCredentials(code: string): Credentials | null {
  if (isBrowserRoom(code)) return { code, token: '' };
  const token = storage.getItem(`kee:${code}`);
  return token && /^[a-f0-9]{64}$/.test(token) ? { code, token } : null;
}
export function saveCredentials(credentials: Credentials) {
  if (!isBrowserRoom(credentials.code))
    storage.setItem(`kee:${credentials.code}`, credentials.token);
  storage.setItem('kee:last', credentials.code);
}
export function forgetCredentials(code: string) {
  storage.removeItem(`kee:${code}`);
}
