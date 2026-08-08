# STYLE.md — locked art direction

**Status: APPROVED 2026-08-04 (Gate 5).** Anchor image: `assets/style-probe/r9-bar-smaller.png`.

This is the recipe. **Every later asset reuses it.** Changing anything in §2–§5 is a STYLE.md change and
needs approval, not a prompt tweak. Arrived at over 21 generations / $1.68 — see
[GENERATION-LOG.md](GENERATION-LOG.md).

🔒 **That last sentence is now a gate, not a request.** `tests/unit/style-lock.test.ts` pins the §2
parameter table, the §4 prompt template and the §5 separation rules by content hash, and runs on every
`npm test`. Edit one and the suite goes red with the new hash and instructions.

**To change a locked section:** get approval, make the edit, run the suite, paste the printed hash into
`LOCKS`, and record the reason in [QA-LOG.md](QA-LOG.md). **Never update a hash to make a red suite
green** — the failure *is* the approval checkpoint.

Deliberately **not** locked, so a gate-0 re-probe needs no ceremony: §2b, the `[SETTING]` values, the
`[SCALE_RATIO]` calibration table and §5's measurement table. All four were measured on the retired
`nano-banana-2` and are *supposed* to change. Verbatim text is locked; measurements are not.

---

## 1. Direction in one line

Victorian industrial steampunk, rendered as detailed high-definition pixel art, where **the foreground
is warm and brass-capped and the background is cool and shadowed** — so the player can tell what is
standable without thinking about it.

---

## 2. Model and parameters — exact

**Changed at Gate 7 (2026-08-05) by user decision: `nano-banana-2` → `nano-banana-pro`.**
Reason given: substantially more input control. See §2b for what changed and what that costs.

| Field | Value |
|---|---|
| Endpoint | **`fal-ai/nano-banana-pro`** (Gemini 3 Pro Image) |
| Alias | `fal-ai/gemini-3-pro-image-preview` — same model, same price |
| Edit endpoint | `fal-ai/nano-banana-pro/edit` (same price, adds required `image_urls`) |
| `seed` | **`20260804`** — see §3 |
| `aspect_ratio` | `16:9` for scenes and backgrounds |
| `resolution` | `2K` |
| `output_format` | `png` |
| `num_images` | `1` |
| `limit_generations` | `true` (default) — ignores any "make N images" phrasing inside the prompt |
| `enable_web_search` | `false` — leave off; it makes output depend on the live web, which is unreproducible |
| `safety_tolerance` | `4` (default) |
| `system_prompt` | empty — see §2b before using it |
| Cost | **$0.15 per image at 1K and 2K. 4K is charged at 2× = $0.30.** |

**Price source, both read 2026-08-05:** `genmedia pricing fal-ai/nano-banana-pro` → `0.15 / images
USD`; and the fal model-API reference,
`fal.ai/docs/model-api-reference/image-generation-api/nano-banana-pro` → *"Cost per Image $0.15 …
4K outputs will be charged at double the standard rate."* The two agree, which is itself worth
recording — they do **not** agree for Seedance 2 (SOURCE-ANALYSIS §6b). **Neither is an invoice.**
*(4.9)*

### Full input schema — `fal-ai/nano-banana-pro`

Reproduced here because this is the locked recipe. **The complete reference for this and every other
endpoint — output schemas, prices with sources, and every known gotcha — is
[FAL-MODELS.md](FAL-MODELS.md).**

Read from `genmedia schema` on 2026-08-05. The `/edit` endpoint is identical plus a **required**
`image_urls: string[]`, and its `aspect_ratio` defaults to `auto` instead of `1:1`.

| Field | Type | Default | Values / notes |
|---|---|---|---|
| `prompt` | string | — | **required** |
| `image_urls` | string[] | — | **required on `/edit` only** |
| `aspect_ratio` | string\|null | `1:1` | `auto, 21:9, 16:9, 3:2, 4:3, 5:4, 1:1, 4:5, 3:4, 2:3, 9:16` |
| `resolution` | string | `1K` | `1K, 2K, 4K` |
| `output_format` | string | `png` | `jpeg, png, webp` |
| `seed` | integer\|null | — | reproducibility, not control |
| `num_images` | integer | `1` | min 1, **max 4** |
| `limit_generations` | boolean | `true` | forces one generation per prompting round |
| `system_prompt` | string | `""` | sent as Gemini's system instruction |
| `enable_web_search` | boolean | `false` | lets the model pull live web context |
| `safety_tolerance` | string | `"4"` | `"1"`–`"6"`; 1 strictest |
| `sync_mode` | boolean | `false` | returns a data URI; **result is then absent from request history** |

