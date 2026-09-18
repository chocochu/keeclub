# 棋聚 Kee Club

Play **鬥獸棋 (Jungle)** and **飛行棋 (Aeroplane Chess)** with friends, on one device, or against AI. Kee Club has a Traditional Chinese interface, private invite rooms, reconnectable seats, and an installable web app.

- **Jungle:** two players, configurable river rules, draws, and anti-chase rules.
- **Aeroplane Chess:** two to four players, human and AI seats, configurable third-six penalties, and individual rankings.
- **Offline play:** human-only same-device games save in the browser. The production PWA can reopen them offline after its first online load.

Built with TypeScript, React, Vite, Elysia, and Bun. Online rooms can run on a single Bun server or Cloudflare Workers with Durable Objects.

## Quick start

Use **Bun 1.4.2**, the version pinned in `package.json` and the Dockerfile.

```sh
bun install --frozen-lockfile
bun run dev
```

Open **[localhost:3000](http://localhost:3000)**. Vite serves the frontend on port 3000 and proxies API and WebSocket requests to the Bun backend on port 3001. No environment file or AI key is needed for human-only games.

To play with someone on your network, open the app through your computer's LAN address before creating an invite. Both devices must reach that address; a `localhost` invite only works on your own computer. Friends on other networks need a reachable deployment.

## Play modes

| Mode                     | Players                                                | Storage | Connection needed                             |
| ------------------------ | ------------------------------------------------------ | ------- | --------------------------------------------- |
| Friends                  | Two for Jungle; two to four for Aeroplane              | Server  | Yes                                           |
| Same device, humans only | Two for Jungle; two to four for Aeroplane              | Browser | Only for the first load of the production PWA |
| Games with AI            | Jungle versus AI; Aeroplane can mix human and AI seats | Server  | Yes, with a configured TypeSafe key           |

Choose a game and mode in the lobby. Invite friends with the room link or six-character code; online games start when all seats are filled. Reloading restores your seat in the same browser and origin. Use **返回上一局** to resume the last saved game.

The in-app **玩法指南** explains this implementation's rules. See [playing, rules, and offline installation](docs/playing.md) for details, including rematches and browser-save limits.

## Optional AI setup

Copy the example only if you do not already have a local `.env`:

```sh
cp -n .env.example .env
```

Set `TYPESAFE_API_KEY` in `.env`, then restart the server. The default model is `jev-latest`. Keep the key server-side; never prefix it with `VITE_`.

To use your OpenRouter credits instead, set these server-side variables:

```dotenv
AI_PROVIDER=openrouter
OPENROUTER_API_KEY=your_key_here
OPENROUTER_MODEL=typesafe/jev-1.13
```

OpenRouter uses its Decisions API. The default provider remains `typesafe`; provider selection is explicit and never falls back to another account.

The engine supplies legal moves to Jev and validates its choice. Failed requests leave the turn available for manual retry. AI strength has not been benchmarked. [AI integration](docs/ai.md) covers selection policy, error handling, and usage logs.

## Development

```sh
bun run check         # Formatting, lint, build, Bun tests, Worker types and tests
bun run format        # Apply formatting
bun run lint          # Lint with warnings treated as errors
bun run typecheck     # Check the Bun/frontend TypeScript graph
bun run test          # Game rules, room services, HTTP/WebSockets, and client state
bun run test:workers  # Cloudflare runtime tests with mocked inference
```

Automated tests use temporary storage and mocked or injected providers; they make no paid AI requests. `bun run check` does not include browser smoke tests. See [development and verification](docs/development.md) for browser checks, generated types, and contribution guidance.

## Deployment

### Bun or Docker

```sh
bun run build
bun run start
```

The production server serves the frontend, API, and WebSockets on port 3000. Run one Bun process and persist `.data/`; use HTTPS and a reverse proxy with WebSocket support for public hosting.

```sh
docker build -t kee-club .
docker run -p 3000:3000 -v kee-data:/app/.data kee-club
```

To enable AI in Docker, add `--env-file .env` to `docker run`. See [Bun deployment](docs/bun-deployment.md) for proxy requirements and snapshot backups.

### Cloudflare Workers

```sh
bun run dev:cloudflare
```

This builds the frontend and starts Wrangler locally, normally at [localhost:8787](http://localhost:8787). Each online or AI room uses a SQLite-backed Durable Object. For local AI, copy `.dev.vars.example` to `.dev.vars` and set the key there.

See [Cloudflare deployment](docs/cloudflare-deployment.md) for authentication, secrets, staging, and production commands. Bun snapshots and browser saves are not automatically transferred to a new backend or hostname.

## Configuration

| Variable             | Default               | Purpose                                                                                                  |
| -------------------- | --------------------- | -------------------------------------------------------------------------------------------------------- |
| `AI_PROVIDER`        | `typesafe`            | Select `typesafe` or `openrouter`; no automatic fallback.                                                |
| `OPENROUTER_API_KEY` | Unset                 | Enables AI when OpenRouter is selected.                                                                  |
| `OPENROUTER_MODEL`   | `typesafe/jev-1.13`   | OpenRouter Decisions model ID.                                                                           |
| `TYPESAFE_API_KEY`   | Unset                 | Enables AI; optional for human-only play.                                                                |
| `TYPESAFE_MODEL`     | `jev-latest`          | TypeSafe model; Cloudflare sets it in `wrangler.jsonc`.                                                  |
| `PORT`               | `3000`                | Bun production port.                                                                                     |
| `API_PORT`           | `3001` in development | Overrides the Bun listening port, including production. Update the Vite proxy if changed in development. |
| `ROOM_DATA_FILE`     | `.data/rooms.json`    | Bun storage base path; active snapshots live in the directory with `.d` appended.                        |

Bun reads local configuration from `.env`. Wrangler uses `.dev.vars` for local secrets and Worker secrets in deployment. Local configuration, room data, and build output are excluded from Git and Docker's build context.

## Repository guide

| Path                      | Contents                                                                      |
| ------------------------- | ----------------------------------------------------------------------------- |
| `src/`                    | React UI, lobby and room features, client state, browser saves, PWA controls. |
| `shared/`                 | Game engines, player helpers, TypeBox contracts and types.                    |
| `server/`                 | Bun and Cloudflare entrypoints, room lifecycle, persistence, AI integration.  |
| `tests/`, `worker-tests/` | Bun tests and Cloudflare runtime tests.                                       |
| `scripts/`                | Browser checks for PWA behavior and Cloudflare rooms.                         |
| `public/`                 | App icons and static asset headers.                                           |
| `docs/`                   | Architecture, gameplay, AI, development, and deployment guides.               |

[Architecture](docs/architecture.md) explains state ownership and runtime boundaries. [Historical verification and plans](docs/history/README.md) and [AI review evidence](docs/reviews/typesafe-review.md) preserve prior findings; they are not the current setup guide.
