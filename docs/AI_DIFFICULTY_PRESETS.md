# RiverMind AI difficulty presets

## Goal

Friendly, Club, and Sharp must create understandable strategy differences without giving the opponent hidden information, illegal actions, or arbitrary chip advantages. Each preset uses the same public game state and deterministic poker engine.

## Strategy profiles

| Behavior | Friendly | Club | Sharp |
| --- | --- | --- | --- |
| Equity samples per decision | 116 | 252 | 480 |
| Defense | Wider, more forgiving calls | Balanced price discipline | Tighter break-even discipline |
| Value aggression | Higher threshold, lower frequency | Balanced baseline | Thinner value, higher frequency |
| Bluff pressure | Rare and smaller | Mixed, texture-aware | More frequent and better sized |
| Thin pressure | 8% mix | 22% mix | 34% mix |
| Typical value size | 58–72% pot | 66–82% pot | 72–90% pot |
| Typical bluff size | About 48% pot | About 55% pot | About 62% pot |

These values are strategy parameters, not claims of solver accuracy. All three public profiles remain beatable baseline opponents.

## Earned Championship tiers

Elite and Nemesis are not exposed in Custom AI Game. They are earned opponents used by the final Championship stops:

| Tier | Heads-up samples | Multiway samples | Main distinction |
| --- | ---: | ---: | --- |
| Elite | 720 | 420 | Solver-informed combo ranges, action-EV selection, disciplined defense, and stronger bounded reads |
| Nemesis | 1,000 | 560 | Maximum production precision, deeper adaptation, and a lower-error EV-weighted mixed strategy |

The hidden invitation gives all five opponents 1.5× their normal equity-search depth. It still uses only the acting seat's cards and public information.

## Championship progression

| Event | Opponent lineup | Starting stack | Blind level | Target |
| --- | --- | ---: | ---: | --- |
| Local Tables | 1 Friendly + 1 Club | 60 BB | 4 hands | Top 2 |
| City Circuit | 1 Club + 1 Sharp | 60 BB | 4 hands | Top 2 |
| National Tour | 2 Club + 3 Sharp | 60 BB | 4 hands | Top 3 |
| Masters Division | 2 Sharp + 3 Elite | 75 BB | 5 hands | Top 2 |
| RiverMind Final | 5 Elite | 80 BB | 6 hands | Win |
| The River Below | 4 Elite + 1 Nemesis | 100 BB | 7 hands | Win |

The River Below is absent from the map until the player wins the RiverMind Final. It is intentionally outside the normal 5/5 completion count, then remains replayable once revealed. The checkpoint format remains backward compatible with legacy Masters and Final structures, independent of the beta reset described below.

For the beta release that introduces mixed lineups and the Elite/Nemesis engine, a one-time device-local migration clears only existing Championship progress and its saved run. It writes a migration receipt before the player begins again, so new progress is not reset on later launches or future builds. Practice history, lessons, Daily Challenge progress, and opponent learning are untouched.

## Repeatable behavior benchmark

`pnpm eval:ai` runs the same 40 seeded, varied hands for each profile against a neutral scripted player. The fixed benchmark currently produces:

| Profile | AI decisions | Raise rate | Bluff rate | Fold rate facing a bet | Average raise / pot |
| --- | ---: | ---: | ---: | ---: | ---: |
| Friendly | 151 | 24.5% | 0.0% | 20.0% | 73.8% |
| Club | 142 | 41.5% | 2.1% | 27.3% | 73.6% |
| Sharp | 147 | 55.8% | 8.2% | 22.2% | 78.8% |

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

Production decision depth is 84 samples for Friendly, 168 for Club, 280 for Sharp, 420 for Elite, and 560 for Nemesis. `pnpm eval:multiway-ai` uses a smaller fixed sampling depth to run seeded 3-player and 6-player hands for every difficulty. The public-preset portion of the benchmark produces:

| Difficulty | Players | AI decisions | Raise rate | Bluff rate | Fold rate facing a bet | Showdown rate |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Friendly | 3 | 122 | 10.7% | 0.0% | 38.9% | 70% |
| Friendly | 6 | 235 | 14.0% | 0.0% | 53.8% | 90% |
| Club | 3 | 105 | 22.9% | 1.0% | 47.2% | 55% |
| Club | 6 | 199 | 22.1% | 3.0% | 59.0% | 65% |
| Sharp | 3 | 108 | 38.0% | 9.3% | 43.9% | 50% |
| Sharp | 6 | 185 | 26.5% | 3.8% | 56.7% | 65% |

