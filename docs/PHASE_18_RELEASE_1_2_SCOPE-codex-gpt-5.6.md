# Phase 18 — Release 1.2, followed by Phase 18.5 (Codex GPT-5.6)

Status: **draft for owner review — 2026-09-02.** This is a planning document,
not approval to begin implementation. It was written against `master` at
`9b691977`; the audited application baseline is still RiverMind Poker 1.1.0 at
`121338d2`. The commits after that baseline only publish the three source-agent
reports and remove the Medium draft from version control.

This plan reconciles:

- `PHASE_18_MULTIWAY_LEARNING_LOOP_SCOPE-qwen.md` from Qwen3.8 Flash Next;
- `PHASE_18_RELEASE_1_2_SCOPE-fable-5.1.md` from Claude Fable 5.1;
- `PHASE_18_PLAN_VERIFICATION_FINDINGS-glm.md` from GLM-5.3 Flash; and
- the independent Codex GPT-5.6 code, test, session-log, screenshot, and Android
  accessibility-tree audit.

The source documents remain useful evidence. They are not execution authority.
This document is the proposed execution authority after owner approval.

---

## 1. Outcome

Phase 18 makes RiverMind's multiway learning loop safe, visible, and useful
without rebuilding features that already exist:

> Every supported table size can finish and review a hand without crashing;
> private-table players can always see their own state and way back; release
> builds cannot silently lose friend tables; and Progress begins showing which
> parts of the player's game are actually moving.

Release 1.2 carries that outcome. The broader frontend work identified most
clearly by Claude Fable 5.1 becomes **Phase 18.5 — One Product UI Pass**. That
milestone owns the design system, shell consistency, identity, remaining
accessibility work, and lower-priority presentation defects. This gives us full
coverage without repeating the largest problem in Fable's plan: treating
several releases of good work as one minimum release.

The Phase 18/18.5 program is complete only when every item in the coverage
ledgers is one of:

1. implemented and verified;
2. verified as already correct;
3. rejected with evidence because the source claim was false; or
4. explicitly moved to a later named milestone with an owner and acceptance
   gate.

Nothing is silently dropped.

---

## 2. Verified starting point

The plan starts from these facts, not from the agents' original narratives.

### Already implemented — do not rebuild

- `gradeMultiwayHand` exists and is called by local multiway completion,
  mission scoring, replay, session history, and private-table history.
- The seat and position engine supports two through nine players.
- Private-table **Review hands** already loads viewer-relative archives, grades
  them, and opens multiway replay.
- The legacy-lane HTTP 426 regression assertions already exist in
  `multiplayerLifecycleHttp.test.ts`.
- Android target-SDK and 16 KB page-alignment inspection tools already exist in
  the working tree; they need review, commit, and CI integration.
- The product already has focus-area summaries and concept trends. It does not
  yet have longitudinal performance by position, street, stable spot family,
  or a normalized per-100-hand measure.

### Confirmed defects or gaps

- A nine-player review can throw when a hero decision has six to eight live
  opponents and no saved equity. `gradeMultiwayHand` falls back to
  `estimateFieldEquity`, which accepts at most five unknown opponents.
- Nine-player grading has no dedicated fixture or pinned-grade corpus, and its
  doc comment still says 3–6 players.
- A sat-out viewer can disappear from the private-table ring and cannot return
  until the between-hands panel appears.
- Friend-table entry, modal, invite handling, resume, and statistics are gated
  by `EXPO_PUBLIC_MULTIPLAYER_PREVIEW`; a fresh or differently configured
  release can silently lose the shipped feature.
- Singular showdown English can render as “Hao win”.
- Current CI does not run the multiplayer integration harness or the Android
  artifact inspection.
- The nine-player Android tree has meaningful labels on all 18 clickable
  controls in the captured screen, but it also exposes seven decorative
  private-use glyph text nodes. Actual TalkBack and VoiceOver behavior remains
  a device-verification task.
- The table and shell issues in Fable's defect register are largely real or
  reasonable verification targets, but they do not all block Release 1.2.

### Unresolved evidence

- The affected private-room archive has not yet proved that a missed deadline
  caused the observed disappearing-creator session. The source makes that the
  leading explanation, not a confirmed historical fact.
- Actual TalkBack and VoiceOver speech has not been recorded.
- Several Phase 16 fixes landed with automated coverage but still have unchecked
  device observations.
- Phase 17's consent and event contract is not assumed complete. Phase 18
  functionality must not depend on analytics, but success measurement may.

---

## 3. Scope and release model

### Release 1.2 — required

Release 1.2 includes S0–S7:

- evidence freeze and owner defaults;
- nine-player grading safety;
- completion of the existing private-review experience;
- friend-table trust and structural availability;
- release, CI, and localization gates;
- focused high-impact table and accessibility fixes;
- spot-level Progress; and
- signed-candidate device verification.

### Phase 18.5 — One Product UI Pass

Phase 18.5 owns S8, S9, S10, and S12:

- design-system foundations and safe refactors;
- shell, navigation-model, table, and identity consistency;
- remaining accessibility, input, loading, and diagnostic presentation work;
- opponent legibility and resumable-state delight; and
- any lower-priority S5 item moved across the 1.2 cut with its ID intact.

Phase 18.5 is a real milestone with its own entry conditions and device gate,
not a synonym for “later”. It may ship as 1.2.x or 1.3 depending on store
timing, but it does not hold the correctness-and-trust release.

