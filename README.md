# RiverMind Poker

RiverMind Poker is a Texas Hold'em learning app for iOS and Android. It combines deterministic heads-up and multiway poker engines, range-aware local opponents, live pot-odds feedback, and server-side AI hand reviews.

The current product direction is defined in the [Phase 1 scope](docs/PHASE_1_SCOPE.md), [Phase 2 scope](docs/PHASE_2_SCOPE.md), [product framework](docs/PRODUCT_FRAMEWORK.md), and [Learn MVP design](docs/LEARN_MVP_DESIGN.md). Phase 1 is intentionally a focused solo-learning beta: learn one concept, practice it heads-up, receive a verified review, and revisit the hand later. Phase 2 adds tested 3–6 player AI tables before the next beta build.

## Current status

- Modern Expo/React Native shell with light, dark, and system appearance modes.
- First-run beta guidance plus an always-available Beta & Privacy summary and feedback link.
- Simple Learn and Play navigation that keeps unfinished tournament and private-table paths hidden.
- Deterministic heads-up engine with replayable action history.
- Deterministic 2–6 seat engine with correct positions, action order, betting, all-ins, main and side pots, showdowns, and odd-chip settlement.
- Local 3–6 player decision layer with five stable opponent identities, public-action range modeling, and hidden-card fairness tests.
- Custom 2-, 3-, and 6-player AI sessions with responsive seats, complete hand results, replay, history, feedback, and privacy-safe Supabase sync.
- Contextual legal bet and raise sizing, live action feedback, and stack-aware hand results.
- Custom sessions with exact 40/100/200 BB stacks, hand targets, progress, and session summaries.
- Local opponent driven by equity, pot odds, board texture, pressure, and mixed bluffs.
- Measurable Friendly, Club, and Sharp opponent profiles with repeatable behavior simulations.
- Authenticated Supabase Edge Function for verified OpenAI coaching.
- Server-enforced limit of 20 AI review requests per user per UTC day, with aggregate latency and failure metrics.
- Bounded transient retries plus clear loading, retry, daily-limit, and deterministic fallback states.
- Durable, owner-scoped practice sessions, completed hands, and coach reviews.
- Offline write queue with automatic retry when Supabase becomes reachable again.
- Saved Hand History available from the table and Profile.
- Six-part fundamentals path with focused lessons and four quick-reference cheat sheets.
- Repeatable percentage trainer and hand-decision quiz with explanations and best scores.
- Six card-based scenario drills covering preflop value, blind defense, draws, value betting, bluff catching, and bluff selection.
- Local-first learning completion synchronized to owner-scoped Supabase progress.
- Saved progress metrics plus an owner-authorized delete-history control.
- Deterministic unit tests plus end-to-end persistence and coach-quota access verifiers.
- Compact table layouts, safe-area-aware sheets, and screen-reader labels for the primary beta journey.
- Repeatable mobile-secret and expanded cross-user RLS release gates.
- Reproducible iPhone EAS profiles, private beta support, and App Store Connect identity for TestFlight preparation.

## Why this architecture

- **React Native + Expo** gives us one TypeScript codebase and fast device testing.
- **The poker engine is local and deterministic.** Rules, payouts, hand strength, and legal actions never depend on an LLM.
- **Coaching facts are verified before the model sees them.** Each hero decision captures an immutable snapshot of the board, pot, wager, stacks, contributions, call amount, and legal actions. The Edge Function validates that state and independently recomputes hand rank, board texture, possible categories, draws, pot odds, and SPR with the shared poker analyzer.
- **Local opponents use Monte Carlo equity, pot odds, board texture, position, players behind, stack-to-pot ratio, public-action ranges, and mixed-frequency bluffs.** Hidden cards from other seats are never inputs. This creates a credible first opponent layer while leaving a clean path to CFR/GTO strategies later.
- **OpenAI explains the verified analysis; it does not calculate poker rules.** The mobile app calls an authenticated Supabase Edge Function; the OpenAI key is never bundled into the app.

## Run the mobile app

Prerequisites: Node.js 22.19 or newer, pnpm, and Expo Go or an iOS/Android simulator.

```bash
pnpm install
pnpm start
```

Keep only the two `EXPO_PUBLIC_SUPABASE_*` values from `.env.example` in the mobile app's root `.env` or `.env.local`. The OpenAI key belongs in Supabase Edge Function secrets, never in a root env file that Expo loads.

The app remains playable and all Learn content remains available without Supabase. Completed hands and learning progress wait locally and sync after connectivity returns.

## Prepare the iOS beta

The iOS build supports iPhone and iPad on iOS 15.1 or newer. Complete the dedicated iPad layout and device pass before widening tablet distribution. The Android package and launcher assets are configured, with Android distribution following its own device pass.

```bash
pnpm release:check
pnpm eas:config:ios
pnpm build:ios:testflight
pnpm submit:ios:testflight
```

The one-time Expo project link, safe EAS environment variables, App Store identity, tester instructions, and rollback process are documented in [the TestFlight beta runbook](docs/TESTFLIGHT_BETA.md). Private beta support and privacy questions go to `hyu@ims.dev`.

## Run Supabase locally

Docker (or a compatible container runtime) is required by the Supabase local stack.

```bash
supabase start
supabase functions serve poker-coach --env-file supabase/functions/.env.local
```

