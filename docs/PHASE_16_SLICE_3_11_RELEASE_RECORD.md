# Phase 16 Slice 3.11 — Release Verification Record

Slice: Profile, Play Hub, Table Experience, and Championship Expansion
Scope of record: `docs/PHASE_16_SLICE_3_11_SCOPE.md`

## Current status — Round 4 liveness closure

- Branch: `codex/slice-3.11-liveness-closure`, based on Qwen's clean
  `94784c74`.
- Final code commit: `ff69302f`; checkpoint A is `c748d349`.
- Outcome: **merged and database migrations verified hosted; Edge/client,
  physical-device, and signed-release QA pending.** PR #74 merged at
  `39633d5f`; no Edge Function or client build was deployed.
- Request capability is now **4**, while canonical/public snapshot format
  remains **3**. Older live clients are explicitly refused, not silently
  admitted and then treated as disconnected.
- The Round-4 section below and
  [Q4 liveness design](PHASE_16_SLICE_3_11_Q4_LIVENESS_DESIGN.md) supersede
  earlier fail-open and mixed-build rollout guidance. Drain older active
  tables and have the matching client ready before a worker cutover.
- Rounds 2 and 3 below are historical evidence, not the current release gate.

## Historical Round-2 status

**Round-2 status (this record replaces the earlier 3.11G claims, which were
written before the Edge worker ever booted and described capability
negotiation that did not exist; see the correction note at the end).**

- Branch: `codex/slice-3.11-integration-hardening`
- Hardening round 2 starting commit: `65ff12e3` (plus the unfinished dirty
  changes listed in the round-2 goal document)
- Final tested code commit: `c90e3b75` — clean tree at gate time; every gate
  in "Automated gate results" re-ran green on this exact commit. The only
  later commit (`0b373003`) changes this documentation record alone.
- Outcome: **hardening verified locally; physical-device and release QA
  pending.** This is not full Slice 3.11 release approval.
- Round-3 follow-up (reviewed findings Q1–Q5): branch
  `codex/slice-3.11-qwen-followup` from reviewed `b6f123f8`; final code
  commit `6ddf7c5e`. See the Round-3 section at the end of this record.
  Outcome: **Qwen follow-up verified locally; device/release QA pending.**

## Round-2 blockers R1–R5 — closure table

Each row lists the root cause, the boundary fixed, the fail-before evidence,
and the passing regression. Fail-before runs were captured on the starting
state (`65ff12e3` + the handoff dirty files) or by stashing the fix while
keeping the regression.

| Blocker | Root cause | Boundary fixed | Fail-before evidence | Pass-after regression | Commit |
| --- | --- | --- | --- | --- | --- |
| R1 — real client cannot use the new protocol | `createMultiplayerTable`/`joinMultiplayerTable` sent no `protocol` field and used `playRecord`/`avatar` names on create while the parser required `hostPlayRecord`/`hostAvatar`; the parser's own protocol rejection turned the 426 gate into a generic 400 | Pure request builders declare protocol 3 and one unambiguous wire contract; the worker gate (`gateCreateJoinProtocol`) answers 426 `multiplayer_update_required` on the raw body before the strict parse and any mutation; malformed protocol → 400; malformed supplied Play records refused instead of silently dropped; duplicate host-record publication path removed; the client maps the stable code for localized handling | `contract.test.ts` R1 block: 2 failed (production create/join payloads rejected by the production parser) | `contract.test.ts` builder payloads parse with record retention; legacy-shape payloads classify update-required; service tests assert protocol/identity fields and the 426 error mapping; harness proves HTTP 426 with no membership mutation for missing/older/future protocols and 400 for malformed | `4cf7dc89` |
| R2 — create-with-record disagreed with DB revisions | `multiplayer_create_room` hardcoded `state_version = 0` while the host-record publication advanced the canonical state to version 1; the first join compared expected version 1 against the persisted 0 → 409 `room_stale` | Migration `20260901000000` initializes both revision columns from the submitted canonical version (0 or 1; garbage refused) | Harness: every create-with-record → join answered `HTTP 409 room_stale`; create-without-record passed | Harness asserts create snapshot version 1 equals the persisted `state_version`, join succeeds, records retained for both clients; create-without-record boots at revision 0 | `4cf7dc89` |
| R3 — auto-deal used stale hand stacks after a rebuy | Between-hands tick counted the settled hand's players/stacks (`nextTablePlayers(previous)`), so a due tick completed `last-player-standing` although the ledger held an accepted 4,000-chip rebuy | All viability decisions derive from the ledger + lifecycle (`activeFundedCount`, `humanCanReturnToSession`): settle, rebuy, sit-out, tick expiry, tick deal, reconnect-completion guards; a due tick with <2 funded players now waits (host may end the stalled session) | Coordinator repro (2 humans, 20-chip fixture, seed 99): expected `playing`, got `complete` | `coordinator.test.ts` R3 block: next tick deals Hand 2 with the accepted 4,000; sit-out → omitted deal → late rebuy → dealt next hand; positive-stack Return next hand; three seeded bust/rebuy cycles with exact accounting, zero-sum conservation, duplicate-replay no-double-mint, top-up refusal; 2/3-seat coverage with 20/2,000-chip fixtures, 800/4,000 stacks covered by ledger init tests | `54a0f87f` |
| R4 — legacy normalization invented balances and history | A missing/invalid ledger was filled with every seat's opening stack: settled uneven stacks `[4000, 2000, 0]` became `[2000, 2000, 2000]`, reviving busted seats and erasing results | Fail-closed policy: current-format rooms require one fully valid ledger row per seat with exact room-level conservation; legacy rooms convert only when the settled balances are provable (no hand, first hand in progress, or settled hand with conservation); everything else refuses; unknown lifecycle enums, future/invalid protocols, and current-format takeover rows refuse; accepted legacy rooms upgrade to protocol 3 | `stateContract.test.ts` R4 block: 8 failed against the stashed old normalizer (invented stacks, accepted corruption, unupgraded legacy protocol) | R4 block passes: uneven stacks preserved exactly; conservation violations, missing participants, mid-hand-1+ rooms, incoherent legacy ledgers, unknown enums, and future protocols all refuse; round-trip through coordinator → projection → real client parser preserves balances; harness runs a SQL-poisoned corrupted row (stable 409 `room_unsupported_state`) and a rolled-back legacy row through the real worker | `5c0512ec` |
| R5 — permanent departure kept live access | The viewer projection ignored participation, avatar-access counted a Left occupant as a member, and `multiplayer_commit_transition_v2` rebuilt memberships for Left humans — RLS reads, the private Realtime topic, and resume all retained the departed account | Projection refuses a Left viewer (worker 403); avatar-access denies the departed account (disconnected recovery untouched); migration `20260901000200` skips the membership insert for `left` seats and re-anchors archive validation to the submitted canonical seats | Harness: departed member's sync returned 200 | Harness: after leave — sync 403, resume 404, rejoin by code 409, member still sees the Left ledger row; projection/avatar-access unit regressions (departed denied, current members keep reading the departed avatar, disconnected keeps access); coordinator all-in-departure regression (no fabricated action, settled ledger row, every re-entry refused) | `4152a18e` |

