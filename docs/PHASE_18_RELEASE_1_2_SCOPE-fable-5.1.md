# Phase 18 — Release 1.2: One Product, Reviewed Multiway, Trusted Friend Tables

Status: **draft for owner review — 2026-09-01.** Nothing here is approved,
scheduled, or started. This document supersedes two earlier untracked drafts:
the Phase 18 multiway learning-loop scope and the Phase 19 UI-polish scope.
Their content is merged below; the parts of the Phase 18 draft that did not
survive verification against the code are rewritten, and the section
"What changed from the Phase 18 draft" lists each correction with evidence.

## Outcome

Release 1.1 rebuilt the game UI under device pressure: eleven slice-3.11
device findings, ten follow-up findings, and a dozen `fix(table)` /
`fix(play)` commits landed in the last five days of the train. The result is a
table that finally fits the phone, a learning loop that already grades 2-, 3-,
6-, and 9-seat hands, friend tables that ship, and a shell whose seams now
show: every modal carries its own scrim and header, three table screens hold
three copies of the same seventy-two styles, the design system stops at
color, four AI personas have no face, and a friend-table host who misses one
turn vanishes from their own table without being told why.

Release 1.2 makes those pieces one product:

> Every screen uses the same handful of surfaces, buttons, sheets, and type
> sizes; the table puts the player's own cards first; every control can be
> named by a screen reader and reached by a thumb; every hand at any table
> size can be reviewed the same way and the player can see which spots are
> moving; and a friend table never loses its host silently.

This release ships no new game modes, seat counts, events, locales, or
social surfaces, and it changes no poker rule, AI strategy band, or schema.
The one server-side item it may touch is a policy decision on missed turns
(Q8), and only if the owner chooses it.

## What changed from the Phase 18 draft

The earlier Phase 18 draft was written without checking the code. These are
the corrections, each verified on `master` at `121338d2`.

| Draft claim | What the code shows | Effect on scope |
| --- | --- | --- |
| "Every graded decision comes from `gradeHeadsUpHand` … what is missing is a multiway hand walker." Track A1 proposed a new `gradeMultiwayHand`, 4–6 days, "core of the release". | `gradeMultiwayHand` exists at `src/domain/poker/decisionGrading.ts:512`, consumes per-decision engine snapshots (position, players behind, opponent count, limpers, raise count, raiser position, estimated equity, initiative, tournament pressure), and is already used by `MultiwayPokerTableScreen.tsx:639, 674`, `MultiwayHandReplayModal.tsx:45`, and `sessionModels.ts:61`, which selects the grader by record type. The position map covers 9 seats at `multiway.ts:147`. | A1 collapses to **E1**: prove it at 9 seats with fixtures and a pinned-grade corpus, and fix a stale "3–6 player" doc comment. |
| "Private tables have no review at all … the friend-table experience currently ends at a chip ledger." A5 proposed building hero-only review. | The standings sheet's **Review hands** (`MultiplayerFlowModal.tsx:3147`) loads archives, converts them to multiway session records (`multiplayerArchivePresentation.ts:109`), grades them through the same selector, and replays them through `HandReplayModal`, which dispatches multiway records to `MultiwayHandReplayModal` (`HandReplayModal.tsx:32-34`). The archive keeps decision context only for the viewer's own actions (`archive.ts:97`). | A5 becomes **E2**: verify on device, close gaps, improve discoverability. Not a build. |
| B1: "a session ran to completion without ever awaiting the creator … a trust bug on a surface that ships live." Required next step was a scripted repro. | One missed deadline on an online seat sets `participation = 'sitting-out'` (`coordinator.ts:1251-1257`); sat-out seats are not dealt (`coordinator.ts:776`); the client draws only seats present in `hand.players` (`MultiplayerFlowModal.tsx` ~2893), so the viewer's plaque disappears; **Return next hand** is offered only in the between-hands result panel (`:2065-2070`). Today's Android captures match this exactly: viewer present in hand 1, gone by hand 10, creator #3 with net 0. | B1 becomes **F1**: a one-hour archive check to confirm, then a visibility fix (B5, F1) and a policy decision (Q8). Coordinator investigation only if the check fails. |
| B2: icon glyphs reach TalkBack as private-use codepoints with no label "across the table screen". | Today's uiautomator dumps of Home, Play, Setup, and the 9-max local table show every clickable node labeled (10/10, 24/24, 9/9, 18/18). Seven glyph-only text nodes remain exposed. | B2 becomes **D1**: hide the glyph nodes, audit the surfaces not yet dumped. |
| "There is no spot, position, street, or per-100-hands aggregate anywhere." | Session-level focus-area aggregates exist (`sessionLearning.ts:67`, mission graded decisions by preflop / flop-initiative / river / tournament / adjustment) and concept trends exist in `progressInsights.ts:64-107`. | **E3** builds the longitudinal per-spot view on top of them instead of from scratch. |
| A3: "chip-based denominators only … the label must not imply big blinds". | The product framework reserves big-blind units for training, coaching, and learning references. Spot progress is a learning reference, and chips per 100 hands across 800 / 2,000 / 4,000 stacks are not comparable. | **E3** uses BB/100 with a chip figure alongside; game screens stay in chips (Q13). |
| A2 do-overs: "re-run the spot from that street with the alternative legal action, then a sampled continuation to showdown … deterministic, local, offline", 5–7 days, required. | Stored hands redact opponents' cards unless shown at showdown, so a continuation must sample opponent holdings from ranges consistent with their public actions; private-table opponents are humans and cannot be re-simulated at all. | **E4** is rescoped to AI tables, uses the existing weighted public-action ranges for sampling, and drops from Required to Should. |
| B7: "add the Android artifact gate (target SDK and 16 KB page size)". | `scripts/verify-android-artifact.mjs`, `scripts/androidArtifactInspection.mjs`, and `scripts/__tests__/` already exist, untracked. | **F5** commits and wires them rather than writing them. |

Kept from the draft unchanged in substance: the product principles for
review, B3 (showdown grammar), B6 (preview flag is a landmine), B8 (copy
that names compiled-out surfaces), the decision points on crash reporting,
do-over cost, and Phase 17 ordering, and the opponent-legibility stretch
items.

## Evidence base

| Source | What it is |
| --- | --- |
| `artifacts/android/device/07*–11*, mp-01*–mp-11*.png` (2026-09-01) | Android captures of the current `master` build: Play hub, 9-max local table, and two private 9-seat sessions against the v4 worker. Captures 01–06 are an older store build, used only for comparison. |
| `artifacts/android/device/ui-*.xml` (2026-09-01) | uiautomator accessibility dumps of the same build, read with `scripts/androidUiDump.py`. |
| `docs/assets/phase16-slice-3.11*/` (2026-08-30/31) | iPhone captures that drove the slice-3.11 device rounds. Several fixes landed and are still "observation pending" in [the follow-up checklist](./PHASE_16_SLICE_3_11_DEVICE_FOLLOWUP_TODO.md). |
| Code audit (2026-09-01) | Read-only sweeps of `src/features`, `src/components`, `src/theme*`, `src/localization`, `src/domain/poker/decisionGrading.ts`, `src/domain/multiplayer/coordinator.ts`, and `src/features/multiplayer/MultiplayerFlowModal.tsx`. Counts are static approximations; re-run before implementation. |
| Local gate | `pnpm typecheck` clean; `pnpm test` 183 files / 1,925 tests passing on `121338d2`. |

