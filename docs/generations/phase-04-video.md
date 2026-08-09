# Phase 4 — the animations move to Seedance video

Gates 4b/I and 4b/J, and batch V — every `bytedance/seedance-2.0/image-to-video` clip, plus the one
`nano-banana-pro/edit` anchor repair that failed. **The clip spend is reconciled in the index**,
against the invoice; the per-gate figures here are the pre-invoice estimates they were written as.
Part of [GENERATION-LOG.md](../GENERATION-LOG.md) — the contract, the pointer table and the
reconciled spend live there.

---

## Gate 4b/I — the character animations move to Seedance video · 9 gens · contested · (cum. see below)

**This reverses gate 4.2b's verdict.** That gate compared Seedance video against a
`nano-banana-pro/edit` grid sheet and recorded *"probe B wins, and it is not close"*. The
measurement was right; the conclusion was wrong, and the evidence was already in the shipped sheets
rather than in the probe.

### What the shipped per-frame sheets actually measured

Consecutive-frame silhouette IoU, and the colour change inside the overlap:

| anim | IoU (consecutive) | interior change | drawn width | drawn height |
|---|---|---|---|---|
| `idle` | **0.86 – 0.98** | 13 – 36 | 86 – 103 px | 293 – 294 px |
| `walk` | 0.54 – 0.87 | 27 – 44 | 114 – 160 px | 285 – 306 px |
| `run` | 0.45 – 0.60 | 33 – 44 | 102 – 151 px | 253 – 280 px |

An IoU of 0.98 means the two poses **are the same pose**. So the idle carried no breath at all — and
its interior still changed by 13–36 per channel, which is not motion, it is the character being
redrawn slightly differently every frame. That is what "the idle looks weird" was: goggles, pauldron,
bandolier and satchel boiling on a figure that never moved.

**Trajectory coherence** puts a number on it. If a character is genuinely moving, two frame-steps
travel about twice as far as one, because the poses lie on a path; if each frame is an independent
redraw the differences are uncorrelated and two steps barely beat one.

```
                OLD    NEW      (2.00 = smooth path, 1.00 = independent redraws)
   walk         1.09   1.51
   run          1.13   1.62
   idle         1.66   1.46
```

Walk and run were statistically indistinguishable from independent redraws. **The idle row went the
other way and is recorded as it measured, not as it was expected to.** The old idle scores *higher*
because it drifted monotonically off its neutral pose — measured at the time, frames 5–8 all sat
0.037 from frame 1 and never returned — and a monotone drift is a perfectly smooth path. It is also
a broken idle: it is precisely why no cut of it closed and why it had to be ping-ponged. Coherence
rewards drift and penalises a closed loop, so it is the wrong instrument for idle. The defensible
idle result is that **its loop now closes on its own**: wrap 0.00657 against a 0.02436 budget, with
`pingPong` switched off.

Root cause of all of it: per-frame image generation is N independent draws. It cannot hold identity
between frames, and it cannot draw a difference smaller than its own noise floor — which a subtle
breathing idle is. Video is temporally consistent *by construction*.

### Why probe A failed, and why that was the prompt

Probe A asked for *"exactly six full strides"* and returned a near-idle with a slow turn. That is a
**named count with no named mechanics**. A sibling project (`C:\Claude\Street-Fighter`,
`docs/art-pipeline.md`) measured the identical failure on a backpedal — *"he slid backward without
moving his legs"*, 0.14 against 0.56–0.79 for its forward walk — and cured it by describing what each
limb does. Its conclusion, reached before this project's: *"Independent per-pose still gens DRIFT
badly… Video is temporally consistent by construction, which is what fixes the drift."*

Three of its rules are now encoded in `tools/gen/motion.mjs`: `SPAN_CLIP` for one-shot motions, a
named cycle COUNT for cyclic ones, and "subtle" never used as the whole instruction.

### The generations

All from the locked anchor (`019fe00f-2745-7b71-b34c-b26470e422c1`) as `image_url`, on
`bytedance/seedance-2.0/image-to-video`, `9:16`, `720p`, `duration 4`, `generate_audio false`.

