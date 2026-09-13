# v1.3 follow-up review — 2026-09-11

**The two original P1 fixes are present and their component regressions pass. Three issues remain before the remediation can be called complete.** This reviews the updated working tree on `23a2ee64`; no application code was changed by this review.

## Verified improvements

- `AppShell` keys both table screens by `tableRunId`, advances it in the table-start callbacks, and clears a previous Championship moment before starting a Championship run. The changed-seat crash and same-seat false-completion component checks now pass with distinct run keys.
- Championship outcome overlays now wait for `handEnding.presentedOutcome`. The live component regression confirms settlement happens first, with the action bubble visible and the overlay/banner absent until presentation completes.
- Both screens consume `presentedBoardCount` and disable continuation through the terminal sequence.
- Independently verified the hook resets when the **same mounted instance** receives a new session ID at hand 1, and replays an interrupted terminal action after **actually unmounting** the previous instance.
- HUD participation, chips-in-play ranking, and shared ties are implemented; the relevant tests pass.
- The simulation now supplies `event.aiDifficulty` when constructing the table; its roster assertion passes. The C2 results are correctly marked invalidated. This verifies construction, not the new difficulty baseline.
- The reward card now uses `championshipAchievementDisplay`; the result caption and rebuy disclosure are localized.

## Remaining findings

### 1. P2 — Complete ledgers do not establish mixed-version compatibility

Location: `src/domain/multiplayer/sessionSummary.ts:36–38`.

`ledgersComplete && rebuyHappened` checks available data, not which ranking algorithm clients understand. The pre-v1.3 implementation at HEAD already reads the complete ledger but always sorts by final stack. Server-created human seats also receive ledger entries regardless of client version. Therefore, a fully ledgered room can still contain clients that use different ranking rules.

Reproduced against the actual previous implementation extracted from Git, using the same session snapshot for both:

| Player | Final stack | Total buy-in | Net |
| --- | ---: | ---: | ---: |
| A | 3,500 | 4,000 | −500 |
| B | 2,500 | 2,000 | +500 |

The previous client selects **A**; the new client selects **B**. Every seat has a ledger and one rebuy occurred, so the new guard does not prevent disagreement. Exact public-binary provenance remains the separate C1 open item; this reproduction directly compares the repository's pre-v1.3 and proposed algorithms.

Retain the old rule for sessions that older clients can join, or introduce a real session/protocol capability boundary and enforce compatible participation. Merely adding a field that old clients ignore would not fix this. The rebuy-only disclosure also reaches only the rebuying player; disclose the agreed session rule to every participant before play. Correct the comments and proposal claiming clients cannot disagree by construction.

### 2. P2 — Some outcome surfaces still bypass the hand-ending boundary

Locations: `src/features/table/MultiwayPokerTableScreen.tsx:689–690,1554`; `src/features/table/PokerTableScreen.tsx:318–319,1050–1051,1137–1138`; `src/features/table/useHandEndingPresentation.ts:250–252`.

Two independently checked cases remain:

- **Early elimination labels:** the real multiway screen still passes raw `game.street === 'complete'` and settled player state to seats. Reproduced a terminal all-in with the final action visible and the result banner hidden: two `Out` labels were already rendered. Heads-up badges also use raw outcome/zero-stack checks. These reveal the result ahead of the intended sequence even though the new large outcome overlay is correctly delayed.
- **First-commit card reveal:** before the hook's effect engages the terminal plan, `showdownRevealed` falls back to `outcome.showdown`, and both screens additionally allow revelation whenever `isTerminalSequence` is false. A layout-effect probe confirms the first committed terminal render permits opponent-card revelation; the subsequent action-step render hides them again. This establishes an ungated commit; the visibility of a flash on a particular native device still needs device verification.

Use presentation state for every result-dependent seat/card surface, including the first terminal render. Cover elimination labels and card visibility in the actual screens, in addition to the banner/overlay/board checks.

### 3. P2 — Resuming during showdown gives feedback and visuals different timing

Location: `src/features/table/handEndingPresentation.ts:121–132`, consumed by `useHandEndingPresentation.ts:179` and the screens' result-feedback effects.

Reproduced: let the final action's 1,000 ms window finish, unmount during the unfinished showdown, then remount using the live-written cursor. The hook resumes a 900 ms showdown window and reports `presentedOutcome: false`, but `resultDelayMsRef.current` is **0**. The plan only includes the showdown duration in its result delay when an action/runout preceded it. Consequently the feedback schedule is inconsistent with the still-running visual sequence.

Distinguish a fully presented restore from an interrupted showdown when calculating the plan, or trigger result feedback from the actual result step. Add interruption tests for runout/showdown, not only interruption inside the action window. The mismatch was reproduced in the hook/controller; physical haptic behavior was not tested here.

## Regression coverage corrections

These do not invalidate the fixes verified above, but they weaken the claim that all production regressions are protected:

- The permanent same-hand session-reset test creates a fresh renderer at `handEndingPresentation.integration.test.tsx:325–334`. That does not exercise resetting an existing hook. My independent test updates the same renderer and passes.
- The permanent interruption test creates another renderer without first unmounting the original one (`274`). Its old timers remain active. My independent test actually unmounts and also passes the action-window case.
- The run-navigation screen tests supply the key in their own `RunHarness`. They protect keyed-screen behavior, but cannot detect accidentally removing the key or increment from `AppShell`. Add coverage that executes the real shell wiring.

## Verification

- Both app and backend typechecks passed.
- **365 existing tests passed**: 173 focused gameplay/navigation/multiplayer tests, 191 localization/inventory tests, and the one roster/parity test. The two previous full-suite failures are covered by these passing runs.
- Additional independent checks: two lifecycle cases passed; four assertions reproduced the three remaining findings (mixed-version ranking, first-commit reveal, resumed-showdown timing, and early `Out` labels).
- I did not rerun the full heavy suite or the hour-long C2 calibration. The reported three full-suite timeouts still need a clean controlled run. In particular, `championshipSimulation.ts` changed and is exercised by calibration tests, so blanket attribution of calibration failures to unrelated unchanged code is not supported.
- The C2 rerun, unfinished A2 two-client legs/recovery investigations, and refreshed D2 captures remain open. No production multiplayer commands or device actions were performed in this review.

Reproduction sources and outputs are under `artifacts/reviews/v1.3/followup/`. The temporary tests and previous implementation copy were removed from `src` afterwards. To reproduce, copy `followup-tests.tsx` to `src/features/table/__v13_followup_review.test.tsx`, `previous-summary.ts` to `src/domain/multiplayer/__v13_review_old_summary.ts`, and optionally `followup-screen-tests.tsx` to `src/features/table/__v13_followup_screen.test.tsx`; run those tests with Vitest, then remove the temporary copies. The screen-specific added test is named `review: keeps settled elimination and payout labels hidden during the final action`.
