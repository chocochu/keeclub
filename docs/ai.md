# TypeSafe AI

Set the following in your local `.env`, then restart `bun run dev`:

```dotenv
TYPESAFE_API_KEY=your_key_here
TYPESAFE_MODEL=jev-latest
```

The API key stays on the Elysia server, never in the client bundle or room updates. Do not use a `VITE_` prefix for it. The `.env` file is gitignored.

Integration uses the official [`@typesafe-ai/sdk`](https://docs.typesafe.ai/sdk/javascript): `TypeSafeClient.systemOne()` and the typed `choice()` primitive. The server enumerates legal moves and asks TypeSafe to select one. The model receives game-specific rules and structured candidate outcomes from the pure request builder in `server/ai-state.ts`. Jungle includes river/trap/den coordinates, effective strength, captures, draw counters, repetition outcomes, and one-move opponent wins/captures/draws. Aeroplane includes named plane zones, shared cells, counts, consecutive sixes, and outcomes for each possible next roll by the actual next player. The analysis horizon is explicit; next-roll capture opportunities are not probabilities or claims about later turns. Names, room credentials, and raw move logs are not sent. SDK transport and response validation live in `server/ai.ts`.

The [TypeSafe skill](../.agents/skills/typesafe-ai/SKILL.md) is installed locally for Codex using `npx skills add typesafe-ai/skills --skill typesafe-ai --agent codex --yes`. Use it when modifying this integration; consult its linked live docs before changing SDK calls or question design. `skills-lock.json` records the installation.

The engine validates every selected move, with TypeBox checking the response at runtime in addition to SDK type inference. Code offers immediate wins first; otherwise Jungle excludes moves permitting an immediate opponent win when a safe alternative exists. All other tradeoffs use TypeSafe Choice. A single remaining option is executed without an API call; provider choices outside the offered set are rejected. Service errors leave the AI turn intact with a **重試 AI 回合** button; there is no hidden substitute bot. Jungle offers Easy (baseline) and Normal (three-ply lookahead), with Normal as the default for new AI rooms. Calls use a 20-second SDK timeout (including response body delivery) and `retry: { maxRetries: 0 }` for explicit manual retry. SDK errors are translated to safe Traditional Chinese messages without exposing provider response bodies or transport details.

Without a key, friend rooms and same-device games work. AI creation shows a setup message.

Each parsed TypeSafe response writes a JSON `typesafe.usage` event to server stdout with
`input_tokens`, the returned `model`, `room_code`, `game_id`, `game_kind`, `ply`, and a timestamp.
Sum `input_tokens` by `game_id` to measure each match; the ID survives room recovery and changes
on rematch. These IDs and usage stay server-side. Logs contain no API keys, seat tokens, player
names, or board payloads. Usage is recorded even if the returned move is rejected. Missing or
invalid usage is logged as `null`, not zero; transport failures have no reported usage. Forced
moves make no API call and emit no usage event. Capture stdout in your hosting logs for retention.

For Cloudflare, use `.dev.vars` locally and Worker secrets in deployment; see [Cloudflare deployment](cloudflare-deployment.md).

The [original audit and repair evidence](reviews/typesafe-review.md) are historical records, not a playing-strength benchmark.

The [Jungle evaluation summary](jungle-benchmark.md) records the results behind
Normal difficulty. The temporary runners and raw outputs have been pruned;
production search and offline regression tests remain.

## Jungle difficulty

The lobby's AI mode offers **Easy** and **Normal**. Normal is the default for new
rooms; the browser remembers the user's selection. Difficulty is persisted in
room storage, shown during play, and retained on rematch. Old room snapshots
without a difficulty field remain Easy, so an existing match is not silently
upgraded. Flight and human-only games have no difficulty selector.

`server/ai-request.ts` selects the evidence. Easy uses the existing baseline
request; Normal adds the shared `server/ai-lookahead.ts` search: AI move, opponent
reply, AI response. The total search budget is 50,000 nodes. Incomplete searches
never claim a proof or score. Evaluation uses terminal wins/losses/draws and the
same crude rank-sum material proxy as the benchmark; it cannot see recaptures on
ply four. The Choice question, model, and immediate-win/loss safeguards stay the
same.

Both levels use `server/ai-move-policy.ts` to exclude an immediate draw whenever
another legal move continues play, then exclude a third identical directed AI
move whenever an alternative remains. Simulated AI continuations follow the
same policy; human replies remain unrestricted engine-legal moves. This strict
play-on policy can decline a useful defensive draw. AI move counts are private
room state, persisted with each accepted move, preserved through reloads and
manual retries, and reset on rematch. Counts never advance on failed or stale
responses. Existing snapshots start counts from their next accepted AI move.
