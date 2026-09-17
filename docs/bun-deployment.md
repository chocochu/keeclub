# Bun and Docker deployment

```sh
bun run build
bun run start
```

Elysia serves the compiled React app, API, and WebSockets together on port 3000. Use a reverse proxy that preserves the Host header and supports WebSocket upgrades; serve via HTTPS so browser clipboard and secure transport work. HTTP/WebSocket origins are checked against the request Host. The built-in request limit is per direct client IP; behind a reverse proxy, configure additional per-client limits at the proxy.

A Dockerfile is included:

```sh
docker build -t kee-club .
docker run --env-file .env -p 3000:3000 -v kee-data:/app/.data kee-club
```

Environment options: `PORT` (production, defaults to 3000), `API_PORT` (backend override; development defaults to 3001), and `ROOM_DATA_FILE` (room persistence path). If changing the development backend port, update the Vite proxy target too.

## Persistence and backups

Server rooms are atomically saved one file per room in `.data/rooms.json.d/<code>.json`. Only the changed room is written; presence updates and cleanup passes with nothing to delete perform no snapshot writes. Inactive disconnected server rooms expire after 24 hours. Keep `.data` on a persistent volume in production. Run **one server process**; this implementation is not a distributed room service.

On first startup, an existing `.data/rooms.json` array is imported into the new directory before it becomes active. The original file stays untouched as a backup and is not read again while the new directory exists, so deleted rooms cannot reappear from it. `ROOM_DATA_FILE` still sets the legacy filename/base path; the active directory is that path plus `.d`. Back up the active directory, not just the legacy file. Invalid snapshots fail startup without replacing them. Browser-only games do not use server storage or its 24-hour expiry.

The single-process restriction applies to the Bun backend. For rooms distributed across Durable Objects, see [Cloudflare deployment](cloudflare-deployment.md).
