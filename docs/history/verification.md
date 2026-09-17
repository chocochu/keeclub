# Verification — 2026-09-17

> Historical development record. Descriptions, test counts, and plans reflect the time of writing. See the [README](../../README.md) and [current Cloudflare guide](../cloudflare-deployment.md) for maintained instructions.

## Automated

`bun run check` completes formatting, zero-warning lint, TypeScript, the production build, and 70 Bun tests. The suite covers both rule engines, the official TypeSafe SDK's Choice requests for both games, native HTTP/WebSocket integration, seat authentication, persistence/reconnect, rematch consent, AI failures, schema rejection, and out-of-order query-cache updates. SDK tests cover malformed/illegal responses, safe HTTP and connection errors, disabled automatic retries, forced-move bypass, and a stalled response body aborted after 20 seconds. Treaty-specific integration tests exercise both seats, subscription recovery, authorization failures, and query cancellation. Compile-time fixtures reject invalid route, command, credential, and response types. Twelve state-translation tests cover draw history, repetition, terrain and trap strength, blocked river jumps, immediate-win/loss policy, extra rolls and third-six forfeits, both player perspectives, stacked captures, shortcuts, safe lanes, and exact finishes.

`bun audit` reported no vulnerabilities after installing `@typesafe-ai/sdk@0.6.0` (186 packages checked). The production client bundle contains neither the TypeSafe SDK nor the configured API key.

## Live TypeSafe SDK verification

Using the configured server key and `jev-latest`, called the production `chooseMove()` function once for each game against the real TypeSafe service:

- Jungle opening: selected `0-7:5,8`, confirmed legal, approximately 1,009 ms.
- Aeroplane opening after rolling six: selected `plane-0`, confirmed legal, approximately 254 ms.

These checks validate authentication, request compatibility, SDK response handling, and legal-move selection. They do not measure playing strength. The automated suite continues to use injected HTTP responses and makes no paid requests.

## State-translation repair

The original audit evidence is preserved in `docs/reviews/typesafe-audit-evidence.json`; the repaired result is in `docs/reviews/typesafe-repair-evidence.json`. The same fixtures now produce distinct requests for the relevant histories and expose the previously missing Aeroplane capture opportunity. Reproduce with `bun docs/reviews/reproduce-typesafe-audit.ts`.

The Jungle opening request decreased from 24,038 to 20,564 UTF-8 bytes by describing candidate changes rather than repeating whole boards. Aeroplane increased from 2,258 to 12,527 bytes because it now includes conditional next-roll move outcomes. These are byte counts, not token or cost measurements. Live repair checks are recorded in `docs/reviews/typesafe-repair-live.json`.

## Browser verification

Using the Codex browser at `localhost:3000` and `127.0.0.1:3000` as separate storage origins:

- Created a friend room, joined via its invite, and exchanged legal Jungle moves.
- Verified the current player's controls, opponent restrictions, and instant board synchronization.
- Refreshed the guest page and recovered the same seat and move history.
- Checked the lobby and Jungle board at a 390×844 viewport, then reset the viewport.
- Started a same-device Aeroplane game, rolled until six, launched with the keyboard, and verified the extra roll.
- After the Zustand/Query/Eden/TypeBox refactor, restored the existing Jungle room and submitted a move through Eden. Both seats received the Query cache update. The host browser reported no console errors.
- Created a new Aeroplane room with the refactored lobby, rolled through the typed mutation, and refreshed successfully. The refreshed browser reported no console errors.
- After moving WebSockets to Treaty, reopened the saved Aeroplane room, confirmed its connected status, rolled the dice, and refreshed. The turn, roll, and history were restored; the browser reported no console errors.
- After the UI polish, checked the lobby and both boards on desktop and at 390×844. Created a friend room, restored a saved seat through the join form, rolled dice, and opened/closed the rules. Waiting-room invitations appear above the board on mobile. Reset the viewport afterward. A transient HMR message from removing the old footer remained in the log; a full reload produced no new errors.

## Classic Aeroplane board