## Entry conditions

- 1.1.0 is approved on both stores and the 1.1 review binary is not being
  rebuilt. Nothing here may require touching it.
- `multiplayer-room-v4` remains the only lane clients route to; canonical
  `multiplayer-room` stays frozen.
- Phase 17 consent and event contract landed, or explicitly deferred (Q12).
  Several success measures depend on it; the feature work does not.
- The slice-3.11 follow-up checklist's open observations (F1, F4, F7, F8, F9,
  F10) are observed on device or carried into Track H below. They are not
  silently dropped.
- Q1 (token set) is resolved before any Track B or C work starts. Q8 and Q9
  are resolved before Track F work starts.

## Principles

Phase 14's visual rules still hold: indigo for selection, primary action, and
current turn; aqua for completion, success, and coaching; red for destructive
actions and errors only; one primary action per screen; temporary bubbles
explain the moment and persistent labels preserve the street. This release
adds:

**Design**

- **One geometry vocabulary.** Radius, spacing, control height, and type size
  come from named tokens. A screen may pick a token; it may not invent a value.
- **The hero's cards are the largest cards on screen.** Opponent card backs
  are indicators. If the layout forces a choice, shrink the backs.
- **State is shown once.** "Your turn" lives on the hero plaque or in the
  center pill, not both. A winner is the plaque boundary and the result rail.
- **Identity is the same everywhere.** One avatar per opponent on the felt,
  in the lobby, in standings, in the profile sheet, and in replay. Letter
  fallbacks are a bug.
- **One dismiss per surface.** Back arrow or close, never both.
- **Loss is not danger.** A lost hand is a neutral outcome; red is for actions
  that delete or leave.
- **Announce what you draw.** Every icon-only control has a localized label;
  every decorative glyph is hidden from the accessibility tree.

**Review**

- **Review is not a second product.** Grading appears inside the flow that
  ended the hand: result → standings or summary → review hands → the decision.
- **Deterministic, local, offline.** Grading runs on-device from stored state.
  No server round-trip per review, no worker change.
- **Explain the inputs, not the authority.** Every grade names the facts that
  produced it: position, players behind, stack depth, street, price to call.
- **Sampled truth, labelled as sampled.** A do-over shows a distribution over
  N runs against RiverMind AI, never a single run-out as "what would have
  happened", and never a claim about what a human friend would have done.
- **Etiquette wins over coaching.** In private tables, hero-only review, off
  mid-hand, never revealing cards the archive did not already expose.
- **Multiway means the seat, not the button.** Position labels come from the
  seat map at N players.

**Trust**

- **The viewer's seat is always on screen.** Active, folded, sitting out,
  rebuy-pending, busted, disconnected: the state is named on the plaque.
- **A policy that removes a player from a hand must say so at the moment it
  happens**, with the way back in reach, not one panel later.
- **Shipping surfaces are compiled in, not toggled by a forgotten variable.**

## Included work

### Part 1 — One product

#### Track A — Design system foundation (required, first)

Tracks B–D consume these tokens and primitives. Ship A before touching a
screen.

**A1. Geometry and type tokens.** Add to `src/theme.tsx` / `src/themePalette.ts`
(or a sibling `themeTokens.ts`) a closed set:

- `space` on a 4-point grid (4, 8, 12, 16, 20, 24, 32).
- `radius` with four steps (roughly 8 / 12 / 16 / 22) plus `pill`.
- `control` heights (36 compact / 44 standard / 50 primary).
- `type` as a seven-step scale with paired line heights (caption 11, body 13,
  body-large 15, title 17, title-large 20, display 28, plus one table-dense
  step) and named weights (regular 400, medium 500, semibold 600, bold 700).
- `elevation` with per-scheme shadow opacity so raised cards keep an edge in
  dark mode.
- `textScale` ceilings as named tiers. Today 104 of 747 `Text` elements set
  `maxFontSizeMultiplier` inline with seven different values (1.0 to 1.6) and
  only two named constants exist (`MultiplayerFlowModal.tsx:274`,
  `MultiplayerHandResultPanel.tsx:17`).

Audit baseline the tokens must collapse: 30 distinct `borderRadius` values,
50 distinct `minHeight` values, 34 distinct `fontSize` values in
`src/features` of which 12 are half-point sizes, text down to 7–8.5 points,
and 263 of 368 explicit font weights at 800 or heavier. Sub-11-point text and
half-point sizes are removed, not tokenized.

**A2. Shared UI primitives** in `src/components/ui/`: `Sheet` (scrim, handle,
header, close button, four-edge safe area), `Button` (primary / secondary /
quiet / destructive × compact / standard), `IconButton` (44 pt),
`SectionCard`, `Eyebrow`, `ProgressBar`, `EmptyState`, `Banner` (info /
warning / error), `LoadingBlock`, and one `GuidedText`. Each replaces a
counted duplicate:

| Pattern | Copies today | Evidence |
| --- | --- | --- |
| Modal scrim `{flex:1, justifyContent:'flex-end', backgroundColor: palette.scrim}` | 16 in 14 files | `AiRosterModal.tsx:238`, `ProgressModal.tsx:95`, `HandReplayModal.tsx:186`, `MultiplayerFlowModal.tsx:3872` … |
| Modal header (title + spacer + hairline) | 8 | `TrainerModal.tsx:257`, `ReferenceModal.tsx:95`, `LessonModal.tsx:142`, `BetaInfoModal.tsx:132` … |
| Primary button geometry | 15 files, 7 distinct height/radius pairs | `TrainerModal.tsx:296` (50/14), `AppShell.tsx:3067` (48/13), `LearningSetupModal.tsx:188` (55/15), `MultiplayerEntryCard.tsx:87` (45/13) … |
| Close button | 9, sizes 28–46 | `TableActivityFeed.tsx:164` is 28 pt |
| Eyebrow label | 46 style definitions in ~35 files | sizes 8–12, weights 700–900, letter-spacing 0.4–1.1 |
| Progress bar | 8+ | `ScenarioTrainingModal.tsx:495`, `TrainerModal.tsx:265`, `LearnScreen.tsx:1842` … |
| Raw `ActivityIndicator` | 15 sites, 3 colors, 3 sizes | no skeleton or shared loading block anywhere |
| Sheet handle | 1 exists (`AppShell.tsx:3200`); 15 other sheets have none | |
| `GuidedText` | 2 verbatim copies that disable OS font scaling | `LearningSetupModal.tsx:53`, `SkillCalibrationModal.tsx:66` |

