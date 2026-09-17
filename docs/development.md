# Development and verification

Run commands from the repository root with Bun 1.4.2. Install the locked dependencies with `bun install --frozen-lockfile`.

## Required checks

```sh
bun run check
```

The gate runs formatting, lint with zero warnings, TypeScript checking and the production build, Bun tests, Worker type checks, and Worker runtime tests. It stops at the first failure. Tests use isolated storage and mocked inference; a TypeSafe key is not required.

Use `bun run format` to fix formatting. `bun run lint:fix` applies automatic lint fixes; review those changes before rerunning the gate. Keep game rules in `shared/` and share domain transitions between runtime targets. See [architecture](architecture.md) and the server's [contributor instructions](../server/AGENTS.md).

## Browser checks

These checks are separate from `bun run check` and make no AI requests.

### PWA

```sh
bun run test:pwa
```

The script builds two isolated releases and launches installed Google Chrome with a fresh profile. Set `PWA_BROWSER_PATH` to another Chromium executable if needed. It checks installation metadata, cache headers, offline play and reloads for both games, and updates across lobby and active-game tabs.

Artifacts, screenshots, failure details, and a trace are retained in `.data/pwa-check-<timestamp>/`. Installation prompts and iOS guidance are simulated; native OS installation and real iOS behavior need device checks. See [offline installation](playing.md#install-and-play-offline).

### Cloudflare

In one terminal:

```sh
bun run dev:cloudflare
```

In another:

```sh
bun run test:cloudflare:browser http://127.0.0.1:8787
```

The script creates a disposable friend room on the supplied server, checks moves and reconnects across two browser contexts, and verifies offline local play. Use a local or staging instance. It uses installed Chrome on macOS and Playwright Chromium elsewhere; set `CHROME_PATH` to override the executable. If Playwright Chromium is missing, install it with `bunx playwright install chromium`.

## Cloudflare bindings

After changing bindings in `wrangler.jsonc`, regenerate and check the runtime declarations:

```sh
bun run cf:types
bun run typecheck:workers
```

`worker-configuration.d.ts` is generated and kept in the repository so type checks work immediately after installation. Do not edit it by hand. The optional AI secret is declared separately in `server/cloudflare/env.d.ts`. See [Cloudflare deployment](cloudflare-deployment.md) for runtime constraints and deployment checks.

## Repository hygiene

- Keep secrets in ignored `.env` or `.dev.vars` files; examples must contain no credentials.
- Keep generated builds, local room data, Wrangler state, and browser artifacts out of Git and Docker build contexts.
- Preserve `bun.lock` and use frozen installs to keep dependency versions reproducible.
- Keep installed contributor skills in `.agents/skills/` with their `skills-lock.json`; they are tooling, not application runtime dependencies.
- Put maintained guidance in `docs/`. Keep dated plans and verification records in `docs/history/`, and reproducible AI review evidence in `docs/reviews/`.

The [historical verification log](history/verification.md) records earlier observations. Run today's checks rather than treating its test counts or past behavior as current results.
