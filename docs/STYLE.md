# STYLE.md — locked art direction

**Status: APPROVED 2026-08-04 (Gate 5).** Anchor image: `assets/style-probe/r9-bar-smaller.png`.

This is the recipe. **Every later asset reuses it.** Changing anything in §2–§5 is a STYLE.md change and
needs approval, not a prompt tweak. Arrived at over 21 generations / $1.68 — see
[GENERATION-LOG.md](GENERATION-LOG.md).

---

## 1. Direction in one line

Victorian industrial steampunk, rendered as detailed high-definition pixel art, where **the foreground
is warm and brass-capped and the background is cool and shadowed** — so the player can tell what is
standable without thinking about it.

---

## 2. Model and parameters — exact

| Field | Value |
|---|---|
| Endpoint | **`fal-ai/nano-banana-2`** (Gemini 3.1 Flash Image) |
| Edit endpoint | `fal-ai/nano-banana-2/edit` (same price, adds `image_urls`) |
| `seed` | **`20260804`** — see §3 |
| `aspect_ratio` | `16:9` for scenes and backgrounds |
| `resolution` | `2K` |
| `output_format` | `png` |
| Cost | **$0.08 per image, flat** — not per megapixel, so 4K costs the same as 0.5K |

**Measured, not assumed** — verified across all 21 generations:

- **`16:9` at `2K` returns `2752 × 1536`, ratio `1.7917`, NOT 1.7778.**
  The job record returns `width: null, height: null`, so the CLI does not tell you this. **Measure the
  downloaded file.** Never derive an engine constant from the aspect label. *(vault 3.2 / 4.11 — this
  reproduced the vault's number exactly, from a different service)*
- **Output is `mode=RGB` with no alpha channel at all.** Not "RGBA with alpha 255" — genuinely absent.
  **Chroma-key background removal is therefore mandatory** for every cut-out asset; it is not optional
  work we might skip. *(vault A2 / 4.12 — resolves that open question)*

---

## 3. Seed strategy

**Fixed seed `20260804` for all comparison work.** When A/B-ing a prompt change, hold the seed constant
so the prompt is the only variable *(vault 4.10 — expect exactly one number to move)*.

**For production batches**, vary the seed per asset and **record it in GENERATION-LOG.md**. A seed you
did not write down is a result you cannot reproduce *(vault 4.15)*.

Note the limit honestly: nano-banana-2's seed gives *reproducibility*, not *control*. Identity
consistency across assets comes from the reference image, not the seed *(vault 4.1)*.

---

## 4. Prompt template

Slots in `[BRACKETS]`. Everything else is verbatim and must not be reworded casually.

```text
A single frame of richly detailed pixel-art gameplay from a 2D side-scrolling platformer,
presented exactly as an in-game screenshot with its interface visible.

CAMERA AND SCALE: horizontal 16:9. The visible screen height is [SCALE_RATIO] times the
player character's full standing height. The character stands on a platform in the lower-left
third. Three platforms at different heights with clear gaps between them. One collectible
pickup floating above a platform. One hazard. One enemy on a distant platform.

PLAYER CHARACTER, highly detailed: a distinct face with visible expression, brass goggles
pushed up on the forehead, layered clothing with visible folds and stitching, leather straps,
buckles, a satchel, ornate metal fittings and a mechanical arm brace. Unmistakable asymmetric
silhouette. Rendered with more detail and more colour steps than anything behind them.

IN-GAME HUD, upper-left, with strict geometry: a circular brass-framed portrait medallion of
the character, and attached to its right one single horizontal health bar. The health bar is a
closed capsule with rounded polished brass end caps and a riveted brass frame, filled with
glowing amber. CRITICAL GEOMETRY: the total height of the entire assembly is exactly equal to
the diameter of the circular portrait medallion, and the health bar is vertically centred
within that height. The assembly is one row tall. Below the assembly is the ordinary brick and
ironwork of the level. Upper-right, separately, a collectible counter showing a small icon
beside numerals. The interface sits flush in the corners and never obscures the play area.

RENDERING: detailed high-definition pixel art in the tradition of Owlboy, Blasphemous and Dead
Cells. Dense fine pixel detail and heavy ornamentation on every foreground surface: individual
rivets, seams, engraved filigree, wear, patina, cracked mortar, bolt heads. Many shading steps
per material with hand-dithered gradients. Hard edges and crisp dark outlines on every
gameplay-critical shape.

DO NOT INCLUDE: words, letters, sentences, logos, watermarks, signatures, photorealism, 3D
rendering, depth of field blur, soft focus, airbrushed gradients, lens flare.

SETTING: [SETTING].

TWO SEPARATION RULES, BOTH STRICTLY ENFORCED TOGETHER.
RULE ONE, MATERIAL: every standable platform is a riveted wrought-iron walkway capped with a
bright polished brass leading edge that catches the light. Nothing in the background is capped
in brass. A player identifies a platform by that brass edge alone.
RULE TWO, TEMPERATURE: the entire background sits in cool blue-grey shadow, desaturated and
cold, with no warm colour anywhere behind. The foreground gameplay layer is lit warm with
copper, brass and amber lamplight, saturated and high contrast. Warmth alone tells the player
what is reachable.
```

**Verified `[SETTING]` values** — both hold the recipe, confirming it is level-type independent:

- `a soot-stained Victorian factory street at dusk, seen from the iron walkways above the road, with gas lamps, copper pipework and chimney stacks`
- `the interior of a vast Victorian boiler house, with riveted pressure vessels, flywheels, gantries, copper pipework and hanging lamps`

### `[SCALE_RATIO]` — calibrated, do not guess

The model renders about **1.6× more vertical world than the stated ratio.** Measured over three attempts:

| stated | actual screen-heights | character fills |
|---|---|---|
| "one fifth" (a percentage) | — | ~33–39% *(percentages were ignored twice)* |
| `two and a half` | ~4.0 | ~25% |
| `one and a half` | ~2.4 | ~42% |
| **`one and four fifths`** | ~3.2 | **~31% ← approved** |

**Name a countable ratio, never a percentage.** *(vault 4.4 — describe the camera, not the percentage;
if the model ignores a dimension three times, the prompt is naming the wrong variable. It did.)*
These are visual estimates from previews, not segmented measurements — treat as ±3%.

---

## 5. The two separation rules

Non-negotiable. They are why the art is readable, and they are independently measurable.

1. **MATERIAL (local):** every standable surface carries a bright polished brass leading edge.
   Nothing in the background is capped in brass. This is a *local edge cue* — no whole-region metric
   can see it, so it must be verified by eye. *(vault 4.19 — a metric blind to a mechanism will happily
   pass the wrong thing)*
2. **TEMPERATURE (global):** background entirely cool blue-grey and desaturated; foreground warm
   copper/brass/amber, saturated, high contrast.

They are deliberately redundant. Measured on the two approved settings, when one weakens the other
carries it:

| setting | sat gap | val gap | hue gap |
|---|---|---|---|
| exterior street | +0.017 | **−0.172** | 49.3° |
| interior boiler house | +0.024 | −0.081 | **111.1°** |

---

## 6. Techniques learned, reusable on every asset

**When this model will not drop an element, do not negate it — remove the space it would occupy.**

The HUD kept growing an unrequested second bar. Five strategies, in order:

| strategy | result |
|---|---|
| don't mention it | 2 bars |
| explicitly forbid it, naming it specifically | 2 bars, weakened to an empty trough |
| positively describe solid brass in its place | 2 bars, **worse** — returned fully filled |
| change the shape (circular gauge) | ✅ 1 indicator, but wrong form |
| **constrain the geometry** — "assembly height = medallion diameter" | ✅ **1 bar, correct form** |

Related, and confirmed the hard way: **never contradict your own prompt.** Round 1 asked for "chunky
visible pixels, limited palette, flat shading" and then more detail — mutually exclusive. The fix was
to *replace* the rendering block, not append to it. *(vault 4.3 — a self-contradicting clause cost 12
credits last time)*

---

## 7. Verification gates for generated art

Run on every batch, before the asset is accepted:

1. **Dimensions read from the file**, never from the aspect label. *(4.11)*
2. **Alpha channel read directly** — never `mode == "RGBA"`. Expect none; key by chroma. *(4.12/4.13)*
3. **Zone separation measured** with the HUD region excluded from sampling. The HUD is dark and
   saturated and sits in the background band; including it contaminates the result. *(learned the hard
   way this gate — see GENERATION-LOG round 2)*
4. **Brass-cap rule checked by eye.** No global metric can see it. State plainly that the gate does
   not cover it rather than shipping a number that means nothing. *(vault 9.3)*
5. **Readability at true sprite size** — downscale to the real in-game dimensions and look. A recipe
   that reads at 2752px can turn to mush at 128px.

---

## 8. Not locked yet

- **CHARACTER ANCHOR** — deferred by decision. The character in the probes is incidental and was never
  chosen deliberately. Before any Phase 4 sprite work, run dedicated full-body character concepts on
  chroma green in this style and write the immutable anchor block here. *(`character-design` skill)*
- **Tileset grid cell size** — Phase 3 publishes it, and Phase 4 art must hit it. Because nano-banana-2
  exposes no explicit width/height, grid-exactness happens in **post**: generate at 2K/4K, measure, then
  downscale and slice deterministically.
- **Palette ramp** — the two-zone rule is locked; an explicit colour ramp is not. Extract one from the
  anchor image if Phase 4 needs quantisation.
- **Animation recipe** — `xai/grok-imagine-video/v1.5/image-to-video`, $0.01/s, 24fps, ~25 frames per
  1s clip, 1080p free. Not yet tested. See [SOURCE-ANALYSIS.md](SOURCE-ANALYSIS.md) §6.
- **Enemy health bars** — required. A small, basic bar floating above each enemy, distinct from the
  player's ornate portrait-and-bar assembly. Constraints inherited from this document: it must obey the
  warm-foreground rule so it never reads as background, and it must stay legible at true sprite size
  against a cool background. Given §6, expect the model to try to stack a second bar here too —
  **constrain its geometry rather than negating it.** Lands in Phase 5 (behaviour, damage state) and
  Phase 6 (chrome). Also note vault **6.4**: gate the bar on what is *drawn*, not only what is true —
  an enemy at 2/100 HP must not render as visually empty, or the player will think it is dead.

## 9. Scale reality check

These mockups are concept art, not the game camera. At the locked **96–128px character on a 32px
grid**, the character is 3–4 tiles tall, which at a normal camera zoom reads closer to **20%** of screen
height than the ~31% in the anchor image. **The in-game character will look smaller than STYLE.md's
anchor.** That is expected, and Phase 3 sets the real camera.
