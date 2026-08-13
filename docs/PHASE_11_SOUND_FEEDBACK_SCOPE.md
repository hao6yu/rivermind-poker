# Phase 11 — Haptic Feedback

## Outcome

Make RiverMind feel responsive through restrained tactile feedback. Haptics
reinforce visible game events; they never carry information that is unavailable
in text or animation.

The same deduplicated semantic event that activates an action bubble triggers
the haptic, so reconnects and realtime refreshes cannot replay old feedback.

The generated sound-effect prototype was evaluated on a physical iPhone and is
not part of this release. RiverMind ships no gameplay audio or sound control in
Phase 11. A future audio pass can reuse the semantic event contract after a
production-quality sound pack is designed and tested.

## Product control

Profile & settings includes one device-local **Haptics** preference, on by
default. Its versioned value falls back safely when data is missing or corrupt.
There is no sound toggle in game headers or settings.

## Technical direction

- Use Expo Haptics through a feedback provider; failures remain non-blocking.
- Stop or suppress delayed haptics while the app is inactive.
- Deduplicate authoritative multiplayer events so reconnect history stays quiet.
- Keep semantic events independent from their tactile output so future feedback
  channels do not require table logic changes.

The semantic cue contract is:

`newHand`, `fold`, `check`, `call`, `raise`, `allIn`, `streetReveal`,
`viewerTurn`, `timerWarning`, `handResult`, `disconnect`, and `restore`.

Action cues align with their visible action presentation. Explicit presentation
delays remain provider-owned and are canceled when the table closes, the app
backgrounds, or a new hand supersedes the previous hand.

## Acceptance gates

- Realtime refreshes and reconnects never duplicate a haptic.
- A single semantic event owns the haptic when one transition includes action,
  board, turn, or result changes.
- Disabling haptics prevents the next cue immediately and survives restart.
- The app emits no delayed feedback after a table closes or backgrounds.
- Unsupported hardware and native haptic failures never interrupt gameplay.
- The preference has localized, accessible text in every supported language.
- The release contains no gameplay sound assets, audio package, or audio plugin.