| # | anim | `request_id` | kept | why |
|---|---|---|---|---|
| 1 | `idle` | `019fe104-7cd3-7482-afca-dbb3b7eef158` | ✅ | breathes; height spread 1.5% |
| 2 | `walk` | `019fe104-a989-7701-93ee-a6a94fea32da` | ✅ | full stride cycle |
| 3 | `run` | `019fe104-d373-74d0-8ef5-4896e07b1fef` | ✅ | knee drive, airborne phase |
| 4 | `jump` | `019fe104-febe-7b41-9df4-3ddf9e086afa` | ❌ | lost side profile from frame 4; ground shadow |
| 5 | `fall` | `019fe105-2f35-7061-8f71-6d2b72aaaaac` | ❌ | **somersaulted** — fully inverted by frame 6 |
| 6 | `jump` | `019fe10c-d694-7ef1-997d-313fa7bb6ca1` | ❌ | upright, but rose out of frame: 4 of 6 frames headless |
| 7 | `fall` | `019fe10d-046c-7591-89fe-d2beb0b77d9c` | ❌ | same — travelled out of frame |
| 8 | `jump` | `019fe118-b92d-7241-a64e-418add36a4b5` | ✅ | fixed position, whole body in frame |
| 9 | `fall` | `019fe118-e5bf-7c63-9210-7e411715ebff` | ✅ | fixed position, whole body in frame |

Every clip measured by `ffprobe`, counted not read: **720×1280, 97 frames, 24/1, 4.041667 s**, all
nine identical.

**Three prompt lessons, each paid for with a generation:**

1. **`SPAN_CLIP` is wrong for an airborne state.** It says *extending through the first half and
   returning through the second*, which is true of a jab and false of a fall. The model resolved the
   contradiction by rotating him. *Never contradict your own prompt — it resolves it by maximising.*
2. **Negation does not remove a structural element** *(STYLE.md §6)*. "No shadow, no floor" was in
   the shared block and both clips drew a ground shadow anyway, because a figure in mid-air implies a
   surface to be above. Removing the surface from the geometry worked.
3. **Do not ask the art for travel the sim already supplies.** `playerView` draws the sprite at the
   player's position, which `stepVertical` moves every tick, so a sprite that also translates inside
   its cell is asking for the motion twice — and it rose straight out of frame. Both airborne
   animations are now a POSE PROGRESSION at a fixed position. No sampling window can put a cropped
   head back.

### The cycle count cannot come from the prompt

Every cyclic brief names exactly two cycles. Measured on the clips that came back, the model
delivered **4.0 for `walk`, 6.1 for `run` and 2.6 for `idle`**. `simTicks` is the duration of ONE
cycle *(vault 4.22)*, so a sheet holding two strides halves the derived fps and puts foot-slide back.

So `tools/gen/sampler.mjs` measures the cycle length off the finished clip: the shortest window
whose wrap, after sampling N frames, is small against both its own median step and its furthest
excursion from its first frame.

**Two instruments were tried and one was discarded honestly.** Autocorrelating each frame's
silhouette difference against frame 0 returned `r = 0.27–0.30` on all three clips and called the idle
**12 cycles** — the signal is dominated by the monotone rise away from frame 0, which correlates at
almost any lag. Reporting that peak as a period would have been vault **4.18**'s exact failure.

The first version of the working instrument was also wrong, and its own output revealed it: scoring
on `wrap ≤ 1.5 × medianStep` alone, it chose the **minimum** window length for both walk and run and
reported 8.1 cycles in clips whose feet plainly showed 4 and 6. At a short window the samples are
adjacent source frames, the median step is noise, and one of 85 candidate starts always passes by
luck. The fix is the question that actually defines a cycle — did the pose travel away and come
*back* — and its threshold is read off the clips rather than chosen:

```
   real closures      walk L=24 -> 0.025   run L=16 -> 0.045   idle L=37 -> 0.106
   best-of-85 noise   walk L=12 -> 0.319   run L=12 -> 0.489   idle L=12 -> 0.522
```

Nothing falls between 0.11 and 0.15. The recovered counts — 4.0, 6.1, 2.6 — agree with foot-spread
measured independently off the same clips.

One-shot clips get the same treatment at the other end: every clip opens on the anchor pose, because
the anchor is the start image, so sampling from frame 0 spends one or two of six frames on a standing
figure. Sampling runs from the measured motion onset.

### Two defects the existing gates could not see

**`detectFrames` segmented a limb as a frame.** Its `minGap` was a flat 8 px, sane on a 2K grid sheet
and far too small on a 1328 px-tall video frame, where the green gap between a swinging arm and the
torso is wider than that. So `walk` built **15 cells for 12 sampled frames with three of them
EMPTY**, and `fall` 7 for 6 with one empty — a character vanishing for a frame, mid-animation.

**Every gate passed it.** `gateMotionFloor` and `gateLoopWrap` are difference metrics, and a blank
frame is a large, perfectly consistent difference. A gate that cannot see a blank frame is decoration
*(C2)*, so two things changed: `minGap` is now 2 % of the sheet height — the invariant it was
reaching for is scale-free, since a gap between two figures is always much wider than a gap inside
one — and `build-assets` now refuses any cell that is empty or shorter than half the median drawn
height. Both were watched red before being trusted *(C1)*: forcing `minGap` back to 8 fails the build
with `"walk" cell 2 of 15 is 4x5 against a median height of 293 — that is a fragment, not a frame`.

