# Phase 4 — the first production batch, the world and the HUD

Gates 4b/G and 4b/H. **13 generations** on `fal-ai/nano-banana-pro`, quoted $1.95 — the five
character sheets, the tileset, the HUD, and the parallax layers twice.
Part of [GENERATION-LOG.md](../GENERATION-LOG.md) — the contract, the pointer table and the
reconciled spend live there.

---

## Gate 4b/G — the batch, the world and the HUD · 10 gens · $1.50 · (cum. $4.98 + probe A)

All on `fal-ai/nano-banana-pro` (`/edit` for the sheets), `resolution 2K`, `output_format png`,
`num_images 1`. Quoted $0.15 each; **invoiced pending**.

| Asset | `request_id` | aspect | detected |
|---|---|---|---|
| idle sheet | `019fe021-ff30-73c3-8a4c-82a9bff35554` | 1:1 | **8 frames** |
| walk sheet | `019fe022-ac42-7d31-8552-9ae0e52acddc` | 1:1 | 4 frames |
| jump sheet | `019fe023-497c-70a1-ab3d-88eb48a58026` | 1:1 | 4 frames |
| fall sheet | `019fe023-c642-7352-8296-5e75d21a4d46` | 1:1 | 4 frames |
| run sheet | `019fe024-502f-7c81-896d-b1174a64af07` | 1:1 | 4 frames |
| HUD | `019fe05e-b8d1-7f02-8c53-1f8bb6b1dfb3` | 21:9 | 1 assembly |
| tileset | `019fe05f-4d4a-71b0-bb30-bdfb76554173` | 1:1 | 16 tiles |
| parallax far | `019fe05f-d9ed-7c50-95fa-faebaf938d89` | 21:9 | — |
| parallax mid | `019fe060-65dd-7f13-b405-8830cda15d63` | 21:9 | — |
| parallax near | `019fe060-dce4-79b3-9ddd-b2ad54d3d8ba` | 21:9 | — |

`run` was regenerated rather than reusing probe B, so all five sheets share the corrected prompt.

### 🔴 The layout you ask for is not the layout you get

The `idle` prompt asked for *"a 4-frame idle animation sprite sheet, arranged as a 2 by 2 grid"* and
named four phases. The model returned **eight figures in a 4 × 2 grid**. Splitting on the assumed
2 × 2 put two whole characters in every cell — caught only because the figure aspect was *measured*
(0.888) against the anchor's 0.372 rather than eyeballed.

`detectFrames()` now projects opacity onto each axis and splits on empty bands, so the frame count
and the grid are both **read off the pixels**. This is vault **4.11** applied to layout, and it costs
nothing: `fps = renderFrames × TICK_HZ / simTicks` derives the rate from whatever count is actually
there, so eight idle frames is simply a better breathing loop than four.

### The ground-line fix worked, and it worked the way §6 predicts

Probe B drew a ground line under every cell despite *"no ground line"* sitting in the forbid list.
Negation does not remove a structural element from this model — STYLE.md §6. Constraining the
geometry does: *"He is isolated on the background like a sticker. Beneath the soles of the boots
there is a clear margin of plain background at least as tall as his head… He does not stand on
anything."* Zero ground lines across five regenerated sheets.

### Chroma is unreliable at scale

Three of the first nine anchors returned off-target green. Across the sheets the measured keys were
`(2,252,3)`, `(3,252,4)`, `(3,252,4)`, `(2,253,3)` and `(2,252,3)` — all close to pure — but the
tileset and the HUD needed their own measured keys again. Per-image key estimation is unconditional.

### Two defects found by looking, not by a gate

1. **A bright green floor.** The tileset packer cut tiles from the ORIGINAL sheet rather than the
   keyed one, on the reasoning that "a solid tile must stay solid". Wrong: tiles are not square, so
   squaring one pads it with what surrounded it — chroma green — and `detectFrames` bounds are tight
   rather than exact, leaving a green rim on every edge. Fixed by cutting from the keyed copy;
   nothing in the palette is near chroma green, so tile interiors are untouched.
2. **A black band above the background.** `setScrollFactor(0)` already pins a layer to the camera, so
   its position is in screen space; also setting it to the camera's scroll double-applied the scroll
   and slid the layer off the viewport. Only the texture offset should move.

Neither was caught by a gate, and both were obvious on sight — vault **4.24**, *look to find*.

### Parallax seams

