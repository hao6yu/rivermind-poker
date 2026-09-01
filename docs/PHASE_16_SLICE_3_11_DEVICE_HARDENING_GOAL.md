# Slice 3.11 — Device hardening implementation goal

Prepared: 2026-08-31. Assignment for a fresh local-agent session.

## Goal

Implement and verify every open finding DT-01 through DT-12 in [the physical-device testing notes](PHASE_16_SLICE_3_11_DEVICE_TESTING_NOTES.md), preserve the working iOS local-game crash fix, and produce a clean review-ready feature branch with focused commits, failing-before/passing-after regressions, complete English/Simplified Chinese/Traditional Chinese coverage, and an honest final QA report.

This is an implementation task, not a request to rewrite the plan or merely inspect the screenshots. Continue through the checkpoints while safe in-scope work remains. If your agent supports tracked goals, create one with the objective above and the checkpoint plan below. Do not invent a token budget.

**Done for this assignment:** all DT-01–DT-12 behaviors are implemented; mandatory local gates pass on the exact final commit; simulator/rendered evidence covers the affected matrix; the branch and worktree are clean; and unavailable physical-device/TestFlight gates remain explicitly pending. Existing tests passing without new fail-before coverage does not close the goal.

This instruction does not authorize merge, push, hosted deployment, database migration, Edge Function deployment, TestFlight submission, App Store Connect changes, installation on a device, or deletion/reset of user data.

## Starting point and branch isolation

- Repository: `/Users/haoyu/development/rivermind-poker`.
- Required code/QA baseline before this goal document: `51c4a57a` on `codex/ios-local-game-crash`.
- The iOS crash fix that must be preserved is `092e8f8e` (`fix(table): avoid orientation lock during mount`).
- `origin/master` at preparation time was `7891e08a` and did **not** contain the crash fix or the new device notes. Do not branch from that older revision.
- Begin by checking `git status`, `git log`, and the current HEAD. Branch from the current clean HEAD that contains this goal document and `51c4a57a`.
- Create `local/slice-3.11-device-hardening`. If it already exists, inspect it before reuse. Never force-checkout, reset, or discard unrelated work.
- Record the exact starting commit and final tested commit in the handoff.
- Do not work in the same checkout concurrently with another coding agent.

The default shell on the reviewed Mac selects unsupported Node 16. Use a compatible runtime before running package commands:

```sh
export PATH="/Users/haoyu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH"
node --version   # expected compatible value; v24.19.0 was available
pnpm --version   # 10.30.1 was available
```

The repository requires Node `>=22.19.0`. Do not treat errors produced by Node 16 as project failures.

## Read and inspect before coding

Read these files in full:

1. Applicable `AGENTS.md`, if present.
2. This goal document.
3. `docs/PHASE_16_SLICE_3_11_DEVICE_TESTING_NOTES.md` — authoritative DT-01–DT-12 behavior and acceptance.
4. `docs/PHASE_16_SLICE_3_11_SCOPE.md` — original profile/table/Championship/multiplayer rules.
5. `docs/PHASE_16_SLICE_3_11_RELEASE_RECORD.md` — deployed preview lane, capability boundary, and still-pending gates. Treat historical pass counts as history, not proof for your final commit.
6. The screenshot evidence under:
   - `docs/assets/phase16-slice-3.11-device-round-4/`
   - `docs/assets/phase16-slice-3.11/`

Inspect the relevant implementation and existing tests before choosing a fix. At minimum trace:

- `src/features/table/multiwayTableLayout.ts`
- `src/features/table/MultiwayPokerTableScreen.tsx`
- `src/features/table/multiwayGameplayPresentation.ts`
- `src/domain/poker/multiway.ts` and action-order tests
- `src/features/multiplayer/MultiplayerFlowModal.tsx`
- `src/features/multiplayer/multiplayerUx.ts`
- `src/components/HumanAvatar.tsx`
- `src/components/HumanAvatarProfilePicker.tsx`
- `src/services/avatarStorage.ts`
- `src/services/playerProfile.ts`
- `src/features/shell/ChampionshipEntryCard.tsx`
- `src/features/shell/ChampionshipModal.tsx`
- `src/features/shell/AiPlayConfigurator.tsx`
- `src/features/shell/AppShell.tsx`
- `src/features/learn/LearnScreen.tsx` and existing reference-sheet components
- `src/localization/phase16Messages.ts` plus localization parity/quality tests

