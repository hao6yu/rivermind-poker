# Slice 3.11 — GLM round 2: verified multiplayer integration

Prepared: 2026-08-31. This is a self-contained instruction for a new implementation session, not a release approval.

## Goal

Take over the existing Slice 3.11 hardening branch. Close the five independently identified blockers below, finish the related human-seat lifecycle and UI paths, and deliver a review-ready candidate proven through the real mobile service → authenticated HTTP → Edge worker → database → coordinator → projection → client parser → UI chain.

Preserve the working Slice 3.11 implementation. This assignment is to implement and verify fixes, not merely explain the findings, restart the slice, or redesign the approved product.

If your agent supports tracked goals, create a goal with that objective for this session. Do not invent a token budget. Keep a checkpoint plan and update it using actual evidence.

**This session's completion condition:** R1–R5 and the required adjacent checks are closed with durable regressions; mandatory local gates pass; affected UI is reachable and localized; the full hardening diff is reviewed; and the release record accurately distinguishes tested behavior from pending device/release checks. A missing mandatory local gate means the hardening goal is still incomplete, not “passed with documentation.”

Full Slice 3.11/release approval is a separate, stricter claim: it requires every original physical-device, accessibility, localization, performance, and release gate. Do not claim that while any required gate remains unrun.

## Starting state — preserve it

Repository: `/Users/haoyu/development/rivermind-poker`.

At handoff, the checked-out feature branch is `codex/slice-3.11-integration-hardening`, HEAD `65ff12e3`.

Existing hardening commits, oldest first:

| Commit | Work already attempted |
| --- | --- |
| `637a1add` | Edge boot, request contracts, protocol negotiation |
| `b42dce47` | Lifecycle state across persistence, projections, HTTP, client parsing |
| `873b6d40` | Ledger-authoritative rebuys, deal exclusion, expiry |
| `e9e0562f` | Lifecycle UI/copy, late rebuy, settled-hand stats, scheduler |
| `0745a6e4` | Independent expiry transitions, enforced folds, lifecycle defaults |
| `65ff12e3` | Legacy normalization and protocol tests |

The earlier handoff is committed as `cca39caa`; the original Slice 3.11 delivery ends at `fd119229`.

Existing uncommitted implementation work at handoff:

```text
 M supabase/functions/multiplayer-room/contract.test.ts
 M supabase/functions/multiplayer-room/contract.ts
 M supabase/functions/multiplayer-room/index.ts
?? src/services/__tests__/multiplayerLifecycleHttp.test.ts
```

This new goal document may also be uncommitted. Inspect the actual status, diff, and history before editing. If HEAD has advanced, identify the intervening changes and recheck each finding against the new state. Do not reset to the reviewed commit, discard unfinished work, bulk-stage unrelated changes, rewrite history, or recreate the branch from `fd119229`. A new agent session does not require a new branch; continue this feature branch after confirming no other session is editing it.

Scope/reading order:

1. Applicable `AGENTS.md` and available Supabase instructions.
2. This document in full.
3. `docs/PHASE_16_SLICE_3_11_SCOPE.md` in full: this remains the approved product contract, particularly 3.11E/F and automated/manual acceptance.
4. `docs/PHASE_16_SLICE_3_11_GLM_HARDENING_HANDOFF.md` in full: H01–H09 remain a closure checklist. This round updates the evidence; it does not silently waive earlier requirements.
5. `docs/PHASE_16_SLICE_3_11_RELEASE_RECORD.md`: verify its claims. Its old “complete,” “environment-blocked,” and capability-negotiation statements are not current proof.
6. The original screenshot references under `docs/assets/phase16-slice-3.11/` before changing their corresponding UI.

## Evidence to start from

The preceding independent review tested `65ff12e3` plus the listed unfinished changes:

- `pnpm typecheck` passed.
- Selected suites: 6 files, **129 tests passed / 2 failed**. This was not a full-suite pass.
- The real local Edge worker booted and an authenticated create returned **201**, protocol 3. The earlier worker-import blocker has made genuine progress.
- Creating with a host Play record and then joining returned **409 `room_stale`**.
- The HTTP old-protocol test expected **426 update required**, but received **400 invalid request**.
- Direct diagnostic probes reproduced the missing-client-protocol rejection, premature post-rebuy completion, legacy balance replacement, and departed-user viewer access described below.
- These probes were in-memory diagnostics, not committed regression tests. Turn them into durable tests. The real HTTP harness also has defects that must be repaired before trusting its coverage.