Additional persistence defects found by the real-HTTP harness and fixed in
the same round:

- `multiplayer_rooms`/`multiplayer_hand_archives` check constraints predated
  the `host-ended` completion reason — every host-end transition answered 503.
  Migration `20260901000100` widens both (fail-before: end-stalled-session
  503 `room_unavailable` over real HTTP).
- A one-character jsonb operator typo in migration `20260901000200`
  (`archive->>'hand'` instead of `archive->'hand'`) broke EVERY settlement
  commit with SQL 42883 once archives were produced — caught by the harness,
  diagnosed with an instrumented copy of the RPC, fixed before commit.

## H01–H09 closure status (round-1 checklist)

| Item | Status | Evidence |
| --- | --- | --- |
| H01 — worker boot | Closed (round 1, verified this round) | `pnpm verify:multiplayer-edge` passes on the exact worker; harness boots and drives the full lifecycle over HTTP |
| H02 — request contracts | Closed (round 1 + R1) | Contract tests for every new command; production payloads proven by builders |
| H03 — state persistence/client contracts | Closed (round 1) | Round-trip regressions serialize → reload → command → project → parse; deadline preserved exactly |
| H04 — rebuy ledger discard | Closed (round 1, verified) | Ledger invariants asserted at every accepted rebuy and settled boundary (coordinator + harness) |
| H05 — rebuy expiry rollback | Closed (round 1, verified) | Expiry resolves as an independent committed transition; harness exercises sit-out expiry via deadline |
| H06 — sitting out blocks later rebuy | Closed (round 1 + R3) | Late rebuy after sitting out succeeds; omitted seats keep ledger rows; Return next hand added |
| H07 — disconnect behavior | Closed (round 1, verified) | Disconnected seats fold once at expiry (never check/call), are omitted from deals, recover only for the original owner |
| H08 — capability negotiation | Closed (R1) | Exact-protocol gate before mutation; 426/400 matrix unit + HTTP tested; future/invalid persisted protocols refuse (R4) |
| H09 — UI and localized lifecycle copy | Closed (round 1 + E) | Explicit participation states, Return/host-end reachable, exit copy fixed in zh-Hans/zh-Hant; UI logic in tested pure helpers; visual/device pass still pending (below) |

## Adjacent checks — dispositions

1. **Explicit leave and forced folds** — defect found and fixed: the leave
   path used the plain fold API, which refuses folding when checking is free
   (would answer 500); it now uses `applyEnforcedFold`, which itself mutated
   its input (shallow copy shared player objects/history) — now deep-clones.
   Regressions: engine immutability + check-free forced fold
   (`multiwayEngine.test.ts`), coordinator leave-with-free-check, all-in
   departure settlement (`4152a18e`, `0ab84090`).
2. **All humans offline** — defect found and fixed: pausing erased the
   current turn deadline and resuming granted a fresh budget; the deadline is
   now preserved across pause/resume and an expired deadline folds exactly
   once (`0ab84090`, updated coordinator fixture).
3. **Reachable return and host-end UI** — implemented and unit-tested in
   `multiplayerLifecycleUi.ts` + wired in `MultiplayerFlowModal` (`25277f69`);
   HTTP-level flows verified in the harness (rebuy, sit-out, host-end);
   visual/simulator reachability remains a pending device gate.
4. **All-participant final results** — defect found and fixed: final
   standings iterated the last hand's `tablePlayerIds`; they now iterate the
   session roster so omitted/sitting-out/left participants keep their settled
   row (`54a0f87f`).
5. **Strict contracts** — closed by the R4 policy (invalid lifecycle enums,
   inconsistent ledgers, future protocols all fail closed) plus the existing
   client parser strictness; no silent zero/even fallbacks.
6. **Localization** — `multiplayer.game.exitDetail` no longer contains
   untranslated English `rematch` in zh-Hans/zh-Hant; all new lifecycle/error
   keys ship in en/zh-Hans/zh-Hant in the same commit; locale completion and
   Chinese-quality suites pass.
7. **Profile publication** — create/join/settlement/foreground publication
   with monotonic revisions verified (harness retention + no-account-id
   assertions; coordinator stale-revision rejection).
8. **Rematch and host transfer** — covered by existing coordinator regressions
   (deterministic host transfer, fresh session ledger, departed seats seated
   only via a new session) plus the R4 round-trip rematch test.

## Round-2 automated gate results (historical branch state)

Environment: Node v24.19.0 (repo runtime), pnpm 10.30.1, Supabase CLI
2.116.0 (`/usr/local/bin/supabase`), Docker 29.7.2, local Supabase stack
(`rivermind-poker` project only).

