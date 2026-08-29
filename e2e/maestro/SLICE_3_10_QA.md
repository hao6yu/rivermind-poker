# Slice 3.10 simulator QA

These flows exercise the Release build produced from the Slice 3.10 feature
branch. They complement the pure/unit, Edge, migration, pgtap, and lint gates;
they do not replace physical-device audio, haptic, signing, or TestFlight QA.

## Build

Use the repository's Node 22 runtime and opt into the private-table preview for
the hosted multiplayer paths:

```sh
nvm use 22
EXPO_PUBLIC_MULTIPLAYER_PREVIEW=1 pnpm exec expo run:ios \
  --configuration Release --device "$LARGE_PHONE_UDID" --no-bundler
```

Install that exact `.app` on the small phone and iPad simulators before running
their flows. Do not clear app state between the paired private-table flows.

## Local table matrix

Run `slice-3.10-profile-smoke.yaml` on the small phone, large phone, and iPad.
Then run:

```sh
maestro test --udid "$PHONE_UDID" e2e/maestro/slice-3.10-headsup-smoke.yaml
maestro test --udid "$PHONE_UDID" -e PLAYER_COUNT=3 e2e/maestro/slice-3.10-local-multiway-smoke.yaml
maestro test --udid "$PHONE_UDID" -e PLAYER_COUNT=6 e2e/maestro/slice-3.10-local-multiway-smoke.yaml
maestro test --udid "$PHONE_UDID" -e PLAYER_COUNT=9 e2e/maestro/slice-3.10-local-multiway-smoke.yaml
maestro test --udid "$PHONE_UDID" e2e/maestro/slice-3.10-mission-smoke.yaml
maestro test --udid "$PHONE_UDID" e2e/maestro/slice-3.10-daily-smoke.yaml
maestro test --udid "$PHONE_UDID" e2e/maestro/slice-3.10-sit-and-go-smoke.yaml
maestro test --udid "$PHONE_UDID" e2e/maestro/slice-3.10-championship-smoke.yaml
```

Repeat on both phone classes. On iPad, run the local multiway flow with
`PLAYER_COUNT=2`, `3`, `6`, and `9`; verify the persistent landscape feed and
also inspect the pure split-view breakpoint cases in
`tableActivityLayout.test.ts` and `tableVisualDensity.test.ts`.

## Hosted private tables

For single-client coverage, run `slice-3.10-private-ai-smoke.yaml` with
`PLAYER_COUNT=2`, `3`, `6`, and `9`. This creates a hosted table, adds an AI,
starts live play, and captures portrait and landscape.

For the two-client gate:

1. Run `slice-3.10-private-host-lobby.yaml` on the large phone.
2. Read the six-digit code from the host UI and run
   `slice-3.10-private-guest-join.yaml` on the small phone with
   `-e ROOM_CODE=<code>`.
3. Run `slice-3.10-private-host-start.yaml` on the host.
4. Run `slice-3.10-private-reaction-open.yaml` once to inspect all twelve
   authored choices and the mute control.
5. Run `slice-3.10-private-reaction-burst.yaml` concurrently on both devices,
   passing `-e SENDER=host` and `-e SENDER=guest` respectively.
6. After both queues drain, run `slice-3.10-private-reaction-no-modal.yaml` on
   both devices. No command-error alert may be visible.
7. Run `slice-3.10-private-reconnect.yaml` on the guest. Prior reactions must
   not replay.
8. Use `slice-3.10-private-all-in.yaml`,
   `slice-3.10-private-result-reclaim.yaml`, and
   `slice-3.10-private-countdown-capture.yaml` while advancing the same QA
   room through an all-in, settlement, reconnect/reclaim, and next-hand result.
9. Run `slice-3.10-both-landscape-directions.yaml` while the table is open.
10. Run `slice-3.10-private-host-transfer.yaml` on the host, then rerun the
    reconnect flow on the guest to prove the authoritative room survives host
    departure.

Private-table flows use the configured hosted Supabase project. Test room codes
are ephemeral and must not be committed.

## Required automated gate

```sh
pnpm typecheck
pnpm test
pnpm verify:multiplayer-edge
pnpm verify:release-config
pnpm verify:mobile-secrets
git diff --check
```

When burst authority or its migration changes, also reset the isolated local
database, replay migrations, run multiplayer pgtap, and run database lint.
