# Phase 19 — Global localization expansion

**Status:** Proposed

**Drafted:** 2026-09-02

**Recommended release split:** Phase 19 (`es-419`, `pt-BR`) followed by Phase 19.5 (`ja`)

**Depends on:** Phase 18 release gates and a stable Phase 18.5 English UI/copy surface

## 1. Decision

RiverMind should add these languages in this order:

1. **Spanish for Latin America (`es-419`)**
2. **Brazilian Portuguese (`pt-BR`)**
3. **Japanese (`ja`)**, as a separately gated follow-up

The recommended roadmap is deliberately two releases:

- **Phase 19 — Localization foundation + Spanish and Brazilian Portuguese.**
- **Phase 19.5 — Japanese localization + script-specific product QA.**

If capacity only allows two languages, stop after Phase 19. That is a coherent
release, not a partial failure. Japanese is the best third bet, but it should not
be allowed to lower the quality bar for the first two.

The previously discussed Decision Lab / decision do-over concept should move to
a later product phase (provisionally Phase 20). Shipping a large new authored
feature at the same time as three new catalogs would create translation churn
and make localization defects harder to separate from feature defects.

## 2. Why these three

This is a product-priority recommendation, not a claim that language alone
guarantees downloads. It weighs reachable audience, mobile-product fit,
poker-learning fit, implementation cost, and the ability to verify quality.

| Rank | Language | Planning score | Why now | Main caution |
| --- | --- | ---: | --- | --- |
| 1 | Spanish (Latin America) | 89/100 | The broadest incremental language reach; one catalog can serve many countries and US Spanish speakers | Poker vocabulary must be neutral and should not silently claim to be Spain-specific |
| 2 | Portuguese (Brazil) | 82/100 | A large, highly connected, mobile-first national audience and visible organized-poker ecosystem | Use `pt-BR`, not generic Portuguese or machine-converted European Portuguese |
| 3 | Japanese | 74/100 | A large, commercially important mobile-gaming audience with strong card/strategy-game familiarity | Higher native-review, typography, line-break, and cultural-adaptation cost |

The score is a planning rubric, not market research dressed up with decimals:

- audience reach — 30%;
- mobile commercial signal — 25%;
- poker/learning-product fit — 20%;
- delivery and review feasibility — 15%;
- strategic differentiation — 10%.

### Spanish first

The Instituto Cervantes reports more than **630 million potential Spanish
speakers** in 2025, including more than 500 million native-proficiency speakers.
That makes Spanish the clearest reach-per-catalog choice. RiverMind should begin
with neutral Latin American Spanish (`es-419`), not an ambiguous generic
translation that mixes Spain and Latin American terminology.

Product rules:

- In-app locale: `es-419`.
- Display name: `Español (Latinoamérica)`.
- Map Spanish system locales to `es-419` until a distinct `es-ES` catalog exists.
- Google Play listing: `es-419`.
- App Store listing: Spanish (Mexico) as the primary Latin American metadata
  localization; add Spanish (Spain) metadata only after a reviewer confirms it
  does not promise an `es-ES`-specific in-app experience.
- Prefer international poker shorthand where it is more recognizable than a
  forced translation, but use one term consistently per concept.

### Brazilian Portuguese second

Brazil had an estimated population of **213.4 million** in 2025. IBGE reports
that **90.5% of people aged 10 or older used the internet in 2025**, and 89.8%
had a personal mobile phone. The Brazilian Series of Poker also provides direct
evidence of a mature Portuguese-language tournament audience. This is a strong
fit for a mobile poker-learning product without creating another writing system
in the first expansion release.

Product rules:

- In-app and store locale: `pt-BR`.
- Display name: `Português (Brasil)`.
- Do not fall back from `pt-PT` to `pt-BR` without making that behavior explicit;
  European Portuguese remains English until a dedicated catalog is supported.
- Have Brazilian poker players review terminology, not only generalist
  translators.