### Later experiment — outside Phase 18.5

S11, decision do-overs, remains visible as a Phase 19 candidate. It came from
Qwen's product proposal and was refined by Fable, but it changes the product's
truth model and performance envelope. It should not be smuggled into a frontend
polish milestone merely because it needs a UI.

### Explicit non-goals

- No new seat count, game mode, tournament event, locale, public matchmaking,
  ranked ladder, real-money or coin economy, or account migration.
- No poker-rule, AI-strategy-band, schema, or worker change unless the owner
  later chooses a two-strike missed-turn policy.
- No solver-backed or “GTO” marketing claim and no unvalidated EV display.
- No simulation that claims what a human private-table opponent would have
  done.
- No brand or palette redesign.
- No navigation-library migration.

---

## 4. Decisions and default answers

The plan can be reviewed without answering every decision immediately. The
following defaults are recommended; an owner override must be recorded before
the affected slice begins.

| ID | Decision | Default |
| --- | --- | --- |
| D01 | More than five live opponents without saved equity | Never clamp silently. First test exact estimation through eight opponents against the device budget. If it misses the budget, return an explicitly ungraded diagnostic for that decision until a validated approximation exists. |
| D02 | Friend-table preview flag | Delete the flag and dead branches. Friend tables are a shipped capability, not a preview. |
| D03 | Missed-turn policy | Keep the current one-strike policy for 1.2, but make sitting-out visible and reversible. Revisit two strikes only with archive evidence and a separate worker rollout. |
| D04 | Crash reporting | Do not block 1.2 on an SDK. Run a privacy review against Phase 17 and adopt one only if payload minimization, consent, and deletion behavior are acceptable. |
| D05 | Progress unit | BB/100 for normalized learning comparison, with chips alongside and clear play-money wording. Gameplay screens remain chip-first. |
| D06 | Loss styling | Neutral border for a loss, aqua for a win, indigo for a split. Red remains destructive/error only. |
| D07 | Hardware Back during a live table | Open the leave-table confirmation. |
| D08 | Shell orientation | Keep the current portrait-only shell for 1.2; use shortest-side breakpoints and four-edge safe areas as hygiene. |
| D09 | Action-rail icons | Remove the Raise-only icon unless a complete, tested icon set is ready. Feed badge means unread-since-open or is removed. |
| D10 | AI personas without artwork | Keep the personas and author the four missing assets; use a temporary explicit fallback only during development. |
| D11 | Human preset avatars | Use initials on distinct colors unless six distinct authored marks are supplied. |
| D12 | Shell decomposition | File moves and component extraction only; no state-management rewrite in Phase 18. |
| D13 | Decision do-over budget | Spike with 200 seeded runs on a named low-end Android device. It is not a 1.2 commitment. |
| D14 | Phase 17 ordering | Product work may proceed. Product-usage claims remain manual or unreported until the consented event contract exists. |

---

## 5. Release 1.2 execution slices

### S0 — Freeze evidence and turn claims into tickets

Estimate: **0.5–1 day**.

Work:

- Record the application baseline, source-report commit, active worker lane,
  current store build numbers, and exact signed-candidate targets.
- Preserve the GLM nine-player crash as a failing automated fixture before
  changing the grader.
- Inspect the affected private-room archive if it is still available. Record
  `participation`, missed-turn state, timeout actions, and wall time per hand.
- Convert every item in Appendix A into an issue or checklist entry retaining
  the Phase 18 ID and source reference.
- Record decisions D01–D14 or their owner overrides.
- Re-run source counts before any design-system work; Fable's style counts are
  snapshots, not permanent truth.

Acceptance:

- No implementation ticket is justified by “not found” without a symbol
  search, imports/call sites, UI entry points, tests, history, and a relevant
  runtime boundary check.
- The failing crash fixture and archive-investigation note are linked from the
  implementation work.

### S1 — Nine-player grading safety

Estimate: **2–3 days plus performance measurement**.

Work:

1. Reproduce the no-saved-equity, eight-opponent exception through each
   reachable surface:
   - private nine-seat Review hands;
   - competitive local mission/championship completion;
   - session history; and
   - multiway replay.
2. Implement D01:
   - prefer an estimator that preserves the true opponent count through eight
     opponents if the named low-end-device budget passes;
   - otherwise return a non-crashing, explicitly ungraded diagnostic for the
     unsupported decision; and
   - never grade eight opponents as five without saying so.
3. Add fixtures for:
   - 2, 3, 6, and 9 players;
   - hero UTG and every dealer rotation;
   - correct `playersBehind` and `opponentCount`;
   - six to eight live postflop opponents without saved equity;
   - folds, all-ins, busted seats, and sitting-out seats;
   - competitive modes that suppress live equity; and
   - legacy hands with no decision snapshots.
4. Add a pinned corpus of representative heads-up and multiway reports so
   classifications and hand grades cannot drift silently.
5. Change the stale “Grades 3–6 player hands” comment.
6. Keep grader selection by record mode, not by inferred seat count.

Acceptance:

- No supported saved hand can throw while rendering completion, summary,
  history, or replay.
- A nine-player UTG fixture reports the engine's position and players behind;
  it never reports `BTN/SB` or `1` by heads-up shortcut.
