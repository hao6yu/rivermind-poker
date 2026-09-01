# Phase 16 Slice 3.11 — Physical-device testing notes, round 4

## Status

Open for troubleshooting and implementation. These findings came from the signed iOS build installed after commit `092e8f8e` (`fix(table): avoid orientation lock during mount`) on 2026-08-31.

The orientation-mount crash is no longer blocking entry into the tested local nine-player game: the table opened, rotated, and advanced through hands on the physical iPhone. That is a positive hotfix signal, not yet a complete device gate. The findings below remain open.

This note supplements [the Slice 3.11 scope](PHASE_16_SLICE_3_11_SCOPE.md) and [release record](PHASE_16_SLICE_3_11_RELEASE_RECORD.md). It records the newly observed device behavior and the acceptance criteria for fixing it.

## Evidence

The screenshots contain test data and may be used without sanitization. They are evidence of the tested build, not pixel-perfect design specifications.

| Reference | Evidence |
| --- | --- |
| [Portrait nine-seat table with unused space](assets/phase16-slice-3.11-device-round-4/local-nine-seat-unused-space.png) | The felt and controls occupy only the upper portion of a tall portrait screen while a large inert area remains below. The AI badges also cover the beginning of several names. |
| [Portrait nine-seat role/order and plaque overlap](assets/phase16-slice-3.11-device-round-4/local-nine-seat-order-and-plaque-overlap.png) | The visible D/SB/BB progression runs opposite the agreed screen-clockwise ring, uploaded hero imagery has fallen back to an initial, and compact AI badges collide with names. |
| [Earlier landscape nine-seat capture](assets/phase16-slice-3.11/private-nine-seat-landscape.png) | Landscape density and edge placement provide a reference for the newly reported camera/notch overlap. A fresh capture should be added during the fix verification. |

## Agreed product direction

1. Use the available screen instead of preserving a small fixed-aspect felt above a large blank region.
2. Respect the physical safe area on whichever landscape edge contains the camera/notch/Dynamic Island.
3. Keep Championship entry clean. The existing Championship journey is the map; do not advertise a second action as “Map & record” when it opens only Record.
4. An uploaded avatar must remain the player’s avatar everywhere the same profile is rendered.
5. The visible table ring and canonical poker order must use the same clockwise direction.
6. Keep an explicit text indication for AI, but move it out of the name row. Color may support the distinction but cannot be the only indication.
7. Measure player message/action bubbles against the safe felt pane and keep the full bubble visible at both table edges.
8. Every occupied plaque remains tappable and opens the shared player-profile popup, including AI plaques and the viewer’s own plaque.
9. Read-only profile, session-history, and Table-stats actions remain available during the viewer’s turn.
10. Public **Play vs RiverMind AI** exposes Friendly, Club, Sharp, and Elite. Nemesis remains hidden outside earned Championship content. Stack choices show only 800, 2,000, and 4,000 chips.
11. Home exposes the most-used poker references directly without requiring Home → Learn → reference → tool.
12. Rename **Meet the players** to the more personal **Meet the developer’s poker friends**. Suggested Chinese titles are **认识开发者的牌友** and **認識開發者的牌友**.
13. Every changed string, error, accessibility label, hint, empty state, and announcement ships together in English, Simplified Chinese, and Traditional Chinese.

## Open findings and acceptance criteria

### DT-01 — Portrait felt leaves most of the usable height empty

**Priority:** P1 usability

**Observed:** On the tested tall iPhone, the nine-seat felt stops near the middle of the screen, the coaching and action rows finish well above the bottom safe area, and the remaining lower region is blank.

**Likely implementation source:** `resolveMeasuredTableLayout()` deliberately caps portrait felt height from an ideal aspect ratio. Its regression test currently says “never stretches a tall portrait pane.” `MultiwayPokerTableScreen` then applies the returned pane height as `tableFrame.maxHeight`. That contract now conflicts with the physical-device product decision.

**Expected behavior:**

- The header stays compact at the top.
- The action row stays reachable above the bottom safe area.
- The felt expands into the remaining useful height, especially for six- and nine-seat rings where additional separation improves readability.
- The coaching card and collapsed feed occupy only the height they need.
- A tall phone must not retain a large inert region below all interactive content.
- Expansion must improve spacing between plaques, hole cards, board, pot, bubbles, and the hero seat; it must not merely scale fonts or stretch the felt background.

**Acceptance:**

- On the captured viewport, the felt and lower controls use the available pane with no blank region larger than roughly one action-row height below them.
- The same layout remains collision-free at 2, 3, 6, and 9 seats, with Coach both on and off.
- Small phones may remain compact; tall phones expand. No device-class-specific hard-coded height is the sole source of truth.
- Replace the current “never stretches” regression with a bounded-useful-expansion test and collision assertions.

### DT-02 — Landscape content enters the camera/notch safe area

**Priority:** P1 physical-device blocker

