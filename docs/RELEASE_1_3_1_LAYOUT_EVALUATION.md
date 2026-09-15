# v1.3.1 game-screen layout evaluation

Date: 2026-09-15 · Device under test: iPhone 17 Pro simulator (iOS 27.0, 402×874pt)
Build: local debug dev client (`expo run:ios`) with Metro, on top of the v1.3.0
TestFlight code state (`a43d4e16`).

## 1. The reported bug — action buttons missing on the player's turn

**Report.** On the Championship table (portrait iPhone 16 Pro, TestFlight v1.3.0
build 32) the screen showed “轮到你 / Your turn” but the fold/call/raise row was
absent.

**Root cause.** v1.3 (“Ship v1.3”, `b53116ce`) introduced the tournament HUD as
the *first child of the row-style control rail* (`tableControlRail`,
`flexDirection: 'row'`). The HUD host is `width: '100%'` with Yoga's default
`flexShrink: 0`, so it claimed the entire rail width and starved the `flex: 1`
action rail (`tableControlRailMain`, `minWidth: 0`) to zero width. The action
row and the portrait disclosure feed rendered ~7pt of their left edge at the
screen boundary — invisible and untappable. The B2 QA fix that added
`width: '100%'` to the HUD host (to repair HUD text truncation) is what armed
the starvation. Landscape was unaffected because `tableControlRailLandscape`
switches the rail to a column, which is why the existing smoke flows (which
only assert the HUD/`tournament.hud` and capture screenshots) never caught it.

**Fix (this branch).**
- `tableStyleKit.ts` — new `tableControlStack` style: a full-width,
  non-shrinking column wrapper; documented why the HUD must never sit inside
  the row rail.
- `MultiwayPokerTableScreen.tsx` — the HUD renders inside `tableControlStack`,
  above the unchanged `[actions | feed]` row, in both orientations.

**Regression tests.**
- `tableStyleKit.controlRail.test.ts` — pins the geometry contract (stack =
  full-width non-shrinking column; rail = row; main = `flex: 1, minWidth: 0,
  minHeight: CONTROL_HEIGHT.primary`; landscape override = column).
- `MultiwayPokerTableScreen.tournamentRail.integration.test.tsx` — mounts a
  portrait Sit & Go and proves the HUD is not inside the actions row and that
  both live under one column stack. Verified to fail against the pre-fix code
  (`git stash` run) and pass after.
- Full suite: 2278 passed / 6 skipped; `pnpm typecheck` clean.

**Device proof (portrait Sit & Go, iPhone 17 Pro).**
`artifacts/v131-layout-sweep/sitgo6-portrait-actions-row.png` and
`sitgo6-portrait-bet-sizing.png` show the HUD pill, coach card, and the full
Fold / Call 20 / Raise row with the feed button — plus the bet-sizing sheet
opening from the raise control (Maestro element-asserted).

## 2. Sweep coverage matrix

Every cell ran the on-table check: action row visible, raise tappable → bet
sizing sheet opens (element-asserted in portrait; point-probe + screenshot in
landscape, see caveats). Evidence PNGs live in `artifacts/v131-layout-sweep/`.

| Surface | Portrait | Landscape |
| --- | --- | --- |
| Heads-up AI practice (2 players) | ✅ asserted | ✅ captured + probe |
| AI practice, 3 players | ✅ asserted | ✅ captured + probe |
| AI practice, 6 players | ✅ asserted | ✅ captured + probe |
| Sit & Go, 3–6–9 players (HUD) | ✅ asserted (6, 9) | ✅ captured (daily/champ HUD; 6-max ring via practice6) |
| UTC Daily Challenge (HUD) | ✅ captured + probe | ✅ captured |
| Championship local_3 (HUD) | ✅ captured + probe | ✅ captured |
| Sit & Go 6-max + HUD landscape | — same rail code as daily/champ; seat ring covered by practice6 | not independently captured (automation flake, see §3) |

Also exercised during the sweep and rendering correctly: first-run onboarding,
Play hub (portrait + landscape), Championship map and event-details sheet, the
saved-run resume dialog, hand-end continuation row (“Next hand”), bet-sizing
sheet (portrait + landscape), tournament standings drawer.

## 3. Automation caveats (not app bugs)