| Gate | Command | Result |
| --- | --- | --- |
| Typecheck | `pnpm typecheck` | pass (`tsc --noEmit` clean) |
| Full unit/localization suite | `pnpm test` | pass — **164 files, 1,763 tests, 0 failures** |
| Real-HTTP lifecycle harness | `pnpm test:multiplayer-integration` | pass — **10 tests** (create/join/ready/start, records, settlement, rebuy, reloads, both-client convergence, duplicate/stale commands, protocol refusals, R4 poison/rollback rows, leave revocation, host-end) |
| Edge worker boot/boundaries | `pnpm verify:multiplayer-edge` | pass (exact worker; authenticated smoke + delete-account worker) |
| Edge-runtime type/import check | `pnpm verify:multiplayer-edge` + harness boot | The root tsconfig excludes `supabase/functions`; no standalone `deno` binary exists on this machine, so the applied check is the actual runtime boot + full authenticated exercise of the worker (stronger than a static import check). Not a substitute for a hosted deployment check. |
| Local DB/RLS corpus | `psql -f supabase/tests/*.sql` (pgTAP, local DB) | pass — 25+20+5+39+128 = 217 assertions, 0 failures (includes RLS, moment atomicity, avatar policies, account deletion) |
| Release config | `pnpm verify:release-config` | pass (RiverMind iOS/Android 1.0.0) |
| Mobile secrets | `pnpm verify:mobile-secrets` | pass for tracked source |
| Working tree | `git diff --check` | clean |
| Production JS exports | `npx expo export --platform ios` / `--platform android` | pass (JS bundle + assets emitted). **A JS export is not a signed native build.** |

Harness notes: it reuses a worker already serving the contract boundary,
otherwise resets only this project's edge-runtime container and spawns its own
`supabase functions serve` (stopped afterwards); it creates disposable
anonymous users and deletes exactly those in cleanup; it never prints
`supabase status` output or any credential material. Three migrations were
applied to the local database with `supabase migration up`
(`20260901000000`, `20260901000100`, `20260901000200`).

## Round-2 migration-first ordering (historical; use Round 4 for rollout)

1. Apply `20260901000000` (bootstrap revision) — backward compatible with the
   old worker.
2. Apply `20260901000100` (`host-ended` completion reason) — backward
   compatible; the old worker never sends `host-ended`.
3. Apply `20260901000200` (Left-seat membership revocation + canonical-seat
   archive validation) — backward compatible; the old worker never persists
   `participation = 'left'`.
4. Deploy the new Edge Function build (protocol gate, R1 wire contract,
   R4 normalizer, R5 projection/avatar policy, R3 coordinator).
   Pre-3.11F clients are refused with 426 before any mutation; pre-3.11F
   rooms normalize safely or refuse closed per the R4 policy.

No hosted project was touched; all verification ran against the local stack.

## Pending human verification (device/simulator/release QA) — NOT RUN

These remain real requirements for full Slice 3.11 release approval:

1. **Physical-device matrix**: two devices for repeated
   rebuy/disconnect/reconnect/Leave/ledger convergence; both orientations;
   en/zh-Hans/zh-Hant; dark/light; supported Dynamic Type; 2/3/6/9-seat
   private tables; profile/Stats sheets; turn/focus safety. Missing
   prerequisite: physical devices/simulator QA session.
2. **Real iPhone photo intake/crop** for the avatar editor (HEIC, camera,
   EXIF rotation), per the 3.11B manual matrix.
3. **VoiceOver/TalkBack pass** over the new lifecycle sheets and plaques.
4. **Sustained nine-seat all-Nemesis performance** (frame pacing, latency,
   temperature, battery) on the minimum supported phone.
5. **Signed native builds / distribution QA**: EAS production builds,
   TestFlight submission — not initiated (requires separate authorization;
   the local JS exports above do not substitute).
6. **Hosted verification**: deploying the Edge Function and migrations to the
   hosted project, plus a real-room smoke of the new commands there — not
   performed (no hosted access authorized).

## Correction of the previous record

The earlier record claimed "automated gate results (this exact commit)"
including 1,707 passing tests and described `verify:multiplayer-edge` as
merely environment-blocked, with capability negotiation "satisfied at runtime
by owner-only command gating". That was not current proof: at the reviewed
baseline the exact worker failed to boot for real HTTP use, the production
client payloads were rejected at the request boundary, create-with-record
rooms could not be joined (409), host-ended sessions could not commit (503),
legacy normalization invented balances, and departed members kept read
access. Those claims are superseded by this record; the release gates that
remain are the pending device/release items above.

---

# Round 3 — Qwen follow-up (Q1–Q5) closure record

Scope of round: `docs/PHASE_16_SLICE_3_11_QWEN_FIX_GOAL.md` (reviewed
findings Q1–Q5 + required adjacent regressions against reviewed HEAD
`b6f123f8`). Branch: `codex/slice-3.11-qwen-followup`
(the round-2 branch `codex/slice-3.11-integration-hardening` is untouched).
Commit checkpoints: A `a353b719` (Q1+Q2), B `74a035af` (Q3),
C `278c422a` (Q4 + adjacent settlement rule), D `6ddf7c5e` (Q5 + adjacent
protocol strictness + rendered-UI dev dependency), E = this documentation
commit (record only). Final tested code commit: `6ddf7c5e`.

## Q1–Q5 historical closure table

The Q4 fail-open behavior and implicit compatibility described here were
review findings, not acceptable release behavior. Round 4 replaces both;
Q5's source-text wiring checks are also replaced by rendered composition.

