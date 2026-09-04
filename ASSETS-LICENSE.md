# Asset licence

**The art and audio in this repository are not open source.** They are covered by this document,
not by [LICENSE](LICENSE) — which governs the code and says so at the top.

© 2026 Roi Izchak. **All rights reserved.**

## What this covers

Every generated image and sound in the repository:

- `public/assets/` — the shipped sprite sheets, tile sets, parallax layers, HUD art and audio
- `assets/` — the working sources those were cut from
- `docs/media/` — the README's screenshot and gameplay clips. They are frames of the same art, so
  they are covered by the same terms; captured from the live build by
  `tools/dev/capture-readme-media.mts`, which is code and is therefore MIT like the rest of `tools/`

## What you may do

Read the repository, clone it, run the game locally, and study how the pipeline works. Running
`npm run dev` or `npm run build` on your own machine is fine and is the point of publishing it.

## What you may not do

Redistribute, republish, resell, sublicense or relicense the assets; use them in another project,
game, product or dataset; or train a model on them. That applies to the files as they are and to
derivative or modified versions of them.

If you want to build on this project's code, the MIT licence gives you that — replace the art.

## Why the split

The assets were generated through [fal.ai](https://fal.ai) endpoints against this project's own
prompts, at this project's own cost, and are recorded generation by generation with their
`request_id` in [docs/GENERATION-LOG.md](docs/GENERATION-LOG.md). Model providers' terms differ
from one another and change over time, and the reference-art analysis in
[docs/SOURCE-ANALYSIS.md](docs/SOURCE-ANALYSIS.md) describes influences the generated work carries.
An MIT grant over those outputs would be a licence this repository is not in a position to give.

⚠️ **The assets also cannot currently be regenerated from what this repository records.** The
generation log preserves every prompt and `request_id`, but the raw model outputs live in
`_generated/`, which is git-ignored, and the generators are not seed-deterministic — so a fresh
clone can rebuild the *sheets* from the raws it does not have, and cannot rebuild the raws at all.
That gap is Phase 10 criterion 10.9's recorded shortfall and is written up in
[docs/qa/phase-10-ship.md](docs/qa/phase-10-ship.md); it is stated here because it is the honest
answer to "can I make my own version of these?" — from this repository alone, no.

## Questions

Open an issue. Permission for a use not listed above is possible and is given case by case.