- **XCUITest tree truncation.** On iOS 27 + RN 0.81 the accessibility snapshot
  intermittently returns a fraction of the real tree (10–30 of ~100 nodes),
  especially after rotation and while the dev LogBox toast is up. Hierarchy
  dumps captured at “failure” moments show a truncated tree while screenshots
  prove the full layout renders and point taps work. Portrait asserts are
  reliable; landscape asserts are not — hence the probe+pixel-audit approach.
  The repo’s own `slice-3.10-headsup-smoke.yaml` documents the stale-snapshot
  behavior after app-owned rotations.
- **Dev-only LogBox toast.** A recurring `console.warn` (dev builds only;
  suspect `[localization] Missing message` from `localization/core.ts:46` or a
  dependency warning — needs one debugger session to pin) parks a toast over
  the bottom of the screen and, while visible, worsens the tree truncation.
  Release/TestFlight builds have no LogBox. Follow-up: identify the warning in
  the debugger and fix or `LogBox.ignoreLogs` it so dev QA is quieter.
- **Bottom tab presses** did not navigate under Maestro synthesized taps while
  the LogBox toast was visible; all in-app navigation (cards, buttons, sheets)
  worked. Worth one manual pass to confirm tabs are fine for a human; the
  sweep navigated via `home.allGames`.
- **Mid-transition capture artifact.** One landscape Daily capture shows the
  hero cards clipped at the felt edge; an identical-geometry Championship
  landscape capture taken after the layout settled shows the cards fully
  inside the felt. Treated as a capture-timing artifact; watch it once on
  device.

## 4. Language picker expansion (2026-09-15, owner decision)

The profile settings picker previously listed only English / 简体中文 /
繁體中文. The Phase 19/19.5 locales (Español (Latinoamérica), Português
(Brasil), 日本語) were catalog-complete but deliberately hidden behind
`releaseEnabled: false` pending the §11 native review. Per the owner's
direction they are now release-enabled:

- `registry.ts` — all six locales shipped; the three catalogs moved from the
  lazy draft path to static imports (like en/zh), so production builds carry
  them.
- `learningContent.ts` / `scenarioContent.ts` — static registrations for the
  three locales.
- `draftCatalogs.preview.ts` / `.production.ts` — both loader maps are now
  empty; the draft machinery stays for future locales.
- `config/locale-manifest.json` regenerated (production native locales = all
  six) — run `scripts/verify-native-locales.mjs` and `expo prebuild` before
  the next native release so iOS/Android declare the new locales.
- Tests updated to the new policy (core/provider/internalPreview/draft
  reachability/Japanese quality); full localization suite green.

**Device-verified**: the picker lists System + six languages, switching to
Português (Brasil) re-renders the whole settings surface, and restoring
System default works (`artifacts/v131-layout-sweep/picker-*.png`,
`profile-ptbr.png`, `profile-system-restored.png`).

**Layout fix found during verification**: with seven options the language
sheet overflowed the screen with the last options unreachable (unbounded
sheet + non-scrolling list). `LanguagePickerModal` now bounds the sheet
(`maxHeight: '86%'`) and renders the options in a fixed-budget ScrollView
(`height: 470`, shrinkable in tight hosts) — see `shellStyles.ts` and
`ProfileScreen.tsx`.

**Note for local QA**: an `expo start` Metro instance can serve a stale
transform cache, which makes fresh code edits appear to "not apply" on the
simulator. Restart Metro with `--reset-cache` (and launch the app through
the dev-client URL, not a plain relaunch) when edits seem ignored.

## 5. Follow-ups

1. Pin the dev `console.warn` (one debugger session) — it degrades Maestro
   reliability and hides real warnings.
2. Consider a `visible`-and-hittable assertion helper for the action row in
   the release capture flows (`release-1-3-layout-capture.yaml`,
   `release-1-3-championship-capture.yaml`) — today they can pass while the
   row is zero-width, which is exactly how v1.3 shipped this regression.
3. Private-table (`MultiplayerFlowModal`) surfaces were code-audited (no HUD
   in its control rail; no starvation path) but not device-swept — needs two
   clients for a live room and is left for the multiplayer QA pass.
4. Re-run the sweep on a small phone (iPhone SE class, `compact` felt) and an
   iPad when the runtimes are provisioned; the style math leaves ≥200pt of
   slack on both, but the evidence matrix above covers one device class.