**Observed:** In landscape, the two plaques nearest the camera side can sit underneath the device hardware area.

**Confirmed implementation risk:** The multiway table is wrapped with horizontal `SafeAreaView` edges only for six players. Nine-player local tables receive only top and bottom edges. The measured resolver is also passed zero left/right insets because it assumes the measured body has already excluded them.

**Expected behavior:**

- Apply live left and right safe-area insets to every table size in both landscape directions.
- The felt may extend decoratively beneath an inset only if all names, avatars, cards, badges, buttons, bubbles, and feed content stay in the safe content rectangle.
- Rotating 180 degrees must move the protected inset with the physical camera side.
- Local, Championship, Daily Challenge, Sit & Go, mission, and private tables use the same edge-safety contract.

**Acceptance:** No occupied plaque, tappable control, hole card, action bubble, or text intersects either horizontal safe-area rectangle on a notched/Dynamic-Island iPhone. Verify landscape-left and landscape-right, not only one rotation.

### DT-03 — Championship “Map & record” is misleading and redundant

**Priority:** P2 clarity

**Observed:** The branded Championship card contains a **Map & record** action whose purpose is unclear.

**Implementation finding:** A Championship journey already exists in `ChampionshipModal`; it is the ordered event map/list and contains its own **View record** action. The entry card’s **Map & record** control calls `onOpenRecord` directly, so its label claims two destinations while opening only one.

**Recommendation:** Remove the secondary **Map & record** control from the branded Play card. Tapping the card header or primary Start/Continue action opens the Championship journey. Record remains available inside that journey and from Profile. This preserves the feature while reducing duplicate navigation.

**Acceptance:**

- No Play-card control says **Map & record**.
- Start/Continue and the card header open the Championship journey consistently.
- The journey’s Record action still opens the saved Championship record and returns to the journey.
- English and both Chinese catalogs remove or replace the old label and accessibility copy together.

### DT-04 — Uploaded avatar falls back to an initial in the game

**Priority:** P1 identity regression

**Observed:** The user selected and saved a photo avatar, but the local table hero plaque rendered an `H` initial instead of the photo. The feature reportedly worked before the latest device build.

**Troubleshooting boundary:** Verify all three linked values rather than patching the hero plaque alone:

1. the persisted `HumanAvatarReference` still points to the expected uploaded avatar id/version;
2. the uploaded-avatar registry still contains a renderable persistent local URI with the same version after navigation, process restart, and an install-over update;
3. `HumanAvatar` receives that reference and resolves the image on every surface.

The processed photo must live at an application-persistent file location. A temporary picker/crop URI must not be treated as durable profile state.

**Acceptance:**

- Save an ordinary iPhone HEIC/HEIF/JPEG photo through the adjustment preview.
- The photo appears immediately in Profile, the Home entry, local 2/3/6/9-seat hero plaques, private lobby/live play, the viewer profile popup, results, and replay wherever those surfaces render identity.
- Force-quit and relaunch: the photo still renders.
- Install a newer build over the same bundle without deleting data: the photo still renders.
- If room-private upload or download fails, the owner’s local avatar continues to render locally; another device gets a truthful fallback without corrupting the saved local profile.
- Add a rendered component/integration test for an uploaded avatar, not only authored-avatar and storage-unit tests.

### DT-05 — Visible role progression is counterclockwise

**Priority:** P1 poker trust

**Observed:** In the second capture the dealer is at the lower-right seat, while SB and BB continue upward on the right edge. That is counterclockwise under the agreed screen coordinate system.

**Authoritative ring rule:** With the viewer at bottom center, clockwise proceeds:

`viewer → bottom-left → lower-left → upper-left → top-left → top-right → upper-right → lower-right → bottom-right → viewer`

For every hand, walking that ring from the dealer must encounter **D → SB → BB → remaining seats → D**, skipping ineligible/eliminated seats as poker rules require.

**Action rule:**

- Preflop action begins at the first eligible player clockwise after the big blind.
- Postflop action begins at the first eligible player clockwise after the dealer.
- Heads-up retains its special rules.
- Action history, current-turn highlight, bubbles, speech/reactions, feed rows, replay, and role badges must all project the same canonical sequence.

**Troubleshooting requirement:** Capture one deterministic nine-seat fixture containing seat id, numeric seat, anchor, D/SB/BB, `preflopActionOrder`, `postflopActionOrder`, and emitted history sequence. Determine whether the defect is in engine seat order, viewer-relative rotation, or presentation mapping. Do not reverse only the plaques or only the badges.

**Acceptance:**

- A named nine-seat fixture proves role adjacency and both street action orders in the agreed clockwise direction.
- A second fixture rotates the dealer through every occupied seat and proves wraparound.
- The same assertions cover 3- and 6-seat tables plus heads-up special behavior.
- The screenshot-level rendered test checks the spatial anchors, not only an array named `clockwise`.

### DT-06 — Compact AI badge covers player names

**Priority:** P1 readability

