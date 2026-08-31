# Slice 3.11 — Qwen follow-up: settlement, disconnects, and reachable controls

Prepared: 2026-08-31. Assignment for a fresh implementation session.

## Goal

Fix the five remaining integration defects Q1–Q5 below, preserve the successful Slice 3.11 work, and produce a review-ready feature branch backed by failing-before/passing-after regressions, real local database/HTTP coverage, and verification of the actual affected UI.

This is an implementation-and-verification task, not a request for another plan or a defense of the previous completion report. Follow the checkpoint plan through completion while safe in-scope work remains. If your agent supports tracked goals, create one for this objective; do not invent a token budget.

**Done for this assignment:** Q1–Q5 and their required regressions are closed; mandatory local gates pass; changed visible/accessibility wording is complete in en, zh-Hans, and zh-Hant; and the release record accurately states what was and was not verified. Passing existing tests alone does not close these findings.

This goal is not authorization to merge, push, deploy, publish, install on a device, or reset user data. Full Slice 3.11 release approval still requires the original device/performance/accessibility/distribution gates.

## Starting point and branch isolation

- Repository: `/Users/haoyu/development/rivermind-poker`.
- Reviewed branch: `codex/slice-3.11-integration-hardening`.
- Reviewed HEAD: `b6f123f8`. The preceding reported final tested revision was `c90e3b75`; the later commit changes the release record only.
- The tree was clean before this handoff document was added. This Markdown file may be uncommitted when you begin.
- Inspect `git status`, the latest log, and all existing diffs first. If the code has advanced, identify the new baseline and recheck each finding rather than resetting it.
- Create `codex/slice-3.11-qwen-followup` from the reviewed HEAD (or the explicitly recorded newer starting point), carrying this handoff document. If that branch already exists, inspect and resume it only when it belongs to this assignment. Do not overwrite it, force checkout, or discard unrelated changes.
- Keep the GLM branch intact so the Qwen implementation can be independently compared. Record the exact starting and final commits. Do not edit the same checkout concurrently with another agent.

Read before coding:

1. Applicable `AGENTS.md` and available Supabase skills/instructions.
2. This document in full.
3. `docs/PHASE_16_SLICE_3_11_SCOPE.md`, especially the complete 3.11E/F requirements, automated acceptance, localization, and release gates.
4. `docs/PHASE_16_SLICE_3_11_RELEASE_RECORD.md`. Treat its completion/closure claims as claims to check, not proof.
5. `docs/PHASE_16_SLICE_3_11_GLM_ROUND_2_GOAL.md` for earlier R1–R5 context. Preserve those fixes; do not restart the original slice.

Original UI references remain under `docs/assets/phase16-slice-3.11/`. Inspect the corresponding images before changing their table/result layouts.

## What the independent review actually established

At `b6f123f8`, the reviewer independently reran:

- `pnpm typecheck`: pass.
- Full `pnpm test`: **164 files / 1,763 tests, all passing**.
- `pnpm verify:release-config`, `pnpm verify:mobile-secrets`, `git diff --check`: pass.

Despite that green baseline, direct coordinator/presentation probes and read-only checks against the local database reproduced Q1–Q3 and demonstrated the Q5 branch condition. Q4 was traced through the production transport and timeout code, with a coordinator probe showing the consequence of the missing offline signal. It was not tested by physically disconnecting a phone.

The preceding GLM report additionally claims a 10-test HTTP suite, 217 pgTAP assertions, Edge smoke, and production JS exports passed. The independent review did not rerun those gates. Its inspection found that the HTTP scenarios are two-player flows and do not cover the missed 7–9-human settlement, omitted-seat subsequent settlement, real transport disappearance, or rendered host-end path.

The diagnostic probes were not added as project tests. Add durable regressions for them. Historical pass counts must not be presented as evidence for your final revision.

## Q1 — P1: settlement still has a six-human archive ceiling

### Evidence and cause

