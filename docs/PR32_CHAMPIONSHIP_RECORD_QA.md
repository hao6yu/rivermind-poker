# PR 32: Championship record and table refresh QA

## Product scope

PR 32 makes Championship progress feel rewarding without introducing a misleading global leaderboard. A new record screen presents six device-local achievements and a small set of understandable statistics derived from the results already saved by PR 31.

The record is available from both the Championship map and Profile. Opening it from the map returns to the map; opening it from Profile returns to Profile.

The same PR replaces the capsule-shaped midnight table with a flat deep-emerald rounded rectangle. Live heads-up and multiway tables plus both replay surfaces now share the calmer geometry. The color remains a simple gradient without casino-felt texture or ornamental rails.

## Data and fairness boundaries

- Achievement state is derived from saved Championship event results rather than stored separately, so badges cannot drift away from the record.
- Runs, cleared stops, best finish, and three- versus six-player experience are also derived from the same progress object.
- No global rank, winnings, prize, or cross-player comparison is implied.
- The record remains device-local and is removed by **Delete saved history**.
- No hole cards, undealt deck, action history, or opponent-memory data was added to Championship persistence.

## Achievement milestones

| Achievement | Unlock condition |
| --- | --- |
| First Shuffle | Complete one Championship run |
| On the Road | Qualify at one stop |
| Full Table | Complete one six-player Championship run |
| Back for More | Complete five Championship runs |
| Final Table Bound | Qualify through Masters Division |
| RiverMind Champion | Win the RiverMind Final |

## Automated validation

| Check | Result |
| --- | --- |
| Empty and partial records derive correct totals | Pass |
| Three- and six-player attempts remain separated | Pass |
| Badges unlock only at their exact milestones | Pass |
| Existing five-event progression and checkpoint privacy tests | Pass |
| TypeScript typecheck | Pass |
| Full Vitest suite: 31 files, 165 tests | Pass |

## iPhone simulator pass

Tested in light mode on **RiverMind iPhone SE, iOS 27.0** through Expo Go:

| Scenario | Result |
| --- | --- |
| Championship map exposes one clear **View record & achievements** action without crowding the event list | Pass |
| Empty record shows four understandable metrics, next goal, six locked badges, and table-experience totals | Pass |
| Record content scrolls cleanly to the final achievement and device-local privacy note | Pass |
| Record opened from Championship returns to the Championship map | Pass |
| Profile shows a Championship record row with `0/6 achievements unlocked` | Pass |
| Record opened from Profile returns to the same Profile scroll position | Pass |
| Saved Local Tables hand 2 resumes with coaching locked off | Pass |
| Folded hand reaches a complete showdown, then advances to hand 3 | Pass |
| Dealer, small blind, and big blind rotate visibly on hand 3 | Pass |
| Tapping outside the leave-table sheet dismisses it; confirmed leave returns to the map with hand 3 saved | Pass |
| Deep-emerald table and reduced corner radius preserve light-mode card, label, and action contrast | Pass |
| Heads-up, three-player, and six-player seats fit the new table geometry without clipping | Pass |
| Dark-mode heads-up table preserves card, status, coach, and action contrast | Pass |

The pass found one iOS-specific issue before publication: dismissing the Championship modal and presenting the record modal in the same state update could leave the user on Home. The record now renders inside the active Championship modal, while the Profile route uses the standalone record modal. Both return paths passed after the fix.

## Deferred intentionally

- Global rankings remain blocked on server-authoritative deals, result validation, and anti-tamper controls.
- Cross-device Championship sync remains separate from anonymous beta progress.
- Nine-player achievements wait for a validated nine-player engine and layout.
