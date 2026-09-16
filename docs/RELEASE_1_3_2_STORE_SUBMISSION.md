# v1.3.2 public-store submission

Submitted September 16, 2026, following the owner's instruction to submit
iOS build 34 and the completed Android build for public release. The
requested v1.3 builds identify themselves as **1.3.2**.

## Submitted binaries

Both EAS production builds were created from source commit
`c84a89524edebcfb7f45e4716a49416d827eecaa`.

| Store | Version | Build | EAS build |
| --- | --- | --- | --- |
| App Store | 1.3.2 | 34 | [9516c566](https://expo.dev/accounts/iswtech/projects/rivermind-poker/builds/9516c566-1210-444e-a5a3-592a302a29a1) |
| Google Play | 1.3.2 | 9 | [bd21f616](https://expo.dev/accounts/iswtech/projects/rivermind-poker/builds/bd21f616-cbea-4a3c-ae36-a1cd42236ad3) |

## Apple

- Changed the existing version form from `1.3` to `1.3.2` and selected the
  exact TestFlight build `34` (`900fc625-baf0-4887-b4fb-83110a1a5bac`).
- Filled What's New and promotional text in all three existing listing
  localizations: English (U.S.), Simplified Chinese, and Traditional Chinese.
- Updated each description to list all six in-app languages and removed
  the stale reference to the world map being new in this release.
- Updated the review notes for v1.3.2, including review steps and an
  explanation that the existing v1.2 in-app notice describes the earlier
  progress migration. This release does not introduce another reset.
- Kept automatic release after approval and immediate availability to all
  users selected. Kept existing ratings and carried-forward screenshots.
- Submitted at **02:43 AM America/Chicago**. The final App Review page
  explicitly shows **Waiting for Review** for **1.3.2 (34)**.

Submission ID: `7020203f-c8bc-460c-9e9c-21c1e66afde2`.

[App Review submission](https://appstoreconnect.apple.com/apps/6797011715/distribution/reviewsubmissions/details/7020203f-c8bc-460c-9e9c-21c1e66afde2)

## Google Play

- Downloaded the exact finished production AAB from its EAS artifact link,
  then uploaded it through Play Console's production release form.
- Release name: **1.3.2 (9)**. Release notes supplied in all three existing
  listing languages: `en-US`, `zh-CN`, and `zh-TW`.
- Play identified the uploaded binary as **9 (1.3.2)**, minimum API **24**,
  target API **36**, with unchanged supported-device counts.
- Local artifact inspection verified 16 KB page alignment for every
  64-bit native library. Target API was independently confirmed by Play;
  the local AAB inspector cannot read its protobuf manifest or verify the
  ZIP alignment of the APKs that Play generates.
- Saved a **100% production rollout** across the existing targeted
  countries and sent the single pending production change for review.
- Final Publishing overview shows **Changes in review → Production →
  1.3.2 (9) → Start full rollout**. **Managed publishing is off**, so approved
  changes publish automatically. Google's automated quick checks were
  still running at handoff; the page says review proceeds after they pass.

AAB SHA-256:
`914e37402c3482d3f4243584d8ad5dac8faec47bb991e2dfbe06597943e88790`.

Play displayed two non-blocking warnings:

1. Korea is unavailable under the current GRAC rating and remains subject
   to further review. No rating or country configuration was changed.
2. No deobfuscation mapping file is attached. Native debug symbols are
   attached to the bundle; no mapping file was fabricated.

[Google Play publishing overview](https://play.google.com/console/u/5/developers/6386904821184395791/app/4975588649397391424/publishing)

## Release-note content

The notes describe Championship resume/restart/next-event navigation,
tournament standings and outcome moments, corrected final-action/runout/
showdown/result timing (including interrupted all-ins), clearer private
table status, the portrait tournament control fix, phone/tablet layout
polish, three added languages, and translation improvements. They state
that v1.2 Championship progress is preserved. They make no new quantitative
AI-difficulty claims.

Store listings remain localized in their existing three languages; the
binary offers six in-app languages. This submission did not add Spanish,
Portuguese, or Japanese store-listing localizations.

## Status boundary

Both stores accepted the review submissions; neither public release was
verified live during this task. Store approval, automated checks, and
propagation remain external steps. This submission record does not replace
the earlier engineering verification or independently close outstanding
calibration/device evidence in the v1.3 status documents. No application
code or production backend configuration was changed for submission.