| Finding | Root cause | Boundary fixed | Fail-before evidence | Pass-after regression | Commit |
| --- | --- | --- | --- | --- | --- |
| Q1 — nine-human rooms could never settle | `multiplayer_commit_transition_v2` hard-capped `p_hand_archives` at 6: the seventh human's settlement raised 22023 → HTTP 503 `room_unavailable` | Migration `20260902000000` raises the bound to the approved nine-seat maximum, bounds archives by the submitted canonical human roster, refuses duplicate viewer identities; every existing guard (per-archive seat authorization, redaction, R5 revocation, optimistic version, session monotonicity) preserved | pgTAP `multiplayer_archive_capacity_test.sql`: 6 of 11 assertions failed pre-migration (7/8/9 capacity, roster bound, duplicate, rosterless guards) | pgTAP 11/11 (deterministic ×3 runs); real HTTP: 7-, 8-, 9-human nine-seat rooms settle a full hand with per-viewer archives parsing through the production client parser; 3-human + 6-AI mix archives humans only | `a353b719` |
| Q2 — one omission poisoned every later settlement | The worker built an archive for EVERY human seat while the redaction contract requires the viewer inside the settled hand; the first disconnected/left/sat-out/busted human fabricated a refused archive and EVERY subsequent hand answered 503 | Shared domain builder `multiplayerPersistenceHandArchives()` — exactly one archive per human actually dealt into the settled hand (dropped mid-hand keeps it; omitted seats never get one); worker delegates to it | Unit `archive.test.ts`: buggy baseline fabricated an archive for an omitted player (red) | `archive.test.ts` 4/4; harness "omitted and converges their return" proves ledgers survive omission and the next deal excludes the seat | `a353b719` |
| Q3 — leave folded privately and poisoned the successor's clock | The leave transition used `applyEnforcedFold` without batching the fold into the transition's public action ledger, left `turnDeadlineAtMs` armed (innocent successor inherited an expired clock), and a seat that left while another acted later held a fake unact-able waiting clock | Coordinator: leave batches the enforced fold exactly like a timed fold and clears the deadline before handoff; `processAutomatedTurns` enforces the seat-lifecycle contract — a `left` seat is never an actor; the fold fires the moment its turn would start, same transition, no clock ever armed for it | Coordinator `describe('leave transitions and turn handoff (Q3)')`: 7 tests red pre-fix (private-only fold, expired successor clock, fake waiting clock on departed seats); real HTTP red: tick after leave produced no public fold/no fresh clock | 7/7 coordinator (seeds 311–317); harness: `multiplayer_actions` carries the departing fold and the successor's deadline is a fresh full budget; a left seat never holds a turn when action reaches it | `74a035af` |
| Q4 — sync-only client kept its seat "online" forever | The coordinator trusted the connection the client itself last declared: an absent client's expired turn with a free check got the ONLINE COURTESY CHECK instead of the enforced fold (and stale seats blocked between-hands progress) | Server-observed liveness: migration `20260902000100` (`private.multiplayer_seat_liveness` + service-role-only renew/load RPCs; ownership proved from the DATABASE's canonical seats; `greatest()`-monotonic worker-clock stamps; retention prune); worker dedicated `liveness` operation (404/403/400/503 mapping) + opportunistic renewal on every accepted authenticated touch + tick-time row load (no rows or load failure ⇒ enforcement OFF — pre-liveness rooms byte-identical); coordinator `MULTIPLAYER_LIVENESS_STALE_MS = 15s` with missing==stale, expired-stale-actor ⇒ demote-then-enforced-fold (never the courtesy check), between-hands sweep (demote stale online seats, transfer unusable host, recompute countdown, commit even when not due), renewal NEVER resurrects; client 5s heartbeat (`MULTIPLAYER_LIVENESS_HEARTBEAT_MS`, ratio pinned by test) with owner-command return on a beat that finds the seat disconnected | Coordinator Q4 suite: 6 of 8 red pre-fix (expired free-check seat received `check`); real HTTP red pre-fix: the silent big blind received a courtesy check, no fold, no disconnect | Coordinator 8/8; pgTAP `multiplayer_seat_liveness_test.sql` plan(15) 15/15 ×2 (args/room/expiry P0002, unseated/left/ai/non-array 42501, `greatest()` monotonicity, load rows, retention prune); harness end-to-end: enforced fold + offline/disconnected + exactly ONE public fold action and ZERO checks for the victim, late renewal does not resurrect, owner `set-connection` restores active with the ledger preserved, returned owner is dealt into the next hand; stranger liveness 403 with no row written | `278c422a` |
| Q5 — the settled result panel hid the host-end action | `if (visibleHandResult)` returned the result panel before the between-hands controls could render: with the exact stall shape (between-hands + stalled + resultPresent + host) the host never saw End session; stalled tables were also labelled merely "countdown paused" | Shared `multiplayerSettledControls` module: `MultiplayerHostEndControl` (button + localized confirmation as ONE unit, busy removes the press surface) mounted by BOTH settled branches behind `viewerMayEndStalledSession`; truthful copy via `multiplayerSettledCountdownCopy` — new key `multiplayer.game.waitingForPlayers` (en/zh-Hans/zh-Hant) for stalls, `countdownPaused` only for a genuine pause; Return next hand + late-rebuy card remain in the same settled-result path | Pre-fix HEAD modal: mounts the shared control 0 times, exposes host-end only in the between-hands branch, prints countdownPaused in the result branch (all three pinned red by the structural test against `git show HEAD:` source) | Rendered suite (react-test-renderer + REAL en/zh-Hans/zh-Hant catalogs): label + full confirm/cancel dialog, destructive press dispatches once, cancel never, busy leaves no pressable surface; zh-Hans vs zh-Hant pinned to differ; structural test pins exactly two guarded mounts, one per branch region | `6ddf7c5e` |

## Adjacent regressions closed in this round

1. **Departed-actor fold in the public ledger / fresh successor clock** —
   covered by Q3 (`74a035af`), verified over real HTTP including
   `multiplayer_actions` row-level assertions.
2. **Settlement misclassified an omitted returner as busted** —
   `settleCompletedHand` read `hand.players[id] ?? 0` as "settled to zero",
   so a seat that returned mid-hand after being omitted from the deal was
   flipped active → rebuy-pending → (on due tick) sitting-out with chips it
   never lost. Settlement now only reclassifies seats actually dealt into
   the settled hand. Fail-before: coordinator test red
   (`'rebuy-pending' != 'active'`) with the pre-fix hunk; pass-after: unit
   409 + the full Q4 HTTP return path. (`278c422a`)
