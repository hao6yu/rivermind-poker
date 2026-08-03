# PR 37 — Targeted Practice Packs QA

Date: August 2, 2026

## Outcome

PR 37 completes the session-learning loop introduced in PR 36. A locally reviewed weakness now opens a focused five-spot practice pack instead of a generic trainer. RiverMind includes three packs—Preflop decisions, Purposeful betting, and Calls, draws, and odds—covering all seven coach focus areas.

The normal six-spot Scenario Training session remains available from Home, Learn, and Play. Focused and general practice keep separate scores, so a broad trainer result cannot hide progress in a specific skill.

## Product changes

- Expanded the validated scenario catalog from eight to fourteen templates.
- Added five-spot focused sessions for preflop, betting, and odds concepts.
- Routed session results, saved-history recommendations, Progress, and the Learn recommendation card to the matching pack.
- Added focused headers, pack descriptions, per-pack best scores, missed-concept summaries, and same-pack retry.
- Continued revealing every alternative after an answer so beginners can compare the preferred line, playable mix, and mistake.
- Reset the scroll position at every fresh spot after compact-iPhone simulator testing found that a reviewed explanation could otherwise leave the next table partially offscreen.
- Made the result state scroll-safe so Review next, best score, Done, and retry remain reachable on compact iPhones.

## Privacy, cost, and persistence boundary

Generation, answer grading, missed-concept selection, and routing all run locally and make no OpenAI request. A scenario contains only the hero cards, public board, public action, pot, stacks, and positions; it has no opponent-card or undealt-deck field.

The three durable activity IDs reuse the existing offline-first `learning_progress` row and `scenario_drill` activity type. No database migration, new table, or API endpoint is required. Supabase continues to enforce owner-scoped row-level security.

## Automated validation

| Check | Result |
| --- | --- |
| Release gate | `pnpm release:check` passed |
| TypeScript | `pnpm typecheck` passed |
| Full suite | 36 files, 206 tests passed |
| Production bundles | iOS and Android exports passed |
| Secret scan | Tracked source and both mobile exports passed |
| Pack coverage | Every coach focus maps to exactly one durable pack |
| Generated sessions | Every pack produces five distinct validated spots across varied seeds |
| General trainer | Six spots continue sampling from all fourteen templates |
| Table math | Generated call prices recompute required equity from the final pot |
| Hidden-card safety | Focused scenarios expose neither opponent cards nor deck state |
| Progress isolation | General, preflop, betting, and odds scores remain independent |
| Live RLS check | Unauthenticated access, cross-user CRUD, ownership forgery, and server-only quota writes were denied |

## iPhone simulator validation

Device: RiverMind iPhone SE, iOS 27.0, Expo development session in Xcode Device Hub.

### Journeys covered

- Played two complete heads-up practice hands. Folding pocket eights against a 2.5 BB open produced a local Preflop decisions recommendation.
- Opened **Practice this spot**, verified Learn described the Preflop decisions pack, and launched a five-spot focused session automatically.
- Answered all five spots, reviewed all three alternatives and their explanations, and confirmed the result showed a pack-specific score plus missed concepts.
- Replayed the flow with newly generated suits, holdings, stacks, prices, and scenario order.
- Opened the standard Scenario Training row separately and verified it remained a six-spot **Guided decisions** session rather than inheriting the preflop focus.
- Verified the pack score persisted as the best preflop score while a lower replay did not replace it.

### UI findings handled in this PR

- Added automatic scroll-to-top when advancing after a long explanation.
- Made the focused result vertically scrollable on the compact screen so the retry control stays reachable above the safe area.
- Verified card suits, hidden opponent cards, table math, focus labels, progress bars, fixed Next action, back navigation, and light-mode contrast.

No unresolved correctness, privacy, cost, or compact-layout issue was found in this pass.
