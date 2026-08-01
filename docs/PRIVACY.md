# RiverMind Poker internal beta privacy notice

Last updated: August 1, 2026

RiverMind Poker is a learning app for play-chip Texas Hold’em practice. This notice describes the Phase 1 internal beta. It is product copy for beta testers, not a final public-store privacy policy.

## Data RiverMind processes

RiverMind creates an anonymous Supabase account so a tester can use the app without providing a name, email address, or phone number. The account may store:

- an anonymous user identifier;
- lesson, quiz, percentage-training, and scenario progress;
- completed practice sessions and hands;
- deterministic poker analysis and optional AI coach reviews; and
- aggregate daily AI-coach usage and reliability measurements; and
- beta feedback submitted in the app, including its category, message, app/build version, screen, and recent bounded error codes.

Theme, onboarding, and offline retry state may also be stored locally on the device.

When a tester submits feedback from a completed hand, RiverMind offers an explicit **Attach Hand** switch. If enabled, the report includes the tester’s cards, dealt board, action history, result, and opponent cards only when they were revealed at showdown. The undealt deck and unrevealed opponent cards are never attached. API keys, authentication tokens, and raw AI prompts are never included in feedback.

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

The data supports saved learning progress, hand history and replay, personalized practice suggestions, AI-coach quota enforcement, reliability measurement, and beta troubleshooting. Feedback and recent error codes are used to reproduce and prioritize tester-reported problems.

Supabase hosts authentication and stored learning data. OpenAI processes only the optional coaching request described above.

## Retention and deletion

Saved learning progress, sessions, hands, and reviews remain until the tester chooses **Profile → Delete saved history**. That action removes the app’s saved learning and poker records from the device and Supabase.

Submitted beta feedback is retained separately from saved poker history and is not removed by **Delete saved history**. Testers can request deletion of submitted feedback by emailing the support address below.

The anonymous authentication account itself may remain after history deletion. Deleting the app before deleting saved history can remove the local credentials needed to access that anonymous account while its cloud data remains. Durable sign-in and complete account deletion must be finalized before a public release.

## Security

Mobile clients use a publishable Supabase key. Row Level Security limits every learning and poker record to its owner. Server credentials and the OpenAI API key are restricted to the Supabase server environment.

## Beta questions

Private beta feedback can be submitted from **Profile → Send beta feedback**. Privacy questions and deletion requests can be sent to [hyu@ims.dev](mailto:hyu@ims.dev). Public support information is available in [SUPPORT.md](SUPPORT.md).

This internal-beta notice remains in effect until it is replaced by the final store privacy policy. RiverMind keeps the saved records described above until the tester deletes them in the app or requests assistance by email. Complete deletion of the anonymous authentication account is still a release blocker and will be added before broader distribution.
