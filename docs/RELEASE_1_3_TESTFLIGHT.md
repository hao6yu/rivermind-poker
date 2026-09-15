# v1.3 TestFlight candidate

Prepared September 14, 2026 (America/Chicago; September 15 UTC).
This records a testing candidate, not public-release sign-off.

## Candidate identity

| Field | Value |
| --- | --- |
| Version / build | `1.3.0 (32)` |
| Source commit | `1e002d92036d4fe9d556b02871c079b205441924` |
| Expo project | `@iswtech/rivermind-poker` |
| EAS profile | `production` — store distribution, remote signing credentials |
| Build ID | `8889ad48-1820-4cf0-b46b-66b787e2b2ed` |
| Bundle identifier | `dev.isw.rivermindpoker` |
| App Store Connect app | `6797011715` |
| Build status | Finished September 15, 2026 at 02:57:30 UTC |
| Submission ID | `dccf0cbe-f43f-466b-aea2-63fffcaae1e1` |
| Submission status | Uploaded successfully to App Store Connect; Apple processing pending at handoff |

[EAS build and logs](https://expo.dev/accounts/iswtech/projects/rivermind-poker/builds/8889ad48-1820-4cf0-b46b-66b787e2b2ed)

[EAS submission](https://expo.dev/accounts/iswtech/projects/rivermind-poker/submissions/dccf0cbe-f43f-466b-aea2-63fffcaae1e1)
· [App Store Connect TestFlight](https://appstoreconnect.apple.com/apps/6797011715/testflight/ios)

The candidate bumps the public version to 1.3.0. EAS allocated build number
32 remotely. The production environment resolves to the existing hosted
Supabase project and the `multiplayer-room-v4` worker. No production backend
configuration was changed during this build preparation.

The downloaded signed IPA independently confirms `1.3.0 (32)`, the bundle
identifier above, iOS 15.1 minimum, iPhone/iPad support, and
`ITSAppUsesNonExemptEncryption=false`. Its SHA-256 is
`71b04ecec05d605470d7160023584e18529f943930151d3b2e381e54ad6bb0b1`.

Submission used the explicit build ID, not `--latest`. EAS Submit exited
successfully after confirming Apple's receipt. Apple processing and tester
availability have not been independently verified: App Store Connect's
browser session requires sign-in. No public App Store release or new tester
invitations were initiated.

The initial submission attempt included `--what-to-test`; Expo rejected
scheduling because its changelog-submission feature requires an Enterprise
plan. Retrying without that option succeeded. The beta notes below are
saved here but **were not posted to App Store Connect**; they can be copied
into this build's What to Test field after processing.

## Validation

All applicable checks in the repository release gate passed across the
initial run and its recovery run:

- Release configuration, Expo dependency compatibility, and both TypeScript
  projects passed.
- Application suite: **2,476 passed, 6 skipped**, with two workers.
- Database suite: **245 passed across 7 files**.
- The exact legacy, preview, and v4 multiplayer workers bundled and passed
  authenticated contract checks; the account-deletion worker completed an
  authenticated deletion of a disposable local test account.
- iOS and Android production exports succeeded; tracked-source and both
  export secret scans passed.
- Compiled-bundle checks confirmed the friend-table controls and v4 worker
  lane, with the retired preview gate absent.

The first application run exposed a localization-inventory test fixture
that hardcoded the previous app version. The committed fix dirties that
fixture independently of its version; all 14 inventory tests then passed,
followed by the complete application suite above.

The release command subsequently stopped at six database broadcast tests
because the long-running **local** Realtime service had no message
partition for the current date. Connecting a disposable local Realtime
channel triggered its partition maintenance. The complete database suite
then passed, and the remaining release-gate steps were run in their
original order. This is a recovered validation run, not a claim that the
original `pnpm release:check` invocation exited successfully. No managed
schema DDL, database reset, or test weakening was used for the recovery.

Android artifact inspection was not run: this delivery is an iOS binary.
The Android JavaScript export was validated as part of the standard gate.

## Beta test focus

- Use two devices for private-table reconnect/background recovery,
  sit-out/return, pause/resume, rebuy, completion, and rematch. Compare
  stacks and results on both devices.
- Test Championship Resume, Restart, and Next event with the same and
  different seat counts; check all-in remaining counts, ties, unlocks,
  and outcome moments.
- Check that final AI actions precede board runout, showdown, and results,
  including after interrupting an all-in.
- Check iPhone/iPad, both orientations, larger text, and light/dark
  appearance. Report stuck games, lost progress, hidden controls, and
  repeatable tactics that make The Undertow unexpectedly easy.

## Remaining public-release evidence

The corrected C2 calibration, outstanding A2 two-client/recovery checks,
refreshed D2 captures, and real Next-event navigation coverage remain
tracked in [RELEASE_1_3_STATUS.md](RELEASE_1_3_STATUS.md). Creating this beta
does not close them. Final-stack ranking remains the v1.3 rule.

The in-app What's New notice still describes v1.2. Replace its editorial
copy before public v1.3 release; do not relabel the old progress-reset
message as a v1.3 change.
