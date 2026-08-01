# PR 28 — Daily Challenge QA

## Scope

PR 28 adds one lightweight competitive reason to return each day: a three-player, play-chip Daily Challenge. Every UTC date maps to one reproducible Sit & Go table with 60 BB stacks, Club AI, rising blinds, and coaching locked off. Players may replay the table to learn from the same situations.

Placement awards 100 points for first, 70 for second, and 40 for third. The app keeps the best placement for that date; fewer hands breaks a tie. Attempts and consecutive completed-day streaks remain visible, but results are private to the owner during beta.

## Randomness and fair-play boundary

- Normal practice and ordinary Sit & Go deals remain cryptographically shuffled.
- Only Daily Challenge derives deals and mixed AI choices from the UTC date, challenge version, hand number, and public decision position.
- Every AI decision still receives only that AI seat's cards plus public board, stacks, positions, betting state, and action history.
- Daily AI ignores the device's learned opponent-memory profile so two players face the same baseline conditions.
- Daily coaching is locked off, and the table uses a compact **Fair** indicator in place of the coach switch.
- Replaying today's event intentionally reproduces its table. Crossing into a new UTC date creates a different event.

## Resume and persistence

The device saves only a public tournament checkpoint: event date, player identities and seats, public stacks, next hand number, previous dealer, and fixed difficulty. It stores no hole cards, board, deck, outcome, or in-progress private decision state. Resume deterministically recreates the next uncompleted Daily hand.

Supabase stores one row per owner and event date with challenge version, best score, best placement, best hand count, attempts, and timestamps. The app writes locally first and retries an owner-scoped upsert after connectivity returns. Row Level Security requires the authenticated user ID for select, insert, update, and delete.

## Automated validation

- Same date produces the same opening hand, next hands, and resume path; a different date changes the deal.
- Checkpoint serialization is rejected unless its date and public Sit & Go state are valid.
- Checkpoints contain no cards, deck, history, outcome, or private state.
- Result tests cover placement scores, best-result merging, fewer-hands tie breaking, attempt counts, and streak calculation.
- The hosted two-user RLS verifier proves another authenticated user cannot read, update, delete, or forge ownership of Daily results.
- Full TypeScript, unit, release-configuration, mobile-secret, and production-export gates cover the final branch.

## iPhone simulator pass

Test device: RiverMind iPhone SE simulator, iOS 27.0.

| Journey | Evidence | Result |
| --- | --- | --- |
| Home discovery | Daily Challenge is the first compact Quick start row, described as the same table with coaching off | Pass |
| Fair table state | Header shows Daily, UTC date, players left, blinds, and a **Fair** shield; no coach switch, suggestion, learned read, or sizing hint appears | Pass |
| Complete hand | Played the opening Q♦–9♦ hand through river; action badges and amounts remained visible, cards retained suit colors, and the result reported a 14.7 BB win with three of a kind | Pass |
| Public checkpoint | Exiting after hand 1 showed “Saved at hand 2”; Continue opened hand 2 with preserved public stacks and K♣–K♠ for the hero | Pass |
| Deterministic restart | Restart returned to the exact opening Q♦–9♦ deal, dealer/blinds, Mara fold, and Theo 0.5 BB call | Pass |
| Normal randomness | Two new Quick Play launches dealt 6♣–2♥ and then 3♠–Q♥; coaching remained available outside Daily | Pass |
| Small-screen sheets | Exit confirmation and bet sizing fit the iPhone SE; tapping the backdrop dismissed the sheet | Pass |

## Finding fixed during the pass

Launching the Daily Challenge from Home originally returned to Play after exit, unlike Home's Quick Play shortcut. The launch now remembers its origin so backing out returns to Home when the event started there and to Play when it started there.

## Deliberate limits

- This is local AI competition, not live multiplayer.
- There is no public leaderboard in this PR. A modified client could claim its own score, so global comparisons require server-authoritative verification and anti-tamper design.
- The event changes at UTC midnight, not local midnight.
- Replays are allowed and recorded as attempts; this mode is designed for learning, not prizes.
- Six- and nine-player tournaments remain later work.