Some existing tests intentionally encode behavior now rejected by physical-device review—for example, the portrait resolver test that says a tall pane must never stretch. Update those contracts explicitly; do not preserve a contradicted assertion merely because it was previously green.

## Non-negotiable product rules

### Screen and table geometry

- Layout derives from the measured safe content rectangle, not a raw window class or fixed device-specific height.
- Tall portrait screens use their available height meaningfully. Expansion increases useful spacing and does not merely stretch the felt background or fonts.
- Both landscape directions honor live left/right safe-area insets for every seat count and table family.
- Board, pot, occupied plaques, hole cards, action controls, feed, bubbles, reactions, profile/stats controls, and result controls remain visible and non-overlapping.

### Canonical clockwise ring

With the viewer at bottom center, the authoritative screen-clockwise ring is:

`viewer → bottom-left → lower-left → upper-left → top-left → top-right → upper-right → lower-right → bottom-right → viewer`

- Walking clockwise from the dealer encounters D → SB → BB → remaining eligible seats → D.
- Preflop action starts with the first eligible player clockwise after BB.
- Postflop action starts with the first eligible player clockwise after the dealer.
- Heads-up keeps its special rules.
- Do not reverse only the plaques, only role badges, or only feed presentation. Engine seat order, viewer-relative anchors, current actor, history, bubbles, feed, replay, and D/SB/BB must describe the same ring.

### Identity and read-only overlays

- Uploaded avatars are persistent identity, not temporary picker results. They render everywhere the same profile appears and survive navigation, relaunch, and install-over updates.
- Every occupied plaque—AI, another human, and viewer—is tappable and opens the shared popup.
- AI popup shows authored avatar, name, fun title, personality label, and description.
- Human/viewer popup shows the same truthful Play-record semantics as Profile without exposing private cards, strategy, ids, or owner-only data.
- Profile, local Session-history, and private Table-stats actions remain available during the viewer’s turn.
- Opening a read-only popup never acts, pauses, extends, or resets a timed turn. Show a compact live-turn/timer notice and preserve fast dismissal.

### AI and player-message presentation

- AI remains explicitly identified by localized text. Color is supporting information only.
- Move AI out of the name row into a border-mounted tab or equally collision-free treatment. Do not use danger, winner, or active-turn colors.
- Player message/action/reaction bubbles are measured after localization and text scaling.
- Edge bubbles shift inward, flip above/below when required, keep their tail associated with the source plaque, and remain inside the safe felt pane.
- Do not globally shrink or truncate normal messages to hide a placement defect.

### Play, Championship, and Home

- Remove the misleading Play-card **Map & record** secondary action. The card header and Start/Continue open the existing Championship journey; Record remains inside the journey and Profile.
- Public **Play vs RiverMind AI** offers Friendly, Club, Sharp, and Elite. Nemesis remains earned/hidden Championship content.
- Stack choices display only 800, 2,000, and 4,000 chips; remove the extra big-blind labels from this compact selector without changing internal stack math.
- A saved public custom difficulty that is no longer selectable must normalize to a visible supported tier instead of leaving an invisible selected value.
- Replace Home’s two-step cheat-sheet route with one compact collapsible **Poker tools** card:
  - collapsed: Hand rankings and Preflop range explorer;
  - expanded: also Common percentages and Advanced decision math;
  - every item opens the existing exact tool directly and returns to Home;
  - reuse existing content and state instead of cloning reference implementations.
- Rename **Meet the players** to **Meet the developer’s poker friends** / **认识开发者的牌友** / **認識開發者的牌友**. Use localized, natural supporting copy.

### Localization and accessibility

- Every visible and spoken change ships together in en, zh-Hans, and zh-Hant.
- This includes labels, descriptions, errors, empty/loading states, accessibility labels/hints/states/announcements, and timer/turn notices.
- Preserve 44-point-or-larger effective touch targets, modal focus containment, backdrop/Close/Back dismissal, and focus restoration.
- Do not rely on color alone for AI, turn, winner, error, or disabled states.

### Persistence and release boundaries

- Do not reset Championship or any other progress. The approved one-time client migration already exists and is not part of this bug-fix round.
- Do not modify hosted SQL, RLS, migrations, Edge workers, capability versions, or preview/production routing unless a reproduced defect absolutely requires it. If that happens, stop and explain the evidence and required authority before changing those boundaries.
- Preserve the isolated `multiplayer-room-preview` QA lane and the current production-worker isolation.
- Do not add a TestFlight profile or submit a build in this goal. The intended later distribution is a capability-4 TestFlight preview build after these fixes pass review.