`src/components/ModalBackdrop.tsx` is a transparent `Pressable` today, which
is why the scrim is copy-pasted; `Sheet` subsumes it. Every primitive ships
with a stable `testID` so Track F5 has selectors to target.

**A3. Table style kit.** `PokerTableScreen.tsx`, `MultiwayPokerTableScreen.tsx`,
and `MultiplayerFlowModal.tsx` define 72 identically named style keys, 18 of
them three times. Some are byte-identical (`seatActionBubbleFold/Call/AllIn`
at `PokerTableScreen.tsx:1954`, `MultiwayPokerTableScreen.tsx:2360`,
`MultiplayerFlowModal.tsx:4023`); others drifted (`potPill` radius 10 vs 9,
`coachTitle` 12 vs 10.5, `table` radius 32/28/32 vs 30/22/26). Extract
`tableStyleKit(palette, density)` in `src/features/table/` and consume it from
all three. Screen-specific keys stay local.

**A4. Lint scans that keep it fixed.** `src/theme/textForegroundScan.ts`
already rejects literal foreground colors. Extend it to reject literal
`backgroundColor` / `borderColor` / `shadowColor` (9 remain, e.g.
`TableActivityFeed.tsx:111, 170`, `TableMomentTrayView.tsx:227`,
`MultiplayerFlowModal.tsx:3989`), raw `borderRadius` / `minHeight` numerals in
`src/features`, and `fontSize` values outside the scale. Runs in `pnpm test`.

**A5. Shell decomposition (only what the polish needs).** `AppShell.tsx` is
3,233 lines with 62 `useState` and 8 shell-level modals;
`MultiplayerFlowModal.tsx` is 4,052 lines. Extract `HomeScreen`, `PlayScreen`,
`ProfileScreen`, and `GameSetupScreen` into their own files and move
`ScreenHeader`, `BackHeader`, `MenuRow`, `PrimaryButton`, `BottomTabs`, and
`ScreenScroll` into `src/components/ui/`. File moves only (Q6); the
multiplayer modal's 1,300-line `MultiplayerGameTable` is left alone unless
Track B or F needs to touch it.

#### Track B — Table experience

**B1. Hero-first card hierarchy on tall portrait.** On the current 9-max
portrait table (`artifacts/android/device/10-table-9max-11.png`) the felt
fills the pane (DT-01 landed) but the space went to empty felt: roughly a
third of the ring's height is blank between seat rows while the hero's two
cards render smaller than the opponents' face-down indicators and sit flush
against the felt's bottom edge. Rebalance `multiwayTableLayout.ts` so surplus
height goes first to hero card size, then to board size, then to seat row
separation; cap opponent card backs at indicator size on dense rings.
Acceptance: hero cards are the largest cards on screen at 2/3/6/9 seats in
portrait and landscape; no blank band taller than one seat row remains.

**B2. One turn indicator.** The private table shows "Your turn" in the hero
plaque and again in a center pill under the board
(`artifacts/android/device/mp-05-my-turn.png`); the local table shows it once.
Keep the plaque state; keep the pill only when the plaque is off-screen in
landscape.

**B3. Result rail semantics.** `HandResultCard.tsx:13` and
`MultiplayerHandResultPanel.tsx:52` border a hero loss with `palette.danger`,
so every hand the player does not win is framed in the destructive color
(`mp-08-stuck.png`, `hand-result-duplication.png`). Neutral border for loss,
aqua for win, indigo for split (Q2). Re-check icon tint and payout copy.

