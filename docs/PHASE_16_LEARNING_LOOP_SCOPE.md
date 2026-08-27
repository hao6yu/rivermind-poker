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
- Home restores a quiet route to poker cheat sheets without displacing the
  recommended session as its primary learning action.
- Bet and raise sizing supports exact direct entry as well as presets and
  increment controls, with every submitted amount clamped to the legal range.
- A saved player identity, including its avatar, is presented consistently in
  Profile, solo play, local multiway play, and private multiplayer surfaces.
- Private friend rooms support two, three, six, or nine occupied seats, with a
  readable nine-seat presentation and server-authoritative recovery on every
  supported device class.
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

### 4A. Release usability restoration

Restore three high-value capabilities without changing the recommended-session
domain or its evidence rules:

- Add one quiet **Poker cheat sheets** route on Home. It opens the existing
  Learn reference collection directly and never becomes a second primary Home
  card.
- Keep the existing bet-size presets and increment controls, but make the exact
  custom amount tappable and editable with a numeric keyboard. The field must
  say whether it is a **Bet to** or **Raise to** value, expose the legal minimum
  and maximum, reject non-numeric input, and clamp on commit or confirmation.
- Make compact private-table seat plaques responsive to the actual lane width
  instead of using one phone width for every device. Exact stacks such as
  `4,000` remain on one line; larger phones use the available room while the
  smallest supported phone preserves non-overlapping seats, action bubbles,
  board, and controls.

A slider is not the primary exact-entry control: large stack ranges make it
imprecise, and direct numeric entry is easier to verify and announce. Presets
remain the fast path for ordinary decisions.

### 4B. Player identity and avatars

Restore an editable player identity in Profile and use it consistently rather
than treating identity as private-room setup state:

- Profile owns the saved display name and avatar. Create/join flows reuse the
  saved identity by default while still allowing the player to review it before
  entering a room.
- Custom display names are normalized and length-bounded on both the client and
  server. Identity text never enters product analytics.
- Human, AI, **You**, Host, and temporary AI-control states remain explicit
  visual and accessibility semantics. A human and an AI may share the same
  display name without becoming ambiguous; code never infers seat kind from a
  name or avatar.
- Ship authored avatar choices and user-uploaded square avatars. Selection,
  crop/orientation correction, resizing, compression, MIME/size validation,
  metadata stripping, fallback, replacement, and removal are part of the
  feature rather than left to each screen.
- The saved human avatar appears on the heads-up hero seat, the local multiway
  hero seat, private-room lobby seats, live private-table seats, result and
  replay surfaces, and the Profile/Home avatar entry point. Remote human avatars
  resolve through the multiplayer identity contract; existing authored AI
  avatars remain attached to AI profile IDs.
- A missing, rejected, offline, or expired remote image falls back to a stable
  authored avatar or initials without changing seat geometry.

Uploaded avatars use a private, owner-scoped Supabase Storage bucket. Mobile
clients never receive a service-role key. Storage policies restrict create,
read, replace, and delete operations to the intended owner/room access model;
replacement includes the permissions required for insert, select, and update.
Private-table delivery uses a bounded avatar identifier and short-lived access,
not arbitrary client-provided URLs. Replacing an avatar removes the superseded
object, and account deletion removes every owner object and local cached copy.
Privacy disclosure and an in-room fallback/report-or-hide path ship before
uploads are enabled in a distributed build.

### 4C. Nine-seat private multiplayer

Add nine-player private friend rooms as a first-class table size, not as a
presentation-only option:

- Extend the shared multiway engine, multiplayer contracts, coordinator, Edge
  Function validation, snapshots, recovery records, and client parsers from the
  current two/three/six-seat maximum to nine.
- Add a complete nine-handed position map (BTN, SB, BB, UTG, UTG+1, MP, LJ, HJ,
  and CO). Strategy may conservatively map new early/middle seats into existing
  authored range buckets, but the UI and saved decision context retain the
  truthful displayed position and do not claim newly authored solver ranges.
- Support any permitted human/AI mix with at least one human and two occupied
  seats, including AI fill, timeout takeover, side pots, eliminations, button
  movement, reconnect, replay, review, and shared session completion.
- Add a dedicated nine-seat anchor and lane model. Phone live play uses a tested
  landscape presentation with a clear rotate affordance; iPad supports its
  tested portrait and landscape layouts. Lobby/setup may remain portrait when
  every identity and readiness state remains readable.
- Older clients encountering a nine-seat snapshot fail with an explicit
  update-required compatibility result. They must not truncate seats, infer a
  six-seat room, or overwrite the recovery checkpoint.

Nine-seat acceptance covers deterministic deal/action order, all-in and side-pot
settlement, every position, human/AI redaction, reconnect during each street,
action-queue performance, long localized names, uploaded-avatar fallbacks,
largest supported text, and the smallest supported landscape phone. This slice
adds nine seats to private multiplayer; it does not add public matchmaking or a
new poker variant.

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
- room codes, invite links, player names, avatar identifiers or object paths,
  user-entered feedback, IP enrichment, advertising IDs, or hardware
  fingerprints;
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
| Home cheat-sheet restoration and shared exact bet entry | `src/features/shell/AppShell.tsx`, `src/features/table/BetSizingModal.tsx` |
| Player identity and avatar normalization | `src/domain/playerProfile.ts`, `src/services/playerProfile.ts`, new avatar service/component boundaries |
| Avatar object storage and room-safe resolution | reviewed Storage policies/migration plus the multiplayer identity contract |
| Nine-seat engine, contracts, and responsive layout | `src/domain/poker/multiway.ts`, `src/domain/multiplayer`, `src/features/multiplayer`, `supabase/functions/multiplayer-room` |
| Typed event contract and payload validation | `src/services/productAnalyticsContract.ts` |
| Offline event queue and delivery | `src/services/productAnalytics.ts` |
| Hosted event storage and retention | new reviewed migration under `supabase/migrations` |
| Aggregate beta report | `scripts/report-product-insights.mjs` or reviewed SQL under `supabase/tests` |