Local startup applies the committed migrations in `supabase/migrations`. To deploy them to a linked hosted development project, preview before applying:

```bash
supabase link --project-ref YOUR_PROJECT_REF
supabase db push --dry-run
supabase db push
```

The coach defaults to `OPENAI_REASONING_EFFORT=medium`. The repeatable comparison
corpus can be run against the hosted function with:

```bash
pnpm eval:coach --effort=medium
```

Run only the targeted deterministic-analysis regressions with:

```bash
pnpm eval:coach --effort=medium --ids=T03,T04,R01,R02,R06
```

Compare all three local opponent profiles across the same 120 seeded hands with:

```bash
pnpm eval:ai
```

Run the repeatable 3-player and 6-player multiway decision benchmark with:

```bash
pnpm eval:multiway-ai
```

The measured parameters and fixed benchmark are documented in [AI difficulty presets](docs/AI_DIFFICULTY_PRESETS.md).
Scenario content, partial-credit rules, and UX boundaries are documented in [Scenario training](docs/SCENARIO_TRAINING.md).

Set the hosted `OPENAI_REASONING_EFFORT` secret to the same value before running
the evaluator. Raw results are written to the ignored `.eval-results/` directory.

Anonymous sign-in is enabled in `supabase/config.toml` for the learning MVP. For a hosted project:

1. Create or link a Supabase project.
2. Enable anonymous sign-ins in Auth settings.
3. Add `OPENAI_API_KEY` and `OPENAI_MODEL` in Edge Function Secrets.
4. Deploy `poker-coach` with JWT verification enabled.
5. Put only the project URL and publishable key in the app's root `.env` or `.env.local`.

For local Edge Function development, keep `OPENAI_API_KEY` and `OPENAI_MODEL` in the ignored `supabase/functions/.env.local`, following `supabase/functions/.env.example`.

The current implementation follows Supabase's authenticated Edge Function and secret-management guidance. The proxy retries one genuine transient OpenAI failure, does not retry billing/auth/configuration failures, and records only safe aggregate error codes. Verified poker facts remain available without an OpenAI response.

## Persistence and privacy

The public schema contains six tables:

- `practice_sessions` stores one owner-scoped AI practice session.
- `practice_hands` stores a completed, replayable hand.
- `hand_reviews` stores deterministic analysis and the bounded AI explanation.
- `learning_progress` stores lesson completion, drill attempts, and best scores.
- `coach_daily_usage` stores owner-readable, server-managed daily request and reliability totals.
- `beta_feedback` accepts private, insert-only tester reports with bounded diagnostic context.

Every table has Row Level Security and explicit Data API grants. Owner-scoped records check `auth.uid()`; beta feedback permits only owner-authenticated inserts and exposes no mobile read, update, or delete access. Anonymous Supabase users use the `authenticated` database role but remain isolated by their unique user ID.

Before a hand enters local or hosted persistence, RiverMind removes the undealt deck. Opponent cards are stored only when they were legitimately revealed at showdown. OpenAI and Supabase secret/service-role keys never enter the mobile bundle.

## Validate

```bash
pnpm test
pnpm typecheck
pnpm verify:release-config
pnpm release:check
pnpm verify:mobile-secrets
pnpm verify:rls
pnpm verify:coach-quota
```

`verify:mobile-secrets` rejects raw OpenAI/Supabase server credentials, tracked local env files, or server-only environment names in mobile source. Pass iOS and Android export directories as arguments to scan production bundles too.

`verify:rls` uses only the publishable client configuration from the ignored root `.env`. It creates two temporary anonymous users, verifies unauthenticated and cross-user CRUD isolation, ownership forgery protection, and server-only quota writes, then removes the database test rows when finished.

`verify:coach-quota` proves mobile clients can read only their own quota row and cannot call the server-only quota functions or mutate counters directly.

## Project layout

- `src/domain/poker` — deterministic rules, analysis, privacy redaction, replay, and tests.
- `src/domain/learning` — stable lesson, trainer, and scenario content with recommendations, scoring, and tests.
- `src/features` — mobile screens and reusable poker UI.
- `src/services` — Supabase auth, coaching, durable history, beta diagnostics, and offline retry.
- `src/types/database.ts` — generated types for the hosted database schema.
- `supabase/migrations` — reviewable schema, grants, indexes, and RLS policies.
- `supabase/functions/poker-coach` — authenticated server-side coaching proxy.
- `docs` — product scope, architecture contracts, model evaluations, the [beta privacy notice](docs/PRIVACY.md), and the [release checklist](docs/BETA_RELEASE_CHECKLIST.md).
- `docs/TESTFLIGHT_BETA.md` — the iPhone build, submission, tester, evidence, and rollback runbook.

## Roadmap toward a genuinely strong opponent

The current bot is an honest first milestone, not a claim of solver-level play. The next strength upgrades are:

1. Persist opponent tendencies and adapt exploitatively.
2. Add preflop range charts by stack depth and position.
3. Train or import a heads-up CFR strategy abstraction.
4. Add bet-size selection across several actions instead of one suggested size.
5. Add expected-value comparisons to the scenario coaching feedback.
6. Add private friend tables with Supabase Realtime after the solo engine is stable.

This project is intended for learning and play with friends, not real-money wagering.
