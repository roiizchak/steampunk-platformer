# Phase 13 — the level-select padlock

The owner asked for the level menu to become buttons, *"and each button for a locked level should
have a lock icon."* One icon, one generation, first take adopted.

## The job

| column | value |
|---|---|
| **`request_id`** | `01a05e37-ad8f-7e00-bb3c-0d93601f4fb0` |
| endpoint | `fal-ai/nano-banana-pro` |
| seed | `20260804` (STYLE.md §2's locked seed) |
| non-default inputs | `aspect_ratio "1:1"`, `resolution "2K"`, `output_format png`, `num_images 1` |
| left at default | `limit_generations true`, `enable_web_search false`, `safety_tolerance 4`, `system_prompt` empty |
| quoted cost | **$0.15** ($0.15/image at 1K and 2K; 4K is 2×) |
| invoiced cost | **NOT YET READ.** Quoted only, per vault 4.9 — a quoted rate is not an invoice |
| raw output | `_generated/ui-padlock/01a05e37-ad8f-7e00-bb3c-0d93601f4fb0.png` (gitignored) |
| **measured** raw dimensions | **2048 × 2048**, read off the file, never off the aspect label *(4.11)* |
| shipped output | `public/assets/ui/ui-padlock.png` |
| **measured** shipped dimensions | **160 × 160** — `TOUCH_FACE_PX`, what `cutFace` downscales to |
| verdict | **ADOPTED, take 1.** Nothing was re-shot |

2048 × 2048 at `1:1`/`2K` is the same figure the touch plate settled on 2026-08-31, so this is a
second independent reading of a dimension that was UNMEASURED before that session rather than a new
one.

## The prompt

Built by `tools/gen/promptPadlock.mjs`, which composes STYLE.md §4's `RENDERING` and
`DO NOT INCLUDE` blocks **verbatim** through `templateBlock` — the same construction
`touchButtonPrompt` uses, and for the same reason: §2/§4/§5 are hashed by `style-lock.test.ts`, and
a prompt that paraphrased them would drift out from under that hash without reddening it. Run the
module directly to print the exact bytes that were sent.

Three clauses were written against defects this repository has already paid for:

- **The geometry is stated as a fact, not a label.** *"its total height including the shackle is one
  half of the height of the image, so it is surrounded on all sides by a wide clear margin of
  backing sheet."* The touch plate paid for this twice — *"a 3 by 2 grid" is a label, not a
  geometry* — and `cutFace` REFUSES a face that touches its crop edge, so a thin margin is a
  refusal rather than a bad crop.
- **The chroma field is what IS there**, not the absence of a background:
  `pure saturated chroma green, RGB 0 255 0`, reused from `TOUCH_PLATE_CHROMA` rather than restated.
- **One solid silhouette, shown SHUT.** An open shackle would read as *unlocked* — the exact
  opposite of what the icon is for — and *"one even weight with an unbroken outline"* is the
  positive form of the flat-glyph clause the wrench re-shoot arrived at, after asking for a glyph
  *without* interior shading produced interior shading.

## The cut

`node tools/gen/cut-padlock.mjs <raw> public/assets/ui/ui-padlock.png`, a one-off runner around
**`cutFace()`** — the same key-out, halo trim, speck removal, single-blob check, edge-touch refusal,
square crop and downscale the six touch faces went through. Reusing it is deliberate: every check in
it was bought by a real defect, and a second hand-written keyer would be a second set of them to get
wrong.

Deliberately **not** an `assets:*` script. There is one icon; a pipeline stage for it would be a
build step nothing ever runs again. `touchAtlasCli.mjs` could not be reused anyway — its `--cell`
validates against `CELL_KEYS`.

The whole image is the cell. There is no sheet to split, so `cutFace`'s edge-touch refusal is
checking the model's margin rather than a divider — and it passed, which is the evidence that the
margin clause worked.

## The key is `ui-padlock`, and that is not cosmetic

⚠️ It must NOT start with `touch-`. `catalogTouchKeys()`
([buildTouchAtlas.mjs:58-64](../../tools/gen/buildTouchAtlas.mjs)) matches that prefix and
cross-checks the produced set against the catalog, so a seventh `touch-*` row would make
`npm run assets:touch` throw before it wrote anything.

🔴 The plan for this feature named **two different keys** — `'lock'` in the design section and
`'ui-padlock'` in the asset section. Implemented literally, the paid asset loads and is never drawn,
and every device silently takes the drawn fallback. Caught by the Codex plan review before a line
existed. `LOCK_TEXTURE_KEY` in `src/scenes/levelButtons.ts` is now the single definition, and
`level-buttons.test.ts` asserts it against `public/assets/index.json` — a gate the art-arm case
cannot replace, because the fake's `textures.exists` answers true for **any** key.

## Shipped

One row in `public/assets/index.json` `images[]`. That alone makes `BootScene` load it and makes
`verify-dist.mjs`'s existing check guard its presence in `dist/`; that gate is generic over
`catalog.images` and needed no edit.
