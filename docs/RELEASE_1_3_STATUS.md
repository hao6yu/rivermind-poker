# Release 1.3 — status

Status: **round 3 complete; release-evidence gates remain.** The v1.3 implementation review (2026-09-10, `docs/RELEASE_1_3_IMPLEMENTATION_REVIEW.md`) confirmed two P1 blockers and five P2 findings; the follow-up review (2026-09-11, `docs/RELEASE_1_3_FOLLOWUP_REVIEW.md`) verified both P1 fixes and raised three findings plus regression-coverage corrections; the remediation review (2026-09-13, `docs/RELEASE_1_3_REMEDIATION_REVIEW.md`) verified those fixes, accepted the final-stack scope decision, and raised one narrower board-boundary finding. Round 3 closes it. Remaining before sign-off: the corrected C2 calibration re-run, the A2 two-client legs and recovery triage, refreshed D2 captures, and Next-event navigation coverage via device/e2e. Basis: working tree at HEAD `23a2ee64` + the 1.3 changes.

## Review remediation round 3 (2026-09-13)

| Finding | State | Evidence |
| --- | --- | --- |
| P2 — The saved board boundary must hold on the first committed restore render | Fixed | `boardCountBefore` initializes from a matching UNFINISHED presentation cursor at mount — before the hook's effect can adopt it — so a remounted interrupted all-in never commits the settled five-card board before the replay re-holds it; unrelated hands and fully presented restores keep the live board. The interruption regression now records EVERY commit and asserts the saved boundary on the first one (verified to fail with the reviewer's exact 5-then-0 reproduction when the fix is reverted); the interrupted-runout restore asserts the same first-commit hold. |

## Review remediation round 2 (2026-09-11 follow-up)

| Finding | State | Evidence |
| --- | --- | --- |
| P2 — Complete ledgers do not establish mixed-version compatibility | Fixed by DEFERRING the rule | Net ranking is withdrawn for this release: sessions rank by final stack — the rule every shipped client computes — so the old and new algorithms name the same winner on the same snapshot (the review's A/B reproduction is a permanent test). `rankedByNet` stays `false` and is reserved for a versioned rollout that enforces a real session capability boundary. See `docs/RELEASE_1_3_A3_STANDINGS_RULE_PROPOSAL.md`; tests: `sessionSummary.ranking.test.ts`. |
| P2 — Outcome surfaces bypassed the boundary (early `Out` labels; first-commit card reveal) | Fixed | Seats receive a settled-state gate (`settledHandPresentation` = street complete AND result presented), so elimination labels keep the live all-in/action state until the result step; the heads-up badges gate the settled branch the same way. The hook's `showdownRevealed` no longer falls back to raw `outcome.showdown` — the first committed terminal render is gated — and the screens no longer bypass the gate when `isTerminalSequence` is false. Regressions: real-screen `Out`-label test (verified to fail ungated, reproducing the review's two-label finding) + hook first-commit reveal test. |
| P2 — Resumed-showdown feedback/visual timing mismatch | Fixed; subsequent board-restore gap also closed in round 3 | The planner always includes the showdown reading window in the result delay (a fully presented restore still fast-forwards with a zero delay in the hook). The cursor records the pre-runout board size; round 3 restores it before the first render. The original review reproduction now passes, alongside 27 focused presentation tests and both typechecks. See `docs/RELEASE_1_3_REMEDIATION_REVIEW.md` for independent closure evidence. |
| Regression-coverage corrections (same-renderer session reset; real unmount before replay; shell wiring coverage) | Addressed | The session-reset test now updates the SAME mounted hook; the interruption test unmounts the interrupted instance before remounting. Real-shell wiring coverage was attempted (AppShell rendered with the service graph mocked): the shell mount hangs under vitest regardless of timer strategy, so the attempt was removed rather than shipped flaky — the gap is documented below, with the keyed-screen `RunHarness` tests and the run-navigation unit tests as current coverage. |

## Review remediation round 1 (2026-09-10)

