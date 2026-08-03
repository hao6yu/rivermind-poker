# PR 43 — Localization foundation QA

## Languages

- System default
- English (`en`)
- 简体中文 (`zh-Hans`)
- 繁體中文 (`zh-Hant`)

The saved in-app choice overrides the device language. System default maps Chinese devices using the locale script first, then the region: Taiwan, Hong Kong, and Macao use Traditional Chinese; other Chinese locales use Simplified Chinese. Unsupported device languages fall back to English.

## Localized in this release

- First-run onboarding
- Home, Learn index, and Play tabs
- Profile, appearance, language selector, and destructive alerts
- Custom game setup
- Lesson, reference, and trainer navigation/result chrome
- Stable lesson, trainer, cheat-sheet, and practice-pack titles/descriptions
- Bottom tabs and shared screen headers

Long-form lesson bodies, generated training questions, live gameplay terminology, coaching explanations, history, and tournament detail screens remain English in this foundation release. They should move into the same message catalog in the next localization content pass so poker terminology can be reviewed consistently rather than translated piecemeal.

## Manual checks

1. Open Profile → Language and select each of the four choices.
2. Confirm Home, Learn, Play, and Profile update immediately without restarting.
3. Force-close and reopen the app; confirm the explicit choice persists.
4. Select System default, change the device between English, 简体中文, and 繁體中文, then foreground RiverMind.
5. Confirm the language sheet closes when tapping outside it and its selected state is visible.
6. Check light and dark themes at small and large Dynamic Type sizes for clipped Chinese labels.
7. Open a lesson, cheat sheet, and quiz; confirm their header, cards, controls, and result screen use the selected language.

## Automated coverage

- Locale script and region resolution
- English fallback for unsupported locales
- Explicit override behavior
- Persisted preference validation
- Simplified and Traditional Chinese interpolation
- Stable learning activity message-key mapping
