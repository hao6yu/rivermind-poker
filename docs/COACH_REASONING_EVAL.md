# Coach reasoning evaluation

Date: 2026-07-31

## Decision

Keep `gpt-5.6-terra` at `medium` reasoning for the current coaching route.

`low` is not a worthwhile production trade at this stage. It reduced median
latency by only 171 ms and did not improve average latency. More importantly,
the manual poker audit found four material errors at `low`, compared with two at
`medium`.

Neither setting should be the source of truth for arithmetic or hand
classification. RiverMind should calculate pot odds, draw outs, made-hand rank,
and legal actions deterministically, then give those verified facts to the model
for strategic explanation.

## Method

- Model: `gpt-5.6-terra`
- Endpoint: OpenAI Responses API through the authenticated Supabase
  `poker-coach` Edge Function
- Comparison: identical model, prompt, JSON schema, timeout, authentication,
  hand order, and output limit
- Treatment: only `reasoning.effort` changed (`medium` versus `low`)
- Corpus: 24 synthetic hands: 6 preflop, 7 flop, 5 turn, and 6 river
- Contexts: heads-up, 6-max, 9-handed, cash, tournament, clear decisions,
  nuanced lines, drawing math, large river bets, and result-bias traps
- Execution: one excluded warmup, then 24 sequential recorded calls per effort
- Quality checks: structured-output validity, strategic decision, required
  concepts, pot-odds math, outcome bias, and use of only supplied facts

This is a directional product evaluation, not a latency benchmark with repeated
trials. Each hand was sampled once per effort, so network and service variance
remain visible in the results.

## Results

| Metric | Medium | Low | Difference |
| --- | ---: | ---: | ---: |
| Successful calls | 24/24 | 24/24 | Tie |
| Valid structured reviews | 24/24 | 24/24 | Tie |
| Heuristic rubric | 136/144 | 135/144 | Medium +1 |
| Manual material errors | 2 | 4 | Medium better |
| Average latency | 5,849 ms | 5,856 ms | Low 7 ms slower |
| Median latency | 5,414 ms | 5,243 ms | Low 171 ms faster |
| P90 latency | 8,086 ms | 7,083 ms | Low 1,003 ms faster |
| Maximum latency | 10,172 ms | 12,612 ms | Low 2,440 ms slower |
| Faster paired calls | 9/24 | 15/24 | Low +6 hands |
| Total tokens | 13,983 | 13,865 | Low 118 fewer (0.8%) |
| Output tokens | 7,986 | 7,868 | Low 118 fewer (1.5%) |
| Reported reasoning tokens | 801 | 1,089 | Low used 288 more in this run |

The latency data is noisy: `low` won more individual pairs and had a better P90,
but two outliers erased the average advantage. The token difference was too
small to drive the product decision.

## Manual quality audit

### Material medium issues

1. **R02, river bluff-catch:** calculated an 80 call into a 120 pot as requiring
   40% equity. The correct threshold is 80 / (120 + 80 + 80) = 28.6%.
2. **T04, pot-sized turn bet:** calculated the 33.3% price correctly but called
   the draw defensible based on implied value without a supplied opponent read.
   Folding is the stronger default from the given facts.

Medium also called a 300-into-100 river bet “four times the pot” in R06, although
its exact 42.9% call threshold and fold recommendation were correct. This is a
minor terminology error rather than a changed decision.

### Material low issues

1. **T03, small turn bet:** used an incorrect denominator and reported 14%
   instead of the correct 16.7% call threshold.
2. **T04, pot-sized turn bet:** reported a 25% call threshold instead of 33.3%.
3. **R01, nut straight:** described 9-7 and 9-8 as lower straights on an
   8-7-6-2-K board. Neither hand is a straight.
4. **R06, triple-pot river shove:** listed a flush among hands beating pocket
   fours on a board with only two spades. No flush is possible.

Low made the correct high-level action recommendation in those hands, but the
incorrect teaching details are unacceptable for a learning product.

### Heuristic-score caveats

