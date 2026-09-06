# Beginner Tutorial Implementation Plan

Status: **Draft for product review — 2026-09-03**

This plan adds a short, fully offline beginner experience that teaches a new
player how a Texas Hold'em hand works before asking them to use RiverMind's
normal practice and learning features.

The working title is **Your first poker hand**. The experience should take
about five minutes for most people, but it must not display or enforce a timer.

---

## 1. Product decision

Build one deterministic, three-player tutorial hand with step-by-step guidance.
It is a teaching simulation, not a real game:

- no AI decisions or delays;
- no random cards;
- no internet requirement;
- no Supabase, Edge Function, OpenAI, or other backend call;
- no effect on hands played, wins, streaks, missions, learning progress, or
  other statistics; and
- no failure state or penalty for choosing the wrong action.

On a new installation, the existing welcome flow will ask whether the player
wants the beginner experience. The tutorial will also remain available from
Learn and Home, and the table help button will provide an always-available
plain-language reference.

### Backend impact

**None.** This feature must not add a database table, migration, RLS policy,
cron job, Edge Function, authentication dependency, or remote configuration.
All tutorial state is small, versioned, and stored on the device.

---

## 2. Goals

By the end of the tutorial, a new player should understand:

1. the table, pot, dealer button, small blind, and big blind;
2. that each player receives two private cards;
3. that up to five shared community cards arrive across the flop, turn, and
   river;
4. the meaning of fold, check, call, bet, and raise;
5. that the best five-card hand made from the available seven cards wins;
6. one simple strategy principle: strong starting cards can raise, draws are
   not made hands, price matters when calling, and strong made hands can bet
   for value; and
7. one approachable probability example stated in everyday language before
   showing the arithmetic.

The experience should make the rest of RiverMind feel easier to enter, not try
to teach all of poker.

### Non-goals

- No GTO, EV, ICM, SPR, range advantage, nut advantage, 3-bet/4-bet, solver
  output, or preflop chart memorization.
- No calibration quiz during or immediately after the beginner tutorial.
- No branching poker engine or replay system.
- No leaderboard, reward, achievement, daily requirement, or completion
  streak.
- No claim that a five-minute tour makes someone ready for real-money poker.

---

## 3. Entry and return flows

### New installation

Keep the current privacy and play-money disclosures in
`FirstRunOnboardingModal`. After those disclosures, offer three clear choices:

| Choice | Result |
| --- | --- |
| **Learn with a 5-minute hand** | Mark onboarding complete, set the local learning goal to `foundations`, and open the tutorial. Do not open calibration afterward. |
| **I know the basics** | Mark onboarding complete and continue to the existing learning-goal/setup flow. |
| **Maybe later** | Mark onboarding complete, skip the learning setup with its current local default, and open Home. The tutorial remains discoverable. |

The existing `rivermind.onboarding.v1` completion contract stays unchanged.
This prevents an app update from showing the first-install question again to
people who have already completed onboarding.

### Existing installations

Do not interrupt existing users with a new modal. Add these entry points:

- a beginner-first **Poker basics** row at the top of Home's Poker tools card;
- a prominent **Your first poker hand** item in Learn's Fundamentals chapter;
  and
- the existing help button on every table, with its guide reorganized so the
  basic terms appear before advanced references.

### Interrupted tutorial

- Save the current tutorial step locally after every completed step.
- If the player exits, show **Resume your first hand** at the same Home/Learn
  entry points.
- Offer **Resume** and **Start over** when they return.
- Exiting never counts as failure and never blocks normal app use.
- Completing the tutorial changes the entry label to **Replay your first
  hand**.

### Completion

The final screen should confirm the few concepts learned and offer:

1. **Continue with Poker basics** — open the existing Fundamentals learning
   chapter;
2. **Try a practice game** — open the normal local-play setup, not start a hand
   without confirmation; and
3. **Done for now** — return Home.

Do not automatically open the current skill calibration modal after tutorial
completion.

---

## 4. Tutorial storyboard