**Observed:** The absolutely positioned **AI** pill occupies the same top-left name row used by compact left and right plaques. Names such as Uncle Tu, Hao, Steve, and edge-seat names are covered or clipped.

**Recommended design:** Use a small **AI** border tab attached to the plaque’s upper border, outside the text lane. Give AI plaques a restrained accent border as supporting emphasis. Keep the localized text `AI` so identification does not depend on color. Do not use red, winner, active-turn, or danger colors.

**Acceptance:**

- The AI indicator never reduces or overlays the name’s text rectangle.
- Full names at the supported maximum length remain readable or ellipsize normally after their own available width, not beneath a badge.
- D/SB/BB, AI, active-turn, just-acted, folded, all-in, and winner treatments can coexist without overlap or ambiguous colors.
- VoiceOver/TalkBack identifies the seat as AI even when the visual border color cannot be perceived.

### DT-07 — Tapping occupied plaques does not reliably open profiles

**Priority:** P1 missing agreed interaction

**Observed:** Tapping an AI plaque in the local table did not open a profile. The shared behavior agreed for 3.11 is not demonstrable on the tested path.

**Confirmed implementation risk:** Local and multiplayer table code deliberately removes profile handlers or dismisses an open profile while it is the viewer’s turn. This makes the interaction appear broken precisely when the player is most likely to test it.

**Expected behavior:**

- Every occupied AI, human, and viewer plaque is a minimum 44-point tappable target or has an equivalent expanded hit target.
- AI popup: large authored avatar, name, fun title, personality label, and description.
- Human popup: the same visible identity and Play record shown on that human’s Profile, subject to the existing private-room authorization and truthful coverage rules.
- Viewer popup: the viewer’s own identity and Play record.
- Tap outside closes; explicit Close and platform Back/Escape work; tapping inside does not dismiss.
- No hole cards, private strategy, account id, or owner-only history is disclosed.

**Turn behavior:** The popup remains openable during the viewer’s turn. Opening it never acts, pauses, extends, or resets a multiplayer/Championship turn clock. A compact in-popup turn/timer notice and one-tap Close keep the live decision visible.

**Acceptance:** Render and device-test the popup from AI, other-human, and viewer plaques during another player’s turn and during the viewer’s turn across local and private tables.

### DT-08 — Read-only statistics action is disabled on the viewer’s turn

**Priority:** P2 interaction consistency

**Observed:** The top statistics action is present but unavailable during the viewer’s turn.

**Expected behavior:** Read-only header actions are not disabled solely because it is the viewer’s turn. This covers private-table **Table stats**, local **Session hands/history**, and the occupied-seat profile popup.

**Acceptance:**

- The action opens during the viewer’s turn without mutating game state.
- Timed clocks continue and cannot be extended by repeatedly opening/closing the sheet.
- The sheet clearly surfaces a live “Your turn”/remaining-time notice when applicable.
- Closing returns to the same live action state unless the server legitimately advanced or enforced a timeout.
- Screen-reader focus returns to the invoking header action.

### DT-09 — Public AI setup exposes Nemesis and verbose stack labels

**Priority:** P2 product-rule regression

**Observed:** **Play vs RiverMind AI** currently exposes five difficulties and renders each stack as chips plus a big-blind explanation over multiple lines.

**Expected behavior:**

- Public choices: Friendly, Club, Sharp, Elite.
- Nemesis remains hidden and earned through Championship/hidden invitation content.
- Stack choices show only `800`, `2,000`, and `4,000` chips.
- Do not show `40 big blinds`, `100 big blinds`, or similar secondary labels in this compact selector.
- Internal stack/blind math remains unchanged; this is a selection and presentation rule, not a change to poker units.

**Acceptance:** Verify the four public tiers and three chip values in English, Simplified Chinese, and Traditional Chinese at standard and large text. Existing saved Nemesis custom setup values must normalize to a visible supported tier instead of producing an invisible selected state.

### DT-10 — Home cheat-sheet shortcut still requires a second navigation step

**Priority:** P2 navigation friction

**Observed:** Home’s **Poker cheat sheets** shortcut opens Learn’s reference collection, after which the user must select the desired tool again.

**Recommended compact Home design:** Replace the single shortcut row with a collapsible **Poker tools** card:

- collapsed by default: **Hand rankings** and **Preflop range explorer**;
- **More tools** expands in place to reveal **Common percentages** and **Advanced decision math**;
- tapping any tool opens that exact existing reference directly in a modal/sheet and closes back to Home;
- the expansion affordance is 44 points or larger and exposes expanded/collapsed state to accessibility;
- do not duplicate reference content or progress state—reuse the existing Learn tools and localization.

This removes the double tap without adding a new top-level tab or a large permanent Home block.

**Acceptance:** Each of the four Home entries opens its intended existing tool in one tap. Back/Close returns directly to Home. Learn continues to expose the same reference collection through its own catalog.

### DT-11 — “Meet the players” can be more personal