### Japanese third, in Phase 19.5

Japan's 2025 census counted **123.05 million** residents. Sensor Tower estimates
that Japan generated **$11 billion in mobile-game in-app purchase revenue in
2025**, with card battlers among the market's important genres. Revenue is not a
forecast for RiverMind, but it is a useful signal that Japanese mobile players
will pay attention to a polished learning/game product.

Japanese is separated because a good Japanese release is not merely another
catalog file. It requires deliberate line breaking, compact table copy, native
screen-reader review, suitable font-weight rendering, and a poker glossary that
distinguishes established English shorthand from natural Japanese explanation.

Product rules:

- In-app locale: `ja` (map `ja-*` system locales to it).
- Store metadata: `ja-JP` on Google Play and Japanese on App Store Connect.
- Display name: `日本語`.
- Do not ship Japanese until a native poker reviewer has approved the learning
  content and the smallest supported table layouts.

### Why not Korean, French, or German in this wave

- **Korean** is the strongest alternate to Japanese, but carries a similar need
  for native poker review and script-specific UI QA. It should follow real user
  geography rather than being added to make the language count look impressive.
- **French** offers broad geographic reach, but would require choices among
  France, Canada, and other regional usage. It is a sensible later catalog after
  acquisition data exists.
- **German** is commercially plausible and comparatively straightforward to
  source reviewers for, but long compound words make compact poker-table UI less
  cheap than it first appears, and its incremental reach is lower than Spanish.

Re-rank the alternates after RiverMind has opt-in analytics or reliable store
traffic by country. Until then, three carefully reviewed languages beat six
catalogs produced by optimism and autocomplete.

## 3. Repository findings that shape the plan

RiverMind already has a serious localization system, but it was designed around
exactly three locales: English, Simplified Chinese, and Traditional Chinese.

The 2026-09-02 code snapshot shows:

- `AppLanguage` is hard-coded to `en | zh-Hans | zh-Hant` in
  `src/localization/core.ts`.
- The locale preference list, catalog registry, and system-locale resolver are
  also hard-coded in that file.
- `app.json` declares only those three iOS and Android locales.
- `LearnScreen.tsx` has a three-way date-locale mapping that sends every future
  non-Chinese language to `en-US`.
- The `poker-coach` Edge Function contract accepts only the same three language
  values.
- AI-coach consent and account-deletion copy use separate language-indexed
  catalogs.
- The main English catalog contains roughly 1,200 typed message keys, while the
  localization directory contains more than 9,000 lines of catalogs, authored
  learning content, scenarios, and tests.
- Existing tests already cover catalog parity, interpolation variables, Chinese
  quality, localized learning content, decisions, money units, championship
  copy, consent, and account deletion.

This is good news: the product already treats localization as correctness work.
It also means the new phase must include lessons, scenarios, poker explanations,
accessibility labels, server-generated coach prose, and store metadata. Counting
only visible buttons would produce a very polished language picker attached to
an English app.

## 4. Phase 19 outcome

Ship RiverMind in high-quality Latin American Spanish and Brazilian Portuguese
without weakening the existing English, Simplified Chinese, or Traditional
Chinese experiences, and leave a scalable foundation for the Japanese follow-up.

A Phase 19 build is complete when a Spanish- or Brazilian-Portuguese-speaking
user can install the app, complete onboarding, learn, practice, play every table
family, review a hand, understand progress, use private tables, manage AI
consent, and delete their account without encountering unexplained English or
incorrect poker facts.

## 5. Phase 19 workstreams

### L1 — Freeze the source and inventory the full surface

