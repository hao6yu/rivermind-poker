# v1.3 implementation review — 2026-09-10

**Verdict: needs fixes before release.** Reviewed the uncommitted implementation on `23a2ee64`, against the gaming-focused scope: existing private tables, Championship, presentation order, and UI polish. No application code was changed during this review.

## Confirmed findings

### 1. P1 — Next event preserves the completed game, causing a crash or an unearned result

Location: `src/features/shell/AppShell.tsx:1187–1202`.

`openNextChampionshipEvent` opens the map while `screen` remains `table`. Selecting an event updates the existing `MultiwayPokerTableScreen` props; that screen has no run key and initializes `game` only in `useState`. Its old game and session ID remain.

- Reproduced Local 3 → Local 6 with the real table component: `Seat placement requires the hero and every configured table player` is thrown because six-seat props meet a three-seat game.
- Reproduced Final → River Below: the old winning hand triggers `onChampionshipComplete` again for the new event, without playing it.

Exit/unmount the completed table before opening the map, or give each explicitly started run a stable, distinct identity that resets its state. Test the actual shell navigation for both changed and unchanged seat counts, including invitation unlocks and saved-run protection.

### 2. P1 — The Championship outcome overlay bypasses the final-action boundary

Location: `src/features/table/MultiwayPokerTableScreen.tsx:1757–1773`; completion callback at `1035–1053`, shell handler at `AppShell.tsx:1269`.

The completion callback runs as soon as engine `game.outcome` exists. The shell immediately sets `championshipOutcomeMoment`, and the new modal renders without checking `handEnding.presentedOutcome`. This recreates the reported early win/loss announcement at the end of a Championship run, even while the ordinary result banner is correctly hidden.

Reproduced a real all-in hand ending: final AI action bubble present, result banner absent, victory modal already visible. Gate the visible moment behind the presentation boundary; persisting a result need not wait for that boundary. Continue should lead to the intended summary.

### 3. P2 — The runout is only a timer step; board and continuation controls bypass it

Locations: `src/features/table/useHandEndingPresentation.ts:176–185`, `MultiwayPokerTableScreen.tsx:1590,1709`, `PokerTableScreen.tsx:1093,1243`.

Both boards still render `game.board`, so a preflop all-in reveals all five cards immediately while the final AI action is being presented. The hook's `streetReveal` step does not control rendered cards. Reproduced in the real multiway screen: expected the previous zero-card board during the action window, received five cards.

Continuation buttons still check only `actionPresentationPending`, which becomes false during the new runout/showdown windows. Players can advance before the result appears. Outcome-derived pot/stack/seat labels also need auditing against the common boundary.

Expose and consume presentation state for the board and outcome surfaces; keep continuation disabled until the result step. Cover both heads-up and multiway screens. The existing screen regression only checks that *some* action bubble preceded the banner, not that the resolving action, board, overlay, and continuation controls followed the required sequence.

### 4. P2 — Presentation recovery records actions before they finish, and misses session resets

Location: `src/features/table/useHandEndingPresentation.ts:70–119`.

The cursor is advanced to the full history before presentation starts. Reproduced a terminal call interrupted after 100 ms of its 1,000 ms action window: unmount/remount immediately shows the result instead of replaying the interrupted action. The existing test manually seeds an older cursor, so it does not exercise what the live hook actually writes.

Separately, reset detection checks hand number but not session ID. Reproduced completing hand 1 and starting another session at hand 1: the hook remains in its previous terminal state. This can suppress new action presentation until history catches up. Record completed presentation steps, reset on the full session/hand identity, and test actual interruption and replay/retry lifecycle transitions. Background timer behavior remains unverified on a device.

### 5. P2 — The HUD counts all-in players as eliminated

Location: `src/features/table/tournamentHud.ts:47–62`.

`sitAndGoLivePlayerIds` counts positive stacks. During a live hand, an all-in player has zero behind but is still competing. Reproduced a three-player live hand with the hero all-in: the HUD reports two remaining and switches to heads-up before any elimination. Provisional rank also drops based on committed chips, and drawer ranks do not share ties like the headline does.

Derive remaining players and provisional standings from tournament participation at an appropriate settled boundary; eliminate players only after settlement. Test all-ins, ties, side pots, and multiple simultaneous eliminations.

### 6. P2 — The new AI baseline still does not match the production roster

Location: `src/domain/poker/championshipSimulation.ts:298`, production branch at `224–240`.