`findSource` in `build-assets` was hardened at the same time. It used `.find()`, so with both a
superseded generation and its replacement present it built whichever the filesystem listed first —
and `idle-preview.png` matches `idle-` too. It now refuses an ambiguous prefix, the same fix `raw()`
in `build-world.mjs` already carries.

### What the new numbers are, and what re-deriving them was for

**Scale re-derived, idle first** *(vault A5)*. The source changed from a 2K grid sheet where the
courier stands 935 px to a 720×1280 clip where he stands 1209 px, so `288 / 1209 = 0.2382134`
replaces `0.3080214`. Still a downscale — 4.2× — so every drawn pixel is one the model drew. The
twelve idle frames span 1200–1218 px, a spread of **18 px / 1.5 %**.

**Walk stride re-measured, 276 → 310 game px.** Same method as before so the two are comparable: the
widest foot-to-foot span at a contact frame is one step, doubled for the two steps in a cycle. The
new 12-frame walk peaks at 155 px on frames 2 and 12 and troughs at 53 on frame 9 — two peaks across
the sheet, which independently confirms the sampler cut exactly one cycle. Leaving 276 against a
310 px stride would have been a 12 % foot-slide, the exact defect the derivation exists to prevent.

| anim | frames | simTicks | fps (derived) | provenance |
|---|---|---|---|---|
| `idle` | 8 → **12** | 90 | 9.33 → **8.00** | authored |
| `walk` | 8 → **12** | 50 → **56** | 9.60 → **12.86** | measured |
| `run` | 8 → **12** | 39 | 12.31 → **18.46** | measured |
| `jump` | 4 → **6** | 18 | 13.33 → **20.00** | sim |
| `fall` | 4 → **6** | 18 | 13.33 → **20.00** | sim |

`simTicks` and `fps` are still derived by `animTimings()` from the sim and the measured inputs — only
the inputs moved.

> 🔴 **`run`'s stride is still NOT measured and must not be reported as if it were.** At a run contact
> frame the trailing leg is airborne, so the foot band captures one boot and cannot call the step
> length — INDETERMINATE by vault **4.18**'s own standard. Its 468 px is the value scaled from the
> *old* walk art, so it is now doubly unverified. Settling it is a Gym task (ASSET-PIPELINE §6); the
> observable if it is wrong is run foot-slide. This is a pre-existing open item, not one this work
> introduced.

### Verified on screen

Dev build at 1920×1080, waiting on `window.__game.ready`, sampling once per animation frame inside
the page and returning an aggregate — never `waitForTimeout`, never "advance N ticks then read once".

```
idle   12 distinct frames   8.00 fps measured   ( 8.00 derived)
walk   12 distinct frames  12.80 fps measured   (12.86 derived)   5.54 px/tick = walkTopSpeed
run    12 distinct frames  18.40 fps measured   (18.46 derived)   12.0 px/tick = topSpeed
```

**Foot-slide, measured on the shipped art:** walking covers **307 px per animation cycle** against a
310 px drawn stride — a 1 % match. 0 console errors. Identity held across all nine clips: same face,
goggles, pauldron, bandolier, satchel, forearm brace. Dev server killed by port *(C13)*.

395 unit tests pass, typecheck clean, `npm run build` green including `verify-dist ok`.

### Spend

**9 Seedance clips at a price that is still unread.** `genmedia pricing` reports
`unit_price 0.014 / "units"` with no unit defined, no cost field appears in any job record, and
`genmedia` exposes no billing command — so the 22× disagreement ($0.056 vs $1.21 per clip) stands
exactly where gate 4.2b left it. Bounds on this batch: **$0.50 – $10.89**. Cumulative worst case
**$16.92 of the $25 ceiling**; cumulative best case $6.53.

⚠️ The fal.ai dashboard invoice line remains the highest-value unread number in this phase, and it is
now attached to nine clips rather than one.

