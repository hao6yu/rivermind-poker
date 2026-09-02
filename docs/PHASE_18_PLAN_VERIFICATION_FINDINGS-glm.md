# Phase 18 Plan Verification — Findings

**Scope:** claim-by-claim audit of `docs/PHASE_18_MULTIWAY_LEARNING_LOOP_SCOPE.md` against the
working tree at commit `121338d2` (1.1.0 v4 train), including git history, device artifacts in
`artifacts/android/device/`, and one runtime repro.

**Method:** every code-referencing claim in the plan was checked against the source it cites
(file, line, string, or symbol). Deployment/store claims (B1's timing anomaly, D1's TestFlight
screenshot, B4's Play-store reasoning) are owner observations and were assessed for internal
consistency with repo evidence only.

**One-line verdict:** Track B is mostly accurate and well-evidenced. Track A's central premise is
stale — the multiway grading loop and private-table review it proposes to build already exist and
ship — and the plan misses a proven crash bug inside the exact surface it targets.

---

## 1. Refuted claims

### 1.1 "Every graded decision the app shows today comes from `gradeHeadsUpHand`" — false

`gradeMultiwayHand` exists at `src/domain/poker/decisionGrading.ts:512` and was added
**2026-08-02** (commit `611d1bfd`, "Add deterministic post-hand decision grading (#35)").
It is wired into every multiway surface:

| Surface | Evidence |
| --- | --- |
| Local AI table (2/3/6/9 seats) | `MultiwayPokerTableScreen.tsx:639` (live report), `:674` (mission scoring) |
| Multiway replay | `MultiwayHandReplayModal.tsx:45`, dispatched from `HandReplayModal.tsx:33` |
| Session summary / history | `sessionModels.ts:60-62` routes multiway records to `gradeMultiwayHand` |
| Private multiplayer tables | `SessionHistoryModal.tsx` grades whatever hands it is given, including multiplayer-converted records |

The heads-up grader (`gradeHeadsUpHand`, `decisionGrading.ts:405`) is only ever fed heads-up
games (`PokerTableScreen.tsx:310`, `HandReplayModal.tsx:47`). The line the plan quotes
(`game.button === 'hero' ? 'BTN/SB' : 'BB'`, `decisionGrading.ts:431`) is real but unreachable
for multiway hands.

### 1.2 A1 "New multiway hand walker and grading" — already built

Everything A1 specifies exists today:

- Seat → position maps for 2–9 players: `multiway.ts:139-148` (`positionsByPlayerCount`,
  including 7/8/9-handed `UTG+1`/`MP`/`LJ`).
- Per-decision `position`, `playersBehind`, `opponentCount`, `initiative`, preflop
  raise/caller context, fold/all-in-aware pending pruning: `multiway.ts:491-555`
  (`multiwayDecisionContext`), `:459-479`.
- Reuse of `estimateFieldEquity` (`decisionGrading.ts:297`) and the preflop range path
  (`gradePreflopDecision`, `decisionGrading.ts:180-265`).
- Shared `DecisionComparison` / `HandDecisionReport` / `focusDecisionSequence`
  (`decisionGrading.ts:41-70`) — no fork of the replay surface.
- Nine-handed engine support landed 2026-08-28 (commit `405c6a9a`, "Extend shared poker engine
  and AI strategy to nine-handed tables", described as Slice 3.7 of the learning-loop scope):
  dealing, action order, side pots, button movement, invariants for 2–9 seats.

The plan's proposed fail-before fixture — "a 9-max hand where hero is UTG with players behind
must not receive a `BTN/SB` position or `playersBehind: 1`" — would **pass against the current
grader**. It tests behavior that already exists.

### 1.3 A5 "Private-table review" — already ships

- The private-table session summary has a **Review hands** button:
  `MultiplayerSessionSummaryModal.tsx:177-189` (`multiplayer.session.reviewHands`), wired in
  `MultiplayerFlowModal.tsx:3147` → `openSessionHistory()` (`:2542-2581`) →
  `loadMultiplayerHandHistory` → `multiplayerArchivesToSessionHands` → `SessionHistoryModal`.
- The adapter converts server archives to viewer-relative `MultiwaySessionHandRecord`s with an
  explicit redaction boundary (`multiplayerArchivePresentation.ts:40-59`): viewer mapped to
  `hero`, deck dropped, outcome/pots remapped.
- `SessionHistoryModal` grades those hands (`sessionHandDecisionReports`) and renders the
  learning summary — i.e. hero-only post-session review with grades already works at private
  tables.
- The product copy already promises it:
  `multiplayer.create.coachNote` = "Live coaching stays off when friends are seated. Private
  post-hand review remains available." (`phase9Messages.ts:21`).

A5 as written proposes to build what ships. Its real residue is verification/QA, not
implementation.

### 1.4 B2 "Icon glyphs reach the accessibility tree as PUA codepoints with no content-desc" — contradicted by in-repo device evidence

- The cited codepoints are real Ionicons glyphs: `0xf4ac` = `person-outline`, `0xf5de` =
  `time-outline`, `0xf133` = `arrow-forward` (verified against
  `@expo/vector-icons/.../glyphmaps/Ionicons.json`). So the lookup was real, not invented.
- However, the fresh device dumps (`artifacts/android/device/ui-9table.xml`, Sep 1, 15:21) contain
  **zero** occurrences of `\uf4ac`, `\uf5de`, or `\uf133` — neither as raw characters nor as XML
  numeric entities — across every checked-in dump.
- The same dumps show meaningful `content-desc` labels on the 9-max table controls ("Leave
  table", "Open multiway coach details", "Fold", "Call 20", "Raise", per-seat descriptors). In
  code, the cited icons sit inside labelled controls
  (`MultiwayPokerTableScreen.tsx:1296,1337,1342,1364,1375`).

"TalkBack announces garbage across the table screen" and "no content-desc" are not supported by
any evidence in the repository. This item should be downgraded from "fix" to "reproduce on device
with TalkBack before acting" (a dump is the structural a11y tree TalkBack reads; it shows labels,
not glyph garbage).

### 1.5 B5 "Add a regression test that … legacy `multiplayer-room` refuses capability-4 with 426" — the test already exists

- `src/services/__tests__/multiplayerLifecycleHttp.test.ts:640-699` asserts that joins,
  commands, and liveness carrying protocol 3 (or none) against the canonical worker are refused
  with **426 `multiplayer_update_required`**, that future protocols are refused the same way,
  that malformed protocol values are 400s, and that refused joins create no membership.
- The worker behavior exists: `supabase/functions/multiplayer-room/index.ts:382-384`.
- The genuine residual gap is narrower than the plan states: CI never runs that harness
  (`vitest.config.mts` excludes it from the default suite; it runs via
  `pnpm test:multiplayer-integration` against a local stack, `.github/workflows/ci.yml` invokes
  only `pnpm typecheck` and `pnpm test`).
- Wording nit: `protocol` is a JSON body field (`multiplayerRequest.ts:42` etc., value defined at
  `src/domain/multiplayer/contracts.ts:65` as `4`), not a header.

### 1.6 Smaller imprecisions

- **Locales.** The app ships **three** locale bundles — `en`, `zh-Hans`, `zh-Hant`
  (`src/localization/core.ts:20-31`; every catalog has three blocks). The plan's "both shipped
  locales" (exit gates) and "the Chinese locale" (B7) undercount; the `{{players}}` audit must
  cover three catalogs.
- **Maestro selectors.** 94 `text:` selectors (plan says ~93 — fine), but not "all": 2 `index:`
  and 2 `point:` selectors also exist. The English-copy dependence claim is otherwise accurate.
- **B7 artifact gate.** The tooling already exists untracked in the working tree
  (`scripts/verify-android-artifact.mjs`, `scripts/androidArtifactInspection.mjs` +
  `scripts/__tests__/androidArtifactInspection.test.mjs`, `scripts/build-android-local-release.sh`)
  asserting target API 36 and 16 KB page alignment. What is missing is only the CI wiring — do
  not rewrite it from scratch.
- **PlayStatistics shape.** The plan's `{ hands, tables, wins, splits, bySource, coverage }`
  omits `version` (`src/domain/stats/playStatistics.ts:90-98`). Substance of the claim (no
  spot/position/street/per-100 aggregate anywhere) is correct.
- **A1 "selection by seat count".** Current selection is by hand record mode
  (`sessionModels.ts:38-42`), which is more reliable than seat counting. Keep it.

---

## 2. Real bugs the plan missed

### 2.1 Proven crash: `gradeMultiwayHand` throws for 7+ live opponents without saved equity (reproduced)

`estimateFieldEquity` throws for `opponentCount > 5` (`equity.ts:28-30`:
`'Equity requires one to five unknown opponents.'`). `gradePostflopDecision` falls back to it
whenever the decision lacks a saved `estimatedEquity` (`decisionGrading.ts:295-303`), passing the
raw live-opponent count (`multiwayDecision`, `decisionGrading.ts:500`).

Runtime repro (executed in this working tree, then removed): a checked-down 9-max hand whose
hero actions carry no metadata produced a hero postflop decision with
`opponentCount: 8, estimatedEquity: undefined`, and `gradeMultiwayHand` threw
`Error: Equity requires one to five unknown opponents.`

Reachable from shipped surfaces:

1. **Private 9-max tables.** The coordinator applies every action without metadata
   (`coordinator.ts:701` AI, `:1107` commands, `:1249` timeouts), so **every** hero decision in a
   private-table hand lacks saved equity. Any 9-max private hand where the hero sees a flop with
   6+ live opponents crashes **Review hands** (`SessionHistoryModal` render) for that archive.
2. **Local mission / championship (competitive) mode.** `heroEquity` is forced `null`
   (`MultiwayPokerTableScreen.tsx:882-888`), so hero actions save `estimatedEquity: undefined`;
   the completed-hand report memo (`:636-656`) and mission scoring (`:674`) then throw.
   Casual local play is unaffected because hero equity is computed and saved there.

Crash surfaces: `MultiwayPokerTableScreen` (`localDecisionReport`, `missionResult` memos),
`MultiwayHandReplayModal.tsx:45`, `SessionHistoryModal` / `SessionSummaryModal` via
`sessionHandDecisionReports`.

Fix is small: clamp the fallback sample to 5 opponents (label it sampled) or guard
`gradePostflopDecision`; plus regression fixtures. The plan's own fixture discipline would have
caught this had it been pointed at the grader that exists.

### 2.2 Nine-max grading is implemented but untested, with a stale docstring

`decisionGrading.test.ts` exercises only 3- and 6-player multiway hands (e.g. `:202`, `:242`,
`:293`, and the varied fuzz at `:330-345` using `playerCount: 3 | 6`). No 9-max grading fixture
exists, and `gradeMultiwayHand`'s docstring still reads "Grades 3–6 player hands"
(`decisionGrading.ts:511`). This is the honest residual of A1: a fixture + docstring pass, not a
new walker.

### 2.3 B1's evidence trail exists in-tree and should be cited

`artifacts/android/device/mp-01..11-*.png` (Sep 1) document the on-device 9-seat AI-filled
multiplayer-v4 session investigation, including the stuck-state shots the B1 narrative rests on
(`mp-08-stuck.png`, `mp-10-stuck-turn.png`). The repro protocol in B1 should reference these
artifacts and the archive `participation` values they were captured alongside. The timing anomaly
itself (ten hands in under a minute) remains an owner observation — not verifiable from the repo
— and the plan is right to demand a repro before a fix.

---

## 3. Claims that verified cleanly

| Plan claim | Verified at |
| --- | --- |
| `equity.ts` exposes `estimateHeadsUpEquity` + `estimateFieldEquity` | `equity.ts:5,19` |
| Grader carries `position`/`playersBehind` per decision and calls `estimateFieldEquity` | `decisionGrading.ts:106,297,300` |
| Review surfaces exist (`HandReplayModal`, `SessionHistoryModal`, `handHistoryEvidenceController`, `session.reviewHands`) | `HandReplayModal.tsx`, `SessionHistoryModal.tsx`, `features/shell/handHistoryEvidenceController.ts`, `messages.ts:724` |
| No do-over / counterfactual / sampled-continuation code in `src/domain/poker` | `replay.ts` is deterministic recorded-hand replay; repo-wide symbol search negative |
| B1: `canStartMultiplayerSnapshot` requires every human seat `ready && online`; `viewerReady` reads the snapshot; "Waiting for players" is an unconditional static row; client cannot start with an unready creator | `multiplayerLobbyState.ts:122-127`; `MultiplayerFlowModal.tsx:1589,1745`; `phase9Messages.ts:54` |
| B3: `{{players}} win the showdown with {{hand}}.` renders singular subject with plural verb ("Hao win…"); same family in `playersWinShares` | `phase9Messages.ts:142,145`; `multiplayerGamePresentation.ts:527` |
| B4: no crash/error-reporting SDK | `package.json`, `app.json`, `plugins/` — no sentry/crashlytics/bugsnag/firebase/datadog |
| B6: flag gates resume / invite handler / flow modal / entry card at the cited lines; flag is `EXPO_PUBLIC_MULTIPLAYER_PREVIEW === '1'`; `.env` gitignored so fresh checkouts silently lose the surface; no build assertion that the entry renders | `AppShell.tsx:709,732,1996,2062`; `multiplayerPreview.ts:5`; `.gitignore:40`; `.github/workflows/ci.yml` |
| B7: CI runs only `pnpm typecheck` and `pnpm test` | `.github/workflows/ci.yml:31-35` |
| B8: `home.allGamesDescription` = "Friends, tournaments, custom tables, and training", ungated | `phase14Messages.ts:3`; `AppShell.tsx:1870` |
| Version 1.1.0; 9-max local AI and 9-seat private tables shipped | `app.json:4`; `TABLE_PLAYER_COUNT_OPTIONS = [2,3,6,9]` (`multiwaySession.ts:24`); commit `405c6a9a`; 9-seat multiplayer UI (`MultiplayerFlowModal.tsx:1601,1920`) |
| Create screen says live coaching off when friends seated | `phase9Messages.ts:21` |
| `rivermind://` scheme declared | `app.json:5` |
| Localization catalog + parity test exist (A4 premise) | `src/localization/catalogParity.test.ts` |
| Exit gate: Play requires target SDK 36 and 16 KB alignment | matches `scripts/verify-android-artifact.mjs` policy constants; Google Play policy dates quoted in that script |
| C1: opponent profile sheet copy on device matches the plan's quote verbatim | `mp-10-stuck-turn.png` ("Dex · AI · Pressure · Plays more hands, attacks capped ranges…") |
| Local `.env` routes to `multiplayer-room-v4` with preview on; canonical lane remains the resolver default | `.env`; `multiplayerEndpoint.ts:15-25` |

Owner-observation claims assessed but not verifiable from the repo: B1's timing anomaly, D1's
TestFlight screenshot, "1.1.0 approved on both stores", Phase 17 consent/event contract status
(`PHASE_17_BETA_INSIGHTS_SCOPE.md` exists; `aiCoachConsent.ts` is prior-phase coach consent, not
the Phase 17 event contract).

---

## 4. Recommendation

Do not approve the plan as written. Rewrite it around the verified state:

1. **Replace A1** with: fix the >5-opponent equity crash (§2.1), add 9-max grading fixtures
   (UTG-not-`BTN/SB`, `playersBehind` correctness, checked-down 9-max hand), fix the stale
   docstring, and prove heads-up grades unchanged with the existing regression suite. Est. ~1–2 d,
   not 4–6 d.
2. **Keep A2 (do-overs) and A3 (spot progress)** as the real build — both premises verified,
   nothing exists. These carry the release.
3. **Replace A5** with an end-to-end verification pass of the existing private-table review path
   (create → play → session summary → Review hands at 3/6/9 seats), plus the §2.1 fix it depends
   on.
4. **Downgrade B2** to "reproduce with TalkBack on device; only then fix" — in-repo evidence
   currently contradicts it.
5. **Narrow B5** to "wire the existing multiplayer integration harness into CI" (the 426
   assertions already exist), and correct "header" → body field.
6. **B6/B8 stand as-is** — strongest, fully verified items. Fold the existing untracked
   `verify-android-artifact.mjs` into B7 instead of writing a new gate.
7. **Fix locale counts** in exit gates and B7: three shipped catalogs (en, zh-Hans, zh-Hant).
8. **Cite the in-tree B1 artifacts** in the repro protocol.
