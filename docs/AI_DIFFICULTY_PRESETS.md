# RiverMind AI difficulty presets

## Goal

Friendly, Club, and Sharp must create understandable strategy differences without giving the opponent hidden information, illegal actions, or arbitrary chip advantages. Each preset uses the same public game state and deterministic poker engine.

## Strategy profiles

| Behavior | Friendly | Club | Sharp |
| --- | --- | --- | --- |
| Equity samples per decision | 100 | 220 | 420 |
| Defense | Wider, more forgiving calls | Balanced price discipline | Tighter break-even discipline |
| Value aggression | Higher threshold, lower frequency | Balanced baseline | Thinner value, higher frequency |
| Bluff pressure | Rare and smaller | Mixed, texture-aware | More frequent and better sized |
| Thin pressure | 8% mix | 22% mix | 34% mix |
| Typical value size | 58–72% pot | 66–82% pot | 72–90% pot |
| Typical bluff size | About 48% pot | About 55% pot | About 62% pot |

These values are strategy parameters, not claims of solver accuracy. All three profiles remain beatable baseline opponents.

## Repeatable behavior benchmark

`pnpm eval:ai` runs the same 40 seeded, varied hands for each profile against a neutral scripted player. The fixed benchmark currently produces:

| Profile | AI decisions | Raise rate | Bluff rate | Fold rate facing a bet | Average raise / pot |
| --- | ---: | ---: | ---: | ---: | ---: |
| Friendly | 179 | 12.3% | 0.6% | 5.4% | 74.3% |
| Club | 174 | 35.1% | 4.0% | 6.8% | 78.6% |
| Sharp | 170 | 42.4% | 7.6% | 11.3% | 82.5% |

The regression also verifies that all 120 hands finish, every selected action is legal, and total chips remain conserved. The rates measure distinct behavior; they do not establish win rate or an Elo rating.

## Multiway opponent layer

Three- through six-player tables keep the Friendly, Club, and Sharp table difficulty while giving every seat a stable identity:

| Opponent | Style | Recognizable behavior |
| --- | --- | --- |
| Mara | Balanced | Mixes value, control, and selective pressure |
| Theo | Patient | Enters fewer pots and raises a stronger range |
| Nova | Pressure | Plays more hands and attacks capped ranges |
| June | Sticky | Calls wider and bluffs less often |
| Sol | Deceptive | Mixes delayed aggression and occasional traps |

The multiway estimator uses only the acting player's cards plus public board, action, position, stack, and wager information. It samples a separate live range for every non-folded opponent. Another seat's actual hidden cards and the undealt deck are never inputs, and a regression proves that changing those hidden cards cannot change the decision.

Production decision depth is 72 samples for Friendly, 144 for Club, and 240 for Sharp. `pnpm eval:multiway-ai` uses a smaller fixed sampling depth to run 20 seeded 3-player hands and 20 seeded 6-player hands for every difficulty. The current 120-hand benchmark produces:

| Difficulty | Players | AI decisions | Raise rate | Bluff rate | Fold rate facing a bet | Showdown rate |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Friendly | 3 | 156 | 8.3% | 1.3% | 30.9% | 85% |
| Friendly | 6 | 294 | 5.8% | 0.7% | 39.9% | 100% |
| Club | 3 | 149 | 10.7% | 2.0% | 32.8% | 85% |
| Club | 6 | 242 | 8.7% | 1.2% | 50.8% | 100% |
| Sharp | 3 | 129 | 14.0% | 1.6% | 45.1% | 65% |
| Sharp | 6 | 222 | 12.2% | 0.9% | 56.3% | 90% |

Multiway pressure intentionally falls as more opponents remain: value thresholds adapt to the field, but bluff opportunities become rarer. Position, players behind, stack-to-pot ratio, public range strength, and board pressure all affect the chosen action and legal size.

## Adaptive opponent memory

Heads-up and multiway opponents share one device-local read of the player's public choices. RiverMind records only aggregate voluntary-preflop, preflop-raise, fold/call/raise-when-facing-pressure, postflop-aggression, and position counts after a completed hand. Cards, the undealt deck, and full hand state never enter this profile.

Bayesian-style priors and a 20-hand confidence ramp prevent a few early actions from creating a strong label. Friendly applies 35% of the available adjustment, Club 70%, and Sharp 100%. Even at full confidence, bluff and pressure frequencies, value thresholds, call tolerance, and sizing remain tightly capped around each identity's baseline. The current read and aggregate rates are visible to the player and can be reset from Profile.

## Product behavior

- Custom AI Game offers a single three-option selector with a one-line explanation.
- Quick Play uses the most recently selected preset for the current app session and defaults to Club.
- The active preset is visible in the table header.
- Completed sessions persist the selected preset in `practice_sessions.ai_difficulty`.

## Next evaluation step

Before beta, each profile should play a larger fixed corpus against multiple scripted styles. We should compare decision legality, chip conservation, aggression by street, fold-to-bet rate, showdown rate, and win rate with confidence intervals. A stronger future strategy can replace the internals without changing the three user-facing difficulty names.
