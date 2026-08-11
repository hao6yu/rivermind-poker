# Phase 4 — Adaptive Learning & Progress

## Goal

Turn RiverMind's curriculum and mistake review into a learning loop that chooses the right next action, spaces recall over time, and makes improvement visible without making the Learn screen feel heavier.

## Slice 1 — Adaptive mastery foundation

- Estimate mastery for Fundamentals, Preflop, and Postflop from curriculum completion, practice scores, and due review spots.
- Show a compact weekly learning pulse and expandable chapter detail on the Learn screen.
- Route due review decisions directly from the mastery card.
- Space missed decisions across future days instead of removing them after one correct answer.
- Retire a review item after three successful recalls.
- Migrate existing on-device review queues without losing saved decisions.

## Slice 2 — Durable learning rhythm

- Keep an on-device session history for lessons, practice, missions, and spaced reviews.
- Show a seven-day activity trend without making the collapsed mastery card taller.
- Calculate current and longest learning streaks from calendar-day activity.
- Show rolling review accuracy and compare activity with the prior seven days.
- Remove learning history alongside progress when the user resets saved history.

## Slice 3 — Concept-level recommendations

- Group learning evidence into explainable concepts such as table math, preflop pressure, and postflop odds.
- Prioritize due spaced reviews before adding new material.
- Revisit an attempted concept when its best practice score is below 70%.
- Continue the curriculum when attempted concepts are on track.
- Explain the recommendation directly on the primary learning card.

## Next slices

1. Sync review scheduling and mastery history across devices.
2. Add opt-in reminders only after the review rhythm is validated with beta users.

## UX constraints

- Keep the phone layout useful at 375-point width and iPhone SE height.
- Keep mastery estimates explainable; do not present them as solver accuracy.
- Never place more than three decisions in one daily review session.
- Scheduled items should not encourage immediate repetition.

## Acceptance checks

- Existing queues load with a due-now schedule.
- Incorrect recall returns the item the next day.
- The first correct recall returns the item after one day; the second after three days; the third retires it.
- The adaptive progress card remains compact when collapsed and fully readable when expanded.
- English, Simplified Chinese, and Traditional Chinese remain complete.
- Learning activity survives an app restart and powers the rolling seven-day chart.
- A streak remains active through the day after the learner's most recent session.
- The primary recommendation opens the exact review, practice pack, or curriculum step described on its card.
