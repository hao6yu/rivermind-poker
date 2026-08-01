# RiverMind Poker product framework

## Product idea

RiverMind Poker is a Texas Hold'em learning game where players improve through short lessons, realistic hands against adaptive AI opponents, and a championship journey. It teaches decision-making without turning the table into a statistics dashboard.

The name combines the river—the final community card and a high-pressure decision point—with the strategic mind required to read ranges, manage risk, bluff, and learn from every hand.

## Product principles

1. **Play first, explain on demand.** The table shows only information needed for the current decision. Deeper analysis opens in a coach sheet or post-hand review.
2. **Teach through decisions.** Lessons lead into playable scenarios rather than long articles.
3. **AI opponents feel like players.** Opponents have coherent ranges, styles, memory, timing, and mixed-frequency bluffs; difficulty must not be simulated by making illegal or irrational plays.
4. **Progress is visible.** Players can see concepts mastered, recurring leaks, tournament results, and the next recommended activity.
5. **No real-money wagering.** Chips, trophies, rankings, and rewards are virtual learning-game systems.

## Visual direction

RiverMind should feel like a modern learning and decision-making product, not a traditional casino game.

- Use a light mist background, crisp ink text, and white or near-black surfaces
- Use indigo for primary actions and aqua for learning progress and coach states
- Keep borders thin, shadows soft, typography spacious, and iconography minimal
- Avoid gold-heavy palettes, wood rails, green felt textures, ornamental badges, and casino-style visual noise
- Render the poker table as a clean midnight surface that keeps cards and decisions visually dominant
- Support light and dark appearance without changing the meaning of colors
- Reserve strong color for the current action, selected state, progress, and feedback

## Primary navigation

The app uses three bottom-level destinations. Profile and settings open from the avatar in the top-right corner instead of occupying a permanent tab.

```text
Home
├── Start today's session
├── Quick Play
└── Championship progress

Learn
├── Beginner path
├── Core concepts
├── Cheat sheets
├── Percentage trainer
├── Strategy lessons
├── Hand quizzes
└── Glossary

Play
├── Quick Play
├── Custom AI game
├── Scenario training
├── Sit & Go
├── Daily tournament
├── RiverMind Championship
└── Hand replay

Profile
├── Skill profile
├── Hand history
├── Achievements
├── Statistics and leaks
└── Settings
```

### Why all gameplay is under Play

Practice, casual AI games, and competitive events all lead to the same core interaction: playing poker. Separate Play and Compete tabs make users decide how the product is organized before they can begin. Play therefore contains quick practice, configurable AI games, tournaments, and the Championship. The selected game and coach settings determine whether the session is instructional or competitive.

### Why Profile is not a tab

Profile, history, statistics, and settings are useful but not primary reasons to open the app. They remain available from the avatar without competing with Learn and Play for attention.

## Play modes

### Quick Play

Launches a useful scenario immediately using the player's current learning level. Good for sessions lasting one or two minutes.

### Custom AI game

A configurable virtual-chip table against AI players.

| Setting | Initial choices |
| --- | --- |
| Total players | 2 (heads-up), 3, 6, or 9 |
| Session | One hand, 5 hands, 10 hands, or open-ended |
| Starting stack | 40 BB, 100 BB, or 200 BB |
| Opponent level | Friendly, Club, or Sharp |
| Opponent mix | Balanced, aggressive, tight, loose, or varied table |
| Coach | Guided, on request, after each hand, or off |

“Total players” includes the human player. A six-player table therefore contains the user and five AI opponents.

### Scenario practice

Focused drills such as pre-flop ranges, blind defense, continuation betting, bluff catching, value betting, short-stack decisions, and final-table pressure.

## Learn tools

### Cheat sheets

Fast, searchable references that can be saved for offline use:

- Hand rankings and tie breakers
- Table positions and action order
- Starting-hand ranges by position and table size
- Common bet sizes and what they accomplish
- Outs-to-equity approximations
- Pot-odds and required-equity reference
- Tournament stack sizes and common adjustments

Cheat sheets are available from Learn and from a small reference button during guided play. Opening one should pause the training hand rather than cover active controls.

### Percentage trainer

Short calculation drills that teach the numbers behind a decision:

- Count clean and discounted outs
- Estimate flop-to-turn and flop-to-river equity
- Calculate pot odds and required call equity
- Compare estimated equity with the break-even percentage
- Learn value-to-bluff ratios for common bet sizes
- Practice tournament stack percentages and big-blind conversions

Each drill follows **estimate → answer → explanation → playable example**. The goal is fast mental approximations at the table, not calculator-level precision.

## Table experience

The table is a focused gameplay screen, not the app's home screen.

Always visible:

- Community cards, pot, stacks, positions, and current bet
- The player's cards
- Legal actions and bet sizing
- A small coach button when coaching is enabled

Hidden until requested:

- Equity and pot-odds breakdown
- Range visualization
- Opponent explanation
- Full action log
- AI coaching response

Action controls remain anchored at the bottom so they never scroll away. Post-hand analysis opens as a separate review sheet with replay controls.

## Coaching modes

| Mode | Behavior |
| --- | --- |
| Guided | Offers a hint before the decision and explains the result afterward |
| On request | Shows no unsolicited information; the player taps **Ask Coach** |
| After hand | Keeps play clean and automatically reviews important decisions afterward |
| Off | Pure play with analysis available later from hand history |

The coach should distinguish between a reasonable alternative and a clear mistake. It should explain ranges, expected value, and exploitative considerations without pretending there is always one perfect action.

During AI-table practice, coaching is a live in-game toggle. Turning it on automatically shows a compact insight whenever it is the player's decision. The compact card gives the key percentage and a one-line interpretation; tapping **Details** opens the full reasoning, pot price, equity margin, and assumptions without crowding the table. Turning coaching off immediately hides these insights without discarding completed hand reviews. Competitive events can lock coaching off so every entrant plays under the same conditions.

## Competitive play

### Sit & Go

Single-table tournaments with 3, 6, or 9 total players. These are the shortest bridge from practice to competition.

### Daily tournament

A shared seeded event so every player faces comparable cards and AI conditions. Results can be compared without requiring live multiplayer in the first release.

### RiverMind Championship

An original fictional poker tour made of events, divisions, trophies, and a season leaderboard. It should evoke a prestigious poker circuit without using the name, branding, or visual identity of an existing tournament organization.

Possible progression:

1. Local Tables
2. City Circuit
3. National Tour
4. Masters Division
5. RiverMind Championship Final

## Home screen priority

The home screen answers one question first: **what should I do now?**

It presents one dominant **Start today's session** action chosen from the player's current learning goal. A smaller **Quick Play** action starts a recommended AI game immediately. Championship progress is visible but secondary.

The user should never need to choose between a lesson, percentage drill, scenario, or game before starting. The recommendation system makes that choice and clearly labels what will happen and approximately how long it will take.

## Delivery sequence

### Phase 1: Solo learning beta (complete)

- Create the three-destination navigation and avatar profile access
- Build a calm home screen and Play setup flow
- Redesign the heads-up table with anchored actions and an on-demand coach
- Add a proper Supabase configuration state instead of exposing a proxy error
- Beginner learning path
- Scenario drills
- Post-hand review and hand history
- Skill progress and leak tracking

### Phase 2: Multiway AI

- Generalize the engine from heads-up to one-human, multiple-AI seats — complete
- Add local 3-player and 6-player AI tables with no pass-and-play mode — complete
- Add opponent identities, playing styles, and adaptive memory — complete
- Add 9-player tables after performance and strategy validation

### Phase 3: Competition

- Resumable 3-player Sit & Go tournament — complete
- 6- and 9-player Sit & Go tournaments after strategy and performance validation
- UTC Daily Challenge with comparable three-player deals, fixed Club AI, locked coaching, personal bests, and streaks — complete
- Validated global rankings after server-authoritative play and anti-tamper controls
- RiverMind Championship progression
- Rankings and achievements

### Phase 4: Friends

- Private tables
- Invitations and presence
- Realtime game synchronization
- Friendly leagues and shared tournament results

## Decisions already made

- Product name: **RiverMind Poker**
- Client: React Native with Expo
- Primary navigation: **Home, Learn, Play**
- Profile and settings open from the avatar
- Practice, AI play, tournaments, and the Championship are combined under **Play**
- AI tables support selectable player counts
- Coaching can be toggled during practice and is locked off for competitive events
- OpenAI coaching is accessed through a Supabase server-side proxy
- The product does not support real-money wagering