Use a three-player table because it makes Dealer, Small blind, and Big blind
visible without introducing six or nine positions. Durations below are pacing
estimates only; they must never appear as countdowns.

| Step | Table state and interaction | Teaching point | Approx. pace |
| --- | --- | --- | --- |
| 1. Welcome | Show the empty table and a single **Start** button. | “You will play one guided hand. Take as long as you like.” | 15 sec |
| 2. Seats and forced bets | Highlight Dealer, then Small blind, then Big blind. Show the pot receiving the blind chips. | The dealer button marks position; the blinds start the action and create a pot. Always show full names before `SB` and `BB`. | 35 sec |
| 3. Your cards | Deal the hero `A♥ Q♥`; keep opponents' cards face down. | Each player gets two private cards. Only the player can see their own. | 25 sec |
| 4. Before the flop | Guide the hero to raise; Small blind folds and Big blind calls. | Fold, call, and raise; suited high cards are a sensible strong starting hand. | 45 sec |
| 5. The flop | Reveal `J♥ 7♥ 2♣`. Big blind makes a small bet. | The flop is the first three shared cards. The hero does not yet have a flush, but one more heart will complete it. | 45 sec |
| 6. A simple decision | Let the player choose an action. Recommend call and explain the small price. | Nine unseen hearts can help. That is about 1 chance in 5 on the next card. An optional **Show the math** reveals `9 ÷ 47 ≈ 19%`. | 55 sec |
| 7. The turn | Reveal `4♠`; opponent checks; guide the hero to check. | The turn is the fourth shared card. A likely outcome is not a guarantee; taking a free card can be reasonable. | 35 sec |
| 8. The river | Reveal `K♥`; opponent checks; guide the hero to make a small value bet; opponent calls. | The river is the fifth and final shared card. The hero now has a strong made hand and can bet for value. | 45 sec |
| 9. Showdown | Reveal opponent `K♣ J♣`; animate or highlight each player's best five cards. | Hero's ace-high flush (`A♥ Q♥ K♥ J♥ 7♥`) beats the opponent's two pair, Kings and Jacks. Only the best five cards count. | 45 sec |
| 10. Recap | Show the concepts learned and the three completion destinations. | Reinforce the hand sequence and where to find help later. | 25 sec |

Expected total: about five minutes, entirely controlled by the player's taps.

Use this chip script so the authored hand and its “price matters” explanation
are concrete and testable:

- all players begin with 100 chips; Small blind posts 1 and Big blind posts 2;
- hero raises to 5, Small blind folds, and Big blind calls, making an 11-chip
  pot;
- on the flop, Big blind bets 2 and hero calls 2, making a 15-chip pot;
- both players check the turn; and
- on the river, hero bets 5 and Big blind calls, making the final pot 25.

The optional flop detail may explain that calling 2 to contest the 15-chip
final pot needs roughly 13%, while a heart on the next card is roughly 19%.
Keep that comparison behind **Show the math**; the main message remains “the
bet is small enough to continue with this strong draw.”

### Interaction rules

- Highlight the relevant seat, card, pot, or action together with explanatory
  text; never rely on color alone.
- When more than one legal action is shown, a non-recommended choice opens a
  short, supportive explanation and a **Try the recommended action** button.
  The authored story does not branch in the first version.
- The **Show the math** detail is optional. The plain-language explanation must
  be sufficient on its own.
- Allow Back/Exit at every step. Do not use an urgent confirmation or imply
  that progress will be lost.
- Disable unrelated table controls so the user always knows what can be tapped.

---

## 5. Content principles

The beginner experience is a separate copy tier from RiverMind's advanced
learning content.

- Introduce the plain-language meaning before an abbreviation:
  **Big blind (BB)**, not just **BB**.
- Introduce the everyday action before the strategic term.
- Use “about 1 in 5” before “19%”, and put the formula behind **Show the math**.
- Keep each coach message to one teaching point and roughly two short
  sentences.
