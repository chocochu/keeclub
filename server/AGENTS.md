# Server runtime

- Cloudflare entrypoint: `worker.ts`; one SQLite-backed `GameRoom` per room code.
- `rooms/domain.ts` owns shared single-room behavior. Preserve all seats, rematch consent, revisions, and intermediate AI roll/move updates. Bun remains available through `index.ts`.
- Authenticate inside the Durable Object. Never send stored records, credential hashes, tokens, or provider secrets in room broadcasts.
- Durable storage is authoritative. Use hibernating WebSockets with serializable attachments and one scheduler for AI, authentication deadlines, and expiry. No recurring timers or filesystem imports in the Worker graph.
- Keep paid inference outside storage transactions. Persist an attempt before dispatch; ambiguous interrupted attempts require manual retry. Default to OpenRouter Jev; keep direct TypeSafe available through explicit provider selection. Preserve timeout, retry policy, and usage logging.
- Run `bun run check` (includes Workers runtime tests). Generate types with `bun run cf:types` after binding/configuration changes. Use mocked inference for routine tests.
- Deployment does not import Bun snapshots or roll storage back. Keep staging isolated and preserve legacy data until an explicit cutover decision.

References: [DO rules](https://developers.cloudflare.com/durable-objects/best-practices/rules-of-durable-objects/), [hibernation](https://developers.cloudflare.com/durable-objects/best-practices/websockets/), [alarms](https://developers.cloudflare.com/durable-objects/api/alarms/), [Elysia adapter](https://elysiajs.com/integrations/cloudflare-worker).
