# Phase 1 beta release checklist

Use this checklist for every internal iOS or Android build. A checked item must have evidence from the exact commit being distributed.

## Automated release gate

- [ ] Install dependencies with Node 22.19 or later: `pnpm install --frozen-lockfile`.
- [ ] TypeScript passes: `pnpm typecheck`.
- [ ] Unit and simulation tests pass: `pnpm test`.
- [ ] iOS production export completes.
- [ ] Android production export completes.
- [ ] `pnpm verify:mobile-secrets <ios-export> <android-export>` passes.
- [ ] Live owner-isolation verification passes with the beta Supabase project: `pnpm verify:rls`.
- [ ] Coach quota verification passes: `pnpm verify:coach-quota`.
- [ ] Hosted coach regression sample remains factually disciplined and within the agreed latency budget.

## Core journey

- [ ] A fresh install explains play chips, optional AI coaching, and anonymous data storage.
- [ ] Home has one obvious recommended learning action and Quick Play starts one 100 BB hand.
- [ ] Learn opens and exits every lesson, cheat sheet, trainer, quiz, and scenario flow.
- [ ] Custom Play supports 40/100/200 BB and 1/5/10/open-ended sessions.
- [ ] Fold, check, call, legal bet/raise sizes, all-in, showdown, and split-pot paths complete without stuck states.
- [ ] Session summary, same-setup replay, hand history, and decision replay work.
- [ ] Normal gameplay and saved history continue when AI coaching is unavailable.
- [ ] Profile can delete saved learning and poker history.
- [ ] Profile feedback submits successfully, preserves a failed draft, and never exposes another tester’s report.
- [ ] Coach errors can open a pre-categorized report with an optional privacy-redacted hand attachment.

## Accessibility and device coverage

- [ ] Complete the core journey on the smallest supported iPhone and a current large iPhone.
- [ ] Complete the core journey on one small and one current Android device.
- [ ] No content is hidden behind status bars, home indicators, or bottom navigation.
- [ ] Screen-reader labels identify icon-only controls, cards, selected settings, progress, and disabled actions.
- [ ] Primary controls have at least a 44-point touch target.
- [ ] Light mode, dark mode, and system appearance remain readable.
- [ ] Text remains usable at the largest supported system text size; any deliberate text-size cap is documented.

## Supabase and privacy review

- [ ] All exposed `public` tables have RLS enabled and owner policies use `(select auth.uid()) = user_id`.
- [ ] Cross-user read, insert, update, and delete attempts fail for sessions, hands, reviews, and learning progress.
- [ ] Authenticated mobile users cannot write coach quota rows or call server-only quota RPCs.
- [ ] Mobile users can insert only their own feedback and cannot select, update, or delete feedback rows.
- [ ] No `service_role`, Supabase secret, or OpenAI key appears in source, exports, logs, or screenshots.
- [ ] The in-app beta disclosure matches [the beta privacy notice](PRIVACY.md).
- [ ] App Store and Play Console privacy answers match actual behavior.

### Known advisor warnings

- Supabase may warn that policies include anonymous sign-ins. RiverMind deliberately uses anonymous Supabase users during Phase 1; each receives a unique authenticated user ID and remains restricted by owner predicates. Keep the live two-user RLS verifier as the release gate.
- Leaked-password protection is not applicable while the app offers no password sign-in. Reassess and enable appropriate protection before adding password-based authentication.
- Unused-index notices are informational during a low-volume beta. Reassess with production query statistics rather than removing owner/recent-history indexes now.

## Distribution readiness

- [x] Set beta version `1.0.0`, starting iOS build `1`, and starting Android version code `1`; EAS remotely increments production iOS builds.
- [x] Confirm bundle identifier/package name, app icon, splash screen, support URL, privacy URL, and private feedback destination.
- [x] Set the iOS beta minimum to iOS 15.1, matching the current Expo SDK 54 floor.
- [ ] Decide the minimum Android version before starting the Android beta.
- [x] Enable iPad support in the universal iOS build.
- [ ] Complete the dedicated iPad layout and device pass before widening tablet distribution.
- [ ] Choose durable sign-in: Apple, email magic link, or both.
- [x] Add the private privacy-contact channel `hyu@ims.dev`.
- [ ] Add the complete-account deletion path.
- [x] Prepare tester instructions, known limitations, and rollback notes in [TESTFLIGHT_BETA.md](TESTFLIGHT_BETA.md).
- [ ] Archive the signed build artifacts and record the commit SHA distributed to testers.

## Current release blockers

- Durable sign-in and account deletion are not implemented.
- The Expo EAS project still needs one-time account linking before the first signed build.
- External TestFlight/Play testing and store privacy questionnaires are not complete.
