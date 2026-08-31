# Slice 3.11 — GLM integration-hardening round

## Assignment

Take one focused implementation-and-verification pass over the unfinished Slice 3.11 integration. Fix the reproduced defects below and their related end-to-end paths. Preserve the useful implementation already on the branch; do not restart the slice or redesign approved product behavior.

**Goal:** make the private multiplayer profile, human-seat lifecycle, unlimited 4,000-chip rebuys, and participant statistics work through the real client → HTTP parser → authenticated Edge Function → persisted coordinator state → public/viewer projection → client parser → UI flow. Prove the result with regression tests and local integration evidence. Do not call the full slice complete while required release gates remain pending.

This is a coding assignment, not a request to explain away or merely document the defects. If a finding appears incorrect, first reproduce its named scenario and provide evidence before closing it.

## Baseline and working rules

- Repository: `/Users/haoyu/development/rivermind-poker`.
- Reviewed baseline: `fd119229`, on `codex/slice-3.11-profile-play-championship`.
- Start a dedicated feature branch, `codex/slice-3.11-integration-hardening`, from that baseline. If it already exists, inspect its history and working tree before deciding whether to resume it. Never reset or overwrite another agent's work.
- If the source branch has advanced, identify the new commits and report the changed baseline before applying these findings. Reproduce against the actual starting revision.
- Preserve unrelated changes. Keep focused commits and avoid force pushes or history rewriting.
- Do not merge, deploy a hosted Edge Function, alter hosted data, submit to TestFlight, or install a release without a separate instruction. Local disposable test data and local build/test artifacts are in scope.
- Do not broaden avatar/profile visibility, weaken authorization, skip tests, remove failing assertions, or change approved product rules to obtain a green run.
- Avoid parallel editing of the coordinator and contracts. Keep one implementation owner for their cross-layer invariants.

Read these before coding:

1. The complete [Slice 3.11 scope](PHASE_16_SLICE_3_11_SCOPE.md), especially 3.11E, 3.11F, localization, and the integrated exit criteria.
2. The [release record](PHASE_16_SLICE_3_11_RELEASE_RECORD.md). Treat its completion claims as claims to verify, not proof.
3. The eight full-resolution references linked in the scope under `docs/assets/phase16-slice-3.11/` before changing corresponding UI.
4. Applicable `AGENTS.md` files and the Supabase skill, when available. Check current relevant Supabase documentation before changing its APIs or database behavior.

## Evidence already collected at fd119229

The independent verification pass confirmed:

- Clean working tree and the reported commit chain.
- Typecheck passes.
- Full suite passes: **161 files / 1,707 tests**.
- `verify:release-config`, `verify:mobile-secrets`, and `git diff --check` pass.
- Supabase CLI **2.116.0** is available at `/usr/local/bin/supabase` on the Mac; the local project stack was running.
- `pnpm verify:multiplayer-edge` **fails**, not merely environment-blocked: HTTP 503, worker boot failure, unresolved `src/domain/multiplayer/playerRecordSnapshot` imported from `coordinator.ts`.
- Direct diagnostic probes reproduced H02–H07 below despite the green unit suite. Those probes were in-memory checks, not committed regression tests; add durable tests for them.

The default shell initially selected Node 16, which cannot run the installed pnpm. Verification succeeded with the bundled Node **24.19.0**. On this Mac the known runtime is:

```sh
export PATH="/Users/haoyu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH"
node --version
pnpm --version
command -v supabase
supabase --version
```

On another machine, use a runtime satisfying the repository's `node >=22.19.0` requirement. Recheck tools, PATH, Docker, and the correct local project before claiming an environment blocker. Do not print environment files, access tokens, service-role keys, or signed avatar URLs. Discover Supabase commands and flags through `--help`.

## Required fixes and regressions

### H01 — The actual Edge worker does not boot

**Observed:** the authenticated Edge smoke returns HTTP 503. Deno cannot resolve the extensionless `./playerRecordSnapshot` import in `src/domain/multiplayer/coordinator.ts`. The new `./contracts` runtime import also needs review.

**Fix:** audit the entire runtime import graph reached by `supabase/functions/multiplayer-room/index.ts`, not just the first failing import. Use imports supported by the actual Edge runtime and keep the mobile build compatible.