- Finish or explicitly defer Phase 18.5 UI changes before translation begins.
- Freeze the English source catalog for the translation window.
- Export every translatable surface, including:
  - common UI and navigation;
  - onboarding, Profile, settings, consent, privacy, and account deletion;
  - Play hub, AI table setup, private-table setup/lobby/game/results;
  - all table actions, state announcements, errors, empty states, and reconnect
    states;
  - Learn catalog, lessons, quizzes, scenarios, missions, reference sheets, and
    progress explanations;
  - hand history, replay, grading, results, and spot labels;
  - accessibility labels, hints, roles, and live announcements;
  - AI-coach prompts, allowed output language, failure copy, and deployment
    notes;
  - App Store and Google Play metadata, screenshot captions, support copy, and
    release notes.
- Produce a machine-readable inventory with source key, English value,
  placeholders, feature owner, character-risk flag, and screenshot route.
- Mark intentionally language-neutral values such as card notation, `BB`, `SPR`,
  `EV`, `ICM`, `3-bet`, and `4-bet`.

### L2 — Generalize the locale architecture

- Replace scattered locale unions and conditional mappings with one typed locale
  registry containing:
  - app locale;
  - system-locale aliases;
  - display name;
  - `Intl` formatting locale;
  - catalog loader;
  - store locale mapping;
  - text-direction metadata;
  - AI-coach support state.
- Preserve `system` as a preference and preserve existing saved preferences.
- Define deterministic fallback behavior. Missing translations may fall back to
  English in development diagnostics, but a release gate must reject missing
  production keys.
- Route dates, counts, percentages, and numbers through the locale registry
  instead of screen-local ternaries.
- Add count-aware message selection for languages that require singular/plural
  distinctions. Do not encode English grammar in callers.
- Split very large catalogs into maintainable per-locale modules or generated
  typed artifacts without weakening compile-time key parity.
- Extend `app.json`, the native build configuration, and release inspection to
  declare and verify `es-419` and `pt-BR`.
- Extend account deletion, AI consent, error presentation, and every other
  separate catalog rather than relying on unsafe casts.

Acceptance:

- One registry is the source of truth for supported locales.
- Adding a test locale requires a catalog and registry entry, not edits across
  unrelated screens.
- Existing saved preferences continue to resolve correctly.
- `es`, Latin American Spanish region tags, and `pt-BR` resolve as documented;
  unknown locales resolve to English.
- All locale and formatting unit tests pass.

### L3 — Create translation standards and poker glossaries

Create separate Spanish and Brazilian Portuguese language guides before bulk
translation. Each guide must define:

- voice and reading level;
- formality and second-person usage;
- poker-action terminology;
- translated versus preserved English shorthand;
- cash/play-money wording;
- tournament and position terminology;
- grammar rules for counts, genders, and articles;
- punctuation, capitalization, number, and percentage conventions;
- accessibility phrasing;
- maximum-length guidance for table controls and compact cards;
- banned literal translations and known false friends.

The reviewer must approve the glossary before reviewing thousands of strings.
Otherwise the first half of the catalog becomes the glossary experiment for the
second half.

### L4 — Translate Spanish (`es-419`)

- Translate the complete inventory, not just the base message catalog.
- Use machine or model output only as a first draft.
- Require one native-language review and one poker-knowledge review; one person
  may fill both roles if qualified.
- Verify that every lesson preserves its poker facts, action order, amounts,
  card notation, scores, correct-answer IDs, and learning intent.
- Review all compact table labels on device rather than shortening them blindly
  in the catalog.
- Generate and review localized store metadata and screenshot captions.

### L5 — Translate Brazilian Portuguese (`pt-BR`)

Apply the same contract as L4 with Brazilian vocabulary and reviewers. A
Spanish translation must not be used as the source for Portuguese; both derive
from the approved English source and their own glossaries.

### L6 — Extend localized AI coaching

- Extend the mobile request type and Edge Function contract to accept `es-419`
  and `pt-BR`.
- Add explicit language and poker-terminology instructions for both languages.
- Keep verified numeric analysis language-neutral and server-validated.
- Add contract tests that reject unknown values and accept every shipped locale.
- Add output-language smoke tests using representative preflop, postflop, and
  tournament hands.
