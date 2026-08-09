# Phase 5 — enemy anchors

Pointer row in [GENERATION-LOG.md](../GENERATION-LOG.md). Criterion **5.4e**: every generation gets a
row, **including the discarded ones** — a discarded clip that cost money and left no row is how ~$6
of Phase 4 became unattributable.

**Model:** `fal-ai/nano-banana-pro`, `aspect_ratio 1:1`, `resolution 2K`, `num_images 2`.
Schema re-verified with `genmedia schema` immediately before the first call, per the standing rule
that a documented schema is a snapshot.

**Rate:** $0.15 per image, the invoiced Phase 4 figure — *not* `genmedia pricing`, which was wrong by
~21× in the cheap direction.

## Every image, kept or discarded

| # | Slug | Round | `request_id` | G1 verdict | Cost | Outcome |
|---|---|---|---|---|---|---|
| 1 | `brass-sentry` | 1 | `019fe7a5-0a0a-7441-9dac-aa49338bbfcb` | **PASS** — 3 limbs, 0 px / 21 | $0.15 | **SHIPPED** as `anchor.png` |
| 2 | `brass-sentry` | 1 | *(same request, `images[1]`)* | INDETERMINATE — 1 limb | $0.15 | discarded: legs merged into one component |
| 3 | `rust-scavenger` | 1 | `019fe7a5-ba66-7253-86fe-b1f39190c950` | **FAIL** — 5 limbs, 104 px / 29 | $0.15 | discarded: see the prompt defect below |
| 4 | `rust-scavenger` | 1 | *(same request, `images[1]`)* | **FAIL** — 2 limbs, 52 px / 27 | $0.15 | discarded: one foot 52 px off the floor |
| 5 | `rust-scavenger` | 2 | `019fe7a8-3cfd-7833-bd6a-2dacd543792f` | **FAIL** — 4 limbs, 34 px / 26 | $0.15 | discarded |
| 6 | `rust-scavenger` | 2 | *(same request, `images[1]`)* | **PASS** — 2 limbs, 23 px / 25 | $0.15 | **SHIPPED** as `anchor.png` |

**Spend: $0.90.** Running Phase 5 total: **$0.90 of the $40 ceiling.**

## G1 caught the defect it was built for, on the first new art it ever saw

Row 4 is the Phase 4 defect reproduced by a fresh model on a fresh subject: **one foot drawn 52 px
above the other**, against a 27 px limit. In Phase 4 that shape of defect survived generation,
survived packing, shipped, and was found by the user's eye after ~$7 of clips had been shot from it.
Here it cost **$0.15** and never left `_generated/`.

That is the whole argument for building the gate before the spend rather than after it.

## The prompt defect G1 exposed, which is a limitation of G1 as much as of the prompt

Row 3 measured **104 px across 5 contact limbs**, and the number was correct while the *question*
was wrong. The first `rustScavenger` concept asked for *"long thin arms hanging toward the ground"*
and got a knuckle-dragger whose fingertips entered the ground band — so G1 compared **a hand against
a foot**, not the two feet.

**G1 assumes every ground-contact component is something the subject stands on.** It has no way to
tell a hand from a boot, and it should not pretend to. Recorded as a standing constraint on the
prompts rather than as a bug: any subject that puts something other than its feet into the bottom
12 % of its own height must say so in its concept, or its G1 verdict answers a different question.
The `rustScavenger` concept now carries that requirement, with this reason attached.

It was also better art direction. Fingers dangling at the floor smear across a walk cycle.

## Observations recorded rather than re-shot

| What | Why it stands |
|---|---|
| **The shipped scavenger passes at 23 px against a 25 px limit** — close to the line. | 23 source px on a 1661 px figure is ≈3 px once drawn at 240 px. Visible to a gate, invisible to an eye. Re-shooting for a rounder number would spend real money to move a number nobody sees. |
| **The scavenger came back greyer than the "warm rust orange" the concept asks for**, so the colour separation from the sentry's cold steel is weaker than intended. | Colour was always the *redundant* channel here — silhouette is primary, and a three-legged turret against a hunched biped is unmistakable. Phase 4's lesson was that the rework rate, not the unit price, is what breaks a budget. If the two read poorly at true sprite size in the hands-on pass, that becomes a costed re-shoot with evidence behind it. |
