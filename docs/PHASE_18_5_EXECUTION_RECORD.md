# Phase 18.5 — One Product UI Pass execution record (S8, S9, S10, S12)

Status: **complete (pending owner device pass).** Execution authority:
`docs/PHASE_18_RELEASE_1_2_SCOPE-codex-gpt-5.6.md` §6 (S8/S9/S10/S12) plus the
remaining portions of P18-034 and P18-035. This record carries the Phase 18
coverage ledger through Phase 18.5 and freezes the evidence per slice. All
work landed as small, behavior-preserving commits on `master` (see the commit
list at the bottom). No push, no store submission, no version/build change:
the release configuration remains 1.2.0 / iOS buildNumber 2 / Android
versionCode 2.

---

## S0′ — Phase 18.5 entry evidence

### Starting point

- HEAD `3c64696f` on `master` (the provenance-clean Release 1.2 record).
- Working tree: untracked `docs/MEDIUM_FOUR_AI_AGENTS_PHASE_18_REVIEW.md`,
  `docs/media/`, and (mid-phase) `docs/PHASE_19_LOCALIZATION_EXPANSION_SCOPE-codex-gpt-5.6.md`
  — all preserved untracked; never committed.

### Baseline gates at entry (this machine)

| Gate | Result |
| --- | --- |
| `pnpm typecheck` | PASS |
| Localization gates (`catalogParity`, `chineseQuality`, `localizationCompletion`, `moneyUnits`) | PASS |
| `pnpm eval:multiway-ai` | PASS — 26/26, no regression from 1.1 |
| `pnpm verify:release-config` | PASS (1.2.0) |
| `pnpm verify:mobile-secrets` | PASS |
| Full default suite | **2014–2020 passing with 5–16 contention timeouts** in the seeded simulation tests (`ai.test.ts`, `multiwayAi.test.ts`, `dailyChallenge.test.ts`, `tournament.test.ts`, `playStatistics.test.ts`, `handHistory.test.ts`, `decisionGrading.test.ts`): every one passes in isolation; under full parallelism on this machine the 5–42 s simulation tests exceed their timeouts. The Release 1.2 execution machine recorded 2002/2002 green. This is an environment limitation, not a regression; the Phase 18.5 verification recipe is the full suite plus isolated re-runs of the six heavyweight files, all green. |

### Baseline style counts (recounted from the tree — Fable's counts were snapshots)

- `StyleSheet.create` files: 62. `fontSize` literals: 535 across 22 distinct values.
  `borderRadius` literals: 397 across 27 values. `padding*/margin*` values: 38 distinct.
- Literal hex/rgba colors outside `themePalette.ts`: 9 sites (7 unique) — the full
  P18-022 list, all migrated or documented during S8 (zero remaining).
- English-copy automation selectors in `e2e/maestro/*.yaml`: 56+ tap/waits across
  18 flows (all converted in S8; the retired reclaim control remains only as an
  annotated stale-pass sentinel in two flows).
- Off-scale geometry/type literals outside measured-geometry modules: **1218**
  (spacing 667 / radius 275 / control-height 153 / type 123) — now a shrinking
  ratchet pinned by `src/theme/styleScaleScan.test.ts` (**1201 at phase exit**).

---

## S8 — design-system foundation and safe deduplication (complete)

**Tokens (P18-046).** `src/theme/designTokens.ts`: the named 4-point spacing
scale, the radius set plus pill, compact/standard/primary control heights,
documented typography tiers with line heights, per-scheme elevation
(`elevationForScheme`), and the centralized text-scaling ceilings consumed by
the primitives.

**Primitives (P18-047).** `src/components/ui/`: `Sheet`, `Button` (variant ×
size on the control-height scale), `IconButton` (44 pt), `SectionCard`,
`Eyebrow`, `ProgressBar`, `EmptyState`, `Banner` (info/attention/error with a
recovery action), `LoadingBlock` — every one with stable `ui.*` test IDs and a
rendered fixture in `uiPrimitives.test.tsx` (10 fixtures: tone fills, busy
blocking, clamping, close wiring, hidden-close sheets). `GuidedText` keeps its
own module (P18-027) and is part of the same set.