- The heads-up corpus is byte-stable unless a separately approved grading
  change intentionally updates it.
- Performance and sampling semantics are recorded, not asserted.

### S2 — Finish the private-review path that already exists

Estimate: **1–2 days plus both-platform devices**.

Work:

- Do not create a second private-review subsystem.
- Verify create → join → play → settle → standings → **Review hands** → graded
  rows → focus-decision replay at 3, 6, and 9 seats.
- Verify viewer-relative redaction:
  - hero cards are present;
  - public board and actions are present;
  - legitimately revealed showdown cards remain visible; and
  - folded or otherwise private opponent cards never appear.
- Add a count of review-worthy decisions to the review entry.
- Offer the same review entry from the persistent session-summary route so
  dismissing standings does not make review undiscoverable.
- Keep live private-table coaching off.
- Audit review copy for heads-up language on multiway records. If narrative
  variants are not ready, show factual inputs instead of misleading prose.

Acceptance:

- All 3/6/9-seat device runs reach a graded row and replay without exception.
- A redaction fixture proves that review does not reveal unavailable cards.
- The review entry remains reachable after standings is dismissed.
- No private-table mid-hand coaching is introduced.

### S3 — Friend-table trust and structural availability

Estimate: **3–5 days plus both-platform devices**.

Work:

1. Resolve the disappearing-viewer report:
   - use the S0 archive result to confirm or reject the timeout/sitting-out
     explanation;
   - render exactly one viewer plaque while active, folded, all-in, sitting
     out, disconnected, busted, rebuy-pending, or otherwise absent from the
     current hand's participant list;
   - show a persistent sitting-out banner and **Return next hand** action during
     live play;
   - announce the transition through an accessibility live region; and
   - name the state accurately in the settled result.
2. Keep the current missed-turn policy under D03 unless evidence justifies a
   separately scoped worker change.
3. Remove `EXPO_PUBLIC_MULTIPLAYER_PREVIEW` from entry, modal, invite, resume,
   and statistics paths under D02.
4. Add a release-bundle assertion that the private-table entry and v4 lane are
   present.
5. Verify create, join by code, invite link, resume after termination, seating,
   readiness, missed turn, return, rebuy, bust, and settlement on iOS and
   Android against `multiplayer-room-v4`.
6. Fix ungated Home copy and any other text that can promise a surface absent
   from the compiled build.
7. Fix singular/plural showdown and shared-pot grammar across English,
   Simplified Chinese, and Traditional Chinese.

Acceptance:

- A sat-out viewer always sees their plaque, state, and way back.
- A rendered-state test covers every viewer participation state.
- A fresh release build with no local `.env` still exposes the complete friend
  table flow.
- Invite and resume work on both platforms.
- No current shipped string promises a compiled-out surface.
- All player-count grammar families pass all three catalogs.

### S4 — Release, CI, and artifact evidence

Estimate: **2–4 days**, excluding CI runtime.

Work:

- Review and commit the existing Android artifact scripts and their tests;
  preserve their target API 36 and 16 KB alignment checks.
- Integrate them into the correct release job; do not rewrite working tooling.
- Run the existing `test:multiplayer-integration` harness in a dedicated local
  Supabase CI job and retain the existing HTTP 426 assertions. Correct any
  planning language that calls the protocol body field a header.
- Add a small release smoke flow covering launch, friend-table entry, and one
  stable table state.
- Begin replacing English-copy Maestro selectors with stable `testID`s,
  prioritizing the 1.2 critical path. Track the remainder in S8.
- Keep release lanes explicit: capability 4 routes to `multiplayer-room-v4`;
  canonical `multiplayer-room` remains frozen.
- Run the D04 crash-reporting privacy/SDK spike. If no SDK is adopted, expand
  allowlisted local diagnostics for the new failure paths without collecting
  cards, actions, room codes, identity, free text, or raw exceptions.

Acceptance:

- CI executes typecheck, the default suite, the multiplayer integration job,
  Android artifact inspection, localization gates, and release-config/mobile-
  secret checks.
- Failed protocol joins create no membership and return the already-defined
  upgrade response.
- The release artifact, not just source configuration, proves friend tables and
  the v4 route are present.
- CI failures explain which gate failed without exposing secrets or user data.

### S5 — Focused table, input, and accessibility fixes

Estimate: **5–8 days plus device verification**.

This slice takes the high-impact product fixes from Fable without making a
design-system rewrite a prerequisite for correctness.

Table work:

- Make hero cards the largest cards in 2/3/6/9-seat portrait and landscape;
  spend surplus height on hero cards, board, then seat spacing, and cap dense
  opponent backs at indicator size.
- Keep one turn indicator. The hero plaque owns the state; a center pill exists
  only when the plaque is off-screen.
- Apply D06 result semantics and re-check payout/icon treatment.
- Reserve enough winner-plaque width for the widest localized stack plus its
  winner boundary; add collision fixtures.
- Apply the S3 always-visible viewer plaque.
- Apply D09 to the action rail and feed badge.
- Use one Back-or-Close action per table/lobby surface.
- Keep table-family headers consistent for local, Sit & Go, Championship,
  Daily, mission, and private modes.
- Render a named waiting state instead of an empty action spacer when another
  player owns the turn.

Accessibility and input work:

- Hide decorative glyph descendants while preserving the useful parent labels.
- Record actual TalkBack and VoiceOver behavior; do not infer speech from the
  tree alone.
