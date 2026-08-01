# RiverMind Poker

RiverMind Poker is a heads-up Texas Hold'em learning app for iOS and Android. It combines a deterministic poker engine, a range-aware local opponent, live pot-odds feedback, and server-side AI hand reviews.

The current prototype is being reshaped around the navigation and learning model in the [product framework](docs/PRODUCT_FRAMEWORK.md).

## Why this architecture

- **React Native + Expo** gives us one TypeScript codebase and fast device testing.
- **The poker engine is local and deterministic.** Rules, payouts, hand strength, and legal actions never depend on an LLM.
- **Coaching facts are verified before the model sees them.** Each hero decision captures an immutable snapshot of the board, pot, wager, stacks, contributions, call amount, and legal actions. The Edge Function validates that state and independently recomputes hand rank, board texture, possible categories, draws, pot odds, and SPR with the shared poker analyzer.
- **The opponent uses Monte Carlo equity, pot odds, board texture, value ranges, and mixed-frequency bluffs.** That creates a credible first opponent while leaving a clean path to CFR/GTO strategies later.
- **OpenAI explains the verified analysis; it does not calculate poker rules.** The mobile app calls an authenticated Supabase Edge Function; the OpenAI key is never bundled into the app.

## Run the mobile app

Prerequisites: a current Node.js runtime, pnpm, and Expo Go or an iOS/Android simulator.

```bash
pnpm install
pnpm start
```

Keep only the two `EXPO_PUBLIC_SUPABASE_*` values from `.env.example` in the mobile app's root `.env` or `.env.local`. The OpenAI key belongs in Supabase Edge Function secrets, never in a root env file that Expo loads.

## Run Supabase locally

Docker (or a compatible container runtime) is required by the Supabase local stack.

```bash
supabase start
supabase functions serve poker-coach --env-file supabase/functions/.env.local
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

Set the hosted `OPENAI_REASONING_EFFORT` secret to the same value before running
the evaluator. Raw results are written to the ignored `.eval-results/` directory.

Anonymous sign-in is enabled in `supabase/config.toml` for the learning MVP. For a hosted project:

1. Create or link a Supabase project.
2. Enable anonymous sign-ins in Auth settings.
3. Add `OPENAI_API_KEY` and `OPENAI_MODEL` in Edge Function Secrets.
4. Deploy `poker-coach` with JWT verification enabled.
5. Put only the project URL and publishable key in the app's root `.env` or `.env.local`.

For local Edge Function development, keep `OPENAI_API_KEY` and `OPENAI_MODEL` in the ignored `supabase/functions/.env.local`, following `supabase/functions/.env.example`.

The current implementation follows Supabase's authenticated Edge Function and secret-management guidance. Production hardening should add a per-user coaching quota before public distribution.

## Validate

```bash
pnpm test
pnpm typecheck
```

## Roadmap toward a genuinely strong opponent

The current bot is an honest first milestone, not a claim of solver-level play. The next strength upgrades are:

1. Persist opponent tendencies and adapt exploitatively.
2. Add preflop range charts by stack depth and position.
3. Train or import a heads-up CFR strategy abstraction.
4. Add bet-size selection across several actions instead of one suggested size.
5. Persist session history across launches, then add quizzes and EV comparisons.
6. Add private friend tables with Supabase Realtime after the solo engine is stable.

This project is intended for learning and play with friends, not real-money wagering.
