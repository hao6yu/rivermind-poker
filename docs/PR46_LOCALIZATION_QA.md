# PR 46 — Localization completion and AI coach language QA

## Scope

- Completes English, Simplified Chinese, and Traditional Chinese copy for Progress, Beta Feedback, Beta & privacy, remaining accessibility labels, coach failures, and Daily Challenge dates.
- Presents deterministic live-coach and decision-review guidance in the selected language without changing the poker engine or revealing hidden cards.
- Sends an allowlisted `language` field to the Supabase `poker-coach` Edge Function so OpenAI prose matches the in-app language.
- Keeps the Edge Function backward-compatible: clients that omit `language` continue to receive English.

## Security and correctness boundaries

- Accepted coach languages are exactly `en`, `zh-Hans`, and `zh-Hant`; unsupported values are rejected.
- Language changes prose only. The deterministic verified analysis, cards, public action history, legal actions, quota behavior, and hidden-card filtering are unchanged.
- Existing TestFlight builds remain compatible with the updated Edge Function.
- English retains the detailed deterministic strategy explanation. Chinese uses localized, fact-based summaries derived from public inputs while the AI post-hand review is generated directly in the selected language.

## Responsive checks

- Progress metrics wrap into two columns.
- Feedback categories wrap and the feedback form remains scrollable above the keyboard.
- Beta & privacy is a full-screen scroll view, so longer Chinese copy does not depend on fixed card heights.
- Coach bars continue to cap copy at two lines; full localized details remain available in the insight sheet.

## Automated verification

```sh
pnpm typecheck
pnpm test
pnpm exec expo export --platform ios
```

Focused tests cover message-catalog completion, localized date formatting, deterministic coach presentation, coach error mapping, language allowlisting, legacy-client fallback, and explicit OpenAI output-language instructions.

## Deployment note

After this PR is merged, deploy `poker-coach` before testing localized AI reviews. The mobile UI remains functional without that deployment, but the deployed proxy must understand the new language field to return localized AI prose.