- Give explicit localized labels to ambiguous multi-line controls instead of
  relying on run-on child-text aggregation.
- Raise critical controls to a 44-point target or equivalent hit area,
  including feed close, end-session, coach controls, replay/utility icons,
  range cells, feedback chips, and the bet keypad.
- Implement D07 Android hardware-back behavior.
- Replace the hard-coded rebuy “4,000” with the room buy-in.
- Consolidate `GuidedText`; remove disabled OS font scaling; use reflow or a
  readable floor for table plaques.
- Honor reduced motion for every modal.
- Thread real loading state into Progress rather than showing zero-value data.
- Verify and fix Profile name-edit keyboard avoidance.

Acceptance:

- Hero cards dominate the hierarchy without collision at 2/3/6/9 seats.
- Result, winner, waiting, and turn states each render once and remain legible
  in all three locales and largest supported text.
- Every captured clickable node has a useful label; decorative private-use
  glyph nodes are absent.
- Critical targets meet 44 points physically or through measured hit area.
- Hardware Back opens confirmation rather than abandoning or ignoring a live
  game.
- Reduced motion, large text, and keyboard behavior pass on devices.

### S6 — Spot-level Progress, the headline feature

Estimate: **4–6 days**.

Work:

- Extend `PlayStatistics` with a new version and migration-safe per-spot
  aggregates.
- Reuse existing decision reports, focus areas, and concept trends rather than
  inventing a second learning model.
- Aggregate by a deliberately small stable taxonomy:
  - position bucket: early, middle, late, blinds;
  - street: preflop, flop, turn, river; and
  - spot family: facing open, 3-bet pot, blind defense, short stack, big pot.
- Store hands seen and net result while retaining source/mode boundaries needed
  to prevent incompatible comparisons.
- Present D05 BB/100 with the chip result alongside and explicit play-money
  wording.
- Compare two clearly named windows only after a proposed 30-hand minimum per
  spot. Below the floor, show sample progress instead of directional judgment.
- Add empty, loading, insufficient-sample, partial-migration, and reset states.
- If Phase 17 is ready, measure review-open and Progress usage only through its
  consented typed contract. Otherwise ship without behavioral analytics.

Acceptance:

- Migration from the current statistics version is deterministic and cannot
  double-count a hand.
- Four hands can never produce an “improving” or “declining” claim.
- Values remain comparable across 800/2,000/4,000-chip tables because the
  normalized unit uses the applicable big blind.
- Reset, account switch, source filtering, and partial legacy data have tests.
- Copy never implies real-money performance or statistical certainty.

### S7 — Signed-candidate verification

Estimate: **2–3 device days**.

Run on the exact signed candidate:

- notched iPhone and a 360-dp Android baseline;
- a 320-dp Android layout check where supported;
- portrait and both table-landscape directions;
- light and dark schemes;
- English, Simplified Chinese, and Traditional Chinese;
- default and largest supported text;
- 2, 3, 6, and 9 seats;
- Coach on and off;
- local cash, Sit & Go, Championship, Daily/mission, and private tables;
- one private session where the viewer deliberately misses a deadline; and
- TalkBack and VoiceOver passes on the changed flows.

Recheck the still-open Phase 16 observations:

- coach-enabled bottom-seat containment;
- complete countdown copy at small width/large text/rebuy pending;
- compact continuation for fold, showdown, and split-pot results;
- sustained cheap-pot AI participation in 6- and 9-seat Club sessions;
- avatar replacement after terminate/relaunch; and
- one-tap reaction dismissal.

Also verify:

- old center-label bleed in the private lobby;
- dark Home CTA contrast;
- all 3/6/9-seat private-review paths; and
- all Release 1.2 defects in Appendix A with paired before/after evidence.

Acceptance:

- Results are recorded in a PR-style QA document with screenshots and build
  identifiers.
- There is no unchecked candidate item. A failure is fixed or explicitly blocks
  the release; it is not waived by omission.

---

## 6. Phase 18.5 — One Product UI Pass

Fable's broad audit is most valuable when treated as a focused frontend
milestone rather than as extra acceptance criteria attached to Release 1.2.
Phase 18.5 begins after the 1.2 candidate is accepted or frozen. It may absorb
lower-priority S5 work, but it does not reopen the grader, statistics contract,
friend-table protocol, or missed-turn policy without a new defect.

Entry conditions:

- Release 1.2 is accepted or its branch is frozen for store review.
- Every S5 item moved across the cut retains its P18 ID and before evidence.
- D08–D12 are confirmed before their affected work begins.
- Missing AI art is available, or the explicit temporary fallback is approved.
- The S7 matrix becomes the Phase 18.5 closing matrix for every changed screen.

### S8 — Design-system foundation and safe deduplication

Estimate: **8–13 days**, delivered incrementally after the 1.2 critical path.

Work:

- Add a named 4-point spacing scale, small radius set plus pill, compact/
  standard/primary control heights, documented typography and line-height
  tiers, per-scheme elevation, and centralized text-scaling ceilings.
- Create shared `Sheet`, `Button`, `IconButton`, `SectionCard`, `Eyebrow`,
  `ProgressBar`, `EmptyState`, `Banner`, `LoadingBlock`, and `GuidedText`
  primitives with stable test IDs and rendered fixtures.
