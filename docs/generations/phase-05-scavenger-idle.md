# Phase 5 — `rust-scavenger/idle`: one clip, first take, adopted

**Date:** 2026-08-14 (session 11) · **Cost: $1.19 quoted** · **1 generation** · Decision **D3**.

---

## Why it was bought

`scavengerAnim` returned a gait from `chasing` alone. A scavenger held still by its dead zone, by a
ledge veto, or by a patrol-bound clamp therefore **ran its cycle on the spot** — feet cycling, body
stationary. That is a foot-plant violation the simulation could see and the catalog could not answer,
because no `idle` sheet existed to select.

🔴 **The sim half landed first, at $0, and by itself changed nothing on screen.** `moving` — a
readback of `x`, not a second state axis — was committed and gated before any money moved, so it
could be reviewed independently. But `playAnim.ts:12-16` no-ops on an unregistered key, so the sprite
**kept playing `chase`**, identical to the behaviour before the fix.

> ⚠️ This was told to the user the wrong way round when D3's stop rule was agreed: the claim was that
> a failed clip would still leave "a stationary chaser holding a frame", which is better than today.
> It would not have. Caught by the Codex plan review (blocker B2), re-verified locally, and corrected
> before the spend. **W4a was a necessary precondition, not a partial delivery.**

## The risk, stated before the money moved

A cyclic idle from this endpoint had a **measured record of two different partial failures**:

| precedent | how it failed |
|---|---|
| `rust-scavenger/walk` round 2 | **Extraction failed outright.** `chooseCycleWindow` → `scoreWindow` returns `null` unless the median inter-frame difference clears `MIN_MEDIAN_STEP = 0.002`. A too-subtle idle is *"declared cyclic but no window of it closes"*. |
| `brass-sentry/idle` | Extracts, but **fails `gateLoopWrap`** and ships under a named exception (`KNOWN_LOOP_WRAP_FAILURES`). |

Neither risk was removable at $0. The prompt was written against both, carrying the three clauses
`motion.mjs:207-215` credits with turning three frozen idles into 0.35–0.44 motion first try:

1. **A named cycle count** — *"exactly TWO full settle-and-rise breaths during the clip"*.
2. **An explicit list of what moves** — the two amber lamps flickering, a steam plume from the bent
   exhaust stack, the counterweight swinging on its chain, the body settling and rising.
3. **The head-height clause** — *"the top of its head moves up and down by no more than one
   twentieth of the creature's own standing height"*.

Plus the one specific to this sheet's purpose: **the clawed feet stay planted on the same spot,
neither foot lifts, slides or steps, and the creature does not walk or travel.** *"A walk the model
called an idle"* is the exact failure an idle sheet exists to prevent, and nothing else would catch it.

## The generation

| field | value |
|---|---|
| `request_id` | **`01a003ac-ba90-7fd1-acf6-ec8e8c32a81d`** |
| endpoint | `bytedance/seedance-2.0/image-to-video` |
| seed | `1373696602` |
| `image_url` | `…/6X0GqPhD7r1-tuxbrx4Pm_rust-scavenger-padded.png` |
| `end_image_url` | **same PNG** — start and end pose identical, which is what lets a cyclic clip close |
| anchor sha256 | `1fd1a6b8768229e47aad0a6d69d8286bbe306fc8aa2c89edcf922936c9f917c1` |
| non-default inputs | `duration 4`, `resolution 720p`, `aspect_ratio "1:1"`, `generate_audio false` |
| quoted | **$1.19** |
| invoiced | *pending — reconcile against the fal invoice* |
| output | `_generated/phase05/video/rust-scavenger-idle.mp4`, 1 080 799 bytes |
| fal url | `https://v3b.fal.media/files/b/0aa66452/s7OiDFSggeFt3VjojN8eg_video.mp4` |
| gallery session | `88e02ac86044` |
| disposition | **KEPT — first take, adopted** |

### The anchor is padded for SCALE, not for ratio

Both scavenger anchors are square, so `aspect_ratio` resolves to `"1:1"` either way and padding looks
optional. It is not. The slug scale `0.56074766` was derived from `rust-scavenger-walk-r3.mp4`, a
**padded** generation; an unpadded idle measured against it reproduces the session-6 defect exactly,
where padded `attack` drew **114 px** against `hurt`'s **288**.

## The outcome: both risks missed

Extraction, first try:

```
ok  rust-scavenger/idle 8 frames from 97 — cycle 22 frames (4.4 in clip), wrap/step 0.31
```

Packing, first try — and the loop wrap is the **tightest of any scavenger sheet**:

| sheet | loop wrap | budget |
|---|---|---|
| **`idle`** | **0.00545** | 0.01857 |
| `walk` | 0.01088 | 0.03454 |
| `chase` | 0.01371 | 0.04932 |

Measured dimensions: **8 frames, 512 × 384 cell, drawn 187 × 243**, key `(0,254,0)`, motion floor
PASS at 0.02199 against the 0.002 floor.

**The drawn height is 243 against `walk`'s 244** — 0.4 %, comfortably inside the `HEIGHT_TOLERANCE`
of 0.025 that `sprite-size-consistency.test.ts` was tightened to earlier this session. The padded
anchor did its job.

## 🔴 A gate that was silently not running, found while packing

The first pack printed **no `loop:` line for `idle`** while `walk` and `chase` both showed one.

`slugConfig.mjs`'s `looping` set for `rust-scavenger` was `['walk', 'chase']` — so `build-assets.mjs`
never called `gateLoopWrap` on the new sheet, even though `FIXED_TIMINGS` declares it `loop: true`.
Two places describing the same property, disagreeing, with the disagreement visible only as an
**absent line of output**.

Fixed by adding `idle` to the set, after which the gate ran and passed. Worth recording as its own
finding: *a gate that does not run looks exactly like a gate that passes,* and the only tell here was
one missing line in a build log nobody diffs.

## Frame count: 8, and why it is the only free number

`idle` is cyclic → `loop: true` → `one-shot-divisor.test.ts` does **not** apply (it filters looping
rows out). The binding gate is `loop-dwell.test.ts`: `simTicks % frameCount === 0`. `FIXED_TIMINGS`
pins `simTicks = IDLE_TICKS = 96`, so the safe set is the divisors of 96, and **8 → 12 ticks/frame,
fps 5** is `brass-sentry-idle`'s spec exactly.

⚠️ **Do not reach for `pingPong` if a future re-shoot fails the loop wrap.** It packs `2n − 2` cells;
from 8 that is **14**, and `96 / 14` is not an integer, so `loop-dwell` goes red. Ping-pong-compatible
counts here are n ∈ {4, 5, 7, 9, 13, 17, 25}.

## Records touched — each one omitted is a build failure

| # | file | edit |
|---|---|---|
| 1 | `tools/gen/motionCombat.mjs` | `COMBAT_MOTIONS['rust-scavenger/idle']`, `cyclic: true`, `frames: 8`, ending `+ FRAME_MARGIN` |
| 2 | `tools/gen/clipAnchors.mjs` | `PADDED_ANCHORS['rust-scavenger/idle']` — same url/sha/source as `walk` |
| 3 | `tools/gen/clipJobs.mjs` | `CLIP_FILES['rust-scavenger/idle']` — **after download** |
| 4 | `tools/gen/slugConfig.mjs` | `actions` **and** `looping`, both gaining `idle` |
| 5 | `tools/gen/catalogTimings.mjs` | `FIXED_TIMINGS['rust-scavenger'].idle` — not `AUTHORED_LOOPS`, since there is no stride to derive from |
| 6 | `character-bounds-rust-scavenger.json` | `animations.idle`, **and `_animations` prose rewritten** — it claimed *"There is no `idle`… a state the sim cannot enter"*, which permanent aggro had already made false |
| 7 | `src/render/enemyView.ts` | `ANIMS_BY_SLUG['rust-scavenger']` gains `idle`, in order |
| — | `index.json`, `sheets/idle.png`, lift profile | written by `assets:build`, committed as a diff, never hand-edited |

Six test files carried hardcoded literals that went red on schedule and were corrected:
`slug-config.test.ts`, `enemy-layer-catalog.test.ts` (×2 + the fixture), `shipped-sheets.test.ts`
(count and key list), and `enemy-view.test.ts`'s `PENDING_ART`, which is now **empty** — which makes
its exhaustiveness assertion strictly stronger than it was: no askable key may be undeclared at all.

## Foot-plant does NOT apply here, deliberately

`foot-plant.test.ts` asserts `ticksPerFrame × topSpeed === footPxPerFrame`. `idle` is selected **only
when `moving === false`**, so body travel is zero by construction and the right-hand side would be
`0` — the definition of the state, not a measurement of it. The file is scoped by explicit key lists,
so adding a catalog row does not silently pull it in, and `animations.idle` deliberately carries **no
`footPxPerFrame`**.

## Spend

| | |
|---|---|
| before | $43.74 of $55 |
| this log | **+$1.19** |
| after | **$44.93 of $55** — $10.07 remaining |
