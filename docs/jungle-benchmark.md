# Jungle AI evaluation summary

Evaluated on 18 September 2026 (Hong Kong) using `jev-1.13.0` for both modes.
These results informed the promotion of three-ply lookahead to **Normal**, the
default difficulty. The original baseline is **Easy**.

## Tactical comparison

Across 34 positions, with two repetitions per mode, three-ply evidence improved
labeled tactical decisions from **12/24 to 23/24**. Both modes passed **12/12**
safeguard controls. Input tokens increased **40.1%**. The gains came from short
forced-den-win positions; mirrored positions and repeated decisions are
correlated, so this small authored suite does not establish broad playing strength.

## Head-to-head comparison

The final run scheduled 100 games across 50 paired starting positions, swapping
sides for each pair, with ten decisions running concurrently. Both modes used
the same model and safeguards against avoidable draws and repeated moves.
The run was stopped at the user's request with these results:

| Outcome                 | Games |
| ----------------------- | ----: |
| Three-ply lookahead win |    43 |
| Baseline win            |     2 |
| Draw                    |     6 |
| Unfinished              |    49 |

Lookahead won 43 of 45 decisive games (95.6%). This is an early-stopped comparison,
not a completed 100-game win-rate estimate or an Elo rating. Unfinished games
are neither draws nor losses.

All six draws reached the quiet-move limit with no non-drawing legal move on the
final turn. There were no repetition draws; the policy blocked 166 immediate-draw
choices. This does not prove earlier play could not have avoided the six draws.
All 7,599 committed moves and 7,556 dispatched request hashes were independently
verified before cleanup.

## Retained implementation

The temporary benchmark runners, generated requests, raw logs, and detailed
reports were pruned after promotion. Production search remains in
`server/ai-lookahead.ts`, with shared draw/repetition safeguards in
`server/ai-move-policy.ts`. Offline tests retain coverage of forced wins, draw
histories, node budgets, move restrictions, and difficulty selection. See
[AI configuration and difficulty](ai.md) for current behavior.