- Extract the genuinely shared portions of the heads-up, local multiway, and
  private table style kits. Screen-specific geometry stays local.
- Extend style scans for literal surface/border/shadow colors and off-scale
  geometry/type, with an explicit escape hatch for measured table layouts.
- Move Home, Play, Profile, and Setup into focused files and extract shared
  shell components under D12. Do not combine this with a state-management
  rewrite.
- Retire remaining English-text selectors as stable IDs become available.

Acceptance:

- No P0/P1 fix is delayed waiting for a primitive.
- Each migration is behavior-preserving and can land independently.
- Rendered fixtures cover every primitive and shared table style.
- New duplication is test- or lint-detectable.
- Counts are measured after migration; target zero identical cross-table style
  definitions, not zero legitimate screen-specific styles.

### S9 — Shell, navigation-model, and identity polish

Estimate: **6–10 days plus artwork**.

Work:

- Compress the Play configurator so the first viewport reaches Games & Events;
  move difficulty and stack under Advanced with defaults visible.
- Make `PLAY_GROUPS` and the rendered Play hub agree; remove dead quick rows and
  duplicate custom-game entry.
- Reduce Learn to at most two visible card-nesting levels; make first-launch
  copy emphasize the next step rather than “0 of 53”.
- Show the human avatar once on Profile; apply D11 to preset choices.
- Use `AiAvatar` consistently in felt, lobby, standings, replay, history, and
  profile. Add assets for Elsa, Milo, Noah, and Otto under D10 and test that
  every persona maps to an asset.
- Fix dark-mode elevation and re-verify the Home CTA.
- Add one conditional Continue row for resumable Sit & Go, Championship, or
  private checkpoints; otherwise keep the whitespace.
- Document sentence-case policy and fix the identified English outliers across
  all three catalogs.
- Add keyboard avoidance and `keyboardShouldPersistTaps` to the relevant shared
  scroll primitive.
- Use shortest-side tablet detection and four-edge safe areas while retaining
  D08's orientation policy.

Acceptance:

- The Play model has a render-level contract test.
- Every AI persona has one consistent visual identity.
- Profile editing works with the keyboard open in one tap.
- Dark/light, three locales, and largest text pass for changed screens.

### S10 — Robustness, diagnostics, and hygiene

Estimate: **2–4 days plus the D04 decision**.

Work:

- Route player-visible avatar upload/resolution/cleanup/storage and hand-history
  failures through stable local diagnostics and one useful banner state.
- Preserve genuinely best-effort catches, but document why they are safe.
- Remove the rebuy-row no-op ternary.
- Replace or justify production `console.warn`/`console.error` paths.
- Decide whether old Beta-named components/settings should be renamed; if the
  rename would create churn with no user value, record rejection rather than
  leaving it perpetually “optional”.
- Complete D04. If an SDK is adopted, prohibit cards, boards, bets, room codes,
  names, avatar paths, free text, URLs, raw exception messages, and other Phase
  17-prohibited data from payloads.

Acceptance:

- A visible failure has a stable diagnostic and a recovery path.
- Best-effort failures are intentional and tested or commented.
- No new diagnostic path transmits prohibited poker or identity data.

### S12 — Opponent legibility and join/resume delight

Estimate: **4–7 days**.

Work:

- Extend the existing opponent profile with table-specific public tendencies:
  hands observed, fold-to-3-bet, and showdown frequency, sourced from existing
  device-local opponent memory.
- Make sample floors and “this table” scope visible so a persona label is not
  presented as evidence.
- Complete Android and iOS `rivermind://` and invite-link verification,
  including cold start, warm start, malformed link, expired room, wrong lane,
  and resume after termination.
- Revisit the Continue row from S9 with all supported checkpoint types.

Acceptance:

- No tendency appears before its sample floor or uses private information.
- All deep-link paths fail safely with localized recovery copy.
- Resume and invite behavior is covered by stable-ID device automation.

Phase 18.5 exit gate:

- `pnpm typecheck`, the full default suite, localization gates, rendered
  primitive fixtures, style scans, and changed-flow automation pass.
- The S7 scheme/locale/text-size/device matrix is rerun for every changed
  screen, with paired screenshots for its originating P18 items.
- Every AI identity resolves to the intended asset and every player-visible
  failure changed in S10 has a recovery state.
- No P18 item assigned to Phase 18.5 is left as an unnamed follow-up.
- The release notes distinguish behavior changes from internal consolidation.

---

## 7. Later experiment — Phase 19 candidate

### S11 — Decision do-over experiment

The S11 identifier remains stable even though this work now appears after S12.
It is intentionally outside Phase 18.5.

Estimate: **2–3 day spike; 6–9 implementation days only after approval**.

Work:

- AI tables only. Private human tables get no counterfactual opponent claim.
- Start from a graded hero decision and sample legal alternative continuations
  with the existing engine and AI profiles.
- Opponent cards hidden in the saved hand must be sampled from ranges
  conditioned on public actions; legitimately revealed cards remain fixed.
- Show a distribution over N seeded runs: win/tie/loss, chip range, N, seed,
  original line, and alternative line.
- Label the comparison “against RiverMind AI” and sampled, never historical.
- Chunk computation so input is not blocked for more than one frame on the
  named low-end Android device.
- Measure whether the range model is honest enough for teaching before building
  the full UI.

Acceptance:

- A written spike verdict covers truthfulness, performance, reproducibility,
  and product value.
- If any fails, reject or defer the feature with the evidence retained.
- If approved, tests prove card uniqueness, legal actions, seed stability,
  preserved reveals, and correct sampling labels.

---

## 8. Dependency and delivery order

```text
S0 evidence
  ├─> S1 grading safety ─> S2 private review ─┐
  ├─> S3 friend-table trust ──────────────────┤
  ├─> S4 release/CI gates ────────────────────┤
  └─> S5 focused UI/a11y ────────────────────┤
                         S6 Progress ─────────┤
                                             └─> S7 signed candidate

Phase 18.5 after the 1.2 critical path:
S8 foundation ─> S9 shell/identity ─> S10 robustness
                S3 + S9 stable IDs ─> S12 opponent/deep-link delight
                                      └─> rerun S7 matrix on changed screens

Separate Phase 19 candidate:
S1 + measured range model ─> S11 do-over experiment
```

Parallelism rules:

- S1 may proceed in parallel with S3 after S0.
- S2 waits for the S1 no-throw behavior.
- S4 can wire existing gates while S1/S3 are implemented.
- S5 may begin with isolated high-impact fixes; shared-primitives migration does
  not begin until S8.
- S6 can develop its data model in parallel but must integrate with the final
  S1 decision-report contract.
- S7 waits for a frozen signed candidate.
- Phase 18.5 may parallelize isolated S9 screen work with S8 primitives only
  where the screen will not immediately be migrated twice.
- S11 is planned separately and does not consume Phase 18.5 capacity.

---

## 9. Release gates

The Release 1.2 candidate must pass:

- `pnpm typecheck`;
- `pnpm test`, including the new crash, nine-player, redaction, statistics,
  participation-state, rendered-state, and localization coverage;
- `pnpm test:multiplayer-integration` in its dedicated environment;
- `pnpm eval:multiway-ai` with no unexplained regression from 1.1;
- `pnpm verify:release-config` and `pnpm verify:mobile-secrets`;
- Android target API 36 and 16 KB alignment inspection on the actual artifact;
- friend-table entry and v4-route assertion on the actual artifact;
- catalog parity and Chinese quality for en, zh-Hans, and zh-Hant;
- `git diff --check`; and
- the S7 signed-candidate matrix with recorded evidence.

No gate is satisfied by source inspection when the risk exists only in the
built artifact or on a device.

---

## 10. Estimates and cut line

These are planning ranges, not commitments.

| Slice | Estimate | 1.2 status |
| --- | ---: | --- |
| S0 evidence and decisions | 0.5–1 d | Required |
| S1 grading safety | 2–3 d + perf | Required |
| S2 private review completion | 1–2 d + devices | Required |
| S3 friend-table trust | 3–5 d + devices | Required |
| S4 release/CI evidence | 2–4 d | Required |
| S5 focused table/a11y | 5–8 d + devices | Required; split only by priority with ledger retained |
| S6 spot-level Progress | 4–6 d | Required headline |
| S7 signed-candidate QA | 2–3 device d | Required |
| S8 foundation/deduplication | 8–13 d | Phase 18.5 |
| S9 shell/identity | 6–10 d + art | Phase 18.5 |
| S10 robustness | 2–4 d | Phase 18.5 |
| S11 do-over | 2–3 d spike; 6–9 d build | Phase 19 candidate |
| S12 opponent/deep-link delight | 4–7 d | Phase 18.5 |

The 1.2 cut order is:

1. Cut S11 first; it is not part of the release commitment.
2. Move lower-priority S5 items to Phase 18.5 only with
   their IDs intact. Never cut crash, viewer visibility, 44-point destructive/
   bet controls, loading truth, or actual screen-reader verification.
3. Do not cut S1–S4 or S7.
4. If S6 cannot ship truthfully, rename and re-scope the release rather than
   shipping statistically noisy Progress claims.

---

## 11. Success measures

Product functionality does not depend on analytics. Measures marked † require
the consented Phase 17 contract or a manual beta tally.

- Zero grading exceptions in supported completion, history, summary, and replay
  surfaces.
- 100% graded-decision coverage when a supported decision snapshot contains
  enough evidence; explicitly ungraded decisions carry a stable reason.
- Zero private sessions where a viewer's state and route back are absent.
- Zero release artifacts where friend-table source exists but the entry, link,
  resume, or v4 route is missing.
- Every captured clickable node has a useful label; zero decorative glyph nodes
  are exposed.
- All P0/P1 ledger items have paired before/after evidence.
- † Private-session review-open rate.
- † Share of eligible players reaching a per-spot sample floor.
- † Repeat review and Progress use, without treating use as proof that the
  coaching recommendation was correct.
- Phase 18.5 S8/S9/S10/S12 completion rate by issue ID; deferred work remains
  visible until done or explicitly rejected. S11 is reported separately as a
  Phase 19 go/no-go decision.

---

## Appendix A — Complete defect and improvement ledger

This ledger preserves every Fable register item and the unique Qwen/GLM
findings. “Verify” means the claim is plausible or a prior fix exists but device
evidence is still required.