**Required proof:** run the exact worker from the repository through `pnpm verify:multiplayer-edge`. A Node/Vitest import or mobile `tsc` pass is not a substitute. `tsconfig.json` excludes `supabase/functions`, so it cannot establish that the Edge entry point is type-correct or runnable.

### H02 — New requests never reach their coordinator handlers

**Observed in `supabase/functions/multiplayer-room/contract.ts`:**

- A valid existing `tick` command parses.
- Equivalently formed `rebuy`, `sit-out`, `end-stalled-session`, and `update-play-record` commands all parse as `null` and produce HTTP `request_invalid`.
- Create/join parsing drops the supplied `playRecord`, although `index.ts` tries to read it.

**Fix:** complete the actual request types and strict parsers, including any return/reconnect command needed by the approved lifecycle. Validate owner-supplied records and limits without trusting client-provided actor identity, stack, buy-in amount, or net result. Make the client supply its Play record on all required publication paths.

**Required tests:** valid and malformed requests for every new command; create/join record retention; unsupported versions; oversized records; extra/spoofed identity and amount fields; authenticated HTTP requests reaching the intended owner/room/state gate. A coordinator test bypassing the HTTP parser does not close this finding.

### H03 — Persistence and client contracts cannot carry the new state

**Observed:**

- `src/services/multiplayerContract.ts` still omits the new transition kinds and `host-ended`. A real successful rebuy transition is rejected by `parseMultiplayerRoomEnvelope`.
- `supabase/functions/multiplayer-room/stateContract.ts` drops `rebuyDecisionDeadlineAtMs` when normalizing persisted state and rejects a `host-ended` room.
- The public snapshot/projection and client shape do not carry the rebuy-decision deadline needed by the live UI and recovery scheduler.

**Fix:** trace every new field and enum through canonical persistence, normalization, public/viewer projection, HTTP response, Realtime, client parsing, and history/summary parsing. Preserve a valid deadline exactly across reloads; reject invalid state explicitly rather than silently substituting empty data. Keep private fields private.

**Required tests:** serialize → reload through the real canonical normalizer → execute a command → project → parse on the client. Include every new transition, `host-ended`, pending rebuy decisions, disconnected/sitting-out/left seats, room recovery, and final archive/summary paths. Assert the client receives the same accepted state and deadline, not just a non-null object.

### H04 — An accepted rebuy causes the client to discard the ledger

**Observed in `coordinator.ts`'s `rebuy` branch:** `rebuyCount`, `totalBuyIn`, and `settledStack` increase, but `rebuyChips` does not.

Reproduced with the existing seeded two-human, 20-chip elimination fixture:

```text
rebuyCount = 1
rebuyChips = 0
totalBuyIn = 4,020
settledStack = 4,000
client snapshot accepted = true
client retains rebuy ledger = false
```

The 20-chip fixture is an inexpensive engine test, not a proposed product stack preset.

**Fix:** update all accepted rebuy facts atomically and enforce `rebuyChips = rebuyCount × 4,000`, `totalBuyIn = initialBuyIn + rebuyChips`, and `net = settledStack − totalBuyIn`. Validate safe integers, owner/row identity, and all-participant conservation. Do not fix this by loosening the parser or displaying a missing ledger as zero/Even.

**Required tests:** actual coordinator result → public/viewer projection → client parser → Table stats and final standings. Cover multiple rebuys, duplicate delivery, lost responses, stable net at acceptance, and later settlements. Include the ordinary 800/2,000/4,000 opening stacks as well as the small deterministic fixture.

### H05 — Rebuy expiry throws and rolls back its own transition

**Observed in the between-hands `tick` branch:** it clears pending decisions and schedules the next countdown, then immediately throws `The next-hand countdown has not reached zero.` The cloned transition is discarded and the original players remain `rebuy-pending`.

**Fix:** resolving the rebuy deadline must be an independently accepted, idempotent state transition even when no new hand should start yet. Only arm a deal when at least two eligible funded participants exist; otherwise retain the approved waiting/host-end path. Make the client actually schedule/retry the deadline transition from the published server deadline.