`supabase/migrations/20260901000200_multiplayer_left_seat_revocation.sql`, approximately lines 58–61, replaces `public.multiplayer_commit_transition_v2` but retains:

```sql
jsonb_array_length(p_hand_archives) > 6
```

The Edge worker emits one personalized archive for each participating human. A hand with 7, 8, or 9 humans therefore fails settlement even though a nine-seat table can be created and played. The local RPC rejected a seven-element collection with `Invalid multiplayer transition collections.` before any room mutation. Its failure maps to HTTP 503 in the worker.

### Required fix and proof

- Support the approved maximum of nine occupied seats and their valid human archives, while retaining bounded payloads, per-viewer authorization, redaction, and duplicate/identity validation.
- Use a new migration for an already-applied database definition. Inspect the latest effective RPC and every related bound before changing it; do not copy an old function and accidentally drop later protections.
- Add local SQL/RPC and real authenticated HTTP regressions for **7, 8, and 9 human participants** in a nine-seat room, plus mixed human/AI tables. Nine seats with only two humans does not test this defect.
- Prove a complete hand commits, each dealt human receives exactly their own valid archive, the next hand can start, and retries do not duplicate archives/actions.
- Preserve rejection of oversized collections, invalid viewers, wrong session/hand ids, and unredacted private cards. Do not remove the bound or weaken the redaction function simply to pass.

## Q2 — P1: a player omitted from a later hand breaks settlement

### Evidence and cause

`archivesForPersistence` in `supabase/functions/multiplayer-room/index.ts` loops over **every human seat**. `createMultiplayerViewerHandArchive` in `src/domain/multiplayer/projection.ts` then produces an archive even if that player was not dealt into the hand.

`private.multiplayer_archive_is_redacted` correctly requires the archive viewer to exist in `hand.players`. The invalid archive makes the entire settlement transaction fail.

Reproduction through the actual coordinator and archive projector:

1. Create a three-human open session with ordinary stacks; finish Hand 1.
2. Disconnect the third human between hands.
3. Deal Hand 2 to the other two humans, then finish it.
4. Generate the third human's archive with the production projector and validate it with the local SQL redaction function.

Observed:

```text
Hand: 2
Dealt players: [p0, p1]
Generated archive viewer: p2
Archive contains viewer: false
SQL archive validation: false
```

### Required fix and proof

- Separate the **session ledger roster** from the **participants entitled to a particular hand archive**. All participants retain ledger/standing rows; only actual hand participants receive that hand's personal archive.
- A person who leaves during a hand they were dealt still retains that own-hand archive after legal settlement. A person omitted from later hands must not be fabricated into those hands or credited with extra played hands.
- Do not delete departed/sitting-out ledger rows, re-deal absent humans, insert fake players, or weaken the SQL viewer/redaction check.
- Cover omitted **disconnected**, **sitting-out**, **busted**, and **Left** humans; one/several omitted hands; late rebuy and positive-stack return; all-in departure; final standings; profile hand counts; and hand-history reads.
- Add a real three-or-more-human HTTP flow that settles the first hand **after** an omission, reloads persisted state, and settles another hand after return. Testing only the initial bust, rebuy acceptance, or direct coordinator result is insufficient.
- Prove unaffected players' archives commit, omitted players' old archives remain available under the established owner policy, and no later private information is newly shared with departed players.

## Q3 — P1: Leave gives the next actor the previous deadline

### Evidence and cause

The active-actor `leave` path in `src/domain/multiplayer/coordinator.ts` calls `applyEnforcedFold` and then `processAutomatedTurns` without clearing the previous actor's deadline. The latter now preserves an existing deadline to support pause/resume.

It also fails to append the leave-induced fold to `transition.actionBatch`, although the canonical hand history grows.

Reproduction: start a three-human hand; have the acting player leave one millisecond before their deadline.

```text
Old actor: p0             New actor: p1
Leave accepted at: 46,599 ms
Old deadline:     46,600 ms
New deadline:     46,600 ms   (only 1 ms for the new actor)
New hand-history actions: 1
Transition action batch: []
```

