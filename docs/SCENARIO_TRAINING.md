# RiverMind scenario training

## Product goal

Scenario Training bridges short lessons and free play. A session presents six realistic heads-up decisions with enough table context to reason about the play, then explains the choice immediately. It is available from Learn and Play without creating another primary tab.

## Phase 1 session

The fixed session covers:

1. Button value raising with A-J suited.
2. Big-blind defense against a large open.
3. Calling with a nut-flush draw at the correct price.
4. Choosing a practical turn value-bet size.
5. Folding a bluff catcher when estimated equity is below the river price.
6. Declining a low-fold-equity missed-draw bluff.

Each spot displays the street, effective stack, pot, positions, hero cards, board, and opponent action. No result card is dealt because RiverMind grades the decision process rather than the outcome.

## Feedback and scoring

Every choice is classified as:

- **Best baseline** — full credit and the preferred Phase 1 teaching line.
- **Reasonable mix** — half credit when a stronger strategy may mix the action but it requires assumptions beyond the stated baseline.
- **Better line available** — no credit, with a direct explanation of the missing price, value target, blocker, or fold-equity logic.

The explanation names why the selected action works or fails, the reasoning behind the preferred line, and one transferable takeaway. Best score and attempt count use the same offline-first, owner-scoped progress service as the existing trainers.

## Boundaries

- The spots teach a practical beginner baseline, not solver-perfect frequencies.
- Pot-odds statements explicitly state the final-pot denominator.
- Mixed actions are acknowledged only when the spot supports them.
- Content is deterministic and available without OpenAI or network access.
- A later version can add stack-depth variants, randomized ranges, expected-value comparisons, and scenarios generated from recurring hand-review mistakes.
