# PR 26 — adaptive opponent memory QA

## Scope

PR 26 completes the Phase 2 opponent layer with a device-local read shared by heads-up and multiway practice. It observes only the hero's public action type, street, wager context, and seat-position bucket after a completed hand. It never stores cards, the board, the undealt deck, or a full hand state in the opponent profile.

The read tracks voluntary preflop participation, preflop raises, fold/call/raise responses to pressure, postflop aggression, and play by position. Bayesian-style priors, a 20-hand confidence ramp, an 80-hand effective recent window, and strict parameter caps keep the adjustment gradual and reversible as the player's style changes.

## Automated evidence

- Empty memory produces the exact neutral strategy parameters.
- Two repeated folds remain labeled **Learning** and move bluff frequency by less than three percent.
- Established fold and call patterns produce different readable labels and the intended narrow decision windows.
- A later change in style replaces an old read instead of being buried under unlimited lifetime counts.
- Heads-up and multiway observation payloads serialize without cards, board, ranks, suits, or deck fields.
- Changing another seat's hidden cards still cannot change a seeded multiway decision.
- Repeatable 60-hand heads-up and 40-hand multiway corpora complete without illegal actions or chip errors; aggregate aggression remains within eight percentage points of the corresponding baseline.

## iPhone simulator pass

Tested in the Expo development bundle on the iOS 27 RiverMind iPhone SE simulator in light mode.

| Flow | Result |
| --- | --- |
| Profile with no history | Shows a compact **Still learning your game** card with unavailable rates represented as dashes. |
| Heads-up Quick Play | Completed a preflop fold hand; table, coach, result, and session flow remained usable. Shared memory advanced from 0 to 1 hand. |
| 3-player Club table | Hero folded preflop; both AI seats continued through a legal showdown with private-card handling intact. Shared memory advanced from 1 to 2 hands. |
| Cross-mode memory | Profile showed the combined two-hand read and raw observed rates after returning from multiway play. |
| Reset UX | **Reset read** is visible inside the Profile card and opens a destructive confirmation explaining that hands and lessons remain saved. The destructive confirmation was not executed during QA. |
| Compact coach sheet | Initial pass found that adding the read overflowed the non-scrollable heads-up insight sheet. The sheet now has a bounded scroll area; header and close control remain fixed. |
| Multiway coach sheet | Opponent read appears below the live recommendation and preserves the existing public-information fairness explanation. |

## Product boundary

This is a bounded exploitative layer, not a solver or a claim of professional-level play. Friendly uses 35% of the learned adjustment, Club 70%, and Sharp 100%; the maximum full-confidence change remains tightly capped around each identity's normal strategy. OpenAI is not called for opponent memory or live decisions, and the profile is not synced to Supabase.
