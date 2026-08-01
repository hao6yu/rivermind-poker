# PR 33 — Preflop Range Foundation QA

Date: August 1, 2026

## Outcome

PR 33 gives RiverMind one explainable preflop baseline shared by the local AI, live Coach, and Learn experience. The strategy uses only the acting player's two cards and public table state: position, player count, effective stack, legal actions, and prior betting action. It never receives another seat's cards or the undealt deck.

This is intentionally described as a beginner baseline rather than a solver chart. It supports unopened pots, limped pots, and facing a raise; heads-up through six-player positions; 20, 40, and 100 BB learning views; legal open, isolation, and 3-bet sizing; and bounded mixed decisions.

## Product changes

- Added a canonical 169-hand classifier and position/stack/player-count range model.
- Routed heads-up and multiway preflop AI decisions through the shared model while preserving each difficulty's aggression and sizing character.
- Made live preflop Coach advice immediate, so it does not wait for Monte Carlo equity before showing an action and exact legal size.
- Added a Learn range explorer with table-size, action, position, and stack controls; a full 13 × 13 grid; a selected-hand explanation; and a compact legend.
- Added the preflop reference to the in-game cheat sheet.
- Reworded expanded Coach context so preflop decisions explain the range inputs instead of implying that raw equity alone selected the action.

## Automated validation

| Check | Result |
| --- | --- |
| TypeScript | `pnpm typecheck` passed |
| Full suite | 32 files, 177 tests passed |
| iOS bundle | Expo production export completed successfully (813 modules) |
| Range corpus | All 169 hands across representative position, depth, and action contexts produced normalized 0–100% frequencies |
| Heads-up fairness | Changing the redacted opponent hand did not change the seeded AI decision |
| Multiway fairness | Existing hidden-card invariance tests remained green after range integration |
| Difficulty behavior | Friendly, Club, and Sharp retained ordered aggression, bluffing, and average raise sizing in the repeatable simulation corpus |
| Table completion | Seeded three- through six-player simulations completed without illegal actions or lost chips |

## iPhone simulator validation

Device: RiverMind iPhone SE, iOS 27.0, Expo development session.

### Learn flow

- Opened Learn → Quick reference → Preflop range explorer.
- Confirmed the 13 × 13 matrix fits the narrow screen without horizontal scrolling or clipped cells.
- Switched from a six-player first-in BTN view to facing a raise; the BB defense option appeared and the chart recalculated.
- Switched from 100 BB to 40 BB; the depth indicator and suited-hand mix recalculated.
- Confirmed the modal back and sticky Done controls remain reachable.
- Opened the table cheat sheet during a live preflop decision and confirmed the range explorer is prioritized immediately below the turn guidance instead of buried after postflop references.

### Heads-up play

- Dealt K♣ 5♦ on the BTN/SB in Quick Play.
- Coach immediately recommended a legal raise to 2.5 BB and explained that K5o is inside the heads-up button opening range.
- Opened Coach details and confirmed the exact action, range explanation, raw equity, price, and estimation disclosure remain readable on the compact screen.
- Raised to 2.5 BB; the Club AI called through its private-card-safe decision view and checked the flop. Pot, stacks, badges, and next action stayed correct.

### Six-player play

- Started a six-player, 100 BB Club table.
- Observed action rotate UTG → HJ → CO → BTN with persistent public fold/raise badges.
- UTG raised to 2.5 BB; HJ and CO folded; Coach recommended a legal 2.5 BB call with T♠ 8♠ on the BTN and displayed the mixed-frequency explanation.
- Called, then observed SB and BB complete their decisions before the flop. The hand advanced with correct pot and stack accounting.

## Findings handled in this PR

1. Expanded preflop insight initially reused the postflop raw-equity explanation. It now states that position, table size, effective stack, and prior public action drive the chart recommendation.
2. The first range-color pass marked too many ordinary raise/call regions as mixed. Mix coloring is now reserved for genuinely close regions, keeping the beginner chart visually simpler.
3. The matrix cell calculation was tightened for the iPhone SE content width to avoid a one-pixel overflow at the card edge.

No unresolved correctness, privacy, or compact-layout issue was found in this pass.