3. **`protocolVersion = -1/0` accepted as "legacy"** — the worker state
   contract's `< 3 means legacy` read silently upgraded rows no client ever
   wrote; only documented legacy protocols 1/2 (or absent) now normalize and
   nonsense values fail closed like future protocols. Fail-before recorded:
   red `protocolVersion -1: expected {...} to be null` against the pre-fix
   normalizer; after: `stateContract.test.ts` 22/22. (`6ddf7c5e`)
4. **Trilingual copy discipline** — every new user-visible string
   (`waitingForPlayers` and the host-end confirmation set asserted against
   the real dictionaries in the rendered suite) ships in en/zh-Hans/zh-Hant
   in the same commit; locale completion/parity suites pass.
5. **Round-2 preserved** — the harness keeps all ten round-2 lifecycle tests
   green unchanged (17 total now), including R1 426 matrix, R4
   poison/rollback rows, and R5 leave revocation.

## Round-3 automated gate results (on final code commit `6ddf7c5e`)

Environment: Node v24.19.0 (repo runtime), pnpm 10.30.1, Supabase CLI
2.116.0, Docker 29.7.2, local Supabase stack (`rivermind-poker` project
only). Both round-3 migrations (`20260902000000`, `20260902000100`) were
applied locally with `supabase migration up --yes`.

| Gate | Command | Result |
| --- | --- | --- |
| Typecheck | `pnpm typecheck` | pass (`tsc --noEmit` clean) |
| Full unit/localization suite | `pnpm test` | pass — **166 files, 1,792 tests, 0 failures** |
| Real-HTTP lifecycle harness | `pnpm test:multiplayer-integration` | pass — **17 tests** (10 round-2 tests unchanged + Q1/Q2/Q3/Q4 additions incl. the silent-client enforced-fold end-to-end and the stranger-liveness refusal) |
| Edge worker boot/boundaries | `pnpm verify:multiplayer-edge` | pass (exact worker with the liveness operation bundled; delete-account worker too) |
| Local DB/RLS corpus | `psql -f supabase/tests/*.sql` (pgTAP, local DB) | pass — 25+20+5+11+39+128+15 = **243 assertions, 0 failures** |
| Release config | `pnpm verify:release-config` | pass (RiverMind iOS/Android 1.0.0) |
| Mobile secrets | `pnpm verify:mobile-secrets` | pass for tracked source |
| Working tree | `git diff --check` | clean |
| Production JS exports | `npx expo export --platform ios` / `--platform android` | pass (JS bundle + assets emitted to /tmp/expo-export-311-ios, /tmp/expo-export-311-android). **A JS export is not a signed native build.** |

pgTAP environment note (honest bookkeeping): `multiplayer_rls_test.sql`
assertion 61 counts whatever a global cleanup sweep deletes; when it is run
immediately after harness sessions, stale AI-moment ledger rows (>1 h old)
from those runs make the cleanup report 2 deletions instead of 0 — that is
dev-database residue, not a product defect (fresh/CI databases have none).
Run order recorded here: harness first, then a purge of >1 h-old AI-moment
rows, then pgTAP — 128/128 green. Reproduced once and re-verified green the
same session.

## Round-3 deployment guidance — superseded

Round 3 proposed `20260902000000` → `20260902000100` → worker → client,
with failed liveness reads disabling enforcement and pre-heartbeat clients
being classified stale after rollout. Review found both assumptions unsafe:
an infrastructure failure changed a forced Fold into Check, and a perfectly
connected older client was mistaken for a disconnected owner.

Do not follow that rollout as written. Round 4 adds explicit request
capability, fail-closed liveness preparation, one narrow legacy-owner RPC
migration, and a coordinated worker/client cutover after old tables finish.
The current sequence is in the Round-4 section below.

## Round-3 status — what was NOT verified locally (remains PENDING)

All round-2 pending items (physical-device matrix, avatar photo intake,
VoiceOver/TalkBack, nine-seat sustained performance, signed EAS/TestFlight
builds, hosted deployment/smoke) still apply unchanged. Round-3 additions:

1. **Airplane-mode device test** — Q4 proves the server-side semantics over
   real HTTP with a silent client; no physical phone was disconnected. The
   5 s heartbeat cadence against a real network (backgrounding, iOS
   suspend/resume, flaky transport) is simulator/device QA territory.
2. **Rendered visual QA of the settled result panel with host-end mounted**
   (portrait/landscape, text scaling, 44-pt targets, focus restoration).
   The rendered suite proves composition and behavior, not pixels.
3. **Visual confirmation of zh-Hans/zh-Hant `waitingForPlayers`** in the
   live result panel.
4. **Hosted liveness behavior** — the RPC/worker pair has only run on the
   local stack.

Outcome statement: **Qwen follow-up verified locally; device/release QA
pending.** No merge, push, deploy, hosted mutation, or signed build was
performed in this round; no gate above is claimed without having been run
against the final code commit.


---

# Round 4 — Liveness closure and rendered host escape

## Checkpoints

| Checkpoint | Commit | Scope |
| --- | --- | --- |
| A — verified dealing, explicit client capability, recovery safety | `c748d349` | Worker/client/coordinator contract, lobby heartbeat, request timeout, migration, unit/HTTP/pgTAP regressions |
| B — host escape independent of settled content | `ff69302f` | Action-panel wrapper and rendered composition/eligibility/confirmation tests |
| C — corrected design and release evidence | documentation/comment-only commit after B | This record, the Q4 design, and heartbeat acknowledgement comment; no runtime changes |

## Findings resolved

1. **Start and Deal now bypassed liveness.** All expiry/deal entry points
   (`start`, `deal-now`, `tick`, `rematch`) obtain verified contact data.
   The next-hand dealer itself sweeps stale seats. Insufficient-player
   repairs commit without dealing; stale lobby guests become offline/unready
   and must reconnect and ready again. Ledger ownership/balances survive.
