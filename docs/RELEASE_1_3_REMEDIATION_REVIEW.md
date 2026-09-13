# v1.3 remediation review — 2026-09-13

**Latest status: the final board-presentation P2 is fixed and independently verified.** The findings below preserve the original review and its failing evidence. This review examined the working tree at `23a2ee64`; no application code was changed by the reviewer.

## Round 3 closure verification

- The hook now initializes its board boundary from the matching unfinished session/hand cursor before the first render. The permanent interruption tests capture the first commit, and saved review artifacts are excluded from default Vitest discovery.
- The original, unchanged `board-first-commit.test.tsx` was copied into `src` and rerun against the fix: **1 passed**. Its new output is saved as `artifacts/reviews/v1.3/round3/board-first-commit-fixed.log`; the temporary source copy was removed.
- The four focused presentation/planner/real-screen regression files passed: **27 tests**. Both app and backend typechecks passed.
- The implementation agent reports a fresh controlled full suite of **2,476 passed, zero failed, six skipped**. This closure check did not repeat the full suite; the earlier independent controlled full-suite result remains recorded below.
- All reported code-review findings are closed. The AI calibration, multiplayer/recovery, refreshed device captures, and actual Next-event navigation checks below remain open; this is not release sign-off.

## Confirmed fixes and scope decision

- Keep final-stack standings in v1.3. The current summary and the actual previous implementation now agree on the review's rebuy snapshot; `rankedByNet` is always false. Net deltas remain display data. This fits the release's focus on existing private tables without introducing a new client compatibility boundary.
- Early `Out` labels and first-commit opponent-card revelation are gated. The previous hook and real-screen reproductions now pass.
- An interrupted showdown retains its reading window and matching result-feedback delay. A fully presented restore still fast-forwards.
- The permanent lifecycle tests now update the same mounted hook for session changes and actually unmount before interruption recovery. The new runout tests verify the replay state after effects finish.

## Original code finding — now closed

### P2 — Restore the saved board boundary before the first committed render

Location: `src/features/table/useHandEndingPresentation.ts:79`, with cursor adoption deferred until lines 107–115.

Reproduced with the live-written cursor: start a preflop all-in, interrupt the final AI action after 100 ms, unmount, and restore the same session/hand with the settled engine board of five cards. The cursor correctly contains `boardCountBefore: 0`, but the new hook initializes its ref from the settled `boardCount: 5`. It only adopts the cursor inside a passive effect. A layout-effect probe records these consecutive commits before any replay timer advances:

```text
{ boardCount: 5, presentingAction: false }
{ boardCount: 0, presentingAction: true }
```

Both screens render the board through this value, so their board gate permits the complete runout in the first committed restore render, then hides it while replaying the final action. This establishes an ungated commit; whether a visible flash occurs on a given native device still needs device verification.

Initialize or derive the first-render board boundary from the matching unfinished session/hand cursor, preserving the live-board behavior for unrelated or fully presented hands. Extend the interruption regression to record every commit, including the first one: assertions only after `act()` miss this case.

Reproduction: copy `artifacts/reviews/v1.3/round3/board-first-commit.test.tsx` to `src/features/table/__v13_round3_board_commit.test.tsx`, run that file with Vitest, then remove the temporary copy. Source and failing output are saved together. The test uses an actual unmount and the cursor written by the hook, without manually fabricating it.

## Independent verification

- `pnpm vitest run --maxWorkers=2`: **2,487 passed, 0 failed, 6 skipped** in 207.80 seconds. This includes **2,476 application tests plus 11 temporary checks from the previous review**, reproducing the reported clean application-suite result.
- The 11 previous review checks also pass in a separate focused run.
- The additional first-commit board regression was run separately after the full suite completed: **1 failed**, as described above. It was not part of the full-suite result.
- Both app and backend typechecks pass after removing the temporary source fixtures. `git diff --check` is clean.
- Logs and the new reproduction are under `artifacts/reviews/v1.3/round3/`; all temporary review files were removed from `src`.

## Remaining release checks

- **C2:** rerun the corrected event-roster calibration and evaluate the difficulty targets against it. The withdrawn baseline cannot establish Undertow difficulty; the v1.2 public-binary attribution and live fallback-frequency checks in C1 remain separate open items.
- **A2:** complete the two-client pause/resume, completion/rematch, and rebuy legs. The recorded recovery findings also need resolution or explicit triage, particularly stale multiplayer recovery blocking local play and the dead Continue/relaunch cases. Missing infrastructure does not close those findings. No multiplayer or device checks were rerun in this review.
- **D2:** refresh device captures after the presentation fixes.
- **Actual shell navigation:** the missing AppShell test remains a coverage gap. A device/e2e test of the real completed-event → Next event → fresh run path is an acceptable replacement for a hanging unit mount. Exercise both changed and unchanged seat counts; confirm a fresh hand starts and no prior completion is awarded. The keyed-screen harness alone cannot verify AppShell's key and callback wiring.

No additional feature expansion is needed for this release. Gather the release evidence above and resolve any failures it reveals.
