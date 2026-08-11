# Phase 8 — Guided Progress & Skill Calibration

Status: complete.

## Goal

Turn RiverMind's expanded curriculum into a clear personal journey. Phase 8
helps each learner choose a useful goal, establish a lightweight baseline,
receive goal-aware sessions, and verify improvement through later decision
checkpoints—all without requiring an account or presenting a solver rating.

## Slice 1 — Local learner profile

- Add an optional learning goal: balanced, foundations, cash-game decisions,
  tournaments, decision math, or opponent reading.
- Keep the profile device-local and editable at any time.
- Preserve a balanced default for learners who skip setup.
- Delete the profile and its checkpoints when saved learning data is reset.

## Slice 2 — Skill calibration

- Offer a short ten-decision check after onboarding or from Learn.
- Cover fundamentals, cash-game decisions, tournament pressure, math, and
  opponent evidence with two decisions per area.
- Treat the result as routing evidence with limited confidence, not mastery or
  solver accuracy.
- Never mark lessons complete or overwrite earned practice scores from a
  calibration answer.

## Slice 3 — Goal-aware guided sessions

- Keep due spaced reviews and resumable work ahead of new recommendations.
- Use the selected goal to prioritize relevant curriculum, weak practice, and
  applied missions while retaining essential fundamentals for new learners.
- Keep the personal plan to three distinct actions totaling roughly five to
  ten minutes.
- Explain when an item was selected because it matches the learner's goal.

## Slice 4 — Progress checkpoints

- Reuse the calibration decisions after seven completed learning activities.
- Compare the learner only with their own earlier baseline.
- Show overall and goal-area change, including neutral or declining results.
- Keep a bounded local snapshot history and make the next checkpoint timing
  transparent.

## Slice 5 — Content and UX quality

- Keep setup optional, skippable, and completable in under one minute without
  the skill check.
- Keep every setup, question, result, and progress state readable on an iPhone
  SE and at larger system text sizes.
- Complete English, Simplified Chinese, and Traditional Chinese copy.
- Audit goal coverage, answer uniqueness, checkpoint math, persistence
  migration, and recommendation fallbacks with deterministic tests.

## Slice 6 — Device and release hardening

- Validate onboarding, Home, Learn, calibration, and checkpoint flows on the
  smallest supported iPhone simulator.
- Recheck landscape table transitions and modal safe areas.
- Complete type, automated, localization, production export, and mobile secret
  gates.

## Deferred

- User-facing accounts and cross-device history sync
- Friends, realtime tables, public leaderboards, and social sharing
- Nine-player tables and additional poker variants
- Push reminders
- Solver ratings or solver-perfect placement claims
- Broad curriculum expansion unless the Phase 8 quality audit finds a concrete
  coverage gap

## Phase acceptance

- A fresh learner can accept a balanced plan or choose a goal in under one
  minute.
- Calibration answers create routing evidence without completing curriculum.
- Home and Learn agree on the same goal-aware next action.
- Reviews, recurring table leaks, and resumable work still outrank new content.
- A checkpoint becomes due after seven later learning activities and reports
  honest change from the preceding snapshot.
- Resetting learning data also removes the local goal and skill snapshots.
- English, Simplified Chinese, Traditional Chinese, small-phone UX, and the full
  release gate pass.

## Completion evidence

- Goal setup, local persistence/reset, calibration scoring, specialist routing,
  balanced weak-area routing, review precedence, checkpoint timing, and bounded
  history are covered by deterministic tests.
- All Phase 8 copy is complete in English, Simplified Chinese, and Traditional
  Chinese, including every calibration prompt and choice.
- The complete setup, ten-decision check, result, Home direction, and Learn
  progress-card flow was exercised on the RiverMind iPhone SE simulator.
- Goal setup and guided-flow controls were retested with accessibility-scale
  Dynamic Type; dense guided copy scales to a usable ceiling while all content
  remains scrollable.
- TypeScript, 789 automated tests, Expo dependency/config checks, iOS and Android
  production exports, and the mobile-secret scan passed on August 11, 2026.
