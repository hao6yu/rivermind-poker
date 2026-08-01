# RiverMind Learn MVP

## Goal

The Learn tab should answer one question immediately: **what is the next useful thing I can do?** It should feel like a short guided path, not a library of poker terminology.

## Screen hierarchy

```text
Learn
├── Continue card (one primary action)
│   ├── recommended lesson or drill
│   ├── estimated time
│   └── path progress
├── Fundamentals (six short lessons)
├── Practice your decisions
│   ├── Percentage trainer
│   ├── Hand quiz
│   └── Scenario training
└── Quick reference
    ├── Hand rankings
    ├── Positions and action order
    ├── Common percentages
    └── Starter preflop chart
```

## Interaction rules

- The recommendation is the only full-width primary button on the main screen.
- Lessons open as focused reading sheets and end with **Mark complete**.
- Trainers follow **answer → explanation → next question → result**. An answer is never graded without explaining the poker math or decision.
- Scenarios show cards, board, pot, position, and prior action before asking for one decision. Feedback appears immediately, before the next spot.
- A strategically reasonable mixed action receives partial credit, while RiverMind still names one clear beginner baseline.
- Cheat sheets are reference material and do not create artificial completion work.
- Completed lessons and trainer scores update immediately on the device, then synchronize to Supabase.
- If Supabase is unavailable, all Learn content and progress remain usable; pending progress retries the next time Learn loads.

## Recommendation order

1. Continue the earliest unfinished fundamentals lesson.
2. Prefer a lesson related to a recurring reviewed-hand focus when that lesson is unfinished.
3. After the path is complete, recommend the lowest score across percentage training, the hand quiz, and scenario training.

This is intentionally transparent and deterministic for Phase 1. A future recommendation model can use richer practice history without changing the content IDs or progress schema.

## Content boundaries

- Strategy is a practical beginner baseline, not solver-perfect or universal.
- Percentages label approximations and state their assumptions.
- Hand quizzes use spots with a clear learning answer while acknowledging when strong players can mix actions.
- Scenario results are process-based and do not depend on the next card or whether the hand would have won.
- RiverMind grades the decision process, never whether the cards happened to win.
