# Release 1.2 — S7 candidate verification record

Candidate: **RiverMind 1.2.0**, Android versionCode 2 / iOS buildNumber 2,
source at the Phase 18 working tree on `master` (base `9b691977`).

## Artifacts verified this session

| Artifact | What it is | Gates run | Result |
| --- | --- | --- | --- |
| `artifacts/android/RiverMind-2148742a-20260902-134056-local-release.apk` | **The 1.2.0 candidate build**, built from the committed tree at `2148742a` for reproducible provenance (release variant, Hermes, minSdk 24, targetSdk 36, versionName 1.2.0 / code 2; debug-signed — the store signature comes from the owner's EAS build) | `verify-android-artifact.mjs` (target API 36, 16 KB ELF page alignment, uncompressed-library zip alignment) | **PASS** — `package dev.isw.rivermindpoker version 1.2.0 (code 2) minSdk 24 targetSdk 36 compileSdk 36`; arm64-v8a and x86_64 min page 16384; 32 uncompressed 64-bit libraries page-aligned |
| same APK, compiled bundle `assets/index.android.bundle` (4,112,320 bytes) | Friend-table structural availability on the built artifact | `verify-release-bundle.mjs` | **PASS** — `multiplayer-room-v4`, review entry, return-next-hand, create flow, lobby markers present; retired `EXPO_PUBLIC_MULTIPLAYER_PREVIEW` absent |
| `artifacts/android/RiverMind-121338d2-20260901-154303-local-release.apk` | The shipped 1.1.0 baseline build (before/after evidence anchor) | both gates | **PASS** (same checks) — recorded as the S0/S3 baseline |
| `/tmp/rm-export-android` (1.2.0 Expo export, Hermes `.hbc`) | CI-equivalent bundle gate on the export path | `verify-release-bundle.mjs` | **PASS** |
| superseded intermediates (`RiverMind-9b691977-20260902-041008…`, `RiverMind-a2da4afe-20260902-043852…`, `RiverMind-a2da4afe-20260902-104749…`) | earlier candidate builds used during the on-device verification loop | both gates | **PASS** at the time of build; superseded by the provenance-clean `2148742a` build above (the 104749 build already contained the final strings but predates the commit) |

## Gates executed on this working tree

| Gate | Command | Result |
| --- | --- | --- |
| Typecheck | `pnpm typecheck` | **PASS** (clean) |
| Default suite | `pnpm test` | **PASS** — 193 files / 2002 tests |
| Localization gates | `pnpm test:localization` (catalog parity, Chinese quality, money units, decision localization) | **PASS** |
| Multiway AI evaluation | `pnpm eval:multiway-ai` (26 assertions incl. seeded 3/6-player tables per difficulty, blind-defense, participation, showdown, and walk-rate tables) | **PASS** — no regression from 1.1: difficulty ordering intact (friendly → nemesis), all-AI six-player pots contested (80% showdown / 0% walk at club), nine-player Club tables selective without fold-only, adaptive pressure subtle. Metric tables recorded in the session log. |
| Release configuration | `pnpm verify:release-config` | **PASS** — 1.2.0 / code 2 / build 2 |
| Android artifact inspection | on the exact candidate APK (above) | **PASS** |
| Friend-table bundle assertion | on the exact candidate APK (above) | **PASS** |
| Whitespace | `git diff --check` | **PASS** (clean) |
| Mobile-secret scan | `pnpm verify:mobile-secrets` over tracked source + 1.2.0 iOS/Android exports | executed on the committed tree (see execution record S7 note) |
| Multiplayer integration harness | `pnpm test:multiplayer-integration` | **NOT EXECUTED HERE** — requires the local Supabase stack (Docker unavailable in this environment). The harness is wired into its own CI job (`multiplayer-integration`) with `supabase start` + migrations; the job FAILS, never skips, when the stack is missing. |

## S7 device matrix — executed vs. not executed

The plan's matrix is recorded row by row. Rows marked **NOT EXECUTED** require
physical devices or store credentials that this environment does not have;
they are release-blocking owner actions, not silent passes.

| Matrix row | Status |
| --- | --- |
| Notched iPhone + 360-dp Android baseline | **NOT EXECUTED** (no devices) |
| 320-dp Android layout check | **NOT EXECUTED** (no devices) |
| Portrait + both landscape directions | **NOT EXECUTED on device**; geometry covered by the measured-layout matrix fixtures (2/3/6/9 × 9 viewports × 3 text scales, collision-free with the hero upgrade) |
| Light and dark schemes | **NOT EXECUTED on device**; palettes unchanged except reviewed tone tokens |
| en / zh-Hans / zh-Hant | **NOT EXECUTED on device**; all copy parity + Chinese-quality gates pass; locale-independent testIDs ship for automation |
| Default + largest text | **NOT EXECUTED on device**; OS scaling honored (GuidedText fix, plaque floor 0.85), large-text layout covered by text-scale fixtures |
| 2, 3, 6, 9 seats | **NOT EXECUTED on device**; 9-seat grading fixtures + pinned corpus pass; layout matrix covers all seat counts |
| Coach on/off | **NOT EXECUTED on device**; live private-table coaching verified absent in code |
| Local cash, Sit & Go, Championship, Daily/mission, private | **NOT EXECUTED on device** |
| Private session with deliberate missed deadline | **NOT EXECUTED on device** — the P18-003 fix (persistent plaque + banner + queued Return) is fixture- and render-tested; this run remains the decisive device check |
| TalkBack and VoiceOver passes on changed flows | **NOT EXECUTED** (requires devices); static a11y tree work shipped (DecorativeIcon, explicit labels, 44pt targets); speech must be verified separately |

Phase 16 device observations rechecked: **NOT EXECUTED** (P18-052 stays open
for the device pass). Private-lobby center-label bleed (P18-050) and dark
Home CTA contrast (P18-051): **NOT EXECUTED on device**.

## Paired before/after evidence for Release 1.2 defects

| ID | Before | After |
| --- | --- | --- |
| P18-001 | Red run quote in the execution record (S0): `Error: Equity requires one to five unknown opponents.` from `gradeMultiwayHand` on a 9-seat flop | Green: 8-opponent no-equity grading exact through the extended estimator; 17-fixture suite + pinned corpus |
| P18-004 | 1.1.0 build compiled the flag as `undefined === '1'` — surface compiled but runtime-hidden without `.env` | Flag deleted; entry/resume/invite/stats unconditional; structural source gate + bundle gate PASS on the 1.2.0 candidate APK |
| P18-003 | Seat ring returned `null` for a non-dealt seat (sat-out viewer vanished) | Every occupied seat renders one plaque; settled boundary names the state; persistent banner + queued Return next hand |
| P18-008 | `{{players}} win the showdown` rendered "Hao win the showdown…" for a single winner | Person-conjugated keys; pinned test "Iris wins the showdown with Flush." / zh equivalents |
| P18-015 | Hero cards equal to opponent cards at every density | Hero envelope upgrade with collision-checked fixtures; dense opponent backs capped at indicator size |
| P18-010 | Loss rendered destructive red | Neutral border/accent; red is destructive-only |
| P18-027 | `allowFontScaling={false}` in onboarding; plaques shrank to 0.72 | Shared GuidedText honors OS scaling with a cap; plaque floor 0.85 |
| P18-026 | 16 modals ignored reduced motion | All respect `useReducedMotion` |

## Owner actions still required for release

1. Run the S7 device matrix above on physical devices (the local-release APK
   is installable: `adb install -r -g artifacts/android/RiverMind-2148742a-20260902-134056-local-release.apk`),
   record TalkBack/VoiceOver speech, and attach screenshots per row.
2. Cut the signed store candidates via EAS (credentials owner-only), then run
   `pnpm release:check -- --android-artifact <signed.apk>` (artifact gate) and
   `pnpm verify:release-bundle <signed artifact>` on the exact signed files.
3. Push the branch so CI (typecheck, default suite, localization, multiplayer
   integration with the local Supabase stack, Android artifact build +
   inspection, release evidence) executes on the runner.
4. Store submission and any store-config change remain owner-authorized
   actions; none were performed.
