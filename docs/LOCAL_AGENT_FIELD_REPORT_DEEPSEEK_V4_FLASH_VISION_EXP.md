# RiverMind local-agent field report — DeepSeek V4 Flash Vision Exp, Qwen, and GLM

Date: 2026-08-31  
Project: RiverMind Poker, Phase 16 Slices 3.9–3.11  
Environment: owner-operated local agents on TP2 GX10 servers

## Executive verdict

For the last three RiverMind rounds, **Qwen was the strongest closer**, **GLM was the strongest broad hardening reviewer**, and **DeepSeek V4 Flash Vision Exp was the strongest visual first-pass agent but the weakest end-to-end closer**.

That ranking is specific to these repository tasks. It is not a general model leaderboard: the agents received different assignments, no common token/time budget was recorded, and Qwen was given a particularly well-defined follow-up document with known findings. The useful conclusion is how to deploy them:

- Use DeepSeek Vision to inspect screenshots, translate visual defects into implementation hypotheses, and make a fast first UI pass.
- Use Qwen for a bounded server/protocol hardening goal where real HTTP, database, and failure-path proof are mandatory.
- Use GLM for broad adversarial review across neighboring client, persistence, accessibility, and localization paths when longer turnaround is acceptable.
- Keep a final independent repo-wide audit before merge, regardless of model.

## Release context for the new DeepSeek model

