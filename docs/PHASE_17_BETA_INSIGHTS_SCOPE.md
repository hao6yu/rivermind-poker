# Phase 17 — Privacy-Safe Beta Insights

## Outcome

Add an optional, privacy-safe first-party measurement foundation and use one
instrumented beta cohort to make the next roadmap decision from completed
learning behavior rather than feature count. Measurement must never gate play,
learning, coaching, local persistence, account deletion, or the Phase 16
experience.

Phase 17 contains the analytics and evidence work formerly planned as Phase 16
Slices 4 and 5. It is a separate release and is not required to distribute the
[Phase 16 learning and private-table release](./PHASE_16_LEARNING_LOOP_SCOPE.md).

## Entry conditions

- Phase 16 implementation and automated gates through Slice 3.10 are complete;
  the landscape gameplay/action-crash gate is part of Phase 16, not work that
  may be deferred into this analytics release.
- Remaining Phase 16 hosted/two-device distribution checks are tracked as
  release verification, not silently transferred into this phase.
- Recommended-session, activity, concept, decision-presentation, reason, and
  stable failure identifiers are available without using localized text.
- Owner-scoped authentication, local account reset, hosted account deletion,
  and bounded beta-feedback diagnostics already work independently of product
  analytics.
- No product event is enabled in a distributed build until the consent,
  disclosure, hosted-isolation, retention, and deletion gates below pass.

## Product principles

- **Explicitly optional.** **Share product improvement data** defaults off. No
  event is created or queued before the player opts in.
- **Local functionality is independent.** Collection, queueing, delivery, and
  reporting failures never block or alter poker, learning, coaching, progress,
  navigation, checkpoints, or account deletion.
- **Minimize before collecting.** Events use a closed, versioned taxonomy and
  bucketed values. Feature code cannot attach arbitrary JSON.
- **No poker surveillance.** Cards, action histories, wager sequences, room
  codes, identities, free text, AI prompts/responses, advertising identifiers,
  and hardware fingerprints never enter product events.
- **Owner isolation is mandatory.** Mobile clients may submit only their own
  allowlisted events and cannot read, update, or delete raw events through the
  Data API. Reporting is service-role-only.
- **Aggregate evidence, not individual evaluation.** Reports enforce minimum
  cohort sizes and never expose one player's activity path.
- **Consent remains reversible.** Disabling sharing stops new collection and
  clears the unsent queue immediately. Account deletion removes owner-linked raw
  events regardless of the current preference.

## Success measures

The first instrumented beta establishes a baseline before setting improvement
targets. Report these measures by app version, platform, locale, and new versus
returning learner only when the cohort is large enough to avoid identifying an
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
  completed after a decision review. Following a recommendation is not evidence
  that the recommendation itself was correct.
- **Reliability:** resume success, abandoned checkpoints, queue failures, and
  unexpected allowlisted flow errors.

## Included work

### 1. Consent and disclosure

- Add a localized **Share product improvement data** preference in the existing
  privacy/settings surface. It is off on fresh install, reinstall, account
  switch, migration from an unknown legacy value, and malformed persistence.
- Explain what is collected, what is prohibited, the raw retention window, how
  to disable collection, and how account deletion applies.
- Update the privacy policy, onboarding/Beta & Privacy summary, App Store
  privacy answers, and Play Console disclosure before enabling collection in a
  distributed build.
- Keep collection behind a local release flag until every Slice 1 gate passes.
  The preference may be visible while disabled only if its copy truthfully says
  collection is not yet active.

### 2. Typed event contract and local delivery

Permitted event envelope:

- server-generated event ID or a bounded client idempotency key;
- pseudonymous authenticated owner ID, readable only by service-role reporting;
- event name and schema version;
- occurred-at timestamp;
- app version, build number, platform, and locale;
- random per-app-run session ID containing no device identifier;
- stable screen, concept, activity, mode, reason, and result enums when relevant;
- bucketed duration, step count, and score band when relevant;
- retry and offline-queue state.

Prohibited fields:

- hole cards, board cards, deck state, action history, exact wager sequence, or
  hand client IDs;
- room codes, invite links, display names, avatar identifiers or object paths,
  user-entered feedback, IP enrichment, advertising IDs, or hardware
  fingerprints;
- exact free-form errors, stack traces, file paths, URLs, or arbitrary strings
  supplied by caught exceptions;