| Finding | State | Evidence |
| --- | --- | --- |
| P1 — Next event preserved the completed game (crash on seat-count change / unearned completion) | Fixed (verified by follow-up review) | AppShell gives every explicitly started run a distinct identity (`tableRunId` key on both table screens), so a run started over the completed table remounts fresh; stale end-of-run moments are cleared on a new run. Next-event resolution extracted to `championshipRunNavigation.ts`. Screen regressions: `MultiwayPokerTableScreen.v13Boundary.test.tsx` (changed + unchanged seat counts). |
| P1 — Championship outcome overlay bypassed the final-action boundary | Fixed (verified by follow-up review) | The visible moment is gated behind `handEnding.presentedOutcome` (result recording/persistence stays immediate). Regression in `MultiwayPokerTableScreen.v13Boundary.test.tsx`. |
| P2 — Board runout appeared during the final action; continuation controls bypassed the boundary | Fixed (verified by follow-up review) | The hook exposes `presentedBoardCount`; both screens render the board through it and keep continuation disabled until the result step. |
| P2 — Presentation recovery recorded actions before they finished; missed session resets | Fixed (verified by follow-up review) | The cursor records only COMPLETED presentation steps and resets on the full session/hand identity. |
| P2 — HUD counted all-in players as eliminated | Fixed (verified by follow-up review) | `sitAndGoRemainingPlayerIds` drives remaining counts; provisional rank uses chips in play during a live hand; drawer places share ties. Regressions: `tournamentHud.test.ts` + domain test. |
| P2 — AI baseline measured the wrong roster | Fixed (verified by follow-up review) + baseline invalidated | `championshipSimulation.ts` constructs the initial table with `event.aiDifficulty`, guarded by a roster/parity assertion. All prior C2 numbers are INVALID — `docs/RELEASE_1_3_C2_BASELINE.md`; re-run required before C1/C2/C3 completion claims. |
| B3 reward card interpolated the English achievement title | Fixed (verified by follow-up review) | The moment model carries the achievement; the view resolves localized, hidden-aware copy via `championshipAchievementDisplay`. |

## Known coverage gap

- **Hosted account-deletion/avatar deployment gate — closed September 13**: `delete-account` v2 and `avatar-cleanup` v1 are deployed and match reviewed source. All 12 hosted checks passed, disposable accounts/files were removed, and an actual cron invocation returned HTTP 200 with zero failures. Daily cleanup is active at 08:37 UTC. Push notifications remain enabled and operating. Evidence: `docs/RELEASE_1_3_SUPABASE_DEPLOYMENT.md`.

- **Real-shell wiring test**: the run-key coverage renders keyed table screens through a harness that mirrors AppShell's wiring, plus unit tests for the next-event resolution. An AppShell-mounting test (Home → map → event → completed run → Next event) was attempted for the follow-up review's request to "execute the real shell wiring": the shell's service graph requires a deep chain of native shims under vitest (expo root runtime, clipboard/Constants native modules), and after shimming those the shell mount still hangs regardless of timer strategy. The attempt was removed rather than shipped flaky; landing it needs a dedicated shell test harness (or Detox/e2e coverage).

## Shipped and verified