**B4. Winner plaque must not truncate.** The gold winner boundary narrows the
text lane so the stack reads `2,80` (`mp-03-hand10.png`, Hao's plaque). The
plaque envelope in `sharedTableSeatPresentation.ts` reserves width for the
widest localized stack at the winner border width; the collision matrix gets
a winner-state fixture.

**B5. The viewer's own plaque never disappears.** The seat renderer at
`MultiplayerFlowModal.tsx` ~2893 returns nothing for a seat absent from
`hand.players`, which is every sat-out, busted, or departed viewer. Render
the viewer's seat in every participation state with the state named on the
plaque, and for sitting-out show the way back (see F1). Rendered regression:
a snapshot whose viewer participation is each state still produces exactly
one viewer plaque.

**B6. Action rail consistency.** `Raise` carries a slider glyph while `Fold`
and `Call` do not (`mp-05-my-turn.png`). All rail actions get an icon or none
does. The feed badge shows total feed length (22, 20, 17), which grows forever
and means nothing at a glance; show unread-since-open or nothing.

**B7. Header parity across table families.** Local, Sit & Go, Championship,
Daily, mission, and private tables share one header contract: back or close
(not both), title with street, and the F2 44-point control frame for
orientation, guide, coach, stats, and timer. The private lobby currently
shows a back arrow and a close button together
(`private-nine-seat-lobby.png`).

**B8. Re-verify the landed slice-3.11 geometry on device.** DT-01, DT-02,
DT-05, DT-06, DT-12, and follow-ups F1, F4, F7 are implemented and
unit-tested but marked "observation pending". Track H's device pass records
pass/fail for each; failures become register items.

#### Track C — Shell screens

**C1. Play hub first-viewport budget.** The "Play vs RiverMind AI"
configurator (format, players, difficulty, stack, Advanced, Start) is tall
enough that once the Championship card scrolls off it fills a 2400-px phone
viewport by itself (`artifacts/android/device/11-play-hub.png` is a scrolled
capture; the header and Championship card sit above the fold, confirmed by
`ui-play-11b.xml`). Daily Challenge, Custom game, and Scenario training are
all below the fold. Move difficulty and stack into the existing Advanced
disclosure with the current defaults printed inline, so the first viewport
shows header, Championship, a two-row configurator with Start, and the first
rows of Games & events.

**C2. Play hub model and render agree.** `playNavigation.ts:11-56` declares a
`quick` group with a quick-game row and lists Championship and Sit & Go under
`games`; `PlayScreen` renders no quick row, folds Sit & Go into the
configurator's Tournament format, and leaves the games group holding only
Daily Challenge. `playNavigation.test.ts` tests the model, not the render.
Derive the render from `PLAY_GROUPS` or delete the dead declarations. The
separate "Custom AI game" row duplicates the configurator's Advanced
disclosure; keep one.

**C3. Learn nesting depth.** Learn stacks a card inside a card inside a card,
each with its own uppercase eyebrow (`artifacts/google-play/phone/03-learn.png`).
Limit nesting to two levels; reserve eyebrows for the page-level hero card.
"0 of 53 steps" on first launch is demotivating; show the next step's minutes
and hide the total until one step is complete.

**C4. Profile identity once.** Profile renders the same avatar twice
(`profile-avatar-layout.png`). Keep the header; the picker opens from it. The
six preset human avatars are one silhouette in six colors; author six marks
or use initials on color (Q4).

**C5. Identity is consistent across surfaces.** Session standings
(`mp-04-standings.png`) show a generic chip icon for every AI seat while the
felt shows authored portraits. Standings, replay, history, and the profile
sheet use `AiAvatar`. Four personas have no authored asset and fall back to a
letter everywhere: `elsa-sticky`, `milo-balanced`, `noah-deceptive`,
`otto-pressure` (in `multiwayAiProfiles.ts`, absent from the require map at
`AiAvatar.tsx:14-40`; Noah is the "N" in `mp-05-my-turn.png`). Author or
retire (Q3); add a test that every persona id has an asset.

**C6. Dark-mode elevation.** `palette.shadow` is pure black in dark mode and 9
of 21 shadow sites use opacity 0.07–0.12, so raised cards lose their edge on
`#0B0D12`. The A1 elevation token fixes this per scheme. Confirm on device
that the dark Home hero's "Start your session" label no longer renders dark
on dark (`dark-mode-home-contrast.png`, captured before the same-day
slice-3.11A themed-foreground pass; likely fixed, unverified).

**C7. Empty space on Home and Play is a choice.** On a 2400-px phone Home and
Play end near the midpoint (`02-home.png`, `03-play.png`). Add exactly one
thing: a "Continue" row for a resumable Sit & Go, Championship, or private
table checkpoint when one exists. Otherwise leave the space.

**C8. Copy casing.** English is sentence case except proper nouns, with three
outliers: `home.dailyChallenge` / `home.quickPlay`, `championship.close`
("Close Championship"), and `alert.savedDailyTitle`. Document the rule in the
catalog header; fix the three in all three locales.

#### Track D — Accessibility, input, and robustness

The static sweep counted 196 `Pressable`s, 6 `Switch`es, 61 `Modal`s, 747
`Text`s, and 3 `TextInput`s. Roles are on 195 of 196 pressables, all 7
`Animated` sites honor reduced motion, and there are zero skipped tests and
zero TODOs. The gaps are touch-target size, text scaling, and a few ambiguous
states.

**D1. Labels.** Today's dumps show every clickable node on Home, Play, Setup,
and the 9-max local table labeled (10/10, 24/24, 9/9, 18/18). Seven glyph-only
text nodes remain in the 9-max tree and must be hidden with
`importantForAccessibility` / `accessibilityElementsHidden`. In code, 137 of
196 pressables set an explicit label; the other 59 rely on child-text
aggregation, which reads multi-line choice rows as run-on strings
(`ScenarioTrainingModal.tsx:436`, `TrainerModal.tsx:165`,
`SkillCalibrationModal.tsx:221`, `AppShell.tsx:2535`). The private-table seat
wrapper `Pressable` (`MultiplayerFlowModal.tsx` ~3478) has no role or label
itself but its inner view (`:3418`) carries the full grouped label plus custom
actions, so it is not a defect; confirm with VoiceOver and TalkBack. Dump the
private-table, Learn, Profile, and modal surfaces the same way (H3).

**D2. Touch targets.** 26 interactive styles are under 44 points and only 21
`hitSlop` usages exist app-wide. Worst: the 28-point feed close
(`TableActivityFeed.tsx:164`); the 28-point destructive "End session early"
(`JourneyBanner.tsx:51`); 36-point in-game coach controls
(`MultiwayPokerTableScreen.tsx:2407`, `PokerTableScreen.tsx:1968`) and
feedback chips (`BetaFeedbackModal.tsx:237`); 31×40 range-grid cells
(`PreflopRangeExplorer.tsx:220`); seven 38-point icon buttons with no
`hitSlop` (`ProgressModal.tsx:100`, `BetaFeedbackModal.tsx:233`,
`BetaInfoModal.tsx:133`, `ChampionshipRecordModal.tsx:202`,
`AiCoachConsentPanel.tsx:113`, `HandReplayModal.tsx:191`,
`MultiwayPokerTableScreen.tsx:2294`); the 40-point bet-sizing keypad
(`BetSizingModal.tsx:296`), where a mis-tap costs chips. The A1 `control`
token and A2 `IconButton` replace them; dense grids get `hitSlop` to 44.

**D3. Android hardware back.** No `BackHandler` anywhere in `src`; navigation
is `useState<Screen>` at `AppShell.tsx:328` and modals rely on
`onRequestClose`. On Profile, Setup, and the table screens hardware back
likely does nothing (inferred; confirm on device). One shell-level handler
pops to the return screen or opens the leave-table confirmation (Q5).

**D4. Rebuy dialog label.** `MultiplayerRebuyDecisionModal.tsx:53` hardcodes
`amount: '4,000'` instead of the room's buy-in.

**D5. Text scaling.** The duplicated `GuidedText` sets
`allowFontScaling={false}` and re-implements scaling on font size only, so
padding, `minHeight`, and icons do not scale. Thirteen plaque texts combine
`numberOfLines={1}` with `minimumFontScale={0.72}`
(`MultiplayerFlowModal.tsx:3453-3470, 3693, 3796` and siblings), so at large
Dynamic Type the stack shrinks below default, a regression for the users the
setting exists for. One `GuidedText` on the A1 `textScale` tier; a floor of
0.85 or reflow on plaques; ceilings documented in one place.

**D6. Reduced motion on modals.** 16 `Modal`s hardcode `animationType` and 16
respect `reduceMotion`; `MultiplayerFlowModal.tsx` does both (`:1101, :1802,
:3005, :3073` hardcoded; `:1912` gated). Others: `AppShell.tsx:2519`,
`FirstRunOnboardingModal.tsx:39`, `BetaFeedbackModal.tsx:105`,
`BetaInfoModal.tsx:63`, `ChampionshipModal.tsx:83`,
`ChampionshipRecordModal.tsx:55`, `AiRosterModal.tsx:104`,
`LearningSetupModal.tsx:80`, `SkillCalibrationModal.tsx:126`,
`TableActivityFeed.tsx:83`, `MultiplayerRebuyDecisionModal.tsx:35`,
`HumanAvatarProfilePicker.tsx:478`. The A2 `Sheet` applies
`animationType={reduceMotion ? 'none' : 'slide'}` once.

**D7. Loading and waiting states.** `ProgressModal` takes no `loading` prop
(`ProgressModal.tsx:6`); `AppShell.tsx:1559` and `:2476` pass
`learning.progress` while `learning.loading` exists, so during load the sheet
shows zeros. In the private table, when it is not the viewer's turn and
nothing is busy, the action area is an empty spacer
(`MultiplayerFlowModal.tsx:2722-2727`; `mp-07-raise-panel.png`) while the
sibling branch at `:2711-2716` shows "Waiting" copy. Thread `loading`; render
"Waiting for {player}"; both use A2 `LoadingBlock` / `EmptyState`.

**D8. Keyboard.** Two of three `TextInput`s are wrapped correctly
(`BetaFeedbackModal.tsx:163`, `MultiplayerFlowModal.tsx:1425`). The Profile
name edit (`AppShell.tsx:2302`, `autoFocus`) sits in `ScreenScroll`, a plain
`ScrollView` with no `KeyboardAvoidingView` and no
`keyboardShouldPersistTaps`, so Save and Cancel likely need two taps
(inferred; confirm on device). Fix at the primitive.

**D9. Silent failures the player can see.** About 20 `catch` blocks in the
avatar upload, resolver, cleanup, and storage services return `null` or
`false` with no comment and no diagnostic (`avatarUploadClient.ts:63-332`,
`avatarResolver.ts:184-266`, `avatarCleanup.ts:99-377`, `avatarStorage.ts:183,
551`, `handHistory.ts:351, 362`), and `HumanAvatarProfilePicker.tsx:294-370`
logs four `console.error`s for orphaned files with no user state. Where the
failure changes what the player sees, route through `recordAppDiagnostic()`
and show one A2 `Banner`. Commented best-effort persistence catches are fine.

**D10. Orientation policy and breakpoints.** Every table exit restores
`PORTRAIT_UP` (`tableOrientationController.ts:139` →
`useTableOrientation.ts:30`) and nothing calls `unlockAsync`, so the shell is
portrait-only on iPhone and iPad by construction, matching the
`initialOrientation: PORTRAIT_UP` plugin setting. Treated as policy to confirm
(Q7), not a defect. Hygiene either way: tablet detection is `width >= 700`
at six sites (`LearnScreen.tsx:175`, `AppShell.tsx:1734, 1981, 2118`,
`ChampionshipModal.tsx:54`, `aiGameModePolicy.ts:44`) and should use the
shortest side; the shell `SafeAreaView` at `AppShell.tsx:1346` omits
`left`/`right`.

### Part 2 — Review that matches the table

#### Track E — Multiway review and learning loop

What already exists, verified: `gradeMultiwayHand` (`decisionGrading.ts:512`)
grades every hero decision from the engine's per-decision snapshot; the
multiway table's session summary and mission grading call it
(`MultiwayPokerTableScreen.tsx:639, 674`); history and replay select it by
record type (`sessionModels.ts:61`, `HandReplayModal.tsx:32-34`); private
tables archive hands with the viewer's own decision context
(`archive.ts:97`), convert them to multiway records
(`multiplayerArchivePresentation.ts:109`), and expose **Review hands** from
the standings sheet (`MultiplayerFlowModal.tsx:3147`); the position map
covers 9 seats (`multiway.ts:147`). What is missing is proof at 9 seats, a
longitudinal spot view, a way to try the other line, and copy that names
multiway inputs.

**E1. Prove the grader at 9 seats (required, small).**
- Fixtures: a 9-max hand where hero is UTG with six players behind must grade
  with `position: 'UTG'` and the engine's `playersBehind`, never `BTN/SB` or
  `1`; dealer rotation through every seat; 3, 6, and 9 seats plus heads-up
  special cases; a hand with a sitting-out and a busted seat.
- A pinned-grade corpus: a saved set of heads-up and multiway hands with their
  expected `handGrade` / `classification`, so later grader changes fail a test
  instead of silently shifting grades.
- Fix the stale "Grades 3–6 player hands" comment on `gradeMultiwayHand`.
- Device check: a 9-max local session summary and a private-table history show
  grades, and no hand with decision snapshots renders the `history.ungraded`
  row.

**E2. Private-table review, finished (required).**
- Verify on both platforms: settled result → standings → Review hands →
  graded rows → replay of the focus decision, hero cards visible, opponents'
  cards only where the archive exposed them at showdown.
- Discoverability: the standings sheet's Review hands is a secondary button;
  add the count of review-worthy spots (focus decisions graded close or
  mistake) to its label, and offer the same entry from the session summary
  modal so a player who dismisses standings can still get there.
- Etiquette holds: mid-hand coaching stays off at private tables; review
  opens after the session ends; nothing in review names a friend's holding
  the archive did not already show.
- Multiway copy in the review card must reference the seat and players
  behind, never heads-up phrasing (see E5).

**E3. Spot-level progress (required).**
- Extend the play-statistics ledger with a versioned per-spot aggregate:
  position bucket (early / middle / late / blinds), street, and spot family
  (facing-open, 3-bet pot, blind defense, short-stack, big-pot), each with
  hands seen and net result.
- Denominator is **BB/100** with the chip figure beside it (Q13). The product
  framework reserves big-blind units for training, coaching, and learning
  references; the Progress sheet is one. Game screens stay in chips.
- Progress shows movement between two windows with a minimum-hands floor
  under each number (proposed 30 hands per spot) so a four-hand spot cannot
  claim improvement.
- Build on `summarizeDecisionReports` (focus areas) and the concept trends in
  `progressInsights.ts`; do not create a parallel model. UI uses A2
  primitives.

**E4. Decision do-overs (should, cut first).**
- Scope for 1.2 is **AI tables only**. From a graded hero decision at a local
  AI table, re-run the spot from that street with the alternative legal
  action using the same engine and AI profiles, seeded, and continue to
  showdown.
- Opponent holdings are redacted in stored hands. Sample them from the
  weighted public-action ranges the AI and coach already use
  (`multiwayEquity.ts`: `inferMultiwayRangeStrength`,
  `resolveMultiwayOpponentRangeIdentity`), conditioned on each opponent's
  public actions so far. Cards revealed at showdown are held fixed.
- Present as a distribution: win / tie / loss rate and chip range over N
  runs, with N and the seed on screen (Q11). The original line stays beside
  the sampled line. The label says "against RiverMind AI".
- Private tables get baseline comparison only; the app never claims what a
  human friend would have done.
- Budget: measured, not asserted. Runs are chunked so a low-end Android
  profile never drops input for more than one frame; the exit gate names the
  device and the number.

**E5. Multiway coach copy (should).**
- Audit the decision-review narratives for heads-up phrasing appearing on
  multiway spots; add variants that reference players behind, squeeze spots,
  and multiway pot size.
- Reuse the catalog and parity tests. If E5 slips, ship factual input-only
  copy; never heads-up copy describing a 9-handed spot.

### Part 3 — Friend tables you can trust

#### Track F — Trust and release plumbing

**F1. The "session without the creator" report (required).**
- Observed 2026-09-01 on Android against the v4 worker: viewer present with a
  live turn in hand 1 (`mp-05-my-turn.png`, `mp-06-after-call.png`), absent
  from the ring by hand 2 of the second session and hand 10 of the first
  (`mp-07-raise-panel.png`, `mp-03-hand10.png`, `mp-08-stuck.png`), creator
  at #3 with 2,000 chips and net 0 after ten hands (`mp-04-standings.png`).
- Most likely cause, from the code: a missed 45-second deadline on an online
  seat sets `sitting-out` (`coordinator.ts:1251-1257`); sat-out seats are not
  dealt (`:776`); the client hides seats absent from `hand.players`
  (`MultiplayerFlowModal.tsx` ~2893); the only way back is **Return next
  hand**, shown inside the between-hands result panel (`:2065-2070`). An
  automated or slow tester who misses one turn is sat out, sees their seat
  vanish, and watches eight AI seats finish the session. Net 0 follows from
  posting no blinds.
- Step 1 (one hour, before any fix): read the affected room's archive and
  record per hand the viewer's `participation`, `missedTurns`, and whether a
  timeout action was appended. If it shows `sitting-out` after a timeout, the
  coordinator did what it was told.
- Step 2 if confirmed: B5 (the plaque never disappears) plus a persistent
  sitting-out state during play, not only between hands: a banner on the
  table naming the state and the Return action, a live-region announcement
  when the transition happens, and the settled-result copy saying "You sat
  out" rather than implying participation.
- Step 3: decide the missed-turn policy (Q8). Keeping one strike needs no
  worker change; two strikes for a connected seat is a coordinator and worker
  redeploy and is out of the 1.2 default.
- If Step 1 does not confirm it, the original draft's per-hand repro script
  (hole cards, prompts, wall time, participation) becomes the next step and
  the item escalates to a coordinator investigation.

**F2. Private-table visibility becomes structural (required).**
`EXPO_PUBLIC_MULTIPLAYER_PREVIEW` (`multiplayerPreview.ts:5`) gates the entry
card (`AppShell.tsx:1996`), the flow modal (`:2062`), the invite-link handler
(`:732`), mid-session resume (`:709`), and whether private hands count in
statistics (`:2190`). The 1.1 store build has the band, so the flag is set in
that EAS environment; the local release APK built today does not show it even
though the root `.env` sets it, so the build pipeline's handling of the
variable is itself unclear. Delete the flag and its dead branches so entry,
modal, link handling, and resume are always compiled in, or drive visibility
from a real capability probe (Q9). Add a build-artifact assertion that the
private-table entry string is present in release bundles, the same way the
release record scans the binary for the worker route. Then verify create,
join-by-code, invite link, resume-after-kill, and seat lifecycle on both
platforms against v4.

**F3. Crash reporting (should, contingent on Q10).** No crash or error SDK
exists. A Play Store population makes F1-class reports undiagnosable from the
outside. Whatever ships must respect the Phase 17 line: no behavioural
telemetry without consent, no PII in crash payloads, and account deletion
removes what can be removed.

**F4. Lane regression test (required, half a day).** A request carrying the
capability-4 header against legacy `multiplayer-room` is refused with 426, so
the lane rule is enforced by a test rather than by memory.

**F5. CI and device evidence (should).** CI runs `pnpm typecheck` and `pnpm
test` only. Commit and wire the untracked `scripts/verify-android-artifact.mjs`,
`scripts/androidArtifactInspection.mjs`, and `scripts/__tests__/` (target SDK
36 and 16 KB page size); add one Android smoke flow; retire the English-text
Maestro selectors (roughly 90, all `text:` matches, unusable in the Chinese
locales) in favour of the `testID`s that Track A primitives ship with.

### Part 4 — Register and verification

#### Track G — Defect register

Every item names its evidence and a severity. "Verify" means the fix is
believed to have landed and needs a device check.

| ID | Severity | Status | Defect | Evidence |
| --- | --- | --- | --- | --- |
| R1 | P0 trust | Investigate then fix | Friend-table viewer vanishes after a missed turn; creator finishes #3, net 0, never told they were sat out. | `mp-03-hand10.png`, `mp-04-standings.png`; F1, B5 |
| R2 | P1 readability | Fix | Winner plaque truncates the stack (`2,80`). | `mp-03-hand10.png`; B4 |
| R3 | P1 semantics | Fix | Hero loss framed with the destructive red token. | `HandResultCard.tsx:13`, `MultiplayerHandResultPanel.tsx:52`; B3 |
| R4 | P1 identity | Fix | Four AI personas have no avatar asset and render as a letter. | `AiAvatar.tsx:14-40`; C5 |
| R5 | P1 hierarchy | Fix | Hero cards smaller than opponent card backs on 9-max portrait; blank bands between rows. | `10-table-9max-11.png`; B1 |
| R6 | P1 copy | Fix | "Hao win the showdown with Pair of 7." The template is hard-coded plural. | `phase9Messages.ts:145`, `mp-03-hand10.png` |
| R7 | P1 input | Fix, confirm on device | No hardware-back handling outside modals. | no `BackHandler` in `src`; D3 |
| R8 | P1 input | Fix | 26 interactive elements under 44 pt, including a 28-pt destructive "End session early" and the 40-pt bet keypad. | `JourneyBanner.tsx:51`, `BetSizingModal.tsx:296`; D2 |
| R9 | P1 release | Fix | Friend tables gated by an environment variable across five code paths; no artifact assertion. | `multiplayerPreview.ts:5`, `AppShell.tsx:709, 732, 1996, 2062, 2190`; F2 |
| R10 | P2 a11y | Fix | 28-pt close button; 7 glyph-only nodes exposed to the accessibility tree. | `TableActivityFeed.tsx:164`; `ui-9table.xml` |
| R11 | P2 a11y | Fix | Rebuy label hardcodes 4,000. | `MultiplayerRebuyDecisionModal.tsx:53`; D4 |
| R12 | P2 consistency | Fix | Play hub model/render drift; duplicate custom-game entry. | `playNavigation.ts:11-56`; C2 |
| R13 | P2 hierarchy | Fix | Configurator card fills a full phone viewport; every other Play mode below the fold. | `11-play-hub.png`, `ui-play-11b.xml`; C1 |
| R14 | P2 consistency | Fix | Lobby shows back and close together. | `private-nine-seat-lobby.png`; B7 |
| R15 | P2 consistency | Fix | Standings use a generic AI icon; profile shows the avatar twice. | `mp-04-standings.png`, `profile-avatar-layout.png`; C4, C5 |
| R16 | P2 copy | Fix | `home.allGamesDescription` advertises friends in a build with friend tables compiled out. | `AppShell.tsx:1870`, `multiplayerPreview.ts:5` |
| R17 | P2 theme | Fix | 9 literal colors outside the palette, including a fixed scrim and two icon tints outside the contrast corpus. | `TableActivityFeed.tsx:111, 170`, `TableMomentTrayView.tsx:227, 243`, `MultiplayerFlowModal.tsx:1835, 3989, 3996`; A4 |
| R18 | P2 dark mode | Fix | Card shadows invisible in dark mode. | 9 of 21 shadow sites at opacity ≤ 0.12 on `#000`; C6 |
| R19 | P2 state | Fix | Progress sheet renders zeros while learning data is still loading. | `ProgressModal.tsx:6`, `AppShell.tsx:1559, 2476`; D7 |
| R20 | P2 state | Fix | Private table shows an empty pane when it is not the viewer's turn. | `MultiplayerFlowModal.tsx:2722`, `mp-07-raise-panel.png`; D7 |
| R21 | P2 a11y | Fix | 16 modals animate regardless of the reduce-motion setting. | list in D6 |
| R22 | P2 a11y | Fix | Duplicated `GuidedText` disables OS font scaling; plaques shrink to 0.72 at large text. | `LearningSetupModal.tsx:53`, `SkillCalibrationModal.tsx:66`, `MultiplayerFlowModal.tsx:3453`; D5 |
| R23 | P2 input | Fix, confirm on device | Profile name edit has no keyboard avoidance; Save/Cancel need two taps. | `AppShell.tsx:2302, 1618`; D8 |
| R24 | P2 correctness | Fix | Grader doc comment says 3–6 players; no 9-seat fixture or pinned-grade corpus exists. | `decisionGrading.ts:511`; E1 |
| R25 | P3 a11y | Fix | 59 pressables rely on child-text aggregation; multi-line choice rows read as one run-on string. | `ScenarioTrainingModal.tsx:436`, `TrainerModal.tsx:165`, `SkillCalibrationModal.tsx:221`, `AppShell.tsx:2535`; D1 |
| R26 | P3 hygiene | Fix | No-op ternary left in the rebuy row. | `MultiplayerFlowModal.tsx:3108` |
| R27 | P3 hygiene | Fix | `console.warn` in two production paths with no user-facing state. | `HumanAvatarProfilePicker.tsx:849`, `accountDeletion.ts:217` |
| R28 | P3 robustness | Should | Avatar upload failures return silently; orphan-file cleanup logs with no user state. | `avatarUploadClient.ts`, `HumanAvatarProfilePicker.tsx:294-370`; D9 |
| R29 | P3 naming | Optional | `BetaInfoModal`, `BetaFeedbackModal`, `settings.betaPrivacy` are named for copy that no longer says "beta". | file names only |
| R30 | Verify | Verify | Lobby "N players" center label bled behind seat tiles. | `private-nine-seat-lobby.png` (2026-08-30); ring unified in `84b45a05` |
| R31 | Verify | Verify | Dark Home hero CTA contrast. | `dark-mode-home-contrast.png`; C6 |
| R32 | Verify | Verify | Slice-3.11 open observations: coach-on bottom-seat containment, countdown copy at large text, compact continuation on fold/showdown/split, cheap-pot AI participation, avatar reselect + relaunch, one-tap reaction dismissal. | `PHASE_16_SLICE_3_11_DEVICE_FOLLOWUP_TODO.md` unchecked boxes |
| R33 | Verify | Verify | Private-table Review hands shows graded rows and multiway replay on device. | `MultiplayerFlowModal.tsx:3147`; E2 |

#### Track H — Verification that survives the release

- **H1. Rendered fixtures for every A2 primitive, the A3 style kit, and the
  E1 pinned-grade corpus**, so drift in radius, type, or grades fails a test.
- **H2. Device matrix**, run once at the end of Tracks B, C, E, and F and
  recorded in a QA doc in the PR-NN style: notched iPhone and a 360-dp
  Android; portrait and both landscape directions; light and dark; en /
  zh-Hans / zh-Hant; default and largest text; 2/3/6/9 seats; Coach on/off;
  every table family; a private session in which the viewer deliberately
  misses a turn; and R30–R33.
- **H3. Accessibility dump gate.** Turn the ad-hoc `androidUiDump.py` pass into
  a repeatable check: for each captured screen, zero clickable nodes without a
  label and zero exposed private-use glyph nodes; extend the captured set to
  private table, Learn, Profile, and the main sheets.
- **H4. Selectors.** Primitives ship with stable `testID`s so F5 can retire
  the English-text Maestro selectors.
- **H5. Heads-up regression.** The E1 corpus proves existing heads-up grades
  did not shift.

#### Track I — Stretch (only if E and F ship clean)

- **I1. Table-specific reads.** The opponent profile sheet already works on
  device ("Dex · AI · Pressure · plays more hands, attacks capped ranges").
  Extend it with what this table did — hands seen, fold-to-3-bet, showdown
  frequency — using the device-local public-tendency memory in
  `opponentMemory.ts` as the source, so the persona becomes evidence.
- **I2. Join friction.** Verify the invite link and `rivermind://` deep link on
  Android. Currently unverified on any platform.

## Explicitly deferred

- A brand or palette redesign; the thirty color tokens and the felt stay.
- New navigation library, new tabs, or moving capabilities between Home,
  Learn, and Play.
- AI strategy or evaluation-band changes; poker rule changes; schema or
  migration changes; worker changes beyond the Q8 policy decision if taken.
- Do-overs at private tables or any simulation of a human opponent.
- Solver-backed or claimed GTO grading; displaying unvalidated EV numbers.
- Expanding server-generated AI explanations to every multiway decision.
- New seat counts, tournament events, locales, monetization, ranked ladders,
  public matchmaking, or account migration away from anonymous auth.
- Product analytics beyond what Phase 17 defines.
- Animation or motion design beyond honoring reduced motion.
- iPad-specific layout work beyond keeping today's tablet behavior intact.

## Decision points (owner input required before build)

- **Q1 — Token set.** Approve the A1 scale or supply the sizes you want. Gates
  every screen change.
- **Q2 — Loss treatment.** Neutral border (recommended) or muted amber for a
  lost hand. Red is not an option under the Phase 14 rule.
- **Q3 — Missing personas.** Author four portraits (needs art) or retire Elsa,
  Milo, Noah, and Otto.
- **Q4 — Human avatar presets.** Six distinct authored marks, or initials on
  color.
- **Q5 — Hardware back on the table.** Open the leave-table confirmation
  (recommended) or ignore back during a live hand.
- **Q6 — Shell decomposition depth.** File moves only (recommended) or also
  split state into hooks.
- **Q7 — Shell orientation policy.** Keep portrait-only on iPhone and iPad
  (current, zero work, recommended for 1.2) or let iPad rotate outside tables
  (`unlockAsync` on exit, shortest-side breakpoints, four-edge safe areas, an
  iPad landscape pass on every shell screen).
- **Q8 — Missed-turn policy.** Keep one strike to sitting-out for a connected
  seat (no worker change; recommended for 1.2 with the F1 visibility fixes)
  or move to two strikes (coordinator change, worker redeploy, migration-free).
- **Q9 — Preview flag.** Delete the flag and dead branches (recommended) or
  drive visibility from a capability probe.
- **Q10 — Crash reporting.** Which SDK, and does it survive the Phase 17
  posture; or skip for 1.2.
- **Q11 — Do-over cost ceiling.** N runs per do-over (proposed 200) and
  whether the player can opt into a slower, higher-N view; the low-end device
  used for the budget gate.
- **Q12 — Phase 17 ordering.** Ship instrumentation with or before 1.2, or
  accept that review and do-over impact is measured by hand.
- **Q13 — Progress unit.** BB/100 with chips alongside (recommended) or chips
  per 100 hands only.

## Success measures

Measured only where a source exists; items marked † need Phase 17 or a manual
tally.

- Distinct `borderRadius`, `minHeight`, and `fontSize` values in `src/features`
  drop from 30 / 50 / 34 to the token set, enforced by the A4 scan.
- Duplicated style keys between the three table screens drop from 72 to zero.
- Modal scrim, header, and close implementations drop from 16 / 8 / 9 to one
  each.
- Every clickable node in the H3 dumps has a label; zero exposed glyph nodes.
- Every persona id has an avatar asset (test-enforced).
- R1–R29 closed with paired before/after evidence; R30–R33 observed.
- The E1 corpus pins every existing heads-up and multiway grade; a 9-max hand
  reviewed on device shows the correct seat position and players behind.
- Graded-decision coverage: hero decisions with a grade, in multiway and
  private sessions, as a percentage of all hero decisions with a decision
  snapshot. Target 100 percent; a gap is a bug.
- † Share of completed private sessions where the player opens Review hands.
- † Do-over rate on reviewed decisions at AI tables.
- † Spot progress: players with at least one spot past its floor whose rating
  moves in the direction the review told them to work on.
- Friend tables: zero sessions in which a sat-out viewer has no visible seat
  and no visible way back; creator-excluded reports driven to zero or
  explained by the archive.
- † Crash-free sessions after F3, by app version and platform.

## Exit gates

- `pnpm typecheck`, `pnpm test` (including A4 scans, A2/A3 rendered fixtures,
  E1 corpus, F4 lane test), `pnpm verify:release-config`,
  `pnpm verify:mobile-secrets`, and `git diff --check` pass on the release
  commit.
- Android and iOS release builds pass the artifact gate (target SDK 36, 16 KB
  alignment) and the F2 private-table entry assertion.
- The H2 device matrix is run on the exact signed candidate and recorded with
  screenshots; no unchecked item is waived.
- No new English literal ships without zh-Hans and zh-Hant in the same
  commit; `catalogParity` and `chineseQuality` pass; every `{{players}}`
  family string is checked in all three locales.
- `pnpm eval:multiway-ai` and `pnpm test:multiplayer-integration` match their
  1.1 results; no coordinator test changes unless Q8 chose two strikes.
- A do-over, if shipped, shows a distribution with N and seed visible, is
  labelled against RiverMind AI, and never renders as a past-tense fact; its
  budget is recorded for the named low-end device.
- The F1 Step 1 archive check is recorded with its outcome before any
  coordinator change is proposed.

## Rough cut

| Slice | Estimate | Ships in 1.2? |
| --- | --- | --- |
| A1 tokens + A4 scans | 2–3 d | Required |
| A2 primitives | 3–4 d | Required |
| A3 table style kit | 2–3 d | Required |
| A5 shell file moves | 1–2 d | Should |
| B1 hero hierarchy | 2–3 d | Required |
| B2–B7 table consistency | 3–4 d | Required |
| B8 geometry re-verification | 1 d device | Required |
| C1–C2 Play hub | 1–2 d | Required |
| C3 Learn nesting | 1–2 d | Should |
| C4–C5 identity | 1–2 d + art (Q3/Q4) | Required (test); art contingent |
| C6 dark elevation | 0.5–1 d | Required |
| C7 Continue row | 1 d | Stretch |
| C8 casing | 0.5 d | Required |
| D1–D8 accessibility, input, states | 4–5 d | Required |
| D9 silent-failure surfacing | 1 d | Should |
| D10 orientation hygiene | 0.5 d | Should |
| E1 grader proof at 9 seats | 1–2 d | Required |
| E2 private-table review finished | 1–2 d + device | Required |
| E3 spot-level progress | 3–4 d | Required |
| E4 do-overs (AI tables) | 6–9 d | Should, cut first |
| E5 multiway copy | 2–3 d | Should |
| F1 sat-out visibility + archive check | 0.5 d check + 1–2 d | Required |
| F2 structural visibility + artifact assert | 1 d + both-platform QA | Required |
| F3 crash reporting | 1–2 d + Q10 | Should |
| F4 lane test | 0.5 d | Required |
| F5 CI, artifact gate, selectors | 3–4 d | Should |
| H2 device matrix + QA doc | 2 d | Required |
| H3 dump gate | 1 d | Should |
| I1–I2 stretch | 4–6 d | Stretch |

Minimum credible 1.2 is **A1 + A2 + A3 + B1 + B3 + B4 + B5 + C1 + C5 + D1 +
D2 + D3 + D7 + E1 + E2 + E3 + F1 + F2 + F4 + H2**. With that set the release
can say one true sentence: the app looks and behaves like one product on
every screen, every hand at every table size is reviewed the same way and
the player can see which spots are moving, and a friend table never loses
its host without saying so.

## Appendix — evidence index

| File | What it shows |
| --- | --- |
| `artifacts/android/device/10-table-9max-11.png` | Current 9-max local portrait: felt fills the pane, hero cards smallest on screen, blank bands between rows |
| `artifacts/android/device/11-play-hub.png` | Current Play hub, scrolled past its header: configurator fills the viewport; duplicate custom-game row below |
| `artifacts/android/device/mp-05-my-turn.png` | Private table: duplicate "Your turn", Raise-only icon, Noah letter avatar, viewer present |
| `artifacts/android/device/mp-06-after-call.png` | Hand 1 flop with the viewer plaque present and a live turn |
| `artifacts/android/device/mp-07-raise-panel.png` | Hand 2: viewer plaque absent; empty action area with no waiting copy |
| `artifacts/android/device/mp-03-hand10.png` | Hand 10: viewer plaque absent; winner stack truncated; showdown grammar |
| `artifacts/android/device/mp-08-stuck.png` | Loss result framed in red; viewer plaque absent |
| `artifacts/android/device/mp-04-standings.png` | Creator at #3, net 0 after 10 hands; Review hands present; generic AI icons |
| `artifacts/android/device/ui-9table.xml` | 18/18 clickable nodes labeled; 7 glyph-only text nodes |
| `artifacts/android/device/ui-play-11b.xml` | Play dump proving the header sits above the fold in the scrolled capture |
| `docs/assets/phase16-slice-3.11/private-nine-seat-lobby.png` | Back and close together; center label bleed (verify) |
| `docs/assets/phase16-slice-3.11/profile-avatar-layout.png` | Avatar shown twice; identical preset silhouettes |
| `docs/assets/phase16-slice-3.11/dark-mode-home-contrast.png` | Dark Home CTA contrast (verify) |
| `docs/assets/phase16-slice-3.11/hand-result-duplication.png` | Red-framed neutral result; reaction launcher crowding the rail; "Take back my seat" only in the result panel |
| `artifacts/google-play/phone/03-learn.png` | Three-deep card nesting and repeated eyebrows on Learn |