- Use “usually”, “often”, or “in this example” when advice is contextual.
- Avoid language that implies guaranteed outcomes from probabilities.
- Explain that this is play-money practice and not gambling advice.
- Localize the teaching intent, not word-for-word English poker slang.

All new `tutorial.*` copy must ship in every currently supported locale:
English, Simplified Chinese, Traditional Chinese, Latin American Spanish, and
Brazilian Portuguese.

For Chinese copy in particular, prefer the full term first, for example
`大盲位（BB）`, and avoid introducing advanced terms such as `范围优势` or
`底池赔率` unless the player explicitly opens the optional math explanation.

---

## 6. Technical design

### 6.1 Scripted domain model

Add `src/domain/tutorial/beginnerTutorial.ts` containing:

- stable step IDs and the ordered tutorial definition;
- the fixed seats, cards, blinds, pot changes, and opponent actions;
- allowed and recommended player actions for each interactive step;
- a small pure reducer that advances, retries, restarts, and completes the
  tutorial; and
- selectors for the visible table state and highlighted teaching target.

The UI must derive the table from the current step. Do not save a copy of the
deck, chip stacks, or action history in storage.

Use the existing evaluator only to validate the authored showdown and hand
labels. Do not connect the tutorial to the real game loop in `engine.ts` or to
the AI policy.

### 6.2 Local persistence

Add `src/services/beginnerTutorial.ts` with a versioned storage key:

```ts
type BeginnerTutorialProgressV1 =
  | {
      version: 1;
      status: 'in-progress';
      stepId: BeginnerTutorialStepId;
    }
  | {
      version: 1;
      status: 'completed';
      completedAt: string;
    }
  | {
      version: 1;
      status: 'dismissed';
    };
```

Missing data means never started. Invalid, partial, or future-version data must
fail safely to never started. Storage errors must never stop the user entering
the app.

Clear this state with the existing local reset/account-deletion flow so the
next person using the device receives a clean first-run experience.

### 6.3 Dedicated UI feature

Create a focused `src/features/tutorial/` feature, expected to include:

- `BeginnerTutorialScreen.tsx` — full-screen coordinator;
- `TutorialTable.tsx` — simplified three-seat table;
- `TutorialCoachCard.tsx` — one teaching point and the active CTA;
- `TutorialActionBar.tsx` — only the actions relevant to the current step; and
- `TutorialCompletion.tsx` — recap and destinations.

Reuse the existing theme, `PlayingCard`, shared button patterns, safe-area
handling, and reduced-motion behavior. Do not embed tutorial branches inside
`PokerTableScreen` or `MultiwayPokerTableScreen`; those screens own real games
and their persistence/statistics side effects.

Add `'tutorial'` to AppShell's local `Screen` route union. A screen route is
preferred over stacked modals because it gives predictable Back behavior and
prevents the existing onboarding and learning-setup modals from appearing over
the tutorial.

### 6.4 Onboarding coordination

Change `FirstRunOnboardingModal` from a single `onComplete` callback to an
explicit experience-choice callback. AppShell owns the result:

- beginner choice: complete onboarding, select the `foundations` learning
  goal, suppress learning setup, and route to tutorial;
- knows-basics choice: complete onboarding and open the current learning setup;
- maybe-later choice: complete onboarding, use the current skip behavior, and
  route Home.

Add a guard to the current AppShell effect so `LearningSetupModal` cannot open
while the tutorial is active or immediately after its completion.

### 6.5 Permanent help and discovery

- Extend `PokerToolsCard` with an `onOpenBeginnerTutorial` callback and a
  beginner-first Poker basics row. Keep existing reference sheets shared rather
  than copying their content.
- Add the same callback to `LearnScreen` and place the tutorial at the start of
  Fundamentals. It is a replayable resource, not a graded
  `LearningActivityDefinition`.
- Reorder `TableGuideModal` so its first section is **Table basics**: full
  position names, private versus shared cards, street order, actions, and how a
  winner is chosen. Keep advanced percentages and preflop references below it.
