# Phase 5 — `brass-courier/fall`: the last blocked row, unblocked

**Date:** 2026-08-15 (session 11) · **Cost: $1.19 quoted** · **1 generation of 2 authorised** ·
**First take adopted.**

---

## What was wrong

The courier's fall juddered. The cause was arithmetic, not art: the fall window is **18 ticks** and
the sheet declared **8 frames**, which does not divide. Some cells held two ticks and some three, and
that uneven dwell is what reads as a stutter. **9 frames gives a flat 2 ticks per frame.**

The fix was known and written down for two sessions. It was blocked because changing the count means
re-extracting, and re-extraction runs G6 on the source clip — where **frames 0–4 of `fall.mp4` fail
on the left, the right AND the top**. Frame 0 measured `left 0, right 0, top 0, bottom 76`, with
contiguous edge runs of 138, 60 and 50 px. `windowIndices` starts every sampling at the measured
motion onset, so frame 0 is the same source frame whether 6, 8 or 9 frames are asked for: **all three
counts fail identically.** There was no count that got out of it.

> ⚠️ Which also means **the sheet that shipped until today never passed G6 either.**
> `build-clips.mjs:300-301` writes the strip and gates it *afterwards*, so a failing extraction
> leaves a usable strip on disk that `assets:build` will happily pack. That ordering is still there;
> a clean clip is what makes it moot for this key, not a fix to the tool.

## Both levers at once, and the price of that

`brass-courier/attack` and `/death` are shot from the **padded 5050² canvas** *and* carry
**`FRAME_MARGIN`**, and both pass G6 cleanly. Applying both to `fall` reproduces the exact
configuration of the only two courier clips that pass. Applying one reproduces nothing.

**The cost is attribution: a pass does not say which lever did it.** That trade was accepted before
the money moved and is recorded rather than discovered later.

Two details that would each have silently wasted the $1.19:

1. **`PADDED_ANCHORS` is keyed by the BARE string `fall`.** `clipJobs.mjs` looks the table up with
   `PADDED_ANCHORS[key]` where `key` walks `Object.keys(VIDEO_MOTIONS)`, and the five Phase 4 motions
   are keyed there without a slug prefix. `'brass-courier/fall'` would have resolved to `undefined`,
   fallen to `null`, and shot the **unpadded 1536 × 2752 anchor at 9:16** — the framing that made the
   clip need re-shooting. The record now carries a comment saying so, because it looks like a typo.
2. **`FRAME_MARGIN` went on the `fall` record only, never into `UPRIGHT_IN_AIR`.** That tail is
   shared with `jump`, and changing a prompt for a shoot nobody approved is a claim about art nobody
   bought.

It is **not** redundant with what `UPRIGHT_IN_AIR` already said. That tail contains *"No part of him
is ever cut off by the top, bottom, left or right edge"* — and the clip was cut anyway. The
difference is the one STYLE.md §6 keeps charging for: that sentence is a **negation**, which this
model weakens rather than obeys, and it names no width the model can measure itself against.
`FRAME_MARGIN` is the positive ruler — *the middle 70 % of the frame width*.

## The generation

| field | value |
|---|---|
| `request_id` | **`01a003ea-9fee-7080-9d8e-053c205f7cc4`** |
| endpoint | `bytedance/seedance-2.0/image-to-video` |
| seed | `1749000706` |
| `image_url` | `…oFqZnuImzFA5fTQWGNoT6_brass-courier-padded.png` |
| `end_image_url` | **none** — a one-shot, not a cycle |
| anchor sha256 | `f0785a0393eb57f6295369175b20428cb49662d7dc4d6ff9cec607900274fe8a` |
| non-default inputs | `duration 4`, `resolution 720p`, `aspect_ratio "1:1"`, `generate_audio false` |
| quoted | **$1.19** |
| invoiced | *pending — reconcile against the fal invoice* |
| output | `_generated/video/fall-r2.mp4`, 939 478 bytes, 960 × 960, 97 frames at 24 fps |
| gallery session | `11594152ffe6` |
| disposition | **KEPT — first take, adopted.** The second authorised attempt was not needed and not spent. |

## Outcome

```
ok  fall  9 frames from 97 — one-shot, from motion onset at frame 19
ok  fall  9 frames  336x384  drawn 262x277  key(0,254,0)  PASS
      motion: PASS — peak motion 0.06477 >= floor 0.002
```