Do not attribute these historical test counts to your final revision. The handoff preparation rechecked source and Git state; it did not rerun the suite.

## Required fixes

### R1 — The real client cannot use the new protocol

**Confirmed boundary:** `src/services/multiplayer.ts` creates/joins without a `protocol` field. The new `supabase/functions/multiplayer-room/contract.ts` requires an exact current-protocol declaration. Both ordinary app payloads are therefore rejected before reaching the coordinator.

There are also inconsistent create-field names: the app supplies `playRecord`, while the parser expects `hostPlayRecord`. Audit avatar mapping at the same boundary (`avatar` versus `hostAvatar`). In `index.ts`, the friendly 426 capability guard runs after the strict parser has already returned 400; duplicate host-record publication paths remain.

Fix the entire contract, not only a hand-crafted test request:

- Make production service methods declare the supported protocol and existing seat-count capabilities consistently.
- Choose one unambiguous create/join record/avatar wire contract and map the actual client to it. Validate supplied malformed records instead of quietly treating them as absent.
- Remove duplicate/unreachable host publication logic.
- Return a stable update-required response for well-formed incompatible create/join requests before any room, seat, or membership mutation. Malformed input still fails safely.
- Map the error through the real client error handling and all three locales. Keep schema protocol separate from optimistic state revision.

**Acceptance:** test payloads produced by `createMultiplayerTable` and `joinMultiplayerTable`, not just ideal JSON. Prove create/join, host/guest avatar and Play-record retention, and subsequent record updates through authenticated HTTP and the actual client parser. Cover current, missing, older, and future protocols, malformed input, and 2/3/6/9-seat compatibility. Assert rejected joins do not create membership.

### R2 — Host-record creation disagrees with database state revisions

**Confirmed boundary:** publishing a host record with `update-play-record` during create advances canonical `state.version` to 1. The database `multiplayer_create_room` implementation initializes the room/game-state revision to 0. The first join expects canonical version 1 against database version 0 and returns `room_stale`.

Relevant starting points:

- `supabase/functions/multiplayer-room/index.ts`, create/bootstrap path.
- `supabase/migrations/20260812035403_multiplayer_private_rooms.sql`, `multiplayer_create_room`.
- `supabase/migrations/20260814163052_phase_12_multiplayer_trust.sql`, transition commit RPC. Check all later definitions before deciding which function is effective.

Fix initialization atomically so the canonical JSON, persisted revision columns, public snapshot, command history, and first expected-version check agree. Do not hide a deterministic bootstrap mismatch behind generic retries or weaken optimistic concurrency.

**Acceptance:** real create-with-record → join → ready → start, plus create-without-record. Assert matching revisions after creation and each persisted transition. Exercise duplicate delivery and concurrent/stale joins without double mutations. Verify reloads preserve the host record. If SQL changes are needed, use a new reproducible migration and test it locally; editing an already-applied migration alone does not fix existing installations.

### R3 — Auto-deal still uses stale hand stacks after a rebuy

**Confirmed boundary:** rebuys now update the participant ledger while intentionally leaving the completed hand immutable. However, the between-hands `tick` in `src/domain/multiplayer/coordinator.ts` still calls `nextTablePlayers(previous)` to count positive stacks and can complete `last-player-standing` before dealing.

Reproduction: two humans, 20-chip deterministic test stacks, seed 99; settle an all-in; busted human rebuys; tick past `nextHandAtMs`. There are two active funded ledger participants, but the room completes at Hand 1 rather than dealing Hand 2. The small stack is a test fixture, not a new product preset.

Use the authoritative session participant ledger plus lifecycle eligibility for every viability decision. Audit expiry, Sit out, Return, reconnect, `deal-now`, automatic tick, completion, summary/archive, and rematch—not only this one guard. The current hand's dealt-player subset is not the session roster.

**Acceptance:**

