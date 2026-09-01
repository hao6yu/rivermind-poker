# Phase 16 Slice 3.11 — Final device follow-up

Status: **implemented and locally verified; physical observation pending**
Branch: `local/slice-3.11-device-hardening`  
Source: physical-iPhone testing after the unified-seat candidate (`c6c18a3e`)

This checklist is the acceptance contract for the remaining device findings. A finding is complete only when the implementation, automated regression evidence, and physical-device recheck agree. Existing screenshots are reference evidence; they are not instructions or a waiver of the checks below.

## F1 — Coach-enabled bottom-seat containment

- [x] Keep the complete viewer plaque, name, stack/status, and both hole cards inside the felt when Coach is enabled.
- [x] Do not solve the clipping by hiding identity or cards.
- [ ] Verify portrait layouts for 3-, 6-, and 9-seat local AI, Sit & Go, and Championship tables, with Coach both on and off.
- [x] Preserve minimum tap targets and supported text scaling in the measured layout contract.

## F2 — One phone header-control system

- [x] Give orientation, guide/help, Coach, history/stats, and mode/status controls a shared phone control frame: equal target size, radius, visual weight, and spacing.
- [x] Use icons plus accessibility labels where text would make one control materially wider than its peers.
- [x] Keep selected/on/busy/disabled states visually distinct and accessible.

## F3 — Championship and action-rail alignment

- [x] Apply the F2 header contract to Championship/Sit & Go modes, including the Tour/status control.
- [x] Make the compact Table feed control the same rendered height as Fold, Check/Call, and Bet/Raise in the bottom action rail.
- [x] Keep the feed count readable without adding a separate content row.

## F4 — Complete countdown messaging

- [x] Render `Countdown paused` and `Next hand in N seconds` without ellipsis or clipping in the settled result state.
- [x] Cover en, zh-Hans, and zh-Hant; existing localized keys are reused without new English-only copy.
- [ ] Verify small phones, supported text scaling, and the rebuy-pending state.

## F5 — Rebuy as a focused decision popup

- [x] Replace the large inline rebuy card with a measured modal decision sheet.
- [x] Reuse the existing server-owned `Rebuy 4,000` and `Sit out` commands; do not create a client-only chip path.
- [x] Keep the settled result readable behind/after the decision and prevent duplicate submissions.
- [x] The popup remains within safe areas, contains modal accessibility focus, and requires one of the two explicit lifecycle decisions.

## F6 — Canonical ten-second next-hand interval

- [x] Audit every local and multiplayer next-hand path; no five- or seven-second authoritative interval remains.
- [x] The authoritative interval is exactly 10 seconds.
- [x] A rebuy decision pauses the countdown without creating a client-owned transition path.
- [x] Add state regressions proving the visible `10` start and the actual transition boundary; the public preview smoke also proves its deployed deadline is exactly 10,000 ms.

## F7 — Compact settled-hand continuation

- [x] Relabel the multiplayer continuation to the localized `Next hand` / `下一手` form.
- [x] On phones, place the compact continuation below the result copy so the explanation owns the full row width; keep the trailing action in landscape where width is available.
- [x] Show a sole-recipient amount once instead of repeating the same payout and final pot; preserve the complete payout breakdown for split and side-pot results.
- [ ] Recheck a fold win, showdown win, and split-pot result on the installed phone in portrait and landscape.

## F8 — Stack-aware cheap-pot AI participation

- [x] Let Friendly/Club opponents occasionally seed an unraised limped pot with the marginal edge of an already-authored opening range.
- [x] Increase the bounded over-limp call share as additional players enter for the blind, without changing any facing-a-raise path.
- [x] Apply the existing short-stack discipline after the cheap-pot adjustment and keep disconnected trash outside the playable range.
- [x] Keep the neutral teaching/range-explorer baseline unchanged and preserve disciplined Elite/Nemesis first-in play.
- [ ] Recheck a sustained 6- and 9-seat Club session on device for visibly healthier cheap-flop participation without calling-station behavior.

## F9 — Durable iPhone avatar replacement

- [x] Generate uploaded-avatar identifiers from native secure random bytes; never reuse the zero-filled fallback identifier produced by the previous release build.
- [x] Reserve the current profile reference and every registry identifier before creating a replacement, including when a stale profile no longer has a registry row.
- [x] Persist and re-read the exact avatar id/version/URI before updating the profile, and refuse the profile change if that durable registry entry is missing.
- [x] Close the adjustment editor after a successful save so the refreshed Profile avatar is immediately visible.
- [x] Add regressions for native identifier encoding, collision retry/refusal, durable uploaded rendering, and the real picker-to-profile save boundary.
- [x] Install the signed fix over the affected physical-iPhone app without uninstalling or clearing its data.
- [ ] On the installed build, select the photo once more, confirm it appears on Profile/Home/Play/game plaques, then terminate and relaunch the app and confirm it remains visible. The photo selected under the broken build must be reselected because that build already removed its file.

## F10 — One-tap reaction dismissal

- [x] Close the reaction list immediately after an accepted reaction tap.
- [x] Preserve queued asynchronous delivery, ordering, and silent/no-cooldown behavior after the menu closes.
- [x] Keep the closed launcher accessible and announce queue status to screen readers without reopening the menu.
- [x] Add a rendered regression proving the selected reaction is queued and the menu immediately returns to its closed launcher.
- [ ] Verify on the installed phone that one reaction tap closes the list and the reaction still appears once at the table.

## Required gate

- [x] Focused render/state tests cover the changed layout, feed, countdown, and rebuy boundaries.
- [x] `pnpm typecheck`
- [x] Full unit suite — 181 files / 1,910 tests.
- [x] Multiway AI evaluation — flop rate 73.1%, multiway-flop rate 22.5%, walk rate 7.2%; all authored realism bounds pass.
- [x] Multiplayer integration/Edge verification — 19 real-HTTP cases plus exact worker-bundle verification.
- [x] Hosted preview create/join/start/settle smoke — exact 10,000 ms deadline and cleanup.
- [x] `pnpm verify:release-config`
- [x] `pnpm verify:mobile-secrets`
- [x] iOS and Android production JS exports
- [x] `git diff --check`
- [x] Install the signed build over the existing physical-iPhone app with no uninstall or data wipe, then launch it successfully.
- [ ] Owner rechecks all rendered findings on the installed phone build.

The remaining unchecked items are hands-on observations, not waived gates. The
installed candidate is
`artifacts/rivermind-slice-3.11-avatar-reaction-b8c4d45f.ipa` (app 1.0.0 build
28, SHA-256
`bc6114c7f479bb0b222be203b674a132400492e2b38bdc1c61c35bcbc8105b98`).
Automated install and launch prove packaging and install-over behavior, but the
owner must still inspect the rendered states named above on the phone.

The first local archive attempt inherited Xcode 27 beta and correctly failed on
legacy deployment-target metadata in two dependency pods. The signed candidate
was rebuilt without source changes under the release-configured Xcode 26.6 and
archived successfully; the failed beta archive was not installed or retained as
a candidate.

No merge, push, hosted deployment, migration, Championship reset, TestFlight upload, or production rollout is authorized by this checkpoint.