**G6: 0 of 9 frames fail**, against round 1's 5 of 8 failing on three edges. It packed into the
existing 336 × 384 cell — the `packStrip` widening branch (vault 4.14, *"widen the cell, never
rescale"*) was flagged as a stop-and-ask before the shoot and was **not** reached.

## The scale, which has no automated gate at all

`sprite-size-consistency.test.ts` deliberately does not measure `brass-courier`, so this number is
verified by eye in play and nowhere else. It was also the single easiest way to waste the generation.

`--derive-scale` printed **0.74805195**, and pasting it would have been a bug — the same bug
`death`'s printed `1.19502075` would have been. A fall deforms:

```
fall   frame heights  462, 438, 410, 374, 344, 340, 344, 364, 386   mean 385  spread 31.7%
attack frame heights  482, 474, 472, 476, 482, 482, 482, 482, 482   mean 480  spread  2.1%
death  frame heights  476, 416, 318, 234, 236, 156, 114, 106, 106   mean 240  spread 154.2%
```

A mean across a tuck-and-extend is not a standing-height measurement. But **`death`'s by-hand rule
does not transfer either**: death's frame 0 (476) *is* the upright anchor pose, which is why its
shipped scale is exactly `288/476 = 0.60504202`. `fall` has **no upright frame at all** — the courier
is airborne from the first sample to the last, and frame 0 is the spread-eagle with both legs
trailing *behind* him, foreshortened and therefore shorter than standing by construction.

So the number comes from the one standing measurement this anchor has: `attack`'s independently
derived **480** source px. **`288/480 = 0.6` exactly**, the same value `attack` packs at.

The consistency check is that `fall`'s tallest frame (462) is **96.3 %** of that 480 — a spread-eagle
being slightly shorter than a stand is the expected sign and magnitude, and it is what says the model
did not re-frame the figure between the two generations. Confirmed after packing: `fall` draws
**277 px** tall against `attack`'s 289, `hurt`'s 288 and `idle`'s 289.

**0.748 would have drawn the courier 25 % LARGER in the air than on the ground** — a pop the instant
he leaves the floor. That is the session-6 padded-`attack` defect (114 px against `hurt`'s 288)
running in the opposite direction.

Worth recording: this round is **markedly less deformed** than the one it replaces. Phase 4's
unpadded fall measured 1210, 1090, 834, 796, 966, 1204 — a 52 % spread against this round's 31.7 %.

## What emptying `BLOCKED_ON_ART` actually bought

The list is now `{}`, and **both gates that read it got stronger, not merely quieter**:

- `loop-dwell.test.ts`'s `uneven === Object.keys(BLOCKED_ON_ART)` becomes `uneven === []`. **No
  catalog row may be uneven at all**, where exactly one was permitted to be.
- `one-shot-divisor.test.ts`'s per-row loop covers `brass-courier/fall` for the **first time**. Proved
  by mutation: `frames: 9 → 8` turns it red on three named cases, including *"brass-courier/fall — 8
  frames divide the 18-tick window"*.

The file is **kept, not inlined as `[]`** in both importers — that is where the both-directions
property dies. `PENDING_ART` was kept on identical reasoning one commit before the scavenger's attack
landed, and was needed again within the hour.

## Records touched

| # | file | edit |
|---|---|---|
| 1 | `tools/gen/clipAnchors.mjs` | `PADDED_ANCHORS.fall` — **bare key**, with the reason it is bare |
| 2 | `tools/gen/motion.mjs` | `FRAME_MARGIN` on the `fall` record, before the `UPRIGHT_IN_AIR` tail; `frames: 8 → 9` |
| 3 | `tools/gen/clipJobs.mjs` | `CLIP_FILES.fall` → `fall-r2.mp4` |
| 4 | `tools/gen/clipAdoption.mjs` | `SUPERSEDED_CLIPS.fall` → `['fall.mp4']` |
| 5 | `character-bounds.json` | `animations.fall.scale = 0.6`, plus the `_actionScale` derivation |
| 6 | `tests/unit/blockedDwell.ts` | emptied to `{}`, kept and rewritten |
| 7 | `tests/unit/loop-dwell.test.ts` | `toHaveLength(1)` → `(0)` |
| 8 | `tests/unit/motion-framing.test.ts` | new `fall` block — the legacy bare keys had **no margin gate at all** |
| 9–11 | `fall.png` · `lift-profile.json` · `index.json` | written by `assets:build` |

## Spend

| | |
|---|---|
| before | $46.12 of $55 |
| this log | **+$1.19** |
| after | **$47.31 of $55** — $7.69 remaining |

The second attempt was pre-authorised at a further $1.19 and **was not spent**. The single largest
unquantified risk going in — *whether the padded courier canvas frames a spread-eagle airborne pose
inside the middle 70 %* — could not be measured before spending, which is exactly why two attempts
were authorised. It did.
