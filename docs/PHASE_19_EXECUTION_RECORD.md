# Phase 19 — Global localization expansion execution record (es-419, pt-BR)

Status: **catalog draft substantially implemented; review fixes applied; native
approval pending.** Execution authority:
`docs/PHASE_19_LOCALIZATION_EXPANSION_SCOPE-codex-gpt-5.6.md` (§L2 store/natural
setup, §L4 Spanish, §L5 Brazilian Portuguese, §L7 automated gates) plus the
review contracts in `docs/LOCALIZATION_ES_419_STYLE_GUIDE.md` §11 and
`docs/LOCALIZATION_PT_BR_STYLE_GUIDE.md` §11. This record covers the
continuation session that completed the scenario-surface translation memory,
generated the final catalog modules, and resolved the six findings from the
post-implementation review (four release-blocking defects, two completion
gaps). All work is local: nothing pushed, no store submission, no deploy;
Japanese (Phase 19.5) remains intentionally absent.

Branch: `glm/phase-19-localization`. The working tree carries the phase as
uncommitted modifications plus untracked catalogs, translation memory, and
scripts, exactly as the translation window left them; this continuation
preserved every pre-existing modification and untracked file (including the
Phase 18 leftovers `docs/MEDIUM_FOUR_AI_AGENTS_PHASE_18_REVIEW.md` and
`docs/media/`).

---

## Entry state (what was already in the tree)

- Registry wired for `es-419` / `pt-BR` message catalogs, plural catalogs
  authored in `plurals.ts`, and the Phase 19 gate suites extended.
- Base + phase + learning-content translation memory complete for both locales.
  `docs/localization-inventory.json` freezes the English source at
  `c807082d`, generated 2026-09-03T02:23:48Z.
- **Missing:** the scenario surface. `es419/scenarioContent.ts` and
  `ptbr/scenarioContent.ts` did not exist, `es-419/scenario-1.json` held a
  throwaway stub, and pt-BR had no scenario slices — every suite importing the
  locale indexes failed at import time.

## Scenario translation memory (81 templates × 2 locales)

The English scenario source (81 randomized templates extracted from
`src/domain/learning/scenarios.ts`) was translated in two delegation batches
(four parallel agents, then three; no nested delegation; every agent wrote and
validated its slice before reporting):

- Batch A: es-419 slices 2 and 3, pt-BR slice 1 (es-419 slice 1 hit the agent
  token limit and was redone in batch B).
- Batch B: es-419 slice 1 (redo), pt-BR slices 2 and 3.

**Runtime placeholder contract.** The English prose was captured from one
random instantiation, but hands, bet sizes, pots, and percentages change every
session. Translated prose carries runtime placeholders instead of instance
numbers:

- `{{heroHand}}` — the live two-card hand (e.g. "A-5 del mismo palo",
  "9-9 par na mão"), replacing every hand-specific mention so the copy always
  describes the actual dealt hand.
- Calculation values (`{{riskBb}}`, `{{rewardBb}}`, `{{requiredFoldPercent}}`,
  `{{callAmountBb}}`, `{{finalPotBb}}`, `{{requiredEquityPercent}}`,
  `{{estimatedEquityPercent}}`, `{{directRequiredEquityPercent}}`,
  `{{estimatedCleanEquityPercent}}`, `{{minimumFutureWinBb}}`) wherever the
  English embeds a number that varies across instantiations.
- Varying numbers with no placeholder (a raise size, a pot-before-bet) are
  rephrased qualitatively so no wrong number can render, mirroring the shipped
  Chinese catalog's approach.

A seed-variation analysis (60 seeds × full + focused sessions) produced the
per-template fragment report the translators used; a post-translation audit
confirms every varying calculation key is represented by its placeholder in
both locales.

## Review findings and resolutions (this session)

1. **[P1] Scenario placeholders rendered literally.** The runtime only
   interpolated `reasoning` and feedback; `prompt` (70 sites per locale) and
   `opponentAction` (5 sites per locale) would have shown raw `{{tokens}}`.
   `createScenarioLocalizer` now interpolates **every** rendered field (focus,
   opponentAction, prompt, reasoning, takeaway, labels, feedback), and a new
   exhaustive gate walks 60 seeds × full + focused sessions in all five
   shipped locales asserting no unresolved `{{` reaches any field
   (`learningContent.test.ts`, 30s budget like the other heavy sweeps).
