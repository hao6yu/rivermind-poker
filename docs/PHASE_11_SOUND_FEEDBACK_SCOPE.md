# Phase 11 — Sound & Feedback

## Outcome

Make RiverMind feel alive and tactile without turning the poker table into a
casino game. Sound and haptics reinforce visible game events; they never carry
information that is unavailable in text or animation.

Phase 11 begins after the Phase 10 table presentation events are stable. The
same deduplicated event that activates an action bubble must trigger feedback,
so reconnects and realtime refreshes cannot replay old sounds.

## Sound character

- New hand: a short shuffle and two-card flick.
- Fold: a soft card slide.
- Check: two light table taps.
- Call: a small chip click.
- Bet or raise: a firmer chip-stack clack.
- All-in: a deeper chip push, kept tasteful.
- Community reveal: a crisp card flip.
- Viewer turn: one warm, bright chime.
- Ten-second warning: one restrained double tick.
- Win: a brief bright resolve with chips.
- Loss: a neutral card-settle sound, never a punitive buzzer.
- Split pot: a balanced two-note resolve.
- Disconnect and restore: one subtle warning or recovery ping.

The first release excludes voice acting, looping ambience, generic button
clicks, slot-machine effects, and per-second countdown beeps.

## Product controls

Add a **Sound & feedback** section to Profile & settings:

- Game sounds, on by default.
- Haptics, on by default.
- A persistent speaker/mute control in the active-game header.
- A short preview when game sounds are enabled.

Use device media volume instead of an in-app volume slider. Store a versioned,
device-local preference and fall back safely if its data is missing or corrupt.

## Technical direction

- Use Expo SDK 54 `expo-audio`; do not add the deprecated `expo-av` package.
- Bundle short local effects. Do not fetch sound files during a game.
- Respect the iOS silent switch, mix politely with music and podcasts, and do
  not enable background playback or recording permissions.
- Manage reusable players in a feedback provider. Rewind a completed short
  effect before replaying it.
- Keep one action-sound channel so a rapid AI round remains readable.
- Stop or suppress feedback while the app is inactive.
- Treat playback and haptic failures as non-blocking.

The semantic cue contract is:

`fold`, `check`, `call`, `raise`, `allIn`, `streetReveal`, `viewerTurn`,
`timerWarning`, `handResult`, `disconnect`, and `restore`.

Action cues are emitted when their Phase 10 bubble becomes active. Initial
join, sync, and reconnect history is silent. Result feedback waits until the
last newly queued action cue has played, while the visual result remains
immediate.

## Asset requirements

- Use original, commissioned, or clearly licensed effects.
- Prefer short mono WAV assets with consistent loudness and enough headroom for
  limited overlap.
- Provide a few subtle variants for common card and chip actions.
- Keep the initial sound pack under approximately 1 MB.
- Record every asset's source and license in `docs/AUDIO_ASSETS.md`.

## Delivery slices

1. Feedback preferences, persistence, and Profile UI.
2. Audio provider, lifecycle handling, and pure cue mapping.
3. Card, chip, turn, timer, connection, and result integrations.
4. Header mute control and accessibility states.
5. Simulator timing QA and physical-device audio QA.

## Acceptance gates

- Realtime refreshes and reconnects never duplicate a cue.
- Rapid six-player AI action remains clear rather than cacophonous.
- Muting prevents the next cue immediately and survives restart.
- Music and podcasts continue without interruption.
- The app produces no sound in the background and requests no microphone
  permission.
- Silent switch, device volume, headphones, and Bluetooth behavior are verified
  on a physical iPhone; Android media volume and interruption behavior are also
  verified.
- VoiceOver and TalkBack expose the mute state, and every audio event still has
  a visible equivalent.