**There is still no explicit `width`/`height`.** Grid-exactness happens in post, exactly as before.

### 2b. What the swap changed — and the two things it invalidates

**Gained** (none of these existed on `nano-banana-2`): `system_prompt`, `num_images` up to 4,
`enable_web_search`, `safety_tolerance`, `limit_generations`.

**Lost:** the extreme banner ratios `4:1, 1:4, 8:1, 1:8` are **not** in `nano-banana-pro`'s enum.
`nano-banana-2` had them. If a parallax strip needs 8:1, it must be composed from 21:9 tiles or
generated on the old endpoint. Also lost: the `0.5K` resolution tier.

**Cost is no longer flat.** `nano-banana-2` charged $0.08 regardless of resolution, which is why
"generate at 4K and downscale" was free. On `nano-banana-pro`, 4K costs **double**. At our locked
`2K`, an image goes **$0.08 → $0.15, a 1.88× increase**.

✅ **RE-MEASURED on `nano-banana-pro`, Phase 4a gate 0, 2026-08-08.** Request ids
`019fdffa-0b2c-7a02-b24f-04f8e77522c7` and `019fdffb-0b65-7c60-a1b6-1e4daf0e31dc`;
full working in [GENERATION-LOG.md](GENERATION-LOG.md) § Gate 0.

1. **Returned pixel dimensions at `16:9` / `2K`: `2752 × 1536`, ratio `1.7917`.** Identical to
   `nano-banana-2`, and still **not** 16 : 9 (1.7778). Read off the file, because the job record
   reports `width: null` *(vault 4.11)*. That the number happens to match does not make the old
   measurement valid — it makes this one confirmatory.
2. **No alpha channel.** PNG colour type 2 (RGB), and no pixel carries transparency. Read from the
   channel's values, never from `mode` *(vault 4.12)*. **Chroma keying remains mandatory.**

🔴 **A third fact, not previously listed, and the most consequential: `nano-banana-pro` is NOT
seed-deterministic.** Two byte-identical requests at seed `20260804` returned images differing in
**59.4 %** of their RGBA bytes (mean absolute pixel difference 0.807 % of full scale). §3 states the
consequence in advance and it now applies: **the A/B method in §3 is void**, `seed` is a
record-keeping label rather than a control, and the byte-identical rebuild contract *(vault 4.15)*
can only be satisfied by **re-fetching a `request_id`**, never by re-running a prompt.

🔴 **A fourth, found while generating the character anchors: the model does not return the chroma
colour it is asked for.** Six anchor generations carried the identical clause *"one flat uniform
chroma green field, RGB 0 255 0"*. Four came back within L1 distance 30 of pure green; two came back
at **`(0,195,64)`** and **`(65,162,81)`** — distance 124–144, *above* the keying HIGH threshold, so
every background pixel was classified as subject and **0 %** keyed away. The fix is not a wider
tolerance, which would eat a dark green garment: `tools/gen/chroma.mjs` measures the key colour from
each image's own border and refuses images whose border is not uniform. Vault 4.11 one level up —
read it off the file, never off the label, where here the label is the prompt.

⚠️ **The scene anchor `r9-bar-smaller.png` was generated by `nano-banana-2`** and remains the visual
target for SCENES. The §4 `[SCALE_RATIO]` calibration has been **re-measured** (see §4) and the §5
separation measurements have **not** — they remain `nano-banana-2` hypotheses until a scene batch
re-probes them, and §5's table says so.

---

## 3. Seed strategy

**Fixed seed `20260804` for all comparison work.** When A/B-ing a prompt change, hold the seed constant
so the prompt is the only variable *(vault 4.10 — expect exactly one number to move)*.

**For production batches**, vary the seed per asset and **record it in GENERATION-LOG.md**. A seed you
did not write down is a result you cannot reproduce *(vault 4.15)*.

Note the limit honestly: on this model family the seed gives *reproducibility*, not *control*.
Identity consistency across assets comes from the reference image, not the seed *(vault 4.1)*.
`nano-banana-pro`'s seed accepts an integer or null; **its determinism is untested** — if two
identical calls at the same seed return different images, the whole A/B method in this section is
void, so make that the first thing gate 0 notices.

---

## 4. Prompt template

Slots in `[BRACKETS]`. Everything else is verbatim and must not be reworded casually.

