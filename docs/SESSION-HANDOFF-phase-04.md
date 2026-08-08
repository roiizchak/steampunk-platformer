# Session handoff — Phase 4 (fal art production + Character Gym)

**Written 2026-08-08.** Branch `phase-04-art`. Phase 4 is **NOT complete and must not be reported
as done.** Read this, then [PRD.md](PRD.md), then `docs/prd/phase-04-art.md`.

The plan being executed is at
`C:\Users\royko\.claude\plans\docs-prd-phase-04-art-md-let-s-continue-witty-wreath.md`.

---

## 1. Start here — the one open defect

The user's report, twice, in their words: **"the character does not look like they stand or walk on
the tiles"** and **"it's still not looking good, still not looking like it on all the tiles"**.

Two contributing causes were found this session. **The first is fixed. The second is diagnosed,
measured, and NOT fixed — that is the next session's first job.**

### 1a. Fixed already — the codec halo (commit `7c7b3f6`)

A soft chroma-bleed halo around the figure was being counted as part of it, so the packer aligned
the *haze* to the ground and the boots hung 4–20 px above the tiles. `trimHalo` in `chroma.mjs`
removes it. Verified: the drawn sprite's bottom now equals the sim's feet position to 0.0 px across
481 samples. **Do not re-investigate this.**

### 1b. THE OPEN DEFECT — `packStrip` flattens the animation's vertical movement

**`packStrip` pins EVERY frame's lowest opaque pixel to the cell's bottom row.** For a planted idle
that is right. For anything with a flight phase it destroys the animation.

The Seedance clips are **camera-locked** (the prompt demands it, `motion.mjs`), and the character
does not translate within the frame. So the figure's vertical movement between frames *is the
animation*, and it is recorded faithfully in the source. Measured on `_generated/sheets/*-clip.png`,
where every cell shares one y coordinate system:

| anim | figure-bottom range, source px | × scale 0.2382 = game px | what it is |
|---|---|---|---|
| `idle` | 3 | 0.7 | planted — correctly ~zero |
| `walk` | 23 | **5.5** | the trailing foot lifting |
| `run` | 64 | **15.2** | **the flight phase** |
| `jump` | 217 | **51.7** | the leap |
| `fall` | 201 | **47.9** | the descent |

`packStrip` subtracts exactly this. Consequences, in order of how visible they are:

1. **The run never leaves the ground.** At the frames where both feet should be clear, the whole body
   is dragged *down* so the lowest foot touches the baseline. The legs pump while the torso sinks —
   an inverted bob, which is why it still reads as wrong and as un-smooth.
2. **The walk sinks 5.5 px at the passing frames**, for the same reason, again in the wrong
   direction.
3. **`jump` and `fall` lose ~50 px of pose travel.** `character-bounds.json`'s `_footOffsetPx` note
   already predicted exactly this: *"an airborne pose tucks its legs, so the art's lowest pixel sits
   above where the collision box bottom actually is — bottom-aligning jump and fall makes the
   character appear to stand on air."* `footOffsetPx` is **0 for every animation** and was never
   settled, because that is a Gym adjustment and the Gym does not exist yet.

### The fix, and the one design decision it needs

**Preserve the source's inter-frame vertical relationships instead of re-zeroing each frame.** Per
animation, take ONE offset — from the frame with the lowest figure bottom, i.e. the planted/contact
frame — and apply that same offset to every frame. A frame that sat higher in the source then lands
higher in the cell, and the bob and flight phase survive.

`sheets.mjs`'s `packStrip` currently takes `baselineY` and aligns each cell independently; the change
is to compute the baseline once per sheet rather than once per frame. Its docstring's *vertical*
paragraph ("align on the LOWEST opaque row — the feet") is the line being amended, and the
*horizontal* centroid paragraph is correct and must not be touched.

**The open decision, for `jump` and `fall` only:** the sim ALREADY supplies vertical travel —
`stepVertical` moves the player every tick, and the sprite is drawn at that position. Preserving 50 px
of art-side rise on top of it would double the motion, which is the same class of mistake as the two
discarded generations that asked the model to translate (see `motion.mjs`). Two candidate answers,
both need looking at on screen:

- anchor `jump`/`fall` on a stable landmark (hip or centroid) rather than the feet, so the pose reads
  airborne without adding travel; or
