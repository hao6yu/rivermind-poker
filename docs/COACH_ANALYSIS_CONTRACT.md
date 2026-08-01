# Coach analysis contract

RiverMind separates poker facts from coaching language. The deterministic analyzer is authoritative for cards, rules, legal actions, and arithmetic; the language model turns those verified facts into a useful explanation.

## Data flow

1. The poker engine records an immutable snapshot immediately before each hero action.
2. The snapshot preserves the board, pot, current wager, both stacks, street contributions, amount to call, and exact legal raise bounds.
3. When a hand ends, the app sends the hero cards, final board, any opponent cards revealed at showdown, and the hero's decision snapshots. It never sends the remaining deck or unrevealed opponent cards.
4. The Supabase Edge Function validates the payload, card uniqueness, board progression, chip arithmetic, call amounts, and legal-action structure.
5. The Edge Function recomputes `verifiedAnalysis` using the same deterministic TypeScript analyzer as the app. Raw client-supplied conclusions are never passed through as facts.
6. The language model receives the verified analysis and returns a strict coaching review. Alongside the explanation, it must classify the hand as `strong`, `close`, or `mistake`, select a one-based focus decision (or `0`), and choose one bounded practice area. The grade evaluates decision quality, never the hand result.
7. The Edge Function validates that review, returns the same verified analysis beside it, and the mobile client accepts it only when both `analysisVersion: 1` and `source: deterministic-poker-engine` are present.
8. Coach Details renders the returned server facts for every hero decision: pot odds, unique draw outs, next-card completion chance, SPR, made hand, chosen action, and legal alternatives with sizing bounds.
9. The table session stores completed hands in memory, aggregates reviewed grades and focus areas, and builds replay steps directly from the immutable engine snapshots. Leaving the table ends this session; durable cross-session history is a later storage milestone.

## Verified facts

For the completed hand, the analyzer establishes:

- Hero and revealed-opponent made hands.
- Board pairing, suit concentration, connectedness, and which made-hand categories are possible for any two-card holding.
- Exhaustive opponent made-hand categories on the final board.
- Straight, flush, and backdoor draws, including overlap-free completion outs and next-card/by-river probabilities.
- Category-improvement outs, which are intentionally separate from claims about winning the pot.

For every hero decision, it establishes:

- Pot before the action, amount to call, pot after calling, effective stack, and SPR.
- Required equity using `call amount / final contestable pot`.
- Whether a fold, check, call, bet, or raise was legal and the permitted sizing bounds.
- Any unmatched portion of an all-in overbet. Uncallable chips are excluded from the contestable pot and therefore from pot-odds arithmetic.

Outs are not automatically clean, category improvement does not guarantee winning, and strategy still depends on opponent ranges and frequencies. The model must preserve those qualifications.

## Trust boundary

In the solo learning app, hand state originates on the player's device. The Edge Function recomputes all derived poker facts, so the model cannot invent or override them, but this is not tamper-proof competitive game state.

Private friend games should move dealing, actions, clocks, and settlements to a server-authoritative hand service. The deterministic analyzer can then consume that trusted server state without changing the coaching contract.

## Verification

Automated tests cover malformed and duplicate cards, board progression, immutable pre-action snapshots, impossible river categories, overlapping combo-draw outs, pot-odds formulas, unmatched all-in overbets, legal-action bounds, showdown visibility, compact request payloads, replay chip movement, fold privacy, structured grades, and recurring-focus aggregation.

The hosted regression corpus also exercises representative draw, river, value-raise, bluff-catcher, and result-bias cases against the deployed Edge Function. Every response must include the versioned deterministic analysis payload before it is scored or shown in the app.