## Checkpoint A — Measured table geometry and poker trust

Close DT-01, DT-02, DT-05, DT-06, and DT-12 together because they share the measured seat/pane contract.

### A1. Useful portrait expansion

- Replace the unconditional ideal-aspect height cap with a bounded layout that uses tall portrait space for seat/board separation.
- Keep compact devices viable and action controls above the bottom safe area.
- Remove the large inert region shown in the device screenshot.
- Test 2/3/6/9 seats, Coach on/off, inline/disclosure/rail feed modes, result state, and supported text scales.

### A2. Bidirectional landscape safety

- Correct the `SafeAreaView`/measured-inset boundary for every seat count, including nine-player local tables.
- Verify camera/notch safety in landscape-left and landscape-right.
- Apply the same shared behavior to local practice, Sit & Go, Daily, Championship, missions, and private tables.

### A3. Canonical order proof

- Build a deterministic fixture that records player id, numeric seat, viewer-relative anchor, D/SB/BB, preflop order, postflop order, current actor, and emitted history.
- Rotate the dealer through every seat and prove wraparound.
- Cover 2/3/6/9 seats and skipped folded/all-in/eliminated/ineligible seats.
- Add a rendered/spatial assertion; an array or comment merely named `clockwise` is insufficient.

### A4. AI marker and edge bubbles

- Replace the floating AI pill/name collision with the approved explicit border-tab treatment.
- Resolve every plaque-anchored message/action/reaction rectangle inside the measured safe pane.
- Test the outermost left/right anchors, longest supported localized messages, large text, and both landscape directions.

**Checkpoint A commit point:** all layout/order findings have fail-before and pass-after tests, and the complete A diff has been reviewed for collisions, rule reversal, and safe-area regressions.

## Checkpoint B — Avatar persistence, player profiles, and live read-only controls

Close DT-04, DT-07, and DT-08.

### B1. Uploaded-avatar root cause

Trace and test the complete chain:

1. picker/adjustment output;
2. durable processed-file location;
3. avatar registry persistence;
4. saved `HumanAvatarReference` id/version;
5. render authorization/resolution;
6. propagation to every identity surface.

Do not patch only the local hero plaque. Verify Profile, Home, 2/3/6/9-seat local tables, private lobby/live play, viewer popup, results, and replay. The owner’s local image must remain visible even if private-room upload/download is unavailable.

Add durable rendered/integration coverage for an uploaded image after navigation and service/module reload. If a simulator cannot prove install-over file persistence, state that physical gate honestly rather than faking it.

### B2. Shared player popup

- Restore one occupied-plaque interaction across local and private tables.
- Remove turn-based handler deletion/automatic dismissal as the mechanism for “turn safety.”
- Keep timers authoritative and show turn urgency within the popup.
- Test AI, another human, and viewer; another player’s turn and viewer’s turn; backdrop/Close/Back; focus containment/restoration; no accidental action.

### B3. Stats/history during turn

- Private Table stats and local Session history remain openable during the viewer’s turn.
- Opening/closing cannot reset a clock, replay a command, or hide server advancement.
- Test timeout while open, close after server advancement, repeated open/close, rotation, and screen-reader return focus.

**Checkpoint B commit point:** identity remains consistent across all tested surfaces, the three popup roles render, and read-only overlays pass timer/action safety tests.

## Checkpoint C — Play and Home simplification

Close DT-03, DT-09, DT-10, and DT-11 with localization in the same commit.

### C1. Championship entry

- Remove the redundant/misleading secondary Play-card action and its obsolete messages/accessibility copy.
- Preserve journey → Record → journey and Profile → Record → Profile return paths.

### C2. Public AI configuration

- Offer exactly Friendly/Club/Sharp/Elite.
- Hide Nemesis without removing its internal Championship support.
- Render exactly 800/2,000/4,000 in the stack selector.
- Normalize stale saved Nemesis selection safely and test it.

### C3. Direct Home poker tools

- Implement the compact collapsed/expanded Home card using existing Learn references.
- Each tool opens directly in one tap and closes back to Home.
- Learn’s own catalog continues to work unchanged.
- Test expansion state, direct target, dismissal, small screens, large text, themes, and all locales.

### C4. Personal roster branding

- Ship the agreed title and natural description in all three locales.
- Preserve the stable popup roster interaction; do not reintroduce expanding inline profiles.

**Checkpoint C commit point:** Play/Home behavior, saved-setting normalization, direct routing, catalog parity, Chinese quality, accessibility, and compact layout tests pass.