Multiway pressure intentionally falls as more opponents remain: value thresholds adapt to the field, but bluff opportunities become rarer. Position, players behind, stack-to-pot ratio, public range strength, and board pressure all affect the chosen action and legal size.

Elite and Nemesis add two advanced layers. Preflop decisions target weighted 1,326-combination opening, continuing, and re-raising ranges that vary by position, open size, opener position, callers, effective stack, and tournament risk. Postflop candidates are compared by bounded immediate action EV using estimated range equity, pot odds, fold equity, opponents remaining, position, public range strength, and tournament risk. Multiple legal bet sizes are normalized as one strategic family so simply offering more raise sizes does not accidentally make raising more frequent. This is solver-informed rather than a claim of full-game GTO solution.

A separate all-AI benchmark guards table dynamics that a scripted hero could hide. Across 200 six-player hands per difficulty, Friendly, Club, Sharp, Elite, and Nemesis reached showdown in 58%, 28.5%, 22.5%, 22.5%, and 19% of hands; blind walks remained between 3.5% and 9.5%. A targeted 400-hand-per-profile small-blind steal corpus also requires every profile to defend at least 48% against a 2.5 BB open. The current rates are 55% Friendly, 52.75% Club/Sharp, 64% Elite, and 64.5% Nemesis, with stronger tiers shifting more of that defense into 3-bets.

## Adaptive opponent memory

Heads-up and multiway opponents share one device-local read of the player's public choices. RiverMind records only aggregate voluntary-preflop, preflop-raise, fold/call/raise-when-facing-pressure, postflop-aggression, and position counts after a completed hand. Cards, the undealt deck, and full hand state never enter this profile.

Bayesian-style priors and a 20-hand confidence ramp prevent a few early actions from creating a strong label. Friendly applies 35% of the available adjustment, Club 70%, Sharp 100%, Elite 115%, and Nemesis 130%. Even at full confidence, bluff and pressure frequencies, value thresholds, call tolerance, and sizing remain tightly capped around each identity's baseline. The current read and aggregate rates are visible to the player and can be reset from Profile.

Championship tables use this bounded public-action memory, so a player who repeatedly opens small cannot replay the same unchallenged steal indefinitely. Daily Challenge keeps memory disabled because its seeded decisions are intentionally identical for every player.

## Product behavior

- Custom AI Game offers a single three-option selector with a one-line explanation.
- Quick Play uses the most recently selected preset for the current app session and defaults to Club.
- The active preset is visible in the table header.
- Completed sessions persist the selected preset in `practice_sessions.ai_difficulty`.

## Tournament calibration

`pnpm eval:championship-ai` runs the production tournament flow and decision policy at reduced equity-sampling depth, with fixed seeds, mixed per-seat tiers, real blind progression, elimination, public-action adaptation, and chip conservation. In the current 80-run corpus, a Sharp AI used as a repeatable competent proxy won 21.25% of RiverMind Finals and 12.5% of hidden invitations.

The same harness runs five independent scripted styles that do not call the production AI action selector. In the current 20-run-per-cell smoke corpus, a representative repeated-steal pattern—a 2.5 BB open every third hand when unopened—won 0% of Finals and invitations. TAG won 10% and 0%; calling station 5% and 5%; maniac 5% and 10%; shove bot 0% and 0%. These are small samples intended to detect glaring exploits, not precise win-rate estimates.

This harness is a regression and calibration tool, not an Elo model. The invitation is mechanically harder—deeper search, four Elite seats, one Nemesis, 100 BB stacks, and slower blinds—but larger independent-policy corpora and human beta data are still required before claiming it will hold strong poker players to a specific win rate.

## Next evaluation step

Before calling Elite or Nemesis expert-grade, expand each style corpus to thousands of runs, add at least one independently implemented range/rollout policy, report confidence intervals, and run structured beta sessions with strong human players. A future version can add multi-street rollout or offline CFR-derived policy tables behind the same user-facing event design.