- Verify the AI failure path remains fully localized when the network, quota, or
  provider fails.
- Deploy the exact Edge Function revision used by the release candidate and
  record authenticated smoke evidence.

The static app remains usable if optional AI coaching is unavailable. A failed
AI localization is not permission to send the user's hand to a different
unreviewed language path.

### L7 — Automated localization gates

Extend the current suite so every shipped locale is covered by:

- exact catalog-key parity;
- exact placeholder-name parity;
- no blank strings or unresolved `{{placeholder}}` output;
- plural/count fixtures for zero, one, two, and representative larger values;
- stable card notation, chip amounts, blinds, percentages, and correct answers;
- no unexpected English sentence leakage;
- locale resolution and saved-preference migration;
- date, number, and percentage formatting;
- account-deletion and consent completeness;
- AI-coach contract and language-instruction coverage;
- learning-content and scenario semantic fixtures;
- localized accessibility-label coverage;
- store metadata and supported-locale build inspection.

An allowlist may cover genuinely language-neutral poker shorthand and product
names. It must be reviewed and documented; a broad allowlist named `English is
fine` is not a localization strategy.

### L8 — Visual, accessibility, and device QA

For each of `es-419` and `pt-BR`, verify:

- light and dark themes;
- smallest supported phone width, representative standard phone, notched iPhone,
  and tablet;
- portrait plus both supported landscape directions where applicable;
- default and largest supported text sizes;
- onboarding, Home, Learn, Play, Profile, Quick Play, six- and nine-seat tables,
  Daily Challenge, Championship, private setup/lobby/game/result, coach review,
  history, replay, Progress, consent, and account deletion;
- no clipped controls, accidental ellipses that hide decisions, overlapping
  cards, or off-screen confirmations;
- TalkBack and VoiceOver speech for changed critical flows;
- localized hardware-Back and destructive-confirmation behavior;
- language change without stale mixed-language surfaces.

Capture a small, repeatable screenshot matrix. Screenshots are evidence, not a
replacement for interaction and screen-reader checks.

### L9 — Store and release readiness

- Add reviewed App Store and Google Play metadata for both locales.
- Capture localized store screenshots after the final in-app copy is frozen.
- Localize privacy/support/release-note text where the store surface presents it.
- Confirm every locale appears in the built native artifact, not only in source.
- Run the existing release gates on the exact signed Android and iOS candidates.
- Record CI, artifact, physical-device, accessibility, and AI-coach evidence in a
  release ledger.

## 6. Phase 19.5 outcome — Japanese

Ship a fully reviewed Japanese experience on the Phase 19 localization
foundation. Phase 19.5 repeats the completeness contract, with additional
Japanese-specific gates.

### J1 — Go/no-go prerequisites

Do not begin full translation until:

- Phase 19's registry, catalogs, and gates are stable;
- at least one native Japanese poker reviewer is booked;
- a Japanese glossary and style sample covering one lesson, one scenario, one
  results screen, and one nine-seat table has been approved;
- the sample fits the smallest target layouts without destroying meaning;
- support capacity exists for Japanese user reports.

### J2 — Japanese-specific implementation and QA

- Add `ja` to the registry, catalogs, app configuration, stores, and AI contract.
- Define natural use of Japanese poker terms versus established English
  abbreviations.
- Test Japanese line-breaking behavior and prohibit awkward per-character hacks
  in shared components.
- Verify the selected fonts render Japanese at every used weight; do not rely on
  synthetic bold that becomes illegible.
- Review ruby/furigana policy explicitly. The default recommendation is no
  furigana unless user research shows the poker vocabulary requires it.
- Review counters, dates, percentages, sentence spacing, punctuation, and action
  narration as Japanese—not as reordered English.
- Run native TalkBack and VoiceOver speech checks for table state, actions,
  results, and destructive flows.