- Accepted rebuy → normal automatic tick actually deals the next hand with the accepted 4,000 chips.
- Sit out for one/several hands → late zero-stack rebuy; positive-stack Return next hand; reconnect after omission; at least three bust/rebuy cycles.
- Fewer than two active funded players waits while a human can return; only the host can end that stalled session; hand-limit completion still takes precedence.
- All participant rows, including Left and omitted seats, survive live stats, final standings, and archive.
- At each settled boundary: `rebuyChips = rebuyCount × 4,000`; `totalBuyIn = initialBuyIn + rebuyChips`; `net = settledStack − totalBuyIn`; sum of participant nets is zero. Validate safe integers and preserve settled stats during active betting.
- Cover 2/3/6/9 seats, opening stacks 800/2,000/4,000, deadline races, lost responses, and repeated command ids. Do not mint twice or allow positive-stack top-ups.

### R4 — Legacy normalization invents balances and history

**Confirmed boundary:** `supabase/functions/multiplayer-room/stateContract.ts` fills a missing/invalid ledger with every participant's configured opening stack. A legacy settled hand with stacks `[1,990, 2,010, 2,000]` becomes ledger stacks `[2,000, 2,000, 2,000]`. Since new deals use the ledger, this erases real gains/losses and can revive busted seats.

Define and implement a safe legacy policy. If a complete, provable conversion is impossible, refuse continuation with a clear localized incompatibility result. Do not initialize plausible-looking “Even” results, silently reset private-room balances, or silently upgrade unknown protocol/state. A valid conversion must preserve actual settled balances and establish complete accounting; opening stack alone is not evidence.

**Acceptance:** old room without ledger, invalid/missing ledger fields, legacy human AI-control state, unknown lifecycle enum, invalid/future protocol, already-settled uneven balances, busted seats, and in-progress hands. Prove no invented chips, rebuy history, or automated human play. Check normalization → persistence → coordinator → projection → client handling, not only a normalizer unit test. Corrupt current-format data must not be accepted as a legacy default.

The user's authorized fresh start applies only to Championship progression/checkpoints. It is not permission to reset multiplayer balances, personal records, profiles, or other progress.

### R5 — Permanent departure does not revoke private-room access

**Confirmed application gap:** `createMultiplayerViewerProjection` in `src/domain/multiplayer/projection.ts` checks human/user ownership but not permanent departure. Directly leaving and then requesting that user's projection still succeeds.

**Confirmed database source gap:** the transition RPC rebuilds memberships for all human seats, including Left ones. The resume query's older offline-plus-AI tombstone exclusion does not cover a Left human with `control = human`. Command rejection alone is not read-access revocation. The full HTTP/RLS consequences still need explicit tests; do not describe them as already tested.

Make effective permanent Leave retire the seat and revoke current-room read/recovery authority without deleting its settlement/ledger identity. Enforce the same policy at sync/resume, membership persistence, Data API/RLS, Realtime delivery, private avatar access, and room-private Play-record access. Define and test the already-all-in settlement boundary exactly as the approved scope specifies. Do not pretend already-delivered/cached data can be recalled; verify no newly authorized private data is available after revocation, and examine existing subscription/signed-URL behavior honestly.

**Acceptance:** current actor, not-current actor, between hands, and already-all-in departure. The former member cannot sync/resume/rejoin/retry the running session by code, old session, fresh client, host assistance, or alternate command. Current members still see the departed ledger row and normal settlement. Cross-room/non-member reads fail. Recoverable disconnection retains only the original owner's recovery rights. A new/rematch session may seat the former participant through the proper new seating flow.

## Required adjacent checks — investigate, then fix or prove safe

These are related review observations, not five additional proven end-to-end failures. Record each disposition and exact test:

1. **Explicit leave and forced folds:** the ordinary fold API may reject Fold when Check is free. Use legal forced-departure semantics; test out-of-turn departure and all-in settlement. Verify `applyEnforcedFold` does not mutate its input players/history/board if it follows the immutable engine API.
2. **All humans offline:** pause/resume must not erase the original turn deadline or grant a new turn budget. Timeout folds once; no check/call/bet/raise or AI control for a human. Do not deal disconnected or sitting-out seats.
3. **Reachable return and host-end UI:** prove positive-stack Return next hand, late Rebuy, Retry connection, waiting, and host-only end-stalled-session work from visible controls through HTTP. Reconnect toggling is not a substitute for a Return action. Preserve sheet focus and active-turn safety.
4. **All-participant final results:** inspect any summary/archive loop over `hand.tablePlayerIds`. The last hand may omit departed or sitting-out participants whose ledger entries must remain in results.
5. **Strict contracts:** invalid lifecycle enums and inconsistent/unsafe ledger facts must fail safely, not become active, missing, zero, or Even. Preserve deadlines, completion reasons, new transitions, and immutable ownership through every round trip.
6. **Localization:** `multiplayer.game.exitDetail` still contains English `rematch` in both Chinese locales. Fix readable en/zh-Hans/zh-Hant wording and accessibility labels together; audit all changed error, lifecycle, profile, and stats copy. Retain the truthful complete/capped/partial/mixed Play-record semantics from Slice 3.9.
7. **Profile publication:** create/join/recovery/settlement/foreground publish only the owner's bounded record, with monotonic revisions and no public/cross-room visibility. A tapped human's record must retain the same meaning as Profile, with appropriate observer wording.
8. **Rematch and host transfer:** preserve seat ownership while transferring management; a rematch starts a fresh session ledger and proper seating, not a mid-session replacement. No human is ever converted to authored AI.

