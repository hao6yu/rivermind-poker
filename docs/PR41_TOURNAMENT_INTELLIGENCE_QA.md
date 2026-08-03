# PR #41 — Tournament intelligence QA

## Scope

This change gives the existing legal poker engine a tournament-specific decision layer. It does not change dealing, betting legality, side pots, blind rotation, or showdown settlement.

## Decision behavior

- At 10 BB or less, tournament preflop decisions use explicit position-aware push-or-fold ranges.
- A recommended shove always resolves to the actor's legal maximum contribution; identity sizing cannot accidentally shrink an all-in.
- From 11–15 BB, premium hands and strong pairs can re-shove over an open instead of using a deep-stack 3-bet size.
- Championship qualification bubbles add a small, bounded risk premium to marginal calls.
- Chip leaders and the shortest stack receive a smaller bubble premium than middle stacks: leaders can apply pressure and the shortest stack cannot wait indefinitely.
- Postflop bubble pressure changes the same shared plan used by local AI, live Coach, and post-hand grading.

## Accuracy boundary

The bubble adjustment is intentionally described as **ICM-lite**, not solver ICM. It reads only public stacks, live-player count, blind size, and the event's qualification place. It never reads another player's cards, the undealt deck, future cards, or an eventual tournament result.

Winner-take-all Sit & Go and Daily Challenge games do not invent a qualification bubble. They still receive short-stack push-or-fold behavior. Championship events use their actual top-N qualification target.

## Automated checks

- Public stack rank produces bounded and explainable qualification-bubble premiums.
- A playable 8 BB button hand shoves; a weak hand folds.
- A strong 12 BB hand re-shoves over a raise.
- Marginal postflop calls become more conservative on a real qualification bubble.
- Production multiway AI reaches the all-in target and exposes a beginner-readable pressure label.
- Live Coach recommends the same exact all-in amount and explains the push-or-fold zone.
- Full deterministic 3- and 6-player tournament tests run through the tournament-aware AI path.

## Shuffle relationship

Tournament intelligence does not touch card generation. Every new hand still creates a fresh standard deck, shuffles a copy with Fisher–Yates, deals without replacement, and burns before flop, turn, and river. Normal production games use `expo-crypto`; deterministic seeded randomness remains limited to repeatable tests and the intentionally repeatable Daily Challenge.