- keep single-offset alignment but set `footOffsetPx` per animation to pull them back, which is what
  that field exists for.

`idle`, `walk` and `run` are unambiguous — single-offset alignment is right for all three.

**Verification for this fix, non-negotiable:**
- Watch it fail first *(C1)*, mutation verified by *content changed AND the original count dropped by
  one* *(C12)*.
- The cheap regression check is the measurement above: after the fix, the packed strips' figure-bottom
  range should be ~23/64 source px scaled, **not** 0 for every frame. A test asserting "not all frames
  share a bottom row" is the honest gate.
- **`play`-owned, and cannot be closed on numbers.** The user has now rejected two rounds of
  measured-green work on this. Screenshot the character mid-run at magnification against the tile
  line, and on a platform edge, before claiming anything.

### Unexplained, and worth attention: "on ALL the tiles"

The phrase was used twice and may not be loose. Only the **flat ground row (y=1920)** has been
verified. `level-01.tmj` also has platforms at rows 16, 12 and 16 and a 3-cell pillar. **Nobody has
checked that the character's feet meet a PLATFORM's surface**, and platform collision rectangles come
from the object layer, not the tile grid *(vault 3.3)* — so a platform whose collision top does not
match its drawn top would show exactly this symptom and would be invisible on flat ground. **Check
this early; it is cheap and it may be a second, independent bug.**

---

## 2. What shipped this session

Three commits on `phase-04-art`:

| commit | what |
|---|---|
| `28aedea` | character animation moved from per-frame image generation to **Seedance video**; the clip sampler |
| `7c7b3f6` | `trimHalo` — the codec halo that held the character off the ground |
| (earlier) `74d6d88` | the superseded 8-pose sheets, now replaced |

### The pipeline change, in one paragraph

Gate 4.2b had recorded *"probe B wins, and it is not close"* for per-frame `nano-banana-pro/edit`
sheets. **That verdict is reversed and the reversal is recorded in
[GENERATION-LOG.md](GENERATION-LOG.md) § Gate 4b/I.** Measured on the shipped sheets, consecutive
idle frames scored a silhouette IoU of 0.86–0.98 — the same pose — while the interior still changed
by 13–36 per channel. That is not animation, it is the character being redrawn every frame. Video is
temporally consistent by construction. The sibling project at `C:\Claude\Street-Fighter`
(`docs/art-pipeline.md`) had already reached this conclusion and its prompt rules are now encoded in
`tools/gen/motion.mjs`.

### New/changed files worth knowing

| file | what it does |
|---|---|
| `tools/gen/motion.mjs` | the five motion briefs + the prompt rules, each with the generation it cost to learn |
| `tools/gen/sampler.mjs` + `.d.mts` | **pure**: picks which source frames become the sheet by measuring the cycle |
| `tools/gen/build-clips.mjs` | `npm run assets:clips` — mp4 → grid sheet via ffmpeg |
| `tools/gen/chroma.mjs` | gained `trimHalo` |
| `tools/gen/sheets.mjs` | `detectFrames` `minGap` is now 2 % of sheet height, not a flat 8 px |
| `tools/gen/build-assets.mjs` | refuses empty/fragment cells; `findSource` refuses an ambiguous prefix |
| `tests/unit/clip-sampler.test.ts` | 16 cases on synthetic periodic signals |

### Current numbers

```
anim   frames  simTicks  fps derived  provenance
idle     12       90        8.00      authored
walk     12       56       12.86      measured
run      12       39       18.46      measured
jump      6       18       20.00      sim
fall      6       18       20.00      sim
```

`scale 0.2382134` (288 / 1209 source px) · `stridePxPerCycle.walk 310` · **`run 468` is still
INDETERMINATE** — at a run contact frame the trailing leg is airborne so the foot band captures one
boot and cannot call the step length *(vault 4.18)*. It is scaled from the OLD walk art and is now
doubly unverified. Gym task; the observable if wrong is run foot-slide.

**401 unit tests pass, typecheck clean, `npm run build` green including `verify-dist ok`.**

---

## 3. Everything else still outstanding in the plan

In rough dependency order.

1. **The open defect above.**
2. **Platform-surface check** (§1b tail) — cheap, possibly a second bug.
3. **S7 — hand-tune speed in the Playground** (`P` key) and record the settled values. The user chose
   *"~2.5 heights/s, then tune by hand"*; the shipped numbers are the derived starting point only.
