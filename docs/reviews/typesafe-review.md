# TypeSafe state and primitive review — 2026-09-17

## Repair status

The findings below describe the pre-repair implementation and are retained as the audit record. The subsequent repair in `server/ai-state.ts` supplies game-specific state, draw/repetition and consecutive-six context, terrain/effective strength, captures and counts, and explicit next-roll analysis. Code prioritizes immediate wins and excludes one-move Jungle losses when a safe alternative exists. Choice now uses structured instructions and candidate references, and responses are validated against the offered set.

The original `typesafe-audit-evidence.json` is preserved. `typesafe-repair-evidence.json` records the same reproduction after repair: both previously identical request pairs now differ, and the Aeroplane capture appears under the actual opponent's next-roll options. Twelve new regression tests cover these facts, both player perspectives, tactical policy, repetition, terrain, stacked captures, and extra rolls. `typesafe-repair-live.json` records the live SDK smoke checks.

Batched Score comparison and a playing-strength benchmark remain future evaluation work; the repair does not claim optimal strategy.

## Original audit

The SDK contract is correct, but the game representation is incomplete and the strategic question is too broad to call optimized. The earlier two live calls verified transport and legal output only. They did not establish move quality.

This review compares `server/ai.ts` against `shared/game.ts`, the installed TypeSafe skill, and current official documentation. Production game and AI code were not changed during this review.

## Confirmed findings

### 1. Decision-relevant history is lost

`server/ai.ts:59` sends pieces, planes, die, rules, and candidate outcomes. It omits Jungle's `quiet` and repetition context, and Aeroplane's `sixes`.

The offline probe captures the actual SDK request with an injected transport:

- Jungle's opening layout with `quiet=0` and `quiet=98` produces byte-identical requests. After the first legal candidate in the latter fixture, all 24 opponent replies draw. None draw in the corresponding early-game continuation. Immediate candidate draws are already represented by `winner`; the missing information concerns future draw pressure and opponent drawing replies.
- Aeroplane positions differing only in `sixes=1` versus `sixes=2` produce identical requests. After launching a plane and rolling another six, the first position has four legal moves for the same side; the second forfeits the roll and passes the turn.

Recommendation: supply relevant counters, candidate repetition counts and draw outcomes, and explicit next-player/extra-roll facts. Compute these from the engine. Avoid dumping the entire history map or move log into every request.

### 2. Aeroplane threat arrays assert an analysis that was never performed

`server/ai.ts:30` only enumerates replies for Jungle, but lines 38–43 emit `opponentImmediateWins: []` and `opponentCaptures: []` for both games.

A reproducible counterexample uses side 0 planes `[0,10,-1,-1]`, side 1 planes `[26,-1,-1,-1]`, and die 1. Moving `plane-0` to progress 1 reports no captures. Side 1 can then roll 1 and move its first plane to progress 27, capturing that plane.

Recommendation: enumerate the possible next rolls and legal replies in code, respecting who rolls next and the consecutive-six rule. Label the horizon precisely. A fraction of die faces that permit a capture is not the actual capture probability without an opponent policy. Until this analysis exists, omit these fields for Aeroplane or explicitly mark them uncomputed.

### 3. The model lacks terrain and must reconstruct arithmetic

The Jungle prompt names den coordinates, but provides no river cells or trap ownership/coordinates, despite asking the model to assess traps and river control. Candidate pieces contain base ranks, not their effective strength inside enemy traps.

Aeroplane sends numeric progress arrays and an offset description, leaving the model to reconstruct shared-track positions, count finished planes, compare captures across snapshots, and assess future exposure. Candidate outcomes are mechanically correct, but the relevant facts are not made explicit. Candidate states also omit the next turn.

Recommendation: provide a compact board legend, named terrain/effective strength, captured pieces or planes, remaining/finished counts, shared-track cells, safe-lane status, and engine-computed tactical consequences. Separate per-game state so Jungle does not carry irrelevant planes and Aeroplane does not carry empty pieces.

