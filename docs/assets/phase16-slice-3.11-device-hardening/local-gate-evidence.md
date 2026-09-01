# Slice 3.11 device hardening — local gate evidence

- Branch: `local/slice-3.11-device-hardening`
- Start base commit: `d7bdb185`
- Final tested code commit: `84b45a05`
- Signed/installed candidate commit: `84b45a05`
- Agent-comparison article: `f2b20ff1`
- iOS crash fix preserved: `092e8f8e` (`fix(table): avoid orientation lock during mount`) — confirmed an ancestor of HEAD.

## Checkpoint commit map

| Checkpoint | Commit | Findings |
| --- | --- | --- |
| C — Play/Home simplification | `aa671691` | DT-03 / DT-09 / DT-10 / DT-11 |
| A — Table geometry and trust | `7970702d` | DT-01 / DT-02 / DT-05 / DT-06 / DT-12 |
| B — Identity and overlays | `ea613912` | Initial DT-04 / DT-07 / DT-08 implementation |
| E — duplicated overlay and measured-bubble closure | `e24348a5` | Private profiles/stats during live turns; local/private rendered bubble measurement; four-edge modal safety |
| F — production avatar durability | `a20dbdab` | ImageManipulator cache output moved into app documents before registry persistence |
| G — one AI stack contract | `6f816206` | Practice and Sit & Go both expose 800 / 2,000 / 4,000 |
| H — physical screenshot follow-up | `84b45a05` | No inline AI/cup collisions; live-orientation safe areas; one lobby/live clockwise ring; 10-second hand interval |
| Agent field report | `f2b20ff1` | Evidence-based DeepSeek Vision / Qwen / GLM comparison |

## Mandatory local gates

The final follow-up commands below ran against code commit `84b45a05` on 2026-09-01 with Node 22.19, pnpm 10.30.1, Supabase CLI 2.116.0, and the local `rivermind-poker` stack.

| Gate | Command | Result |
| --- | --- | --- |
| Typecheck | `pnpm typecheck` | PASS — `tsc --noEmit` clean |
| Full unit/localization suite | `pnpm test` | PASS — 175 files / 1,891 tests / zero failures |
| Real HTTP multiplayer integration | `pnpm test:multiplayer-integration` | PASS — 19/19 through the real local worker/database and production parser |
| Edge worker boundary | `pnpm verify:multiplayer-edge` | PASS — exact production/preview multiplayer and account-deletion workers bundle and pass authenticated boundaries |
| Local pgTAP corpus | `supabase test db --local supabase/tests` | PASS on final rerun — 7 files / 245 assertions / zero failures |
| Release configuration | `pnpm verify:release-config` | PASS — RiverMind iOS/Android 1.0.0 |
| Mobile secrets | `pnpm verify:mobile-secrets` | PASS for tracked source |
| Hosted preview smoke | `pnpm verify:multiplayer-preview` | PASS after preview-only deploy — avatar authorization, create, join, liveness, ready, start, and sync with two disposable hosted identities; cleanup passed |
| Whitespace/conflict markers | `git diff --check` | PASS |
| Production JS export | `NODE_ENV=production pnpm exec expo export --platform ios --platform android ...` | PASS — iOS and Android Hermes bundles/assets; not signed native builds |

### pgTAP residue note

The first two all-file pgTAP attempts failed only assertion 61 in `multiplayer_rls_test.sql`: the maintenance function found one additional expired disposable room and two additional expired request-limit buckets left by local harness activity. The actual result was `deletedRooms:2/deletedLimits:3` instead of the fixture-only `1/1`; all other 244 assertions passed.

The local maintenance function was then run once outside the test transaction. It removed exactly one expired room and two expired request-limit rows. The untouched seven-file corpus was rerun and passed 245/245. No hosted database was queried or mutated.

## Focused regression evidence