Do not stop after R1–R5 if these checks expose broken paths within the same approved integration scope. Conversely, do not broaden into unrelated redesign or unrequested hosted operations.

## Repair the HTTP harness before relying on it

The unfinished `src/services/__tests__/multiplayerLifecycleHttp.test.ts` is useful progress, but currently:

- Its command helper omits required `commandId`.
- It guesses the acting account from the latest response's `viewerPlayerId`, which changes with the requester. Bind stable player ids to their authenticated test identities.
- It reconstructs a snapshot-only envelope before client parsing, discarding transitions and potentially concealing response-contract defects. Parse the actual complete response.
- It catches arbitrary action failures and treats them as normal hand completion. Unexpected HTTP/domain errors must fail with safe diagnostics.
- It assumes an all-in guarantees a bust; tied hands need a bounded, valid deterministic scenario or a sound retry sequence, not weakened assertions.
- It attempts Sit out immediately after a successful rebuy, although the current Sit-out command is for a pending decision. Set up the intended legal state; do not change product rules to fit the test.
- Its project-root calculation, hardcoded tool paths, unauthenticated readiness probe, and forced runtime removal need correction. A readiness probe receiving 401 does not prove the worker is absent.
- Its failure diagnostics may print Supabase status environment output. Never log keys/tokens or raw secret-bearing status output.

Make local integration an explicit, documented invocation. Keep fast unit tests usable without Supabase, while ensuring the required integration command fails—not silently skips—when its prerequisites are missing. Reuse a verified compatible worker or own an isolated local runtime. Never kill another session's runtime, reset the whole database, or remove unrelated test data. Clean up only exact disposable users/rooms/processes created by this run.

## Commit checkpoints

Continue on the feature branch. Each checkpoint includes implementation, fail-before/pass-after regressions, and relevant translations. Keep cross-layer fixes atomic; explain any necessary regrouping.

| Checkpoint | Required outcome |
| --- | --- |
| A — Actual client and bootstrap | R1/R2 closed; production service payloads work; coherent persisted revisions; meaningful compatibility errors |
| B — Safe legacy and contract boundary | R4 closed; strict, tested old/invalid-state policy without invented balances |
| C — Ledger-driven lifecycle | R3 closed; real auto-deal, return, waiting, repeated rebuys, correct deadlines and all-participant results |
| D — Permanent leave and privacy | R5 closed across coordinator, HTTP, database membership/RLS and room-private reads; disconnect recovery remains safe |
| E — Reachable UI and localization | Return/rebuy/retry/host-end and record/stats paths verified; all three locales; turn/focus safety |
| F — Integrated evidence | Correct harness, complete local gates, full-diff review, corrected release record, final handoff |

Commit only inspected task files. No merge, push, production deployment, TestFlight submission, or device installation is authorized by this instruction. Local disposable integration data, migrations, build artifacts, and available simulator checks are in scope. Hosted changes or unavailable physical-device coordination require separate authorization.

## Verification and QA

### Environment

Use the repo's Node requirement (`>=22.19.0`), not the shell's old Node 16. A known working Mac runtime is:

```sh
export PATH="/Users/haoyu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH"
node --version
pnpm --version
command -v supabase
supabase --version
```

Supabase CLI 2.116.0 was available at `/usr/local/bin/supabase` during review. Recheck PATH, Docker, project identity, migrations, and worker ownership before declaring a blocker. Follow available Supabase skills, consult current relevant docs before implementation, and discover CLI commands through `--help`. No hosted project access is needed to reproduce the five blockers.

