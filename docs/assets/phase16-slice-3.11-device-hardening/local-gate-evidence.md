# Slice 3.11 device hardening — local gate evidence

- Branch: `local/slice-3.11-device-hardening`
- Start base commit: `d7bdb185`
- Final tested code commit: `6f816206`
- Signed/installed candidate commit: `a0278eea` (documentation-only commits after `6f816206`; no later runtime change)
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
| Agent field report | `f2b20ff1` | Evidence-based DeepSeek Vision / Qwen / GLM comparison |

## Mandatory local gates

All commands below ran against code commit `6f816206` across 2026-08-31 and 2026-09-01 with Node 24.19, pnpm 10.30.1, Supabase CLI 2.116.0, and the local `rivermind-poker` stack.

| Gate | Command | Result |
| --- | --- | --- |
| Typecheck | `pnpm typecheck` | PASS — `tsc --noEmit` clean |
| Full unit/localization suite | `pnpm test` | PASS — 175 files / 1,884 tests / zero failures |
| Real HTTP multiplayer integration | `pnpm test:multiplayer-integration` | PASS — 19/19 through the real local worker/database and production parser |
| Edge worker boundary | `pnpm verify:multiplayer-edge` | PASS — exact production/preview multiplayer and account-deletion workers bundle and pass authenticated boundaries |
| Local pgTAP corpus | `supabase test db --local supabase/tests` | PASS on final rerun — 7 files / 245 assertions / zero failures |
| Release configuration | `pnpm verify:release-config` | PASS — RiverMind iOS/Android 1.0.0 |
| Mobile secrets | `pnpm verify:mobile-secrets` | PASS for tracked source |
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

## Production bundle evidence

Export directory: `/tmp/rivermind-device-hardening-export.a5BCCz`

- Android: `_expo/static/js/android/index-326b2d6de062b42b70e202eacc302a44.hbc` (~6.10 MB)
- iOS: `_expo/static/js/ios/index-eb56a968669ad66fdb0fc72669b340e0.hbc` (~6.09 MB)

This is a Metro/Hermes bundle check, not a signed build. It does not replace a physical install, TestFlight processing, or runtime network QA.

## Signed iPhone candidate and install evidence

- Artifact: `artifacts/rivermind-slice-3.11-device-closure-a0278eea.ipa`
- SHA-256: `0cdd5518af6b18c8300b162019974da6c05b21c02f815ed24b7cca3f935302d3`
- Size: 15,982,062 bytes
- App identity: `dev.isw.rivermindpoker`, version `1.0.0`, build `28`, Team ID `F9XW9FCX92`
- Distribution: signed ad-hoc preview; provisioning profile includes `Hyu17ProBlue` (`00008150-000225982680401C`) and expires 2027-08-01
- Compiled configuration check: `multiplayer-room-preview` is present in `main.jsbundle`
- Install: `xcrun devicectl device install app` succeeded over the existing app without uninstalling it; `xcrun devicectl device process launch` then successfully launched the bundle identifier

The first local archive attempt selected Xcode 27 beta and failed because it rejects two legacy CocoaPods deployment-target declarations. Retrying the same clean commit with `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer` (Xcode 26.6) archived, signed, and exported successfully. No source or dependency workaround was committed.

This proves signing, provisioning, install-over, compiled preview routing, and process launch. It does not prove the visual, interaction, persistence, network, accessibility, or performance behaviors that still require hands-on observation below.

## Still pending — not waived

1. On the installed exact candidate, verify that the previously selected HEIC/JPEG avatar survived install-over and relaunch, then verify it on Profile, Home, local/private plaques, popups, results, and replay.
2. Physical portrait and both landscape directions on a notched/Dynamic-Island iPhone, including outermost left/right bubbles at all supported text scales and locales.
3. Physical tap/focus checks for AI, other-human, and viewer plaques plus Profile/Table stats during a live timed decision; opening/closing must not reset the deadline.
4. Two capability-4 devices for create/join, heartbeat silence, airplane mode, reconnect, Leave, rebuy, Return next hand, ledger/stat convergence, and room-private avatar sharing.
5. VoiceOver/TalkBack and the three-locale dark/light visual matrix.
6. Sustained nine-seat all-Nemesis performance.
7. TestFlight processing/distribution for an iOS candidate and a signed Android build containing `e24348a5`, `a20dbdab`, and `6f816206`. The signed iOS ad-hoc preview candidate is complete.

## Honest status

**Automated/local closure and one signed iPhone install/launch are complete; hands-on physical-device and release approval remain pending.** The Supabase Edge gate that DeepSeek could not run is now green, the missing overlay render seam is present, and the corrected preview candidate is installed over the prior build. The remaining items require hands-on device observation, a second capable device, accessibility interaction, performance observation, TestFlight processing, or signed Android distribution and are not represented as complete by a successful launch.