> ⛔ **Scope of every claim in §4 and §5: `nano-banana-2`.** Every "verified", "calibrated" and
> "measured" word below is a true statement about the **retired** model. On `nano-banana-pro` they are
> **hypotheses with good priors** until §7 gate 0 re-probes them. Read them as *"this is what worked
> and why"*, not as *"this is what will happen"*. The prompt text itself carries over unchanged — it
> is the **numbers and the verdicts** that do not.

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

**`[SETTING]` values verified on `nano-banana-2`** — both held the recipe there, confirming it was
level-type independent on that model:

- `a soot-stained Victorian factory street at dusk, seen from the iron walkways above the road, with gas lamps, copper pipework and chimney stacks`
- `the interior of a vast Victorian boiler house, with riveted pressure vessels, flywheels, gantries, copper pipework and hanging lamps`

### `[SCALE_RATIO]` — re-measured on `nano-banana-pro`, gate 0.4

🔴 **The transfer function CHANGED with the model: ×1.6 → ×2.46.** `nano-banana-pro` renders
substantially more vertical world for the same wording. What carried over is the *method*, exactly as
predicted: name a countable ratio, measure what you get, solve for the constant.

| model | stated | actual screen-heights | character fills | transfer |
|---|---|---|---|---|
| `nano-banana-2` | `one and four fifths` | ~3.2 | ~31% | ×1.6 |
| **`nano-banana-pro`** | `one and four fifths` | **~4.43** | **~22.6%** | **×2.46** |

Measured off request id `019fdffa-0b2c-7a02-b24f-04f8e77522c7` at full resolution: the character
spans 347 px of a 1536 px frame.

**Decision, taken at the gate-0 STOP:** record the new constant and **re-derive against the real
camera when backgrounds are generated**, rather than re-running §6's ladder now. `[SCALE_RATIO]` is
used only by SCENE and BACKGROUND prompts — the character anchor and every sprite sheet are generated
at `9:16` with no scale clause at all — and §9 already establishes that the binding number is
ASSET-PIPELINE §0a's `96 px = 8.89 %` of screen height, not a figure from concept art. Re-calibrating
against a target the game never uses would be spending to match the wrong number.

The `nano-banana-2` calibration below is retained as provenance. **It describes a retired model** and
none of its rows may be used to predict `nano-banana-pro` behaviour.

| stated | actual screen-heights | character fills |
|---|---|---|
| "one fifth" (a percentage) | — | ~33–39% *(percentages were ignored twice)* |
| `two and a half` | ~4.0 | ~25% |
| `one and a half` | ~2.4 | ~42% |
| **`one and four fifths`** | ~3.2 | **~31% ← approved on the retired model** |

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

They are deliberately redundant. Measured **on `nano-banana-2`** across the two approved settings —
when one weakened, the other carried it:

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

**Gate 0 — the model-swap re-probe. Runs ONCE, before anything else, and blocks every other gate.**

One generation on `fal-ai/nano-banana-pro` with the §4 template unchanged, seed `20260804`,
`16:9`, `2K`, `png`. Cost: **$0.15**. It answers four questions that the swap reopened:

| # | Question | Method | Was, on nano-banana-2 |
|---|---|---|---|
| 0.1 | Actual returned pixel dimensions | read the file *(4.11)* | `2752 × 1536`, ratio `1.7917` |
| 0.2 | Alpha channel present? | read the channel, never `mode ==` *(4.12)* | absent — `mode=RGB` |
| 0.3 | Does the §4 template still produce **one** health bar? | look | yes, via the geometry constraint |
| 0.4 | Does `[SCALE_RATIO] = one and four fifths` still land at ~31%? | measure | yes, transfer ×1.6 |
| 0.5 | **Is the model seed-deterministic at all?** | two identical calls, compare bytes | untested |

**RESULT, 2026-08-08 — gate 0 is CLOSED.** 0.1 `2752 × 1536` confirmed · 0.2 no alpha, keying stays
mandatory · 0.3 one health bar, the geometry constraint holds · **0.4 FAILED** — ~22.6 %, transfer
×2.46, resolved by recording the constant and re-deriving at background generation · **0.5 FAILED —
the model is not seed-deterministic**, which voids §3's A/B method. Full working in
[GENERATION-LOG.md](GENERATION-LOG.md) § Gate 0; consequences written into §2b and §4.

Any of 0.3 / 0.4 failing means re-running §6's technique ladder against the new model — **not**
tweaking the wording and hoping. Record the result in GENERATION-LOG.md as Gate 7 round 1.

Then, on every batch, before the asset is accepted:

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

## 8. CHARACTER ANCHOR — LOCKED