The “released today” description needs one date distinction. DeepSeek made the hosted `deepseek-v4-flash-vision-exp` API available on **2026-08-21**, according to the [official API changelog](https://api-docs.deepseek.com/updates/) and [release note](https://api-docs.deepseek.com/news/news260821/). The official Hugging Face repository metadata records the open model repository as created on **2026-08-31**, so today is the open-repository/model-card publication date rather than the first API availability date: [model repository](https://huggingface.co/deepseek-ai/DeepSeek-V4-Flash-Vision-Exp), [repository metadata](https://huggingface.co/api/models/deepseek-ai/DeepSeek-V4-Flash-Vision-Exp).

DeepSeek describes it as the first experimental multimodal model in the V4 family. Its model card reports stronger multimodal-agent results than V4 Flash 0731 while retaining similar text-agent performance. Those are vendor-reported benchmark results under DeepSeek’s harness settings; this article does not use them to score the RiverMind work. See the [official model card](https://huggingface.co/deepseek-ai/DeepSeek-V4-Flash-Vision-Exp) and [vision API guide](https://api-docs.deepseek.com/guides/vision/).

## Evaluation method and limits

This is a field report from real work in one repository, based on committed diffs, fail-before/pass-after regressions, release records, and the independent follow-up audit. It compares the latest substantial round from each local agent:

| Agent | Reviewed work | Primary task shape |
| --- | --- | --- |
| GLM | Slices 3.9/3.10 hardening, commits `cfa45430` through `78c72639` | Broad adversarial review and repair across history, statistics, moments, accessibility, seat negotiation, tests, and localization |
| Qwen | Slice 3.11 follow-up, commits `a353b719` through `94784c74` | Five named multiplayer findings plus adjacent server, SQL, HTTP, lifecycle, and rendered-UI regressions |
| DeepSeek V4 Flash Vision Exp | Slice 3.11 device hardening, commits `aa671691` through `8f626054` | Screenshot-led UI/UX repair across table layout, order, identity, Play, Home, localization, and QA notes |

The comparison is not controlled in four important ways:

1. The task scopes were different. Qwen’s round was backend-heavy; DeepSeek’s round was explicitly visual; GLM’s was broader and less visually grounded.
2. Qwen received a detailed goal containing already-identified Q1–Q5 findings. Its result demonstrates execution depth more than independent issue discovery.
3. The exact Qwen variant, inference settings, prompt lengths, token usage, and wall-clock times were not recorded in the repo. GLM felt slow in owner use, but no comparable timing telemetry exists.
4. The post-DeepSeek Codex fixes are not credited to DeepSeek. They are retained here precisely to measure what its final branch did and did not close.

## What GLM did well

GLM’s strongest property was breadth. Across Slices 3.9 and 3.10 it found and repaired issues that crossed feature boundaries rather than staying inside a single component:

- nine-seat hand-history retention;
- truthful partial, mixed, and capped profile statistics;
- table-flow accessibility escape;
- atomic human and AI moment delivery;
- join-time seat-count capability negotiation;
- hardened Maestro regression flows;
- localized wording that qualified “most recent” as finished hands rather than recent tables.

Its ten-commit chain is coherent and the later copy correction was narrowly scoped. The work showed good adversarial instincts around misleading UI truthfulness and data-loss boundaries. Its main operational weakness was turnaround speed, based on owner observation, and it still left hosted two-device, VoiceOver, dashboard, signing, and TestFlight work as manual gates. That pending list was appropriate rather than a failure.

**Best role:** broad second-pass reviewer for a mature change set, especially where client behavior, persistence truthfulness, accessibility, and localization interact.

## What Qwen did well

Qwen produced the strongest closure evidence of the three rounds. It traced five supplied findings through the complete multiplayer stack and found adjacent defects while proving the fixes against real boundaries:

- raised the archive path from a six-human ceiling to the canonical nine-human roster;
- archived only humans actually dealt into a settled hand;
- made Leave emit one public enforced Fold and gave the successor a fresh clock;
- added server-observed seat liveness so silent clients cannot receive a courtesy Check;
- restored host End session from every settled branch;
- caught an omitted-returner settlement misclassification and invalid protocol `-1/0` normalization.

The final evidence included 1,792 unit tests, 17 real-HTTP cases, 243 pgTAP assertions, Edge verification, release configuration checks, mobile-secret checks, and iOS/Android JS exports. More important than the counts, the tests operated at the failure boundaries that caused the bugs: worker request parsing, real SQL constraints, RLS, persisted action rows, deadlines, and rendered control composition.

Qwen’s caveat is fairness of discovery: Q1–Q5 were handed to it in a focused goal. It deserves credit for root-cause depth, adjacent findings, and proof, but this round alone does not show whether it would have independently discovered the same five issues from screenshots or a vague hardening request.

**Best role:** implementation closer for a sharply defined protocol/database goal with explicit fail-before/pass-after and real-service gates.

## What DeepSeek V4 Flash Vision Exp did well

DeepSeek understood the screenshots well and converted many visible problems into useful product changes:

- expanded the portrait felt into otherwise unused height;
- added bidirectional landscape safe-area handling on the local table path;
- corrected the viewer-relative clockwise seat projection without rewriting the poker engine;
- moved the AI marker out of the name lane;
- simplified the Championship entry and public AI choices;
- added direct Home poker tools and the more personal player-roster branding;
- added meaningful layout/order tests and kept all three locales in scope.

The branch was structured into clean checkpoints and its own final report did not falsely claim device completion. That honesty matters. The model’s visual input was genuinely useful: it recognized layout waste, badge/name collisions, spatial order, and navigation friction with less translation from screenshot to code than a text-only review would require.

**Best role:** screenshot-driven triage, UI hypothesis generation, and a first implementation pass whose acceptance criteria are mostly local and visual.

## Where the DeepSeek round fell short

The independent audit found four important gaps behind a report that said all DT-01–DT-12 fixes had landed:

1. **Duplicate private-table paths were missed.** The local table allowed profiles/history during the viewer’s turn, but the private table still disabled or auto-dismissed the equivalent Profile and Table stats sheets.
2. **The reported edge-bubble fix was not end-to-end.** Local placement used nominal dimensions, and the exact private-table path from the report still used percentage anchors without a measured safe pane.
3. **The avatar “durability” fix did not change persistence.** It extracted the authored asset map and seeded a render test with a cache URI, while Expo ImageManipulator’s production `saveAsync()` artifact still lived in cache and could be purged. The app needed to move the file into document storage before persisting the registry URI. This follows Expo’s own contracts: [ImageManipulator saves to cache](https://docs.expo.dev/versions/v54.0.0/sdk/imagemanipulator/#saveasyncoptions), while [the FileSystem document directory is protected from ordinary system deletion](https://docs.expo.dev/versions/v54.0.0/sdk/filesystem/#paths).
4. **Sit & Go still offered 800/1,200/2,000.** The product decision required the compact 800/2,000/4,000 choices in both Practice and Tournament formats.

These are scope-tracing failures, not failures to understand the screenshot. DeepSeek fixed the visible local surface but did not consistently follow shared behavior into duplicated multiplayer, native-file, and alternate-format paths. Its tests often proved a helper or seeded boundary without proving the production chain that created the state.

The takeover closed those gaps in three commits:

- `e24348a5` — private/local measured bubbles, all-edge modal safety, and read-only profiles/stats during live turns;
- `a20dbdab` — production avatar artifacts moved from Expo cache to the app document directory, with storage/cleanup regressions;
- `6f816206` — one shared 800/2,000/4,000 AI stack contract for Practice and Sit & Go.

This does not erase the value of the DeepSeek pass. It defines the supervision it needs today: after a visual fix, require a duplicate-path search, a state-creation-to-render trace, and one production-boundary test before accepting “complete.”

## Comparative scorecard

The labels below mean “performance observed in this RiverMind round,” not general model capability.

| Dimension | GLM | Qwen | DeepSeek V4 Flash Vision Exp |
| --- | --- | --- | --- |
| Screenshot/visual reasoning | Not meaningfully tested | Not meaningfully tested | Strongest observed |
| Broad neighboring-path review | Strong | Strong within supplied scope | Mixed; local path stronger than duplicated/private path |
| SQL/protocol/lifecycle tracing | Strong on assigned multiplayer issues | Strongest observed | Not the main task; insufficient evidence |
| Root-cause depth | Strong | Strongest observed | Good for layout/order; weak for avatar persistence chain |
| Fail-before/pass-after quality | Good | Strongest observed | Good helper coverage, incomplete production-boundary coverage |
| Localization discipline | Strong | Strong | Strong |
| Handoff honesty | Good | Excellent | Good; correctly retained “incomplete” status |
| Owner-observed throughput | GLM felt slow | Not instrumented | Not instrumented |

## Practical recommendation for the GX10 agents

For RiverMind, keep all three rather than selecting one universal winner:

1. Give **DeepSeek Vision** the screenshots plus a bounded UI issue list. Ask it to annotate the likely shared and duplicated surfaces before editing.
2. Give **Qwen** the resulting concrete P1/P2 findings for implementation, especially server state, SQL, Edge, reconnect, and persistence flows.
3. Give **GLM** the combined diff for a broad adversarial review of truthfulness, localization, accessibility, and adjacent regressions.
4. Require the final closer to run the same gates and inspect every duplicated surface named in scope. Do not let a unit count substitute for the exact physical/two-device acceptance matrix.

If only one local agent can run for the next hardening round, choose **Qwen** based on the last three results. If the input is primarily screenshots and the goal is rapid UI diagnosis, choose **DeepSeek V4 Flash Vision Exp**, then budget a separate integration audit. If the goal is broad review and elapsed time is less important, choose **GLM**.

## Next experiment to make the comparison fair

Run the same hidden evaluation packet on all three agents from the same commit and clean worktree. Give each the same time/token ceiling, no pre-labeled root causes, and identical access to screenshots and the local Supabase stack. Score:

- independently discovered P1/P2 issues;
- valid fixes without regressions;
- production-boundary fail-before/pass-after tests;
- duplicate-path coverage;
- localization/accessibility completeness;
- full-gate pass rate;
- wall-clock time and tokens;
- number and severity of findings from the final independent audit.

Until that controlled run exists, the evidence-backed ordering for these rounds is: **Qwen first for closure, GLM second for breadth, DeepSeek Vision first for visual triage but third for unattended completion**.