**Required tests:** exact boundary, just-before/just-after, all configured 30/45/60-second durations, one/multiple pending humans, no funded return, retry/duplicate command, and races with Rebuy, Sit out, leave, reconnect, and deal-now. Round-trip through persistence before the expiry command. Assert the transition commits and is not undone by a later guard.

### H06 — Sitting out one hand prevents a later rebuy or return

**Observed:** after a three-human hand busts two people, one rebuys and the other chooses Sit out. Deal and finish another hand. The sitting-out human's later rebuy fails with `This seat is not part of the table.` Its ledger still exists, but its entry has disappeared from `state.hand.players`.

**Root boundary to fix:** the last hand's dealt-player list cannot be the authoritative roster of all participants eligible to return. Current `nextTablePlayers`, deal filtering, and the rebuy lookup derive too much from that shortened hand.

**Fix:** preserve session identity, settled stacks, and eligibility independently of the current hand's dealt players. Reintroduce an eligible original human only at a safe next-hand boundary. A permanent Left seat must remain retired. Do not re-deal sitting-out or disconnected players merely to keep them in the hand object.

**Required tests:** sit out for one and several hands, reconnect after being omitted, positive-stack return, zero-stack late rebuy, repeated bust/rebuy cycles, 2/3/6/9 seats, and final statistics containing all participants including omitted and departed ones. Verify the live UI exposes the late Rebuy/Return action; coordinator-only support is insufficient.

### H07 — Disconnect behavior violates the approved no-play rule

**Reproduced:**

- Disconnect a human when Check is legal, then expire their timer: the coordinator **checks**, leaves the hand unfolded, and marks the seat disconnected.
- Disconnect a human between hands, then deal: `connection` becomes `offline`, but participation remains active/undefined and the offline seat receives cards.

**Fix:** implement one explicit seat-lifecycle contract across every transition. A disconnected human never receives an AI decision or an automatic check/call/bet/raise. Preserve the original deadline for a retry; expiry folds once. An already-all-in hand settles normally without a new decision. Offline/sitting-out/left seats are excluded from new deals. Only the original authenticated owner can recover a disconnected seat.

**Required tests:** disconnect before/during/after the player's turn; free-check and facing-bet timeouts; already all-in; before the next deal; app kill/relaunch; all humans offline; host transfer; same-owner recovery; a different account/host attempting recovery; repeated timeout ticks; and legacy snapshots carrying human AI-control state. Prove no clock extension, duplicate action, hidden AI takeover, or mid-hand reinsertion.

Use the existing anonymous-auth model correctly: a persisted authenticated guest can recover its own seat; a newly created anonymous identity is a different user and must not claim it.

### H08 — Compatibility negotiation is not implemented

**Observed:** snapshot protocol remains version 2 and join negotiation still covers only seat count. The release record incorrectly treats owner-only command authorization and permissive parsing as lifecycle/ledger capability negotiation.

**Fix:** implement the scope's explicit version/capability boundary before any incompatible client is seated. Advance and enforce the relevant protocol deliberately. Do not confuse the room's optimistic-concurrency revision with a schema/protocol version. Define a safe policy for existing old-format rooms and old human-AI-control state; no silent takeover or manufactured ledger history is allowed.

**Required matrix:**

| Client / room or server | Expected behavior |
| --- | --- |
| New / new | Full supported flow, including 2/3/6/9 seats and all new commands |
| Old or missing required capability / new | Localized update-required refusal before membership/seat mutation |
| New / old unsupported response | Explicit safe incompatibility handling; no pretending the ledger is complete |
| Recovery of legacy room state | Tested, documented fail-closed/upgrade policy; no human-to-AI normalization |
| Invalid/future protocol or lifecycle state | Refuse safely; no silent active/zero-stat fallback |

Authorization answers who may act. Capability negotiation answers whether this client understands the room. Implement and test both.

### H09 — Finish the actual UI and localized lifecycle copy

**Confirmed source gap:** `multiplayer.game.exitDetail` in `src/localization/phase9Messages.ts` still says the seat will be handed to AI in English, Simplified Chinese, and Traditional Chinese. The live component still contains old Reclaim affordances, while the coordinator rejects Reclaim.

