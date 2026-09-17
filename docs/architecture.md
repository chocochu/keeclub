# Architecture

## Runtime targets

Bun and Cloudflare share game rules, contracts, AI selection, and room domain logic. Bun uses file snapshots; Cloudflare uses one SQLite-backed Durable Object per room. They are separate backends and do not replicate rooms. Human-only same-device games use browser storage.

- `shared/game.ts`, `shared/flight.ts`: pure game rules.
- `shared/contracts.ts`: TypeBox schemas and derived types.
- `server/rooms/domain.ts`: shared single-room transitions.
- `server/worker.ts`, `server/cloudflare/`: Cloudflare gateway, Durable Object storage, sockets, and alarms.
- `server/index.ts`, `server/rooms/service.ts`: Bun process and room service.

## State and transport

The server is authoritative for online and AI rooms. Human-only browser games use `src/lib/local-rooms.ts` to run the same rules and persist each changed snapshot locally. Client state has two distinct owners:

- **Zustand** (`src/stores/app-store.ts`) owns lobby preferences, navigation, connection status, and feedback. Only preferences are persisted through its persist middleware. Existing room credentials retain their original storage keys, so the refactor preserves saved seats.
- **TanStack Query** (`src/lib/query-client.ts`, feature hooks) owns room snapshots, configuration, fetching, and mutations. WebSocket events write into the same query cache. Revision-aware merging prevents late HTTP responses from rolling back a newer board. Components do not maintain duplicate copies of room state.

**Eden Treaty** (`src/lib/api-client.ts`) infers HTTP request bodies, responses, and WebSocket messages from the exported Elysia `App` type. `src/lib/api.ts` creates the same-origin browser client; the factory also runs against isolated test servers. The server import is type-only. The adapter routes human-only local creation and `/local` sessions to browser storage; they have no seat token or WebSocket. TanStack Query uses the adapter's promises and errors, while online Treaty subscriptions feed decoded, runtime-validated snapshots into its cache. Online credentials travel in the first WebSocket message, never in its URL. Local queries and actions run even when the browser reports it is offline.

`tests/treaty.types.ts` runs during TypeScript checks and rejects unknown routes, invalid commands, missing credentials, and incorrect response assumptions. `tests/treaty.test.ts` exercises the actual client against Elysia, covering room creation/joining, both seats' live updates, reconnects, authorization errors, and query cancellation.

**TypeBox** (`shared/contracts.ts`) defines request, response, WebSocket, and game schemas; TypeScript types are derived from those schemas. Elysia validates HTTP boundaries natively. The browser validates WebSocket payloads, and the repository validates saved room snapshots before restoring them. TypeSafe responses are validated before selecting a legal move.

Board motion follows the locally installed [Emil animation skill](../.agents/skills/animate/SKILL.md). Jungle pieces use 240 ms transform transitions. Aeroplane has a presentation-only timeline: a 650 ms dice animation plus 550 ms reading pause, 320 ms cell steps, and distinct 650 ms colour-jump/shortcut hops, with landing pauses. Planes face the next grid cell at rest and their destination during a leap; airport pieces match the printed airport markings. Engine traces supply intermediate landings, captures, finish-line bounces, airport returns, and completed-plane parking. A six highlights the die and shows an extra-roll badge; a third consecutive six shows the configured penalty instead. Dice, turns, scores, rankings, winners, and history follow the same timeline. A Query cache subscription captures every accepted update before React batches fast AI rolls; presentation adds no server delays. Local controls wait for playback to catch up. Animations use one presentation path regardless of the operating system motion preference. Instant keyboard actions do not skip the following AI turn. No animation dependency is required.

The feature directories contain rendering and focused hooks:

- `src/App.tsx`: application composition only.
- `src/components/`: shared shell, feedback, and rules.
- `src/features/lobby/`: game selection, setup, and room-entry mutation.
- `src/features/room/`: board, turn controls, history, connection, and action mutation.
- `src/Boards.tsx`: Jungle renderer and board exports. The classic Aeroplane SVG and its display geometry live in `src/features/room/FlightBoard.tsx` and `flight-board-geometry.ts`; game rules remain independent in `shared/game.ts` and `shared/flight.ts`.
- `server/app.ts`: Elysia composition only.
- `server/http/`: transport errors, origin checks, and rate limiting.
- `server/rooms/routes.ts`: validated HTTP adapters.
- `server/rooms/service.ts`: room lifecycle and authorized game transitions.
- `server/rooms/repository.ts`: atomic persistence and snapshot restoration.
- `server/rooms/identity.ts`: seat token generation and authentication.
- `server/rooms/websocket.ts`: authenticated subscriptions and presence.
- `server/rooms/ai-turn.ts`: AI lifecycle, failure recovery, and stale-response protection.
- `server/ai.ts`: TypeSafe SDK transport and validation of offered choices.
- `server/ai-state.ts`: pure game-state translation, tactical facts, selection policy, and structured Choice questions.

Oxlint checks correctness, React hooks, accessibility, unused bindings, and explicit `any`. `bun run check` fails on formatting drift or lint warnings. There are no lint-disable comments.

Integration references: [Zustand](https://zustand.docs.pmnd.rs/), [TanStack Query](https://tanstack.com/query/latest/docs/framework/react/overview), [Elysia validation](https://elysiajs.com/essential/validation), [Eden Treaty](https://elysiajs.com/eden/treaty/overview), [Oxc tooling](https://oxc.rs/docs/guide/usage/linter.html).