- Re-run semantic preservation fixtures for all lessons and scenarios.
- Review AI-coach output for natural, concise explanation and consistent poker
  shorthand.
- Produce Japanese store copy and screenshots only after in-app approval.

### J3 — Phase 19.5 release gate

Japanese ships only when:

- catalog, placeholder, semantic, and leakage gates pass;
- the full critical-flow device matrix passes;
- a native poker reviewer signs off on all learning content;
- screen-reader evidence exists for changed critical flows;
- the deployed coach function returns reviewed Japanese and correct verified
  facts;
- the signed candidates pass existing artifact and release-bundle checks.

If any gate fails, keep Japanese behind the build/release boundary. Spanish and
Brazilian Portuguese should not wait for a Japanese schedule slip.

## 7. Definition of done

### Phase 19

- [ ] One typed locale registry owns language metadata and resolution.
- [ ] `en`, `zh-Hans`, `zh-Hant`, `es-419`, and `pt-BR` are complete and pass
  exact parity/placeholder gates.
- [ ] Spanish and Portuguese learning/scenario content is complete and reviewed.
- [ ] All critical UI and accessibility surfaces pass the device matrix.
- [ ] AI coaching accepts and returns both new languages with authenticated
  smoke evidence.
- [ ] Native artifacts declare both locales.
- [ ] Localized store metadata and screenshots are approved.
- [ ] Full typecheck, default tests, localization suite, CI, artifact inspection,
  and release-bundle checks pass on the release candidate.
- [ ] Signed iOS and Android candidates have a provenance-clean evidence record.

### Phase 19.5

- [ ] `ja` passes all Phase 19 completeness gates.
- [ ] Japanese-specific typography, line-break, glossary, and accessibility
  checks pass.
- [ ] A native Japanese poker reviewer signs off.
- [ ] Japanese AI-coach and store-localization evidence is complete.
- [ ] Signed artifacts pass the release gates.

## 8. Explicit non-goals

- Runtime machine translation of product or coaching UI.
- Shipping a language picker before its full content catalog exists.
- Using AI-generated copy without native human review.
- Adding `es-ES`, `pt-PT`, Korean, French, or German in these phases.
- Changing poker rules, grading, deterministic analysis, progression, or
  multiplayer protocol behavior except where locale transport is required.
- Building Decision Lab / do-overs in the same phase.
- Claiming release completion from simulator screenshots alone.

## 9. Risks and controls

| Risk | Control |
| --- | --- |
| English source changes during translation | Freeze source; issue a reviewed delta batch with versioned keys |
| Correct grammar requires more than interpolation | Add explicit plural/count APIs and fixtures before catalog work |
| Poker facts change during translation | Semantic fixtures plus poker reviewer sign-off |
| Compact table text clips | Character-risk inventory and real-device matrix at large text sizes |
| AI coach returns the wrong language or terminology | Typed server allowlist, language instructions, authenticated output smokes |
| New locale is declared in JS but missing from native artifact | Artifact inspection verifies native locale declarations |
| Store copy promises a regional variant the app does not provide | Align store locale labels and reviewer sign-off with in-app locale policy |
| Translation quality decays after launch | Glossary, translation memory, locale owners, and per-PR parity gates |
| Three languages overwhelm review capacity | Ship Phase 19 first; Japanese remains an independent gated follow-up |

## 10. Suggested execution order

1. Close or freeze Phase 18.5 copy and layouts.
2. Inventory/export the full English source.
3. Build L2 locale architecture and L7 automated gates.
4. Approve Spanish and Portuguese glossaries and representative samples.
5. Translate in parallel only after the samples pass product review.
6. Integrate Spanish, then Portuguese, keeping each catalog independently green.
7. Extend and deploy AI coaching for both.
8. Complete device, accessibility, store, CI, and signed-artifact evidence.
9. Release Phase 19.
10. Run the Japanese sample gate and make the Phase 19.5 go/no-go decision.

