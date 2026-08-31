# Phase 12 — the touch-control plate

**5 generations · $0.75 of the `$5` touch-UI ceiling. Takes 1-3 `fal-ai/nano-banana-pro` (TAKE 3 ADOPTED for five faces); takes 4-5 `fal-ai/nano-banana-pro/edit` (TAKE 5 ADOPTED for `touch-attack`).**

One plate carrying every button face on a chroma field, cut locally into 160 × 160 PNGs by
`tools/gen/buildTouchAtlas.mjs` (`npm run assets:touch`). Takes 1 and 2 are kept as evidence; **take
3 ships**, in `public/assets/ui/`.

## The required columns

| # | `request_id` | endpoint | seed | non-default inputs | measured dims | cost | verdict |
|---|---|---|---|---|---|---|---|
| 1 | `01a04e0b-ec39-7200-97bc-3afbd338ffeb` | `fal-ai/nano-banana-pro` | `20260804` | `aspect_ratio 1:1` · `resolution 2K` · `output_format png` · `num_images 1` | **2048 × 2048** | $0.15 | ❌ six buttons, 3 / 2 / 1 |
| 2 | `01a04e0e-d45d-7ab2-be31-a7c2f479a495` | `fal-ai/nano-banana-pro` | `20260804` | same, prompt repaired | **2048 × 2048** | $0.15 | ❌ seven buttons, 3 / 2 / 2 |
| 3 | `01a05115-d226-72b2-ae41-8998a11940cf` | `fal-ai/nano-banana-pro` | `20260804` | same, prompt rewritten for **six** faces | **2048 × 2048** | $0.15 | ✅ **ADOPTED** — nine buttons in a clean 3 × 3; the six asked for, plus a duplicate row |
| 4 | `01a05637-d0d2-7a72-b1b1-0de17b5e53c7` | `fal-ai/nano-banana-pro/edit` | `20260804` | `image_urls` the plate's own attack cell · `aspect_ratio 1:1` · `resolution 2K` · `output_format png` · `num_images 1` · `limit_generations true` | **2048 × 2048** | $0.15 | ❌ a HOLLOW outlined wrench — 9 strokes, 5 under 3:1, worst **1.008:1** |
| 5 | `01a0563a-bae1-7842-a283-2a633f440d49` | `fal-ai/nano-banana-pro/edit` | `20260804` | same, glyph fill stated positively | **2048 × 2048** | $0.15 | ✅ **ADOPTED** for `touch-attack` — 3 strokes, every one **3.318:1** / **3.846:1** |

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

---

## Take 3 — adopted, and the repair was not a prompt trick

The recommendation above was option 3: *give the model a layout with no space to fill*. What made
that possible was not a better sentence. **The game grew a sixth control.** The owner asked for a
walk/run toggle — `walkHeld` had no touch source at all, so a phone player always ran — and the
grid could then hold six REAL faces instead of five plus a negation. The owner also replaced two
marks: attack is the courier's own **wrench** rather than crossed tools, and pause is a **gear**.

So the prompt asks for six buttons in two rows of three, names six centres, and forbids *a seventh*
rather than *a sixth*.

⚠️ **It still added content — and this time that did not matter.** The model drew **nine** buttons in
a clean 3 × 3: the six that were asked for, in the rows they were asked for, plus a verbatim
duplicate of the second row. That is a different failure from takes 1 and 2, where an INVENTED face
shifted the layout and made *'the fourth thing found'* mean nothing. A repeated row leaves every cell
where the prompt put it, so `buildTouchAtlas.mjs` splits 3 × 3, reads rows 0 and 1 by position, and
ignores row 2. `TOUCH_PLATE_SHEET_ROWS` is the one place that decision lives.

### What the cut checks, per cell

Decode and measure first — never infer dimensions from the aspect label *(`FAL-MODELS.md:115-122`)*
— then assert 1:1, centre-crop to a divisible size (**2048 % 3 = 2**, so `splitGrid` would have
thrown), assert divisibility, split, and per cell: key out, **exactly one component**, a plausible
fill share, and **no foreground pixel on a crop edge** (a face flush to a boundary was cut by the
split and is refused, never downscaled).

### The gate on the shipped bytes