All three layers **failed** `gateSeam` as generated, exactly as the plan predicted: a generative
model will not produce a tileable seam on request. Mirroring each layer (`A ++ reverse(A)`) makes
both the middle join and the end wrap repeat a source column exactly, and all three then **pass**.
That FAIL → PASS transition is the gate proving itself on real art rather than on a fixture.

### 🔴 One rule measurably broken, recorded not hidden

STYLE.md §5 RULE TWO — hash-locked — says the background sits *"in cool blue-grey shadow… with no
warm colour anywhere behind"*. Measured warm-saturated pixel fractions: **mid 0.01 %, near 0.10 %,
far 5.94 %**. The far layer's smog-yellow dusk sky is a real deviation. It is not a gameplay hazard
(nothing brass-capped, nothing reachable, a flat band at the top) and it matches the approved scene
anchor, but it is a locked rule and the number is recorded rather than rounded away. **Open for a
decision: regenerate the far layer cool for $0.15, or record a deliberate exception.**

### 🔴 Open defect: the ground tile layer

The shipped level was authored grey-box — its tile layer fills every solid cell with one gid,
because Phase 3 only needed geometry. `applySurfaceTiles()` picks a brass-capped surface tile where
nothing sits above and brick elsewhere, so STYLE.md §5 RULE ONE holds by construction rather than by
level data. **It is not yet correct on screen**: the brass edge still repeats down the stack, so the
neighbour test is not matching the level's real layout. Recorded as open rather than reported green.

---

## Gate 4b/H — the two open defects closed · 3 gens · $0.45 · (cum. $5.43 + probe A)

Both items the previous section recorded as open are now fixed, and **both diagnoses in that
section were wrong in a way worth writing down**: each named a plausible cause that measurement did
not support.

### 🔴 The ground stack: a GID off-by-one, not a neighbour test

Recorded as *"the neighbour test is not matching the level's real layout"*. It was not. Decoding
`level-01.tmj` shows a perfectly ordinary layout — rows 40–47 filled 172 wide, platforms on rows 28
and 33, a three-cell pillar on 37–39 — and the neighbour test reproduces it exactly, including the
single buried cell beneath the pillar (row 40 draws 171 surface tiles and 1 brick).

The real cause: `applySurfaceTiles` used **tileset-local indices where Phaser wants GIDs**. The
level declares `firstgid: 1`, and `Tileset.getTileTextureCoordinates` is
`texCoordinates[tileIndex - firstgid]`, guarded by `containsTileIndex`.

| shipped | gid | resolves to | what it drew |
|---|---|---|---|
| `SURFACE = 0` | 0 | out of range | **nothing** — the walking surface was invisible |
| `BRICK = 8` | 8 | local 7 | 33 % opaque, 20 % warm, **0 % of it in the top band** |

Local 7 is a decorative tile with a brass bar across its **middle**. Painted on all eight buried
rows, that bar is the amber stripe-per-row that was visible on screen. Corrected to `SURFACE = 1`
(100 % opaque, 6.1 % warm, **all of it in the top 8 rows**) and `BRICK = 9` (100 % opaque, **0.0 %
warm**).

Both constants moved to `src/render/groundTiles.ts` and gated by `tests/unit/ground-tiles.test.ts`,
which measures the **shipped** `industrial.png` — the same technique as running the real validator
over the real level bytes *(vault 3.1)*. Watched red first *(C1)*: restoring `0`/`8` gives
`Tests 3 failed | 6 passed`, one reading *"expected plain masonry but 23.7 % of it is warm"*.
Mutation confirmed applied and reverted by count *(C12)*.

`gateBrassCap` is the new gate behind it, and it exists because `BLIND_SPOTS` was right that no
*region statistic* can see this rule — and wrong that nothing can. The axis is **vertical
distribution within one tile** *(vault 4.19)*: a tile with a brass bar across its middle and one
with a brass cap on its top edge are identical on every other axis. Its fixture set is the defect
itself — the same warmth, moved.

### 🔴 The parallax: occlusion, not the warm sky

Recorded as *"far measures 5.94 % warm-saturated vs hash-locked §5 RULE TWO"*, offered as a
judgement call. Measuring the shipped files first found something larger: **all three layers were
100.0 % opaque**, so `near` (depth −98) covered `mid` (−99) and `far` (−100) completely. Two layers
were generated, downloaded, keyed, gated, loaded and drawn without ever being visible. Every gate
was green; none asked whether a layer had any transparency at all.

The warm number was real (24.8 % by the shared `WARM` predicate, not 5.94 %) but its gameplay
consequence was zero, because the layer carrying it was never drawn.

The cause, in both cases, was the brief:

1. **All three layers were described as complete full-frame scenes.** Three full-frame scenes can
   only ever show the front one. `mid` and `near` are now briefed as structures standing along the
   bottom edge with **one flat uniform chroma green field** above and between them, and keyed.
2. **The `far` prompt asked for the warmth.** It said *"a high smog-yellowED DUSK sky"* — a named
   element — while the COLOUR block in the same prompt forbade warm colour, a generic instruction.
   STYLE.md §6 already records that this model obeys the named element and ignores the adjective.
   Naming a **cold** element instead ("a high cold slate-blue dusk sky, the colour of wet steel")
   took the layer from **24.84 % warm to 0.00 %**. Post-grading it would have treated the symptom.

| Asset | `request_id` | keyed | warm |
|---|---|---|---|
| parallax far | `019fe09a-e92d-7872-8ae3-5e6cd6a45c53` | n/a (backdrop) | **0.00 %** |
| parallax mid | `019fe09b-4917-7bf2-b37e-13960928e2d2` | 26.0 % | 0.00 % |
| parallax near | `019fe09b-a52c-7b42-8db4-753614c2bb4d` | 48.1 % | 0.00 % |

All three still fail `gateSeam` as generated and pass after mirroring, as before.

### `estimateKeyColour` is the wrong instrument for a scene layer

It samples the one-pixel border, which is exactly right for a sprite isolated on a field and exactly
wrong for a layer with factory facades standing along its bottom edge by design. It **refused** all
three layers — border agreement 43 % for `mid`, 64 % for `near` — on art that was perfectly good.

`estimateFieldColour` finds the field by **colour rather than position**: the median of every pixel
within tolerance of the chroma asked for, refusing below a 10 % share. Median, not mean, because
anti-aliased edge pixels sit inside the tolerance. Measured keys: `(2,253,2)` for both.

### 🔴 A third defect, found by looking again

The first keyed build put a **bright green outline around every keyed element**. `keyOut` despills
only inside the `LOW`–`HIGH` ramp; a blend of chroma green and a dark blue-grey wall lands *above*
`HIGH`, so it is correctly kept as subject and is still visibly green. Widening the band does not
reach it — measured, `HIGH` 120 → 320 moved the green-dominant share of opaque pixels only from
3.69 % to 3.21 % and keyed the identical 48.1 %. What it does instead is pull solid pixels into the
alpha ramp, turning an opaque wall translucent: a worse defect than the rim.

So `keyOut` gained a second despill pass over every surviving opaque pixel, clamping the key's
dominant channel to the **max** of the other two. Safe because it was **measured** to be, not
assumed: the `far` layer carries no chroma field at all, so every pixel in it is legitimate art, and
**0.00 %** of it is green-dominant at any threshold. This palette never goes green on purpose.

It lives in `keyOut` rather than at the two call sites because every keyed asset had the defect —
**the tileset measured 8.3 % green-dominant pixels** and nobody had noticed. The character sheets
were rebuilt through it too.

**The first version of that pass was wrong, and the unit suite caught it.** `key.indexOf(max)` on a
magenta key `(255,0,255)` picks red arbitrarily, and clamping red turned a legitimate warm subject
pixel `(180,140,60)` into `(140,140,60)`. "The dominant channel" is not a defined quantity for a
two-channel key, so the pass now refuses to run on one. Three fixtures pin it: the rim is removed,
widening `HIGH` is shown to damage the subject instead, and an ambiguous key is left alone.

### `raw()` refused to guess, immediately

Regenerating leaves both the old and the new file in `_generated/world/` — the filename carries the
request id — and `readdirSync().find()` silently takes whichever comes first, which is how a build
ships a superseded asset with every gate green. The build now **fails on an ambiguous prefix**, and
it earned its keep on the first run by catching this script's own `-preview.png` output sitting
beside the model output. Superseded raws were moved to `_generated/world/superseded/`, not deleted.

### Verified on screen, not only in tests

`playwright-cli` at 1920×1080, waited on `window.__game.ready`, **0 console errors**. The ground
draws one brass edge on the top row with plain masonry beneath. The sky, the distant skyline, the
factory facades and the foreground ironwork are all visible at once, at their three scroll factors.
Driving the keys and sampling from `window.__phaserGame` — not `__game` — the texture key **and**
the frame index both track the sim, which is criterion 4.19:

```
walk   walk@brass-courier-walk#1..4
run    run@brass-courier-run#1..4        (entered via walk@brass-courier-walk#1)
jump   jump@brass-courier-jump#1..4  ->  fall@brass-courier-fall#1..2
```