## Checkpoint D — Integrated verification and handoff

### Mandatory automated gates

Run these against the exact final code commit:

1. Focused fail-before/pass-after regressions for every DT item.
2. `pnpm typecheck`.
3. Full `pnpm test`; report every failure and investigate it. Do not delete tests, weaken collision/order assertions, or increase timeouts indiscriminately.
4. `pnpm verify:release-config`.
5. `pnpm verify:mobile-secrets`.
6. `pnpm verify:multiplayer-edge` to prove client/UI changes did not break the reviewed worker boundary, even though no worker change is expected.
7. `git diff --check`.
8. iOS and Android production-mode JS exports using the repository’s release configuration. These are bundle checks, not signed native builds.

Run focused suites while developing, then rerun the full gates after the final executable change. Historical counts from another branch or commit are not final evidence.

### Required rendered/simulator matrix

- Portrait and both landscape directions.
- Compact phone and tall notched/Dynamic-Island phone dimensions.
- Light/dark.
- en/zh-Hans/zh-Hant.
- Default and supported large text scale.
- 2/3/6/9 seats.
- Local practice, Sit & Go, Daily Challenge, Championship/hidden events, mission, private lobby/live/result.
- Coach on/off; feed inline/disclosure/rail; reaction closed/open; left/right edge bubbles; viewer-turn profile/stats; result state.

Use deterministic rendered fixtures or simulator screenshots where appropriate. Geometry unit tests alone are not visual proof. Save useful new evidence under a clearly named `docs/assets/phase16-slice-3.11-device-hardening/` directory and reference it from the testing note; do not manufacture a physical-device pass.

### Physical/TestFlight gates that may remain pending

Unless the session actually has the required hardware and authorization, report these as not run:

- install-over uploaded-photo persistence on a real iPhone;
- camera/notch safety in both landscape directions on device;
- physical taps for every occupied plaque and edge message;
- VoiceOver focus/announcements;
- two-device nine-seat private-room convergence, reconnect, rebuy, stats, and avatar sharing;
- sustained nine-seat all-Nemesis performance;
- signed TestFlight preview build, TestFlight App Review, and friend distribution.

Do not call the whole release approved while those remain pending.

## Commit and review protocol

Use these focused commits unless an inseparable change requires a documented regrouping:

| Checkpoint | Required commit outcome |
| --- | --- |
| A — Table geometry and trust | DT-01/02/05/06/12; measured safe pane, useful expansion, canonical ring, AI marker, edge bubbles |
| B — Identity and overlays | DT-04/07/08; durable avatar rendering, shared player popup, turn-safe stats/history |
| C — Play/Home simplification | DT-03/09/10/11; Championship entry, AI choices/stacks, direct tools, localized roster branding |
| D — Integrated gate | Final regressions/evidence and accurate testing/release-note update |

After each checkpoint:

1. Review the entire checkpoint diff, not only the last fix.
2. Look specifically for P1/P2 regressions in poker order, clipping, persistence, privacy, timers, accessibility, and localization.
3. Fix findings before starting the next checkpoint.
4. Commit implementation, regressions, and translations atomically.
5. Keep unrelated user changes untouched.

If using only self-review, say self-review. Do not claim independent or adversarial review unless another reviewer actually inspected the final diff.

## Final deliverables

Update `docs/PHASE_16_SLICE_3_11_DEVICE_TESTING_NOTES.md` and, where release status materially changes, `docs/PHASE_16_SLICE_3_11_RELEASE_RECORD.md` with:

- starting/final branch and commit;
- checkpoint commit map;
- DT-01–DT-12 table containing root cause, fix boundary, regression, fail-before evidence, pass-after evidence, and commit;
- localization/accessibility changes;
- exact command lines, exit codes, test counts, export results, and evidence paths;
- physical-device, two-device, signed-build, TestFlight, and hosted status separated into passed/failed/not-run;
- any remaining limitation and next concrete action.

End with exactly one honest status:

- **Device hardening verified locally; physical-device and TestFlight QA pending.** Use only if all mandatory local implementation and gates pass.
- **Device hardening incomplete.** List remaining reproducible defects or genuinely unavailable mandatory local prerequisites and the next action.
- **Full device/release gates passed.** Use only if the exact signed candidate actually completed every physical, two-device, accessibility, performance, and TestFlight requirement.

Do not merge, push, deploy, submit, or install. Return the clean branch, exact final commit, concise evidence summary, and remaining manual QA for owner review.
