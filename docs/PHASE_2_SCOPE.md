# RiverMind Poker — Phase 2 scope

## Product outcome

Phase 2 expands solo practice from heads-up to credible three- through six-player AI tables. A player can select a table size, play complete multiway hands with correct rules and payouts, and receive coaching that understands position and several opponents.

This remains local, play-chip AI practice. Private friend tables, public matchmaking, server-authoritative dealing, tournaments, and real-money play are separate later milestones.

## Delivery sequence before Build 4

### PR 20 — Multiway table foundation

- Add a parallel 2–6 seat domain model without destabilizing the current heads-up beta.
- Validate occupied and active seats.
- Move the dealer button around empty or busted seats.
- Assign heads-up and 3–6 player blind positions correctly.
- Deal clockwise from the small blind.
- Define correct preflop and postflop action order.
- Cover short blind all-ins and sparse tables with deterministic tests.

### PR 21 — Betting rounds and pot engine

- Generalize fold, check, call, bet, raise, and all-in legality.
- Track who still owes action after a raise.
- Handle incomplete all-in raises without incorrectly reopening betting.
- Build main and side pots from each player's total contribution.
- Settle folds, showdowns, ties, and odd chips deterministically.
- Prove chip conservation across varied three- and six-player hands.

### PR 22 — Multi-player AI decisions

- Give each opponent a stable identity and one understandable playing style.
- Estimate equity against multiple live ranges rather than one known opponent.
- Account for position, players behind, pot odds, stack-to-pot ratio, and table pressure.
- Keep decisions local and fast; reserve OpenAI for post-hand explanation.
- Add seeded behavior simulations for Friendly, Club, and Sharp tables.

### PR 23 — Table setup and responsive gameplay UI

- Offer 2, 3, or 6 total players in Custom AI Game.
- Render compact seats around the existing table with clear turn, stack, fold, and all-in states.
- Preserve anchored hero actions and the calm coach interaction.
- Update result, replay, history, diagnostics, and accessibility for multiple opponents.
- Keep unsupported tournament and friend-table choices hidden.

### Build 4 gate

- Pass deterministic engine, AI, replay, persistence, and release checks.
- Test iPhone layouts and a representative 3-player and 6-player session in the simulator.
- Re-run mobile secret scans and production exports.
- Ship Build 4 only after the multiway path is complete enough for a tester to finish a session without a hidden heads-up fallback.

## Acceptance criteria

- A 3-player and a 6-player practice session can finish multiple hands without losing or creating chips.
- Button, blinds, positions, and first action remain correct as seats bust or are skipped.
- Main pots, side pots, split pots, and odd chips have deterministic test coverage.
- The hero never sees an opponent's hidden cards in gameplay, history, diagnostics, or coaching.
- Existing heads-up play remains usable throughout the migration.
- No network or model response is required to keep the game moving.
