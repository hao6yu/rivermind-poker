# Medium figure package

This directory contains the publication-ready figures for `MEDIUM_FOUR_AI_AGENTS_PHASE_18_REVIEW.md`.

All exported PNGs are 1,600 pixels wide so they remain readable when Medium scales them to the article column. The Markdown draft includes descriptive alt text and a short editorial caption for every figure.

## Figure inventory

- `article-hero-fable-5-1.png` — generated editorial hero image for the Medium headline and social preview.
- `agent-scorecard.png` — opening ranking graphic; replaces the Markdown score table.
- `evaluation-rubric.png` — weighted scoring chart; replaces the Markdown rubric table.
- `private-review-proof.png` — annotated private-table standings screenshot showing the existing Review hands entry point.
- `truncated-search-failure-pattern.png` — five-step diagram explaining how `head -18` became a false absence claim.
- `disappearing-player-sequence.png` — before/after Android evidence for the viewer-plaque symptom.
- `claim-verification-matrix.png` — editorial comparison matrix rendered as an image for Medium.
- `nine-player-table-hierarchy.png` — annotated Android evidence supporting Fable's strongest UI finding.

## Publishing order

Upload each image to Medium at the corresponding image position in the Markdown draft. Use Medium's full-width presentation for the scorecard, rubric, claim matrix, and diagrams. The captions immediately below each Markdown image are the intended Medium captions.

Use `article-hero-fable-5-1.png` as the first image beneath the subtitle. Medium normally uses the first substantial article image as the story preview, but confirm the preview card before publishing.

The two Android evidence figures contain crops of repository captures under `artifacts/android/device/`; keep the written uncertainty language around the disappearing-player sequence because the screenshots prove the visual symptom, not the exact server-side transition.

## Regenerating figures

`figure-source.html` is the editable source for every graphic. Run `render-figures.cjs` with Node.js, Playwright, and a local Google Chrome installation to regenerate the PNGs. The renderer uses the original Android screenshots rather than copied or recompressed intermediates.

The hero image was generated separately with the built-in image-generation tool. Final prompt: a premium wide technology-magazine illustration of four abstract AI coding agents investigating a generic nine-player poker app, with the new indigo-violet contender visually dominant, subtle code and defect evidence, no logos, no text, and no readable UI copy.
