# Phase 4 — the model swap, the anchor, and the pipeline probe

Gates 0, 0b, 0c and 4.2b/4.2c. **12 generations** on `fal-ai/nano-banana-pro` (2 + 3 + 6 + probe B),
quoted $1.80, plus **one `bytedance/seedance-2.0/image-to-video` probe** at a contested price.
Part of [GENERATION-LOG.md](../GENERATION-LOG.md) — the contract, the pointer table and the
reconciled spend live there.

---

## Gate 0 — the model-swap re-probe · 2 gens · $0.30 · (cum. $1.98)

Phase 4a's first job, blocking every other gate. §4 template unchanged, `[SCALE_RATIO]` = *one and
four fifths*, `[SETTING]` = the approved exterior street. Prompt extracted from STYLE.md §4 by
`tools/gen/prompt.mjs` rather than retyped, and saved verbatim at `_generated/gate-0/prompt.txt`.

| # | `request_id` | endpoint | seed | non-default inputs | quoted | invoiced | output | measured |
|---|---|---|---|---|---|---|---|---|
| 1 | `019fdffa-0b2c-7a02-b24f-04f8e77522c7` | `fal-ai/nano-banana-pro` | `20260804` | `aspect_ratio 16:9`, `resolution 2K`, `output_format png`, `num_images 1` | $0.15 | *pending* | `run1-…png` | **2752 × 1536**, RGB, no alpha |
| 2 | `019fdffb-0b65-7c60-a1b6-1e4daf0e31dc` | `fal-ai/nano-banana-pro` | `20260804` | identical to #1 | $0.15 | *pending* | `run2-…png` | **2752 × 1536**, RGB, no alpha |

**#2 is deliberately a byte-for-byte repeat of #1.** It exists only to answer gate 0.5.

| Gate | Question | Answer |
|---|---|---|
| 0.1 | Returned pixel dimensions | **2752 × 1536, ratio 1.7917** — identical to `nano-banana-2`, and still **not** 16 : 9 (1.7778). The job record reports `width: null`, so this is read off the file *(4.11)*. |
| 0.2 | Alpha channel | **Absent.** PNG colour type 2 (RGB); no pixel carries transparency. Read from the channel's values, never from `mode` *(4.12)*. **Chroma keying remains mandatory.** |
| 0.3 | Still one health bar? | **Yes.** One capsule bar attached to the circular medallion, assembly one row tall. The §6 geometry constraint survives the model swap. |
| 0.4 | Does *one and four fifths* still land at ~31 %? | **No — it lands at ~22.6 %.** See below. |
| 0.5 | **Seed determinism** | **NO.** See below. |

### 🔴 0.5 — `nano-banana-pro` is NOT seed-deterministic

Two identical calls, same seed, same everything: **59.4 % of RGBA bytes differ**, mean absolute
pixel difference **0.807 %** of full scale. The images are visibly different scenes in the same
style.

STYLE.md §3 states the consequence in advance: *"if two identical calls at the same seed return
different images, the whole A/B method in this section is void."* It is void. Three things follow:

1. **A prompt edit can no longer be attributed by comparing two generations.** Run-to-run variance
   at constant seed is the noise floor, and it is now measured rather than assumed *(vault 4.8)*.
2. **`seed` is a record-keeping label, not a control.** It is still logged, because it is part of
   the request, but it buys no reproducibility.
3. **The byte-identical rebuild contract *(4.15)* cannot be met by re-generating.** It can only be
   met by re-fetching the same `request_id`'s output — which is exactly why this log's contract
   requires the id on every row and why `assets:fetch` fetches by id. The design already assumed
   this; the probe confirms it was necessary.

### 🔴 0.4 — the scale transfer function changed

Measured off run 1 at full resolution: the character spans **y ≈ 858 → 1205 = 347 px** of a 1536 px
frame, i.e. **22.6 % of screen height**, or **4.43 screen-heights** of visible world.

| | `nano-banana-2` | `nano-banana-pro` |
|---|---|---|
| stated ratio | one and four fifths (1.8) | one and four fifths (1.8) |
| actual screen-heights | ~3.2 | **~4.43** |
| character fills | ~31 % | **~22.6 %** |
| transfer function | **× ~1.6** | **× ~2.46** |

`nano-banana-pro` renders substantially more vertical world for the same wording. Per STYLE.md §7
this is a gate-0 failure that means re-running §6's technique ladder against the new model, **not**
rewording and hoping. Visual estimate from a full-resolution crop, ±3 %, the same method §4's
calibration table uses.

