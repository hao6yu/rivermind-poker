# Championship fresh start in 1.2

User-authorized release behavior: when the updated app first loads Championship, it starts a fresh tour. Main-event qualifications, championship attempts/best finishes, derived achievement badges, hidden invitations, and any active championship run start over. Tutorial/learning progress, daily challenges, practice history, profiles, preferences, opponent memory, and multiplayer data are unaffected.

## Implementation

The existing Elite/Nemesis upgrade helper now preserves data; re-running its old receipt cannot implement a new reset. Version 1.2 uses a new, fixed championship save generation in `src/services/championshipProgressMigration.ts`:

- `rivermind.championship.tour-1.2.progress.v2`
- `rivermind.championship.tour-1.2.progress.backup.v2`
- `rivermind.championship.tour-1.2.checkpoint.v2`

These keys are independent of the JSON schema version and runtime app version. Keep them unchanged for 1.2 patches and subsequent releases unless another fresh start is explicitly authorized. New saves remain available on every later launch; no repeat deletion runs.

All three keys change together, preventing an old backup or checkpoint from restoring old progress through recovery. Old saves remain locally unused; explicit championship-data clearing and account-data deletion remove both generations. A failed first write cannot expose the old generation.

The reset takes effect when a client runs this updated code. It is not a server-side reset, remote rollout, or app-store submission. A cold app start after installing the update is the release verification boundary; development hot reload can retain already-mounted state.

## Validation

Service tests cover upgrades with/without the previous migration receipt, a completed tour including both hidden events, a valid old active run, old recovery data, unrelated-data preservation, new results and checkpoints surviving module reload, current backup recovery, storage-write failure, and explicit data clearing. Existing championship domain, map interaction and account cleanup suites are included. Native signed-build upgrade installation remains a release QA step.

## Suggested release note

Championship starts fresh in 1.2 with a new world map and improved opponents. Previous Championship progress and unfinished Championship runs reset; your learning progress and other game records are kept.