The reference layout is rendered as SVG with four coloured airports, a continuous 52-space track, white landing circles, home lanes, and shortcut arrows. Three geometry tests cover unique spaces, persisted progress positions, and alignment with colour-jump and shortcut rules. Checked the board on desktop and at 390×844, restored an existing game, and launched a plane with Enter in a separate same-device game. Gameplay remains two-player (red and green).

## Plane focus and clarity follow-up

Reproduced the oversized brown artifact by focusing a movable plane: the shared 3px CSS outline and 4px offset scaled with the SVG coordinates. Replaced that outline with a bounded SVG keyboard-focus ring. Verified focus on desktop and at 390×844, then clicked a focused plane in the disposable same-device room and confirmed its move and history update. Mobile page width equals viewport width. The desktop flight board now grows to 760px (previously capped at 520px); solid dark red/green tokens contrast with lighter track fills and near-white landing circles.

## Dice and piece motion

Installed `emilkowalski/skill` for Codex and applied its `animate` skill. In disposable same-device rooms, sampled changing computed transforms during a dice roll, a plane move, and a Jungle rat move. Verified keyboard movement has a zero-second transition and checked Jungle piece alignment visually. Emulated reduced motion: plane transitions became zero seconds and a new dice result appeared without rotation; cleared the override afterward. A green plane moving from progress 10 to 30 faced its actual northeast displacement (65.62 degrees from north), while its number stayed upright. No browser console warnings or errors were reported. Geometry tests cover cardinal/diagonal headings, both shortcut directions, and both home lanes; a game test covers repeated equal dice and older saved rooms without a roll counter.

## Step-by-step Aeroplane playback

Replaced direct destination movement with the engine's ordered route: dice steps, colour jump, shortcut, then captures. Added route/frame tests for both sides, launch, home lanes, overshoots, shortcuts, capture ordering, non-move updates, and reconnect/rematch discontinuities. In the browser, a two-step green move exposed both intermediate positions and changed heading at each segment; controls re-enabled after completion. During a red colour-jump capture, enabling reduced motion mid-sequence immediately completed the route and capture, cleared playback, and set transition duration to zero. Reset the emulation afterward. No browser warnings or errors; `bun run check` passed all 85 tests.

## Readable AI turns and fixed headings

Replaced the planes-only queue with complete presentation scenes sourced from accepted Query cache updates. A synchronous fake AI in an isolated server on port 3012 rolled 6, launched, rolled another 6, visited each cell, performed a colour jump, then rolled 3 and moved again. Browser observations showed each roll and movement phase separately, with turn labels and history staying aligned until the human turn resumed. The jump used a 650 ms hop; each normal step used 320 ms plus a landing pause. All airport pieces had their fixed red-down/green-up headings, and the active plane faced the next cell. No browser warnings or errors. The test used injected dice and a local fake chooser, not paid TypeSafe requests or the user's live room.

The 90-test suite passes. New tests cover synchronous cache updates, repeated equal AI rolls, held turn/history state, colour-jump and shortcut scenes, queue cancellation with reduced motion, keyboard-to-AI transitions, every next-cell heading, and fixed airport headings. No backend, shared game rules, or provider timing changed in this follow-up.

## Airport alignment and six-roll cue

The red airport token heading now matches the upward printed plane, with both sourced from `AIRPORT_HEADINGS`; green remains upward. In an isolated same-device game with deterministic sixes, visually checked parked tokens against empty airport markings. The first and second six highlighted the die in gold and displayed `擲出 6 · 再擲一次`; the cue remained after launching, and the roll button became `再擲一次`. The third six displayed `連續三次 6 · 回合結束` without the bonus highlight. No browser warnings or errors. Presentation scenes now carry the current roll's six-count, so the cue is correct during playback. All 91 tests and project checks passed.

## Traditional Aeroplane rules and room settings

Added separate launch pads, finish-line bounces, direct-shortcut versus jump-into-shortcut paths, captures at every actual landing and across the opposing home-lane intersection, finished-plane parking, and two-to-four-player rankings. Third-six settings default to returning all unfinished planes; the alternative automatically returns the unfinished plane closest to the goal, breaking ties by plane number. Completed planes remain untouched. Settings persist through rematches, and AI candidate descriptions use the same engine traces.

