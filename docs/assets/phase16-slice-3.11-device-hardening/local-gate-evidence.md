# Slice 3.11 device hardening — local gate evidence

Branch: `local/slice-3.11-device-hardening`
Start base commit: `d7bdb185`
Final tested commit (branch HEAD): `ea613912`
iOS crash fix preserved: `092e8f8e` (`fix(table): avoid orientation lock during mount`) — confirmed an ancestor of HEAD.

## Checkpoint commit map

| Checkpoint | Commit | Findings |
| --- | --- | --- |
| C — Play/Home simplification | `aa671691` | DT-03 / DT-09 / DT-10 / DT-11 (committed first, alongside the earlier checkpoint run) |
| A — Table geometry and trust | `7970702d` | DT-01 / DT-02 / DT-05 / DT-06 / DT-12 |
| B — Identity and overlays | `ea613912` | DT-04 / DT-07 / DT-08 |

## Mandatory local gates (exact invocation → result)

| Gate | Command | Result |
| --- | --- | --- |
| Typecheck | `node node_modules/typescript/bin/tsc --noEmit` | PASS (exit 0) |
| Full test suite | `node node_modules/vitest/vitest.mjs run --testTimeout=20000` | PASS — 172 files, 1873 tests |
| Release config | `node scripts/verify-release-config.mjs` | PASS — "Release configuration verified for RiverMind iOS and Android 1.0.0." |
| Mobile secrets | `node scripts/verify-mobile-secrets.mjs` | PASS — "Mobile secret verification passed for tracked source." |
| Multiplayer edge | `node scripts/verify-multiplayer-edge.mjs` | NOT RUN — fails with `spawnSync supabase ENOENT`; local Supabase CLI is not installed in this sandbox. |
| Whitespace / conflict markers | `git diff --check` | PASS (exit 0) |
| Production-mode JS export (iOS) | `node node_modules/expo/bin/cli export --platform ios` | PASS via combined export (see below) |
| Production-mode JS export (Android) | `node node_modules/expo/bin/cli export --platform android` | PASS via combined export (see below) |

The `pnpm` CLI could not run in this sandbox: its `run`/dependency-status check spawns `pnpm install` and fails with `spawnSync pnpm ENOENT`. The equivalent underlying commands were invoked directly; the exact command lines above are what actually executed. No gate above is claimed without having produced the recorded outcome.

## Production-mode JS bundle check

`node node_modules/expo/bin/cli export --platform ios --platform android --output-dir /tmp/rivermind-export-check`

Outcome: exit 0. Produced Hermes bytecode bundles:
- iOS: `_expo/static/js/ios/index-8f602fd7d007fbf0668a05e0a11993dc.hbc` (~6.08 MB)
- Android: `_expo/static/js/android/index-4d42a8c794937a1a996e0e4fd00ebdbc.hbc` (~6.09 MB)

Note: this is a Metro/Hermes JS bundle check, not a signed native build. The export used the repository's checked-in `.env`; EAS `production` environment secrets (production Supabase/worker URLs) were not injected, so runtime production connectivity is not asserted by this check.

## Focused regression suites (per finding)

| Finding | Suite | Tests |
| --- | --- | --- |
| DT-01 / DT-02 | `src/features/table/multiwayTableLayout.test.ts` | 38 |
| DT-05 | `src/domain/poker/__tests__/multiwayActionOrder.test.ts` | 13 |
| DT-06 / DT-12 | `src/features/table/multiwayGameplayPresentation.test.ts` | 19 |
| DT-04 | `src/components/HumanAvatar.uploaded.test.tsx` | 6 |
| DT-03 / DT-09 / DT-10 / DT-11 | committed with `aa671691`; covered by the same full-suite run | — |
| DT-07 / DT-08 | behaviour implemented in `MultiwayPokerTableScreen.tsx`; no automated screen render test (see remaining limitation). | — |

## Remaining limitations (honest)

1. `verify:multiplayer-edge` not run — `supabase` CLI absent (a genuinely unavailable mandatory local prerequisite).
2. No physical device for the device matrix: install-over uploaded-photo persistence, camera/notch safety in both landscape directions, physical taps for every occupied plaque / edge message, VoiceOver/TalkBack focus and announcements, two-device private-room convergence/reconnect/stats/avatar sharing, sustained nine-seat all-Nemesis performance, and a signed TestFlight preview build are all NOT run.
3. DT-07/DT-08 screen-level timer/action-safety (popup open during a live clock, repeated open/close not resetting a clock) is exercised by code inspection + typecheck; an automated screen render test is out of scope for the `react-test-renderer` harness which has no layout engine, so no fail-before/pass-after automated screen test exists for those two.

## Honest final status

**Device hardening incomplete.** All implemented DT fixes pass the full local suite and typecheck, but not every mandatory local gate ran (`verify:multiplayer-edge` requires the Supabase CLI, absent here), and DT-07/DT-08 have no automated screen-level fail-before/pass-after regression (device physical-tap gate pending). Next action: install the Supabase CLI (or run in a repo with the local stack) to complete `verify:multiplayer-edge`, add a render seam for the DT-07/08 screen turn-safety behavior, then execute the physical-device, two-device, accessibility, and signed-TestFlight gates.