**Required UI review:** trace the reachable actions rather than only their helper functions:

- Initial Rebuy/Sit out, pending deadline, later Rebuy after sitting out, positive-stack Return next hand, Retry connection, waiting for a returning player, and host ending a stalled session.
- Confirmed permanent Leave, including all-in settlement and a clear cannot-return-to-this-session warning. Never use old AI-takeover promises.
- Disconnected, sitting-out, rebuy-pending, and Left identities; no human AI-control label or dead Reclaim button.
- Table stats through the **last settled** hand, not the current unsettled hand number. Preserve departed rows in live and final results; no duplicated or fabricated zero records.
- Profile record publishing on create/join/recovery/settlement/foreground and correct owner/observer copy. Recover publication revisions across remounts and stale responses.
- Measured layout, focus restoration, orientation, and action safety for every newly reachable sheet/state. Re-evaluate the release record's deferred layout/accessibility nits against the original acceptance criteria; do not unilaterally waive them.

All changed visible and accessibility wording must ship in **en, zh-Hans, and zh-Hant in the same commit**. No new English literals or deferred translations. Show production-representative screens, not only test helpers.

## Additional boundary checks required by these fixes

The findings above are not an exhaustive review of all 9,000 changed lines. Before closing this round, trace these adjacent invariants:

- Explicit leave while not the current actor must actually fold/retire that human at the specified legal transition; it cannot later check through or regain access. Verify server room-membership and avatar/record access revocation, not only client navigation.
- Recoverable disconnect must preserve the existing clock. All-offline pause/resume cannot grant a fresh turn budget contrary to the scope.
- No command, old canonical row, or AI identity-map fallback may let `kind = human` enter the AI decision path.
- Immutable seat ownership must survive host transfer. Management authority cannot claim another person's cards, stack, seat, or profile record.
- A rematch resets only that session's buy-ins/ledger/participation, uses a proper new seating flow for departed people, and does not reset unrelated app progress.
- Canonical/private data, processed-command fingerprints, raw histories, and account identifiers stay out of the public ledger and profile projection. Remote Play records remain room-private.
- Final standings/archive must not drop departed/sitting-out rows simply because the final hand's `tablePlayerIds` omits them.
- Unsafe integer or inconsistent ledger state must fail closed. Silent parser coercion cannot turn unavailable/corrupt results into plausible zero results.

For each, add a focused regression or identify the existing exact test that proves it. If an additional defect is found, fix it within this integration scope and record it separately from the original findings.

## Commit checkpoints for this round

Keep each commit coherent and include its regression tests and localization. A commit checkpoint is not release approval; do not deploy intermediate states.

1. **H1 — Edge and wire contracts:** worker import graph; request/response/persistence/projection/archive contracts; explicit capability negotiation and old-state policy. Include parser round-trips and boot evidence.
2. **H2 — Human lifecycle:** no automated human play, disconnect/retry deadlines, safe return, permanent leave/access removal, host transfer, and canonical participant continuity.
3. **H3 — Rebuy and ledger:** atomic complete accounting, durable expiry transitions, later/repeated rebuys, idempotency/races, conservation, and all-participant final results.
4. **H4 — UI and all locales:** reachable retry/return/rebuy/host-end actions, honest exit/state wording, stats/profile convergence, responsive placement, and focus/turn safety.
5. **H5 — Integrated evidence and release-record correction:** expand the real integration coverage, run the required gates, review the full hardening diff, and accurately record passed/failed/not-run items.

If a root-cause fix crosses these boundaries, keep it atomic and explain the adjusted grouping. Do not create a sequence of commits that passes only by disabling coverage or using temporary permissive behavior.

## Verification requirements

### Prove failure before fixing it

For H01–H08, add regression tests or a repeatable smoke that fail against the reviewed baseline for the stated reason, then pass after the fix. Use actual boundary parsers and projected coordinator results. Hand-written ideal snapshots alone can conceal exactly these integration defects.

Do not preserve outdated tests that assert automatic checks, AI takeover, absent-player removal, or old one-buy-in results contrary to the approved scope. Replace their expected behavior with correct regressions; do not delete coverage without replacement.

