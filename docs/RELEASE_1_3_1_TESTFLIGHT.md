# v1.3.1 TestFlight candidate

Prepared September 15, 2026 (America/Chicago; September 15 UTC).
This records a testing candidate, not public-release sign-off.

## Candidate identity

| Field | Value |
| --- | --- |
| Version / build | `1.3.1 (33)` |
| Source commit | `53147511` (`53147511` — "Ship v1.3.1: portrait tournament action row fix and six-locale release") |
| Expo project | `@iswtech/rivermind-poker` |
| EAS profile | `production` — store distribution, remote signing credentials |
| Build ID | `9a6386e0-b7eb-4564-ba56-7b0ed3c6fb93` |
| Bundle identifier | `dev.isw.rivermindpoker` |
| App Store Connect app | `6797011715` |
| Submission ID | `d147b699-c310-4fd8-976f-0b3bd65306b4` |
| Submission status | Uploaded successfully to App Store Connect on September 15, 2026; Apple processing pending at handoff |

[EAS build and logs](https://expo.dev/accounts/iswtech/projects/rivermind-poker/builds/9a6386e0-b7eb-4564-ba56-7b0ed3c6fb93)

[EAS submission](https://expo.dev/accounts/iswtech/projects/rivermind-poker/submissions/d147b699-c310-4fd8-976f-0b3bd65306b4)
· [App Store Connect TestFlight](https://appstoreconnect.apple.com/apps/6797011715/testflight/ios)

The candidate bumps the public version to 1.3.1. EAS allocated build number
33 remotely (incremented from 32). The production environment resolves to the
existing hosted Supabase project and the `multiplayer-room-v4` worker. No
production backend configuration was changed during this build preparation.

Submission used the explicit build ID (eas-cli 21.4.0 exposes `--id`, not
`--build-id`), without `--what-to-test` (rejected for non-Enterprise plans in
the v1.3 submission; the notes above can be copied into the build's What to
Test field after processing). EAS Submit exited successfully after
confirming Apple's receipt at 12:01 UTC. Apple processing and tester
availability have not been independently verified: App Store Connect's
browser session requires sign-in.

## What to test

- Portrait tournament tables (Sit & Go, Daily Challenge, Championship): the
  fold/call/raise row must always be visible and tappable while it is the
  player's turn — this candidate fixes the v1.3 regression where the row
  vanished (the tournament HUD starved it to zero width).
- The language picker now lists Español (Latinoamérica), Português (Brasil),
  and 日本語 alongside English, 简体中文, and 繁體中文. Switching languages should
  re-render the whole app, including the profile settings, lesson content,
  and scenario drills.
- The profile language sheet scrolls when it cannot fit every option.
- iPhone and iPad table layouts in both orientations, private-table
  stability, and the existing 1.3 surfaces (replay, history, achievements).

## Validation

- `pnpm release:check` passed on the release commit (configuration verifier,
  Expo dependency check, both TypeScript projects, the full application
  suite, the Supabase database suite, multiplayer worker contract checks,
  iOS and Android production exports, and the tracked-source/export secret
  scans).
- Two policy suites were updated for the six-locale release contract before
  the gate run: `scripts/draftCatalogBundleExport.test.ts` (the production
  export must now SHIP the released catalogs) and
  `scripts/localeProfilePrebuild.test.ts` (production prebuild generates all
  six native locales).
- Device verification on an iPhone 17 Pro simulator (iOS 27) before the
  build: the portrait tournament action row renders and the raise control
  opens bet sizing; the language picker lists all six languages and the
  Português (Brasil) round trip re-renders the settings surface. Evidence
  screenshots: `artifacts/v131-layout-sweep/` (local, not committed).
- Layout findings and automation caveats are recorded in
  [RELEASE_1_3_1_LAYOUT_EVALUATION.md](RELEASE_1_3_1_LAYOUT_EVALUATION.md).

## Release-enablement note

es-419, pt-BR, and ja were release-enabled by owner decision ahead of the
§11 native poker-language review; the review (and the scope §L8
device/accessibility matrix, deployed-coach smoke tests, and localized store
metadata) remain tracked follow-ups in
[PHASE_19_EXECUTION_RECORD.md](PHASE_19_EXECUTION_RECORD.md) and
[PHASE_19_5_EXECUTION_RECORD.md](PHASE_19_5_EXECUTION_RECORD.md).