**Priority:** P2 copy/brand

**Decision:** Rename it to **Meet the developer’s poker friends**. This is grammatically clearer than “developer’s friend players” while retaining the playful personal tone.

Suggested localized titles:

| Locale | Title |
| --- | --- |
| en | Meet the developer’s poker friends |
| zh-Hans | 认识开发者的牌友 |
| zh-Hant | 認識開發者的牌友 |

The description should explain that these are the real-life inspirations behind RiverMind’s table regulars without adding privacy, upload, or technical copy to the Home card. Final wording must be reviewed in all three locales. The roster still opens the existing popup presentation; this change does not reintroduce inline expanding profiles.

### DT-12 — Edge-seat player messages are clipped

**Priority:** P1 live-table readability

**Observed:** In a multiplayer hand, a message/action popup attached to a right-edge player was not fully visible. Left-edge seats may have the mirrored defect and must be tested rather than assumed safe.

**Expected behavior:**

- Resolve the bubble against the measured safe felt pane after its real localized text, font scale, and width are known.
- Right-edge bubbles extend inward to the left; left-edge bubbles extend inward to the right. Center seats may center normally.
- If the preferred above/below placement would leave the pane or collide with a protected board/action lane, flip it to the available side and keep the tail pointing at the source plaque.
- Clamp the full bubble, border, shadow, and tail inside the safe content rectangle, including the camera/notch inset in landscape.
- Do not solve clipping by globally shrinking all message text or truncating ordinary short messages.
- Apply the same placement contract to local and private-table action bubbles, player messages/reactions, reconnect/status callouts, and any equivalent plaque-anchored dialog.

**Acceptance:**

- Exercise every anchor on 2-, 3-, 6-, and 9-seat tables in portrait and both landscape directions.
- Use longest supported English, Simplified Chinese, and Traditional Chinese messages at default and large text scales.
- Assert the measured bubble rectangle is contained by the safe pane and does not cover the protected community-board/action region or the source plaque’s essential name/stack/role content.
- Add rendered fixtures for the outermost left and right seats; pure source-style or nominal-width assertions are insufficient.
- Capture fresh physical-device evidence for both edges after the fix.

## Release behavior clarifications

### Nine-seat local and multiplayer testing

- Nine-seat local AI is client-side and is not restricted to the currently registered iPhone. Any compatible build from this code can include it.
- Private nine-seat multiplayer is gated by the client build’s multiplayer flag, capability 4, and selected Edge Function—not by a particular phone.
- The installed ad-hoc candidate uses the isolated `multiplayer-room-preview` QA worker. The currently released protocol-3/max-six client cannot join a preview room, and a capability-4 preview client is intentionally refused by the old canonical worker.
- A few friends can test through TestFlight, but every participant must install the same capability-4 TestFlight preview build. That build should use the preview environment/worker so the currently released app and canonical production worker remain untouched.
- Do not point a new TestFlight client at the old production worker or mix current-release and preview clients in one room. Create a store-distributed TestFlight preview profile that preserves the preview environment, build and submit it, then invite the intended tester group.
- Internal TestFlight testers must be App Store Connect users. Friends who are not App Store Connect users are external testers and the build must pass TestFlight App Review before they can install it.

### Championship reset timing

- Championship progression and its active checkpoint are device-local; the hosted multiplayer SQL migrations do not read or clear them.
- The reset runs in `src/services/championshipProgress.ts` when the upgraded client first loads Championship progress/checkpoint state during app startup.
- `migrateChampionshipForEliteNemesisRelease()` removes only the two Championship storage keys and writes a one-time receipt. The v2 guard then persists one valid empty version-2 progress state and removes an invalid legacy checkpoint.
- Once the receipt exists, later launches/builds preserve new Championship v2 progress. Identity, avatar, learning progress, Daily Challenge, Sit & Go checkpoints, hand history, language, and preferences remain untouched.
- Therefore, a user who has already launched a Slice 3.11 client has already crossed the reset boundary on that device. Deploying the hosted SQL earlier did not cause the reset.

## Suggested implementation checkpoints

### Checkpoint A — Table geometry and trust

- DT-01 useful portrait expansion.
- DT-02 bidirectional landscape safe areas.
- DT-05 canonical clockwise roles/actions with deterministic fixtures.
- DT-06 non-overlapping AI border tab.
- DT-12 safe measured player-message placement at every edge.

Commit only after layout collision tests and 2/3/6/9-seat rendered fixtures pass.

### Checkpoint B — Identity and read-only overlays

- DT-04 uploaded-avatar persistence/rendering.
- DT-07 profile popups from every occupied plaque.
- DT-08 statistics/history access during the viewer’s turn.

Commit only after restart/install-over avatar evidence, timer-safety tests, and AI/human/viewer popup tests pass.

### Checkpoint C — Play and Home simplification

