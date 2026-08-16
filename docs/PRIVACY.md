# RiverMind Poker Trainer Privacy Policy

Effective: August 15, 2026
Last updated: August 15, 2026

RiverMind Poker Trainer ("RiverMind") is a play-chip Texas Hold'em learning app provided by ISW Technologies LLC. This policy explains what data RiverMind processes, why it is used, when it is shared, how long it is retained, and how you can delete it.

RiverMind does not offer real-money wagering, deposits, purchases, prizes, withdrawals, or cash value.

## Data RiverMind processes

### Anonymous account and identifiers

RiverMind automatically creates an anonymous Supabase account so you can use the app without entering a legal name, email address, phone number, or password. Supabase assigns that account a random user identifier. RiverMind also lets you choose one product-authored preset nickname for private friend tables; free-form player names are not accepted.

The anonymous identifier links your saved records to your account. Supabase and its infrastructure providers may also process ordinary network and security metadata, such as IP address, request time, device or browser information, and service logs, to deliver and protect the service.

### Learning, gameplay, and progress

Depending on the features you use, RiverMind may store:

- lesson, quiz, percentage-training, scenario, and review progress;
- completed practice sessions and hands;
- deterministic poker analysis and saved coach reviews;
- Daily Challenge dates, personal scores, placements, hand counts, attempt counts, and timestamps;
- aggregate AI-coach allowance, latency, success, and failure counts; and
- app preferences, tournament checkpoints, Championship progress, opponent-learning summaries, retry state, and other feature state stored locally on your device.

Local tournament checkpoints contain public tournament state such as player names, seats, stacks, event or hand number, prior dealer position, and difficulty. They do not store hole cards, an undealt deck, or private decision state; resuming creates a fresh deal.

### Private friend tables

Private tables keep an authoritative room on RiverMind's Supabase backend for up to 24 hours. While a room is active, server-only state may contain the current deal, including all players' cards and the undealt deck, so the server can enforce the rules and settle the hand.

Each mobile client and Realtime broadcast receives a personalized, redacted view. You receive your own cards, public cards and actions, and opponent cards only when they were legitimately shown at showdown. Room codes are stored as hashes on the server. Invite links contain only the six-digit code, not an account or room identifier.

After a multiplayer hand, RiverMind may store a separate viewer-redacted copy for each human member so that member can replay the hand. These copies do not contain the undealt deck, folded opponent cards, another player's private decision context, or the room code. A small same-device resume marker may locally store the room identifier, status, expiry, and, while useful, the six-digit room code.

RiverMind uses bounded create/join counters and card-free operational diagnostics to limit abuse and diagnose multiplayer reliability. Those diagnostics do not contain room codes, display names, cards, action rationales, or authentication credentials.

### Feedback and diagnostics

If you submit feedback, RiverMind stores the category, message, app/build version, current screen, and bounded recent error codes. When feedback follows a completed hand, you can choose whether to attach that hand. If enabled, the attachment can include your cards, dealt board, public action history, result, and opponent cards only when shown at showdown. It never includes the undealt deck, unrevealed opponent cards, API keys, authentication tokens, or raw AI prompts.

## Optional AI coaching

Normal gameplay, deterministic analysis, and local hand review do not require OpenAI.

Before RiverMind sends its first AI-coach request, it presents a disclosure and asks for permission. If you allow it, a completed-hand request is authenticated through Supabase and sent to OpenAI to generate a plain-language explanation. The request can include:

- your two hole cards and the community cards that were dealt;
- the current street and public action history, including your decisions and bet sizes;
- blind, pot, call-cost, stack, street-bet, legal-action, and app-language values; and
- verified poker-engine facts, such as made hands, board texture, draws, pot odds, required equity, and stack-to-pot ratio.

RiverMind does not send your preset nickname, room code, undealt cards, or opponents' hidden cards. Supabase uses your anonymous account identifier to authenticate the request and enforce a daily allowance. OpenAI receives a one-way hashed safety identifier derived from that account identifier, rather than the identifier itself.

