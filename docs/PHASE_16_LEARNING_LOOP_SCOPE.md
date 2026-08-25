# Phase 16 — Learning Loop & Beta Insights

## Outcome

Make RiverMind feel like one personal poker coach rather than a collection of
lessons, drills, tables, and review tools. A player should be able to open the
app, start one recommended five-to-ten-minute session, understand why each
step was selected, finish with a credible statement about their progress, and
know what will return next.

The phase also adds a privacy-safe first-party measurement foundation so the
next roadmap decision is based on completed learning behavior rather than the
number of features available.

## Current foundation

Phase 16 extends capabilities that already exist:

- Home exposes one recommended learning action.
- `buildPersonalPracticePlan` selects up to three deduplicated targets from a
  resumable activity, due review, table focus, weak score, learning goal, and
  curriculum progress.
- Concept mastery, weekly history, spaced review, improvement insights, and
  recurring weak areas are derived locally.
- Completed poker sessions already summarize Strong, Close, and Mistake
  decisions and route a useful focus area into targeted practice.
- Learning progress is local-first and owner-scoped Supabase synchronization is
  already available.
- Private beta feedback supports bounded, explicitly attached diagnostics.

The missing product layer is a single journey with a stable start, ordered
steps, continuation state, a closing outcome, and measurement of where players
finish or leave.

## Product principles

- **One session, several tools.** A lesson, review, scenario pack, or table
  mission may be implemented by a different feature, but the player experiences
  them as steps in one session.
- **Evidence before confidence.** RiverMind never calls a concept mastered,
  improved, or a leak from one decision or from chips won.
- **Mixed strategy is not a contradiction.** The review distinguishes a top
  baseline action from an acceptable alternative and never says two visibly
  different actions are the same.
- **Explain selection without exposing internals.** The player sees a short
  reason such as Due review, From your last table, or Continue your path; raw
  recommendation scores remain internal.
- **Local-first remains the default.** Session composition, checkpoints,
  grading, and progress work offline. Analytics never gate play or learning.
- **Measurement is bounded and disclosed.** No cards, room codes, player names,
  free text, action histories, or device advertising identifiers enter product
  analytics.
- **Refactor at the seam being changed.** Large screens are split only where a
  Phase 16 flow needs an explicit controller or reusable presentation boundary.

## Success measures

### Release acceptance

- A new player and a returning player can each start a recommended session from
  Home with one primary action.
- The session contains two to four steps and an estimated total duration of
  five to ten minutes. A shorter due-review-only session is allowed when no
  credible additional target is available.
- A player can leave after any completed step and resume at the next incomplete
  step after an app relaunch.
- Every completed session ends with one evidence-bounded strength or progress
  statement, one focus statement when supported, and the next expected action.
- Review copy never describes a different chosen action as following the
  baseline; bet-size tolerance is described separately from action tolerance.
- Analytics collection is optional, disclosed, bounded, owner-safe, and unable
  to break the local journey when unavailable.

### Beta product measures

The first instrumented beta establishes a baseline before setting improvement
targets. Report these measures by app version, platform, locale, and new versus
returning learner, only when the cohort is large enough to avoid identifying an
individual:

- **Learning activation:** first recommended session started and first step
  completed.
- **Session completion:** recommended sessions completed divided by sessions
  started.
- **Step continuation:** players who begin the next step after completing the
  previous one.
- **Lesson-to-practice conversion:** a concept lesson followed by a scored
  review, drill, scenario, or mission for the same concept within the session.
- **Return behavior:** day-one and day-seven return to any learning or practice
  activity. These are calendar-day product measures, not promises shown to the
  player.
- **Coach usefulness:** details opened, related practice started, and practice
  completed after a decision review. RiverMind does not interpret following a
  recommendation as proof the recommendation was correct.
- **Reliability:** resume success, abandoned checkpoints, analytics queue
  failures, and unexpected flow errors.

## Included work