The 103-test suite covers the new routes, captures, penalties, clockwise turns, four-seat authentication/rematches, multiple AI seats, exact shortcut alignment, playback phases, and completion cues. `bun run check` passes formatting, lint, TypeScript, production build, and tests.

Browser checks used an isolated production server on port 3012 with injected dice, without modifying the user's active room or calling paid AI. Created a four-player room with the closest-plane setting, rolled a third six with tied leading planes, and verified that only the lower-numbered plane returned automatically while the completed plane stayed finished. A direct shortcut captured enemies at the dice landing, shortcut destination, final jump, and crossing. Exact completion parked the plane, displayed first place, and advanced to the next active player. Visually checked the stronger selectable rings, airport headings, and centered shortcut lines. The four-player layout fits a mobile viewport without horizontal overflow; no console warnings or errors were reported. During playback, controls say `播放中…`; passing through the finish during a bounce does not mark that plane completed or increment the completed count.

## Player colors, progress and win celebration

Move history now colors each player's entries, including legacy third-six and no-move continuation lines; capture notices use the captured player's color. The scoreboard separates player identity from completion status: 0–4 completed planes each have a distinct progress color, a four-segment track, a native accessible meter, and remaining-plane text. Transient finish-line bounces still do not count as completed planes.

Added a brief, non-interactive confetti fall in the winner's color and gold. It triggers after the displayed winning move lands, including first place before a multiplayer match ends. It does not replay when loading an already finished game or when the remaining players finish, and reduced motion suppresses it. The rule book now has titled sections and explicitly covers automatic closest-plane penalties, completed-plane immunity, shortcut variants, and a finish-line bounce example.

`bun run check` passes all 106 tests, formatting, lint, TypeScript, and production build. An isolated four-player browser fixture verified all player log colors and distinct computed colors for 1/4, 2/4, and 3/4; a real finishing move produced visible confetti with changing transforms and opacity. Reloading showed no confetti. Under emulated reduced motion, winning still showed first place with the confetti layer hidden. The mobile rule book had no horizontal overflow. Test media/viewport overrides were cleared afterward; the user's active room was untouched.

## Clear turn ownership, completed tokens and physical dice

Active players now have a colored seat highlight and explicit `目前回合` badge. The control panel prominently names the active player, retains the current action as live status, and matches the player's color; the scoreboard marks the same active seat. Completed planes use a pale face and bold check mark over the inverted plane silhouette, retaining their number and accessible completed label. Dice use one-to-six recessed SVG pips, ivory shading, rounded edges, and a raised base instead of Unicode glyphs.

At the user's request, removed reduced-motion media overrides and playback branches. Animations now use the same behavior regardless of the operating system motion setting; keyboard shortcuts retain their existing instant behavior. This supersedes earlier reduced-motion verification notes above. Animation cancellation on unmount remains covered by the playback disposal test.

`bun run check` passed all 106 tests plus format, lint, TypeScript, and production build. Browser checks used a disposable four-player room: six completed planes showed checks; the gold player's seat, control panel, and scoreboard agreed; after moving, all three switched to green together. Checked one- and six-pip faces, including a changing dice transform and roll phase while emulating reduced motion. Desktop and mobile layouts had no horizontal overflow or console errors. Cleared media/viewport overrides and closed the disposable room without touching the user's match.

## Compact mobile board and view selection

Added a simplified circular-space Aeroplane surface alongside the traditional board. Both surfaces use identical geometry and the same token nodes, interaction handlers, completion indicators, and animation timeline. A persisted Zustand preference supports automatic, compact, and traditional views; automatic selects compact at viewport widths up to 1000px. Mobile/tablet opponent seats share one row, with the number of columns matching the number of opponents.

Browser checks in an isolated four-player room verified that desktop defaults to traditional, phone/tablet defaults to compact, an explicit traditional selection survives reload on mobile, and switching preserves all token labels and positions. A compact-board move from 16 through the shortcut to 34 captured all four test enemies and advanced the active turn correctly. At 495px and 820px viewport overrides, the three opponent seats stayed on the same row and there was no horizontal overflow. No changes were made to the user's match.

## Corrected compact board reference