## Gate 0b — character anchor candidates · 3 gens · $0.45 · (cum. $2.43)

Full-body concepts on chroma green, per STYLE.md §8. `9:16` rather than `1:1` because the character
contract is 44 × 96 px — aspect 0.458 — and a square frame wastes half the pixels on a standing
figure. RENDERING and DO-NOT-INCLUDE blocks lifted verbatim from the locked §4 template by
`prompt.mjs` so the anchor cannot drift stylistically from the approved scene *(vault 4.3)*.

| # | `request_id` | seed | concept | measured | figure | at 96 px |
|---|---|---|---|---|---|---|
| 1 | `019fdffe-f3d7-74d1-9b5a-7e9230dc8a07` | `20260804` | courier | 1536 × 2752, RGB | 862 × 2206 (0.391) | 38 × 96 |
| 2 | `019fdfff-6c4d-71c2-b9d7-fbd20af6de91` | `20260805` | engineer | 1536 × 2752, RGB | — see below | 54 × 96 |
| 3 | `019fdfff-d571-7cf1-a4e3-afc1d1716962` | `20260806` | aerialist | 1536 × 2752, RGB | 1006 × 1958 (0.514) | 49 × 96 |

### 🔴 The model does not return the green you ask for

All three prompts carried the identical clause *"one flat uniform chroma green field, RGB 0 255 0"*.

| concept | background actually returned | L1 distance from pure | keyed away with the assumed key |
|---|---|---|---|
| courier | `(0,251,0)` … `(8,245,11)` | 4 – 29 | 73.7 % |
| aerialist | `(1,252,1)` … `(10,244,9)` | 5 – 30 | 79.3 % |
| **engineer** | **`(0,195,64)`** … `(8,190,71)` | **124 – 144** | **0.0 %** |

124–144 is **above** `CHROMA.HIGH`, so every background pixel was classified as **subject** and the
figure trimmed to the full frame. Nothing about the prompt differed.

**Fix, and it is not a wider tolerance.** Raising `LOW` to 144 would start keying out a dark green
coat, which this character may legitimately wear. Instead `chroma.mjs` gained
`estimateKeyColour()`: sample the one-pixel border, take the per-channel **median** (robust to a
subject touching an edge, unlike a mean), and refuse outright if under 90 % of border pixels agree —
because an image without a uniform chroma background must not be keyed at all *(vault 4.16)*. This
is vault **4.11** applied one level up: read the key colour off the file, never off the label, where
here the label is the prompt.

Re-keyed against the measured colour: courier 73.8 %, aerialist 79.4 %, **engineer 55.2 %** — all
three correct. Committed as a regression test with the real numbers.

## Gate 0c — the anchor, chosen · 6 gens · $0.90 · (cum. $3.33)

Two further rounds after the candidates in 0b were rejected. **Exactly one variable moved per round**
*(vault 4.10)*, so each comparison stays attributable.

| Round | What moved | Gens | request ids |
|---|---|---|---|
| 0c-1 | The courier read as androgynous; sex stated explicitly four ways (noun, pronoun, jaw, stubble). Clothing, goggles, satchel and arm brace left **word for word** — they were what read at 96 px. | 3 | `019fe009-a6dc-7871-a423-7e4e9b905480`, `019fe00a-304c-7dc3-998d-7ad79cb6785d`, `019fe00a-a701-7c93-9b00-c3607c2f6456` |
| 0c-2 | Detail density. Ornamentation **enumerated element by element** rather than asked for generically. | 3 | `019fe00e-4453-7042-aa55-49af54fb7140`, `019fe00e-b578-7973-8879-9e4870af31d1`, **`019fe00f-2745-7b71-b34c-b26470e422c1`** |

All six: `fal-ai/nano-banana-pro`, `aspect_ratio 9:16`, `resolution 2K`, `output_format png`,
`num_images 1`. Quoted $0.15 each; **invoiced pending**.

**`9:16`, not the `1:1` in ASSET-PIPELINE §2's example.** The character contract is 44 × 96 px —
aspect 0.458 — so a square frame spends half its pixels on empty air beside a standing figure.

**Round 0c-2 confirms STYLE.md §6's central finding a second time.** Round 0c-1's prompt already
carried the locked RENDERING block demanding *"dense fine pixel detail and heavy ornamentation…
individual rivets, seams, engraved filigree"* — a generic instruction, and the results read
under-decorated. Naming each item (*a riveted brass pauldron; a bandolier of small capped copper
vials; a pocket watch on a brass chain; a pressure gauge with a visible needle; two copper pipes to a
knuckle guard*) produced every one of them. **The model obeys a named element and ignores an
adjective.** This is the same mechanism as the HUD ladder, in the additive direction.