| ID | Priority | Disposition | Item | Slice |
| --- | --- | --- | --- | --- |
| P18-001 | P0 correctness | Fix | Six-to-eight-opponent no-saved-equity grading exception | S1 |
| P18-002 | P0 trust | Finish existing | Private Review hands: 3/6/9-seat no-throw, redaction, replay, discoverability | S2 |
| P18-003 / Fable R1 | P0 trust | Investigate then fix | Sat-out private-table viewer disappears and lacks a visible way back | S0, S3 |
| P18-004 / R9/R16 | P0 release | Fix | Preview flag can remove entry, modal, invite, resume, statistics; copy may still promise friends | S3 |
| P18-005 / R24 | P1 correctness | Fix | No nine-seat grading fixture/pinned corpus; stale 3–6 comment | S1 |
| P18-006 | P1 release | Integrate existing | Android target/API and 16 KB inspection scripts are untracked/unwired | S4 |
| P18-007 | P1 release | Integrate existing | Legacy 426 tests exist but integration harness is absent from CI | S4 |
| P18-008 / R6 | P1 copy | Fix | Singular/plural showdown and shared-pot grammar in three catalogs | S3 |
| P18-009 / R2 | P1 readability | Fix | Winner plaque truncates localized stack | S5 |
| P18-010 / R3 | P1 semantics | Fix | Neutral loss uses destructive red | S5 |
| P18-011 / R10 | P1 a11y | Fix and verify | Decorative PUA glyph descendants; exact Qwen glyph claim unproven | S5 |
| P18-012 / R7 | P1 input | Fix and verify | Missing shell/table Android hardware-back behavior | S5 |
| P18-013 / R8 | P1 input | Fix | Critical controls below 44 points/hit area | S5 |
| P18-014 | P1 copy | Fix | Heads-up narrative can appear in multiway review | S2 |
| P18-015 / R5 | P1 hierarchy | Fix | Hero cards smaller than opponent indicators; excess blank felt | S5 |
| P18-016 / R4 | P1 identity | Fix with art | Elsa, Milo, Noah, Otto lack avatar assets | S9 |
| P18-017 / R11 | P2 correctness | Fix | Rebuy accessibility label hardcodes 4,000 | S5 |
| P18-018 / R12 | P2 consistency | Fix | Play navigation model/render drift and duplicate custom game | S9 |
| P18-019 / R13 | P2 hierarchy | Fix | Play configurator consumes the useful first viewport | S9 |
| P18-020 / R14 | P2 consistency | Fix | Private lobby shows Back and Close together | S5 |
| P18-021 / R15 | P2 identity | Fix | Standings generic AI icons; duplicate Profile avatar | S9 |
| P18-022 / R17 | P2 theme | Fix | Literal surface/border/shadow colors outside palette | S8 |
| P18-023 / R18 | P2 dark mode | Fix and verify | Raised surfaces lose elevation; Home CTA contrast needs recheck | S9, S7 |
| P18-024 / R19 | P2 state | Fix | Progress renders zero values while data loads | S5 |
| P18-025 / R20 | P2 state | Fix | Private table shows an empty action area while waiting | S5 |
| P18-026 / R21 | P2 a11y | Fix | Modals ignore reduced-motion preference | S5, S8 |
| P18-027 / R22 | P2 a11y | Fix | GuidedText disables OS scaling; plaques can shrink to 0.72 | S5, S8 |
| P18-028 / R23 | P2 input | Fix and verify | Profile edit lacks keyboard avoidance/persistent taps | S9 |
| P18-029 / R25 | P2 a11y | Fix | Multi-line controls rely on run-on child-text aggregation | S5 |
| P18-030 / R26 | P3 hygiene | Fix | Rebuy row contains a no-op ternary | S10 |
| P18-031 / R27 | P3 hygiene | Fix or justify | Production warn/error paths lack user state | S10 |
| P18-032 / R28 | P3 robustness | Fix | Player-visible avatar/storage failures are silent | S10 |
| P18-033 / R29 | P3 naming | Decide | Beta-named internals remain after beta wording changed | S10 |
| P18-034 | P2 automation | Fix incrementally | English-copy Maestro selectors block locale-stable smoke tests | S4, S8 |
| P18-035 | P1 trust | Verify/fix | Invite and `rivermind://` links lack complete platform matrix | S3, S12 |
| P18-036 | P2 reliability/privacy | Decide/spike | No crash SDK; any solution must satisfy Phase 17 privacy boundaries | S4, S10 |
| P18-037 | P2 product | Build | Spot/position/street/family Progress with safe sample floor | S6 |
| P18-038 | P3 delight | Build later | Table-specific opponent tendencies from public local evidence | S12 |
| P18-039 | P3 experiment | Spike later | Seeded, sampled AI-table decision do-overs | S11 |
| P18-040 | P2 copy | Fix | Sentence-case catalog outliers | S9 |
| P18-041 | P2 layout | Fix | Learn three-deep nesting and “0 of 53” first-launch framing | S9 |
| P18-042 | P3 delight | Build later | Conditional Continue row for resumable checkpoints | S9, S12 |
| P18-043 | P2 consistency | Fix | Turn state duplicated; Raise-only icon; meaningless cumulative feed badge | S5 |
| P18-044 | P2 consistency | Fix | Table-family header/control-frame parity | S5 |
| P18-045 | P2 robustness | Fix | Orientation breakpoints use width rather than shortest side; side safe areas omitted | S9 |
| P18-046 | P2 foundation | Build incrementally | Geometry/type/elevation/text-scale tokens | S8 |
| P18-047 | P2 foundation | Build incrementally | Shared sheets, buttons, loading, banners, progress, GuidedText | S8 |
| P18-048 | P2 maintainability | Build incrementally | Repeated table styles and modal chrome | S8 |
| P18-049 | P3 maintainability | Build incrementally | Oversized AppShell files; file/component extraction only | S8 |
| P18-050 / R30 | Verify | Verify | Private-lobby center-label bleed after ring unification | S7 |
| P18-051 / R31 | Verify | Verify | Dark Home CTA contrast after themed-foreground fix | S7 |
| P18-052 / R32 | Verify | Verify | Six open Phase 16 device observations | S7 |
| P18-053 / R33 | Verify | Verify | Private Review hands grades and replay on device | S2, S7 |