4. **Re-measure the `run` stride** once the Gym exists.
5. **H — `GymScene`** (`src/scenes/GymScene.ts`), not started. Dev-only the way this project means it:
   `import.meta.env.DEV` **at the point of creation and inside everything that names it** — scene
   roster, key binding, toggle body, and `refuseToRoute`'s stop list; then add `Gym`/`GymScene` to
   `verify-dist.mjs`. Overlay colours fixed by ASSET-PIPELINE §6: **white** frame bounds, **blue**
   visual footprint, **green** collision, **red** attack hitbox. Bounds by frame-differencing, and a
   sheet the metric cannot call reports **INDETERMINATE** *(vault 4.18)*. The save path is an
   authorization decision *(vault A4)*.
6. **Docs**: `ASSET-MANIFEST.md` (new) · `docs/prd/phase-04-art.md` §1 animation list + §6 criteria
   4.19–4.26 · SOURCE-ANALYSIS §6c "~97 frames" provenance · `docs/qa/phase-04-art.md` (the phase QA
   log — `docs-contract.test.ts` requires a row per criterion for a phase marked done).
7. **Tests**: sheet bad fixtures · `tests/e2e/phase-04-assets.spec.ts` · byte-identical rebuild
   *(vault 4.15)* · `verify-dist.mjs` sheets sweep.
8. **QA gate** — the Owner column is an instruction. Agent owners run **before** the Codex
   implementation review, **two briefs each** *(A7)*, findings applied or recorded with a one-line
   reason *(C11)*, into `docs/qa/phase-04-art.md`. Then the **Codex implementation review** →
   `docs/reviews/phase-04-impl.md`. Both are mandatory.
9. **Vault-out**, then **STOP for approval**.

---

## 4. Practical notes for the next session

```bash
npm run assets:clips     # mp4 -> grid sheets   (needs ffmpeg/ffprobe on PATH)
npm run assets:build     # grid sheets -> shipped strips + gates
node tools/gen/build-assets.mjs --derive-scale   # prints a scale; a human pastes it (vault A5)
npm test && npm run typecheck && npm run build
```

- **Regenerate `idle` FIRST** if clips are ever re-fetched: the scale derives from it and every other
  animation is packed against it *(vault A5)*.
- `_generated/` is **gitignored**. The nine clips live in `_generated/video/` with their
  `.job.json` and `.prompt.txt` beside them; `request_id`s are in GENERATION-LOG § Gate 4b/I. Losing
  that directory means re-fetching from those ids, and `build-clips`/`build-assets` **fail loudly**
  rather than substituting *(vault 4.16)*.
- Superseded per-frame sheets are in `_generated/sheets/superseded/`. Do not move them back —
  `findSource` now refuses an ambiguous prefix, which is deliberate.
- **Kill dev servers by port** *(C13)*. Playwright/`vite` must be launched as
  `node ./node_modules/vite/bin/vite.js`, never `npm run dev` — the shell wrapper orphans the real
  process on Windows.
- Never `waitForTimeout`; wait on `window.__game.ready`. Sample **inside the page** once per animation
  frame and return an aggregate — a tick-expressed wait cannot bound a sampling window.
- Codex's sandboxed shell cannot spawn processes here. Every review prompt must say to use the
  `node_repl` MCP tool with `fs.readFileSync`, and its findings are file-evidence only and must be
  re-verified locally.

### Spend

**10 Seedance generations, price still unread.** `genmedia pricing` reports `0.014 / "units"` with no
unit defined, no cost field appears in any job record, and `genmedia` has no billing command, so the
22× disagreement ($0.056 vs $1.21 per clip) stands. Cumulative bounds: **$5.54 – $17.08 of the $25
ceiling.** Reading the fal.ai dashboard invoice line is the single highest-value unresolved number in
this phase and needs a human — it decides whether a further batch is affordable at all.

### A process note worth carrying

Three separate defects this session were **invisible to every gate and obvious on sight**: the empty
frames, the halo, and now the flattened flight phase. Two of them shipped as "measured green". The
gates are worth keeping and were each strengthened — but on this phase, *look at the picture before
reporting anything*, which is exactly what vault **4.24** and criteria 4.1/4.14 being `play`-owned
are for.
