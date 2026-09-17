import { env } from 'cloudflare:workers';
import { Elysia } from 'elysia';
import { CloudflareAdapter } from 'elysia/adapter/cloudflare-worker';
import { roomRoutes } from './rooms/routes';
import { gateway } from './cloudflare/gateway';
import { HttpError } from './http/errors';
export { GameRoom } from './cloudflare/game-room';

// The installed adapter's beforeCompile always calls Function(), even with aot:false.
// Use its Web-standard transport without that hook so tests and deployment share
// the same interpreted handlers and never require runtime code generation.
const app = new Elysia({
  aot: false,
  normalize: false,
  adapter: { ...CloudflareAdapter, beforeCompile: undefined },
})
  .onError(({ error, code, set }) => {
    if (error instanceof HttpError) {
      set.status = error.status;
      return { error: error.message };
    }
    if (code === 'VALIDATION' || code === 'PARSE') {
      set.status = 400;
      return { error: '資料格式不正確，請檢查名字和六位房間碼。' };
    }
    if (code === 'NOT_FOUND') {
      set.status = 404;
      return { error: '找不到此操作。' };
    }
    set.status = 503;
    console.error(JSON.stringify({ event: 'worker.request_failed', kind: code }));
    return { error: '伺服器暫時無法處理，請稍後重試。' };
  })
  .use(roomRoutes(gateway))
  .compile();

const headers = {
  'Cache-Control': 'no-store',
  'Referrer-Policy': 'same-origin',
  'X-Content-Type-Options': 'nosniff',
};
function error(status: number, message: string) {
  return Response.json({ error: message }, { status, headers });
}
async function boundedRequest(request: Request) {
  if (!request.body) return request;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const next = await reader.read();
    if (next.done) break;
    size += next.value.byteLength;
    if (size > 8192) {
      await reader.cancel();
      throw new HttpError(413, '資料過大。');
    }
    chunks.push(next.value);
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new Request(request, { method: request.method, body });
}
export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname !== '/api' && !url.pathname.startsWith('/api/'))
      return env.ASSETS.fetch(request);
    const origin = request.headers.get('origin');
    if (origin && origin !== url.origin) return error(403, '不允許此來源的操作。');
    try {
      const ip = request.headers.get('CF-Connecting-IP') ?? 'local';
      if (!(await env.API_LIMITER.limit({ key: ip })).success)
        return error(429, '操作太頻密，請稍後再試。');
      const ws = url.pathname.match(/^\/api\/rooms\/([A-Z2-9]{6})\/ws$/);
      if (ws && request.method === 'GET') {
        const response = await env.ROOMS.getByName(ws[1]).fetch(request);
        if (response.status === 101) return response;
        const copy = new Response(response.body, response);
        for (const [key, value] of Object.entries(headers)) copy.headers.set(key, value);
        return copy;
      }
      const response = await app.fetch(await boundedRequest(request));
      for (const [key, value] of Object.entries(headers)) response.headers.set(key, value);
      return response;
    } catch (failure) {
      if (failure instanceof HttpError) return error(failure.status, failure.message);
      console.error(JSON.stringify({ event: 'worker.request_failed', kind: 'runtime' }));
      return error(503, '伺服器暫時無法處理，請稍後重試。');
    }
  },
} satisfies ExportedHandler<Env>;