### 1. Recommended session composition

Add a pure domain composer that turns existing evidence into a stable session
plan. The composer does not invent new lesson content or strategy logic.

A normal session contains:

1. At most one due-review step when reviews are due.
2. One primary learning or reinforcement step chosen from the current personal
   plan and learning goal.
3. One application step for the same concept when a compatible randomized pack
   or table mission exists.
4. A closing summary generated from evidence produced during this session.

Composition rules:

- Resume an already-started learning activity before adding another activity
  of the same type.
- Due review wins ties, but does not displace a resumable activity.
- Prefer conceptual coherence over variety: a preflop lesson should route to a
  preflop drill or mission rather than an unrelated high-scoring activity.
- Do not include two destinations that write the same progress activity.
- Do not repeat a completed step when the app is relaunched.
- Freeze the ordered plan once the session starts. New evidence affects the
  closing summary and the next session, not the remaining steps in the current
  session.
- Use stable activity, concept, and reason identifiers in persistence and
  analytics; localized titles remain presentation only.
- Estimate duration from authored activity metadata. Use a conservative
  fallback when older content lacks duration metadata.

Recommended domain types:

```ts
type RecommendedSessionStatus = 'planned' | 'active' | 'completed' | 'abandoned';
type RecommendedSessionStepStatus = 'pending' | 'active' | 'completed' | 'skipped';

interface RecommendedSessionPlan {
  id: string;
  concept: LearningConceptId;
  createdAt: string;
  estimatedMinutes: number;
  reason: PersonalPracticePlanReason;
  status: RecommendedSessionStatus;
  steps: RecommendedSessionStep[];
  version: 1;
}
```

The concrete step target should reuse `PersonalPracticePlanTarget` or a narrow
serializable projection of it rather than duplicate navigation rules.

### 2. Session journey and continuation

Home replaces the single-destination recommendation behavior with a session
preview that communicates:

- the primary concept in plain language;
- why RiverMind selected it;
- the number of steps and estimated time;
- one **Start session** or **Continue session** action.

Inside the journey:

- A compact progress header shows the current step and total steps.
- Completion returns to the journey controller and advances to the next step;
  nested feature modals do not decide the next destination themselves.
- Leaving a step preserves progress already committed by that feature.
- The player can end the session early without losing completed work. This is
  recorded as an incomplete journey, not presented as failure.
- If a saved target no longer exists after an app update, the controller skips
  it safely, records a bounded compatibility diagnostic, and continues.
- Reset saved learning data removes the active session checkpoint and its local
  history.

Home, Learn, and the closing screen may link to the same active session, but
only Home presents it as the dominant daily action.

### 3. Trustworthy decision language

Replace the current visible decision categories with player-facing meanings
that remain compatible with the existing internal grades:

| Internal grade | Player-facing label | Meaning |
| --- | --- | --- |
| `strong` with same action family | Recommended | The chosen action matches the highest-weight baseline family; a nearby raise size can still qualify. |
| `strong` or `close` with different authored action | Acceptable alternative | The chosen action is a supported mixed or near-equivalent line, while another action has the highest baseline weight. |
| `close` outside an authored mixed leg | Close decision | The baseline has a modest preference; review the reason or sizing. |
| `mistake` | Costly mistake | The deterministic baseline has a meaningful preference for another legal line. |

Implementation requirements:

- Add an explicit presentation classification; do not infer the label from the
  grade alone in React components.
- Separate action-family difference from raise-size difference.
- When frequencies are available, show rounded, beginner-readable mix context
  in Details rather than on the compact table card.
- Do not display solver EV unless RiverMind has a validated EV comparison for
  that exact decision. Existing relative scores must not be relabeled as EV.
- Update hand review, session summary, history, targeted-practice routing,
  accessibility labels, English, Simplified Chinese, and Traditional Chinese
  together.
- Add regression cases where the chosen action is acceptable but differs from
  the baseline, including the current Fold versus Call class of presentation.