`tests/unit/shipped-touch.test.ts`. 🔴 Its first statistic compared **alpha masks** and was
decoration: every face is the same round brass disc and the mark is *engraved into* it, not cut out,
so the masks agreed on **99.6 %** and no bound above that could fail for anything the model might
draw. Replaced rather than re-bounded — the share of pixels differing in COLOUR by more than 60
(sum over RGB) measures **19.9 %** (`left`/`jump`, two triangles) to **40.0 %** (`right`/`walk`)
across all fifteen pairs. Bound at **5 %**, four times inside the closest honest pair; a duplicated
face scores **0.0 %**, which is how it was watched red.

### And one defect no gate could see

The walk plate went to the top **left** first — where the HUD portrait and gear gauge already live.
`touchTargetsFit` measures the six controls against each other and knows nothing about the HUD, and
all 28 touch e2e tests were green over the overlap. Found by taking a screenshot and looking at it.
Moved beside pause at the top right.

---

## Takes 4 and 5 — the wrench cell, re-shot

**Owner decision, 2026-08-31: re-shoot rather than accept.** The round-13 per-stroke split found
`touch-attack` stroke 2 at **2.86:1** against 12.14's 3:1, pinned in `KNOWN_SHORTFALL` at 2.8 so it
could not quietly worsen. No parameter reached it — `KEYLINE_PX` 4 left it at 2.86, `BOLD_PX` 3 and
4 made it 1.93 and 1.37 — because at 48 CSS px the fragment is about three output pixels of mostly
dark.

### The cause was the prompt, not the draw

Those four fragments are the wrench's own **interior shading**, and the plate prompt asks for
exactly that: a glyph *"deeply cut and filled with dark shadow"*. Re-rolling the same prompt would
have been $0.15 for another coin flip. So `touchButtonPrompt` composes its own glyph clause and
`touch-prompt.test.ts` asserts the plate's shading sentence is absent from it — and still present in
the plate prompt, so this is a difference rather than a sweep.

### Why the EDIT endpoint

`FAL-MODELS.md` § 2 records `nano-banana-pro/edit` as *"the lever for identity consistency"* at the
**same $0.15** — vault 4.1, *change the reference, not the wording*. `promptTouch.mjs`'s own header
says why that matters here: separately generated buttons give separately drifting interpretations of
"brass", and these six sit next to each other on screen where a mismatch is the most visible failure
available. The reference is the plate's own attack cell at **682 × 682**, produced by
`extractPlateCell` — a seam this repository did not have, because every path to a plate cell went
through `cutFace`, which resamples it to 160 px.

⚠️ **The endpoint defaults `aspect_ratio` to `auto`, not `1:1`**, and `resolution` to `1K`. Both are
set explicitly; a non-square return is refused by `cutFace`'s aspect check, which would have burned
a take for nothing. Re-read from `genmedia schema` before spending, per the standing rule.

### Take 4 — a hollow wrench, and what it taught

`request_id 01a05637-d0d2-7a72-b1b1-0de17b5e53c7`, $0.15. The prompt asked for *"a single continuous
inlay of one flat uniform tone at one even depth"* and the model drew a wrench as a dark **outline**
with the brass showing through it. That is worse than what it replaced: the contour, its notches and
the rivets fragment into **nine** strokes, five of them under 3:1, the smallest a 2-cell fragment at
**1.008:1**.

The repair is one sentence, and it is positive rather than a negation (STYLE.md § 6): *"The whole
area inside that outline is filled with the same dark tone as the outline itself, so the glyph is
one solid dark silhouette and the brass of the button face shows only around it."* Seed held at
`20260804` across both, so the difference is attributable to that sentence.

### Take 5 — adopted

`request_id 01a0563a-bae1-7842-a283-2a633f440d49`, $0.15. **Three strokes, all 3.318:1 at rest and
3.846:1 pressed** — identical to the five faces that already passed. `KNOWN_SHORTFALL` was deleted
**before** the candidate was adopted, so the battery that judged it required an unconditional 3:1;
had it been deleted afterwards, a 2.81 candidate would have passed the gate that exists to decide
whether the re-shoot worked.

Adopted through `npm run assets:touch -- --cell=touch-attack --source=<take 5>`, which writes one
key's cut fixture and shipped face and sweeps nothing. **Exactly two files changed**; the other five
faces are byte-identical. `TOUCH_CELL_SOURCES` records the new source, and `--adopt` still
reproduces all six byte for byte — without that entry it would recut take 3 and silently reinstate
the superseded wrench.

**Touch-UI figure: $0.75 of the $5 ceiling. $4.25 remains.**