The automated rubric intentionally flags suspicious answers for human review;
it is not treated as ground truth. Examples from this run:

- Low P04 was flagged for not putting the preflop fold in `bestDecision`, but it
  correctly explained that fold in `keyConcept`.
- Both F07 answers focused on correctly folding to the check-raise, while the
  fixture also expected discussion of checking back the original weak top pair.
- Low R05 triggered a forbidden `nut flush` phrase only because it correctly
  said `non-nut flush`.
- T02 showed that the original expected action was too strict: both efforts
  gave a defensible high-level check-back analysis with the ace-of-spades blocker.

Manual review therefore overrules raw pattern counts.

## Current usage inventory

| Site | Endpoint | Role | Prompt | Effective reasoning |
| --- | --- | --- | --- | --- |
| `supabase/functions/poker-coach/index.ts` | Responses API | Latency-sensitive, user-visible hand coach | RiverMind hand-review instructions plus strict JSON schema | Hosted secret, default `medium` |

No other OpenAI model usage was found in the active application path.

## Target mapping

- Keep `gpt-5.6-terra`: it is the balanced intelligence/cost tier and matches a
  user-visible coaching request.
- Keep `medium` reasoning: the measured quality advantage matters more than the
  negligible average-latency difference.
- Do not move this route to Sol yet: the current comparison does not establish
  that a flagship-tier latency and cost increase is needed.
- Do not move to Luna: coaching is not merely extraction, routing, or bulk
  classification.

This follows current [OpenAI GPT-5.6 model guidance](https://developers.openai.com/api/docs/guides/model-guidance?model=gpt-5.6),
which recommends Terra for balanced performance and `medium` as the balanced
starting effort, followed by representative evaluation of one lower setting.

## Changes made

- Added a strict `OPENAI_REASONING_EFFORT` allowlist for `low` and `medium`.
- Included the effective reasoning value and detailed token usage in the
  function response for observability.
- Added a reusable 24-hand corpus and hosted evaluation runner.
- Kept raw evaluation output out of Git in `.eval-results/`.
- Set the production and local-example default back to `medium` after the audit.

## Compatibility checks

- Responses API: unchanged and appropriate for reasoning plus structured output.
- Structured output: 48/48 recorded calls satisfied the strict schema.
- Authentication: unchanged; anonymous Supabase users call the JWT-protected
  Edge Function, which keeps the OpenAI key off the device.
- Secrets: reasoning effort is a hosted environment secret and can be changed
  without exposing it to Expo. Supabase documents that production function
  secrets become available without a redeploy.
- State replay: not applicable; each hand review is a stateless `store: false`
  request.
- Tools, caching, multimodal input, and long context: not used on this route.
- Mixed-model routing: not used; `OPENAI_MODEL` remains one explicit model.

## Prompt changes

None. Preserving the prompt was required for a valid effort-only comparison.

The measured math and classification failures justify a later architecture
change, not an eval-time prompt rewrite: compute verified poker facts in code and
add them to the model input.

## Validation

```text
node --check scripts/coach-eval-hands.mjs
node --check scripts/evaluate-coach.mjs
pnpm typecheck
pnpm eval:coach --effort=medium
pnpm eval:coach --effort=low
```

Both live batches completed 24/24 authenticated calls. The evaluator confirmed
the expected hosted effort before each batch and saved the full reviews and usage
locally for pairwise inspection.

## Unchanged sites

- Mobile coach request and UI contract
- Supabase anonymous authentication flow
- Strict review schema and all five user-visible review fields
- Prompt wording, timeout, output cap, `store: false`, and safety identifier
- Poker engine and game UI

## Remaining work

1. Add deterministic hand ranking, outs, pot odds, stack-to-pot ratio, and legal
   action facts to the coach request.
2. Make the model explain verified facts instead of recomputing them.
3. Turn the six arithmetic/result-bias hands into permanent regression tests.
4. Repeat the targeted failures three to five times after that change to measure
   reliability, not just one-sample quality.