2. **Unavailable reads disabled enforcement.** Renewal plus row validation
   happens before coordinator/persistence. Failed/rejected RPCs, malformed
   rows, duplicate owners, and missing/lagged caller renewal produce
   retryable 503 `room_unavailable`. No new hand, processed command,
   courtesy Check, or deadline is committed on that failure.
3. **Protocol-3 clients were accepted without the new heartbeat contract.**
   Capability 4 is required on create/join/sync/resume/command/liveness/moment
   before contact or room mutations. Missing/older/future declarations
   receive 426; malformed ones receive 400. Owned archive reads/deletion
   remain available. Snapshot/accounting format 3 stays unchanged.
4. **Heartbeat lifecycle omitted the lobby and outlived foreground play.**
   The shared room hook covers ready-up/live/paused/between-hands states;
   closes on background/room close/complete, renews immediately on foreground,
   rejects late callbacks from a previous room, and avoids overlapping beats.
   HTTP timeout is 4 seconds against the existing 5-second cadence.
5. **Recovery reset decisions.** Reconnect previously extended a busted
   owner's 47,100-ms deadline to 92,099/92,101 ms in the regression fixture,
   and changed explicit Sit out back to rebuy-pending. Those three tests
   failed before the fix. Recovery now preserves the original deadline,
   including sweep/collective-pause paths; expired returns stay sitting out
   with explicit later Rebuy still available.
6. **Legacy ownership renewal was accidentally refused.** Strict command
   preparation exposed that the existing SQL ownership predicate rejected
   otherwise-valid pre-lifecycle seats without a participation field. The
   new migration treats only that missing field as the historical active
   shape; unknown/Left/non-owner/AI states remain refused. The added pgTAP
   legacy case failed with SQL 42501 before the migration, then passed.
7. **Host-control proof relied on source strings.** The production
   `MultiplayerActionPanel` owns the host action outside early-return
   content branches. Rendered tests exercise both content variants,
   eligibility, busy state, cancellation, and confirmed dispatch using the
   existing three-locale catalogs. These are component-composition tests,
   not full-modal pixel/accessibility evidence.

Review method: local diff review plus executable regressions; no independent
subagent/adversarial-review claim is made for this round. No localization
keys were added: existing en/zh-Hans/zh-Hant update/retry/lifecycle copy is
reused.

## Round-4 local gate evidence

Final executable/test code: `ff69302f`. Full unit/type/config/secrets, HTTP,
Edge and database gates were rerun after the code checkpoints. The exports
cover the same runtime source; subsequent additions before the checkpoint
were regression tests only. Checkpoint C changes documentation/comments only.

| Gate | Result |
| --- | --- |
| `pnpm typecheck` | clean |
| `pnpm test` | 168 files / 1,842 tests, zero failures |
| `pnpm test:multiplayer-integration` | 19/19, real worker + DB + production response parser |
| All seven pgTAP files | 245 assertions, zero failures |
| `pnpm verify:multiplayer-edge` | pass: multiplayer and delete-account worker boundaries |
| `pnpm verify:release-config` / `pnpm verify:mobile-secrets` | pass |
| `git diff --check` | clean |
| iOS/Android production JS exports | pass; Hermes bundles/assets, NOT signed native builds |
| Local migration replay/schema comparison | all migrations replayed; no schema changes found |

HTTP failure evidence includes a real liveness RPC read fault scoped only
to a disposable room: the expired-turn request returns 503, canonical JSON
is unchanged, the exact original function is restored in `finally`, and
retrying the same command ID/version produces exactly one enforced Fold and
zero Checks. Stale Start/Deal now and protocol-3 live-request refusals run
through the same worker. Rebuy and Sit-out recovery assertions also run
through real HTTP.

pgTAP totals: account deletion 25, avatars 20, daily results 5, archive
capacity 11, moments 39, RLS 128, liveness 17 = **245**. The HTTP harness
completed and cleaned its own disposable users/rooms before the SQL corpus;
no ad hoc residue purge was needed this round.

Local environment: Node 24.19.0, pnpm 10.30.1, Supabase CLI 2.116.0,
Docker/local `rivermind-poker` stack only. Exports:
`/tmp/rivermind-liveness-ios.wgaSMG` and
`/tmp/rivermind-liveness-android.3GCFgn`.

Tooling notes:

- `supabase migration up --local` applied only new migration
  `20260902000200`; no hosted database or user progress was reset.
- `supabase db pull liveness_closure --local --yes --schema public,private`
  replayed every migration, then returned `LegacyDbPullInSyncError` /
  "No schema changes found" (CLI exit 1 for an already-in-sync schema).
  It produced no extra migration. This is a successful no-drift result,
  not a claimed exit-0 command.
- The local security advisor reported one pre-existing warning:
  `private.avatar_object_owned` has a mutable search path. It is outside
  this diff and remains recorded for a separate security cleanup; no
  liveness function warning/error was reported.

## Hosted migration deployment — complete 2026-08-31

The linked hosted project had zero multiplayer rooms before deployment.
`supabase db push --linked --skip-vault --yes` applied exactly these six
migrations, with no seeds, roles, Vault changes, data reset, or Edge deploy:

1. `20260901000000_multiplayer_create_room_bootstrap_revision.sql`
2. `20260901000100_multiplayer_host_ended_completion_reason.sql`
3. `20260901000200_multiplayer_left_seat_revocation.sql`
4. `20260902000000_multiplayer_nine_seat_hand_archives.sql`
5. `20260902000100_multiplayer_seat_liveness.sql`
6. `20260902000200_multiplayer_legacy_liveness_renewal.sql`

Remote migration history contains all six and a post-deploy dry run reports
the database up to date. Hosted SQL checks confirm the bootstrap revision,
host-ended constraints, nine-archive bound, legacy-owner renewal, fixed
search path, and service-only liveness table/RPC privileges. The security
advisor reports no ERROR-level issue.