- DT-03 Championship entry cleanup.
- DT-09 public AI tier and stack presentation.
- DT-10 direct Home poker tools.
- DT-11 personal roster branding.
- All English, Simplified Chinese, Traditional Chinese, and accessibility copy.

Commit only after direct-route, saved-setting normalization, catalog parity, and localization tests pass.

### Checkpoint D — Integrated device gate

- Run the full local unit/type/lint/release configuration gates.
- Build the exact signed candidate that contains A–C.
- Repeat the matrix below on device and record screenshots/logs.
- Do not mark release-ready until the physical and multiplayer requirements actually run.

## Required QA matrix

### Layout and interaction

- Portrait and both landscape directions.
- Current notched/Dynamic-Island iPhone plus one compact viewport/simulator.
- Light and dark themes.
- English, Simplified Chinese, Traditional Chinese.
- Default text and the project’s large accessibility text scale.
- 2, 3, 6, and 9 seats.
- Coach on/off, feed collapsed/open/rail, reaction closed/open, edge-seat messages/actions, result state, and profile/stats overlays.

### Table families

- Local practice.
- Sit & Go.
- Daily Challenge.
- Championship, RiverMind Final, The River Below, and The Undertow.
- Learning missions.
- Private 2/3/6/9-seat lobby, live hand, reconnect, result, rebuy, and Table stats.

### Identity

- Default human avatar, authored avatar, and ordinary iPhone uploaded photo.
- Save, navigate, background/foreground, force-quit/relaunch, and install-over update.
- Own seat, another human seat, AI seat, lobby, live table, popup, results, and replay.
- Authorized private-room remote avatar and denied/unavailable fallback.

### Poker order

- Deterministic D/SB/BB adjacency around the rendered ring.
- Preflop first actor after BB.
- Postflop first actor after dealer.
- Folded, all-in, busted, disconnected, sitting-out, departed, and reconnected seats skipped without reversing the ring.
- Feed, bubbles, plaque status, replay, and engine history remain monotonically consistent.

## Exit criteria

This round is closed only when:

1. every DT item has fail-before and pass-after evidence;
2. the exact signed build passes the physical-device matrix applicable to the changed surfaces;
3. every user-visible string has English, Simplified Chinese, and Traditional Chinese coverage;
4. no large portrait dead zone, landscape hardware overlap, AI/name collision, clipped edge message, missing uploaded avatar, disabled read-only action, or counterclockwise role sequence remains;
5. the worktree is clean and the release record names any still-blocked two-device, hosted, signing, accessibility, or performance gate without waiving it.

---

# Slice 3.11 device hardening — implementation record

Branch: `local/slice-3.11-device-hardening`. Start base `d7bdb185`. Final tested commit `ea613912` (worktree clean). iOS crash fix `092e8f8e` preserved (confirmed ancestor).

Checkpoint commits:
- C — Play/Home simplification (`DT-03/09/10/11`): `aa671691`
- A — Table geometry and trust (`DT-01/02/05/06/12`): `7970702d`
- B — Identity and overlays (`DT-04/07/08`): `ea613912`