Replaced the earlier dotted compact surface with the user's square-grid reference: 15×15 layout, four large corner airports with white circular interiors, outlined square track cells, solid home lanes, and a four-triangle center. Player colors remain attached to their existing seats and routes. Small colored marks retain the Aeroplane same-color jump information on otherwise white shared cells. The traditional board and view preference are unchanged.

Compact coordinates now map the 52 logical shared spaces onto a square circuit; home lanes have five square spaces plus a central finish. Tokens use the selected view's positions and headings, with smaller tokens on compact track cells and full-sized airport pieces. Added tests for unique adjacent cells, all four home entries, finished-plane parking, shared capture coordinates, and next-cell orientation. `bun run check` passes all 109 tests, formatting, lint, TypeScript, and production build. This replaces the circular-space implementation described in the previous section.

## Compact-view reversion

At the user's request, removed the compact renderer, geometry, view selector, responsive view hook, saved preference, and compact-only tests. Every screen size now uses the original traditional Aeroplane board. Kept the side-by-side mobile opponent labels and the existing rules, dice, completion marks, and animations. The compact-view sections above are historical and no longer describe the current UI.

## Browser-only human games and per-room persistence

New human-only same-device Jungle and Aeroplane games use the shared game engines in the browser and save each game in local storage. AI, friend, and existing server-backed games retain their server path. Server snapshots now write only the changed room; legacy snapshots import atomically while preserving the original file as a backup.

Automated coverage checks local move legality, stale revisions, settings, rematches, four-player Flight play, reloads, and operation with an unreachable API. Persistence tests cover isolated writes, no-op pruning and presence, legacy migration, authentication preservation, interrupted AI recovery, and invalid snapshots. Existing HTTP, WebSocket, and authentication tests remain in place.

`bun run check` passed formatting, lint, TypeScript, production build, and all 149 tests (3,324 assertions).

An isolated production browser check created and played Jungle while offline, resigned, rematched, restored the save in a fresh page, and created and rolled in a four-player Aeroplane game while offline. The flow made zero API requests, opened zero WebSockets, and created no server room snapshots. There were no browser page errors or horizontal overflow at 390×844. Reload verification loaded the app shell online: this change does not add service-worker caching or support a fresh offline page load.

## Cloudflare deployment implementation — 2026-09-18

The deployment target uses Workers Static Assets and one SQLite-backed Durable Object per online/AI room. The existing Bun target and browser-only games remain available. The full check includes 149 Bun tests and 15 tests inside workerd, plus formatting, lint, both runtime type checks, and the production/PWA build.

Workers coverage includes concurrent joins and stale commands, credential privacy, room-code collisions, four-seat rematches, hibernating WebSocket reconstruction, multiple tabs, authorization deadlines, expiry, corrupt snapshots, interrupted AI recovery, duplicate alarms, provider errors, and the SDK's 20-second response-body timeout. A native alarm with a mocked network response verifies that resignation remains responsive during inference and its stale result is discarded. These checks make no paid AI requests.

Against a local Wrangler server, two isolated browser sessions joined a room, exchanged a legal move over real room-specific WebSockets, and recovered after reload. A service-worker-controlled browser created and played a local game offline, reloaded while still offline, and restored the same position with zero API requests, zero WebSockets, and no page errors. Stopping and restarting the Wrangler process preserved an online room's game and authenticated seat through SQLite storage.

The staging deployment dry-run passed and recognized the assets, SQLite Durable Object, rate-limit, and model bindings. The Worker bundle excludes the Bun filesystem repository; the browser bundle excludes the provider SDK and secret. Reproduction commands and deployment steps are in [Cloudflare deployment](../cloudflare-deployment.md).

Publishing was not performed: the saved Cloudflare login had expired and could not refresh non-interactively. A fresh `bunx wrangler login` is required. No Cloudflare secrets were uploaded. Remote behavior, production usage/cost, and a live TypeSafe call from Cloudflare remain unverified.

## Limits

No playing-strength assessment has been performed. The Dockerfile has not been built. Local production serving, direct room URLs, assets, room creation, and WebSockets passed smoke tests both before and after the architecture refactor. Browser UI checks cover friend and same-device modes; the SDK migration was verified through automated tests and the two live inference calls.