- OpenAI prompts, responses, explanations, consent copy, table moments, quick
  phrases, or transmitted reaction media;
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

Contract and queue rules:

- One pure contract module owns event names, per-event properties, validation,
  payload-size limits, schema versions, and bucket boundaries.
- Feature code calls typed helpers and cannot send a raw event name or payload.
- The bounded local queue is owner-scoped, versioned, deduplicated by
  idempotency key, migration-safe, and cleared by opt-out, local learning reset
  when appropriate, account switch, and account deletion.
- Delivery uses bounded batches and exponential backoff with jitter. A rejected,
  malformed, future-version, or permanently unauthorized event is quarantined
  or dropped with a stable local diagnostic rather than retried forever.
- Queue and network failures are never surfaced as blocking product errors.

### 3. Hosted storage, isolation, and retention

- Add a dedicated `product_events` table; do not mix automatic product events
  into user-authored `beta_feedback`.
- Do not assume a new table is automatically exposed through the Supabase Data
  API. The reviewed migration explicitly chooses the exposed schema and grants
  only the minimum insert capability required by authenticated mobile clients.
- Revoke mobile `SELECT`, `UPDATE`, and `DELETE`. RLS and database constraints
  require `(select auth.uid()) = user_id` and validate event name, schema
  version, timestamp window, idempotency key, payload size, and allowlisted
  enum-like properties. Authorization never relies on user-editable metadata.
- The mobile application uses only the publishable client credential. Secret or
  service-role credentials remain server-side and never enter the bundle.
- Account deletion removes owner-linked raw events. A documented scheduled job
  deletes raw events after 90 days in bounded batches; aggregate reports may
  live longer only when they cannot be traced back to an owner.
- Reporting access is service-role-only. Do not expose a raw-event view or RPC
  to `anon` or `authenticated`; any privileged function must live outside an
  exposed schema, check its caller explicitly, and revoke default public
  execution.
- Keep the migration and collection flag disabled until fresh migration replay,
  database lint/advisors, retention, two-user isolation, payload rejection,
  account deletion, and mobile-secret scanning pass.

### 4. Instrumentation boundaries

Instrument only the initial taxonomy and only at stable domain/controller
boundaries:

- recommended-session presentation, start, step start/completion/skip, early
  exit, completion, and checkpoint resume result;
- decision-review detail open and related-practice start;
- learning-activity completion;
- explicitly allowlisted flow errors without exception text.

Do not instrument poker actions, cards, bets, stacks, room events, table
moments, player identity, avatar behavior, private-room membership, or replay.
Instrumentation must observe successful domain transitions rather than UI taps
that may later be refused, except where the event explicitly measures a
presentation or attempted start.

### 5. Aggregate beta report and roadmap decision

Add a reproducible service-role reporting script or reviewed SQL report that
produces only aggregate counts and rates. It must:

- enforce a documented minimum cohort size before breaking down version,
  platform, locale, or new/returning status;
- separate first-time and returning learning sessions;
- show the funnel from presentation through completion;
- show step-level exit points without exposing an owner's path;
- report queue and flow reliability alongside product conversion;
- document the UTC window, app versions, consent population, and exclusions;
- return a suppressed result rather than a small identifying cohort.

Pair the aggregate report with categorized tester feedback and direct beginner
QA. The evidence leads to one of three explicit next decisions:

- Improve activation if sessions are presented but not started.
- Improve composition or transitions if sessions start but do not finish.
- Deepen coaching/content if sessions finish and return behavior is healthy but
  players do not open review or related practice.

Do not interpret the cohort as proving retention improvement without a valid
comparison window, and do not automatically advance to accounts, rankings,
public matchmaking, or monetization.

## Targeted component boundaries

| Concern | Proposed location |
| --- | --- |
| Typed event contract and payload validation | `src/services/productAnalyticsContract.ts` |
| Owner-scoped consent and queue persistence | `src/services/productAnalyticsPreferences.ts`, `src/services/productAnalyticsQueue.ts` |
| Delivery and retry coordinator | `src/services/productAnalytics.ts` |
| Feature instrumentation adapters | narrow helpers beside the existing journey/review controllers |
| Hosted event storage and retention | reviewed migration under `supabase/migrations` |
| Cross-owner and retention verification | focused pgtap under `supabase/tests` |
| Aggregate beta report | `scripts/report-product-insights.mjs` or reviewed service-role SQL |

