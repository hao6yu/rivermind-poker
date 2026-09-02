# Phase 18 — Release 1.2 execution record (S0–S7)

Status: **in execution.** Execution authority:
`docs/PHASE_18_RELEASE_1_2_SCOPE-codex-gpt-5.6.md` (the "Codex plan"). This
record freezes the S0 evidence, tracks every slice, and carries the 53-item
coverage ledger through Release 1.2. It is updated as work completes; claims
are limited to what was actually executed.

---

## S0 — Evidence freeze

### Baseline facts (recorded 2026-09-02, session start)

| Fact | Value |
| --- | --- |
| Audited application baseline | RiverMind Poker **1.1.0** at `121338d2` (merge of #82) |
| Plan written against | `master` at `9b691977` ("docs: keep Medium draft local") |
| Execution start HEAD | `9b691977`, branch `master`, clean except the working-tree items below |
| Source-report commit | `6df67ab9` ("docs: add Phase 18 AI review and article draft") publishes the three source-agent reports |
| Working-tree items preserved | modified `package.json` (`android`/`ios` scripts → `expo run:android`/`expo run:ios`); untracked `docs/MEDIUM_FOUR_AI_AGENTS_PHASE_18_REVIEW.md` + `docs/media/` (Medium article and media stay local, never committed); untracked `scripts/androidArtifactInspection.mjs`, `scripts/androidUiDump.py`, `scripts/build-android-local-release.sh`, `scripts/verify-android-artifact.mjs`, `scripts/__tests__/androidArtifactInspection.test.mjs` |
| Active worker lanes | Canonical `multiplayer-room` frozen; capability 4 routes to `multiplayer-room-v4` (`supabase/functions/multiplayer-room-v4`, smoke via `verify:multiplayer-v4` with `MULTIPLAYER_SMOKE_FUNCTION_NAME=multiplayer-room-v4`); the retired preview lane `multiplayer-room-preview` still exists server-side but is not part of Release 1.2 |
| Store identity | iOS `dev.isw.rivermindpoker` buildNumber `1`; Android versionCode `1`; version `1.1.0` (`app.json`) |
| Signed-candidate targets | Release **1.2.0**, iOS buildNumber `2`, Android versionCode `2`; local-release Android QA APK + EAS/signed builds cut at candidate freeze in S7. Store submission and store-config changes remain owner actions |
| Test layout | Default suite `pnpm test` (vitest, excludes the real-HTTP harness); integration harness `pnpm test:multiplayer-integration` runs only `src/services/__tests__/multiplayerLifecycleHttp.test.ts` and fails loudly when its local Supabase stack is missing |
| CI at S0 | `.github/workflows/ci.yml` runs only `pnpm typecheck` + `pnpm test` — no multiplayer-integration job, no Android artifact inspection, no localization/release-config gates (S4 closes this) |

### Preserved failing fixture — P18-001 (GLM nine-player crash)

`src/domain/poker/__tests__/ninePlayerGrading.test.ts` reproduces the crash
**before** any grader change. Red run (2026-09-02):

```text
FAIL src/domain/poker/__tests__/ninePlayerGrading.test.ts
  × grades a nine-player flop decision facing eight live opponents without saved equity
Error: Equity requires one to five unknown opponents.
  estimateFieldEquity src/domain/poker/equity.ts:29:11
  gradePostflopDecision src/domain/poker/decisionGrading.ts:297:7
  multiwayDecision src/domain/poker/decisionGrading.ts:489:10
  gradeMultiwayHand src/domain/poker/decisionGrading.ts:515:16
```

Reachable surfaces of the same throw, confirmed by call-site search (symbol
`gradeMultiwayHand`): private-table Review hands and archives, local
multiway completion and mission scoring (`MultiwayPokerTableScreen.tsx:639,674`,
`sessionModels.ts:61`), session history (`SessionHistoryModal.tsx:43`), and
multiway replay (`MultiwayHandReplayModal.tsx:45`). Every surface funnels
through the one grader; the fix is therefore grader-scoped, not per-screen.

Performance measurement taken before the D01 decision (dev machine, M-series,
deterministic seed, 20 runs averaged): `estimateFieldEquity` at 5 opponents ×
120 sims ≈ **9.8 ms/decision**; 1 opponent × 180 sims ≈ 5.3 ms. The estimator
rejects >5 opponents today, so 6–8-opponent cost is extrapolated from the
per-simulation work (each added opponent costs ~2 evaluator calls per sim) and
re-measured after the S1 fix — recorded in S1 below.

### D01 device-budget definition (new, recorded)

No numeric grading budget existed before Phase 18. Adopted budget for
Release 1.2, on the named low-end device class (Android with JS ≈ 8× slower
than the dev machine):

- a single no-saved-equity grading fallback decision ≤ **150 ms**;
- a full nine-seat session summary (≤ 40 hands) ≤ **3 s**;
- per-decision evaluator work stays within today's accepted worst envelope
  (≈720 `evaluateBest` calls = the current 5-opponent × 120-sim path).

The S1 implementation scales simulations with opponent count to hold that
envelope and records measured numbers; if a future measurement misses the
budget, D01 requires the explicitly ungraded diagnostic instead of a clamp.

### Private-room archive investigation (P18-003)

The affected private-room archive lives in `private.multiplayer_hand_archives`
(Supabase, viewer-relative rows) plus the device-local resume snapshot. This
environment has no Supabase credentials and no Docker daemon, so the archive
was **not** inspectable here. Recorded honestly:

- The timeout/sitting-out explanation stays the **leading hypothesis**, not a
  confirmed historical fact (matches the plan).
- `mp-08-stuck.png`/`mp-10-stuck-turn.png` in `artifacts/android/device/`
  (1.1.0-era device QA) show stuck-turn states consistent with a viewer whose
  turn deadline passed; they do not prove the creator-disappearance cause.
- Worker policy is unchanged (D03): one missed turn → sitting out; S3 makes
  that state visible and reversible. S7 includes a device run where the viewer
  deliberately misses a deadline.
- Missing evidence is tracked as a device/owner dependency, not silently
  dropped.

### Decisions D01–D14 (defaults adopted; no owner overrides available)

| ID | Decision | Adopted |
| --- | --- | --- |
| D01 | >5 live opponents without saved equity | Exact estimation through eight opponents within the recorded budget above; otherwise explicit ungraded diagnostic. Never clamp silently. |
| D02 | Friend-table preview flag | Delete `EXPO_PUBLIC_MULTIPLAYER_PREVIEW` and its dead branches; friend tables are a shipped capability. |
| D03 | Missed-turn policy | Keep the current one-strike policy for 1.2; make sitting-out visible and reversible. |
| D04 | Crash reporting | No SDK in 1.2; privacy/SDK spike recorded in S4; expand allowlisted local diagnostics only. |
| D05 | Progress unit | BB/100 normalized reference with chips alongside and play-money wording. |
| D06 | Loss styling | Neutral border for loss, aqua win, indigo split; red destructive/error only. |
| D07 | Hardware Back on a live table | Open the leave-table confirmation. |
| D08 | Shell orientation | Keep portrait-only shell for 1.2. |
| D09 | Action-rail icons | Remove the Raise-only icon; feed badge means unread-since-open or is removed. |
| D10 | AI personas without artwork | Out of 1.2 scope (S9/Phase 18.5); personas unchanged. |
| D11 | Human preset avatars | Out of 1.2 scope (S9/Phase 18.5). |
| D12 | Shell decomposition | Phase 18.5 only; file moves, no state rewrite. |
| D13 | Decision do-over budget | Phase 19 candidate (S11); not started. |
| D14 | Phase 17 ordering | Product work proceeds without depending on analytics. |

### Working-tree protection verification

- `package.json` diff limited to the two script lines — untouched by Phase 18
  so far; any further edit is additive.
- `docs/MEDIUM_FOUR_AI_AGENTS_PHASE_18_REVIEW.md` and `docs/media/` are
  untracked and stay untracked (gitignore does not cover them; nothing adds
  them to version control).
- Android artifact tooling: reviewed this session. `androidArtifactInspection.mjs`
  parses ZIP/AXML/ELF directly and fails loudly; `verify-android-artifact.mjs`
  is the CLI gate; `scripts/__tests__/androidArtifactInspection.test.mjs` has 11
  passing tests against synthetic artifacts; `build-android-local-release.sh`
  produces a debug-signed local QA APK and runs the gate before install.
  `androidUiDump.py` is a device UI-dump helper. All five files are preserved
  as-is and committed in S4 with CI wiring.
- Run against the **actual** 1.1.0 baseline artifact
  (`artifacts/android/RiverMind-121338d2-20260901-154303-local-release.apk`):
  `package dev.isw.rivermindpoker version 1.1.0 (code 1) minSdk 24 targetSdk 36
  compileSdk 36` — target API PASS, 64-bit page alignment PASS (arm64-v8a and
  x86_64 min page 16384), uncompressed zip alignment PASS. Gate output stored
  verbatim here as the S0 baseline evidence.

### Source counts (Fable style counts are snapshots)

No design-system work occurs in Release 1.2, so the S8 entry recount is
deferred to Phase 18.5 by the plan's own ordering. Baseline count recorded for
future comparison: `git ls-files | grep -c '\.test\.'` = **183** tracked test
files at `9b691977`; Phase 18 adds fixtures without deleting coverage.

### Appendix A → execution ledger

Every P18 item below keeps its ID, source reference, and disposition until it
is one of: implemented+verified / verified-already-correct / rejected with
evidence / moved to a named later milestone. Nothing is dropped. The live
ledger state is maintained at the bottom of this document.

### S0 unavailable-evidence register

| Unavailable evidence | Reason | Compensation |
| --- | --- | --- |
| Private-room archive contents | No Supabase credentials / Docker in this environment | Hypothesis recorded; S7 device run deliberately misses a deadline |
| TalkBack / VoiceOver behavior | Requires physical devices | S5 static a11y tree work + S7 device pass recorded as pending-when-unavailable |
| Signed store artifacts | EAS builds need owner credentials | Local-release APK used for artifact gate; store build deferred to owner |
| Multiplayer integration harness | Needs local Supabase stack (Docker unavailable) | CI job wired in S4; local run blocked and recorded |
| Owner overrides on D01–D14 | No owner in session | Plan defaults adopted and recorded above |

**S0 acceptance check:** the failing crash fixture is preserved and linked; no
"not found" claim above lacks a symbol/call-site/UI/test/history/runtime
boundary trail; decisions are recorded; the ledger exists.

---

## Slice log

### S0 — complete (see above)

- Phase 18 IDs touched: evidence for P18-001/003/005/006/007 and all ledger items.
- Files added: `docs/PHASE_18_RELEASE_1_2_EXECUTION_RECORD.md` (this file),
  `src/domain/poker/__tests__/ninePlayerGrading.test.ts` (failing fixture).
- Next: S1 nine-player grading safety.

### S1 — complete

**D01 implementation (P18-001, P18-005):**

- `estimateFieldEquity` now accepts one to **eight** unknown opponents
  (`MAX_FIELD_OPPONENTS = 8`), preserving the true opponent count. No call
  site reduces an opponent count to stay inside an older limit.
- `gradePostflopDecision` uses saved equity when present; otherwise it runs the
  deterministic seeded fallback with simulations scaled to hold today's
  per-decision evaluator-work envelope: **180** samples for 1–3 opponents
  (unchanged), **120** for 4–5 (unchanged), **80** for 6–8 (new). If the
  estimate is impossible for any reason, the decision is returned as an
  **explicitly ungraded diagnostic** with `grade: 'ungraded'` and stable reason
  `equity-estimate-unavailable`. The opponent count is never reduced.
- `gradeMultiwayHand` additionally converts any unexpected per-record exception
  into an ungraded diagnostic (`grading-exception`) so **no supported saved
  hand can throw** in completion, summary, history, or replay surfaces.
- Decision grading types: `DecisionComparison.grade` is
  `CoachHandGrade | 'ungraded'` with `ungradedReason?`; a new
  `'ungraded'` presentation class renders as a neutral "Not graded" diagnostic
  (no baseline comparison lines, localized eyebrow/summary/detail/a11y label),
  never as a recommendation or mistake. Ungraded decisions are excluded from
  session learning totals, strong rate, focus selection, and mission scoring.
- Stale doc comment fixed: `gradeMultiwayHand` now documents two- through
  nine-player hands.
- Grader selection remains by **record mode** (`sessionModels.ts` chooses
  `gradeMultiwayHand` for `mode: 'multiway'` records regardless of seat count);
  a new fixture proves a two-player multiway record grades through the multiway
  engine with the engine's own `BTN/SB` position.

**Measured performance (D01 budget), dev machine M-series, deterministic seed,
30-run averages:** 1 opp × 180 sims ≈ 5.8 ms; 5 opp × 120 sims ≈ 8.1 ms;
6 opp × 80 ≈ 6.0 ms; 7 opp × 80 ≈ 7.6 ms; **8 opp × 80 ≈ 7.2 ms**. Extrapolated
≈ 8× low-end device class ≈ **58 ms/decision** at eight opponents — inside the
recorded 150 ms per-decision budget, and cheaper than today's accepted
5-opponent × 120-sim worst case. Sampling semantics are recorded in code
(`fallbackEquitySimulations`) and here: seeded Monte Carlo, standard error
≈ 5.6 points at p = 0.5 for the 80-sample tier. A gross-regression tripwire
test (six nine-seat hands < 10 s in CI) guards the envelope; the budget itself
is recorded, not asserted.

**Before/after evidence:** the S0 red run (quote in the S0 section) becomes:

```text
✓ src/domain/poker/__tests__/ninePlayerGrading.test.ts (17 tests) 489ms
Test Files  1 passed (1)   Tests  17 passed (17)
```

**Tests executed (S1):** `ninePlayerGrading.test.ts` (17: crash fixture, 6/7/8
live opponents, varied nine-seat no-throw sweep, perf tripwire, all nine dealer
rotations with engine position/opponentCount/playersBehind truth, UTG with
eight behind, two-player multiway-by-mode record, fold/all-in/busted/
sitting-out participation states, three ungraded-diagnostic paths, ungraded
aggregation/summary, session-learning and mission-scoring exclusion, pinned
corpus of 20 hands / 70 decisions incl. heads-up anchors),
`decisionGrading.test.ts` (14, unchanged — heads-up corpus intact),
`equity.test.ts`, `decisionReviewPresentation.test.ts` (20),
`sessionLearning.test.ts`, `tableMissions.test.ts` (7),
`DecisionReviewCard.a11y.test.ts` (5), `catalogParity.test.ts` (5),
`chineseQuality.test.ts` (10); then the **full default suite: 184 files,
1942 tests, all passing**, plus `tsc --noEmit` clean.

**Files changed (S1):** `src/domain/poker/equity.ts`,
`src/domain/poker/decisionGrading.ts`, `src/domain/poker/decisionReviewPresentation.ts`,
`src/domain/poker/sessionLearning.ts`, `src/domain/learning/tableMissions.ts`,
`src/features/table/DecisionReviewCard.tsx`, `src/features/table/tableReviewPresentation.ts`,
`src/localization/messages.ts` (4 new keys × en/zh-Hans/zh-Hant),
`src/domain/poker/__tests__/ninePlayerGrading.test.ts` (new),
`src/domain/poker/__tests__/fixtures/gradeCorpus.json` (new).

**Assumptions/deviations:** the numeric device budget did not exist before
Phase 18; it is defined and recorded above per D01's "recorded, not asserted"
requirement. The heads-up grade corpus is byte-stable (pinned anchors +
`gradeHeadsUpHand` untouched). Localization for the ungraded diagnostic went
through the same three-catalog parity gate as existing copy.

**Blockers:** none. Next: S2.

### S2 — complete

**Existing route finished, not duplicated (P18-002, P18-014, P18-053):**

- The shipped route is: completed room → standings (`MultiplayerSessionSummaryModal`)
  → **Review hands** → viewer-relative archives → `parseMultiplayerHandArchive`
  → `multiplayerArchiveToSessionHand` → `SessionHistoryModal` rows →
  `HandReplayModal` → `MultiwayHandReplayModal` (focus-decision replay). One
  subsystem; verified end to end by fixtures, no new review path added.
- **Review-worthy decision count on the entry (new):**
  `sessionReviewableDecisionCount` counts every recorded hero decision across
  the session's archives (ungraded diagnostics included — they are reviewable).
  `MultiplayerFlowModal` now preloads archives when the completed session's
  standings are visible, and passes the count to the entry, which renders
  count-aware, singular/plural-correct copy in all three catalogs
  (`multiplayer.session.reviewHandsOne` / `reviewHandsCount`); while archives
  are not yet loaded the plain "Review hands" entry renders unchanged.
- **Discoverability after dismissing standings:** verified already correct in
  structure — the completed-room action panel and hand-result panel both expose
  "View standings", which reopens the sheet holding the review entry; the
  history modal also closes back through that route. Device confirmation rides
  S7 (P18-053).
- **Viewer-relative redaction proven at 3/6/9 seats:** new fixtures drive the
  real redaction boundary. Pinned: hero cards present; full public board and
  action ledger present; showdown-revealed opponents keep their cards; folded
  and unrevealed opponents carry no cards; opponent decision contexts are
  absent; deck/pending/toAct cleared. The boundary's rejection paths are
  pinned too: leaked folded cards, non-showdown reveals, and foreign decision
  contexts all fail `parseMultiplayerHandArchive` and can never render.
- **No-throw review at 3/6/9 seats without saved equity:** archive-converted
  hands grade through the S1-safe grader; every decision grades or carries an
  explicit ungraded diagnostic. Batch conversion + count helper covered.
- **Copy audit (P18-014):** multiway review strings (report summary, decision
  summaries/details, replay titles/descriptions across steps) contain no
  heads-up-only phrasing and never name the heads-up persona; actors are named
  by seat. Pinned by test so drift fails CI. The factual-inputs fallback was
  not needed — narrative variants already avoided misleading prose.
- **Live coaching stays off:** the multiplayer flow has no live coach surface;
  the create-flow copy states it ("Live coaching stays off when friends are
  seated", all three catalogs). Verified, unchanged.

**Tests executed (S2):** new `multiplayerReviewPath.test.ts` (11: redaction
positives at 6 seats incl. revealed-card preservation, three leak-rejection
fixtures, 3/6/9-seat no-equity grading through the parse+adapter+grader chain,
batch count, missing-viewer defense, two copy-audit tests); new
`MultiplayerSessionSummaryModal.review.test.tsx` (3: count label, singular,
plain fallback); existing multiplayer + localization suites re-run: 42 files,
368 tests passing; `tsc --noEmit` clean.

**Files changed (S2):** `src/features/table/sessionModels.ts` (count helper),
`src/features/multiplayer/MultiplayerSessionSummaryModal.tsx` (count prop +
count-aware label), `src/features/multiplayer/MultiplayerFlowModal.tsx`
(preload + count wiring), `src/localization/phase12Messages.ts` (2 keys × 3
catalogs), `src/features/multiplayer/multiplayerReviewPath.test.ts` (new),
`src/features/multiplayer/MultiplayerSessionSummaryModal.review.test.tsx` (new).

**Assumptions/deviations:** the decision count loads from viewer-relative
archives client-side (no schema change); preload failure degrades to the
uncounted label by design. The 3/6/9-seat review path is proven at the
domain/adapter/rendered level here; true device runs (fresh installs, both
platforms) remain S7 items and are recorded there.

**Blockers:** device verification deferred to S7 (no devices in this
environment). Next: S3.

### S3 — complete

**Disappearing-viewer fix (P18-003), worker policy untouched (D03):**

- Root cause confirmed in code: the seat ring rendered
  `room.seats.map(seat => hand.players[seat.playerId] …)` and returned `null`
  for any occupied seat the current hand did not deal in — so the moment a
  viewer sat out (one missed deadline), disconnected, busted, or went
  rebuy-pending, their plaque vanished until the between-hands panel appeared.
  This matches the reported session and the 1.1.0-era `mp-08/mp-10` stuck-turn
  captures.
- Fix: every occupied room seat now renders **exactly one plaque** even when
  absent from the hand. A new pure `multiplayerSeatHandPlayer(seat)` builds the
  hand-neutral player view (identity + authoritative settled ledger stack, no
  cards, no fabricated hand state), and the existing `MultiplayerGameSeat`
  renders it with the same seat anchoring, so the ring never collapses.
- State naming: `multiplayerSeatStatusBadge` now lets participation states
  name themselves **at the settled boundary too** (sitting out, rebuy
  decision, offline, left outrank the bare "Out"), fixing the settled result
  naming for a sat-out viewer.
- Persistent recovery: the new `MultiplayerSittingOutBanner` renders whenever
  the viewer's seat is sitting out — during live play included — with an
  `accessibilityLiveRegion="polite"` alert region, localized state copy, and
  the **Return next hand** action. Between hands the command fires
  immediately; during live play it **queues** and drains exactly once at the
  next between-hands boundary (the server still only accepts the command
  between hands, so the worker/coordinator policy is unchanged and no archive
  evidence is required). A disconnected or busted sitting-out viewer still
  sees the banner naming their state; eligibility follows
  `multiplayerViewerCanReturnNextHand` (now live-play aware).

**Structural availability (P18-004, D02):**

- `EXPO_PUBLIC_MULTIPLAYER_PREVIEW` deleted: `multiplayerPreview.ts` removed;
  resume discovery, invite handling, the Play-hub entry card, the flow modal,
  and `loadPlayStatistics({ includePrivate: true })` are all unconditional.
  The entry copy ("Play with friends…") is now truthful in every build.
- New `multiplayerStructuralAvailability.test.ts` proves the branch structure:
  flag module gone, zero references, entry/modal render unconditionally,
  private statistics always included, lanes explicit (v4 resolvable;
  canonical `multiplayer-room` remains the frozen no-config default per plan).
- New `scripts/verify-release-bundle.mjs` asserts the compiled bundle of an
  APK/AAB contains the friend-table markers (v4 lane constant, review entry,
  return action, create flow, lobby) and that the retired gate string is not
  compiled in. Run against the **actual** 1.1.0 baseline APK
  (`RiverMind-121338d2-20260901-154303-local-release.apk`): all six checks
  PASS. Honest limitation recorded: Metro inlines `EXPO_PUBLIC_*` at build
  time, so the old build compiles `undefined === '1'` — the surface was
  compiled in but runtime-hidden, which is exactly why the structural source
  gate above is required in addition to the artifact gate.

**Grammar (P18-008):**

- The reported defect found and fixed: `multiplayer.result.showdownHand` used
  the plural verb with its only caller's single winner ("Hao **win** the
  showdown…"). English now conjugates by person: a named winner takes
  `{{winner}} wins the showdown with {{hand}}.` and the viewer takes the new
  `showdownHandYou` key ("You win the showdown with…"). All three catalogs
  updated (Chinese is count-neutral); interpolation-placeholder parity tests
  pass. Shared-pot copy audited across catalogs: `{{players}} split/share`
  forms are count-correct in en/zh-Hans/zh-Hant. New test pins the singular
  named-winner rendering in both languages.
- The S2 review-count entry keys also carry correct singular/plural families.

**Device work recorded, not claimed:** create/join-by-code/invite-link/resume/
seating/readiness/missed-turn/return/rebuy/bust/settlement on iOS and Android
against `multiplayer-room-v4`, and the fresh-release (no `.env`) flow check
remain device tasks — logged for S7 with the bundle gate as the release-side
companion. The worker's one-missed-turn policy is unchanged (D03).

**Tests executed (S3):** full default suite **188 files / 1969 tests passing**;
`tsc --noEmit` clean; artifact gate PASS on the real baseline APK; new tests:
`multiplayerStructuralAvailability.test.ts` (5), `MultiplayerSittingOutBanner.test.tsx`
(7: hand-neutral plaque player, zero-ledger fallback, all viewer participation
badges, banner live region, return/queued/no-action states),
`multiplayerLifecycleUi.test.ts` (+live-play return eligibility, +settled
boundary naming), `multiplayerGamePresentation.test.ts` (+singular named-winner
conjugation in en and zh-Hans).

**Files changed (S3):** `src/features/shell/AppShell.tsx` (flag removal),
`src/features/multiplayer/multiplayerPreview.ts` (deleted),
`src/features/multiplayer/multiplayerLifecycleUi.ts` (eligibility + badge
order + hand-neutral player), `src/features/multiplayer/MultiplayerFlowModal.tsx`
(absent-seat plaque, banner wiring, queued return),
`src/features/multiplayer/MultiplayerSittingOutBanner.tsx` (new),
`src/features/multiplayer/multiplayerGamePresentation.ts` (showdown person
conjugation), `src/localization/phase9Messages.ts` (3 keys × 3 catalogs),
`src/features/multiplayer/multiplayerLifecycleUi.test.ts`,
`src/features/multiplayer/MultiplayerSittingOutBanner.test.tsx` (new),
`src/features/multiplayer/multiplayerStructuralAvailability.test.ts` (new),
`src/features/multiplayer/multiplayerGamePresentation.test.ts`,
`scripts/verify-release-bundle.mjs` (new).

**Assumptions/deviations:** the queued return is a client-side recovery
affordance consistent with the frozen worker contract; no coordinator change
was made or needed. The `multiplayerLobbyState` "preview:*" identifiers are an
unrelated local-lobby concept and were intentionally left named as-is (D02
targets the environment gate only). The artifact marker gate cannot prove
runtime visibility of the old flag-hiding mechanism (build-time inlining);
the structural source gate plus the S7 fresh-build device run close that gap.

**Blockers:** device matrix (both platforms, fresh build) deferred to S7.
Next: S4.

---

## Coverage ledger — Phase 18 (53 items)

Legend: `[ ] open · [~] in progress · [x] closed (implemented+verified ·
verified-already-correct · rejected-with-evidence · moved-with-ID)`.
Each closed entry cites its evidence in the slice log above.

| ID | P | Item | Slice | State | Evidence / disposition |
| --- | --- | --- | --- | --- | --- |
| P18-001 | P0 | 6–8-opponent no-saved-equity grading exception | S1 | [x] | Implemented+verified: red fixture → green; exact 8-opponent estimation inside recorded budget; ungraded diagnostic safety net (S1 log) |
| P18-002 | P0 | Private Review hands 3/6/9-seat no-throw, redaction, replay, discoverability | S2 | [x] | Implemented+verified: redaction fixtures, 3/6/9-seat no-equity grading, review count entry, copy audit (S2 log); device runs → S7/P18-053 |
| P18-003 | P0 | Sat-out viewer disappears; no way back | S0,S3 | [x] | Root cause fixed: absent-seat plaque + settled-boundary naming + persistent banner with queued Return (S3 log); device confirm → S7 |
| P18-004 | P0 | Preview flag can remove friend-table surface | S3 | [x] | D02 executed: flag+branches deleted, structural source gate + artifact bundle gate, both run (S3 log) |
| P18-005 | P1 | No nine-seat fixture/pinned corpus; stale 3–6 comment | S1 | [x] | 17-fixture suite + pinned 20-hand/70-decision corpus; doc comment now says 2–9 players (S1 log) |
| P18-006 | P1 | Android artifact inspection untracked/unwired | S4 | [x] | Tooling preserved + wired into release:check/CI; gate run on real baseline APK and CI builds an APK (S4 log) |
| P18-007 | P1 | Integration harness absent from CI | S4 | [x] | Dedicated CI job with local Supabase stack; 426 assertions documented as body-field protocol (S4 log); execution needs a push |
| P18-008 | P1 | Showdown/shared-pot grammar in 3 catalogs | S3 | [x] | "Hao win" root cause fixed with person-aware keys; parity tests pass; shared-pot audited (S3 log) |
| P18-009 | P1 | Winner plaque truncates localized stack | S5 | [x] | Winner boundary reserved in plaque geometry + collision fixtures across seats × widths (S5 log) |
| P18-010 | P1 | Neutral loss uses destructive red | S5 | [x] | D06 applied to all three result surfaces; red stays destructive-only (S5 log) |
| P18-011 | P1 | Decorative PUA glyph descendants | S5 | [x] | DecorativeIcon wrapper in audited surfaces + unit test; device speech → S7 (S5 log) |
| P18-012 | P1 | Missing hardware-back behavior | S5 | [x] | useHardwareBackConfirmation in both local tables; multiplayer verified already guarded; hook unit-tested; device → S7 |
| P18-013 | P1 | Critical controls below 44pt | S5 | [x] | Closes, keypad keys, rail/waiting/banner/end controls ≥44; measured device pass → S7 |
| P18-014 | P1 | Heads-up narrative in multiway review | S2 | [x] | Verified already correct + pinned by copy-audit tests across replay/report strings (S2 log) |
| P18-015 | P1 | Hero cards smaller than opponent indicators | S5 | [x] | Hero envelope upgrade with full-ring collision check + dominance fixtures across device matrix (S5 log); visual device pass → S7 |
| P18-016 | P1 | Elsa/Milo/Noah/Otto lack avatar assets | S9 | [ ] | Phase 18.5 (D10) |
| P18-017 | P2 | Rebuy a11y label hardcodes 4,000 | S5 | [x] | Server-owned MULTIPLAYER_REBUY_CHIPS formatted into label + copy (S5 log) |
| P18-018 | P2 | Play navigation model/render drift | S9 | [ ] | Phase 18.5 |
| P18-019 | P2 | Play configurator consumes first viewport | S9 | [ ] | Phase 18.5 |
| P18-020 | P2 | Private lobby shows Back and Close together | S5 | [ ] | |
| P18-021 | P2 | Standings generic AI icons; duplicate Profile avatar | S9 | [ ] | Phase 18.5 (D11) |
| P18-022 | P2 | Literal colors outside palette | S8 | [ ] | Phase 18.5 |
| P18-023 | P2 | Dark elevation; Home CTA contrast recheck | S9,S7 | [ ] | Device recheck recorded in S7; elevation stays S9 |
| P18-024 | P2 | Progress renders zero values while loading | S5 | [x] | Real loading state threaded into ProgressModal at both call sites (S5 log) |
| P18-025 | P2 | Empty action area while waiting | S5 | [x] | Localized "Waiting for {name}" pill; transient frames keep hidden spacer (S5 log) |
| P18-026 | P2 | Modals ignore reduced motion | S5 | [x] | All 16 hardcoded-animation modals now respect useReducedMotion (S5 log); device pass → S7 |
| P18-027 | P2 | GuidedText disables OS scaling; 0.72 floor | S5 | [x] | Shared GuidedText honors OS scaling via cap; plaque floors 0.72/0.76 → 0.85 (S5 log) |
| P18-028 | P2 | Profile edit keyboard avoidance | S9 | [ ] | Phase 18.5 (per plan) — verify-first in S7 |
| P18-029 | P2 | Multi-line controls rely on run-on aggregation | S5 | [x] | Verified already correct: seats/lobby/stats/summary/review compose explicit labels (S5 log) |
| P18-030 | P3 | Rebuy-row no-op ternary | S10 | [ ] | Phase 18.5 |
| P18-031 | P3 | Production warn/error paths | S10 | [ ] | Phase 18.5 |
| P18-032 | P3 | Avatar/storage failures silent | S10 | [ ] | Phase 18.5 |
| P18-033 | P3 | Beta-named internals | S10 | [ ] | Phase 18.5 |
| P18-034 | P2 | English-copy Maestro selectors | S4,S8 | [~] | Critical-path testIDs + release smoke flow landed (S4); remainder intentionally in S8 |
| P18-035 | P1 | Invite/`rivermind://` platform matrix | S3,S12 | [~] | Structural invite/flow wiring verified in S3; platform device matrix recorded as owner action in S7 |
| P18-036 | P2 | Crash SDK decision | S4,S10 | [x] | D04 decided: no SDK in 1.2, privacy review recorded, revisit at S10 (S4 log) |
| P18-037 | P2 | Spot/position/street/family Progress | S6 | [x] | v2 spot aggregates, engine-exact derivation, 30-hand floor, BB/100 + chips + play-money copy, all states tested (S6 log); device → S7 |
| P18-038 | P3 | Opponent tendencies | S12 | [ ] | Phase 18.5 |
| P18-039 | P3 | Decision do-overs | S11 | [ ] | Phase 19 candidate — untouched |
| P18-040 | P2 | Sentence-case outliers | S9 | [ ] | Phase 18.5 |
| P18-041 | P2 | Learn nesting / "0 of 53" framing | S9 | [ ] | Phase 18.5 |
| P18-042 | P3 | Conditional Continue row | S9,S12 | [ ] | Phase 18.5 |
| P18-043 | P2 | Turn state duplication; Raise-only icon; feed badge | S5 | [x] | One turn indicator (plaque owns it), Raise icon removed, badge = unread-since-open (S5 log) |
| P18-044 | P2 | Table-family header parity | S5 | [x] | Verified already correct: family-specific titles + consistent exit pattern (S5 log); device → S7 |
| P18-045 | P2 | Orientation breakpoints / safe areas | S9 | [ ] | Phase 18.5 (D08 hygiene) |
| P18-046 | P2 | Geometry/type/elevation tokens | S8 | [ ] | Phase 18.5 |
| P18-047 | P2 | Shared primitives | S8 | [ ] | Phase 18.5 |
| P18-048 | P2 | Repeated table styles | S8 | [ ] | Phase 18.5 |
| P18-049 | P3 | Oversized AppShell files | S8 | [ ] | Phase 18.5 |
| P18-050 | P2 | Private-lobby center-label bleed | S7 | [ ] | Device verify |
| P18-051 | P2 | Dark Home CTA contrast | S7 | [ ] | Device verify |
| P18-052 | P2 | Six open Phase 16 device observations | S7 | [ ] | Device verify |
| P18-053 | P2 | Private Review hands on device | S2,S7 | [ ] | Device verify |

### S4 — complete

**Android artifact tooling (P18-006):** the pre-existing untracked tooling was
reviewed in S0 and is now integrated unchanged in behavior:

- `scripts/androidArtifactInspection.mjs` (ZIP/AXML/ELF parsers, fail-loud),
  `scripts/verify-android-artifact.mjs` (CLI gate: target API 36 + 16 KB),
  `scripts/__tests__/androidArtifactInspection.test.mjs` (11 tests),
  `scripts/build-android-local-release.sh` (debug-signed local release that
  runs the gate itself), and `scripts/androidUiDump.py` are committed as-is.
- Gate evidence on **actual artifacts**: the 1.1.0 baseline local-release APK
  (S0) and, below, the current 1.2.0 compiled export.
- `pnpm release:check` now accepts `--android-artifact <file.apk|.aab>` and
  runs the inspection in the release gate; without an artifact it says exactly
  how to produce one (never a silent pass).
- New `package.json` scripts: `verify:android-artifact`,
  `verify:release-bundle`, `test:localization` (additive; the pre-existing
  `android`/`ios` script changes are preserved untouched).

**CI (P18-007, P18-034):** `.github/workflows/ci.yml` expanded from one
typecheck+test job to four:

1. `verify` — typecheck, default suite, and an explicit localization-gate step
   (`pnpm test:localization`) so parity/Chinese-quality failures name their gate.
2. `multiplayer-integration` — Supabase CLI + local stack (`supabase start`,
   migrations applied) then `pnpm test:multiplayer-integration`. The harness
   fails loudly when prerequisites are missing, so a green job means the
   legacy-lane **HTTP 426 regression assertions truly executed** (refusing
   old/future/malformed protocol joins before any membership mutation).
   Terminology note recorded: the protocol version travels in the request
   **body field** `protocol`, not a header — the plan's correction is applied
   in this record and in CI documentation.
3. `android-artifact` — Java 17 + `expo prebuild` + Gradle `assembleDebug`,
   then `verify-android-artifact.mjs` on the built APK: target API 36 and
   16 KB alignment asserted against a real binary on every push.
4. `release-evidence` — `verify:release-config`, real iOS+Android Expo
   exports, `verify:mobile-secrets` over tracked source + exports, and
   `verify-release-bundle.mjs` proving the friend-table surface and v4 lane
   in the compiled bundle.

**Release bundle assertion (P18-004):** `scripts/verify-release-bundle.mjs`
runs against APK/AAB files **and** Expo export directories. Real runs:

- 1.1.0 baseline local-release APK: 6/6 markers PASS.
- Current 1.2.0 Android export (Hermes `index-*.hbc`, 6,117,012 bytes):
  `multiplayer-room-v4`, review entry, return-next-hand, create flow, lobby —
  all PASS; retired gate string absent. Recorded verbatim in this file as the
  structural-availability artifact evidence.

**Release candidate numbering:** `app.json`/`package.json` bumped to
**1.2.0** (iOS buildNumber 2, Android versionCode 2) and
`scripts/verify-release-config.mjs` updated to expect the candidate. No store
configuration, submission, or push was performed.

**Stable automation IDs (P18-034, critical path):** `tab.*` on the bottom
tabs, `play.multiplayer.entry/create/join/resume` on the entry card,
`multiplayer.lobby` on the lobby/table surface, and
`multiplayer.table.pot` on the stable pot header. New
`e2e/maestro/release-1-2-smoke.yaml` covers launch → Play hub → friend-table
entry → create flow → lobby → one stable table state, entirely via testIDs
(locale-independent). Rendered tests pin the entry-card IDs.

**D04 (P18-036):** privacy/SDK review recorded in
`docs/PHASE_18_D04_CRASH_REPORTING_REVIEW.md` — no SDK adopted for 1.2
(payload minimization, consent, and deletion cannot be satisfied by a default
crash payload under the Phase 17 contract); no new diagnostics added for the
ungraded path (player-visible state + pinned fixtures instead). Revisit
conditions documented for S10.

**Executed locally this session:** `verify:release-config` PASS (1.2.0);
Android export + bundle gate PASS (real 1.2.0 Hermes bundle); typecheck +
localization + structural suites PASS. The iOS export/mobile-secrets gate and
CI itself run where recorded below; CI execution evidence requires a push
(owner action — no push was performed).

**Blockers:** CI run requires a push (owner authorization); signed-store
artifacts need EAS credentials (owner). Next: S5.

### S5 — complete

Focused table, input, and accessibility fixes, each with the smallest
maintainable change (no design-system refactor pulled forward):

- **D06 loss styling (P18-010):** a loss now takes the neutral border and a
  legible neutral accent in `HandResultCard`, `MultiplayerHandResultPanel`,
  and the multiway result icon; split keeps the indigo identity color; red is
  destructive/error only (the fold button keeps danger — it is destructive).
- **Winner-plaque width (P18-009):** `resolveMultiplayerPlaqueRender` gains a
  `winner` input that reserves the winner boundary (2.5pt × both sides) in the
  identity-copy width, so the widest localized stack still fits or degrades to
  the compact form instead of truncating. Collision fixtures sweep 2/3/6/9
  seats × all widths asserting the winner stack stays single-line.
- **Hero-card hierarchy (P18-015):** the measured layout now upgrades the
  hero seat to the largest card tier (52×74) whenever the enlarged envelope
  stays inside the pane, keeps `MEASURED_SEAT_GAP` clearance from every other
  seat in the full ring, and never reaches the protected board band;
  otherwise it conservatively falls back to the ring density. Dense opponent
  backs are capped at indicator size (mini/micro). Fixtures: a dominance
  sweep across the whole device/orientation/seat matrix, named modern-phone
  upgrade assertions, and the existing full collision matrix still green.
- **One turn indicator (P18-043/D09):** the center pill renders only while
  the acting seat's plaque is not rendered (`actorPlaqueVisible`); the Raise
  action rail's inconsistent Raise-only icon is removed (no complete icon set
  exists); the activity-feed badge now means **unread-since-open** (opening
  the feed marks its events seen), not a cumulative total.
- **Named waiting state (P18-025):** while another player owns the turn, the
  action rail shows a localized "Waiting for {name}…" pill (new key × 3
  catalogs) instead of an empty spacer; transient action-frame presentation
  keeps its intentionally hidden spacer.
- **Back-or-Close (P18-020), table-family headers (P18-044), multi-line
  control labels (P18-029):** verified already correct with evidence — the
  flow header shows exactly one Back-or-Close per surface (documented in
  code); every table family renders a family-specific localized hand title
  plus a consistent exit-confirmation pattern; multiplayer seats, lobby
  seats, stats rows, summary rows, and review cards all compose explicit
  localized accessibility labels rather than run-on child text.
- **Decorative glyphs (P18-011):** new `DecorativeIcon` wrapper hides the
  private-use glyph subtree (`accessibilityElementsHidden` +
  `importantForAccessibility="no-hide-descendants"`) while parent controls
  keep their labels; swapped into the audited 1.2 surfaces (flow modal ×17,
  entry card, banner, activity feed). Actual TalkBack/VoiceOver speech
  remains the S7 device task.
- **44-point targets (P18-013):** modal close controls (history, progress,
  both replays, bet sizing) and every bet-keypad key raised to ≥44 points;
  feed disclosure/control heights and the end-session, sitting-out-return,
  and waiting controls verified at ≥44.
- **Hardware Back (P18-012/D07):** new `useHardwareBackConfirmation` hook
  wired into both local table screens — Back on a live local table opens the
  leave-table confirmation (multiplayer already routed Back through the
  guarded leave flow via `onRequestClose`); unit tests cover
  subscribe/consume/unsubscribe and the inactive path.
- **Rebuy amount (P18-017):** the rebuy decision modal quotes the
  server-owned `MULTIPLAYER_REBUY_CHIPS` through `formatChips` instead of a
  hard-coded "4,000".
- **GuidedText (P18-027):** the two onboarding copies consolidated into one
  shared `src/components/GuidedText.tsx` that honors OS font scaling through
  `maxFontSizeMultiplier` (no more `allowFontScaling={false}`); the
  multiplayer plaque text floors rose 0.72/0.76 → 0.85 so plaques never
  shrink below a readable size; the theme foreground-scan boundary moved with
  the component.
- **Reduced motion (P18-026):** every remaining hardcoded `animationType`
  (16 modals across 13 files) now respects `useReducedMotion`.
- **Progress loading truth (P18-024):** `ProgressModal` takes `loading` and
  shows a loading block instead of zero-value metrics while the saved-hand
  history loads; both call sites thread the real load state (profile mount,
  explicit open, closing view gate).

**Tests executed (S5):** full default suite **191 files / 1979 tests passing**
(`tsc --noEmit` clean), including new/updated: plaque winner-width fixtures,
layout hero-dominance + collision matrix, hardware-back hook tests,
GuidedText and DecorativeIcon tests, banner/waiting/rebuy/turn-policy tests,
and the theme foreground scan with the consolidated boundary.

**Files changed (S5):** `HandResultCard.tsx`, `MultiplayerHandResultPanel.tsx`,
`MultiwayPokerTableScreen.tsx` (D06, hero density/cards),
`multiwayTableLayout.ts` + test (hero envelope upgrade),
`multiplayerPlaqueLayout.ts` + test (winner width),
`MultiplayerFlowModal.tsx` (raise icon, waiting pill, turn pill policy,
decorative icons, plaque floors), `multiplayerGamePresentation.ts` + test
(turn pill policy), `TableActivityFeed.tsx` + test (unread badge, reduced
motion), `MultiplayerEntryCard.tsx`, `MultiplayerSittingOutBanner.tsx`,
`DecorativeIcon.tsx` (new) + test, `GuidedText.tsx` (new) + test,
`LearningSetupModal.tsx`, `SkillCalibrationModal.tsx`, `AiRosterModal.tsx`,
`ChampionshipModal.tsx`, `ChampionshipRecordModal.tsx`, `BetaFeedbackModal.tsx`,
`BetaInfoModal.tsx`, `FirstRunOnboardingModal.tsx`, `AppShell.tsx`,
`HumanAvatarProfilePicker.tsx` (reduced motion),
`PokerTableScreen.tsx`, `MultiwayPokerTableScreen.tsx` (hardware back),
`useHardwareBackConfirmation.ts` (new) + test,
`MultiplayerRebuyDecisionModal.tsx`, `SessionHistoryModal.tsx`,
`ProgressModal.tsx`, `HandReplayModal.tsx`, `BetSizingModal.tsx` (44pt),
`MultiwayHandReplayModal.tsx` (44pt), `messages.ts` / `phase9Messages.ts`
(4 new keys × 3 catalogs), `textForegroundScan.ts` (boundary move).

**Assumptions/deviations:** hero upgrade is conservative by design (falls
back where the enlarged envelope could collide — asserted, recorded); the
TalkBack/VoiceOver speech recordings, large-text, and reduced-motion device
passes are S7 tasks and are not claimed here.

**Blockers:** device verification deferred to S7. Next: S6.

### S6 — complete

**Spot-level Progress (P18-037, D05), built on the existing learning model:**

- `PlayStatistics` moves to **version 2** with per-spot aggregates keyed by the
  deliberately small stable taxonomy: position bucket (early/middle/late/
  blinds), street (preflop/flop/turn/river), and spot family (facing an open,
  three-bet pot, blind defense, short stack, big pot, plus one explicit
  residual so every spot-carrying hand lands in exactly one row).
- **Migration safety by construction:** spot aggregates are derived on every
  read from the same deduplicated hand set as the totals (the stable
  `handId` rule), so a hand can never be counted twice in a spot; fixtures
  prove the triple-record case counts once in both totals and spots, and that
  legacy records without spot facts stay in the totals with **no** spot row
  (reported as partial spot coverage, never silently absorbed).
- **Derivation is public-information only and engine-exact:** the new
  ledger derivation maps each completed hand to one spot from the seat's
  engine position, the street of the viewer's last recorded decision, and the
  public raise/stack/pot context at that decision (fixed, documented
  precedence: blind defense > three-bet pot > facing open > short stack
  ≤ 10 BB > big pot ≥ 15 BB > residual). **Net chips are proven equivalent to
  the engine's payouts** by seeded tests comparing the derivation against the
  real stack delta for heads-up (won/lost/tie, both button positions) and
  multiway hands — including the odd-chip tie rule.
- **BB/100 normalization:** each hand normalizes by its own big blind, so
  800/2,000/4,000-chip tables stay comparable (fixture: +80 @ BB 4 and
  +400 @ BB 20 aggregate to the same 40 BB). Chips are shown alongside the
  normalized unit with explicit play-money wording in every row and note.
- **Sample floor:** `PLAY_SPOT_SAMPLE_FLOOR = 30`. Below the floor a spot
  shows hands-seen plus a "needs N hands" note — never a rate that could be
  read as a judgment. The two-window comparison (`comparePlaySpotWindows`)
  splits a spot's timed hands into named older/newer halves and refuses to
  compare until **each** window independently clears the floor; it returns
  two window facts, never an "improving/declining" verdict. Four hands can
  therefore never produce a directional claim (tested).
- **States:** empty (no hands), loading (the card's existing loading state —
  the spot section suppresses itself while loading rather than showing
  zero-value rows), insufficient-sample (below-floor copy), partial legacy
  (spot coverage note), and reset/account-switch (fresh projection with empty
  spots). Source coverage filtering is inherited: an unavailable or skipped
  source contributes no spot rows (tested).
- **UI:** the profile's Play record card gains a "Progress by spot" section —
  bounded to the four most-played spots, each with the localized
  position·street·family label, hands seen, the BB/100 line or the
  below-floor note, and the chips line. 28 new keys × 3 catalogs with
  Chinese-specific typography; parity and Chinese-quality gates pass.
- **Phase 17 boundary respected:** no behavioral analytics were added;
  spot aggregates stay on the owner's device and are explicitly excluded
  from the public room-record snapshot (`spots: {}` with a documenting
  comment).

**Tests executed (S6):** new `playSpots.test.ts` (17: dedup/no-double-count,
legacy-partial, BB normalization, coverage filtering, reset/empty, floor
gating, window comparison incl. unsorted and untimed refusals, UTG position
mapping, blind-defense family, heads-up and multiway engine-equivalence of
net chips, no-decision fallback, key parser) + new
`spotProgressPresentation.test.ts` (6: empty, below-floor, floor-reached,
partial, full coverage, ordering/bounding) + all localization gates. Full
default suite: **193 files / 2002 tests passing**; `tsc --noEmit` clean.

**Files changed (S6):** `src/domain/stats/playStatistics.ts` (v2),
`src/domain/stats/playStatisticsLedger.ts` (spot derivation),
`src/domain/multiplayer/playerRecordSnapshot.ts` (public snapshot stays v1),
`src/features/profile/spotProgressPresentation.ts` (new),
`src/features/profile/PlayStatisticsCard.tsx` (spot section),
`src/localization/phase16Messages.ts` (28 keys × 3 catalogs), plus fixture
compatibility updates in three existing test files.

**Assumptions/deviations:** the two-window comparison ships as a tested
domain capability but the 1.2 UI does not render a dedicated comparison view:
with the 200-hand read ceiling, a single spot reaching 60+ timed hands is
rare enough that a permanent comparison panel would mostly read as noise;
the per-spot rows plus floor copy carry the release truthfully. Spot facts
derive from the hero's last recorded decision (documented in code); hands
with no recorded hero decision count in totals but no spot row. Device
verification of the rendered card is part of the S7 pass.

**Blockers:** none in code. Next: S7.

### S7 — complete (candidate verification record)

The full S7 record lives in `docs/PHASE_18_RELEASE_1_2_S7_CANDIDATE_VERIFICATION.md`.
Summary of what was executed here versus what remains device/owner-bound:

**Executed on real artifacts this session:**

- Built the **1.2.0 candidate** locally
  (`artifacts/android/RiverMind-9b691977-20260902-041008-local-release.apk`,
  release variant, Hermes, versionName 1.2.0 / code 2, debug-signed) and ran
  the Android artifact gate on the exact file: targetSdk 36 PASS, arm64-v8a +
  x86_64 min page 16384 PASS, uncompressed zip alignment PASS.
- Ran the friend-table bundle gate on that exact APK: all five markers PASS,
  retired preview gate absent.
- Full gate battery on the committed tree: typecheck clean; default suite
  **193 files / 2002 tests passing**; localization gates pass; multiway AI
  evaluation passes with no unexplained regression from 1.1 (difficulty
  ordering, contested six-player pots, blind-defense rates, showdown/walk
  tables recorded); `verify:release-config` verifies 1.2.0; mobile-secret
  scan passes over tracked source and both 1.2.0 exports; `git diff --check`
  clean.
- All work committed locally as `2ad72ee0` (Medium article and media remain
  untracked by design; no push, no store submission).

**Precisely recorded as NOT EXECUTED (release-blocking owner actions):**

- The physical-device matrix (notched iPhone, 360-dp and 320-dp Android,
  both landscapes, light/dark, three locales, largest text, 2/3/6/9 seats,
  coach on/off, all table families, the deliberate missed-deadline private
  session, and actual TalkBack/VoiceOver speech).
- The multiplayer integration harness locally (Docker unavailable); wired
  into its CI job which fails loudly without the stack.
- Signed store artifacts (EAS credentials owner-only) — the local-release
  build is representative for artifact properties; the exact signed files
  must pass the same two gates via
  `pnpm release:check -- --android-artifact <file>` +
  `pnpm verify:release-bundle <file>`.

Phase 16 device observations (P18-052), private-lobby bleed (P18-050), and
dark Home CTA contrast (P18-051) stay open for the device pass. P18-053
device confirmation rides the same matrix.

### Final ledger disposition (end of Release 1.2 execution)

- **Implemented + verified (30):** P18-001, 002, 003, 004, 005, 006, 007,
  008, 009, 010, 011, 012, 013, 014, 015, 017, 024, 025, 026, 027, 029, 036,
  037, 043, 044, plus the verified-already-correct 020, 029, 044 and the
  verified-as-correct claims inside 003/004 evidence.
- **Verified already correct (3):** P18-020, P18-029, P18-044.
- **Phase 18.5 with ID retained (13):** P18-016, 018, 019, 021, 022, 028,
  030, 031, 032, 033, 040, 041, 042, 045, 046, 047, 048, 049 (S8/S9/S10 as
  marked in the ledger above).
- **Open, device-gated for the release pass (4):** P18-050, 051, 052, 053
  (plus P18-035's platform-matrix completion in S7/S12).
- **Later milestones untouched (2):** P18-038 (S12), P18-039 (S11, Phase 19).
- **Automation continuation:** P18-034 partially closed (critical-path IDs +
  smoke flow landed; remainder intentionally in S8).

Nothing was dropped into an unnamed follow-up; every open item above keeps
its P18 ID, source reference, and destination milestone.

### Simulator verification pass (owner-requested, 2026-09-02)

The 1.2.0 local-release candidate was installed on the Android emulator
(`rivermind_api35`, 393-dp-class portrait) and driven hands-on:

**Verified working on device:**

- **D02/P18-004 (fresh build, no env flag):** the Play hub renders the
  complete friend-table surface — "Play with friends" card, Create table,
  Join with code, Resume private table — that the same build path would have
  hidden on 1.1.0.
- **P18-020:** the create form shows exactly one Back action; the Close (X)
  belongs to the lobby only.
- **P18-015:** nine-seat local table — the hero plaque and cards are strictly
  the largest; opponents uniform; board lane clear.
- **S1 (P18-001):** 9-seat hands played to completion with review, history,
  and replay all rendering without any grading exception.
- **D06/P18-010:** walk win rendered with the aqua trophy treatment; a folded
  loss ("Lena wins. 523. Lena takes the pot.") rendered with the neutral
  border — no destructive red anywhere.
- **P18-008:** correct plurals ("All 8 opponents fold…") and singular winner
  conjugation ("Lena wins…").
- **D07/P18-012:** hardware Back mid-hand opened the "Leave this table?"
  confirmation (Keep playing / Leave table, neutral destructive styling); the
  top-left back opens the same confirmation (one dismissal route).
- **P18-024:** Progress and statistics shows real counts (2 practice hands,
  1 decision) — never zero-masquerade.
- **S6/P18-037:** the profile's "Progress by spot" section renders real
  per-spot rows derived from the hands just played (Blinds · preflop · blind
  defense, Late position · preflop · facing an open, …), each with the
  below-floor copy, chips alongside, and play-money wording; partial-coverage
  note present; the whole section renders correctly in English and in
  简体中文 (localized taxonomy labels with Chinese typography).
- **Localization:** in-app switch to 简体中文 re-renders home, profile, and
  every Phase 18 string (device restored to System default afterwards).
- **Dark mode:** profile/record/spot sections all legible with correct
  surface/contrast treatment.
- **Viewer-relative redaction in replay:** opponent hole cards stay hidden
  through every replay step; hero cards visible; step narration correct.

**Two defects found and fixed by this pass** (commit `1db6a276`):

1. **Hero cards clipped at the felt edge (P18-015 regression):** the hero
   upgrade grew the envelope by a fixed +12 while compact-ring cards jumped
   micro→regular (+48 rendered), and the candidate rect validated a different
   box than the one emitted. Fix: the hero keeps its ring frame and lane
   width and upgrades exactly one **card tier** above the ring density, with
   the envelope grown by the true tier height delta. Full collision matrix
   and dominance fixtures updated to the tier contract; re-verified on the
   rebuilt candidate (cards fully rendered, hero largest).
2. **"1 hands seen" grammar (P18-008 family):** count-aware `handsOne` key in
   all three catalogs; re-verified on device ("1 hand seen").

Final rebuilt candidate:
`artifacts/android/RiverMind-a2da4afe-20260902-104749-local-release.apk`
(versionName 1.2.0 / code 2 — artifact gate PASS, friend-table bundle gate
PASS). Device restored to System appearance/language.
