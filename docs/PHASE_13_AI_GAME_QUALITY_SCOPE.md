# Phase 13 — Intentional AI & Game Quality

## Outcome

Make every AI table feel deliberate, readable, and appropriately challenging
without manufacturing action. Players should understand the challenge they
selected, receive a meaningful opening decision in short modes, and face AI
whose betting patterns become more coherent as difficulty rises.

## Product principles

- Poker-correct folds stay legal. RiverMind does not force calls, rig cards, or
  expose hidden information to keep a hand alive.
- Mode design guarantees player agency where a single short hand would feel
  abrupt: Quick Play is a two-hand orbit and Daily Challenge opens with the
  player on the button.
- Difficulty changes decision quality, range discipline, and pressure—not
  access to private cards or random advantages.
- Multiple legal bet sizes are one strategic action family. Offering two raise
  buttons must not make an AI twice as likely to raise.
- Shared-board hands are evaluated relative to the board and field equity; the
  AI does not claim personal value from a straight or flush already on board.
- Presentation speed is a user-facing pacing preference, separate from AI
  strength.

## Included

### 1. Meaningful mode openings

- Quick Play always deals the player's button first, then the AI's button.
- A first-hand fold or bust cannot skip the reserved second hand of the Quick
  Play orbit.
- Daily Challenge remains deterministic for a date and version, but starts the
  first hand with the player on the button so the challenge cannot end before
  the player receives an opening decision.
- Daily v2 results are stored independently from older same-date deals; only
  the current gameplay version can mark today's challenge complete or extend
  today's streak.
- Completed Quick Play, Daily, practice, and tournament tables keep direct
  next/play-again actions introduced in Phase 12.

### 2. Mode-owned challenge settings

- Quick Play uses a clearly disclosed fixed Club challenge and remains one tap.
- Custom tables expose Friendly, Club, and Sharp as an accessible radio choice.
- Sit & Go keeps its own selected difficulty in its checkpoint; resuming it
  never changes the user's preference for another mode.
- Daily Challenge discloses its fixed Club field.
- Championship displays its authored mixed-difficulty lineup.
- Private-table hosts select one disclosed AI difficulty for all AI and
  takeover seats; guests see that difficulty and the turn timer before readying.
- Table speed affects presentation pacing in both heads-up and multiway games;
  it does not silently alter strategy strength.

### 3. Strategy correctness

- Normalize alternate bet and raise sizes before strategy-family weighting.
- Apply personality raise sizing relative to the balanced sizing baseline only
  once.
- Compare a player's best hand with the board-only hand before labeling value,
  and require sufficient equity before aggressive value lines.
- In private tables, pass the complete AI identity map into equity modeling;
  missing identities in an explicit map represent human opponents, not
  synthetic Friendly bots.

### 4. Evaluation and regression gates

- Track per-street checks, calls, folds, raises, decisions, player-decision
  opportunities, and action-count duration proxies.
- Preserve deterministic aggression ordering across Friendly, Club, and Sharp.
- Preserve distinct Patient, Sticky, and Pressure postflop identities.
- Measure Quick Play player-decision opportunities and multi-date Daily opening
  behavior rather than treating every short preflop hand as a defect.
- Exclude local Codex worktrees and generated caches from Vitest discovery so
  evaluation reports only the active source tree.

## Deferred

- Solver-backed or claimed GTO play
- Personalized opponent models across app launches
- Exposing internal hand ranges, equity, or AI reasoning during live play
- Per-seat private-table difficulty controls
- Public ratings, ranked matchmaking, or adaptive monetized difficulty
- Gameplay sound effects

## Acceptance criteria

- Quick Play covers both button positions and always gives the player a
  decision opportunity across the reserved orbit, including a hand-one bust.
- Daily Challenge has an immediate player decision on the first hand for a
  multi-date deterministic corpus.
- Daily results, personal bests, and attempt counts remain isolated by owner,
  UTC date, and gameplay version in both local and hosted persistence.
- Fixed and selectable challenge levels are visible before play and do not leak
  state between Quick, Custom, Sit & Go, Daily, Championship, or Private modes.
- Locked-board straights/flushes and other board-only value spots do not produce
  irrational premium-value aggression.
- Adding a second legal raise size does not inflate the aggregate probability
  of choosing the raise action family.
- Private AI models every configured AI identity and treats unlisted opponents
  as humans.
- Full typecheck, focused AI evaluations, complete unit suite, localization,
  iPhone SE, and iPad checks pass with no hidden-card or fairness regression.
