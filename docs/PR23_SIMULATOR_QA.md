# PR 23 simulator QA

## Scope and environment

This pass validates the complete PR 23 journey before merge, including the existing heads-up path affected by the shared history and replay changes.

- Date: August 1, 2026
- Runtime: Node 22.19.0, Expo SDK 54, Xcode 27 Device Hub
- iPhone 17 Pro simulator: dark appearance, standard text size
- RiverMind iPhone SE simulator: light appearance, compact height
- Accessibility stress pass: iPhone SE with extra-extra-large system text and increased contrast
- Backend: linked RiverMind Poker Supabase project using anonymous beta authentication

## Journeys exercised

- Open Play, enter Custom AI Game, switch among 2-, 3-, and 6-player tables, change the hand target, and start each supported table size.
- Complete a 2-player hand through showdown and open its saved replay.
- Complete a 3-player hand through all four streets and showdown; inspect results, payouts, session history, and replay progression.
- Complete 6-player hands with folds, calls, a legal preflop raise, postflop checks, a river call, and showdowns on both iPhone sizes.
- Verify only live showdown opponents reveal cards; folded opponents stay face-down in gameplay, persistence, feedback, and replay.
- Open and dismiss coach details, bet sizing, result details, session results, replay, history, feedback, and unfinished-hand confirmation.
- Confirm outside-tap dismissal and explicit close controls on sheets.
- Confirm completed-hand Back returns to setup and an unfinished-hand Back requires confirmation.
- Open Profile hand history containing both heads-up and multiway records, then dispatch each record to the correct replay UI.
- Restart under larger system text and increased contrast, then recheck Home, Play, Custom AI Game, the compact table, and coach details.
- Inspect Metro output throughout the sessions; no runtime exception or React warning was produced.

## Findings resolved in this PR

| ID | Finding | Resolution | Retest |
| --- | --- | --- | --- |
| QA-23-01 | Custom Game placed **Start game** below the viewport on iPhone 17 Pro and compact heights. The old scroll-only layout left only a thin accent edge visible. | Moved the primary action and setup summary into a persistent bottom action bar; options remain independently scrollable. | Passed on iPhone 17 Pro, iPhone SE, and extra-extra-large text. |
| QA-23-02 | A saved 6-player replay used a horizontal opponent strip. June was clipped and Sol was initially off-screen, making complete table state depend on discovering a swipe. | Replaced the strip with a flexible five-seat row that keeps every opponent visible at once. | Passed in dark mode on iPhone 17 Pro and light mode on iPhone SE. |
| QA-23-03 | One transient render could retain “AI is thinking” after action had already returned to the hero, while hero controls were active. | Display the thinking state only when the tracked AI is still the engine's current actor. | Passed across subsequent compact-table street transitions. |
| QA-23-04 | The first postflop wager could be described as “raises to” even when no prior bet existed. | Distinguish an opening postflop bet from a raise over earlier aggression and cover both labels with a deterministic test. | Passed targeted unit test and simulator action copy review. |

## Persistence and privacy evidence

A completed simulator hand synced to Supabase as `multiway`. A read-only verification confirmed:

- persisted deck length: 0;
- persisted hero cards: 2;
- maximum persisted cards for folded opponents: 0;
- owner-scoped row-level security remains enabled;
- the tracked `heads_up`/`multiway` session-mode constraint is live.

## Result

No known PR 23 gameplay or layout blocker remains after the fixes and repeated simulator sessions. Private friend tables, tournaments, and server-generated multiway post-hand reviews remain intentionally hidden or out of scope for Build 4; they are product milestones rather than simulator defects.