| DT | Root cause | Fix boundary | Regression (fail-before → pass-after) | Commit |
| --- | --- | --- | --- | --- |
| DT-01 | Portrait pane center-capped by ideal aspect, leaving a large inert lower region on tall phones. | `multiwayTableLayout.ts`: portrait `MEASURED_ASPECT.min` → 0.6; pane fills `availableHeight` via `idealHeight`/`expansionCeiling`; `paneTop` centers in landscape but top-insets in portrait so the felt uses the whole pane. | Old test asserting "tall pane never stretches" contradicted by device review and replaced by bounded-expansion + collision fixtures; `multiwayTableLayout.test.ts` 38 tests pass. | `7970702d` |
| DT-02 | Landscape felt not inset from the camera/notch on 3/6/9-seat local tables (only 6 max got all-four edges). | `AppShell.tsx`: multiway `SafeAreaView` now always uses `['top','right','bottom','left']`; resolver still receives `insets:{0,0,0,0}` (the view already excludes them), so no double-apply. | New rotation fixture with asymmetric insets `{left:59,right:21}` / `{left:21,right:59}` asserts every occupied region stays out of the notch in both directions. | `7970702d` |
| DT-05 | Presentation mapped seat-sorted player order onto anchors, projecting Dealer→SB→BB counterclockwise for a rotated/joined hero. | `multiwayGameplayPresentation.ts`: `multiwaySeatPlacements` rotates `playerIds` from the hero (`clockwiseFromHero = [...slice(index+1), ...slice(0,index)]`) before dropping the hero. Engine seat order remains authoritative. | `multiwayActionOrder.test.ts`: rotated-hero fixture (hero seat 4), dealer rotation through every seat, 3/6/heads-up, plus a resolver spatial test comparing the swept screen angle to the engine's clockwise-from-hero order. 13 tests — fail without the fix, pass with it. | `7970702d` |
| DT-06 | Absolute-positioned AI pill occupied the same top-left name row, covering/clipping names. | `multiwayGameplayPresentation.ts` `multiwaySeatAiTabOffset(tablet)` → `-7`/`-6`; the AI badge is moved OUT of the name lane to a border tab (`top` negative) above the plaque; `aiSeatLabel` gets a restrained `palette.muted` border that never uses danger/winner/active colours. | `multiwayGameplayPresentation.test.ts` asserts offset `< 0` and `> -12/-14` (never back over the name row). | `7970702d` |
| DT-12 | Edge-seat action/message bubbles clipped off the felt or under the notch. | `multiwayGameplayPresentation.ts` `resolveMultiwayBubbleFrame`; wired into `MultiwayPokerTableScreen.tsx` so the rendered bubble uses the measured seat rect, safe pane, board lane, and real bubble width. Edge seats bias inward, preferred side flips off a clipping/board side, and the whole frame clamps inside the safe pane. | `multiwayGameplayPresentation.test.ts` DT-12 block: 9-seat landscape sweep asserting pane containment, inward edge bias, source-plaque non-overlap, and board-clear only where a clean side exists; plus a flip-off-the-pane-top/bottom fixture. 19 tests pass. | `7970702d` |
| DT-04 | Uploaded photo could fall back to an initial if the authored PNG asset map blocked a real render boundary, and there was no rendered integration coverage for an uploaded image. | `HumanAvatar.tsx` keeps the single render boundary; the authored asset map moves to `components/humanAvatarAssets.ts` so tests mock only the binary assets. Registry entry is the durable state (ownerId/local path), never a picker/crop URI. | `HumanAvatar.uploaded.test.tsx` seeds real `localStorage` and proves the uploaded URI renders for a matching authorized reference, and falls back to initials for unknown id, stale version, foreign avatar outside its room, and foreign avatar without context — while still rendering a foreign avatar inside its room and the device-owned avatar anywhere. 6 tests. | `ea613912` |
| DT-07 | Turn-based handler removal + auto-dismiss made the plaque popup broken exactly on the viewer's turn. | `MultiwayPokerTableScreen.tsx`: seat press always opens the shared popup (AI + hero/viewer); the auto-dismiss effect is removed; opening never acts/pauses/resets a clock; popup surfaces a compact localized "your turn" notice (with remaining clock time when one runs). Backdrop/Close/Android-Back and modal focus containment unchanged. | No automated screen render test (see limitation); validated by typecheck + the multiway presentation suite. Device physical-tap gate remains pending. | `ea613912` |
| DT-08 | Read-only stats/history could not be opened during the viewer's turn. | Same screen: session-hands button and the occupied-seat popup stay openable during the turn; the turn clock depends on the turn-scoped game key and AppState, not sheet visibility, so repeated open/close cannot reset it. | No automated screen render test; validated by typecheck + inspection. Device timer-safety gate remains pending. | `ea613912` |
| DT-09 | Play vs RiverMind exposed Nemesis and big-blind stack labels. | Committed with Checkpoint C: public tiers Friendly/Club/Sharp/Elite; Nemesis hidden; stacks show only 800/2,000/4,000; stale saved Nemesis normalizes to a visible tier. | Checkpoint C suite (see `aa671691`); covered in the full-suite run. | `aa671691` |
| DT-10 | Home cheat-sheet route was two-step and opened the whole catalog. | Committed with Checkpoint C: one compact collapsible **Poker tools** card (collapsed Hand rankings + Preflop range explorer; expanded also Common percentages + Advanced decision math); each item opens the exact tool and returns to Home. | `PokerToolsCard.test.tsx` collapse/expand + direct-open; covered in the full-suite run. | `aa671691` |
| DT-11 | "Meet the players" branding. | Committed with Checkpoint C: renamed and localized in en/zh-Hans/zh-Hant. | `catalogParity`/`chineseQuality` suites pass in the full-suite run. | `aa671691` |
| DT-03 | Misleading Play-card secondary "Map & record" action. | Committed with Checkpoint C: removed; path preserved journey→Record→journey and Profile→Record→Profile. | Checkpoint C suite; covered in the full-suite run. | `aa671691` |

## Localization / accessibility changes

- New `multiway.profile.turnNotice` key (DT-07/08) shipped in en (`Your turn — act after closing`), zh-Hans (`轮到你——关闭后行动`), zh-Hant (`輪到你——關閉後行動`); passes `catalogParity.test.ts` and `chineseQuality.test.ts`.
- All new copy is localized. Private live-table AI identity no longer puts a
  visible text pill in the constrained name row: its authored AI avatar plus a
  dashed plaque boundary provide the visual distinction, while the grouped
  accessibility label still explicitly announces the localized AI identity.
  Winner state uses a gold plaque boundary and the localized result panel;
  the overlapping inline cup was removed. The turn notice uses text plus a
  timer icon.

## Gate results