### Mandatory local gates

1. `pnpm typecheck`, plus an appropriate actual Edge-runtime type/import check: root `tsconfig.json` excludes the functions directory.
2. Focused coordinator, engine, request, normalization, projection, client service/parser, archive/summary, UI, and localization regressions. Existing starting suites include `src/domain/multiplayer/coordinator.test.ts`, `src/services/multiplayerContract.test.ts`, and `supabase/functions/multiplayer-room/{contract,stateContract}.test.ts`.
3. Full `pnpm test`. Report every failure; a suspected baseline flake needs controlled baseline/isolation evidence, not an unqualified green claim.
4. Exact `pnpm verify:multiplayer-edge` and the repaired, explicitly invoked real authenticated lifecycle integration harness. The original smoke alone does not exercise all new features.
5. Local database/RLS/avatar/record authorization tests with disposable identities, including member → effective Left revocation and cross-room attempts. Check targets before invoking scripts that read `.env`; do not accidentally run hosted writes.
6. `pnpm verify:release-config`, `pnpm verify:mobile-secrets`, and `git diff --check`.
7. iOS and Android production-mode exports using the repository's release configuration, without initiating paid/cloud builds or publishing. Record exact commands/configuration; a JS export is not a signed native build.
8. Full hardening-diff review, including committed work since `fd119229` and unfinished changes incorporated here. Explicitly label self-review; do not invent an independent/adversarial reviewer.

The real HTTP suite must cover create/join/ready/start, owner records, settlement, repeated rebuy, automatic next hand, Sit out/late return, disconnect/retry/deadline, permanent Leave, host-end, final summary, stale/duplicate commands, negative authorization, and incompatible clients. Exercise reloads and both clients' actual parsing/convergence. Keep test-only determinism isolated from production authority; never add a public seed/clock/stack override to make tests easy.

For each R finding, demonstrate the named failure before the fix and passing behavior after it. Use a preserved baseline/worktree or captured repeatable failure without disturbing shared work. If the finding was already fixed by an intervening commit, prove that and cite the exact regression rather than reimplementing it.

### UI, simulator, and physical QA

Run available UI/simulator checks for affected screens in both orientations and all three locales, including dark/light mode, supported text sizes, 2/3/6/9-seat private tables, profile/Stats sheets, and action safety. Use the original scope and screenshots for expected layout; geometry/unit tests alone are not visual verification.

Keep these original release gates explicit when unavailable: two physical devices for repeated rebuy/disconnect/reconnect/Leave/ledger convergence; real iPhone photo intake/crop; VoiceOver/focus; the full table-family/localization matrix; sustained nine-seat all-Nemesis performance; signing/distribution QA. Record the exact missing prerequisite and next action. Do not waive them or deploy to obtain them without authorization.

## Final deliverables and honest status

Update `docs/PHASE_16_SLICE_3_11_RELEASE_RECORD.md` with:

- Starting and final tested commit/branch; focused commit map; exact remaining dirty files, if any.
- R1–R5 and H01–H09 closure tables: root cause, boundary fixed, regression name, fail-before/pass-after evidence, commit. Distinguish proved fixes from observations still under investigation.
- Adjacent findings and their resolved/tested disposition.
- Exact command lines, versions, exit codes, test counts, HTTP outcomes, export results, and evidence paths. Label historical evidence separately; do not leak credentials.
- Protocol/legacy policy and any required migration-first deployment ordering. Record the procedure without performing a hosted rollout.
- Local automation, UI/simulator, physical-device, signing, and release status as separate passed/failed/not-run items.

End with one of these outcomes:

- **Hardening verified locally; physical-device/release QA pending.** Only if all mandatory local work above actually passes. This can complete this narrowly defined hardening goal, but not full Slice 3.11 release approval.
- **Hardening incomplete.** List remaining reproducible defects or genuinely unavailable mandatory local gates, with the next concrete action. Do not mark the goal achieved.
- **Full Slice 3.11 release gates passed.** Only if all original acceptance requirements were actually verified for the exact candidate; no inherited completion claim or test total substitutes for that evidence.

Keep progress reports concise and concrete. Continue through the checkpoint plan while safe in-scope work remains. If new authority or an essential product choice is required, explain the exact blocker and ask; do not silently relax the scope.
