# Phase 12 — the touch-control plate

**2 generations · $0.30 of the `$5` touch-UI ceiling · `fal-ai/nano-banana-pro` · NEITHER ADOPTED.**

One plate carrying all five button faces on a chroma field, to be cut locally into five 160 × 160
PNGs by `tools/gen/buildTouchAtlas.mjs`. **The game ships the grey-box faces**; both takes are kept
as evidence and the decision is the owner's.

## The required columns

| # | `request_id` | endpoint | seed | non-default inputs | measured dims | cost | verdict |
|---|---|---|---|---|---|---|---|
| 1 | `01a04e0b-ec39-7200-97bc-3afbd338ffeb` | `fal-ai/nano-banana-pro` | `20260804` | `aspect_ratio 1:1` · `resolution 2K` · `output_format png` · `num_images 1` | **2048 × 2048** | $0.15 | ❌ six buttons, 3 / 2 / 1 |
| 2 | `01a04e0e-d45d-7ab2-be31-a7c2f479a495` | `fal-ai/nano-banana-pro` | `20260804` | same, prompt repaired | **2048 × 2048** | $0.15 | ❌ seven buttons, 3 / 2 / 2 |

Files, prompts and job records: `_generated/phase-12-touch/`.

## What the measurement settled, and it is worth the $0.30 on its own

🔴 **`nano-banana-pro` at `1:1` / `2K` returns exactly 2048 × 2048.** `FAL-MODELS.md:115-122` records
this as **UNMEASURED** and forbids inferring it — the precedent being `16:9 @ 2K` returning
`2752 × 1536`, ratio 1.7917 rather than 1.7778. Both takes agree, read off the file with
`decodePng`. That is now a measured fact rather than a hypothesis, and it confirms the plan's third
BLOCKER: **2048 % 3 = 2**, so `splitGrid(image, 3, 2)` would have thrown
(`sheets.mjs:168-172`) and the centre-crop-to-divisible step the Codex review demanded is load-bearing
rather than defensive.

## Take 1 — six buttons

Prompt: `_generated/phase-12-touch/take-1-prompt.txt`. It said *"a 3 by 2 grid of equal square
cells"*, *"five of the six cells hold one button each"*, and listed *"a sixth button"* under DO NOT
INCLUDE.

The model drew **three across the top, two across the middle, and a sixth alone on a third row** — a
near-duplicate of the attack face.

The failure is instructive rather than surprising. **"A 3 by 2 grid" is a label, not a geometry**:
nothing in the prompt said where a cell was, so the model decided, and decided wrong. And the
negation did exactly what STYLE.md §6 says negations do — *"do not negate it; remove the space it
would occupy"*. Naming "a sixth button" as forbidden put a sixth button in the model's head.

## Take 2 — the one authorised repair, and it went the wrong way

Per the plan: **one prompt repair, then STOP and ask. Never a silent re-roll.**

The repair replaced the label with geometry — five button centres stated as fractions of the image
(*"button 1 at one sixth across and one quarter down"* …), a stated diameter, and the count asserted
as a positive fact rather than as a prohibition. Two self-contradictions left by the first draft were
also removed (*"arranged as a grid"*, *"the empty sixth cell"*), because a self-contradicting clause
has cost this project 12 credits before *(4.3)*.

It came back with **seven** buttons, in 3 / 2 / 2. The five faces that were asked for are all there
and are good — the arrows and the crossed spanner-and-hammer read cleanly at size — but the requested
centres were not honoured either, and the middle row's pause glyph is malformed (one bar slanted)
while the *extra* bottom-row copy of it is clean.

## Where this stops, and why it is a STOP rather than a third attempt

The repair budget is spent. A third generation is a re-roll, and a model that needs three attempts is
saying the prompt is wrong rather than unlucky — paying it to guess is how a $5 ceiling becomes a $20
one *(4.9: probe one, then batch; budget from the invoice)*.

**The game is unaffected.** `touchControlsLayer.ts` draws grey-box brass plates with monospace glyphs
and every Phase 12 criterion is measured against those, so the art is an upgrade and never a
dependency. `tests/unit/touch-draw-path.test.ts`'s fake scene **throws** on `add.image`, which is what
keeps a half-finished art path from being adopted silently.

### The three options, for the owner

1. **Ship the grey-box.** $0.30 spent, nothing further. The controls are legible and in-style; they
   are flat brass discs with a glyph rather than rendered ones.
2. **Cut take 2 by measured position.** The five faces needed are all present and separable. It means
   hand-measuring five centres off a plate whose layout the model chose, which is exactly the
   detection-order fragility the plan's cell-position rule exists to avoid — so it needs saying out
   loud rather than doing quietly.
3. **One more generation, prompt rewritten around what take 2 revealed** — the model wants to fill the
   sheet, so ask for a 2 × 3 portrait strip of six with a deliberate sixth face (a HOME or MUTE
   button we do not wire), giving it nothing to invent. $0.15, total $0.45 of $5.

Recommendation: **3**, then 1 as the fallback. The failure in both takes is the same one — the model
adds buttons to fill space — and a layout with no space to fill is the repair that addresses the
cause rather than the symptom.
