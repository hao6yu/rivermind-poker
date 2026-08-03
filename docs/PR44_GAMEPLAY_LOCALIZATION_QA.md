# PR 44 — Gameplay localization and responsive-layout QA

## Scope

PR 44 extends the typed English, Simplified Chinese, and Traditional Chinese catalogs through the complete poker journey:

- heads-up and 3–6 player table headers, streets, actions, seat states, and result banners;
- coach recommendations, bet sizing, AI loading/quota states, and verified hand facts;
- table guide, decision review, hand replay, hand history, opponent read, and session learning;
- practice/tournament summaries and Championship journey, event, record, and achievement screens.

Long lesson bodies, generated quiz/scenario copy, hand-category descriptions produced by the poker analyzer, and free-form AI explanations remain a separate terminology/content pass.

## Responsive-layout safeguards

- Table and sheet headers give translated text a shrinkable `minWidth: 0` region.
- Action buttons support two lines and controlled font scaling instead of clipping.
- Coach-strip and detail-button copy can wrap without pushing controls off-screen.
- Summary metrics, Championship events, achievements, and footer actions support two-line Chinese labels.
- Compact layouts retain the existing iPhone SE table geometry; localization changes do not increase fixed table or header heights.

## Automated verification

- `pnpm typecheck`
- focused localization and gameplay-copy tests: 8 passed
- iOS production bundle export: passed (829 modules, 19 assets)
- all three message catalogs are compile-time checked against the English key set

The current shared workspace also contained an unrelated, uncommitted multiway-AI test addition. A full local run passed 240 tests and failed that new defense-rate assertion at 47.5% versus its 48% threshold. PR 44 neither stages that file nor changes poker strategy; remote CI evaluates only this PR's committed localization files.

## Manual device matrix

Use Profile → Language to check all three settings on each device:

| Device | Priority checks |
| --- | --- |
| Compact iPhone / iPhone SE | table header, three action buttons, coach strip, summary footer buttons |
| Large iPhone / iPhone 17 Pro | six-player seat badges, five-card board, replay and verified facts |
| iPad | modal width, Championship event list, record metrics, landscape rotation |

For Simplified and Traditional Chinese, play through at least one heads-up hand, one six-player hand, and one Sit & Go completion. Confirm that no text overlaps cards or seats, all action amounts remain visible, and bottom-sheet buttons stay tappable at large Dynamic Type sizes.

## Tooling note

Xcode 27 Device Hub exposed all three simulator sizes during QA, but its embedded device surface did not accept automated taps through the supported desktop-control interface. The native bundle and responsive code paths were verified, but the final tap-through matrix above remains a manual TestFlight/simulator check rather than being reported as automated simulator coverage.