> 🔴 **This estimate is superseded.** The invoice was read on 2026-08-09 and the pessimistic source
> was right. Left standing as the record of what was believed at the time — the settled figures are
> in [GENERATION-LOG.md § Spend — RECONCILED](../GENERATION-LOG.md#spend--reconciled-against-the-invoice-2026-08-09).

---

## Gate 4b/J — the halo, the floating feet, and the last of the jitter · 0 gens · $0

Two reports after 4b/I shipped: *"the character does not look like they stand or walk on the tiles"*
and *"it's not completely smooth"*. **One defect, two symptoms, no regeneration needed.**

### Measured

`packStrip` aligns the figure's lowest opaque row onto the cell's last row, because `playerView`
draws at origin `(0.5, 1)` on the player's feet *(vault 2.10)*. Cell height is 336, so the boots
should sit on row 335 in every cell. Measured on the shipped strips:

| anim | lowest row, alpha ≥ 8 | lowest row, alpha ≥ 128 | gap |
|---|---|---|---|
| `idle` | 335 | 335 | **0** |
| `walk` | 335 | 327 – 331 | **4 – 8 px** |
| `run` | 335 | 315 – 330 | **5 – 20 px** |
| `fall` | 335 | 282 – 335 | 0 – 53 px |

So something faint was being aligned to the ground and the visible boots were hanging above it — and
because the depth of it varied per frame, the character bobbed vertically by up to 15 px while
running, *on top of* the real bob and out of phase with it. Standing wrong and moving roughly were
the same bug.

### What it was — and two wrong guesses, both discarded on measurement

Rendering the alpha channel as brightness showed it immediately *(vault 4.24 — look to find)*: a
broad soft **halo** around the whole lower body, reaching 20–40 px past the silhouette, mean alpha
14–42, spanning 120–140 px horizontally. Chroma bleed at a high-contrast edge against a saturated
green field, which the LOW/HIGH tolerance ramp resolves into partial alpha instead of removing.

- **Guess 1: residual green the key missed.** Wrong — **0.00 %** of the halo is green-dominant, on
  every animation. `keyOut`'s despill had already neutralised its colour. It was not a colour
  problem.
- **Guess 2: clip the ramp with an alpha floor.** Wrong — the halo reaches alpha 127, well inside the
  range a genuine anti-aliased edge occupies, so any floor high enough to erase it would harden every
  silhouette in the game.

The property that actually separates them is **distance**. Real edge anti-aliasing is 1–2 px from
solid ink; this halo is 5–40 px from anything solid. `trimHalo` in `chroma.mjs` keeps a partial-alpha
pixel only when a genuinely solid one (alpha ≥ 192) lies within 2 px, and drops it otherwise — edge
quality preserved exactly, haze gone. It runs before `removeSpecks`, because the halo is *connected*
to the figure and component-area filtering cannot see it, and before anything measures the figure.

**Stated rather than discovered:** this would erase a feature that is thin AND semi-transparent
everywhere — a wisp of smoke, a one-pixel cable — since it has no solid core to be near. At this
source resolution every real feature has one. A later asset that does not needs a different cleanup,
not a looser distance.

### Result

```
   gap between the faint bottom and the solid boot, after trimming
   idle 0 0 0 0 0 0 0 0 0 0 0 0
   walk 0 0 0 0 0 0 0 0 0 0 0 0
   run  0 0 0 0 0 0 0 0 0 0 0 0
   jump 0 0 0 0 0 0        fall 0 0 0 0 0 0
```

Every frame of every animation now puts the boots on row 335.

**Neither the scale nor the stride moved** — re-derived and re-measured after the trim, still
`0.23821340` and still 310 px. The halo corrupted the *alignment* only, not the size measurements,
which is why the 4b/I numbers stand unchanged.

**On screen, dev build at 1920×1080:** the drawn sprite's bottom equals the sim's feet position to
**0.0 px across all 481 samples and all 12 run frames**, with feet y constant at 1920 — which is
`GROUND_TOP_ROW 20 × TILE_SIZE 96`, the top of the ground tiles. Confirmed by eye at magnification:
the soles sit on the hazard-striped cap.

**Residual motion, measured, and it is the animation rather than a defect:** lateral head wander is
2 px (idle), 5 px (walk), 4 px (run); vertical head travel is 4 px (idle — the breath), 9 px (walk)
and 14 px (run), i.e. a 3–5 % bob, which is what a walk and a run do. The halo float was 5–20 px and
out of phase with it.

Six new fixture-backed cases in `chroma-gate.test.ts` pin the behaviour in both directions, including
one asserting that a `maxDistance` wide enough to reach the halo *keeps* it — so the function cannot
be quietly turned into a no-op by loosening the distance *(C2)*.

401 unit tests pass, typecheck clean, build green including `verify-dist ok`. Dev server killed by
port *(C13)*. **No generations, no spend** — cumulative unchanged at $5.54–$17.08.

---

## Phase 4 — batch V: the levelled anchor, and everything re-shot from it

**Why there was a fifth batch at all.** The user reported, after two rounds of measured-green work,
that *"one of the legs (right) is not sitting on the tile"*. It was not the packer and not the level:
the **locked anchor image itself** drew the forward boot 58 source px above the rear one. `packStrip`
aligns on the lowest opaque row, so the rear boot was pinned to the ground and the forward boot hung
— a flat 6 game-px gap under one sole, **identical in all twelve idle frames**. Identical-every-frame
is the signature that says the defect is in the source, not in the animation.

### V.0 — the anchor edit that did not work

| # | Endpoint | `request_id` | Result |
|---|---|---|---|
| V.0 | `fal-ai/nano-banana-pro/edit` | `019fe1e8-b66e-7cd3-bc9e-89e8f3a29b1f` | **FAILED its purpose.** Asked to level the two boots; returned geometrically identical art — sole offset 59 px against the original 58. |

**Recorded because it is a reusable finding, not a one-off:** an edit model will not reliably make a
small, precise geometric correction. The prompt named the change explicitly and the model returned a
picture that satisfies every word of it while moving nothing that matters. What worked was
deterministic pixel surgery on the forward-leg band, seam at y=2380, 59 px down, iterating bottom-up.
Anchor sole gap **58 px → 1 px**; idle sole gap in game **6 px → 0 px in every frame**, confirmed on
screen at 3× against the hazard stripe. The amendment is recorded in [STYLE.md](../STYLE.md) §8 and the
original is kept as `anchor-original.png`.

### V.1 — all five clips re-shot from the levelled anchor

`bytedance/seedance-2.0/image-to-video`, 4 s / 720p / 9:16, from
`https://v3b.fal.media/files/b/0aa58723/DAg3WILCtZZT1FGD0AlvQ_anchor.png`.

| Animation | `request_id` |
|---|---|
| idle | `019fe1ec-93fb-7101-861b-30a429e337e8` |
| walk | `019fe1ec-9aa1-7e93-9465-e8a94edac60c` |
| run | `019fe1ec-a0b0-7453-931f-c63a8c4481a6` |
| jump | `019fe1ec-a696-7f83-90fd-f0184b2a641b` |
| fall | `019fe1ec-ac98-7661-804e-406d7724efa3` |

Consequences, each re-derived rather than carried over *(vault A5)*: scale **0.23723229** (idle
standing 1214 src px, frame-to-frame spread 10 px = 0.8 %); walk stride **254 px** → `simTicks` 46,
fps 15.65; run stride **320 px** → `simTicks` 27, fps 26.67, and still **provisional** — eleven of
twelve run frames measure a single boot in the foot band, so two agreeing methods rest on one frame.

### V.2 — the batch this replaced

| Animation | `request_id` | Why superseded |
|---|---|---|
| idle | `019fe104-7cd3-7482-afca-dbb3b7eef158` | shot from the unlevelled anchor |
| walk | `019fe104-a989-7701-93ee-a6a94fea32da` | shot from the unlevelled anchor |
| run | `019fe104-d373-74d0-8ef5-4896e07b1fef` | shot from the unlevelled anchor |
| jump | `019fe118-b92d-7241-a64e-418add36a4b5` | re-shot with three-point pose anchors after the monotonicity clause somersaulted |
| fall | `019fe118-e5bf-7c63-9210-7e411715ebff` | as above |

### ⚠️ Traceability gap — five generations whose request ids are NOT recoverable

`_generated/video/superseded/` holds five `.mp4` files with **no `.job.json` beside them**. They are
the batch before V.2. The clips exist; what produced them does not, so they cannot be traced to a
prompt, a price or a date.

**This is a live violation of vault 4.17** — *save the prompt and the job record beside every asset* —
and it is recorded as a violation rather than quietly omitted. Nothing shipped depends on those five
files, so no shipped asset is untraceable; the cost is that five paid generations cannot be
reconciled against the invoice.

**The cause is a manual file move, and there is no code fix in place.** `build-clips.mjs` does not
write job records at all — it reads `.mp4` files and emits `_generated/clip-report.json` — so
nothing in the tooling either caused this or prevents it. The records were orphaned by hand:
`superseded-v1/` was archived with its `.job.json` files, `superseded/` was not. **Do not read this
paragraph as a fix that landed.** The open item is that archiving a clip must move its job record
with it, and today that is a habit rather than a gate.

### Spend — reconciled in the index

Batch V's spend section, and with it the whole phase's reconciliation against the `$31.39` invoice,
lives in [GENERATION-LOG.md § Spend — RECONCILED](../GENERATION-LOG.md#spend--reconciled-against-the-invoice-2026-08-09).
It covers every clip logged in this file, so it has no single-gate owner.

