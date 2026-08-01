# RiverMind Poker internal beta privacy notice

Last updated: August 1, 2026

RiverMind Poker is a learning app for play-chip Texas Hold’em practice. This notice describes the Phase 1 internal beta. It is product copy for beta testers, not a final public-store privacy policy.

## Data RiverMind processes

RiverMind creates an anonymous Supabase account so a tester can use the app without providing a name, email address, or phone number. The account may store:

- an anonymous user identifier;
- lesson, quiz, percentage-training, and scenario progress;
- completed practice sessions and hands;
- deterministic poker analysis and optional AI coach reviews; and
- aggregate daily AI-coach usage and reliability measurements.

Theme, onboarding, and offline retry state may also be stored locally on the device.

## Optional AI coaching

Normal gameplay does not require OpenAI. When a tester requests an AI review, RiverMind sends the following through a Supabase Edge Function to OpenAI:

- the tester’s hole cards;
- community cards that were dealt;
- the completed hand’s action history and result; and
- poker facts calculated by RiverMind’s deterministic engine.

RiverMind does not send the undealt deck or an opponent’s cards unless those cards were revealed at showdown. The OpenAI key remains on the server and is never included in the mobile app.

## What RiverMind does not provide or collect

- No real-money wagering, deposits, prizes, purchases, or cash value.
- No advertising or cross-app tracking.
- No contacts, photos, microphone, camera, or precise-location access.
- No name, email address, or phone number during anonymous beta use.

## Why the data is used

The data supports saved learning progress, hand history and replay, personalized practice suggestions, AI-coach quota enforcement, reliability measurement, and beta troubleshooting.

Supabase hosts authentication and stored learning data. OpenAI processes only the optional coaching request described above.

## Retention and deletion

Saved learning progress, sessions, hands, and reviews remain until the tester chooses **Profile → Delete saved history**. That action removes the app’s saved learning and poker records from the device and Supabase.

The anonymous authentication account itself may remain after history deletion. Deleting the app before deleting saved history can remove the local credentials needed to access that anonymous account while its cloud data remains. Durable sign-in and complete account deletion must be finalized before a public release.

## Security

Mobile clients use a publishable Supabase key. Row Level Security limits every learning and poker record to its owner. Server credentials and the OpenAI API key are restricted to the Supabase server environment.

## Beta questions

Private beta feedback, privacy questions, and deletion requests can be sent to [hyu@ims.dev](mailto:hyu@ims.dev). Include the app version and build shown in **Profile → Beta & privacy** when reporting a problem. Public support information is available in [SUPPORT.md](SUPPORT.md).

This internal-beta notice remains in effect until it is replaced by the final store privacy policy. RiverMind keeps the saved records described above until the tester deletes them in the app or requests assistance by email. Complete deletion of the anonymous authentication account is still a release blocker and will be added before broader distribution.