---

## Appendix B — Source-plan disposition

### Qwen3.8 Flash Next coverage

| Source item | Disposition here |
| --- | --- |
| A1 new multiway grader | Rejected as already implemented; residue becomes S1 / P18-001 and P18-005 |
| A2 do-overs | Retained as evidence-gated Phase 19 candidate S11 / P18-039, AI tables only |
| A3 spot progress | Retained and refined as S6 / P18-037 |
| A4 multiway copy | Retained as S2 / P18-014 |
| A5 private review build | Rejected as already implemented; residue becomes S2 / P18-002 and P18-053 |
| B1 creator/session anomaly | Retained as archive-first S0/S3 / P18-003 |
| B2 glyph labels | Corrected: parent controls are labelled, decorative nodes remain; S5 / P18-011 |
| B3 showdown copy | Retained as S3 / P18-008 |
| B4 crash reporting | Retained as privacy-gated S4/S10 / P18-036 |
| B5 add lane test | Corrected: tests exist; wire harness in S4 / P18-007 |
| B6 structural visibility | Retained as S3 / P18-004 |
| B7 CI/device/selectors | Retained and split into P18-006, P18-007, P18-034 |
| B8 copy/capability parity | Retained under S3 / P18-004 and P18-008 |
| C1 opponent reads | Retained as S12 / P18-038 |
| C2 join friction | Retained as S3/S12 / P18-035 |

### Claude Fable 5.1 coverage

| Source group | Disposition here |
| --- | --- |
| A1–A4 tokens, primitives, table kit, scans | Retained in Phase 18.5 S8; not a blocker for correctness fixes |
| A5 shell decomposition | Retained in Phase 18.5 under D12 and S8; file/component moves only |
| B1–B7 table experience | Retained in S3/S5 as P18-003, 009, 010, 015, 020, 043, 044 |
| B8 prior geometry verification | Retained in S7 / P18-052 |
| C1–C8 shell screens | Retained in Phase 18.5 S9/S12 as P18-016, 018, 019, 021, 023, 040–042 |
| D1–D8 accessibility/input/state | Critical items remain in 1.2 S5; consolidation residue moves to Phase 18.5 S8/S9 |
| D9 diagnostics | Retained in Phase 18.5 S10 / P18-031 and P18-032 |
| D10 orientation | Policy under D08; hygiene retained in Phase 18.5 S9 / P18-045 |
| E1 grader proof | Expanded with GLM crash in S1 / P18-001 and P18-005 |
| E2 private review | Retained in S2 / P18-002 and P18-053 |
| E3 Progress | Retained in S6 / P18-037 |
| E4 do-overs | Retained as conditional Phase 19 candidate S11 / P18-039 |
| E5 copy | Retained in S2 / P18-014 |
| F1/F2 friend-table trust | Retained in S3 / P18-003 and P18-004 |
| F3 crash reporting | Retained in S4/S10 / P18-036 |
| F4 lane test | Corrected to existing-test CI wiring in S4 / P18-007 |
| F5 CI/artifacts/selectors | Retained in S4/S8 / P18-006 and P18-034 |
| R1–R33 register | Every R item maps explicitly in Appendix A |
| H1–H5 verification | Split across S1, S4, S7, and S8 release gates |
| I1–I2 stretch | Core link verification remains in 1.2 S3; frontend follow-through is Phase 18.5 S12 / P18-035 and P18-038 |

### GLM-5.3 Flash coverage

| Finding | Disposition here |
| --- | --- |
| Multiway grader and private review already exist | Treated as baseline; phantom builds rejected |
| Exact accessibility claim contradicted | Narrow correction preserved; actual glyph descendants and AT verification remain in S5 |
| Legacy 426 test already exists | Preserved; S4 wires the existing harness |
| Three locale catalogs | Used in every copy and device gate |
| Android artifact tools already exist | S4 reviews, commits, and wires them |
| `PlayStatistics` also has `version` | Baseline corrected; S6 introduces a new migration-safe version |
| Nine-player no-saved-equity crash | Highest-priority S1 / P18-001 |
| Nine-player tests and doc comment missing | S1 / P18-005 |
| B1 artifacts exist but timing is owner-observed | S0 is archive-first; no coordinator change without evidence |

---

## Appendix C — Working-tree protection

The working tree already contains user or prior-agent changes:

- modified `package.json` Android/iOS scripts;
- the local Medium article and media;
- Android artifact inspection/build scripts and tests.

Implementation must preserve and review these changes rather than overwrite
them. The Medium article and media remain local unless the owner explicitly
changes that decision. Only the three source-agent reports are currently
published for article reference.
