# PR 30: Six-player Sit & Go QA

## Scope

PR 30 expands the existing resumable Sit & Go from three to six players without adding another top-level menu. The Play screen presents both table sizes in one compact tournament group.

- 3-player and 6-player tournaments use the same escalating-blind, elimination, payout, and fairness rules.
- Each table size has an independent local checkpoint, so starting or clearing one tournament never replaces the other.
- Existing three-player checkpoints remain compatible with the original storage key.
- Checkpoints remain public-only. They contain stacks, seats, button position, level, and hand number, but no hole cards, board, or undealt deck.
- Resuming creates a fresh cryptographically shuffled deal from the saved hand boundary.
- Daily Challenge remains deliberately locked to its comparable three-player format.

## Automated verification

The test suite covers:

- equal 60 BB six-player starting stacks, including posted blinds;
- a public-only six-seat checkpoint and restored position markers;
- a deterministic full tournament that completes with a valid first-through-sixth placement;
- rejection of a six-player checkpoint by the three-player Daily Challenge validator;
- existing three-player checkpoint, engine, fairness, and Daily Challenge regressions.

Commands:

```bash
pnpm typecheck
pnpm test
pnpm release:check
```

## iOS simulator pass

Device: iPhone SE simulator, iOS 27.0.

| Journey | Result |
| --- | --- |
| Play screen shows 3-player and 6-player choices in one compact Sit & Go group | Pass |
| All six seats, stacks, cards, action badges, and D/SB/BB markers remain readable | Pass |
| Hero call, opponent raise, fold, showdown, payout, and next-hand flow complete | Pass |
| Dealer and blinds rotate from hand 1 to hand 2 | Pass |
| Leaving during hand 2 returns to Play and preserves the previous completed boundary | Pass |
| Six-player resume restores the hand number and public stacks, then creates a fresh private deal | Pass |
| Existing three-player hand 7 save remains independently available | Pass |
| A tournament opened from Play returns to Play rather than Home | Pass |

Observed hand-1 position order was Mara (D), Theo (SB), Nova (BB), Hero (CO), Sol (HJ), and June (UTG). Hand 2 rotated to Theo (D), Nova (SB), June (BB), Mara (CO), Hero (HJ), and Sol (UTG).

## UX findings handled in this PR

- Kept both tournament sizes inside one Sit & Go row to avoid another screen or tab.
- Shows `Hand N saved` independently beneath each resumable option.
- Names the resume alert with the selected table size so players cannot continue the wrong tournament accidentally.
- Fixed a stale navigation callback that could return a tournament opened from Play to Home.

## Deliberate limits

- Sit & Go opponents are local AI; this is not friend or network multiplayer.
- Coaching remains optional in Sit & Go. Daily Challenge keeps coaching off for comparable attempts.
- Nine-player tables, championship progression, rankings, and server-authoritative competition remain later Phase 3 work.