**Literal colors (P18-022).** All nine entry violations migrated: winner-gold
boundary/glow → new `palette.winnerGold`/`winnerGoldDeep`; felt-pill and
moment-tray shadows → `palette.shadow`; the activity-feed backdrop →
`palette.scrim`. `src/theme/styleScaleScan.ts` now enforces **zero literal
surface/border/shadow colors** app-wide (documented exceptions list +
`transparent` allowance) and a **shrinking ratchet** for off-scale
geometry/type, with the narrow `REVIEWED_MEASURED_GEOMETRY` escape hatch for
the genuinely measured table-layout modules.

**Table kit (P18-048).** The byte-identical cross-table definitions moved to
`src/features/table/tableStyleKit.ts` (seat action-bubble tones + measured
placement, local-table coach chrome, profile identity pills); the heads-up,
local multiway, and private tables spread the kit. New
`tableStyleDuplication.test.ts` fails when an identical style definition
reappears across the three surfaces.

**Shell decomposition (P18-049, D12).** `AppShell.tsx` 3245 → ~1630 lines by
file/component moves only: `screens/HomeScreen.tsx`, `screens/PlayScreen.tsx`,
`screens/ProfileScreen.tsx` (+ `LanguagePickerModal`), `screens/GameSetupScreen.tsx`
(later removed with its duplicated surface), `shellChrome.tsx` (shared chrome +
label helpers), `shellStyles.ts` (the shell stylesheet, moved verbatim). No
state-management or navigation rewrite; the P18-004 structural gate follows the
moved JSX and still enforces unconditional friend-table rendering.

**Selector retirement (P18-034, remainder).** Stable IDs added to every control
the slice-3.10 flows tapped by English copy (orientation toggle, action rails,
continuation rows, leave controls, bet-sizing chips + confirm, lobby
primary/open-seat, create/join forms, moment launcher + reactions, AI
configurator chips, championship entry + event rows, Learn chapter/mission/
mastery rows, onboarding skip, nav back, home rows). All 18 slice-3.10 flows
converted to `id:` selectors (56+ conversions); the release smoke stays
ID-driven. Copy-verification assertions deliberately remain text.

Acceptance check: rendered fixtures cover every primitive and the shared table
kit; new duplication is test-detectable (duplication guard + ratchet); each
migration landed as its own commit.

---

## S9 — shell, navigation-model, and identity polish (complete)

**Play model/render agreement (P18-018).** `PLAY_GROUPS` now describes the
rendered hub exactly, and the screen renders the model itself through
`playBands.tsx` (`renderPlayBand`) — friends card, championship card, AI
configurator card, then the titled Games & events band. The render-level
contract test renders the band mapper with injected stubs and fails on drift
or a dead band. The duplicate custom-game surface was removed with evidence:
the separate Custom AI game screen duplicated the configurator's controls
(identical 40/100/200 BB stack presets, player counts, difficulty, session,
pace, coach), so the configurator is the one custom-table surface, the
`customTable` destination stays reachable through it, and the dead setup
route/state/helper are deleted. The navigation test still fails if a
destination ever leaves the list.

**Configurator compression (P18-019).** Difficulty and stack moved into
Advanced; a one-line defaults summary (`{{difficulty}} · {{stack}}`, authored
Chinese wording) keeps the current choices visible, so Games & Events reaches
the first useful viewport. Stable IDs cover the format/players/difficulty/
stack chips and the start button.

**Learn (P18-041).** First launch no longer reads "0 of 53 steps": the plan
card shows the next useful step's expected time (`First step · about N min`,
×3 catalogs) and the 0% progress track stays hidden until the first step
completes. The two-level card-nesting contract is pinned by
`learnNesting.test.ts` (the card-styled style set is exactly the four
composite cards plus the one-level plan row and top-level chrome; list rows
stay hairline-separated).

