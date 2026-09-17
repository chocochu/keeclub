import path from 'node:path';
import { createApp } from './app';
import { frontend } from './frontend';
const root = path.resolve(import.meta.dir, '..');
const { app } = createApp({
  dataFile: process.env.ROOM_DATA_FILE ?? path.join(root, '.data/rooms.json'),
});
if (process.env.NODE_ENV === 'production') {
  app.use(frontend(path.join(root, 'dist')));
}
const port = Number(
  process.env.API_PORT ??
    (process.env.NODE_ENV === 'production' ? (process.env.PORT ?? 3000) : 3001),
);
app.listen({ port, hostname: '0.0.0.0' });
console.log(`棋聚 Elysia server → http://localhost:${port}`);