Names may change during implementation, but ownership must remain separated:
domain composition cannot import React or Supabase, and presentation components
cannot construct untyped analytics payloads.

## Delivery slices

### ✅ Slice 0 — Release clarity and evidence baseline

- Correct decision-review classification and mixed-strategy copy.
- Add contradictory-copy regression tests and localization coverage.
- Retake notification-free store screenshots separately from the code change.
- Finish the current hosted deletion, multiplayer, accessibility, Dynamic Type,
  and Android device gates recorded in the release checklist.

This slice can ship independently and does not wait for analytics.

### ✅ Slice 1 — Session domain and checkpoint

- Add the versioned session plan, composer, compatibility normalization, and
  deterministic unit corpus.
- Map existing personal-plan targets into coherent review, learning, and
  application steps.
- Add local checkpoint, resume, completion, reset, and app-update migration.
- Keep the existing one-step Home recommendation as a fallback if composition
  fails.

### ✅ Slice 2 — Journey UI

- Add Home preview and Start/Continue behavior.
- Add the compact journey header and controller-owned transitions.
- Integrate lesson, review, trainer, scenario/practice pack, and compatible
  table-mission completion callbacks.
- Verify interruption and relaunch after every step type.

### ✅ Slice 3 — Closing outcome

- Derive the session evidence snapshot and conservative summary.
- Present practiced concept, supported strength/focus, next review or next
  activity, and a detailed-progress route.
- Update the next Home recommendation only after the current session closes.

### ✅ Slice 3.5 — Product restoration and table usability

- Restore a quiet Home route to the existing poker cheat sheets while keeping
  the recommended session dominant.
- Add tappable numeric bet/raise entry to the shared sizing sheet without
  removing presets or increment controls.
- Add responsive compact private-table plaques; exact four-digit stacks stay on
  one line and larger phones receive larger readable seats without lane overlap.
- Verify localization, accessibility, legal-amount clamping, keyboard dismissal,
  and 320/375/390/430-point phone geometry before changing identity contracts.

### Slice 3.6 — Player identity and avatars

- Restore normalized custom display-name editing in Profile and reuse it in
  private-room setup.
- Add explicit Human/AI/You identity treatment independent of display-name
  collisions.
- Add authored avatar selection plus secure user image selection, crop,
  compression, validation, upload, replacement, caching, fallback, and removal.
- Render the saved avatar throughout heads-up, local multiway, private lobby and
  live play, results, replay, and the Profile/Home entry point.
- Add owner/room-scoped Storage policies, server-side identity validation,
  privacy disclosure, abuse fallback, offline behavior, and account-deletion
  verification before enabling uploads.

### Slice 3.7 — Nine-seat private multiplayer

- Add nine as a private-room seat-count option and extend the shared engine,
  contracts, coordinator, Edge Function, snapshots, and recovery validation.
- Add truthful nine-handed positions and conservative mappings to existing
  authored strategy buckets where dedicated tables do not yet exist.
- Add tested nine-seat lobby and live-table layouts, using landscape live play
  on phones and responsive portrait/landscape layouts on iPad.
- Verify mixed human/AI rooms, dealing, action order, side pots, button movement,
  timeout takeover, replay, reconnect, accessibility, localization, and
  cross-version update-required behavior.

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
  advancing to accounts, rankings, public matchmaking, or monetization.

## Automated acceptance

- Session composition is deterministic for the same normalized evidence and
  timestamp.
- Every target is serializable, localized at render time, and either routable
  or safely skippable after migration.
- Composition never duplicates a progress destination or exceeds the authored
  duration boundary without an explicit fallback reason.
- Checkpoint writes survive relaunch, never regress completed steps, and are
  removed by learning-data reset and account deletion.
- Exact bet/raise entry never submits an amount outside the engine-provided legal
  range, including malformed text, keyboard cancellation, all-in, and minimum
  raise boundaries.
- Player identity parsing rejects untrusted names, avatar URLs, oversized
  payloads, and unauthorized object access; replacement and account deletion
  remove both local and hosted avatar data.
- Nine-seat states preserve all occupied seats through serialization, redaction,
  realtime updates, reconnect, and replay; older parsers return update-required
  rather than accepting a partial state.
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
- Enter exact bet/raise values with the keyboard in heads-up, local multiway, and
  private multiplayer; verify presets and increment controls still work.
- Confirm the saved human avatar appears consistently in solo, local multiway,
  private lobby/live play, results, and replay, including offline/failure
  fallback and same-name human/AI seats.
- Walk a nine-seat private room through lobby, deal, every street, showdown,
  side pot, reconnect, and next hand on a landscape phone and iPad.
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

- Tables larger than nine seats or additional poker variants
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