- Keep the existing table help button on heads-up and multiway tables as the
  in-game entry point.

### 6.6 Localization and accessibility

- Add all tutorial keys under a dedicated `tutorial.*` namespace and update the
  localization parity tests for every shipped locale.
- Use the existing guided/dynamic text pattern. Do not truncate essential
  coach copy or action labels at supported accessibility font sizes.
- Move accessibility focus to the coach message when a step changes and
  announce the new community card without repeatedly reading the whole table.
- Give every seat, card, pot, action, progress step, and highlighted target a
  useful screen-reader label.
- Localize `PlayingCard` rank/suit accessibility labels when it is reused here;
  do not expose English-only suit names in non-English tutorials.
- Support VoiceOver, TalkBack, reduced motion, light/dark themes, phone/tablet
  widths, and portrait/landscape layouts already supported by the app.
- Show textual progress such as **Step 4 of 10**, but no countdown or elapsed
  time pressure.

### 6.7 Side-effect boundary

The tutorial feature must not import or call:

- Supabase clients, auth, storage, realtime, or Edge Functions;
- coach/OpenAI services;
- hand-history or play-statistics writers;
- missions, streaks, daily challenge, learning-progress writers, or review
  grading; or
- multiplayer services.

It may import pure card/evaluator types and presentation components.

---

## 7. Implementation slices

### Slice 1 — Contract and authored hand

- [ ] Add stable tutorial types, steps, reducer, and selectors.
- [ ] Encode the three-player hand and chip/action sequence.
- [ ] Validate all cards are unique and all pot changes balance.
- [ ] Validate the evaluator reports the intended flush-over-two-pair result.
- [ ] Pin the `9 / 47 ≈ 19%` explanation with a unit test.

Exit gate: the full tutorial can be advanced in tests without UI, randomness,
timers, or network access.

### Slice 2 — Persistence and first-run routing

- [ ] Add the fail-open local progress service and tests.
- [ ] Add the three onboarding choices without removing current disclosures.
- [ ] Coordinate beginner, existing setup, and maybe-later routes in AppShell.
- [ ] Add resume, restart, completion, and local reset behavior.
- [ ] Prove previously onboarded users are not prompted again after updating.

Exit gate: every new-install and existing-install path reaches the intended
screen without modal overlap.

### Slice 3 — Tutorial UI

- [ ] Build the simplified table, coach card, action bar, optional math detail,
  showdown comparison, and recap.
- [ ] Reuse shared visual components without importing real-game side effects.
- [ ] Add supportive retry copy for non-recommended actions.
- [ ] Add Back/Exit, resume, restart, reduced-motion, and theme behavior.

Exit gate: the complete authored hand works in airplane mode on iOS and
Android and can be exited at every step.

### Slice 4 — Permanent discovery and quick reference

- [ ] Add start/resume/replay state to Home Poker tools.
- [ ] Add the tutorial to Learn Fundamentals.
- [ ] Reorganize the existing table guide with beginner basics first.
- [ ] Verify every real table retains one-tap access to help.

Exit gate: a player can find basic help before a game, during a game, and after
finishing the tutorial.

### Slice 5 — Localization and accessibility

- [ ] Author and review copy in all five shipped locales.
- [ ] Add localized card accessibility labels.
- [ ] Verify large text, focus order, screen-reader announcements, contrast,
  touch targets, and non-color cues.
- [ ] Add a copy check that prevents unexplained advanced abbreviations in the
  tutorial namespace.

Exit gate: localization tests pass and the entire tutorial can be completed
with VoiceOver and TalkBack.

### Slice 6 — Release verification

- [ ] Run unit, component, localization, and TypeScript checks.
- [ ] Run the existing release check.
- [ ] Complete the manual device matrix below.
- [ ] Record final screenshots and copy approval for all locales.
- [ ] Verify there are no backend or privacy-policy changes to release.

Exit gate: signed release candidates complete the tutorial offline and normal
game statistics remain unchanged afterward.

---

## 8. Test plan

### Automated