**Locked 2026-08-08, Phase 4a gate 4.0b, by user selection from nine candidates over three rounds.**
Source image: `public/assets/characters/brass-courier/anchor.png`, request id
`019fe00f-2745-7b71-b34c-b26470e422c1`, generated on `fal-ai/nano-banana-pro` at `9:16` / `2K` from
the prompt saved verbatim beside it as `anchor.prompt.txt`.

> **This block is IMMUTABLE.** It is the identity every animation clip, every edit and every later
> enemy comparison is measured against. Vault **4.1**: the reference image is the lever, not the
> wording — so when a generation drifts, re-feed this anchor, do not rewrite this description.
> Changing it is an approval checkpoint, not a prompt tweak.

```text
CHARACTER ANCHOR:
brass-courier, a young man in his early twenties, lean and wiry with a narrow upright stance;
a squared masculine jaw, straight brow, light stubble, fair skin; short dark brown hair;
brass multi-lens goggles with a cracked leather strap pushed up on the forehead;
a riveted brass pauldron on his right shoulder; a cream shirt with rolled sleeves under a brown
leather waistcoat; a bandolier of small capped copper vials across the chest; a pocket watch on a
brass chain; a wide leather belt with an engraved brass buckle and tool loops holding a spanner;
a scuffed leather satchel with two brass catches at the left hip; a mechanical brace on the left
forearm of riveted brass plates with a small round pressure gauge and two copper pipes to a
knuckle guard; grey-green work trousers with stitched knee patches; scuffed brown buckled boots;
detailed high-definition pixel art per §4 RENDERING.
```

**Slug: `brass-courier`. A slug never changes** — it is the join key between the catalog, the bounds
config and the loader.

**Measured on the locked anchor**, keyed against its own border colour `(4,249,6)`:

| What | Value |
|---|---|
| Generated frame | `1536 × 2752` |
| Trimmed figure | `940 × 2526`, aspect **0.372** |
| At the game's render height | `36 × 96` px |
| Game collision box | `44 × 96` px, aspect 0.458 *(ASSET-PIPELINE §0a)* |

The figure is **narrower than the collision box**, which is the safe direction: the art never claims
ground the collision does not back up. The 4 px of slack per side is recorded here rather than
"corrected" by stretching, because vault **4.14** forbids rescaling one state's frames to fix
framing — shift with area preserved, never scale.
- **Tileset grid cell size** — Phase 3 publishes it, and Phase 4 art must hit it. Because nano-banana-2
  exposes no explicit width/height, grid-exactness happens in **post**: generate at 2K/4K, measure, then
  downscale and slice deterministically.
- **Palette ramp** — the two-zone rule is locked; an explicit colour ramp is not. Extract one from the
  anchor image if Phase 4 needs quantisation.
- **Animation recipe** — **`bytedance/seedance-2.0/image-to-video`** (changed at Gate 7 from Grok
  Imagine, by user decision). Not yet tested, and its price is contested by a factor of ~22 between
  two sources. **Minimum clip is 4 seconds, not 1.** Read
  [SOURCE-ANALYSIS.md](SOURCE-ANALYSIS.md) §6 in full before spending anything on it.
- **Enemy health bars** — required. A small, basic bar floating above each enemy, distinct from the
  player's ornate portrait-and-bar assembly. Constraints inherited from this document: it must obey the
  warm-foreground rule so it never reads as background, and it must stay legible at true sprite size
  against a cool background. Given §6, expect the model to try to stack a second bar here too —
  **constrain its geometry rather than negating it.** Lands in Phase 5 (behaviour, damage state) and
  Phase 6 (chrome). Also note vault **6.4**: gate the bar on what is *drawn*, not only what is true —
  an enemy at 2/100 HP must not render as visually empty, or the player will think it is dead.

## 9. Scale reality check

These mockups are concept art, not the game camera. At the locked **96–128px character on a 32px
grid**, the character is 3–4 tiles tall. **The in-game character will look smaller than STYLE.md's
anchor.** That is expected, and Phase 3 set the real camera.

**MEASURED IN PHASE 3, replacing this section's earlier guess of "closer to 20%".** The character
is **96px on a 1080px viewport at camera zoom 1 — 8.89% of screen height**, against ~31% in the
anchor image. The estimate was out by a factor of 2.25, which is exactly why §9 delegated the number
to the phase that builds the camera rather than asserting one here.

The binding figures live in [ASSET-PIPELINE.md](ASSET-PIPELINE.md) §0a and are pinned against the
runtime constants by `tests/unit/tilemap-data.test.ts`. This section is prose about the anchor
image; that table is the contract. **§9 is outside every hash-locked slice, so no lock hash moves.**
