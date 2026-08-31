# Phase 16 Slice 3.11 — Release Verification Record

Slice: Profile, Play Hub, Table Experience, and Championship Expansion
Scope of record: `docs/PHASE_16_SLICE_3_11_SCOPE.md`

**Current status (this record replaces the earlier 3.11G claims, which were
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

## Automated gate results (this exact branch state)

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

## Migration-first deployment ordering (recorded, not performed)

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