| Boundary | Evidence |
| --- | --- |
| Private read-only overlays | `multiplayerReadOnlyOverlay.test.tsx` renders the continuing Your turn/deadline notice and proves read-only access stays openable during a live decision. Production private-table handler removal and auto-dismiss paths were deleted. |
| Local/private edge bubbles | `multiwayGameplayPresentation.test.ts` plus `multiplayerBubbleLayout.test.ts`: native rendered content size, seat frame, safe pane, and protected board lane drive placement; outer left/right anchors bias inward, flip, and clamp with the tail still aimed at the plaque. |
| Landscape modal hardware safety | `ModalSafeArea.test.ts`: asymmetric live/initial left/right insets survive rotation handoff; `ModalSafeArea` applies all four edges. |
| Uploaded avatar production chain | `avatarUploadClient.test.ts`: a real production-client mock returns only a document-directory URI after moving the ImageManipulator cache artifact. `avatarUploadService.test.ts` proves every compression rung shares one avatar ID; component, registry, and cleanup suites cover rendering/authorization/replacement/removal. Five focused files pass 95/95. |
| AI stack choices | `AI_PLAY_STACK_PRESETS` is the single contract consumed by Practice and Sit & Go; `playPresentation.test.ts` pins `800/2,000/4,000` and the 2,000 default. |
| Existing DeepSeek fixes | The full suite retains the portrait expansion, bidirectional local safe areas, viewer-relative clockwise order fixtures, AI border tab, direct Home tools, four public AI tiers, Championship cleanup, and three-locale catalogs. |
| Private plaque identity markers | `multiplayerPlaqueLayout.test.ts` pins AI to a dashed boundary and winners to a winner boundary; both inline AI labels and inline winner icons are forbidden by the presentation contract. |
| Lobby/live seat continuity | `multiplayerUx.test.ts` asserts the prepared-room and live nine-seat phone surfaces use the identical viewer-relative clockwise anchor array. |
| Rotation handoff | `ModalSafeArea.test.ts` asserts the live landscape side replaces the stale opposite/portrait insets rather than accumulating padding from both orientations. |
| Next-hand pacing | `coordinator.test.ts` pins the canonical server-owned interval to exactly 10,000 ms and retains pause/resume recovery coverage. |

## Production bundle evidence

Final follow-up export directory: `/tmp/rivermind-device-followup-export.DY7TOM`

- Android: `_expo/static/js/android/index-3003064411af36694b1f8fa075c99633.hbc` (~6.10 MB)
- iOS: `_expo/static/js/ios/index-9efe23b4ecb880249b54a658e4357bc1.hbc` (~6.09 MB)

This is a Metro/Hermes bundle check, not a signed build. It does not replace a physical install, TestFlight processing, or runtime network QA.

## Signed iPhone candidate and install evidence

- Artifact: `artifacts/rivermind-slice-3.11-device-followup-84b45a05.ipa`
- SHA-256: `88f078e1d834fb831bb2a5c506c5211a7e42cf6e28206a97534cd96bdca89455`
- Size: 15,981,396 bytes
- App identity: `dev.isw.rivermindpoker`, version `1.0.0`, build `28`, Team ID `F9XW9FCX92`
- Distribution: signed ad-hoc preview; provisioning profile includes `Hyu17ProBlue` (`00008150-000225982680401C`) and expires 2027-08-01
- Compiled configuration check: a binary-safe scan finds `multiplayer-room-preview` in `main.jsbundle`
- Install: `xcrun devicectl device install app` succeeded over the existing app without uninstalling it; `xcrun devicectl device process launch` then successfully launched the bundle identifier

The final follow-up archive used `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer` (Xcode 26.6), archived, signed, and exported successfully. No source or dependency workaround was committed.

The isolated hosted QA worker was advanced from `multiplayer-room-preview`
version 1 to version 2 before this install. The canonical production
`multiplayer-room` worker remained version 7. No migration, SQL deployment,
production-worker deployment, championship reset, or other user-data mutation
was part of the follow-up.

This proves signing, provisioning, install-over, compiled preview routing, and process launch. It does not prove the visual, interaction, persistence, network, accessibility, or performance behaviors that still require hands-on observation below.

## Still pending — not waived

1. Re-run the five screenshot cases on the installed exact candidate: AI names remain unobstructed, winner names have no cup overlay, landscape uses only the current camera-side inset, the prepared room and live hand keep every player in the same seat, and the visible next-hand clock begins from the 10-second server interval (minor display/transport latency is expected).
2. Verify that the previously selected HEIC/JPEG avatar survived install-over and relaunch, then verify it on Profile, Home, local/private plaques, popups, results, and replay.
3. Physical portrait and both landscape directions on a notched/Dynamic-Island iPhone, including outermost left/right bubbles at all supported text scales and locales.
4. Physical tap/focus checks for AI, other-human, and viewer plaques plus Profile/Table stats during a live timed decision; opening/closing must not reset the deadline.
5. Two capability-4 devices for create/join, heartbeat silence, airplane mode, reconnect, Leave, rebuy, Return next hand, ledger/stat convergence, and room-private avatar sharing.
6. VoiceOver/TalkBack and the three-locale dark/light visual matrix.
7. Sustained nine-seat all-Nemesis performance.
8. TestFlight processing/distribution for an iOS candidate and a signed Android build containing the full follow-up through `84b45a05`. The signed iOS ad-hoc preview candidate is complete.

## Honest status

**Automated/local closure, isolated preview-worker deployment/smoke, and the corrected signed iPhone install/launch are complete; hands-on physical-device and release approval remain pending.** The follow-up candidate is installed over the prior build. The remaining items require hands-on observation, a second capable device, accessibility interaction, performance observation, TestFlight processing, or signed Android distribution and are not represented as complete by a successful launch.