2. **[P1] Edge Function contract did not typecheck.**
   `HandReviewRequest.language` still carried the original three-language
   union while the runtime allowlist accepted five — invisible because the app
   tsconfig excludes `supabase/functions`. The contract now types `language`
   as the five-language `CoachLanguage` with an `isCoachLanguage` guard, and a
   dedicated gate (`tsconfig.functions.json` + `pnpm typecheck:functions`,
   wired into `scripts/run-release-check.mjs`) typechecks every deployable
   Edge Function module at app strictness. The gate immediately surfaced three
   more latent type errors in shipped function code (un-indexed segment access
   in `avatar-access`, an unchecked `allInIds[0]` in `multiplayer-room`, a
   nullable legacy-ledger assignment in `stateContract`) plus a request-type
   drift (`hostPlayRecord` typed as a record bag while the parser only ever
   constructs validated `PublicPlayerRecordSnapshot`s) — all fixed. The
   function `*.test.ts` modules are excluded from the gate (they already
   execute under vitest); Deno's own runtime types remain authoritative at
   deploy time.
3. **[P1] Generator inputs were untracked.** The sync script read its English
   scenario slices and both translation memories from the gitignored
   `.claude/tmp/translation/`, so a clean checkout could not validate or
   regenerate the catalogs. The authoritative inputs now live in the tracked
   `translation-memory/` directory: `source-scenario-{1,2,3}.json` (frozen
   English scenario source), `scenario-vocab.json` (frozen position/choice
   vocabulary), and `es-419/` + `pt-BR/` slices (base, phases, lessons,
   trainers, sheets, scenarios, vocab). `scripts/sync-locale-catalog.mjs`
   reads only from there (generated headers updated accordingly); the
   extractor (`scripts/extract-translation-slices.mjs`) writes the tracked
   scenario sources into `translation-memory/` and keeps its throwaway working
   slices under `.claude/tmp/translation/`. Regeneration is now deterministic:
   the extractor's focused-session call passed the seed as the *focus*
   argument, making the discovery order depend on `Date.now()`; it now passes
   `('preflop', seed)`, two consecutive runs produce byte-identical sources,
   and the translated memory was re-grouped to match the deterministic slice
   membership (labels re-synced to the vocab renderings; runtime labels never
   read the catalog label — they render the live choice through the vocab
   rules).
4. **[P1] Draft locales were exposed as shipped.** `LocaleDefinition` gained a
   separate `releaseEnabled` flag. `es-419` / `pt-BR` are `catalogComplete:
   true` (their catalogs pass every automated translation gate and the gate
   suites keep iterating them via the new `CATALOG_COMPLETE_LOCALES`) but
   `releaseEnabled: false`, which keeps them out of `SHIPPED_LOCALES`, the
   production language picker, and system-locale resolution (Spanish and
   Brazilian-Portuguese system locales resolve to English while the §11 native
   review is pending; an explicit saved preference still resolves so preview
   builds can exercise the draft catalogs). Flipping `releaseEnabled` — after
   recording the native approval here — is the release switch.
5. **[P2] Plural system was not integrated.** `LocalizationProvider` now
   exposes `tCount(key, count, values?)` (backed by `translateCount`), and
   `SessionLoc` carries it so session-flow helpers use the same contract.
   Every genuinely inflected count surface migrated off `t(...{count})`:
   `common.bigBlinds` (PreflopRangeExplorer ×2, ScenarioTrainingModal),
   `common.minutes` (HomeScreen, RecommendedSessionHomeCard, LearnScreen ×16),
   `common.players` (ChampionshipEntryCard, MultiplayerFlowModal),
   `learn.closingDecisions` (closingOutcome — the caller-side singular
   conditional is gone), `championship.bestRuns` (ChampionshipModal), and
   `opponentRead.eyebrow` (OpponentReadCard). New plural entries for
   `championship.bestRuns` and `opponentRead.eyebrow` (en/es/pt) replaced the
   banned parenthetical forms — the es/pt memory no longer contains
   `partida(s)`, `mano(s)`, or `mão(s)` — with zero/one/two/larger fixtures in
   `core.test.ts` and the mocked provider contract updated across all 13
   component-test provider stubs.
