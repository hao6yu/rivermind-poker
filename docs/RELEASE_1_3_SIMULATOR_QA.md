# Release 1.3 — simulator QA report

Status: living document for owner review. Established on two Android emulator clients (Pixel-6-class API 35 AVDs), local-release build `RiverMind-23a2ee64-20260910-010039` (HEAD `23a2ee64` + working tree, Hermes, no dev server), both connecting to the production Supabase project from `.env`. Harness: `scripts/a2_harness.sh` + `scripts/a2_two_client_gate.py` (adb + uiautomator driving, per-step authoritative comparison). Physical-device feel, haptics judgment, and screen-reader hardware QA are out of scope per the release plan.

## Gate results (A2 reliability matrix)

| Scenario | Result | Evidence |
| --- | --- | --- |
| Create room → lobby (host) | PASS | Rooms 4051026, 4421855, 4836563, 4565140, 4226134, 4120889 across runs |
| Guest join via invite deep link → lobby → ready | PASS | Deep link `rivermind://join?code=…`; replacement/saved-room dialogs handled |
| Host ready → start → both clients at table | PASS | `multiplayer.table.pot` present on both |
| Authoritative agreement at the table (pot, hand, stacks) | PASS | e.g. `{pot: 30, hand: 1:Preflop}` identical on both; post-recovery `{pot: 20, hand: 1:Complete}` identical |
| Guest background/foreground recovery | PASS | Agreement held after HOME + relaunch |
| Guest network interruption (airplane toggle) | PASS | Agreement held after disable + resync |
| Guest process death → relaunch → reconnect | PARTIAL | Guest returns interactive reliably; reconnect via invite deep link works, but the Home continue-card path is dead (finding 3) and rejoin into a finished session raises finding 1's dialog |
| Host departure (transfer/continuation surface on guest) | PENDING | Preconditions lost in the run environment; needs a long-session rerun |
| Sit-out recovery | PASS (observed live, repeatedly) | Missed turns auto-sat the guest out; the unified status area rendered the sitting-out state with its recovery action; the "Return next hand" action succeeded **31 times across one 15-minute session** (round 21 legs run) — the strongest live validation of the A2 status area |
| Host departure | PASS + stalled-state verified | Force-stopping the host mid-session: the guest observed the departure and stayed on a usable table surface; the room then entered the **stalled between-hands state live** — "Waiting for players to return" rendered twice (panel + note) with the sitting-out status area and its recovery action still present on the same screen (round 24 follow-up dump) |
| Pause/resume via between-hands countdown | Root cause found; needs a clean session | Full causal chain established (round 25 burst captures): the leg requires an auto-deal countdown, which only arms in a healthy room; the automated sessions always degrade into the stalled state ("Waiting for players to return") because (a) the two-driver taps create version conflicts and (b) the create flow leaves AI seats unfilled and the Add AI control does not respond to automation taps — with the host sitting out, fewer than two active funded participants remain and the room stalls permanently. The pause/resume commands are covered by coordinator unit tests. Clean-session recipe: pm clear → onboarding → create with verified AI fill → run matrix e FIRST |
| Session completion + rematch | Harness iteration needed | The sat-out guest cannot fold, so the scripted completion path stalls; a working guest (via the recovery action) plus a longer window is required — the rematch surface is covered by the summary modal tests |
| Rebuy | Impractical via automation | Requires a busted viewer; needs a manual/owner-assisted run |

## Findings (for fine-tuning decisions)