The unchanged hosted multiplayer worker remained version 7 before and after
deployment. A disposable current-client create + sync succeeded through that
worker at snapshot version 0; the delete-account worker then removed the test
account and room, and the hosted room count returned to zero.

Next production rollout step: deploy the matching canonical Edge worker and
capability-4 clients in a coordinated window. This has **not** been performed.

Have a compatible client candidate ready and finish active older-build
tables before the worker cutover. Protocol-3 clients cannot continue live
play against the new worker; the new client is also refused by the old
create/join capability gate. Missing liveness infrastructure refuses
commands instead of changing poker behavior. Existing validated ledgers and
canonical snapshot format are preserved; this task performs no reset.

## Hosted device-QA preview — active 2026-08-31

Physical-device QA no longer depends on replacing the worker used by the
currently released app. An isolated `multiplayer-room-preview` Edge Function
re-exports the exact canonical release-candidate worker implementation, and
the EAS `preview` environment alone sets
`EXPO_PUBLIC_MULTIPLAYER_FUNCTION_NAME=multiplayer-room-preview`. Production
builds have no override and continue to default to `multiplayer-room`.

Hosted state after preview deployment:

- `multiplayer-room` remains unchanged at version 7 for released clients;
- `multiplayer-room-preview` version 1 serves capability-4 preview clients;
- `avatar-access` version 1 serves room-authorized private avatar bytes;
- the six hosted migrations listed above remain the shared persistence
  contract; no additional schema or user-data mutation was made;
- the production EAS environment was not changed.

The hosted preview smoke gate (`pnpm verify:multiplayer-preview`) creates two
disposable anonymous identities and proves avatar authorization, Create,
Join, both liveness renewals, both Ready commands, Start/Hand 1, and Sync over
the public internet. It then deletes both accounts. The final run passed.
The canonical production worker was not redeployed.

Signed iOS preview evidence:

- ad-hoc build 28, commit `ff591d7b`, Xcode 26.6;
- Expo Doctor 18/18, valid signature and embedded preview alias verified from
  the packaged `.app`;
- provisioning profile contains the registered `Hyu17ProBlue` iPhone;
- local artifact:
  `artifacts/rivermind-slice-3.11-preview-ff591d7b.ipa` (ignored by Git);
- direct installation and first launch on `Hyu17ProBlue` succeeded. The app is
  self-contained and continues to use the hosted preview backend after the
  cable is disconnected.

This route is intentionally a QA lane, not a production cutover. Preview
rooms share the hosted database but are discoverable only by their random
room code. A real-human multiplayer test requires every participant to use a
capability-4 preview build; a released protocol-3 client cannot join. Register
additional iPhones and rebuild the ad-hoc profile, or distribute a later
TestFlight preview build, before claiming two-physical-device coverage.

Minimum device matrix:

1. Two preview clients: Create/Join for 2, 3, 6, and 9 seats; fill remaining
   seats with AI where needed and verify clockwise seat/action/feed order.
2. Background, foreground, airplane mode, network recovery, and retry inside
   and outside the 15-second silence lease; no AI takeover of a human seat.
3. Bust, unlimited 4,000-chip Rebuy, Sit out, Return next hand, Leave, host
   end, reconnect, final ledger and archive convergence.
4. Uploaded photo intake/crop on iPhone and room-private rendering from the
   second client, plus authored/default/AI avatar fallbacks.
5. Portrait/landscape, dark/light, en/zh-Hans/zh-Hant, text scaling and
   VoiceOver on every supported private-table size.

## Still pending before release

- Physical two-device network/airplane-mode, background/foreground and
  near-deadline testing; repeated rebuy, Return, Leave, ledger convergence.
- Portrait/landscape/text-scale inspection of host result/decision controls,
  all supported private table sizes, dark/light and three locales.
- Real iPhone photo intake/cropping and VoiceOver/TalkBack.
- Sustained nine-seat all-Nemesis performance.
- Signed Android build and TestFlight distribution; the signed iOS ad-hoc
  preview and hosted preview worker/smoke are complete, but production
  canonical-worker/client rollout remains pending.

The existing detector uses a **15-second silence lease**, not instant
connectivity proof. A connection lost inside a still-fresh lease may still
receive the retained online inactivity rule (Check when legal, otherwise
Fold). Stale/explicitly offline actors always enforced-fold and never become
AI. Device testing must exercise that boundary; changing every online
timeout to Fold is a separate product decision.

Outcome: **local hardening, hosted migrations, isolated preview Edge service,
and one signed iPhone installation are complete; two-physical-device and full
release approval are not claimed.**

## Slice 3.11 device-hardening round (table/identity/Play/Home)

This round implemented the physical-device review findings DT-01–DT-12 on branch
`local/slice-3.11-device-hardening`. It made no hosted SQL, RLS, Edge Function,
capability, or preview/production routing change; it preserved the isolated
`multiplayer-room-preview` worker lane and the iOS crash fix `092e8f8e`.

Checkpoints: `7970702d` (A — DT-01/02/05/06/12), `ea613912` (B — DT-04/07/08),
`aa671691` (C — DT-03/09/10/11). Final tested commit `ea613912`, worktree clean.

Local gates: typecheck PASS; full suite PASS (172 files / 1873 tests);
`verify:release-config` PASS; `verify:mobile-secrets` PASS; `git diff --check`
PASS; production iOS+Android Hermes JS export PASS.

Left explicitly pending (not run): `verify:multiplayer-edge` (Supabase CLI
absent), physical install-over uploaded-photo persistence, camera/notch safety
in both landscape directions, physical taps for every occupied plaque and edge
message, VoiceOver/TalkBack, two-device private-room convergence/reconnect/
stats/avatar sharing, sustained nine-seat all-Nemesis performance, and any
signed/TestFlight candidate.

