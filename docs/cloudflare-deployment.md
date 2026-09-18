# Cloudflare deployment

The Cloudflare target serves the existing Vite/PWA output with Workers Static Assets. Elysia handles HTTP; Eden keeps the shared HTTP and room-specific WebSocket contracts. One SQLite-backed `GameRoom` Durable Object owns each online or AI room. Human-only local games remain browser-only.

## Deployed production — 2026-09-18

[Open production](https://kee-club.chocochu-cc.workers.dev). Active version `34518ec6-592c-43f0-ab9d-f892542f76c0` includes the TypeSafe secret. Production uses its own SQLite Durable Object namespace, separate from staging.

All 165 tests and project checks passed before publishing. Production browser checks passed room creation/joining, synchronized moves over real WebSockets, reconnect, and offline local play/reload, with no browser errors. A live Jungle AI turn completed successfully; the Worker usage log recorded `input_tokens: 11046`, resolved model `jev-1.13.0`, and the room, match, and attempt IDs. The configured model alias remains `jev-latest`. This successful production check supersedes the provider failure recorded below.

## Deployed staging — 2026-09-18

[Open staging](https://kee-club-staging.chocochu-cc.workers.dev). Code version `306a0b9f-07fd-4323-b77e-3590ad958489` was deployed with the TypeSafe key stored as a Cloudflare secret.

All 165 tests and project checks passed before this deployment. Hosted browser checks passed room creation/joining, synchronized moves over WebSockets, reconnect, and offline local play/reload. The service worker and manifest return `Cache-Control: no-cache`.

The first live AI check exposed a native fetch receiver incompatibility: the SDK invokes its fetch property as a method. The adapter now invokes the supplied fetch function standalone, with a regression test covering the receiver contract. After deploying that fix, TypeSafe temporarily returned HTTP 503 from both staging and an independent local request. The room preserved the game and offered manual Retry. No automatic inference retry was enabled.

## Local development and checks

```sh
bun install --frozen-lockfile
cp -n .dev.vars.example .dev.vars
# Optionally set TYPESAFE_API_KEY in .dev.vars for deliberate live AI testing.
bun run dev:cloudflare
```

Open the Wrangler URL, normally `http://localhost:8787`. This command builds the frontend once; rerun `bun run build` after frontend changes. Wrangler watches server changes. The existing `bun run dev` / `bun run start` remain available for the Bun target and its saved rooms. They are separate backends, not replicas.

```sh
bun run cf:types
bun run check
bun run test:cloudflare:browser http://127.0.0.1:8787
```

`check` runs formatting, lint, frontend build, Bun tests, Worker type checks, and tests inside workerd. Workers tests use mock provider responses, including Cloudflare's supported MSW network integration for concurrent inference; no real AI key is needed. Alarm tests use a controlled clock and explicit dispatch, while the concurrent inference case exercises a native alarm. The browser smoke uses installed Chrome on macOS or Playwright Chromium elsewhere; `CHROME_PATH` can select an executable.

`wrangler.jsonc` pins compatibility to 2026-09-17, declares SQLite class exports, enables Node compatibility for existing crypto usage, and configures a 300/minute per-IP rate-limit binding. Runtime declarations are generated in `worker-configuration.d.ts`; the optional secret is declared separately. Do not add Bun, filesystem persistence, or recurring timers to the Worker dependency graph.

The installed Elysia Cloudflare adapter generates code unconditionally in `beforeCompile`, which fails when modules load after startup in the Workers test runtime. This target uses `aot: false` and disables that hook and generated normalization while retaining the adapter's Web-standard transport. The same handlers run in tests and deployment.

## Staging, then production

```sh
bunx wrangler login
bunx wrangler whoami
bunx wrangler secret put TYPESAFE_API_KEY --env staging
bun run deploy:staging
```

The staging Worker is `kee-club-staging`, with its own Durable Object namespace and secrets. Omit the secret command to test human-only online rooms with AI disabled. `TYPESAFE_MODEL` stays `jev-latest`; the existing TypeSafe SDK, origin, 20-second timeout, no automatic retries, and usage logging are preserved.

After checking the deployed URL, room creation/joining, direct room URLs, reconnect, AI usage logs, and offline local play:

```sh
bunx wrangler secret put TYPESAFE_API_KEY --env ''
bun run deploy
```

Production is `kee-club`. Both deploy scripts run all required checks first. Run `bunx wrangler deploy --dry-run --env staging` to check the upload without publishing. No custom domain is configured.

Wrangler authentication must be valid before publishing. Local environment files are ignored and are not automatically deployed as secrets. Never pass the API key in command-line arguments or commit it. Logs contain room/match/attempt IDs and token counts, never provider keys, seat tokens, names, prompts, or boards. An interrupted attempt may have been billed even if its usage never reached our logs.

## Durable behavior

Snapshots have a schema version and room incarnation. Commands authenticate and validate inside the object, operate on a fresh draft, and atomically commit the snapshot and next alarm. Code collisions cannot overwrite an initialized room. Expected failures return serializable status/error results; infrastructure and corrupt-storage failures return 503 rather than clearing browser credentials with a false 404.

Sockets use `/api/rooms/:code/ws`. Credentials travel in the first frame, not the URL. Hibernation attachments contain only the room incarnation and authentication deadline or seat number. Presence is reconstructed from accepted sockets; it is not stored in the room snapshot. Limits are 32 total and 16 pending connections per room, with a five-second authorization deadline and 1,024-byte incoming messages.

One alarm scheduler handles pending authentication, AI work, and expiry. Disconnected rooms expire 24 hours after their last mutation. Connected rooms are retained; presence does not refresh the mutation timestamp. Expiry deletes storage and its alarm. No account-wide room scan or global room-count coordinator is needed.

AI alarms persist each roll before inference and dispatch at most one inference per invocation. A durable attempt records the expected revision, game ID, and attempt ID. Resignation remains responsive while inference is pending; stale completions cannot replace newer state. Reconstruction of an interrupted attempt exposes manual Retry instead of automatically repeating a potentially paid call. Each accepted roll/move remains a separate revision for the existing playback queue.

## Existing rooms and rollback

Cloudflare deployment does not import or delete Bun's `.data/rooms.json.d` snapshots. Keep the old service and backups available for existing games until choosing a cutover/import policy. Browser saves and seat tokens belong to their origin; moving to a new hostname does not transfer browser storage.

Worker rollback does not roll back Durable Object data. Version 1 snapshots must remain readable across code updates. Staging data is isolated from production. The Workers free tier is a usage allowance, not a guaranteed number of concurrent games; measure actual requests, AI duration, storage writes, and TypeSafe input tokens after deployment.

## OpenRouter Jev

To select OpenRouter, change `AI_PROVIDER` to `openrouter` in the target environment's
`wrangler.jsonc` vars and keep `OPENROUTER_MODEL=typesafe/jev-1.13`. Set the secret
with `bunx wrangler secret put OPENROUTER_API_KEY --env staging` (or `--env ""` for
production), then follow the normal check and deployment steps. Do not pass keys
as command arguments. Local Wrangler uses the same values in `.dev.vars`.
The TypeSafe key can stay configured; it is not used when OpenRouter is selected.
