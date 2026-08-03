# PR 36 — Session Learning Loop QA

Date: August 2, 2026

## Outcome

PR 36 turns PR 35's per-hand decision grades into a useful learning loop across completed sessions. RiverMind now summarizes every compatible heads-up and 3–6 player decision locally, identifies a repeated weakness only when it appears across separate hands, and sends the player to one existing targeted drill.

The loop is free and deterministic. Building or reopening a session recommendation never calls OpenAI and does not require a Supabase write. AI remains an optional explanation layer inside an individual hand review.

## Product changes

- Added decision-level session totals for graded decisions, strong choices, close spots, and mistakes.
- Ranked weaknesses by the number of distinct hands affected before severity, avoiding a noisy one-hand recommendation.
- Distinguished an early signal from a repeated pattern. Two review spots in one unusual hand do not count as a recurring leak.
- Mapped preflop and bet-sizing issues to Scenario Training, pot-odds and draw issues to Percentage Training, and value, bluff, or calling issues to the Hand Quiz.
- Added one compact **Next best practice** card to heads-up results, multi-player results, saved hand history, and Progress.
- Updated the main Learn recommendation from locally graded saved hands, including multi-player hands and hands without an AI review.
- Updated saved hand rows to show their local grade and focus consistently across table sizes.
- Preserved older saved hands without decision snapshots: they remain replayable and display **Ungraded** instead of an invented result.
- Made the multi-player session summary scroll while keeping **Play again** and **Change setup** visible on compact iPhones.

## Recommendation rules

1. Only **Close** and **Review** decisions can create a learning focus.
2. Strong decisions contribute to the strong-choice rate but never create a false leak.
3. A focus repeated across more completed hands outranks a more severe one-off spot.
4. Severity and relative strategy gap break ties between equally recurring areas.
5. A pattern is labeled **Repeated** only after it appears in at least two distinct hands.

These rules grade the decision process rather than the hand result. Winning a pot cannot turn a poor line into a strong decision, and losing cannot turn a sound fold into a mistake.

## Privacy and cost boundary

Session learning consumes the public-information `HandDecisionReport` created by the local grader. It receives no additional cards or engine state and never reads opponent hole cards or the undealt deck. Changing opponent holdings while public state is fixed produces the same hand report and therefore the same session recommendation.

No new database column, migration, API endpoint, or AI request was added. Recommendations are derived from already saved, redacted hand records. This also lets a recommendation appear immediately at session end, before network synchronization finishes.

## Automated validation

| Check | Result |
| --- | --- |
| Release gate | `pnpm release:check` passed |
| TypeScript | `pnpm typecheck` passed |
| Full suite | 35 files, 201 tests passed |
| Production bundles | iOS and Android exports passed |
| Secret scan | Tracked source and both mobile exports passed |
| Empty and legacy history | Safe zero-decision summary; old heads-up and multiway hands remain replayable |
| Recurrence | A focus across two hands is repeated; two spots in one hand are not |
| Noise control | A recurring close pattern outranks a single severe outlier |
| Varied sessions | 24 seeded heads-up, 3-player, and 6-player hands aggregate into bounded session metrics |
| Hidden-card fairness | Opponent-card changes cannot affect input hand reports or the aggregate recommendation |

## iPhone simulator validation

Device: RiverMind iPhone SE, iOS 27.0, Expo development session in Xcode Device Hub.

### Journeys covered

- Played a complete five-decision heads-up hand. The result sheet showed an early preflop review spot immediately and routed **Practice this spot** to Scenario Training.
- Returned to Learn and verified Scenario Training became the single recommended next activity.
- Loaded 17 saved heads-up and multi-player hands. History summarized 28 local decisions, showed the repeated preflop pattern across six hands, and displayed local Strong/Focus pills on both table formats.
- Opened Progress and verified the same totals, pattern wording, and targeted Practice action without triggering an AI request.
- Played a three-player hand through autonomous opponent action after the hero folded. Folding 8♠4♠ against a raise was graded as a strong baseline decision despite losing chips.
- Opened the three-player results sheet on the compact screen, verified the learning card and opponent read, and confirmed the result content scrolls while the two main actions remain visible.

### UI checks

- No clipped titles, metric values, recommendation copy, or Practice actions in light mode.
- Early and repeated pattern labels are visually distinct without adding another dashboard or tab.
- Primary session actions remain reachable above the safe area on the iPhone SE.
- Saved history can still replay ungraded legacy hands and every locally graded hand.

No unresolved correctness, privacy, cost, or compact-layout issue was found in this pass.