### 4. Closing progress payoff

The completed-session view answers three questions in this order:

1. **What did I practice?** Concept, completed steps, and decisions reviewed.
2. **What changed?** One conservative strength or improvement statement when
   supported by enough prior and current evidence.
3. **What is next?** Next review timing, continue-path activity, or a statement
   that RiverMind needs more evidence.

Evidence thresholds:

- A session strength requires at least three scored decisions in the concept
  with no Costly mistake, or an existing concept strength supported across at
  least two completed hands.
- An improvement statement requires at least two prior scored attempts and a
  five-point or greater conservative trend, matching the current progress
  insight rule.
- A recurring focus requires at least two active review items or review spots
  across two completed hands.
- When none of these thresholds is met, say **Building evidence** and describe
  what RiverMind will observe next. Do not substitute chip profit.

The summary provides one quiet secondary route to detailed progress. It does
not add trophies, confetti, artificial levels, or a second primary action.

### 5. Privacy-safe beta insights

Create a small first-party event pipeline backed by Supabase. Product events
are operational learning signals, not detailed hand telemetry.

Permitted event envelope:

- server-generated event ID or idempotency key;
- pseudonymous authenticated owner ID, readable only by service-role reporting;
- event name and schema version;
- occurred-at timestamp;
- app version, build number, platform, and locale;
- random per-app-run session ID that contains no device identifier;
- stable screen, concept, activity, mode, reason, and result enums when relevant;
- bucketed duration, step count, and score band when relevant;
- retry and offline-queue state.

Prohibited fields:

- hole cards, board cards, deck state, action history, exact wager sequence, or
  hand client IDs;
- room codes, invite links, preset player names, user-entered feedback, IP
  enrichment, advertising IDs, or hardware fingerprints;
- exact free-form errors or stack traces in the event payload;
- OpenAI prompts, responses, explanations, or consent content;
- arbitrary JSON properties supplied by feature code.

Initial event taxonomy:

| Event | Required properties |
| --- | --- |
| `recommended_session_presented` | concept, reason, step-count bucket, duration bucket |
| `recommended_session_started` | concept, reason, new-or-resumed |
| `recommended_session_step_started` | concept, activity kind, step index |
| `recommended_session_step_completed` | concept, activity kind, result band, duration bucket |
| `recommended_session_step_skipped` | activity kind, stable reason |
| `recommended_session_completed` | concept, completed-step count, duration bucket |
| `recommended_session_ended_early` | completed-step count, stable exit location |
| `decision_review_opened` | mode, street, presentation class |
| `decision_practice_started` | concept, source mode |
| `learning_activity_completed` | activity kind, concept, result band |
| `checkpoint_resume_result` | success or stable failure code |
| `product_flow_error` | source and allowlisted stable error code |

Storage and access requirements:

- Add a dedicated `product_events` table; do not mix automatic events into
  user-authored `beta_feedback`.
- Mobile clients receive insert-only access to allowlisted columns. They cannot
  select, update, or delete product events through the Data API.
- RLS requires the authenticated owner ID and the database validates event
  names, payload size, schema version, timestamps, and enum-like properties.
- Queue events locally and retry in bounded batches. Queue failure never blocks
  navigation, persistence, coaching, or account deletion.
- Account deletion removes owner-linked raw events.
- Raw events have a documented short retention period; the initial target is
  90 days. Longer-lived reports contain only cohort aggregates that cannot be
  traced back to an owner.
- Add a **Share product improvement data** preference. Collection defaults off
  until the player explicitly enables it; disabling it stops new product events
  and clears the unsent local queue.
- Update the privacy policy, onboarding/Beta & Privacy summary, App Store and
  Play Console disclosures before enabling collection in a distributed build.
- Keep collection behind a local release flag until the hosted migration,
  retention job, aggregate report, and two-user isolation verifier pass.

### 6. Beta reporting and roadmap decision

