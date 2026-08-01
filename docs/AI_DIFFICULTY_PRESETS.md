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

## Product behavior

- Custom AI Game offers a single three-option selector with a one-line explanation.
- Quick Play uses the most recently selected preset for the current app session and defaults to Club.
- The active preset is visible in the table header.
- Completed sessions persist the selected preset in `practice_sessions.ai_difficulty`.

## Next evaluation step

Before beta, each profile should play a larger fixed corpus against multiple scripted styles. We should compare decision legality, chip conservation, aggression by street, fold-to-bet rate, showdown rate, and win rate with confidence intervals. A stronger future strategy can replace the internals without changing the three user-facing difficulty names.