### Required fix and proof

- Preserve an absolute deadline only when resuming **the same unresolved decision**. A new actor's decision gets its correct new configured budget.
- Publish the forced fold exactly once in canonical history, the transition batch, persisted public actions, and the presentation sequence. Preserve ordering through retries/sync.
- Test current-actor Leave at the beginning, just before, exactly at, and after the deadline; timeout-versus-Leave races; a following human or AI actor; street advancement; out-of-turn departure; all-in departure; and whole-room pause/resume.
- For a permanent leaver who becomes eligible to act later, perform the specified legal departure fold without requesting a decision from that retired seat or invoking AI for it.
- Keep the corrected immutable `applyEnforcedFold` behavior. Do not fix this by universally resetting clocks on reconnect; that would reintroduce the earlier deadline-extension exploit.

## Q4 — P1: real transport loss never reaches canonical disconnect state

### Evidence and cause

Production transport callbacks in `src/features/multiplayer/MultiplayerFlowModal.tsx` update presentation/retry state. The production `set-connection` calls found in this flow only send `online`. The subscription in `src/services/multiplayer.ts` listens to broadcasts, not an authoritative disappearance/expiry mechanism. No server presence-expiry path was found in the reviewed multiplayer worker/migrations.

Consequently, a killed or unreachable client can remain canonically `online`. The coordinator's timeout branch checks when `connection === 'online'` and Check is free. A probe with the server state left unchanged reproduced that Check. Existing tests explicitly sending `set-connection: offline` prove the handler, not that actual connection loss reaches it.

### Required design and implementation

First write a short implementation design covering authoritative liveness, expiry timing, authentication, stale/duplicate signals, reconnect, and deadline preservation. Then implement the smallest complete mechanism within the approved multiplayer architecture.

- Graceful background/disconnect signaling can help, but **cannot be the only solution**: a process kill or network outage cannot reliably send its own final request.
- Establish server-verifiable liveness/expiry for ungraceful loss using an appropriate bounded mechanism. Keep client clocks and a peer/host's unverified claims out of authority over another person's seat.
- Specify how a loss near an action deadline is resolved, including an expired or absent liveness signal. Do not leave an unexplained window where an actually disconnected person is automatically checked/called. If the distinction between connected inactivity and network loss requires a product-rule change, explain it and request direction rather than silently changing timeout behavior.
- Only the authenticated seat owner can renew/recover their seat. Host transfer never grants that owner's cards/actions or identity. Fresh anonymous identities cannot recover an old seat.
- No human is controlled by AI. A disconnected actor's unchanged decision deadline results in one fold; already-all-in hands settle normally. Absent humans receive no new cards. Return/rebuy eligibility begins at a safe hand boundary.
- Reconnect must not refresh an existing action/rebuy deadline, mint chips, resurrect a Left seat, or silently change a resolved Sit-out decision. Preserve the session ledger and correct positive-stack versus zero-stack return behavior.
- Avoid a global public presence/profile table. Any new persisted mechanism needs explicit room/owner authorization, bounded retention, local migration tests, and documented deployment order.

### Required proof

Add a production-path integration test that starts with real authenticated clients, **stops one client's production liveness/transport without directly marking its canonical seat offline**, and lets the production expiry mechanism detect it. Assert both surviving-client and returning-client convergence.

Cover loss before/during/after a turn, free-check/facing-bet decisions, process death, background/foreground, all humans offline, already-all-in, reconnect before/after expiry, host loss, duplicate/stale renewals, spoofing by another member, and permanent Leave versus reconnect. Use controlled clocks/test infrastructure without exposing a public clock/stack/identity override.

A mocked coordinator state or a test that explicitly sends `offline` does not close Q4. Actual two-device network-loss QA remains a release gate even after local integration passes.

## Q5 — P2: the normal result panel hides the host-end action

### Evidence and cause