See `docs/assets/phase16-slice-3.11-device-hardening/local-gate-evidence.md` for exact command lines, exit codes, and bundle-checks. Summary: typecheck PASS; full suite PASS (172 files / 1873 tests); `verify:release-config` PASS; `verify:mobile-secrets` PASS; `git diff --check` PASS; production iOS+Android JS export PASS (Hermes `.hbc`); `verify:multiplayer-edge` NOT RUN (Supabase CLI absent); physical/two-device/signed/TestFlight gates NOT RUN.

## Final status (DeepSeek checkpoint; superseded)

> Superseded by the [Codex takeover gate and corrective checkpoint record](assets/phase16-slice-3.11-device-hardening/local-gate-evidence.md). Automated/local closure is complete on `6f816206`, and the clean `a0278eea` ad-hoc preview candidate is signed, installed over the prior iPhone build, and launch-verified. Hands-on physical behavior, two-device, accessibility, sustained-performance, signed Android, and TestFlight QA remain pending and are not waived.

**Historical DeepSeek status:** At that checkpoint, device hardening was incomplete because `verify:multiplayer-edge` could not run and DT-07/DT-08 lacked a screen-level regression. Both automation gaps are now closed in the linked takeover record. Hands-on behavior on the installed candidate, two-device multiplayer, accessibility, sustained performance, signed Android, and TestFlight processing remain open.

## Physical screenshot follow-up — 2026-09-01

Commit `84b45a05` closes the five newly photographed implementation defects:

1. Private live-table AI pills were still inside the name row. They are removed;
   AI now uses its authored avatar, a dashed plaque boundary, and an explicit
   accessibility announcement.
2. Modal safe-area handoff accumulated portrait top padding and both possible
   landscape camera sides. The live inset pair now becomes authoritative per
   axis as soon as rotation reports it.
3. The canonical next-hand interval was seven seconds. It is now exactly ten
   seconds in coordinator state, including pause/resume re-arming.
4. The animated winner cup was still inside the name row. It is removed from
   the felt plaque; winner emphasis is a gold boundary/glow and the existing
   localized result panel remains the semantic winner announcement.
5. The nine-seat prepared-room preview and live game used mirrored anchor maps.
   Both now consume the same viewer-relative clockwise portrait ring.

Regression evidence: 181 focused tests, typecheck, 175 files / 1,891 full tests,
19 real-HTTP multiplayer cases, exact Edge boundary verification, 245/245 local
pgTAP assertions, release/mobile-secret checks, and iOS/Android production
Hermes exports all pass. The isolated hosted preview worker was advanced to
version 2 and passed its two-identity public-internet smoke; production
`multiplayer-room` remains version 7.

The signed ad-hoc artifact
`artifacts/rivermind-slice-3.11-device-followup-84b45a05.ipa` (app 1.0.0 build
28, SHA-256
`88f078e1d834fb831bb2a5c506c5211a7e42cf6e28206a97534cd96bdca89455`)
was installed over the existing app on `Hyu17ProBlue` and launch-verified. No
uninstall, SQL/migration deployment, production-worker change, championship
reset, or user-data reset occurred. Hands-on confirmation of the five pictured
behaviors remains the owner's next device QA step.

## Seat-stack and feed follow-up — 2026-09-01

Commit `c6c18a3e` closes the next physical screenshot set across RiverMind AI,
Championship/local tables, heads-up, and private multiplayer:

1. The local renderer measured the entire felt-plus-control body, then removed
   a second guessed control lane. Its seat coordinates described a taller felt
   than React Native actually rendered, allowing the bottom hero plaque to sit
   outside the visible table. The resolver now measures the felt frame itself.
2. The measured ring reserved plaque-only heights while the renderer also drew
   hole cards, status, and avatar content. One shared presentation contract now
   publishes the complete plaque-plus-cards envelope for regular, dense, and
   compact seats; the collision matrix consumes those real heights.
3. Every multi-seat live table now renders the identity plaque first and both
   hole cards underneath, independent of whether the seat is on the top,
   bottom, left, or right edge. Private tables no longer reverse that order by
   row.
4. The remaining local/Championship/AI-practice `AI` tab is removed. AI is a
   dashed neutral plaque boundary plus its authored avatar, while VoiceOver
   still announces the localized AI identity. Winner identity likewise remains
   on the plaque boundary/result panel, never over the name.
5. Wide measured panes use the landscape ring immediately—even if the native
   orientation state arrives one render later—preventing a transient mirrored
   or clipped seat map during rotation.
6. The collapsed Table feed no longer consumes a dedicated portrait row. A
   44-point icon/count control shares the existing action rail and opens a
   dismissible overlay sheet; landscape retains the full activity side rail.

Verification on `c6c18a3e`: typecheck; 177 files / 1,894 tests; 19/19 real-HTTP
multiplayer integration cases; exact Edge bundle verification; release config;
mobile-secret verification; and `git diff --check` all pass. The new rendered
feed regression proves the closed state is icon-sized and the feed content
opens in an overlay; the measured geometry matrix covers every table size,
orientation, safe-area direction, surface, feed mode, and tested text scale.

