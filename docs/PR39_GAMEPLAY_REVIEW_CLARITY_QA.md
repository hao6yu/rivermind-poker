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

## Correctness and cost boundaries

- The action trail is derived only from public action history.
- The final verdict reuses the deterministic local decision grader and does not call OpenAI.
- Reopening the summary, hand review, history, or replay does not consume coaching quota.
- Opponent hole cards remain hidden until a valid showdown and do not influence the live coach or the session score.

## Automated validation

| Check | Result |
| --- | --- |
| TypeScript | `pnpm typecheck` passed |
| Full suite | 37 files, 210 tests passed |
| Action comprehension | Current-street actions retain correct chronological labels, including opening bets versus raises |
| AI pacing | Every generated delay remains within 1,000–1,350 ms |
| Replay | Start step, action ordering, focus mapping, hidden cards, final stacks, and progressive all-in runouts covered |
| Whole-run verdict | Empty, strong, mixed, and review outcomes remain deterministic from aggregate decision totals |

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

### Remaining scope

No rules-engine, privacy, quota, or TypeScript blocker remains. Build 5 testers should specifically exercise long six-player hands and completed tournament summaries before Build 6 so copy density can be tuned from real-device feedback.