Add a reproducible service-role reporting script or SQL report that produces
only aggregate counts and rates. It must:

- enforce a minimum cohort size before breaking down version, platform, or
  locale;
- separate first-time and returning learning sessions;
- show the funnel from presentation through completion;
- show step-level exit points without exposing an owner's path;
- report queue and flow reliability alongside product conversion;
- document the UTC window and app versions included.

The beta report leads to one of three explicit next decisions:

- Improve activation if sessions are presented but not started.
- Improve session composition or step transitions if sessions start but do not
  finish.
- Deepen coaching/content if sessions finish and return behavior is healthy but
  players do not open review or related practice.

Phase 16 does not claim a retention improvement until at least one comparable
instrumented beta cohort exists.

### 7. Targeted component boundaries

Avoid a wholesale rewrite. Extract only the ownership boundaries required by
the new journey:

- A recommended-session domain module owns composition and deterministic
  serialization.
- A session checkpoint service owns local load, save, migration, completion,
  and reset behavior.
- A journey controller owns step navigation; existing lesson, trainer,
  scenario, review, and mission components continue to own their content.
- Home receives a dedicated recommended-session card instead of additional
  conditionals in `AppShell`.
- Decision presentation classification lives beside grading domain logic;
  review components consume the classification without recreating rules.
- A typed analytics service is the only module allowed to enqueue product
  events. Feature code cannot send arbitrary event names or payloads.

When touched code is extracted from `AppShell`, `LearnScreen`, the table
screens, or `MultiplayerFlowModal`, preserve behavior in focused tests before
moving presentation code.

Proposed implementation map:

| Concern | Proposed location |
| --- | --- |
| Session composition and normalization | `src/domain/learning/recommendedSession.ts` |
| Session composition corpus | `src/domain/learning/__tests__/recommendedSession.test.ts` |
| Local checkpoint and migration | `src/services/recommendedSessionCheckpoint.ts` |
| Home preview | `src/features/shell/RecommendedSessionCard.tsx` |
| Journey controller and closing view | `src/features/learn/RecommendedSessionFlow.tsx` |
| Decision presentation classification | `src/domain/poker/decisionReviewPresentation.ts` |
| Typed event contract and payload validation | `src/services/productAnalyticsContract.ts` |
| Offline event queue and delivery | `src/services/productAnalytics.ts` |
| Hosted event storage and retention | new reviewed migration under `supabase/migrations` |
| Aggregate beta report | `scripts/report-product-insights.mjs` or reviewed SQL under `supabase/tests` |

Names may change during implementation, but ownership must remain separated:
domain composition cannot import React or Supabase, and presentation components
cannot construct untyped analytics payloads.

## Delivery slices

### Slice 0 — Release clarity and evidence baseline

- Correct decision-review classification and mixed-strategy copy.
- Add contradictory-copy regression tests and localization coverage.
- Retake notification-free store screenshots separately from the code change.
- Finish the current hosted deletion, multiplayer, accessibility, Dynamic Type,
  and Android device gates recorded in the release checklist.

This slice can ship independently and does not wait for analytics.

### Slice 1 — Session domain and checkpoint

- Add the versioned session plan, composer, compatibility normalization, and
  deterministic unit corpus.
- Map existing personal-plan targets into coherent review, learning, and
  application steps.
- Add local checkpoint, resume, completion, reset, and app-update migration.
- Keep the existing one-step Home recommendation as a fallback if composition
  fails.

### Slice 2 — Journey UI

- Add Home preview and Start/Continue behavior.
- Add the compact journey header and controller-owned transitions.
- Integrate lesson, review, trainer, scenario/practice pack, and compatible
  table-mission completion callbacks.
- Verify interruption and relaunch after every step type.

### Slice 3 — Closing outcome

- Derive the session evidence snapshot and conservative summary.
- Present practiced concept, supported strength/focus, next review or next
  activity, and a detailed-progress route.