## 11. Rough effort bands

These are planning ranges, not commitments. Translation/review time depends on
the actual exported word count and reviewer availability.

| Work | Engineering / QA | Translation / native review |
| --- | ---: | ---: |
| Inventory + scalable locale foundation | 4–7 days | — |
| Spanish integration and product QA | 4–7 days | 1–3 weeks elapsed |
| Brazilian Portuguese integration and product QA | 4–7 days | 1–3 weeks elapsed |
| Store, AI-coach, signed release evidence | 3–6 days | included reviewer follow-ups |
| Japanese sample/go-no-go | 2–3 days | 3–5 days elapsed |
| Japanese full integration and product QA | 6–10 days | 2–4 weeks elapsed |

Some work overlaps, but the release schedule should be controlled by review
quality rather than the speed of first-draft translation.

## 12. Goal instruction for the implementing agent

> Implement Phase 19 from this document: generalize RiverMind's localization
> architecture and ship complete, reviewed Latin American Spanish (`es-419`) and
> Brazilian Portuguese (`pt-BR`) experiences. Treat localization as product
> correctness, not catalog filling. Cover every UI, learning, scenario,
> accessibility, consent, account-deletion, multiplayer, history/replay,
> progress, AI-coach, native-artifact, and store surface identified here.
> Preserve all poker facts, stable IDs, card notation, amounts, correct answers,
> and verified analysis. Add exact catalog and placeholder parity, grammar/count,
> semantic preservation, English-leakage, locale-resolution, formatting,
> accessibility, AI-contract, and artifact gates. Require native poker-language
> review and real-device evidence. Do not implement Japanese or Decision Lab in
> Phase 19; leave the registry ready for the separately gated Phase 19.5 Japanese
> release. Work from the current committed tree, preserve unrelated user work,
> keep an evidence ledger, and do not call the phase complete while CI, signed
> artifacts, physical-device accessibility, native review, or deployed-coach
> checks remain owner-bound.

## 13. Sources and decision notes

External sources are used only to support language prioritization and store
capability. The implementation scope comes from direct inspection of the
RiverMind repository on 2026-09-02.

- [Instituto Cervantes, *El español en el mundo 2025*](https://cvc.cervantes.es/lengua/anuario/anuario_25/moreno-alvarez/p01.htm):
  more than 630 million potential Spanish speakers and more than 500 million
  native-proficiency speakers.
- [IBGE, 2025 Brazilian population estimate](https://ftp.ibge.gov.br/Estimativas_de_Populacao/Estimativas_2025/estimativa_dou_2025.pdf):
  213,421,037.
- [IBGE, 2025 internet and mobile access](https://agenciadenoticias.ibge.gov.br/agencia-noticias/2012-agencia-de-noticias/noticias/47408-proporcao-de-usuarios-da-internet-no-pais-ultrapassou-90-da-populacao-de-10-anos-ou-mais-em-2025):
  90.5% of people aged 10+ used the internet and 89.8% had a personal mobile
  phone.
- [Brazilian Series of Poker, 2025 tournament rules](https://bsop.com.br/wp-content/uploads/REGULAMENTO-BSOP_2025.docx.pdf).
- [Statistics Bureau of Japan, preliminary 2025 census count](https://www.stat.go.jp/english/info/news/20260625.html):
  123.05 million.
- [Sensor Tower, *Japan Game Market Insights 2025*](https://sensortower.com/blog/state-of-japan-gaming-2025):
  estimated $11 billion in mobile-game IAP revenue and 628 million downloads.
  Sensor Tower values are estimates, not official statistics.
- [Apple, App Store metadata localizations and regional display behavior](https://developer.apple.com/help/app-store-connect/reference/app-information/app-store-localizations/).
- [Google Play, supported store-localization codes and native/human translation guidance](https://support.google.com/googleplay/android-developer/answer/9844778).
