# PR 34 — Postflop Decisions and Sizing QA

Date: August 2, 2026

## Outcome

PR 34 gives RiverMind one explainable postflop baseline shared by local AI opponents and the live Coach. It compares every legal check, call, fold, bet, and raise line, including ⅓-pot, ½-pot, ¾-pot, pot, and appropriate low-SPR all-in sizes.

The model uses only the acting player's cards and public state: board texture, made hand and draws, estimated range equity, call price, effective stack, stack-to-pot ratio, live opponents, players behind, and prior public aggression. It never receives another seat's cards or the undealt deck. Its scores are relative teaching heuristics, not solver EV or a guarantee of optimal play.

## Product changes

- Added a shared postflop plan with legal candidates, an understandable primary line, and meaningfully different alternatives.
- Added hand-strength, straight/flush-draw, paired/connected/suited-board, field-size, position-order, initiative, price, and SPR context.
- Routed both heads-up and multiway production AI decisions through the shared plan while preserving Friendly, Club, and Sharp mixing and public-read adaptation.
- Kept conservative all-in rules: vulnerable overpairs no longer stack off automatically on coordinated multiway boards.
- Upgraded live Coach advice with exact pot-relative sizes, a compact decision basis, and a "Compare with" line that explains why the alternative is weaker or still viable.
- Added the same recommendation target to the existing bet-sizing sheet, where the user can still select every legal preset or a custom amount.
- Updated tournament test players to fold rather than blindly call every street, keeping checkpoint tests independent from smarter opponent behavior.

## Automated validation

| Check | Result |
| --- | --- |
| TypeScript | `pnpm typecheck` passed |
| Full suite | 33 files, 187 tests passed |
| iOS bundle | Expo production export completed successfully (814 modules) |
| Heads-up fairness | Seeded postflop decisions remained identical when the redacted opponent hand changed |
| Multiway fairness | Seeded postflop decisions remained identical when every other hidden hand changed |
| Legal sizing | Candidate and selected targets remained inside engine-provided minimum and maximum raises |
| Difficulty behavior | Friendly, Club, and Sharp retained ordered aggression, bluff pressure, folding discipline, and bounded sizing in the repeatable corpus |
| Table completion | Seeded heads-up and three- through six-player simulations completed without illegal actions or chip loss |
| Regression | Tournament checkpoints, full Sit & Go runs, replay, persistence, learning, and existing preflop ranges remained green |

## iPhone simulator validation

Device: RiverMind iPhone SE, iOS 27.0, Expo development session.

### Gameplay covered

- Played four hands across Quick Play and a three-player Club table.
- Verified preflop range advice still gives an exact legal action and opens the sizing sheet correctly.
- Played A♦Q♦ through a full A-high-board hand: Coach recommended a ½-pot flop value bet, changed to a turn check when a third spade appeared, and preserved a clean river check/showdown path.
- Played J♥6♠ on J♠10♥8♣ in a three-way pot: Coach changed from an oversized multiway value bet to a check after the field-risk adjustment.
- Faced a 5.5 BB turn bet with top pair plus an open-ended draw: the panel showed 14% estimated equity versus a 30% price, recommended Fold, and explained why Call remained below price with a player behind.
- Confirmed AI action badges, turn highlighting, pot and stack changes, board progression, showdown cards, and session hand counts stayed correct.

### UI and interaction covered

- Confirmed the compact Coach card, exact bet button, expanded metrics, decision basis, and comparison card fit the iPhone SE without horizontal clipping.
- Confirmed the postflop sizing sheet highlights the Coach target while keeping ⅓, ½, ¾, pot, all-in, and custom controls available.
- Confirmed tapping outside the Coach and sizing sheets dismisses them.
- Confirmed red suits remain red in hero, board, and showdown cards.

## Findings handled in this PR

1. A turn board containing three spades out of four cards was incorrectly labeled "monotone." It is now labeled "three-flush"; true three-card same-suit flops remain monotone.
2. Blockerless top pair was initially told to bet ¾ pot on that three-flush turn. Vulnerable one-pair hands now favor pot control when they do not hold the dominant suit.
3. Weak-kicker top pair was initially told to bet ¾ pot into two opponents on a connected board with both players behind. Marginal value thresholds now rise with field size and pending action.
4. A losing call shown beneath a clear fold was labeled "Also reasonable." The section now says "Compare with" and explicitly states when the alternative is below the offered price.

No unresolved correctness, privacy, or compact-layout issue was found in this pass.