- Reducer: ordered happy path, retry behavior, restart, exit/resume,
  completion, and idempotent taps.
- Authored hand: unique cards, legal actions, balanced pot, correct street
  order, correct showdown, and correct best-five highlighting.
- Probability: exactly nine remaining hearts among 47 unseen cards on the flop;
  rounded display remains about 19% / 1 in 5.
- Persistence: missing, corrupt, partial, future-version, in-progress,
  completed, dismissed, and write-failure cases.
- Routing: all three onboarding choices, no re-prompt for existing users, no
  learning-setup modal over the tutorial, resume, replay, and reset.
- Side effects: completing or abandoning the tutorial leaves hand history,
  play stats, missions, streaks, daily challenge, and learning progress
  unchanged.
- Offline architecture: a structural test rejects forbidden backend, coach,
  multiplayer, and statistics imports from `src/features/tutorial` and
  `src/domain/tutorial`.
- Discovery: Home, Learn, heads-up table help, and multiway table help all keep
  working.
- Localization: catalog parity for all shipped locales and no raw untranslated
  `tutorial.*` keys.

### Manual device matrix

Test at minimum:

- smallest supported iPhone and a current large iPhone;
- small Android phone and a current large Android phone;
- one tablet layout on each supported platform where available;
- light and dark themes;
- default and largest supported text size;
- VoiceOver and TalkBack;
- reduced motion;
- English, Simplified Chinese, Traditional Chinese, Latin American Spanish,
  and Brazilian Portuguese; and
- airplane mode from first launch through completion, interruption, resume,
  replay, and entry into a normal local practice game.

Also verify that an existing installed user upgrading from the approved build
is not forced through the new question.

---

## 9. Acceptance criteria

The feature is complete only when:

- [ ] A new installation can choose the tutorial from the existing welcome
  flow without losing the current privacy/play-money message.
- [ ] A user who knows poker can bypass it in one tap and continue the existing
  setup.
- [ ] An existing user is not interrupted after updating.
- [ ] The tutorial teaches positions/blinds, two private cards, five community
  cards, betting rounds/actions, best five cards, a showdown, one basic
  strategy example, and one percentage example.
- [ ] The experience has no timer, random outcome, AI delay, failure state, or
  required internet connection.
- [ ] It can be exited, resumed, restarted, completed, and replayed.
- [ ] Basic help is discoverable from Home, Learn, and every real table.
- [ ] Full terms appear before abbreviations and the main path contains none of
  the advanced jargon listed in the non-goals.
- [ ] Completion does not change real-game or learning statistics.
- [ ] No Supabase/backend schema, policy, function, secret, or deployment is
  required.
- [ ] All supported locales and accessibility/device checks pass.
- [ ] The repository's normal test, typecheck, localization, and release gates
  pass on the signed candidate.

---

## 10. Risks and controls

| Risk | Control |
| --- | --- |
| The tutorial becomes another dense lesson | One concept per step, plain language first, optional math, and one hand only. |
| Advice sounds universally correct | Use contextual wording and validate the authored strategy/copy with an experienced reviewer. |
| First-run modal becomes crowded | Keep the existing disclosure concise, then present the experience choice as a separate page within the same flow. |
| Tutorial state triggers real progression | Keep it in a separate domain/service and enforce forbidden-import and no-stat-change tests. |
| Existing users are re-prompted | Preserve the current onboarding key and test the upgrade path. |
| Localization reintroduces unexplained jargon | Review every locale against the beginner glossary and add namespace-level copy checks. |
| Table code becomes harder to maintain | Use a dedicated scripted screen and reuse only pure/presentational components. |

---

## 11. Recommended release shape

Ship the first version with exactly one guided hand. Do not add a second hand
until feedback shows a specific concept that users still cannot understand.

No new analytics are required for launch. Evaluate the feature through
hands-on usability sessions and the same kind of qualitative feedback that
identified the jargon problem. If analytics are considered later, they require
a separate privacy and consent decision and are not part of this plan.