This follows the [state guidance](https://docs.typesafe.ai/concepts/state), [building guide](https://docs.typesafe.ai/concepts/how-to-build-with-system-one), and [Jev 1.13 limitations](https://docs.typesafe.ai/model-jaggedness/jev-1.13): give relevant named facts, reduce indirection, and perform arithmetic in code. The [models page](https://docs.typesafe.ai/models) currently maps `jev-latest` to `jev-1.13.0`; that alias may change.

### 4. The single question combines several strategic judgments

`AI_INSTRUCTIONS` asks for the strongest move while considering immediate wins, defense, exchanges, terrain, progress, and risk. The existing engine-derived candidate states help, but the model still has to reconstruct facts and balance several objectives in one decision.

The [primitive guide](https://docs.typesafe.ai/primitives) recommends focused judgments and composing independent factors in code. Structured instructions and criteria are supported by the [advanced syntax](https://docs.typesafe.ai/primitives/advanced), but rewriting prose as JSON alone does not improve its meaning or prove greater accuracy.

Recommendation: first calculate exact wins, immediate losses, captures, and dice consequences. Immediate wins and avoiding a known immediate loss when a safe alternative exists can be explicit code policies. Reserve model judgments for the remaining strategic tradeoffs. Document such policies rather than describing the AI as an unconstrained model player.

### 5. There is no evidence of optimal playing strength

The automated tests verify legal output, transport, error handling, retries, and deadlines. The two previous live checks cover opening move selection. Neither checks tactical quality, match win rate, sensitivity to wording, or relative performance of alternative primitives.

The adapter currently discards the returned model version, confidence, probabilities, and usage. Keep these in bounded evaluation records to compare designs. Choice probability is not a game win probability, and confidence is not a guarantee of correctness. Several equally good legal moves can yield low confidence; arbitrarily blocking those choices would stall a casual game.

## Which primitives fit

| Task                                                      | Recommended owner                | Reason                                                                                                 |
| --------------------------------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Legal moves, captures, terrain, wins, draws, die outcomes | Game code                        | These are exact facts already computable from the engine. Asking a Noul to rediscover them adds error. |
| Select one move from prepared legal candidates            | Choice                           | The desired output is one member of a closed set. The current primitive is valid.                      |
| Assess a candidate along a strategic dimension            | Score, if evaluation supports it | Use concrete, self-contained ordinal descriptions; normalize before combining dimensions in code.      |
| Judge an independently useful yes/no strategic condition  | Noul, only if needed             | Use only for a well-defined uncertain judgment, not as a general move-quality rating.                  |

The [Choice documentation](https://docs.typesafe.ai/primitives/choice) and [function-calling cookbook](https://docs.typesafe.ai/cookbooks/function_calling) support closed-set selection. No `other` option is needed when the engine enumerates every legal move and a move is required.

For an experimental Score design, ask independent questions about each candidate's longer-term den defense and attacking pressure using explicit paths such as `candidates[0].defense`. Both need prepared semantic evidence. Use the same rubric across candidates. Do not ask the model to count attackers or derive reachability from coordinates. Batch the questions in one call and combine results in code; one question cannot read another question's answer from that same call.

[Score](https://docs.typesafe.ai/primitives/score), [composite scoring](https://docs.typesafe.ai/patterns/composite-scoring), and [fan-out](https://docs.typesafe.ai/patterns/fan-out) support this design. It is an experiment, not a proven upgrade: rubrics and weights introduce their own errors and token costs. Aeroplane's mostly arithmetic tradeoffs may benefit more from richer computed facts plus Choice than from several subjective scores.

## Recommended sequence

1. Repair missing and misleading state fields first. Extract a pure, inspectable request builder and test its facts against the engine.
2. Use compact structured candidate descriptions and explicit state paths. Preserve the official SDK, runtime validation, legal-move validation, deadline, manual retry, and stale-response protection.
3. Compare the current request, enriched Choice, and batched Score on the same labeled positions: den wins, den defense, trap escapes, river blocks, losing exchanges, draws/repetitions, stacked captures, exact finishes, and extra-roll risks. Include both sides and tied good moves.
4. Measure tactical errors, latency, input tokens, model version, and match outcomes with identical dice sequences and swapped sides. Test on held-out positions before tuning a confidence rule or claiming an improvement.

The opening Jungle request is 24,038 UTF-8 bytes and Aeroplane is 2,258 bytes in this probe. These are bytes, not tokens. The repeated full boards are a compactness opportunity, not evidence of a context-limit violation. The overall best representation and primitive combination remains an empirical question.

## Reproduction and scope

Run `bun docs/reviews/reproduce-typesafe-audit.ts` from the project root. It calls the production request path with synthetic game fixtures and an injected fetch function, without contacting TypeSafe or using a real credential. Captured results are in `typesafe-audit-evidence.json`.

The audit demonstrates lost information and misleading threat fields. It does not claim the model makes a bad move on every such position, and it does not establish that proposed Score questions outperform Choice. No new paid inference or production game changes were made during this review.
