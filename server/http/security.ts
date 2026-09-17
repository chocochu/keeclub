import { Elysia } from 'elysia';
import { HttpError } from './errors';

export function securityMiddleware() {
  const requests = new Map<string, { count: number; reset: number }>();
  const cleanup = setInterval(() => {
    for (const [ip, bucket] of requests) if (bucket.reset < Date.now()) requests.delete(ip);
  }, 60_000);
  cleanup.unref();
  return new Elysia({ name: 'http-security' })
    .onStop(() => {
      clearInterval(cleanup);
    })
    .onRequest(({ request, set, server }) => {
      set.headers['Referrer-Policy'] = 'same-origin';
      set.headers['X-Content-Type-Options'] = 'nosniff';
      const { pathname } = new URL(request.url);
      if (!pathname.startsWith('/api') && pathname !== '/ws') return;
      set.headers['Cache-Control'] = 'no-store';
      const origin = request.headers.get('origin');
      if (origin && new URL(origin).host !== request.headers.get('host'))
        throw new HttpError(403, '不允許此來源的操作。');
      const ip = server?.requestIP(request)?.address ?? 'local',
        now = Date.now();
      let bucket = requests.get(ip);
      if (!bucket || bucket.reset < now) {
        bucket = { count: 0, reset: now + 60_000 };
        requests.set(ip, bucket);
      }
      if (++bucket.count > 300) throw new HttpError(429, '操作太頻密，請稍後再試。');
    })
    .onError(({ error, code, set }) => {
      if (code === 'VALIDATION' || code === 'PARSE') {
        set.status = 400;
        return { error: '資料格式不正確，請檢查名字和六位房間碼。' };
      }
      if (error instanceof HttpError) {
        set.status = error.status;
        return { error: error.message };
      }
      if (code === 'NOT_FOUND') {
        set.status = 404;
        return { error: '找不到此操作。' };
      }
      set.status = 400;
      return { error: error instanceof Error ? error.message : '操作失敗，請重試。' };
    })
    .as('global');
}
