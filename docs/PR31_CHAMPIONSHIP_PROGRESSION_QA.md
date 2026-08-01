# PR 31: RiverMind Championship progression QA

## Scope

PR 31 adds the first complete RiverMind Championship journey without creating another top-level tab. Home and Play open one calm five-stop map built on the existing fair 3- and 6-player tournament engine.

| Stop | Table | AI | Qualification |
| --- | --- | --- | --- |
| Local Tables | 3 players | Friendly | Top 2 |
| City Circuit | 3 players | Club | Top 2 |
| National Tour | 6 players | Club | Top 3 |
| Masters Division | 6 players | Sharp | Top 2 |
| RiverMind Final | 6 players | Sharp | Win |

Each qualifying finish unlocks the next stop. Failed attempts remain replayable, and the map keeps the best place and attempt count for each event. Winning the RiverMind Final completes the tour while leaving every stop open for replay.

## Fairness and persistence

- Championship difficulty is fixed by event and opponent-memory adaptation is disabled during a run.
- Coaching and live equity hints are locked off; the table shows a compact `Tour` fair-mode badge.
- Normal live deals use the cryptographically secure shuffle already shared by Sit & Go.
- One local checkpoint stores only the event identifier and public tournament state: seats, stacks, next hand, previous dealer, and difficulty.
- Hole cards, boards, histories, outcomes, and the undealt deck are never checkpointed. Resume creates a fresh shuffled deal at the saved completed-hand boundary.
- Best finishes, attempts, unlocks, and the checkpoint stay on the device. No global ranking is implied.

## Automated verification

The deterministic tests cover:

- the five ordered event definitions and their 3-to-6-player difficulty curve;
- one-at-a-time unlocks;
- failed attempts, retries, best-place updates, and qualification timestamps;
- complete-tour state only after the final qualifying result;
- event/checkpoint table-size and difficulty matching;
- rejection of private card, board, deck, history, and outcome data from serialized checkpoints.

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
| Home shows Championship progress as a secondary quick-start row | Pass |
| Championship map fits the compact device and scrolls through all five stops | Pass |
| Only Local Tables is initially actionable; later stops clearly explain their lock | Pass |
| Local Tables launches as Friendly 3-player play with a `Tour` badge and no coach control | Pass |
| One full hand completes with visible actions, board suits, showdown cards, payout, and stack updates | Pass |
| Leaving after hand 1 marks Local Tables `SAVED` and shows `Continue hand 2` | Pass |
| Resume prompt offers Restart, Continue, and Cancel with event-specific copy | Pass |
| Continue opens hand 2 with preserved public stacks, rotated positions, and fresh hero cards | Pass |
| Leaving an unfinished hand returns to the Championship map at the prior completed boundary | Pass |
| Entering the Friendly opening event leaves the user's normal Club Quick Play preference unchanged | Pass |

## UX decisions

- Championship stays under Play and appears only as a secondary Home entry, preserving the three-tab navigation.
- The map uses indigo and aqua progress states rather than casino-style gold, felt, or ornamental trophies.
- Each stop shows only table size, opponent level, coach state, and the exact qualifying target.
- Saved-run replacement requires an explicit warning; completed event results are never discarded by starting another run.
- Result copy distinguishes qualification, retry, and final-tour completion, and links back to the Championship map.
- Championship difficulty stays isolated to the event and no longer changes the player's normal Quick Play preference after leaving.

## Deliberate limits

- This is a device-local learning journey against AI, not network multiplayer or a public tournament circuit.
- Rankings, cross-device Championship sync, achievements, and anti-tamper validation remain later Phase 3 work.
- Nine-player Championship stops wait for nine-player engine and layout validation.