Names may change, but the ownership does not: feature code cannot construct
untyped payloads, the domain cannot import Supabase or React, presentation copy
does not become an identifier, and the reporting layer cannot become a mobile
data-access path.

## Delivery slices

### Slice 1 — Analytics foundation

- Finalize privacy copy, disclosures, and improvement-data preference behavior.
- Add the typed contract, bounded owner-scoped offline queue, delivery/backoff,
  hosted schema, RLS, retention job, account-deletion integration, and aggregate
  report scaffold.
- Instrument the recommended journey, decision-review-to-practice route,
  learning completions, checkpoint resume, and stable flow errors.
- Run source scanning, payload corpus, cross-user isolation, opt-in/opt-out,
  account-switch, deletion, offline/retry, retention, migration replay, and
  secret-bundle tests before enabling the distributed release flag.

### Slice 2 — Instrumented beta and decision

- Distribute one explicitly consenting instrumented beta cohort after all Slice
  1 and release gates pass.
- Observe the full declared UTC window; do not end the cohort early because an
  initial result appears favorable.
- Produce the aggregate activation, completion, continuation, conversion,
  return, coach-usefulness, and reliability report with cohort suppression.
- Pair the numbers with categorized tester feedback and direct beginner QA.
- Write the Phase 18 recommendation from evidence and record which hypotheses
  remain unproven.

## Automated acceptance

- Product analytics accept only typed allowlisted events and reject unknown,
  future-version, prohibited, or oversized properties before queueing and again
  before persistence.
- No event is created while consent is off. Disabling consent atomically stops
  collection and clears the unsent queue; an in-flight delivery cannot recreate
  it afterward.
- Offline retries are idempotent, bounded, owner-scoped, and safe across app
  relaunch, account switch, malformed persistence, and server rejection.
- Anonymous user A cannot read, forge ownership of, update, or delete user B's
  events. Mobile users cannot read their own raw events through the Data API.
- Database constraints and RLS reject unrecognized names, properties, schema
  versions, owner IDs, timestamp windows, and oversized payloads independently
  of client validation.
- Account deletion removes local queues and hosted raw events. Network failure
  does not prevent a normal local reset, and retry does not restore a deleted
  owner's events.
- The retention job deletes expired rows in bounded, indexed batches and leaves
  newer rows intact. Aggregate output suppresses every below-threshold cohort.
- Source and built-bundle scans find no service-role/secret credential and no
  prohibited event property producer.
- Full typecheck, unit suite, migration replay, database lint/advisors, pgtap,
  Edge/runtime verification where used, and `git diff --check` pass.

## Manual and release acceptance

- On a fresh install, collection is off and no event or queue entry appears.
- Enabling consent starts only future collection; it does not backfill earlier
  activity.
- Disabling consent online and offline stops new events and clears queued ones.
- Account switching never sends one owner's queued event as another owner.
- Account deletion clears local and hosted raw data while the app remains usable
  offline afterward.
- English, Simplified Chinese, and Traditional Chinese explain the preference
  and retention accurately at large text sizes and through screen readers.
- App Store and Play Console privacy answers match the enabled build exactly.
- Two authenticated test users prove cross-owner denial on the hosted project.
- The reporting command records its UTC window and produces only suppressed or
  aggregate output—never raw owner rows.

## Explicitly deferred

- Advertising attribution, third-party analytics SDKs, ad identifiers, device
  fingerprinting, or cross-app tracking
- Raw poker-hand, action, wager, room, table-moment, identity, avatar, or replay
  telemetry
- Remote experimentation, feature flags driven by individual behavior, or
  personalized pricing
- Public dashboards or client-visible raw-event history
- Free-text product feedback inside automatic event payloads; continue using the
  bounded explicit beta-feedback workflow instead
- Accounts, rankings, leagues, public matchmaking, subscriptions, chip
  purchases, prizes, or other monetization work

## Phase exit

Phase 17 is complete only when the opt-in pipeline is proven in a
production-like hosted environment, the declared beta window finishes, the
minimum-cohort aggregate report is reproducible, tester feedback is categorized,
and an evidence-bounded Phase 18 recommendation is written. Shipping the event
table, preference, or instrumentation code alone does not complete the phase.
