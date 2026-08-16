# Phase 6 — the gear pickup and the re-shot HUD

← [GENERATION-LOG.md](../GENERATION-LOG.md) · phase doc: [prd/phase-06-hud.md](../prd/phase-06-hud.md)

**2 generations · `fal-ai/nano-banana-pro` · $0.30 quoted, invoiced pending.**
Both kept. No discards, no retries — each was a single probe that passed its gates first time,
which is the outcome the probe-one-then-batch rule exists to make cheap when it does not.

All on `fal-ai/nano-banana-pro`, `resolution 2K`, `output_format png`, `num_images 1`,
`safety_tolerance 4`, `seed 20260804`, empty `system_prompt`. Schema and price were **re-checked
against the live endpoint before spending** (`genmedia schema`, `genmedia pricing`): `$0.15 / images
/ USD`, matching [STYLE.md](../STYLE.md) §2. A documented schema is a snapshot.

| Asset | `request_id` | aspect | measured px | detected | output |
|---|---|---|---|---|---|
| Gear pickup | `01a005c0-5dae-7860-be8d-c0f7b6d892d0` | 1:1 | **2048 × 2048** | 1 object | `public/assets/objects/gear.png`, 72 × 72 |
| HUD assembly | `01a005c6-8bdb-7360-8f41-3ba57167f001` | 21:9 | **3168 × 1344** | 1 assembly | `public/assets/hud/health-assembly.png`, 413 × 128 |

Superseded: `hud-019fe05e-b8d1-7f02-8c53-1f8bb6b1dfb3` (Phase 4 gate 4b/G) moved to
`_generated/world/superseded/`. `raw()` refuses to build when two candidates share a prefix, so the
move is mandatory rather than tidy — leaving both in place is how a build keeps using a superseded
image while every gate passes on it.

---

### 🔴 The re-shoot came back a different size, and every number measured off the old plate was wrong

The HUD was re-generated with `hudPrompt()` **unchanged** — same locked §4 blocks, same seed, same
aspect ratio. It returned a **413 × 128** assembly where the retired one was **305 × 128**.

That is not a fault. It is [STYLE.md](../STYLE.md) §2b working exactly as recorded: *`nano-banana-pro`
is not seed-deterministic* — two identical requests differed in 59.4 % of RGBA bytes when it was
first probed. **A re-shoot is a new composition, not the same one again.** The seed is a
record-keeping label, and the only way to get the same bytes twice is to re-fetch the `request_id`.

The consequence is the one `src/render/playerHud.ts` had been warning about since Phase 4:

> **If `hud-health` is regenerated, re-measure these four numbers.** There is no gate that can catch
> a stale slot: the fill would simply sit slightly off inside the frame, which is a thing only an
> eye can see.

`HUD_SLOT` went from `{ x: 140, y: 46, w: 156, h: 30 }` to `{ x: 132, y: 48, w: 239, h: 33 }`, and
`HUD_PLATE` from 305 to 413 wide. Both were dead wrong the instant the new file was written, and
nothing in the suite would have said so.

**This is the cost the user was told about and accepted before the re-shoot** — Codex's plan review
(F1) established that the shipped HUD had been made on the *current* model, not a retired one, so
the re-shoot bought fresher art rather than a corrected recipe. The decision is recorded in
[reviews/phase-06-plan.md](../reviews/phase-06-plan.md).

**Closed for next time:** `tests/unit/shipped-hud.test.ts` now measures the shipped PNG against
`HUD_PLATE`, and asserts the slot lies inside it with a bezel margin. A re-shoot cannot land
silently again — it turns "remember to re-measure" from a comment into a failing test. What still
cannot be automated is whether the slot lands *on the amber*; that stays criterion 6.8, owner `play`.

### 🔴 The documented measuring method measured the wrong thing

The method recorded in `playerHud.ts` — scan for `r > 190, g > 140, b < 130` at alpha > 200, right
of the medallion — returned **x 128–411** on the new plate. The plate is 413 wide. That extent runs
off the end of the bar and into the **rounded brass end cap**, because polished brass passes a gold
test.

Had it been used, the drawn fill would have extended ~40 px past the bezel and painted over the cap
— which reads as a rendering bug, not as a measurement one, and would have been chased in the wrong
file.

The fill is isolated by **hue and saturation** instead: saturation > 0.62, hue 25°–50°, value > 150.
That separates the saturated amber fill from the pale desaturated brass around it. Largest
contiguous column run: **x 129–373**, rows **45–83**, inset 3 px per side.

Then the rectangle was drawn back onto the plate and looked at
([evidence](../evidence/phase-06/hud-slot-measured.png)) — vault C4, because the failure mode here
is invisible to every metric and obvious to an eye.

### STYLE.md §7 per-batch gates

Applied to both assets, and the two that do not apply are named rather than scored *(vault 9.3)*.

| # | Gate | Gear | HUD |
|---|---|---|---|
| 1 | Dimensions read from the file, never the aspect label | ✅ 2048 × 2048 | ✅ 3168 × 1344 |
| 2 | Alpha channel read by value, never `mode == "RGBA"` | ✅ absent on the source (`mode=RGB`); keying mandatory, and `shipped-gear.test.ts` counts transparent and opaque pixels on the shipped file | ✅ same; corners asserted transparent in `shipped-hud.test.ts` |
| 3 | Zone separation measured | ⛔ **inapplicable** — an isolated object on a chroma field has no background band. This is the gate that says *exclude* the HUD | ⛔ inapplicable, same |
| 4 | Brass-cap rule checked by eye | ⛔ **inapplicable** — no standable surfaces on either asset | ⛔ inapplicable, same |
| 5 | Readability at true sprite size | ✅ downscaled to 72 px and looked at ([evidence](../evidence/phase-06/gear-at-true-size.png)) — teeth, spoke holes and hub all still resolve | ✅ drawn at 413 × 128 in the running game at all three supported resolutions |

**Gate 0 did not re-run.** It is a one-time model-swap probe, closed 2026-08-08, and no model
changed. Stated rather than silently skipped.

### The single-component check is a floor, not the gate

`buildChrome.mjs` throws unless `detectFrames` returns exactly one component. Codex's plan review
(F2) pointed out that this counts **components, not bars** — one connected assembly containing two
bars, or a segmented bar, passes it. STYLE.md §7 gate 0.3 was answered *by looking*, and the model is
not deterministic, so a recipe that transferred once is not evidence it transferred again.

**Looked at, 2026-08-15: exactly ONE bar, one continuous unbroken amber sweep, no segments, no
pips, no second bar, no trough.** The exhaustive anti-segmentation clause in `hudPrompt` held on
this generation as it did on the last one. Recorded as a human observation, which is what it is.

### Spend

| | |
|---|---|
| This gate | 2 generations, **$0.30 quoted** |
| Phase 5 running total | $47.31 of the $55 ceiling |
| **After this gate** | **$47.61 quoted+invoiced, $7.39 remaining** |

⚠️ As [GENERATION-LOG.md](../GENERATION-LOG.md) states: the $31.39 is a point-in-time **invoice**
reading and everything since is **quoted**. The two must not be added into one number that claims to
be either. The figure above is the mixed total, labelled as such.

The user authorised **up to 10 generations** for this phase. Two were spent. The eight unspent are
not a budget carried forward — the next phase asks again.
