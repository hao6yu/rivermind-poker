# PR 35 — Decision Grading and Line Comparison QA

Date: August 2, 2026

## Outcome

PR 35 turns RiverMind's shared preflop and postflop strategy into a consistent post-hand learning loop. Every hero decision in a newly recorded heads-up or 3–6 player hand is graded locally as **Strong**, **Close**, or **Review this spot**. The review compares the chosen line with RiverMind's preferred baseline, identifies the most useful decision, and opens replay directly at that action.

This is a relative teaching baseline, not solver expected value or a claim of perfect play. Opening the local review is free and never calls OpenAI. A richer AI explanation remains available through the explicit **Ask AI to explain this hand** action.

## Product changes

- Added deterministic chosen-versus-baseline grading for preflop action, preflop sizing, and every legal postflop line and size.
- Added public decision snapshots to the multiway engine so 3–6 player replay has the same evidence already available heads-up.
- Ranked clear mistakes ahead of close mixed lines, then used the relative score gap to choose the most useful review decision.
- Added a compact review card showing the player's choice and RiverMind baseline without presenting heuristic scores as EV.
- Changed heads-up **Review hand** to open the free local result first. AI usage now requires a separate, clearly labeled tap.
- Updated heads-up and multiway replay to jump directly to the focus decision and show the comparison only on hero-action steps.
- Preserved old multiway hand-history compatibility: records saved before public decision snapshots still replay normally without fabricated grades.

## Privacy boundary

Decision grading accepts only:

- the hero's two cards;
- community cards visible at that decision;
- public bets, pot, stacks, position, players behind, live-player count, and legal actions;
- a deterministic equity sample from unknown remaining cards.

Opponent hole cards, showdown revelations, and the undealt deck are never grading inputs. Tests replace every available opponent holding while holding public state constant and receive byte-for-byte identical decision reports. Persisted decision snapshots contain no cards or deck.

## Automated validation

| Check | Result |
| --- | --- |
| TypeScript | `pnpm typecheck` passed |
| Full suite | 34 files, 195 tests passed |
| Varied-hand evaluation | 24 seeded hands across heads-up, 3-player, and 6-player tables graded with bounded legal comparisons |
| Determinism | Repeated reports for the same hand are identical |
| Hidden-card fairness | Changing revealed or private opponent cards never changes any grade, focus decision, or explanation |
| Persistence privacy | Public decision snapshots survive redaction without hole cards or deck data |
| Legacy history | Multiway records without snapshots remain replayable and produce no invented grade |
| Replay mapping | Heads-up and multiway focus sequences resolve to the matching hero action |

## iPhone simulator validation

Device: RiverMind iPhone SE, iOS 27.0, Expo development session in Xcode Device Hub.

### Journeys covered

- Played a heads-up hand that ended preflop after the recommended 2.5 BB open. The local sheet graded the action Strong and opened without a loading state or network request.
- Played a complete six-decision heads-up hand from Q♣6♣ on Q♠4♥9♦ through a river showdown. The report found the river check as decision 5, showed **Check → Bet 9.8 BB**, and replay opened at step 12/15 on that exact action.
- Played a three-player hand with both opponents acting before and after the hero. The public snapshot graded the 2.5 BB open and replay opened at step 3/5 with both prior actions preserved.
- Verified strong and review-needed color treatments, red card suits, chosen/baseline labels, stack and pot continuity, Previous/Next navigation, Done behavior, and outside-tap dismissal.

### Cost and UI checks

- Opening and reopening **Review hand** did not start an AI request.
- **Ask AI to explain this hand** is visually separate and describes the optional paid/server-backed layer.
- Focus cards fit the compact screen without horizontal clipping. Longer rationale is shown in the summary sheet; replay keeps the comparison compact so the table and controls stay visible.
- Heads-up and three-player result sheets remain vertically scrollable, and all primary controls remain reachable above the safe area.

No unresolved correctness, privacy, performance, or compact-layout issue was found in this pass.