In `MultiplayerFlowModal.tsx`, `visibleHandResult` is populated whenever the settled hand has an outcome and action animation has drained. The `if (visibleHandResult)` branch around line 2570 returns the result panel before execution reaches the between-hands branch containing `viewerMayEndStalledSession` around line 2689.

A real coordinator bust → Sit out fixture produced:

```text
status = between-hands
stalled = true
resultPresent = true
host = p0
```

The helper correctly says the room is stalled, but the rendered path never reaches the host-end control. Pure eligibility-helper tests do not prove UI reachability.

### Required fix and proof

- Put the host-only end-stalled-session action and its confirmation in the actual visible settled-result path, or consolidate result/lifecycle rendering so it cannot bypass required controls.
- Keep the user's concise result design, readable text, measured portrait/landscape layout, 44-point targets, and localized confirmation/cancel behavior.
- Test the **actual rendered component/control composition**, not another boolean helper: settle → Sit out/expiry → host sees and activates End session → cancel preserves the session → confirm sends the intended HTTP command → final standings appear.
- Non-hosts must not see an enabled host-end action and remain server-denied. Check Return next hand and late Rebuy are also visible through the same settled-result path.
- Include paused/waiting versus pending-decision states, animation completion, double taps, rotation, text scaling, focus restoration, and en/zh-Hans/zh-Hant copy. Do not label a genuinely stalled table merely “countdown paused.”

## Nearby regression checks

These must not be lost while fixing Q1–Q5:

- Existing protocol-3 production create/join payloads and host avatar/record mappings work; incompatible clients are refused before membership mutation.
- Create-time canonical/public/database revisions agree; optimistic versioning and command-id idempotency remain enforced.
- Accepted 4,000-chip rebuys survive reload and the automatic next deal, without top-ups or double minting. Maintain `rebuyChips = rebuyCount × 4,000`, `totalBuyIn = initialBuyIn + rebuyChips`, and zero-sum settled net across all participants.
- Omitted players retain their **ledger** without acquiring fake hand history or being misclassified as busted solely because they are absent from `hand.players`.
- Current-room membership, sync/resume, avatar/record access, and new Realtime delivery remain revoked after effective permanent Leave. Account-owned past archives and remaining participants' ledger visibility remain intact.
- Legacy conversion cannot fabricate balances or human AI control. One additional reproduced strictness gap: a legacy-shaped row with `protocolVersion = -1` is currently accepted because every integer below 3 is treated as legacy. Reject invalid versions explicitly and test the intended supported legacy versions.
- All wording/accessibility changes ship in en, zh-Hans, and zh-Hant together. Preserve truthful complete/capped/partial/mixed Play-record semantics from Slice 3.9.

Do not reset Championship or other user progress as part of this bug-fix round. Do not replace the approved UI/table design or rewrite the poker engine wholesale; make the necessary scoped corrections.

## Commit checkpoints

Use focused commits with regressions and localization. Q1/Q2 may share an atomic migration if necessary; explain that grouping. Do not claim a checkpoint closed before its evidence passes.

| Checkpoint | Outcome |
| --- | --- |
| A — Archive capacity and eligibility | Q1/Q2; new migration as needed; 7–9-human and omitted-participant real settlement tests |
| B — Correct departure transitions | Q3; fresh next-actor clock; one authoritative fold; pause/retry behavior preserved |
| C — Real disconnect detection | Q4 design and full production-path liveness/expiry/recovery implementation, authorization, and integration proof |
| D — Reachable lifecycle UI | Q5; rendered host-end/Return/Rebuy flows, confirmation, layout, all locales |
| E — Integrated verification | Adjacent regressions, complete local gates, full-diff review, accurate release record and final handoff |

Record baseline, elapsed implementation/test time, failures discovered, fix commits, and reviewer-required follow-ups honestly. This helps compare Qwen's performance without relying on test counts or report polish.

## Testing and environment

The repo requires Node `>=22.19.0`. On the reviewed Mac, a known working runtime is:

```sh
export PATH="/Users/haoyu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH"
node --version
pnpm --version
command -v supabase
supabase --version
```

The default shell previously selected unsupported Node 16. Supabase CLI 2.116.0 was available at `/usr/local/bin/supabase`. On another host, use its actual supported runtime/tool paths. Check current relevant Supabase docs before changing API/database behavior, and discover CLI options through `--help`.

Required gates for the exact final candidate:

1. Failing-before/passing-after focused regressions for Q1–Q5 and the adjacent checks, including SQL, coordinator, projection/archive, service/parser, transport, rendered UI, and localization.
2. `pnpm typecheck` and appropriate Edge type/import verification. Root TypeScript configuration excludes `supabase/functions`; boot alone is not a full static typecheck.
3. Full `pnpm test` with every failure accounted for. Do not remove failing tests, weaken assertions, raise timeouts indiscriminately, or call a failure a baseline flake without comparative evidence.
4. `pnpm test:multiplayer-integration`, expanded beyond its current two-player cases, through the real worker and database with complete responses passed through the production parser.
5. `pnpm verify:multiplayer-edge` and local SQL/RLS/avatar/moment/deletion tests. Keep fast tests separate from integration, but the explicit integration command must fail clearly if prerequisites are missing, not silently skip.
6. `pnpm verify:release-config`, `pnpm verify:mobile-secrets`, and `git diff --check`.
7. iOS/Android production-mode JS exports using the repo's existing configuration. These are not signed native builds or device evidence. Do not trigger paid/cloud builds or publishing.
8. Available simulator/visual checks of the affected controls in both orientations and three locales. Record exact unavailable prerequisites rather than calling helper tests a visual pass.
9. Review the complete Qwen diff and the earlier GLM code it touches for regressions. Label self-review honestly; do not invent an independent/adversarial reviewer or spawn other agents without authorization.

Read the integration scripts before running them. The current harness may remove this project's Edge runtime when its readiness probe fails; **do not kill another session's runtime** or assume it belongs to you. Reuse a verified compatible runtime or create an isolated one you own. Other local Supabase projects exist and are out of scope.

Local disposable users/rooms, local migrations, tests, and build artifacts are authorized. Cleanup must target only the exact objects/processes created by your run. Never reset the entire local database or modify hosted data. Never log Supabase status environment output, service keys, tokens, credentials, or signed avatar URLs.

Physical two-device convergence, real iPhone photo intake, VoiceOver/TalkBack, sustained nine-seat all-Nemesis performance, signing/TestFlight, and hosted rollout remain original release requirements. Run only what is available and authorized; report the rest explicitly. Do not waive them or declare full Slice 3.11 complete.

## Final handoff

Update `docs/PHASE_16_SLICE_3_11_RELEASE_RECORD.md` with the new evidence, correcting closure claims invalidated by these findings without erasing historical context. Verify recorded hashes against Git rather than copying the existing stale docs-only hash.

Deliver:

- Starting/final commit, feature branch, checkpoint commits, and exact working-tree status.
- Q1–Q5 closure table: root cause, files/boundaries fixed, regression names, fail-before/pass-after outcomes, and commit.
- Additional findings and their disposition, including invalid legacy protocols.
- Exact test/export commands, versions, exit codes, counts, evidence locations, and which tests exercise real HTTP/SQL/rendered UI rather than helpers.
- Liveness/expiry design, protocol implications, migration-first deployment order, authorization guarantees, and any remaining limitations. Record rollout instructions without performing a hosted rollout.
- Separate automated, simulator/visual, physical-device, signing, and hosted-release statuses.

Valid outcomes are **“Qwen follow-up verified locally; device/release QA pending”** only after every mandatory local requirement passes, or **“Follow-up incomplete”** with remaining failures/blockers and concrete next actions. Neither outcome is full release approval. Do not mark a tracked goal achieved while a required fix or local gate remains incomplete.