Parity mode now calls the live decision function, but its initial `createSitAndGo` omits `event.aiDifficulty` and defaults to Club. The real screen supplies the event difficulty. Because `decideSessionAiAction` resolves named identities before its fallback, the simulation keeps Club personas rather than the live Elite/Nemesis roster. This changes the population being measured.

Pass the same construction inputs as the live screen and add a roster/parity assertion before rerunning the baseline. Also label the Sharp proxy's reduced eight-sample precision explicitly; it is not the production Sharp decision budget.

The C2 report's conclusion exceeds its evidence: Undertow 0/10 with a reported 95% interval extending to 28% does not establish a ≤5% clear rate or conclusively rank the three events. The report also describes Final as top-two qualification, while the current event definition requires first place. Correct the provenance and uncertainty before marking C1/C2/C3 complete. No new evidence here justifies increasing aggression or attributing the friend's five-attempt public-v1.2 win to a particular cause.

### 7. P2 — The standings rule changed without the planned disclosure or compatibility boundary

Location: `src/domain/multiplayer/sessionSummary.ts:56–72`.

The client now unconditionally ranks by net chips. `rankedByNet` is produced but never consumed by the summary view, and no setup disclosure was added. The result can name a different winner than final-stack ranking without explaining why. Since the rule is client-derived and not versioned per session, v1.2 and v1.3 clients can also display different winners for the same rebuy session.

Complete the pre-play disclosure, result caption, and session/version compatibility behavior, or defer the rule change. Reconcile the status/proposal documents, which still call this item unimplemented or awaiting a decision.

## Missing or incomplete release work

- **A2 reliability:** existing QA explicitly leaves pause/resume, completion/rematch, and rebuy without a completed two-client gate. It also records an unresponsive relaunch, a dead Continue control, and finished-session recovery problems. These are unresolved product issues or unresolved investigations, not release passes. The RN startup explanation is a hypothesis supported by logs, not an independently established cause in this review. Do not treat a test-harness relaunch delay as an application fix.
- **A2 error UX:** a 60-second alert dedupe limits frequency; it does not implement contextual retry/rejoin/leave recovery or eliminate the failing retry source. The old transport banner remains alongside the new status view; the status resolver's `blocking` result is not wired to betting controls.
- **B3:** the implementation adds an outcome card; event intros, venue accents, and new usable cosmetic rewards are not demonstrated by these changes. The new reward card interpolates the English achievement `title` rather than using `championshipAchievementDisplay`/localized achievement text.
- **D2 evidence:** inspected the stored HUD landscape and expanded-drawer captures. The HUD text truncates, and the expanded portrait capture does not show the action row. The capture still contains `You · You`, which current code addresses, so it is not evidence of the final UI state. Refresh captures after fixes, including drawer-open controls, small landscape, larger text, and invitation clocks.
- **Documentation:** `RELEASE_1_3_STATUS.md` simultaneously calls targets ratified and asks for ratification; it marks C1 done while the C1 report leaves public-binary matching and live fallback measurement open. Update completion claims to match evidence.

## Verification and reproducibility

- Node 22.19.0: `pnpm typecheck` and `pnpm typecheck:functions` passed.
- Full existing suite: **2,450 passed, 2 failed, 6 skipped** across **244 passing, 2 failing, 2 skipped files**; 165.77 seconds.
- Failure: `src/domain/multiplayer/coordinator.test.ts:781` expects the old exact summary shape and fails on the added `rankedByNet` field.
- Failure: `scripts/generate-localization-inventory.test.ts:252` compares today's 1,963 keys with the frozen inventory's 1,939. Update the test's live-catalog expectation without casually overwriting historical frozen evidence.
- Seven additional independent regression checks failed as described above: interrupted replay, same-hand session reset, all-in HUD, next-event changed-seat crash, next-event same-seat false completion, premature outcome overlay, premature board runout. Screen checks use the actual screen and poker engine with deterministic initial states; native APIs and selected AI responses are mocked. These are component reproductions, not device reproductions.
- The temporary test was removed from `src` after the review. Its reproducible source and output are saved at `artifacts/reviews/v1.3/review-regressions.tsx` and `artifacts/reviews/v1.3/review-regressions.log`.

To rerun, copy `artifacts/reviews/v1.3/review-regressions.tsx` to `src/features/table/__v13_review.test.tsx`, then run `pnpm vitest run src/features/table/__v13_review.test.tsx --reporter=verbose` using Node 22.19.0 or newer. Remove the temporary copy afterwards. No production multiplayer commands or hour-long AI calibration were run during this review.