### Test the real authenticated HTTP path

`scripts/verify-multiplayer-edge.mjs` currently proves worker boot and some pre-existing boundaries. Passing it alone does **not** prove rebuy or profile integration. Extend the harness or add a focused local integration harness that:

1. Creates at least two separate authenticated local test identities and a room through the real HTTP API.
2. Exercises new create/join capabilities and owner record transport, rejecting incompatible clients before mutation.
3. Plays/settles hands and invokes Rebuy, Sit out, late return/rebuy, record update, reconnect, Leave, and host-end through HTTP, not direct coordinator imports.
4. Reloads persisted state between commands and feeds the returned HTTP/Realtime shapes through the real client parser.
5. Asserts both clients converge on seat state, original deadlines, complete ledgers, net results, and current room-private records.
6. Exercises duplicate/stale commands, response loss, unauthorized owner/seat/room attempts, and canonical/public data separation.
7. Cleans up only the exact disposable local users/rooms/runtime it created. Never delete a real account or reset a whole local database as test cleanup.

Inspect the local test scripts before running them: the existing Edge smoke starts/stops a local Edge runtime container. Do not interrupt another agent's active runtime or touch another project's stack. Hosted tests require separate authorization.

### Required local gates

- `pnpm typecheck`
- Focused regression suites for the affected coordinator, request parser, canonical state normalizer, projection, client parser, archive/summary, profile, lifecycle UI, and localization
- Full `pnpm test`
- `pnpm verify:multiplayer-edge`
- The new/expanded real HTTP lifecycle/rebuy/profile integration harness
- `pnpm verify:release-config`
- `pnpm verify:mobile-secrets`
- `git diff --check`
- Relevant existing private-room/avatar authorization tests; use only local disposable data unless hosted verification is separately authorized
- iOS and Android production-mode exports using the repository's release configuration; record the exact commands and environment. A JavaScript export is not a signed native build or physical-device pass.

Run an adversarial pass over the **full hardening diff**, especially negative cases and boundary seams. If no separate reviewer actually reviewed it, label this self-review. Do not claim an independent review was closed based on your own summary or green test totals.

### Device and release gates remain real requirements

Use the original scope's manual matrix, including both orientations, all three locales, real iPhone photo adjustment, player-profile/Stats focus and turn safety, two-device disconnect/leave/rebuy convergence, all supported table sizes, and sustained nine-seat all-Nemesis performance.

Run the device/simulator checks that are available. If hardware, signing, a second device, or hosted access is unavailable, record exactly what remains and why. Do not invent evidence, replace physical QA with mocked geometry tests, or mark 3.11G/full Slice 3.11 complete. Do not alter the scope to make unperformed gates disappear.

## Final handoff required

Deliver a concise report backed by committed tests and evidence:

- Starting commit, final tested commit, branch, and focused commit list.
- H01–H09 closure table: root cause, changed boundary, fail-before regression, pass-after result, and commit.
- Additional findings discovered during this round and their disposition.
- Exact test commands, tool versions, exit codes, test counts, HTTP-smoke outcomes, and evidence locations. Omit credentials from evidence; test names, room codes, and the supplied testing screenshots do not need sanitizing. State which tests execute the deployed-style worker rather than a direct coordinator import.
- Protocol/capability behavior and any migration/deployment ordering required. Do not deploy it yourself.
- Device/export results and every remaining unavailable or unrun gate.
- Corrected `PHASE_16_SLICE_3_11_RELEASE_RECORD.md`: remove the false runtime-negotiation claim and distinguish implementation status from release verification status.
- Clean working-tree status, or an exact explanation of any deliberately uncommitted files.

Use one of these honest outcomes:

- **Hardening implemented; local integrated gates passed; device/release QA pending.** This is valid progress, not full slice completion.
- **Hardening incomplete:** list remaining failures or genuine environment blockers and the next concrete action.
- **Slice 3.11 release gates complete:** only when every automated, build, physical-device, localization, accessibility, and performance requirement in the approved scope has actually passed for the exact release candidate.

Do not repeat “all seven checkpoints complete” while the Edge worker, HTTP flows, required UI, or release gate is unverified. The objective is working behavior with evidence, not a completion label.
