# RiverMind Poker — Phase 3.5 scope

## Product outcome

Phase 3.5 proves that RiverMind helps a player improve. It expands the beginner
path into a structured curriculum, connects each concept to randomized practice
and live-table missions, and shows progress by decision quality rather than chip
results.

The phase also treats small-phone table readability as learning infrastructure.
A player cannot apply a lesson if a six-player decision is difficult to follow.

## Learning loop

Every taught concept follows the same loop:

1. Learn one practical idea in three to six minutes.
2. Work through card examples and common mistakes.
3. Answer randomized decisions with immediate explanation.
4. Apply the concept in a short AI-table mission.
5. Complete a mastery check.
6. Revisit the concept later when evidence shows it is fading or still weak.

## Curriculum tracks

### Preflop strategy

- Opening ranges by position and table size
- Playing after one or more limpers
- Fold, call, three-bet, and four-bet decisions
- Blind defense and blind-versus-blind play
- Stack-depth adjustments

### Postflop foundations

- Board texture and range advantage
- Continuation betting and checking back
- Draws, made hands, and equity realization
- Turn planning
- River value betting and bluff catching

### Poker math and purposeful sizing

- Clean and discounted outs
- Pot odds and required equity
- Implied and reverse implied odds
- Break-even bluff percentages
- Choosing small, medium, and large bet sizes for a reason

### Tournament decisions

- Stack-depth zones
- Open-shoving and calling all-ins
- Re-shoving
- Bubble pressure
- Introductory risk premium and ICM concepts

### Opponent reads and adjustments

- Recognizing patient, balanced, sticky, pressure, and deceptive styles
- Punishing excessive folding or calling
- Responding to aggression
- Separating a real tendency from a small sample

## Content release 1 — preflop decisions

The first implementation slice adds:

- Four concise lessons: opening by position, playing over limpers, facing a
  raise, and blind defense.
- At least twenty randomized scenario templates split across heads-up,
  three-player, and six-player contexts.
- Two focused practice packs: **Enter the pot** and **Respond to pressure**.
- Two five-hand table missions that grade only the tagged preflop decisions.
- One mixed mastery check that retests the four concepts without identifying
  the lesson before the player answers.

This slice is first because preflop decisions occur in every hand, the engine
already records them reliably, and the current recommendation system already
recognizes preflop as a focus area.

## Content metadata

New content should declare enough stable metadata for recommendation and
measurement:

- concept and curriculum track
- beginner, intermediate, or advanced difficulty
- prerequisite concepts
- table sizes and stack depths
- applicable streets and positions
- estimated duration
- learning objective and mastery threshold

Copy remains localized in English, Simplified Chinese, and Traditional Chinese.
Cards, correct answers, and numeric explanations remain shared deterministic
content rather than separately translated strategy logic.

## Skill Profile

The Profile experience should report evidence for each concept:

- decisions observed
- recent Strong, Close, and Focus-spot rates
- trend: improving, steady, or needs practice
- confidence based on sample size
- last practice date
- one recommended next activity

The product must not describe a concept as mastered from one correct answer or
infer skill from chips won.

## Today's session

Home composes one five-to-ten-minute session from:

- a concept refresh when needed;
- three to five targeted scenarios;
- an optional short table mission; and
- a closing progress summary.

The player sees what the session will practice and its estimated time before
starting, but does not need to choose among every available tool.

## Acceptance criteria

- A new player can move from a lesson into matching scenarios and a table
  mission without searching the Learn library.
- Every scored decision maps to a visible concept and an explanation.
- Repeating a pack creates fresh valid cards and action contexts.
- The Skill Profile distinguishes insufficient evidence from a genuine leak.
- Home recommendations change when recent decision evidence changes.
- Curriculum progress remains local-first and synchronizes with owner-scoped
  persistence.
- English and both Chinese variants pass localization-completion tests.
- Six-player application missions remain readable on the smallest supported
  phone layouts.

## Deferred

- Nine-player tables
- Public leaderboards
- Realtime friend tables
- Solver-perfect or professional-level claims
- Monetization gates around unvalidated learning content