- Update the next Home recommendation only after the current session closes.

### Slice 4 — Analytics foundation

- Finalize privacy copy and improvement-data preference behavior.
- Add typed event contracts, offline queue, hosted schema, RLS, retention job,
  and aggregate reporting.
- Instrument the recommended journey, decision-review-to-practice route, and
  stable flow errors.
- Run source, export, payload, cross-user, opt-out, deletion, and offline tests
  before enabling the release flag.

### Slice 5 — Instrumented beta and decision

- Distribute one instrumented beta cohort after all release gates pass.
- Produce the aggregate activation, completion, continuation, return, coach,
  and reliability report.
- Pair the numbers with categorized tester feedback and direct beginner QA.
- Write the Phase 17 recommendation from evidence rather than automatically
  advancing to accounts, rankings, nine-player tables, or monetization.

## Automated acceptance

- Session composition is deterministic for the same normalized evidence and
  timestamp.
- Every target is serializable, localized at render time, and either routable
  or safely skippable after migration.
- Composition never duplicates a progress destination or exceeds the authored
  duration boundary without an explicit fallback reason.
- Checkpoint writes survive relaunch, never regress completed steps, and are
  removed by learning-data reset and account deletion.
- Every internal grade and action-family combination maps to one valid
  player-facing presentation class in all three locales.
- A different acceptable action cannot render copy that says it matches or
  follows the displayed baseline action.
- Progress statements satisfy their evidence thresholds in deterministic test
  corpora, including insufficient-evidence and declining-score cases.
- Product analytics accept only typed allowlisted events and reject prohibited
  or oversized properties before persistence.
- Offline analytics retries are idempotent and bounded; disabling improvement
  data clears the unsent queue.
- Anonymous user A cannot read, forge ownership of, update, or delete user B's
  product events. Mobile users cannot read their own raw events through the
  Data API.
- Account deletion removes progress, checkpoint, event queue, and hosted raw
  events without preventing a normal local reset when the network is down.
- Full typecheck, unit suite, release configuration, mobile-secret scan, hosted
  RLS verification, and account-deletion verification pass.

## Manual and visual acceptance

- Fresh install, returning learner, due-review learner, weak-score learner, and
  active-checkpoint learner each receive understandable Home copy.
- Walk every step type and interruption boundary on the smallest supported
  iPhone, a large iPhone, a small Android phone, and iPad portrait.
- English, Simplified Chinese, and Traditional Chinese fit Home, journey header,
  review cards, and closing summary without hiding the primary action.
- VoiceOver announces session reason, step progress, decision classification,
  chosen line, baseline line, and next action in a useful order.
- Largest supported Dynamic Type keeps Start/Continue, Exit session, step
  completion, and closing actions reachable.
- Light, dark, system appearance, reduced motion, haptics off, offline start,
  offline completion, and foreground recovery remain usable.
- Improvement-data sharing is off on a fresh install until explicitly enabled.
  It can be disabled again from Preferences; no new event appears after that,
  including when an older offline queue exists.
- Store screenshots contain no notification banners, developer overlays,
  private room codes, or tester-specific state.

## Explicitly deferred

- Nine-player tables or additional poker variants
- Public matchmaking, public profiles, rankings, leagues, or chat
- Durable visible accounts and cross-device learning recovery
- Push-notification or streak-reminder campaigns
- Solver-backed or claimed GTO grading
- Displaying unvalidated expected-value numbers
- Expanding server-generated AI explanations to every multiway decision
- Subscription, chip purchase, prize, or other monetization systems
- A wholesale navigation, visual-brand, or table-engine rewrite

## Phase exit

Phase 16 is complete only when the coherent recommended session is released,
decision feedback is internally consistent, privacy-safe measurement is proven
in production-like verification, and at least one aggregate beta report can
support a concrete Phase 17 decision. Shipping the event table or the session
UI alone does not complete the phase.
