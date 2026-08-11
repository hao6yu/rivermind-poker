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

## Next slices

1. Record durable review-session history for richer weekly trends and streaks.
2. Use concept mastery—not only chapter order—to tune the primary next recommendation.
3. Sync review scheduling and mastery history across devices.
4. Add opt-in reminders only after the review rhythm is validated with beta users.

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