Signed artifact
`artifacts/rivermind-slice-3.11-seat-unification-c6c18a3e.ipa` is app 1.0.0
build 28, SHA-256
`6d24324407480c44d37e899e071ea4199165997e2d6fb160b4f8ff523960a81d`,
contains the `multiplayer-room-preview` route, and was installed over the
existing app on `Hyu17ProBlue` and launch-verified. No uninstall, SQL/migration
deployment, production-worker change, championship reset, or user-data reset
occurred. Physical confirmation of the pictured portrait/landscape layouts and
the wider two-device/accessibility/performance matrix remains pending.

## Final device follow-up — implementation complete, observation pending

The six-item acceptance checklist is
`PHASE_16_SLICE_3_11_DEVICE_FOLLOWUP_TODO.md`. The implementation now reserves
the complete compact viewer plaque-and-cards envelope when Coach is present,
gives every phone header control one 44-point frame, applies that header system
to Championship/Sit & Go status, and makes the collapsed Table feed exactly as
tall as the adjacent action controls without restoring a separate row.

The multiplayer busted-seat choice is a safe-area modal with exactly the two
server-owned decisions: Rebuy 4,000 or Sit out. It cannot be dismissed into an
ambiguous player state and disables both controls while a command is pending.
Settled countdown copy now wraps instead of ellipsizing. Visible countdown
projection is capped by the canonical server constant and has explicit 10, 1,
0, null, and stale-client-clock fixtures.

Final local evidence before packaging: 155 focused tests; 179 files / 1,901
full tests; typecheck; 19 real-HTTP multiplayer integration cases; exact
production/preview Edge bundle verification; release configuration;
mobile-secret verification; `git diff --check`; and production iOS/Android
Hermes exports all pass. The strengthened public-preview smoke created two
disposable identities, joined and started a real room, folded the current
actor to settlement, asserted `nextHandAtMs - updatedAtMs === 10_000`, and
cleaned up successfully. Because the deployed isolated preview already uses
the canonical ten-second worker contract, this follow-up requires no Edge or
SQL deployment.

Commit `4bdafda2` is packaged as the signed ad-hoc artifact
`artifacts/rivermind-slice-3.11-final-device-followup-4bdafda2.ipa` (app 1.0.0
build 28, Team `F9XW9FCX92`, SHA-256
`29af698668d7db69fda65e8f97d62c857727516f92e607ecac4440829aee67fd`).
The packaged bundle contains the isolated `multiplayer-room-preview` route. It
installed over the existing RiverMind app on `Hyu17ProBlue` without an uninstall
or data wipe and launched successfully.

Hands-on phone observations remain pending. No migration, hosted deployment,
production routing change, Championship reset, TestFlight upload, or user-data
reset is part of this follow-up.

## Avatar replacement and reaction dismissal follow-up — installed, observation pending

Physical-device container inspection established the avatar failure mechanism.
The affected profile referenced uploaded avatar id `00000000`, the durable
avatar registry was empty, and the app Documents avatar directory contained no
image even though a temporary ImageManipulator cache file remained. The release
build's browser-crypto fallback had left its byte array zero-filled; every
replacement therefore reused `00000000`, and old-avatar cleanup deleted the
new file and registry row because the old and new identifiers aliased.

Commit `b8c4d45f` generates full 16-character identifiers from Expo native
secure random bytes, reserves both live registry ids and the profile's current
reference, and retries/refuses collisions within a bounded transaction. The
picker now persists and re-reads the exact id/version/URI before updating the
profile and closes the editor only after that durable check succeeds. The old
photo cannot be recovered from the affected container and must be selected once
more on the fixed build.

The same checkpoint makes the reaction list a one-tap interaction: an accepted
reaction is committed to the existing asynchronous queue and the menu closes
immediately. Silent delivery, repeated-tap ordering, and screen-reader queue
status remain intact. A rendered regression proves the selection queues and
the launcher replaces the open menu in the same interaction.

Verification on `b8c4d45f`: four focused files / 58 tests; typecheck; 181 files /
1,910 full tests; release configuration; mobile-secret verification;
`git diff --check`; and production iOS/Android Hermes exports all pass. No SQL,
Edge Function, protocol, routing, Championship, or hosted-state change was
required.

Signed ad-hoc artifact
`artifacts/rivermind-slice-3.11-avatar-reaction-b8c4d45f.ipa` is app 1.0.0 build
28, SHA-256
`bc6114c7f479bb0b222be203b674a132400492e2b38bdc1c61c35bcbc8105b98`,
passes strict signature verification, contains the isolated
`multiplayer-room-preview` route, and was installed over the existing app on
`Hyu17ProBlue` and launch-verified without an uninstall or data reset. Owner
observation of the reselected photo after process relaunch and of reaction
delivery after auto-dismiss remains pending.
