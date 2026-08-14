# RiverMind Poker internal beta privacy notice

Last updated: August 14, 2026

RiverMind Poker is a learning app for play-chip Texas Hold’em practice. This
notice describes the current internal beta. It is product copy for beta
testers, not a final public-store privacy policy.

## Data RiverMind processes

RiverMind creates an anonymous Supabase account so a tester can use the app without providing a name, email address, or phone number. The account may store:

- an anonymous user identifier and the table nickname the tester chooses;
- lesson, quiz, percentage-training, and scenario progress;
- completed practice sessions and hands;
- deterministic poker analysis and optional AI coach reviews;
- aggregate daily AI-coach usage and reliability measurements;
- Daily Challenge date, personal best score, placement, hand count, attempt count, and timestamps; and
- beta feedback submitted in the app, including its category, message, app/build version, screen, and recent bounded error codes.

Private friend tables keep an authoritative room on RiverMind's Supabase
backend for up to 24 hours. While a room is active, its server-only state can
contain the current deal, including every player's cards and the undealt deck,
so the server can enforce action order and settle the hand. Mobile clients and
Realtime broadcasts receive a personalized redacted view: each tester sees
their own cards, public cards and actions, and opponent cards only when they
were legitimately shown at showdown. Room codes are stored as hashes on the
server; an invite link contains only the six-digit code and no account or room
identifier.

After each multiplayer hand, RiverMind stores a separate viewer-redacted copy
for each human member so that player can replay and review their own decisions.
These copies contain no undealt deck, no folded opponent cards, no other
player's private decision context, and no room code. A minimal same-device
resume marker containing the room identifier, status, expiry, and—when known—
the six-digit code is stored locally. Bounded create/join counters and
card-free reliability diagnostics are used to limit abuse and diagnose the
service; diagnostics never include room codes, display names, cards, action
rationales, or authentication material.

Theme, onboarding, offline retry state, and an aggregate opponent-learning profile may also be stored locally on the device. The opponent profile contains counts of the tester's public actions and seat-position tendencies; it does not contain cards, the undealt deck, or complete hand records, is not synced to Supabase, and can be reset from Profile.

A resumable Sit & Go checkpoint is also stored locally. It contains player names, seats, public chip stacks, the next hand number, the previous dealer, and difficulty. It never contains hole cards, a board, the undealt deck, or private decision state; resuming always creates a fresh shuffled deal.

A Daily Challenge checkpoint uses the same public-only shape plus its UTC event date. Daily deals and AI mixing are reproducible from that public date so every player can face the same table. The checkpoint never stores cards, a deck, or private decision state. Daily results in Supabase contain only the event date, personal best, placement, hands played, attempts, and timestamps. They are not a public leaderboard.

RiverMind Championship best placements, attempt counts, qualification timestamps, and one resumable event checkpoint are stored locally on the device. The checkpoint contains only the event identifier and the same public tournament state used by Sit & Go. Championship progress is not uploaded to Supabase and is not a public ranking. Deleting saved history from Profile removes this local progress and checkpoint.

When a tester submits feedback from a completed hand, RiverMind offers an explicit **Attach Hand** switch. If enabled, the report includes the tester’s cards, dealt board, action history, result, and opponent cards only when they were revealed at showdown. The undealt deck and unrevealed opponent cards are never attached. API keys, authentication tokens, and raw AI prompts are never included in feedback.

## Optional AI coaching

Normal gameplay does not require OpenAI. When a tester requests an AI review, RiverMind sends the following through a Supabase Edge Function to OpenAI:

- the tester’s hole cards;
- community cards that were dealt;
- the hand’s public action history; and
- poker facts calculated by RiverMind’s deterministic engine.

RiverMind does not send the undealt deck, another player’s cards, pot-winner result fields, or private AI state. The Edge Function rebuilds the request from a strict allowlist before contacting OpenAI. The OpenAI key remains on the server and is never included in the mobile app.

## What RiverMind does not provide or collect

- No real-money wagering, deposits, prizes, purchases, or cash value.
- No advertising or cross-app tracking.
- No contacts, photos, microphone, camera, or precise-location access.
- No legal name, email address, or phone number during anonymous beta use. A
  tester-selected table nickname is visible to people invited to that table.

## Why the data is used

The data supports saved learning progress, hand history and replay, personalized practice suggestions, personal Daily Challenge history and streaks, AI-coach quota enforcement, reliability measurement, and beta troubleshooting. Feedback and recent error codes are used to reproduce and prioritize tester-reported problems.

Supabase hosts authentication and stored learning data. OpenAI processes only the optional coaching request described above.

## Retention and deletion

Saved learning progress, sessions, hands, reviews, Daily Challenge results,
and viewer-redacted multiplayer hand history remain until the tester chooses
**Profile → Delete saved history**. That action removes those saved learning
and poker records from the device and Supabase. Active private-room state and
its local resume marker expire after 24 hours; viewer-redacted multiplayer
archives are also removed automatically after 90 days if they were not deleted
earlier. Short create/join rate-limit buckets are removed after one day.

Submitted beta feedback is retained separately from saved poker history and is not removed by **Delete saved history**. Testers can request deletion of submitted feedback by emailing the support address below.

The anonymous authentication account itself may remain after history deletion. Deleting the app before deleting saved history can remove the local credentials needed to access that anonymous account while its cloud data remains. Durable sign-in and complete account deletion must be finalized before a public release.

## Security

Mobile clients use a publishable Supabase key. Row Level Security limits every learning and poker record to its owner. Server credentials and the OpenAI API key are restricted to the Supabase server environment.

## Beta questions

Private beta feedback can be submitted from **Profile → Send beta feedback**. Privacy questions and deletion requests can be sent to [hyu@ims.dev](mailto:hyu@ims.dev). Public support information is available in [SUPPORT.md](SUPPORT.md).

This internal-beta notice remains in effect until it is replaced by the final store privacy policy. RiverMind keeps the saved records described above until the tester deletes them in the app or requests assistance by email. Complete deletion of the anonymous authentication account is still a release blocker and will be added before broader distribution.