6. **[P2] App Store Spanish locale.** `storeLocales.appStore` for `es-419` is
   now `es-MX` (App Store Connect's Spanish (Mexico) metadata locale, per
   scope §L4 and Apple's locale reference); `es-419` remains the in-app and
   Google Play locale. The inventory generator's planned-store-locale note was
   aligned. Localized store metadata itself remains an owner gate (residue).

## Second review round — residual findings (resolved this session)

1. **[P2] Saved draft-locale preferences bypassed release gating.**
   `resolveLanguage()` now takes an explicit `previewDraftLocales` flag
   (default `false`): a saved `es-419` / `pt-BR` preference in a production
   build resolves like `system` (which itself lands on English while the
   locales are draft-gated), so a stale test-build preference can no longer
   activate draft catalogs. `LocalizationProvider` passes the flag from the
   same Deno-safe `__DEV__` guard `core.translate` uses, so development builds
   keep the preview path. Fixtures cover production sanitization, preview
   opt-in, and that release-enabled locales always honor explicit
   preferences.
2. **[P2] `multiway.coach.freeCheck` singular grammar.** Plural entries added
   for en/es/pt ("1 jugador puede actuar" / "ainda pode agir 1 jogador") and
   the call site migrated to `tCount` (`MultiwayPokerTableScreen`), with
   zero/one/two fixtures. The same pass closed the whole class:
   - **Plural inventory gate** (`src/localization/pluralInventory.test.ts`):
     every `{{count}}` key across the en/es/pt catalogs (72 keys) must have
     Spanish **and** Portuguese plural entries or sit in a reviewed
     count-invariant list with a per-key reason (10 keys: unit symbols,
     label-colon forms, noun-precedes-count, bare numeric deltas, the legacy
     `learn.closingDecision` companion key). The suites also pin each plural
     `other` form to the catalog base (no drift), ban parenthetical "(s)"
     plurals across all three catalogs, and require a base `{{count}}` behind
     every plural entry.
   - **Full coverage authored**: 62 keys gained es/pt plural entries (and 31
     an English one-form where English inflects), including the remaining
     verb-agreement surfaces (`multiplayer.moment.trayBudget` "Queda 1",
     `multiway.level`/`dailyLevel` "resta 1"), the rewritten singulars for
     `multiway.allFolded` ("El otro jugador se retiró…") and
     `multiway.outcome.allOpponentsFold` ("El rival se retira"), and the
     count-bearing a11y labels. English bases dropped their last
     parenthetical plurals (`freeCheck`, `setup.handCount`, `bestRuns`,
     `opponentRead.eyebrow`, `multiplayer.stats.rebuys`). Call sites
     migrated: `multiway.coach.freeCheck`, `table.sessionHands` (×2).
     All first-draft es/pt singulars remain inside the §11 native-review
     scope.

   Minor cleanup in the same pass: removed a duplicated doc-comment line in
   `registry.ts` and the mechanically added unused `tCount` destructures in
   `MultiplayerFlowModal.tsx` (kept in the one component that uses it).

## Third review round — plural selection and preference normalization (resolved this session)

1. **[P1] Plural entries existed but were never selected.** The inventory gate
   proved the forms exist; ordinary `t()` still rendered the base "other"
   form, so 31 count-sensitive call sites (plus dynamic-key paths such as the
   live coach) would show "1 sesiones de aprendizaje" / "1 corretas" in
   Spanish and Portuguese. The durable fix is central:
   `translate()` is now count-aware — whenever `values.count` is numeric and
   the key has plural forms for the locale, it selects the matching form
   before interpolating — and `translateCount()` became a thin documented
   wrapper over the same path. Every existing and future `t(key, { count })`
   call site gets correct singular/plural grammar without another audit, and
   the live-coach dynamic keys are covered because they flow through the same
   function. The inventory suite gained a rendering gate proving the
   selection at runtime for the three review-cited surfaces
   (`learn.daySessions`, `trainer.correctCount`,
   `coach.live.postflopFree`) plus representative families, in both draft
   locales, with t/tCount parity and count≥2 base-form checks. (The 31 legacy
   `t(..., { count })` sites intentionally stay as-is: they are now correct by
   construction, and the plural inventory keeps the census.)
2. **[P2] The saved preference itself is now normalized.** Beyond resolving
   the effective language, `LocalizationProvider` normalizes the loaded and
   stored preference: a stale preview-build `es-419`/`pt-BR` saved value loads
   as `system` in production (rewritten in storage if a draft preference is
   ever set at runtime), so the settings surface can no longer label a
   disabled locale as the current choice with no selected picker row. New
   `normalizeLanguagePreference()` in the registry is the single rule, reused
   by `resolveLanguage()` and the provider; preview builds keep loading draft
   preferences. Provider-level fixtures
   (`src/localization/LocalizationProvider.test.tsx`) cover production
   load-time normalization, preview load-through, runtime set normalization
   (including the storage rewrite), and untouched release-enabled
   preferences.
3. **[P3] Record counts corrected** — the plural-inventory suite added a test
   file, so the full-suite count below is now exact for the current tree.

## Gate results (this machine, end of session)

| Gate | Result |
| --- | --- |
| `tsc --noEmit` | PASS (0 errors) |
| `tsc -p tsconfig.functions.json` (`typecheck:functions`) | PASS — all six Edge Functions, deployable modules |
| Localization suite (`vitest run src/localization`) | PASS — 12 files, 123 tests (incl. the plural inventory + rendering gate and the provider preference fixtures) |
| Full default suite (`vitest run`) | PASS — 205 files, 2097 tests |
| `node scripts/sync-locale-catalog.mjs --locale es-419` | PASS — base 1206 keys, phases 62/105/164/100/5/158, lessons 34, trainers 4, sheets 5, scenario templates 81 |
| `node scripts/sync-locale-catalog.mjs --locale pt-BR` | PASS — same counts |
| `node scripts/verify-native-locales.mjs` | PASS — app.json declares en, zh-Hans, zh-Hant, es-419, pt-BR for both platforms |
| `git diff --check` | PASS |
| Tracked-memory helpers (per-slice scenario validation ×6, vocab coverage ×2) | PASS — 27 templates per slice, 66 choice labels + 34 positions each, no English leakage beyond the style-guide retained list |

Note: `docs/localization-inventory.json` remains the frozen snapshot of the
English source at the translation-window freeze commit; the five English base
strings that dropped parenthetical plurals during the plural integration
(`multiway.coach.freeCheck`, `setup.handCount`, `championship.bestRuns`,
`opponentRead.eyebrow`, `multiplayer.stats.rebuys`) differ from that snapshot
by design and are covered by the live catalogs and gates.

Helper tooling lives under gitignored `.claude/tmp/translation/`
(`check-scenario-slice.mjs`, `check-vocab-coverage.mjs`, the translator brief,
and the seed-variation analysis); it is recreated on demand and the committed
validation surface is `scripts/sync-locale-catalog.mjs` plus the suite.

## Residue (next steps, in order)

1. **Native review (the release blocker).** All generated catalogs carry the
   `// DRAFT: awaiting qualified native poker-language review` header. Per the
   §11 review contract, one qualified reviewer per locale must cover the
   glossary, lesson and scenario poker facts, consent/deletion copy, coach
   language instructions, and compact labels; the approval is recorded in this
   file and `releaseEnabled` flips to `true` in the same change.
2. `--generated` native inspection (`expo prebuild` +
   `node scripts/verify-native-locales.mjs --generated`), the scope §L8
   device/accessibility matrix, and authenticated coach deployment smoke tests
   for `es-419`/`pt-BR` remain owner gates for the release candidate.
3. Localized store metadata and screenshot captions per §L4/L5 (App Store
   Spanish (Mexico) mapping is now encoded in the registry; the listings
   themselves are not started).
4. Phase 19.5 (`ja`) is a separate gated follow-up and is intentionally absent.

## Deliberate language decisions recorded this session

- pt-BR retains English poker shorthand per style guide §4/§5 and the existing
  catalog: "draw" where the catalog already uses it ("draw de flush",
  "Outs do draw"), "big blind"/"small blind" as seat and unit names (lowercase
  in position chips and calibration labels — the App Store metadata locale is
  a separate concern, see finding 6), "blefe", "trinca", "3-bet"/"4-bet",
  "stack", "range".
- es-419 uses the established glossary verbs throughout the scenario surface:
  retirarse/pasar/igualar/apostar/subir a, bote, ciegas grandes, farol,
  proyecto, equidad; "stack" appears only in compact copy ("el stack más
  corto") as the glossary's compact form allows.
- Plural policy: Spanish and Portuguese provide `one`/`other` (zero reads as
  plural, per CLDR and the style guides §6); no `zero` forms; Chinese needs no
  entries, so `tCount` falls back to the base template with the count
  interpolated.