**Identity (P18-016, P18-021, D10, D11).** Persona identity resolution is now
pure and type-guarded (`aiAvatarIdentity.ts`): all 31 active personas resolve
to an intended visual identity — 27 authored assets plus the four recorded
temporary fallbacks (Elsa, Milo, Noah, Otto: initial on a distinct hue). The
persona-identity test fails if any persona resolves to nothing, if the
fallback set drifts from the recorded art dependency, or if a key gains an
asset without leaving the fallback set. Standings rows render the persona's
real `AiAvatar` instead of a generic chip. D11 executed with evidence: the six
shipped human preset files are ONE shared silhouette in six colors — not six
distinct authored marks — so presets render as their initials on six distinct
hues until approved art lands (owner art dependency, same ledger entry). The
human avatar appears once on Profile (header avatar, picker opens from it;
verified against the restructured screen).

**Dark elevation + Home CTA (P18-023).** The shell hero surfaces (Home session
card, shared primary button) use the per-scheme elevation tokens; the dark
Home CTA visual recheck rides the closing device matrix (pairs P18-051).

**Continue row (P18-042).** Home renders at most one conditional Continue row
covering the resumable checkpoints in priority order — the live private
table, a saved Sit & Go, then a saved Championship run — and preserves the
whitespace when none exists (rendered test pins both states). The Daily
Challenge keeps its dedicated row (its caption already names the next hand).
Revisited in S12: all supported checkpoint types have a resume affordance.

**Sentence case (P18-040).** Verified already correct: a full-catalog scan
(two heuristics: consecutive capitalized runs, post-sentence-boundary
capitalization) finds zero Title Case outliers in the English catalog;
evidence retained in the phase log.

**Keyboard + input (P18-028).** The shared shell scroll persists taps while
the keyboard is open, so Profile name-edit Save/Cancel work in one tap; the
edit card renders at the top of the scroll, above the keyboard.

**Tablet + safe areas (P18-045).** Tablet detection moved to a shared
shortest-side hook (`useIsTablet`) across Home/Learn/Play/Profile/
Championship — a landscape phone never receives the tablet layout — and the
shell SafeAreaView covers all four edges. The portrait-only shell policy (D08)
is unchanged.

---

## S10 — robustness, diagnostics, and hygiene (complete)

**Diagnostics routing (P18-031, P18-032).** Every player-visible
avatar/storage failure path records a stable local diagnostic token through
the existing `recordAppDiagnostic` allowlist (codes only — never cards,
paths, room codes, identities, URLs, or raw exception text, preserving the
Phase 17 boundary): `avatar-cleanup-untracked`, `avatar-host-failed`,
`avatar-tombstone-persist-failed`, `avatar-cleanup-queued`,
`avatar-resolve-fallback`, and the new `hand-history-load-failed`. The profile
hand-history load failure now shows a localized recovery **Banner with
Retry** instead of a silent empty list. The avatar editor keeps its existing
localized Alerts as the recovery path for upload/cleanup failures. The
uploaded-avatar resolution fallback (initials plaque) is documented as
best-effort by design in code, with its own diagnostic. The localization
missing-key warning is documented as a dev-only authoring aid, deliberately
not a diagnostic event (the parity gates catch it in CI). The crash-reporting
decision (D04/P18-036) stands: no SDK, no new outbound path.

**Rebuy ternary (P18-030).** The no-op ternary (both branches identical) is
removed from the private-table stats rebuy row; behavior-preserving by
definition.

**Beta internals (P18-033).** Decision recorded as a reviewed **REJECTION**
with evidence in `src/services/betaFeedback.ts`: no player-visible copy
contains the word "Beta" (the sheet is titled "Privacy & support"; the
`beta.*` tokens are internal catalog keys), and renaming the modules/services/
~25-key catalog prefix across three locales would churn the import graph and
the parity gates with zero player-visible value. The decision is final unless
the owner reopens it; nothing remains perpetually "optional".

