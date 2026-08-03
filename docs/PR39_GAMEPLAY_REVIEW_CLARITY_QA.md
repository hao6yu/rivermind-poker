# PR 39 — Gameplay and Review Clarity QA

Date: August 3, 2026

## Outcome

PR 39 makes a six-player hand understandable while it is happening and makes the end of a run describe the whole run. It fixes the center-table collision reported from Build 5, preserves readable community cards, keeps recent actions visible, and separates a final-hand coaching spot from the tournament summary.

## Reported issues and resolutions

| Finding | Resolution |
| --- | --- |
| The two middle opponent seats could cover the community cards and current-action panel. | Six-player phone tables now use a dedicated dense layout: narrower opponent seats, middle seats below the protected center lane, and an independently sized center panel. |
| Shrinking the board avoided collisions but made the five community cards too difficult to read. | Community cards use the full compact card size on every phone in live play and replay. Seats move around the board; the board no longer gives up readability. |
| Several AI actions happened too quickly and only the latest action was easy to find. | The center panel retains the last three actions from the current street in chronological order, every seat retains its latest street action, and AI pacing is now 1.0–1.35 seconds. |
| Folded players became so dim that their final action was difficult to read. | Only their face-down cards are strongly muted. The player label, stack, role, and Folded action badge remain readable. |
| The completed-game path made a coach-selected hand look like the final tournament review. | Buttons now distinguish **Review final hand** from **Tournament summary**. The hand sheet labels its coach card as one key decision, while the summary grades all locally recorded decisions in the run. |
| The tournament result did not clearly say whether the player made good decisions overall. | The summary now shows a whole-run verdict, strong-choice rate, review-spot count, total decisions, and an explanation that placement also depends on the cards. |
| Replay opened around a selected coaching spot, making its late steps look disconnected. | **Compare every decision** now starts at cards dealt. Automatic all-in runouts add separate flop, turn, and river steps instead of one incorrect final river jump. |
| Home required scrolling and the featured learning card used a redundant button. | Home now fits its current content on one compact-iPhone screen. The whole learning card is tappable, its title and time share the top row, game shortcuts share one compact list, and both learning links remain above the tab bar. |
| Removing Home's button left button-sized empty space, while Learn and Play retained separate CTA patterns. | Home no longer inherits a featured-card minimum height. The recommended cards on Home, Learn, and Play are now compact whole-card actions with title, time or recommendation, and arrow aligned together; Play's full current menu also fits on the compact-iPhone screen. |
| Hand Rankings repeated “Strongest to weakest” above the ranking card. | The redundant introductory row is removed while the useful ranking-group label, examples, and approximate seven-card odds remain. |
| A valid preflop walk looked like every AI player had failed. | Walks are now detected explicitly. The table says that every other player folded before the flop, explains that the big blind wins without acting, and the result sheet identifies the 1.5 BB blind pot. A seeded 120-hand distribution check keeps six-player walks possible but uncommon. |
| UTG, HJ, and CO appeared without beginner explanations. | The in-game cheat sheet now defines every six-player position, including when each acts and why the position matters; it also explains that the small blind may fold and what a walk means. |
| Lower six-player seats felt too close to the table rail, and a long raise badge could truncate. | Lower seats are inset, their persistent labels are narrower, and seat badges use compact complete wording such as **Raise 2.3 BB** while the center feed retains full sentence wording. |

## Correctness and cost boundaries

- The action trail is derived only from public action history.
- The final verdict reuses the deterministic local decision grader and does not call OpenAI.
- Reopening the summary, hand review, history, or replay does not consume coaching quota.
- Opponent hole cards remain hidden until a valid showdown and do not influence the live coach or the session score.

## Automated validation

| Check | Result |
| --- | --- |
| TypeScript | `pnpm typecheck` passed |
| Full suite | 37 files, 212 tests passed |
| Action comprehension | Current-street actions retain correct chronological labels, including opening bets versus raises |
| AI pacing | Every generated delay remains within 1,000–1,350 ms |
| Replay | Start step, action ordering, focus mapping, hidden cards, final stacks, and progressive all-in runouts covered |
| Whole-run verdict | Empty, strong, mixed, and review outcomes remain deterministic from aggregate decision totals |
| Blind walk | Small-blind fold legality, correct big-blind winner, explanatory result copy, and seeded walk-frequency bounds covered |

## iPhone simulator validation

Device: RiverMind iPhone SE, iOS 27.0, Expo development session in Xcode Device Hub.

### Journey covered

- Resumed a saved six-player Sit & Go on Hand 2 in light mode.
- Followed consecutive preflop folds, a call, a raise, and a second call while one opponent was visibly thinking.
- Verified the table retained the earlier actions in the center trail while the newest action remained prominent.
- Verified each opponent retained a readable action badge and the acting player received a clear outline.
- Verified the middle-left and middle-right seats stayed outside the protected center lane on the compact-height device.
- The simulator pass exposed that the first collision fix made the community cards too small. The final implementation keeps all five board slots at 44×62 points in both live play and replay while retaining the corrected seat geometry.
- Verified the redesigned Home screen in light mode on the iPhone SE and dark mode on the iPhone 17 Pro. Every current Home shortcut is visible without scrolling, and the featured learning card follows the same whole-card tap behavior as the other shortcuts.
- Rechecked Home after removing its inherited minimum height: the former button-sized empty area is gone in both themes.
- Verified the compact Play screen shows Quick Play, Championship, Daily Challenge, both Sit & Go choices, Custom AI game, and Scenario training without scrolling on the iPhone SE.
- Verified Learn's recommended activity uses the same compact whole-card interaction and leaves the longer curriculum scrollable.
- Opened Hand Rankings on the iPhone SE and confirmed only one **Strongest to weakest** heading remains, with suit colors and odds intact.
- Opened a six-player iPhone 17 Pro table and confirmed the lower seats remain within the rail, outside the community-card and action lanes.

### Remaining scope

No rules-engine, privacy, quota, or TypeScript blocker remains. Build 5 testers should specifically exercise long six-player hands and completed tournament summaries before Build 6 so copy density can be tuned from real-device feedback.