| Scope item | State | Evidence |
| --- | --- | --- |
| D1 hand-ending presentation order | Implemented; all reported presentation findings closed | Shared completion boundary (`handEndingPresentation.ts` + `useHandEndingPresentation.ts`) wired into both local screens; hook-level order regressions + real-screen regressions (`MultiwayPokerTableScreen.handEnding.integration.test.tsx`, `.v13Boundary.test.tsx`); private-table path verified clean (`multiplayerActionQueue.ts` already orders presentation). The final first-commit board-restore reproduction passes. Closure: `docs/RELEASE_1_3_REMEDIATION_REVIEW.md`. Investigation: `docs/RELEASE_1_3_D1_INVESTIGATION.md`. |
| A2 unified table status | Done (implementation) | `multiplayerTableStatus.ts` resolver (7 tests) + `MultiplayerTableStatusView` wired into the flow modal, absorbing the sitting-out banner; rendered live during a real missed-turns recovery on two simulator clients. Contextual retry/rejoin/leave recovery and the blocking-status wiring to betting controls remain open. |
| A2 reliability gate | Core legs PASS; remaining legs unverified | Create/join/ready/start PASS; background/foreground PASS; network interruption PASS; **host departure PASS**; **sit-out recovery live-validated 31 times** — all with authoritative pot/hand/stack agreement on two emulator clients against Supabase. **Pause/resume, completion/rematch, and rebuy legs have no completed two-client gate** (documented harness/room-state chain in `docs/RELEASE_1_3_SIMULATOR_QA.md`). Device findings 1 fixed, 2 root-caused (RN Bridgeless race — hypothesis supported by logs), 2+3 consolidated, 4-5 documented. |
| A3 completion-reason copy | Done | `host-ended` mapped to its own copy in all six locales; catalog parity green. |
| A3 standings rule | Deferred (final-stack ranking ships) | Net ranking requires a real session capability boundary that does not exist; `rankedByNet` reserved `false`. Record: `docs/RELEASE_1_3_A3_STANDINGS_RULE_PROPOSAL.md`. |
| B1 Championship resume/next-event | Done (review remediation included) | Direct Resume (no second prompt), separate Restart action, Next-event/Try-again primary actions, map opens on the next unlocked stop (`championshipRunNavigation.ts`). 19 modal tests + fresh-run regressions. |
| B2 tournament HUD | Done + review fixes | Model (8 tests incl. all-in/tie/settlement) + view wired into tournament tables; all-in players stay remaining until settlement; drawer places share ties. |
| B3 outcome moments | Done (core; overlay behind the shared boundary; localized rewards) | `championshipVictory.ts` model (5 tests): victory/qualification/elimination presentation, unlock reveal gated behind the real unlock, cosmetic titles from existing progress; overlay view + wiring. |
| C1 production-path validation | Partially done — open items gate completion | Parity gaps documented and closed in the harness (`productionParity` mode) plus the review-found construction gap (event roster) now fixed and asserted. Still open: live fallback-frequency measurement; v1.2 public-binary matching. Record: `docs/RELEASE_1_3_C1_PRODUCTION_PARITY.md`. |
| C2 endgame measurement | **Invalidated — re-run required** | The baseline measured the Club-default roster, not the event rosters; numbers and the earlier "targets ratified and met" claim are withdrawn. Report: `docs/RELEASE_1_3_C2_BASELINE.md`. |
| D2 polish | Pre-review captures; refresh required | 26 layout screenshots captured pre-review; the review found HUD truncation, a missing action row in the expanded portrait capture, and a stale `You · You` capture — refresh captures after the fixes (drawer-open controls, small landscape, larger text, invitation clocks). |

## Device findings awaiting owner triage

1. ~~Recurring blocking conflict dialog~~ — **fixed** (identical consecutive table-error alerts deduped behind a 60s window; regression added). The review notes this limits frequency only; contextual retry/rejoin/leave recovery and removing the failing retry source remain open.
2. **Touch-dead first relaunch after process death** (release build) — root-caused: an RN 0.81 BridgelessReact startup race (window focus before React context ready, soft exception swallowed); logcat evidence captured. Recoverable by a second restart; mitigation (shell-level relaunch delay / upstream RN issue) is an owner decision. The review notes the RN-startup explanation is a hypothesis supported by logs, not an independently established cause.
3. **Home continue-card handler dead after process death** — likely the same root cause as finding 2 (JS touch-dispatch failure after the focus race); the invite deep link works as the fallback path.
4. **Rejoin into a finished session** lacks an in-context next action (routing analysis in the QA report; needs a controlled repro to pin the surface).
5. **Stale recovery record blocks local play** — the recurring dialog fires over non-multiplayer screens until app data is cleared.

## Owner decisions required

1. **C2 numeric difficulty targets** — re-ratify against the corrected (event-roster) baseline once re-run; the earlier ratification is void.
2. **Rebuy standings rule** — deferred this release; revisit only with the versioned capability boundary (see the A3 proposal).
3. **Findings triage** — which of the device findings (2–5) go into 1.3 vs. a follow-up.
4. **Emulator-5554 availability** — unblocks the remaining A2 gate legs and the finding-2 root-cause session.

## Explicitly excluded (per the scope draft)

Training expansion, private tournaments, public matchmaking, leagues/leaderboards, new variants/seat counts, monetization, account linking, navigation redesign, full AI rewrite, A4 room scorecard (first to cut; core must stabilize first).