RiverMind sets the OpenAI request not to store application state (`store: false`). OpenAI states that API data is not used to train its models unless the customer opts in. OpenAI may retain API inputs, outputs, and related metadata in abuse-monitoring logs for up to 30 days by default, or longer where legally required. See [OpenAI's data controls](https://platform.openai.com/docs/models/default-usage-policies-by-endpoint) for current details.

You may decline or cancel the disclosure. The deterministic review remains available, and RiverMind sends no AI-coach request. You can also delete the saved permission decision by deleting your RiverMind account and data.

## How RiverMind uses data

RiverMind processes the data described above to:

- provide poker gameplay, private tables, hand history, replay, and saved progress;
- personalize practice recommendations and opponent-learning summaries;
- provide Daily Challenge and tournament features;
- authenticate requests, enforce allowances and rate limits, and prevent abuse;
- generate an optional AI-coach explanation after permission; and
- investigate reliability problems and respond to feedback or support requests.

RiverMind does not sell personal data, serve advertising, or use data for cross-app tracking.

## Service providers and disclosures

RiverMind uses:

- **Supabase** for anonymous authentication, database storage, Realtime private-table updates, and Edge Functions; and
- **OpenAI** only for optional AI-coach requests that you authorize.

These providers process data on RiverMind's behalf under their own security and data-processing terms. RiverMind may also disclose information when required by law, to protect users or the service, or as part of a corporate transaction subject to appropriate safeguards.

## Retention

- Saved learning progress, practice sessions, hands, reviews, Daily Challenge results, feedback, and aggregate AI usage remain until the associated anonymous account is deleted, unless a shorter period is described below or law requires otherwise.
- Active private-room state and its local resume marker expire after 24 hours.
- Viewer-redacted multiplayer hand archives are automatically removed after 90 days if you do not delete them first.
- Multiplayer create/join rate-limit buckets are removed after one day.
- Account-related device checkpoints and resume state remain until you clear them in RiverMind, delete your account and data, or remove the app. Device preferences such as language, appearance, and haptics are preserved when you delete the account and remain until you change them or remove the app.
- OpenAI's default abuse-monitoring retention is described in **Optional AI coaching** above.

Operational backups and security logs may persist for a limited period after deletion before being overwritten, where necessary for service integrity, fraud prevention, legal compliance, or disaster recovery.

## Your controls and account deletion

**Delete saved history** in Profile removes saved learning and poker history while keeping the anonymous account available.

**Delete account and data** in Profile permanently deletes the current anonymous Supabase account and its linked RiverMind cloud data, including saved gameplay, learning progress, feedback, AI-usage records, Daily Challenge records, and viewer-redacted multiplayer history. It also clears account-related RiverMind data stored on the device, including checkpoints, resume state, preset nickname, diagnostics, onboarding state, and AI-coach permission.

If the account participates in an active private table, deleting it closes that room and removes its related server-side room and archive records so the deleted identifier and nickname do not remain in shared state. This can end the private table for every participant. Account deletion cannot be undone.

Deleting the app alone may remove local credentials without immediately deleting cloud records. To delete the account and cloud data, use **Profile → Delete account and data** before removing the app. If you cannot access the control, contact us at [hyu@isw.dev](mailto:hyu@isw.dev).

## Security

RiverMind uses HTTPS, Supabase Row Level Security, owner-scoped database rules, strict response allowlists, and server-only credentials to protect stored and transmitted data. No method of storage or transmission is completely secure, but RiverMind limits collection and access to what the product needs.

## Children

RiverMind is not directed to children. It depicts simulated play-chip poker and should be used only by people who meet the age requirements shown in their App Store region.

## Changes to this policy

We may update this policy when RiverMind's features, providers, or legal obligations change. We will update the date at the top and provide additional notice when required.

## Contact

For privacy questions or deletion assistance, contact [hyu@isw.dev](mailto:hyu@isw.dev).

For product support, see [RiverMind Support](SUPPORT.md).
