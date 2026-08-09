# FAL-MODELS.md — every fal.ai endpoint this project uses

**The permanent API reference.** Everything we need to know about each endpoint, in one place, so no
phase has to re-derive it and no claim has to be remembered.

**All schemas read from `genmedia schema <id>` and `genmedia schema <id> --format openapi`; all prices
from `genmedia pricing <id>`, cross-checked against `fal.ai/docs/model-api-reference/…` where a page
exists. Read date: 2026-08-05. `genmedia` v0.7.0.**

> ⚠️ **A quoted price is not an invoice.** The last project's CLI preflight under-reported by ~6×,
> and for Seedance 2 the two sources here disagree by ~22×. **Reconcile against the real invoice
> before budgeting anything.** *(vault 4.9)*

> 🔄 **Re-read this file's schemas at the start of any phase that generates.** Endpoints change:
> `nano-banana-pro/edit` was last updated 2026-06-18, `nano-banana-pro` 2026-04-28. A schema in a
> document is a snapshot, not a contract.

---

## Contents

| Endpoint | Used by | Price |
|---|---|---|
| [`fal-ai/nano-banana-pro`](#1-fal-ainano-banana-pro) | all stills, tilesets, backgrounds, HUD | $0.15/image |
| [`fal-ai/nano-banana-pro/edit`](#2-fal-ainano-banana-proedit) | reference-driven revision | $0.15/image |
| [`bytedance/seedance-2.0/image-to-video`](#3-bytedanceseedance-20image-to-video) | character + enemy animation | **contested** |
| [`bytedance/seedance-2.0/reference-to-video`](#4-bytedanceseedance-20reference-to-video) | identity lock across clips | **contested** |
| [`fal-ai/bria/background/remove`](#5-fal-aibriabackgroundremove) | chroma-key fallback | $0.018/generation |
| [`fal-ai/stable-audio-3/small/sfx/text-to-audio`](#6-fal-aistable-audio-3smallsfxtext-to-audio) | Phase 7 SFX | $0.0206/audio |
| [`fal-ai/stable-audio-3/small/music/text-to-audio`](#7-fal-aistable-audio-3smallmusictext-to-audio) | Phase 7 music bed | $0.0217/audio |

**Retired, kept only so stale claims stay traceable:** `fal-ai/nano-banana-2` (was $0.08 flat) and
`xai/grok-imagine-video/v1.5/*` (was $0.01/second). See [§8](#8-retired-endpoints).

---

## 0. The CLI — how any of this is actually invoked

```
genmedia setup|init|skills|models|schema|run|status|upload|assets|pricing|docs|gallery|version|update
```

| Command | What it does |
|---|---|
| `genmedia models "<query>" [--no-classify]` | search the catalog. **`--no-classify` matters** — without it the CLI infers a category from the query and a video model searched as bare text returns 0 results |
| `genmedia schema <id>` | compact input/output schema |
| `genmedia schema <id> --format openapi` | **the authoritative one.** The compact view reports `type: unknown` for nullable and enum-in-`anyOf` fields; the OpenAPI view has the real enums |
| `genmedia pricing <id>` | unit price and unit |
| `genmedia docs "<query>"` | searches fal's own documentation. **This works when the model web pages return HTTP 429** |
| `genmedia run <id> [flags]` | run. `--async` queues and returns a `request_id`; `--download` saves media; `--json` for parseable output |
| `genmedia upload <path>` | **local file → fal CDN URL.** Required before any `image_url` field |
| `genmedia status <request_id>` | poll or fetch an async result |

### Two operational facts worth more than they look

🔴 **`image_url` needs a URL, not a path.** Our anchor is a local PNG. **Every animation call is
therefore two steps** — `genmedia upload ./anchor.png` first, then pass the returned CDN URL. Budget
that into any script; forgetting it is the first thing that will fail.

⚠️ **`sync_mode: true` returns the media inline as a data URI and the result is NOT saved to request
history.** Every endpoint here has this flag. **Leave it `false`.** A generation absent from request
history cannot be re-fetched by `request_id`, which breaks the rebuild contract
([ASSET-PIPELINE.md](ASSET-PIPELINE.md) §10) — the run would be unreproducible the moment the local
file is lost. *(4.15)*

**Verified at Gate 3, $0:** `genmedia` is a native Go `.exe`, not a `.cmd` shim, so PowerShell 7
passes arguments to it directly with no `cmd.exe` round-trip. A multi-line prompt containing
newlines, quotes, `$`, backticks, `--flags`, slashes, `%` and `&` round-trips **byte-intact**.
The vault's argument-mangling hazard does not apply here. *(A1)*

---

## 1. `fal-ai/nano-banana-pro`

**Gemini 3 Pro Image.** Text-to-image. The project's still-image model for everything: style probes,
character anchors, tilesets, backgrounds, HUD chrome.
**Alias:** `fal-ai/gemini-3-pro-image-preview` — same model, same price.

### Price

**$0.15 per image at 1K and 2K. 4K is charged at 2× = $0.30.**

Both sources agree, which is worth recording because they do **not** agree for Seedance 2:
- `genmedia pricing fal-ai/nano-banana-pro` → `0.15 / images / USD`
- `fal.ai/docs/model-api-reference/image-generation-api/nano-banana-pro` → *"Cost per Image $0.15 …
  4K outputs will be charged at double the standard rate"*, *"~7 generations per $1.00"*

**Price is NOT flat across resolutions.** `nano-banana-2` was, which is why "generate at 4K and
downscale" used to be free. It is not free now.

### Input

| Field | Type | Default | Values / constraints |
|---|---|---|---|
| `prompt` | string | — | **required** |
| `aspect_ratio` | string \| null | `1:1` | `auto, 21:9, 16:9, 3:2, 4:3, 5:4, 1:1, 4:5, 3:4, 2:3, 9:16` |
| `resolution` | string | `1K` | `1K, 2K, 4K` |
| `output_format` | string | `png` | `jpeg, png, webp` |
| `seed` | integer \| null | — | reproducibility, not control |
| `num_images` | integer | `1` | **min 1, max 4** |
| `limit_generations` | boolean | `true` | forces one generation per prompting round; ignores "make N images" phrasing inside the prompt |
| `system_prompt` | string | `""` | sent as Gemini's system instruction |
| `enable_web_search` | boolean | `false` | lets the model pull live web context |
| `safety_tolerance` | string | `"4"` | `"1"`–`"6"`; `"1"` strictest |
| `sync_mode` | boolean | `false` | see §0 — leave false |

### Output

| Field | Type | Notes |
|---|---|---|
| `images` | array | the generated images |
| `description` | string | the model's own description of what it made |

### What you must know

🔴 **No explicit `width` / `height` exists.** You get `aspect_ratio` + `resolution` and nothing else.
Grid-exactness for the Phase 3 tileset therefore happens **in post**: generate, measure the file,
downscale and slice deterministically.

🔴 **Read returned dimensions off the downloaded file, never off the aspect label.** On
`nano-banana-2`, `16:9 @ 2K` returned `2752×1536` — ratio `1.7917`, not `1.7778` — and the job record
returned `width: null`. **`nano-banana-pro`'s returned dimensions are UNMEASURED.** *(4.11)*

🔴 **Read the alpha channel directly; never test `mode == "RGBA"`.** `nano-banana-2` returned
`mode=RGB` with alpha genuinely absent. `nano-banana-pro` is unmeasured; chroma keying stays mandatory
until proven otherwise. *(4.12)*

⚠️ **Do not set `enable_web_search`.** It makes output depend on the live web, which destroys
reproducibility — the same call on a different day returns a different image.

⚠️ **`enable_prompt_expansion` has no equivalent here, but `system_prompt` does the same damage if
misused.** Anything that adds unrecorded text to the prompt breaks the "one variable at a time" rule.
*(4.10)*

⚠️ **Lost versus `nano-banana-2`:** the ratios `4:1`, `1:4`, `8:1`, `1:8` and the `0.5K` tier are
**gone**. An 8-frame walk-cycle strip *is* an 8:1 image and used to be directly requestable. It must
now be packed in post.

**Seed determinism is untested on this model.** If two identical calls at the same seed return
different images, the entire A/B method in [STYLE.md](STYLE.md) §3 is void. Gate 0 checks this first.

---

## 2. `fal-ai/nano-banana-pro/edit`

Image-to-image. **This is the lever for identity consistency** — vault **4.1**: *change the
reference, not the wording.*

**Price: $0.15 per image** — identical to text-to-image, so reference-driven iteration costs no premium.

**Schema is identical to §1 with two differences:**

| Field | Type | Default | Notes |
|---|---|---|---|
| `image_urls` | array\<string\> | — | **required.** Upload first (§0) |
| `aspect_ratio` | string \| null | **`auto`** | defaults to `auto` here, not `1:1` |

Everything else — `prompt`, `resolution`, `output_format`, `seed`, `num_images`,
`limit_generations`, `system_prompt`, `enable_web_search`, `safety_tolerance`, `sync_mode` — is the
same, and the output is the same `{images, description}`.

**Last updated upstream 2026-06-18** (the base endpoint: 2026-04-28). Re-read before Phase 4.

---

## 3. `bytedance/seedance-2.0/image-to-video`

Animates one starting frame. **The project's animation workhorse**, replacing Grok Imagine.

### 🔴 Price — contested, unresolved, blocking

| Source | Figure |
|---|---|
| fal model-API reference, Seedance 2.0 pricing table | **$0.3034 / second** (720p with audio) · **$0.2419 / second** (fast tier) |
| `genmedia pricing bytedance/seedance-2.0/image-to-video` | **$0.014 / "unit"** — the CLI does not define "unit" |
| `genmedia pricing …/fast/image-to-video` | $0.0112 / unit |
| `genmedia pricing …/mini/image-to-video` | $0.007 / **1000 tokens** — a different billing model entirely |

**~22× apart.** With the 4-second floor, one clip is either **$0.056** or **$1.21**. Seven animations
is either **$0.39** or **$8.50**. **Neither number may authorise a batch.**
**One 4-second probe, then read the actual invoice line.** *(4.9)*

### Input

| Field | Type | Default | Values / constraints |
|---|---|---|---|
| `prompt` | string | — | **required** — the motion description |
| `image_url` | string | — | **required** — starting frame. JPEG/PNG/WebP, **max 30 MB** |
| `end_image_url` | string \| null | — | **last** frame; the video transitions start → end |
| `duration` | string | `auto` | `auto`, or **`"4"`–`"15"`**. 🔴 **minimum is 4** |
| `resolution` | string | `720p` | schema: `480p, 720p, 1080p, 4k` — ⚠️ **docs say `480p, 720p` only** |
| `aspect_ratio` | string | `auto` | `auto, 21:9, 16:9, 4:3, 1:1, 3:4, 9:16` |
| `generate_audio` | boolean | **`true`** | ⚠️ **set `false`** — we want frames |
| `bitrate_mode` | string | `standard` | `standard, high` |
| `end_user_id` | string \| null | — | unused |

Note `duration` is a **string enum**, not a number: `"4"`, not `4`.

### Output

```json
{ "video": { "url": "…" }, "seed": 42 }
```

🔴 **That is the entire output.** No `fps`, no `num_frames`, no `width`, no `height`.

### What you must know

🔴 **The frame rate is unknown and cannot be looked up.** Grok published `fps: 24, num_frames: 145`
in its output schema, which is how the frame math was answered for free at Gate 4. Seedance 2
publishes nothing. **`ffprobe` the downloaded clip and record what it actually says.** Do not assume
24 fps, and do not write down a computed frame count before that measurement exists. *(4.11)*

🔴 **The 4-second minimum is the defining constraint.** Grok's 1-second floor is why a clip cost a
cent. There is no way to buy less than 4 seconds.

⚠️ **`end_image_url` = the same anchor is the loop trick.** Pass the anchor as both first and last
frame and the clip closes into a true loop — exactly what idle, walk and run cycles need, and
something Grok could not do at all. ✅ **VERIFIED and gated in Phase 4** *(not Phase 5 — this line
named the wrong phase)*: `gateLoopWrap` runs over every shipped `loop` sheet in
`tests/unit/shipped-sheets.test.ts` and is green on idle, walk and run. Omit it for one-shot actions
(attack, hurt, death) where the end pose differs.

⚠️ **`generate_audio` defaults to `true`.** fal's docs state cost is identical either way, so this is
bytes and generation time, not money — set it `false` regardless.

⚠️ **Price is no longer resolution-free.** Under Grok, billing was duration-metered so 1080p cost the
same as 480p and "always generate at 1080p" was free headroom. **That rule is withdrawn.** Probe at
`720p`, the only value both sources agree exists.

⚠️ **A 4-second clip is four seconds of motion, not four times the detail.** Vault **4.7** applies
harder, not less: **name the cycle count in the prompt** — *"takes exactly six full strides during the
clip"* — or a long clip buys one slow stride sampled many times. Getting this wrong now costs 4× what
it did under a 1-second clip.

### Tiers

`…/fast/image-to-video` and `…/mini/image-to-video` exist. `mini` is billed per **1000 tokens**
rather than per unit, so it is not comparable without a probe of its own.

---

## 4. `bytedance/seedance-2.0/reference-to-video`

**The escalation path** when character identity drifts between separately-generated clips.
Unlike Grok's equivalent, its price sits in the same (contested) table as the rest rather than being
unquotable — `genmedia pricing` reports the same `$0.014 / unit`.

**Replaces `image_url` / `end_image_url` with three reference arrays. Total files across all
modalities must not exceed 12.**

| Field | Limit | Referenced in the prompt as |
|---|---|---|
| `image_urls` | up to **9**, ≤30 MB each | `@Image1`, `@Image2`, … |
| `video_urls` | up to **3**, combined duration 2–15 s, <50 MB total, each ~480p (640×640) to ~720p (834×1112) | `@Video1`, … |
| `audio_urls` | — | `@Audio1`, … |

`prompt`, `duration`, `resolution`, `aspect_ratio`, `generate_audio`, `bitrate_mode` behave as in §3.
Output is the same `{video, seed}`.

**9 reference images versus Grok's 7**, and the tag syntax differs — `@Image1` here, `<IMAGE_0>` there.
Prompts do not port between them.

---

## 5. `fal-ai/bria/background/remove`

The fallback when chroma keying fails.

**Price: $0.018 per generation** — `genmedia pricing fal-ai/bria/background/remove` →
`0.018 / generations / USD`.

| Field | Type | Default | Notes |
|---|---|---|---|
| `image_url` | string | — | **required** |
| `sync_mode` | boolean | `false` | leave false |

**Output:** `{ image }`.

**It is a fallback, not the plan.** The primary path is chroma keying by L1 colour distance with a
tolerance — never equality: ask for `#FF00FF` and you get `~(252,1,252)`, with only **0.004%** of
pixels exactly pure. *(4.13)*

---

## 6. `fal-ai/stable-audio-3/small/sfx/text-to-audio`

**Phase 7's SFX endpoint** — a checkpoint trained specifically for sound effects, not music.

**Price: $0.0206 per audio — FLAT per generation, not per second.**

### Input

| Field | Type | Default | Values / constraints |
|---|---|---|---|
| `prompt` | string | — | **required** — text description of the audio |
| `negative_prompt` | string | `""` | qualities to avoid |
| `duration` | number | `30` | seconds; a real number, so fractions are allowed |
| `seed` | integer \| null | — | omit for random |
| `output_format` | string | `mp3` | `mp3, wav, flac, ogg, opus, m4a, aac` |
| `bitrate` | string | `192k` | e.g. `320k`; **ignored for wav/flac** |
| `num_inference_steps` | integer | `8` | distilled checkpoint — *"gain little from going higher"* |
| `guidance_scale` | number | `1` | **only effective on base (non-distilled) checkpoints** |
| `enable_prompt_expansion` | boolean | `false` | expands the prompt with an LLM |
| `enable_safety_checker` | boolean | `true` | NSFW check |
| `sync_mode` | boolean | `false` | leave false |

**Output:** `{ audio, seed, prompt }` — it echoes back the prompt actually used.

### What you must know

✅ **Price is flat per generation, so duration is free.** Generate long and trim locally rather than
asking for a 0.4-second cue. This is the one place the old "1080p is free" logic still holds — and
unlike that case, it is *sourced*, not assumed.

🔴 **Use `output_format: wav`.** Vault **7.3**: hot masters must be measured with a **32-bit float
decode**, because a 16-bit decode saturates at exactly the value it is supposed to detect. Do not
measure a lossy `mp3`. `bitrate` is ignored for `wav`.

⚠️ **Leave `enable_prompt_expansion: false`.** It rewrites your prompt with an LLM, so the recorded
prompt is no longer the prompt that ran — unreproducible by construction, and it silently breaks
"one variable at a time". *(4.10)* The output's `prompt` field is how you'd detect this.

⚠️ **`guidance_scale` does nothing here.** This is a distilled checkpoint; the field is accepted and
ignored. A knob that accepts a value and changes nothing is exactly what vault **A6** says to sweep
and verify before trusting.

✅ **`negative_prompt` is the direct countermeasure to vault 7.1** — *"very short and clean"* returned
literal silence at −37.9 dBFS. Ask for the **physical event**, and put the qualities that produced
silence in `negative_prompt` instead of the prompt.

🔴 **Measure every cue's floor. Never accept a cue by listening.** *(7.1)* And probe **one** model on
**one** cue before any batch — last time the model whose name promised audio measured −29 dBFS with
no transient, at 2.5× the price. *(7.2)*

**Base (non-distilled) variant:** `fal-ai/stable-audio-3/small/sfx/base/text-to-audio` — that is where
`guidance_scale` and higher `num_inference_steps` actually do something. Also available:
`…/sfx/audio-to-audio`, `…/sfx/audio-inpainting`, `…/sfx/audio-outpainting` for repair rather than
regeneration.

---

## 7. `fal-ai/stable-audio-3/small/music/text-to-audio`

**Phase 7's music bed.** Same family, music-trained checkpoint.

**Price: $0.0217 per audio, flat.**

**Input and output are identical to §6** — same fields, same defaults, same enums, same gotchas.
Everything in §6's "what you must know" applies here too.

For a looping music bed the `duration` default of 30 s is roughly the right order already, and since
price is flat, generating longer and trimming to a clean loop point costs nothing extra.

Larger tiers exist if the small checkpoint is not good enough:
`fal-ai/stable-audio-3/medium/text-to-audio`, `fal-ai/stable-audio-25/text-to-audio`.

---

## 8. Retired endpoints

Kept **only** so that stale claims elsewhere in the docs stay traceable to their source. **Do not
generate on these.**

| Endpoint | Was | Retired at | Why it matters now |
|---|---|---|---|
| `fal-ai/nano-banana-2` | Gemini 3.1 Flash Image, **$0.08/image flat**, `resolution` `0.5K/1K/2K/4K`, `aspect_ratio` including `4:1, 1:4, 8:1, 1:8` | Gate 7, 2026-08-05 | **All 21 style probes and every measured number in [STYLE.md](STYLE.md) §4–§5 came from here** — the `2752×1536` dimensions, the absent alpha channel, the ×1.6 scale transfer, the single-health-bar result |
| `xai/grok-imagine-video/v1.5/image-to-video` | **$0.01/second**, **1 s minimum**, `resolution` up to 1080p, output schema published `fps: 24`, `num_frames`, `width`, `height` | Gate 7, 2026-08-05 | The frame math in earlier drafts is its 24 fps, not Seedance's |
| `xai/grok-imagine-video/v1.5/reference-to-video` | 7 reference images tagged `<IMAGE_0>`, price unquotable (`0.00` compute seconds) | Gate 7, 2026-08-05 | Superseded by §4, which takes 9 and tags them `@Image1` |

**`fal-ai/nano-banana-2` remains available on fal** and is the only way to get an `8:1` sprite-strip
ratio or the `0.5K` tier. If a future asset genuinely needs one, that is a **STYLE.md change and a
STOP**, not a quiet endpoint substitution.

---

## 9. Standing rules for every endpoint here

1. **Save the exact prompt and the job record beside the output**, and write the record only *after*
   the call succeeds. Redirect **stdout only** — merging stderr corrupts the JSON. *(4.17)*
2. **Record the `request_id`** in [GENERATION-LOG.md](GENERATION-LOG.md). It is the only way to
   re-fetch a job record from a fresh clone, and completed records are free to re-fetch. *(4.9, 4.15)*
3. **Probe one, then batch.** Budget from the invoice, not the estimate. *(4.9)*
4. **Hold the seed constant when A/B-ing a prompt change**, so exactly one number moves. Vary and
   **record** the seed for production batches. *(4.10)*
5. **Never contradict your own prompt.** A self-contradicting clause cost 12 credits last time; the
   fix is to *replace* the offending block, not append to it. *(4.3)*
6. **When the model will not drop an element, constrain the geometry rather than negating it.**
   Five strategies were tried on one unwanted health bar; only geometry worked.
   *(STYLE.md §6)*
7. **Read every measurement off the file.** Dimensions, alpha, frame rate, duration, loudness — never
   off a label, a doc, or an aspect ratio. *(4.11, 4.12)*
8. **STOP and ask before any batch over 5 generations**, with the estimated spend stated.