Outcome (this round): **Device hardening incomplete.** All implemented DT fixes pass the
full local suite and typecheck, but `verify:multiplayer-edge` could not run (Supabase CLI
absent) and DT-07/DT-08 lack an automated screen-level fail-before/pass-after regression;
physical, two-device, accessibility, and signed/TestFlight gates are pending. Refer to
`docs/assets/phase16-slice-3.11-device-hardening/local-gate-evidence.md` and the
implementation record at the end of `PHASE_16_SLICE_3_11_DEVICE_TESTING_NOTES.md`.

## Device-hardening takeover closure

The preceding DeepSeek-round status is superseded for local automation by three corrective code checkpoints: `e24348a5` (duplicate private overlay paths, rendered safe-pane bubbles on local/private tables, four-edge modal safety), `a20dbdab` (production uploaded-avatar artifacts moved from Expo cache into app documents), and `6f816206` (one 800/2,000/4,000 stack menu for Practice and Sit & Go). The model field report is `f2b20ff1`.

Final tested code `6f816206` passes: typecheck; 175 files / 1,884 unit and localization tests; 19/19 real-HTTP multiplayer integration cases; exact production/preview multiplayer and delete-account Edge boundaries; release config; mobile-secret verification; 245/245 pgTAP assertions after one documented cleanup of expired local harness residue; `git diff --check`; and iOS/Android production Hermes exports.

No migration, hosted SQL, Edge deployment, capability change, production routing change, TestFlight submission, or user-progress reset was performed by this takeover. Existing hosted preview/production guidance remains unchanged.

A clean `a0278eea` preview candidate (runtime code unchanged since tested commit `6f816206`) was subsequently built ad-hoc with Xcode 26.6, after Xcode 27 beta rejected legacy third-party Pod deployment targets. Artifact `artifacts/rivermind-slice-3.11-device-closure-a0278eea.ipa` is app `1.0.0` build `28`, signed by Team `F9XW9FCX92`, SHA-256 `0cdd5518af6b18c8300b162019974da6c05b21c02f815ed24b7cca3f935302d3`, provisioned for `Hyu17ProBlue`, and contains the compiled `multiplayer-room-preview` alias. It installed over the existing app without uninstalling and launched successfully. This closes signing/provisioning/install/launch only; it does not close the hands-on behavior gates.

Outcome: **automated/local closure and one signed iPhone install/launch complete; hands-on physical-device and release QA pending.** Required remaining gates are observation of install-over avatar persistence on the installed candidate, both landscape hardware directions and edge bubbles, timed-turn Profile/Table-stats focus/deadline checks, two-device capability-4 convergence/reconnect/rebuy/avatar sharing, VoiceOver/TalkBack, three-locale dark/light visual QA, sustained nine-seat all-Nemesis performance, signed Android, and TestFlight processing/distribution.

## Device screenshot follow-up — complete in code/install, observation pending

Physical screenshots found five defects that earlier automated evidence did not
exclude. Commit `84b45a05` removes private-table AI pills and winner cups from
the player-name lane, expresses those states on the plaque boundary, replaces
stale cross-orientation safe-area accumulation with live-axis handoff, makes
the prepared-room and live nine-seat phone surfaces share one canonical
viewer-relative clockwise ring, and changes the server-owned next-hand delay
from seven to ten seconds.

Final gates on `84b45a05`: typecheck; 175 files / 1,891 tests; 19/19 real-HTTP
multiplayer cases; exact production/preview Edge boundary verification;
245/245 local pgTAP; release configuration; mobile-secret verification;
`git diff --check`; and iOS/Android production Hermes exports all pass.

Only the isolated QA route was deployed: `multiplayer-room-preview` advanced
from version 1 to version 2 and passed the hosted two-identity avatar/Create/
Join/liveness/Ready/Start/Sync smoke. Canonical production `multiplayer-room`
remains version 7. No SQL, migration, production worker, championship reset,
or other user-data mutation occurred.

Signed artifact
`artifacts/rivermind-slice-3.11-device-followup-84b45a05.ipa` is app 1.0.0 build
28, Team `F9XW9FCX92`, SHA-256
`88f078e1d834fb831bb2a5c506c5211a7e42cf6e28206a97534cd96bdca89455`,
provisioned for `Hyu17ProBlue`, and compiled with the
`multiplayer-room-preview` alias. It installed over the existing app without
uninstalling and launch-verified. This closes build/sign/install/launch, not
hands-on visual behavior: the five screenshot cases, both landscape directions,
and the broader two-device/accessibility/performance matrix remain pending.

## Seat-stack unification follow-up — installed, visual observation pending

Commit `c6c18a3e` removes the last local-table AI name tab, makes AI/winner
identity a shared plaque-boundary contract, and gives private, Championship,
RiverMind AI, and local multi-seat tables one plaque-then-cards reading order.
The local renderer now measures the felt itself rather than a larger body plus
a guessed subtraction, and the measured ring reserves the full rendered seat
height. Wide measured panes also select the landscape ring before a lagging
orientation-state update can flash the portrait map.

The portrait Table feed trigger moved into the existing action rail and opens
an overlay sheet, reclaiming its former dedicated row. Landscape keeps the
full side rail. Heads-up uses the same compact feed control.

Final local gates: typecheck; 177 files / 1,894 tests; 19/19 real-HTTP
multiplayer integration; exact production/preview Edge bundle verification;
release configuration; mobile-secret verification; and `git diff --check` all
pass. This UI-only checkpoint did not change SQL, RLS, protocol capability,
worker code, or hosted routing.

Signed ad-hoc artifact
`artifacts/rivermind-slice-3.11-seat-unification-c6c18a3e.ipa` is app 1.0.0
build 28, Team `F9XW9FCX92`, SHA-256
`6d24324407480c44d37e899e071ea4199165997e2d6fb160b4f8ff523960a81d`,
provisioned for `Hyu17ProBlue`, and compiled with the isolated
`multiplayer-room-preview` alias. It installed over the existing app and
launch-verified without an uninstall or data reset. Hands-on visual
confirmation, two-device multiplayer, accessibility, sustained nine-seat
performance, signed Android, and TestFlight remain open.