1. **Recurring blocking conflict dialog.** A stale table command can raise "Could not update table — RiverMind could not verify that table update. Sync and try again. [OK]"; dismissal does not stop it from re-raising while the failing command keeps retrying. The table is unusable until the app is restarted. Suggested direction: dedupe repeated identical conflicts behind one in-context banner with a single retry action (A2's error-in-context requirement).
2. **First relaunch after process death is touch-dead (release build).** Force-stopping the app mid-session and relaunching renders the UI but ignores all touch input; killing and relaunching a second time recovers. Reproduced on the local-release build (not a Metro artifact). Root cause not yet attributed (no ANR, no frame skips, single app window, activity resumed). Working hypothesis for the next dedicated session: a synchronous storage call at startup (the app's sqlite-backed profile/history layer runs on the JS thread) blocking after an unclean mid-write termination — this matches "renders once, then never responds" and the clean second-restart recovery. Verification needs Metro attached to observe the JS thread live.
   **Reproduction status (round 21): the gate now detects it automatically** — the guest interactivity check ran False on the first relaunch in one gate run (previous runs: True), confirming the state is intermittent (roughly 1-in-N process deaths) and reproducible through the harness. The root-cause session can iterate: gate run → if touch-dead, Metro-attached relaunch to observe the JS thread.
   **Root-cause evidence captured (round 23, debug build + Metro attached).** The freeze window's logcat shows two signatures on the relaunched guest:
   1. `WindowManager: Exception thrown during dispatchAppVisibility Window{…MainActivity EXITING} android.os.DeadObjectException` — the old process was still tearing down while the new one started (force-stop + immediate relaunch race).
   2. `BridgelessReact: ReactHost.raiseSoftException(onWindowFocusChange(hasFocus="true")): Tried to access onWindowFocusChange while context is not ready` + `Unhandled SoftException` — the new process's React host received the window-focus callback before its context was ready and **swallowed the exception**, leaving the resumed surface without a functioning input pipeline. The UI renders (first commit precedes the race) but JS touch dispatch never engages.
   Root cause: an RN 0.81 BridgelessReact startup race between window focus and React context readiness, triggered by force-stop + immediate relaunch. A second restart recovers because the timing differs. App-side mitigation to evaluate: delay the first relaunch after a force-stop by ~2–3s at the shell level (the recovery path in the gate applies this), and/or file the RN issue upstream. Product copy unaffected — the recovery is a plain app restart. Investigation setup ready: debug APK rebuilt (the release script's prebuild had wiped it), Metro serves the current tree; the repro needs both emulators on the debug build mid-session (the gate script reaches that state reliably) — add a mid-session force-stop hook to the gate and watch the Metro console. Note: emulator-5554 has been occupied by another application; the repro defers until it is free.
3. **Home continue-card handler dead after process death.** After a relaunch in that state, tab navigation works, but the "Continue playing — Friends are waiting at table X" card never opens the multiplayer flow (no JS error in logcat). The invite deep link for the same room works, so guests can always rejoin by re-sharing an invite. **Likely the same root cause as finding 2**: both are JS touch-dispatch failures after process death (finding 2 = the whole surface, finding 3 = a single control within an otherwise responsive surface — the variation may depend on when the React context settled relative to the focus race).
4. **Rejoin into a finished session lacks an in-context next action.** With the 10-hand default limit, a returning client can rejoin a room whose session already completed and land in the conflict-dialog path of finding 1 instead of a "session complete — rematch/new table" surface. Routing note: `activeGame` (MultiplayerFlowModal line ~1009) sends non-lobby room statuses to the game table, so the exact lobby-vs-table state a rejoiner sees needs a controlled repro before the fix lands; a Ready control whose command can only conflict is the wrong surface either way.

**Fix shipped for finding 1** (this round): identical consecutive table-error alerts are deduped behind a 60s quiet window (`shouldShowTableErrorAlert` in `multiplayerErrorPresentation.ts`, wired into the flow modal's `showError`); a different error always shows. Regression: `multiplayerErrorPresentation.test.ts` (4 cases).
5. **Positive: the unified table status area worked in a real recovery.** The sitting-out state (after missed turns) rendered the status line plus "Return next hand" on the affected client while the other client's authoritative view agreed.

## Simulator layout QA (complete — owner review pending)

26 screenshots captured on the release build: light and dark modes at 2/3/6/9 seats (portrait + landscape each), plus 1.3× text scale at 2/3 seats — all in `artifacts/android/release-1-3-qa/`. Capture flow: `e2e/maestro/release-1-3-layout-capture.yaml` (maestro handles element waiting/re-resolution natively; the raw uiautomator tap loop proved too flaky against the animated hub).

Pre-review (agent, round 18): reviewed light-9-seat portrait, dark-9-seat landscape rail, and 1.3×-text 2-seat portrait. No defects found — dealer/blind markers, folded states, hero cards, coach panel, and the secondary-actions menu (bottom-right, unread-badge counter) are legible and collision-free; the 1.3× "Raise to 50" action label wraps to two lines without clipping, and the coach recommendation matches the primary action's amount. Owner review checklist per capture: dealer/blind markers legible, active-seat emphasis visible, names/stacks readable, action badges complete, no overlay collisions (result summary vs. reactions vs. profiles), safe-area insets respected at each seat count, large-text wrapping without clipping.

Residual: physical-device rotation/foldable continuity (the perimeter layout fixes were verified at HEAD by prior device QA) and screen-reader traversal are out of scope here per the release plan.

## B2 tournament HUD — verified live in Championship (round 18)

Captured in the real Championship flow on the debug build (`champ-map`, `champ-table-hud-portrait`, `champ-hud-drawer`, `champ-table-hud-landscape` in the same folder):

- The bubble milestone fired correctly from live state (3 players remaining, top-2 target).
- The standings drawer opened with full-width rows: viewer highlighted at #1 with stack, opponents named with stacks.
- The compact line rendered the full status ("#1 · 3 left · Top 2 qualifies · 10/20 · 4 hands to next level") with the milestone badge — and never covered the legal action row.
- Defect found AND fixed live: the control rail shrink-wrapped the HUD, collapsing its flex:1 status text to zero width and truncating drawer names to one character ("L…"). Fix: the HUD host stretches to the rail width (`TournamentHudView` `host` style). Verified by the post-fix captures in this folder.
- Fine-tuning items for the owner: the last HUD segment truncates at this width ("4 hands to ne…"); the viewer row rendered "You · You" when the profile name is the default (fixed in the same pass).

## Reproduction commands

```bash
# harness (boots both emulators, installs, runs the gate):
scripts/a2_harness.sh
# release APK for the gate:
scripts/build-android-local-release.sh
GATE_APK=artifacts/android/<apk> scripts/a2_harness.sh
# gate only (emulators already up):
python3 scripts/a2_two_client_gate.py
```
