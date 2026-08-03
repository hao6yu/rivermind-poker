# RiverMind scenario training

## Product goal

Scenario Training bridges short lessons and free play. A general session presents six realistic decisions with enough table context to reason about the play, then explains every alternative immediately. A session-learning recommendation instead opens a five-spot pack matching the player's reviewed weakness. Both paths live inside the existing Learn experience without creating another primary tab.

## Generated session

The general trainer samples six distinct decision types from fourteen validated templates:

1. Button value raising with a strong starting hand.
2. Big-blind defense against a large open.
3. Calling a nut-flush draw at the correct price.
4. Choosing a practical turn value-bet size.
5. Folding a bluff catcher below the river price.
6. Declining a low-fold-equity missed-draw bluff.
7. Protecting medium-strength showdown value with a positional check.
8. Isolating a limper with a strong hand and position.
9. Four-betting a premium hand against a normal three-bet.
10. Folding a weak disconnected hand from early position.
11. Choosing a small river size for thin value.
12. Sizing a semi-bluff without over-risking the draw.
13. Calling a correctly priced turn straight draw.
14. Folding an overpriced turn flush draw.

Targeted recommendations select five validated spots from one durable pack:

- **Preflop decisions** — opens, blind defense, isolation, early-position discipline, and responding to pressure.
- **Purposeful betting** — value, bluff, check, and sizing decisions.
- **Calls, draws, and odds** — call prices, bluff catching, and correctly or incorrectly priced draws.

The seven local coach focus labels map to exactly one of these packs. The generic trainer and each focused pack keep independent best scores and attempt counts.

Templates generate new suits, card ranks within the taught hand class, stack depths, pot sizes, bet sizes, positions, choice order, and session order. Call-price scenarios recompute the final pot and required equity from the generated amount. Randomization changes the problem while preserving the poker fact being taught; it never places new cards over a fixed answer.

Each spot displays the street, effective stack, pot, positions, hero cards, board, and prior action. No result card is dealt because RiverMind grades the decision process rather than the outcome.

## Validation

The deterministic test suite exercises 100 generated sessions and verifies:

- no visible card appears twice;
- the board contains the correct number of cards for its street;
- a session does not repeat a decision type;
- every spot has exactly one preferred baseline;
- every alternative includes feedback;
- required call equity equals call amount divided by the generated final pot; and
- each template produces meaningfully different card snapshots across seeds.

The generator accepts an explicit random source for repeatable tests. The app uses the same cryptographically secure random source as live dealing whenever the modal opens or the player taps **Practice again**. Cards are randomized inside validated hand classes so a fresh deal cannot silently invalidate the taught answer.

## Feedback and scoring

Every choice is classified as:

- **Best baseline** — full credit and the preferred beginner teaching line.
- **Playable alternative** — half credit when a stronger strategy may mix the action but it requires assumptions beyond the stated baseline.
- **Usually avoid** — no credit, with a direct explanation of the missing price, value target, blocker, or fold-equity logic.

Every alternative becomes reviewable after answering. Generated call-price spots also display the verified call amount, final pot, required equity, and supplied equity estimate. A focused result names up to three concepts to review and offers an immediate same-pack replay with a fresh deal. Best score and attempt count use the existing offline-first, owner-scoped progress service.

## Boundaries

- The spots teach a practical beginner baseline, not solver-perfect frequencies.
- Pot-odds statements explicitly use the final-pot denominator.
- Mixed actions are acknowledged only when the spot supports them.
- Generation and grading are deterministic and work without OpenAI or network access.
- Future versions can add expected-value comparisons and adaptive weighting within each pack.