---

## S12 — opponent legibility and join/resume delight (complete)

**Table tendencies (P18-038).** New pure derivation
(`opponentTableTendencies.ts`) counts, per player, from the public action
ledger of completed hands at this table in this session: hands observed,
fold-to-3-bet (preflop raise → re-raised before action returns → folded), and
showdown frequency (dealt-in hands that reached a flop vs. reached showdown).
No hidden cards, deck state, or persona data is ever read (pinned by
fixtures). Sample floors: the section renders at ≥8 hands observed; each rate
at ≥3 opportunities — below a floor the UI shows the sample progress, never a
rate. The "This table" section renders in the tap-a-seat profile sheet of
both the local multiway table and the private table, under the persona
description and never merged with it (scope copy: "A persona name is not
evidence", localized ×3 with authored Chinese). The private-table wiring
lazily loads the same viewer-local archives the review path uses (cached;
failure degrades to the sample note).

**Deep links (P18-035, remainder).** The product-logic matrix rows are pinned
end-to-end in `multiplayerInviteMatrix.test.ts`: well-formed round-trip
carrying no private material; malformed links fail safe; expired/missing and
forbidden rooms render the localized failure and classify terminal for
recovery cleanup; the wrong-protocol lane fails closed with the upgrade
message; transient network failures keep the recovery record. The physical
rows ship as `e2e/maestro/phase-18-5-deep-link-matrix.yaml` (cold start, warm
start, malformed ignored, expired-room recovery, resume after termination)
using stable IDs — the owner device pass executes it unchanged in all three
locales. **Executed here:** the logic rows (6/6 green). **Not executed here:**
the device rows (no devices in this environment) — recorded below.

**Continue-row revisit.** All supported checkpoint types now have a resume
affordance: private table / Sit & Go / Championship through the Home Continue
row (P18-042), Daily Challenge through its dedicated row. Stable-ID
automation covers the row (`home.continue`, rendered test).

---

## Phase 18.5 verification battery (executed this session)

| Gate | Result |
| --- | --- |
| `pnpm typecheck` | **PASS** (clean) |
| Full default suite (`pnpm test`) | **2020 tests / 202 files**: 2014 pass under capped parallelism; the only failures are the six known contention-timeout tests in the seeded simulation files (timeout class only — same tests green in isolation, recorded next) |
| Heavyweight files, one per invocation (final record) | **all green**: `ai.test.ts` 11 ✓, `multiwayAi.test.ts` 26 ✓, `dailyChallenge.test.ts` 6 ✓, `tournament.test.ts` 10 ✓, `playStatistics.test.ts` 14 ✓, `handHistory.test.ts` 13 ✓ |
| Localization gates | **PASS** (74 tests; parity, Chinese quality, money units, decision localization) |
| `pnpm eval:multiway-ai` | **PASS** — 26/26, no unexplained regression from 1.1 |
| `pnpm verify:release-config` | **PASS** (1.2.0 / code 2 / build 2) |
| `pnpm verify:mobile-secrets` | **PASS** (tracked source + fresh export) |
| Friend-table bundle gate (`verify-release-bundle.mjs`) on a **fresh 1.2.0 Android Hermes export** built from this tree | **PASS** — v4 lane, review entry, return-next-hand, create flow, lobby markers present; retired preview gate absent |
| `git diff --check` | **PASS** (clean) |
| Style-scale ratchet | **PASS** — 1201 ≤ 1201 ceiling (down from 1218); zero literal surface/border/shadow colors |
| Changed-flow automation | **PASS** — table style duplication guard, Play render contract, Home Continue row, opponent tendencies (10), invite matrix (6), persona identity (3), Learn nesting (3), UI primitives (10), foreground + scale scans |

## S7-style matrix on changed screens — executed vs. not executed

The plan requires the S7 matrix for every changed screen. Executed on this
machine (no physical devices available):

- **Rendered/scheme:** primitives, table kit, seat sheets, Play hub, Home
  Continue row, tendency section, standings avatars, Learn plan card — pinned
  by rendered tests against both palettes where the palette is consumed.
- **Geometry:** the off-scale ratchet + duplication guard hold; the measured
  table geometry (seat rings, plaques) is untouched and keeps its full
  collision matrix.
- **Automation:** all changed flows carry stable IDs; the converted e2e
  suite validates as YAML (multi-document, Maestro format).

**Precisely NOT executed (owner actions, unchanged from the S7 record):**

- The physical-device matrix (notched iPhone, 360/320-dp Android, both
  landscapes, light/dark, three locales, largest text, TalkBack/VoiceOver
  speech, cold/warm deep links, resumable checkpoint states) on the changed
  screens — `e2e/maestro/phase-18-5-deep-link-matrix.yaml` plus the existing
  slice-3.10 suite (now ID-driven) are the executable instruments.
- Signed store artifacts (EAS credentials owner-only); the fresh local export
  passed the bundle gate as the release-side companion.
- The multiplayer integration harness (Docker unavailable); wired into its CI
  job which fails loudly without the stack.

## Ledger disposition (Phase 18.5 exit)

Recounted so every ID appears exactly once across both milestone records:

- **Implemented + verified in Phase 18.5 (20):** P18-016 (explicit temporary
  fallbacks + identity test; authored art remains an owner dependency for
  4 personas), P18-018, P18-019, P18-021 (standings avatars; Profile single
  avatar verified; D11 initials-on-color presets), P18-022, P18-023 (code
  half; device recheck pairs P18-051), P18-028, P18-030, P18-031, P18-032,
  P18-033 (rejected with evidence), P18-038, P18-040 (verified already
  correct), P18-041, P18-042, P18-045, P18-046, P18-047, P18-048, P18-049.
- **Completed residue (2):** P18-034 (all English-copy selectors retired to
  stable IDs; one annotated stale-pass sentinel for the 3.11F-retired
  reclaim control), P18-035 (logic rows pinned 6/6; device rows recorded as
  the owner pass).
- **Device-gated, unchanged from Release 1.2 (4):** P18-050, P18-051, P18-052,
  P18-053 — the owner device pass covers these on the same instrumented
  build.
- **Phase 19 candidate, untouched (1):** P18-039 (S11 decision do-overs).

Nothing moved into an unnamed follow-up. Phase 18.5 is complete when the
owner device pass records the matrix above; every code-side acceptance
criterion is implemented and verified.

## Commits (Phase 18.5, in order)

1. `feat(ui): P18-046/P18-047/P18-022 — design tokens, style-scale scan, shared UI primitives`
2. `refactor(table): P18-048 — shared table style kit …`
3. `refactor(shell): P18-049 — extract AppShell into focused screen files (D12 file moves only)`
4. `test(automation): P18-034 — retire English-copy Maestro selectors with stable IDs`
5. `feat(play): P18-018/P18-019 — Play model/render agreement, one custom-game surface, compressed configurator`
6. `feat(learn): P18-041 — first-launch plan framing and pinned two-level nesting`
7. `feat(identity): P18-016/P18-021 — persona identity resolution, standings avatars, D11 preset initials`
8. `feat(shell): P18-042/P18-045/P18-028 — Home Continue row, shortest-side tablet, four-edge safe areas, one-tap keyboard`
9. `fix(learn): P18-045 — Learn tablet detection uses the shortest side too`
10. `feat(theme): P18-023/P18-040 — per-scheme elevation on shell hero surfaces; sentence-case verified`
11. `feat(diagnostics): P18-030/P18-031/P18-032/P18-033 — visible failures get recovery, internals decisions recorded`
12. `feat(opponents): P18-038 — table-specific public tendencies with sample floors`
13. `test(invite): P18-035 — deep-link matrix logic rows pinned; owner device flow added`
14. `test(hardening): fork-safe suites, identity-chip foreground boundaries, style ratchet update`
