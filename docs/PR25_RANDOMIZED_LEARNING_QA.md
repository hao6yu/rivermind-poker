# PR 25 — Randomized learning simulator QA

## Goal

Make RiverMind's learning surfaces useful on repeat visits: fresh but mathematically valid scenarios, faster Home entry points, and visual card references that remain readable in both appearance modes.

## Automated validation

The scenario suite generates 100 complete sessions and verifies card uniqueness, street board lengths, distinct decision types, exactly one preferred baseline, complete alternative feedback, and call-price arithmetic. A wider seeded sample also proves every template changes its card snapshot and produces meaningfully different sessions.

Content guards verify that:

- every fundamentals lesson contains at least one two-card visual example;
- no lesson or trainer example repeats a visible card;
- all nine final hand categories have a sample combination and approximate probability; and
- probability wording explicitly refers to random seven-card final hands.

## iPhone SE simulator journeys

| Journey | What was exercised | Result |
| --- | --- | --- |
| Home | Progress-aware recommendation, learning path, Quick Play, Scenario drill, and Hand rankings quick links | Pass |
| Continue learning | Home recommendation opens the recommended lesson or trainer directly | Pass |
| Hand rankings | Direct Home launch, category percentages, suit-aware example combinations, fixed footer, back navigation | Pass |
| Fundamentals lesson | Hole cards and board cards render inside the lesson without colliding with the fixed completion footer | Pass |
| Hand quiz | Card-based question shows real cards while all choices and the anchored next action remain usable | Pass |
| Scenario session | Fresh deal label, randomized cards, randomized choice order, new pot/stack/action values, answer review, next spot | Pass |
| Appearance | Home and hand-ranking examples in light and dark modes; system preference restored after testing | Pass |

## Finding resolved during the pass

The original scenario table height pushed every answer below the fold on a short phone. PR 25 now uses mini cards and a shorter table only below the compact-height breakpoint. The prompt and first answer are visible immediately on iPhone SE, while taller phones retain the roomier table.

## Probability wording

Hand-ranking percentages describe the category of the best five-card hand formed from seven random cards by the river. They do not describe the probability of improving from a specific starting hand and do not estimate the probability of winning against an opponent.

## Boundaries

Generated spots remain curated beginner baselines, not solver output. Randomization is local and does not consume an OpenAI request. Adaptive selection based on recurring player mistakes and expected-value comparisons remain future milestones.
