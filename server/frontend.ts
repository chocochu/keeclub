import path from 'node:path';
import { Elysia } from 'elysia';
import { staticPlugin } from '@elysiajs/static';

export function frontend(assets: string) {
  const shell = () =>
    new Response(Bun.file(path.join(assets, 'index.html')), {
      headers: { 'Cache-Control': 'no-cache' },
    });
  return (
    new Elysia({ name: 'frontend' })
      // Revalidate the worker, manifest, and HTML on deployments. The service worker
      // owns offline asset caching; a day-long HTTP cache would delay app updates.
      .use(staticPlugin({ assets, prefix: '/', maxAge: 0, directive: 'no-cache' }))
      .get('/', shell)
      .get('/room/:code', shell)
      .get('/local/:id', shell)
  );
}
