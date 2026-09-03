# D04 — Crash reporting decision for Release 1.2 (P18-036 spike)

Status: **decided for Release 1.2 — no crash-reporting SDK is adopted.**
Owner override may revisit this before Phase 18.5's S10 completes D04
permanently; this document is the spike record the plan requires.

## What was reviewed

1. **Phase 17 consent/typing contract** (`docs/PHASE_17_BETA_INSIGHTS_SCOPE.md`
   and the shipped consent surfaces): product analytics already run only
   through the consented, typed contract. A crash SDK would add a second,
   lower-level data path outside that contract.
2. **Payload minimization:** every candidate SDK (Sentry, Crashlytics) captures
   raw exception messages, stack frames with local paths, free-text breadcrumbs,
   and device identifiers by default. Phase 17's boundary — never cards,
   boards, bets, room codes, player names, avatar paths, free text, or raw
   exception strings — cannot be guaranteed on a default crash payload without
   building a full scrubbing layer first. That layer does not exist today.
3. **Deletion behavior:** Phase 17 consent grants review and deletion of
   *consented insight events*. Crash payloads are neither typed nor deletable
   through the existing contract, so adopting an SDK now would create data the
   player cannot inspect or erase.
4. **Release 1.2 need:** the 1.2 defect set is correctness-and-trust work with
   deterministic, test-covered failure states. The new failure paths introduced
   by Phase 18 are:
   - the explicitly ungraded decision diagnostic (`equity-estimate-unavailable`,
     `grading-exception`) — the player sees a stable, honest state; the pinned
     fixtures catch regressions in CI; no telemetry needed to observe it;
   - the sitting-out banner and queued return — player-facing states with
     automated rendered coverage;
   - the release gates themselves (artifact inspection, bundle markers,
     localization, integration harness) — they fail loudly in CI with the gate
     name, without exposing secrets or user data.

## Decision

- **No SDK in Release 1.2** (default D04 upheld). The privacy review found no
  configuration that satisfies payload minimization + consent + deletion with
  the current Phase 17 contract, and 1.2 has no failure that a crash SDK would
  observe better than its gates and visible diagnostics already do.
- **No new diagnostics were added for the ungraded path.** Volume-telemetering
  a per-decision state would contradict payload minimality; the state is
  player-visible and fixture-pinned instead. Existing `recordAppDiagnostic`
  usage is unchanged.
- **Reopening conditions (S10 / Phase 18.5):** if an SDK is proposed, the
  payload allowlist must be reviewed line by line against Phase 17's prohibited
  list, consent must cover crash data explicitly, and deletion must extend to
  crash payloads. Until then the decision stands as recorded here.
