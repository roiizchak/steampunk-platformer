# Phase 5 — the `jump` re-shoot, and what $1.19 bought

Index entry in [GENERATION-LOG.md](../GENERATION-LOG.md). Provenance contract: every generation logged
with its `request_id` and reconciled cost *(criterion 5.4e)*.

**Ran:** 2026-08-10, session 3, with explicit user approval for the spend.
**This was not a planned batch.** It exists because the corrected G6 caught a real defect in shipped
Phase 4 art, and because re-shooting it happened to test the *same* hypothesis Batch 1 was designed to
probe — for the same money.

---

## Why it was shot

G6's subject mask was corrected this session (it had been measuring chroma spill; see
[HANDOFF.md](../HANDOFF.md) §9). The moment it stopped crying wolf on `idle`, it failed
**`brass-courier/jump`** — the character's hand sheared flat by the **right** frame edge in **5 of 6
frames**, confirmed by eye at 3× and by per-column measurement (`col 719` carrying 53–167 fully-opaque
pixels). That defect had been invisible for the whole of Phase 4 and most of Phase 5, because `idle`
threw first.

**Root-cause hypothesis under test:** `jump.mp4` is **720 × 1280 (9:16)** from a **square 2048²**
anchor. [ASSET-PIPELINE.md](../ASSET-PIPELINE.md) prescribes `--aspect_ratio "1:1"` for this endpoint;
9:16 was submitted against the project's own documented pipeline. The same mistake is recorded for the
Phase 5 sentry clips.

## The probe was genuinely single-variable

An earlier plan revision was rejected by Codex review for changing three variables at once and
therefore proving nothing. This one changes **one**.

| | Phase 4 original | This re-shoot |
|---|---|---|
| `request_id` | `019fe1ec-a696-7f83-90fd-f0184b2a641b` | **`019fecbf-9ad4-7f93-a134-003e743b0a82`** |
| anchor | `0aa58723/DAg3WILCtZZT1FGD0AlvQ_anchor.png` | **byte-identical image** — verified, see below |
| prompt | `_generated/phase05/prompts/jump.txt` | **unchanged** |
| resolution / duration | 720p / 4 s | 720p / 4 s |
| **`aspect_ratio`** | **`9:16`** | **`1:1`** |
| output | 720 × 1280 | **960 × 960** |
| seed | 1798334876 | 1660695226 *(not seed-deterministic; not a control)* |

**The anchor identity was verified, not assumed.** `CLIP_JOBS` pointed at a *different* fal URL
(`0aa5ad06/…`) from the one Phase 4 used. Both were downloaded and hashed against the local file:

```
phase-4 anchor URL   ba3ba6ffad5264cf   6367305 bytes
CLIP_JOBS anchor URL ba3ba6ffad5264cf   6367305 bytes
public/…/anchor.png  ba3ba6ffad5264cf   6367305 bytes
```

Same image, uploaded to fal twice. Had they differed, this would have been a two-variable probe and
worth nothing. **The submitted command used the Phase 4 URL** so the control is exact.

---

## The result — the hypothesis is REFUTED as a complete explanation

**The horizontal crop is fixed. A vertical one replaced it.**

Opaque-mask margins, per sampled frame of `jump-r2.mp4` (960 × 960):

```
  f0: left=178 right=192 top=  0 bottom=  0   figureHeight=960  <- fills the frame, cut top AND bottom
  f1: left=258 right=218 top=  6 bottom=106
  f2: left=192 right= 69 top=  0 bottom=176
  f3: left= 26 right= 36 top=  0 bottom=106
  f4: left= 30 right= 44 top=  0 bottom=110
  f5: left=112 right= 16 top=  0 bottom=124
```

Left/right are now healthy — 16–258 px, never 0. **Top is 0 on five of six frames.** Confirmed by eye:
the raised hand is sheared flat at `y=0`, fingers cut mid-stroke.

### What this actually means

**The aspect ratio is *a* factor, not *the* factor.** Seedance frames the subject to fill whatever
canvas it is given. Changing the ratio does not add margin — **it only moves which edge gets
violated.** A tall 9:16 canvas starves the sides; a square one starves the top.

That is a different mechanism from the one recorded in HANDOFF §8, which read the defect as *"the
sentry is wider than tall, so its square anchor forced into 9:16 lost ~14 % off each side."* That
description is consistent with the data but incomplete: it implies 1:1 restores the missing margin.
**It does not.** The framing behaviour is a separate axis from the ratio, and no ratio value controls
it.

### The consequence for Batch 1 — the plan's own stop rule fires

The approved plan says of Batch 1's `brass-sentry/fire` probe:

> *"changes **one variable** (the ratio) so the root cause is actually isolated; if it still crops,
> **STOP and re-plan — do not spend Batch 2.**"*

**This probe is that experiment, run on a different subject for the same $1.19 — and it still crops.**
By the plan's own rule the correct action is to **STOP and re-plan before Batch 2's $5.95**, and to
reconsider whether Batch 1's $3.57 is worth spending in its current form at all.

The remaining levers, none of which this probe tested, are the ones the plan had deferred:
**anchor padding** (give the model margin it cannot frame away), the **margin clause** in the prompt
(W9 wrote one for the combat motions; `jump` lives in `motion.mjs` and never got it), and
`HOLD_CAMERA` — which already says *"is never cropped by any edge"* and was, again, not honoured.

---

## Disposition — the re-shoot is NOT accepted

`jump-r2.mp4` is kept as evidence and **not adopted**. `CLIP_JOBS`'s `jump.file` still declares
`jump.mp4`, so `findClip` continues to resolve the original and the new file creates no ambiguity —
the W2b guard working as designed on its first real test.

**Neither clip passes G6.** The original fails on the right edge, the re-shoot on the top. `jump` is
unresolved and stays on the Phase 4 debt ledger.

## Cost

| item | qty | cost |
|---|---:|---:|
| `brass-courier/jump` @ 1:1, 720p, 4 s | 1 | **$1.19** |

**Phase 5 spend: $13.99 → $15.18 of the $40 ceiling.** $24.82 remains.
Planned-but-unspent: Batch 1 $3.57, Batch 2 $5.95, Batch 3 $0.15 — **all now under review**, because
the premise Batch 1 was designed to confirm has been answered here instead, and answered *no*.