**Chosen: `019fe00f-2745-7b71-b34c-b26470e422c1`** — locked into
[STYLE.md](../STYLE.md) §8 and copied to `public/assets/characters/brass-courier/anchor.png` with its
prompt and job record beside it *(vault 4.17)*. Figure `940 × 2526`, aspect 0.372, `36 × 96` at the
game's render height — narrower than the 44 × 96 collision box, which is the safe direction.

**Two of these six also returned off-target chroma** — `(4,178,55)` and `(65,162,81)` — bringing the
count to three of nine. This is not an outlier; it is roughly a third of generations, and it is why
the key colour is measured per image rather than assumed.

## Gate 4.2b/4.2c — the two animation probes · 2 gens · $0.15 + contested · (cum. $3.48 + A)

The plan's decision D1: run BOTH candidate pipelines on the same anchor for the same animation and
batch on the winner, rather than adopting the documented path on the strength of a claim made about
different models. Marginal cost of the comparison: $0.15, because probe A was mandatory anyway.

| Probe | Endpoint | `request_id` | Inputs | Quoted |
|---|---|---|---|---|
| **A** | `bytedance/seedance-2.0/image-to-video` | `019fe018-61cd-7da2-9a78-b7d5d6601f97` | `duration 4`, `resolution 720p`, `aspect_ratio 9:16`, `generate_audio false`, `end_image_url` = anchor | **$0.056 – $1.21, contested ~22×** |
| **B** | `fal-ai/nano-banana-pro/edit` | `019fe017-815b-74e0-9440-dbdfcdba03f7` | `aspect_ratio 1:1`, `resolution 2K`, `image_urls` = [anchor] | **$0.15, agreed** |

### 4.2c — the clip, measured by `ffprobe`, not assumed

```
codec h264 · 720 × 1280 · r_frame_rate 24/1 · avg_frame_rate 24/1
nb_frames 97 · nb_read_frames 97 (counted) · duration 4.041667 s
```

**24 fps, 97 frames.** SOURCE-ANALYSIS §6c's "~97 frames at 24 fps" turns out to be **correct** — but
it was stated as a Seedance property while the same document said Seedance publishes no frame rate,
which is why the Codex plan review flagged it *(finding 6)*. The finding was about **provenance, not
arithmetic**: an unjustified claim that happens to be true is still unjustified, and the next one may
not be. It is now measured, on this clip, and the number is counted rather than read from a header.

### The verdict: probe B wins, and it is not close

| | A — Seedance video | B — `nano-banana-pro/edit` sheet |
|---|---|---|
| **Did it produce the motion asked for?** | ❌ **No.** The prompt named *"exactly six full strides"*; the clip shows a near-idle with a slow turn. No stride occurs. | ✅ Four genuine run phases with real leg extension |
| Identity across the animation | Drifts — the figure rotates out of strict side profile into 3/4 despite the instruction | ✅ Held: face, pauldron, goggles, bandolier, satchel, brace all stable |
| Figure aspect frame to frame | **0.374 → 0.518**, a 38 % swing — the "constant scale" instruction was ignored | Varies per cell, but within one image and correctable in packing |
| Frames | 97, must be resampled down to the sim's window | Exactly the 4 requested — **no resampling step at all** |
| Cost | contested ~22× | $0.15, agreed by both sources |
| Defects to fix | the motion itself | a ground line drawn despite "no ground line"; per-cell offset and scale |

**This reverses the expectation recorded in SOURCE-ANALYSIS §6.** That section adopted video-to-frames
on the strength of the reference project's finding that per-frame image generation gave *"a lot of
additional stuff, and it wasn't a smooth motion"* — measured on **Grok and `nano-banana-2`**, and it
does not hold for `nano-banana-pro/edit`, which preserves identity from a reference image far better
than the models that claim was made about. Vault **4.9** in its plainest form: probe one model on one
cue before committing a batch. The probe cost $0.15 and changed the pipeline.

⚠️ **Probe A's real invoice line is still unread** — `genmedia` exposes no billing command, so the
figure must come from the fal.ai dashboard. It no longer gates a batch, because no Seedance batch
will be run; it is still the highest-value number for the vault-out, since two authoritative sources
disagree by ~22× and only the invoice settles which.
