# Session log — Tier-5 gate holes, part 3: §3c onward

Continues [session-tier5-gate-holes-02-tweens.md](session-tier5-gate-holes-02-tweens.md). Flat
sibling per CLAUDE.md §6 — `tests/unit/file-size.test.ts` globs `docs/qa/*.md` non-recursively, so a
subdirectory would silently leave the split half ungated.

---

## Batch 8 — §3c, item 5.9: the knob sweep now checks its own regime

### The hole, in the file's own words

`knob-sweep.test.ts` carried a floor at `y: 6000` and a world `heightPx: 8000` — hand-written
constants sitting **directly beneath a docstring about themselves**:

> *"The floor and the window are properties of the tuning, not constants — anything that lowers
> gravity has to move them or this gate quietly stops measuring."*

That sentence exists because the failure happened **three times in one session**: a physics change
moved the saturation point, the geometry did not follow, and the sweep reported a live knob as DEAD
while blaming the knob. Every one of those was caught by a human reading a suspicious green.
**Recording the rule in prose and then hand-writing the constants is the same defect one level up.**

And the sweep's assertion is *"this knob moved something"*. Nothing asserted the scenario was in the
regime where that knob is observable at all.

### What landed

| | |
|---|---|
| **`tests/unit/knobSweepGeometry.ts`** *(new, 110 lines)* | `fallDistance` by the sim's own integration (`player.ts:271`), `tuningEnvelope`, `worstCaseFall`, `longFallGeometry`. The floor and the world are now computed. |
| **`tests/unit/knobSweepScenarios.ts`** *(new, 284 lines)* | The fixture — roster, eleven scenarios, the derived geometry, the regime probe — extracted when §3c pushed `knob-sweep.test.ts` to **415/400**. |
| **`tests/unit/knob-sweep.test.ts`** *(330 → 148)* | The two gates, both reading the one fixture. |

**The derivation, and the one decision inside it.** ⚠️ *One fixed worst case from the WHOLE
perturbation envelope, never re-derived per mutated tuning* — the Codex plan review's round-2
refinement. A per-tuning window would let each perturbation pick the geometry that flatters it, and
the sweep would then be measuring its own scenario generator rather than the knob.

The envelope is **one knob at a time**, because the sweep is (`{ ...DEFAULT_TUNING, [key]: value }`):

| tuning | fall in 100 ticks |
|---|---|
| baseline | 3213.4 px |
| `gravity` ÷2 | 1704.4 px |
| **`gravity` ×2** | **4199.5 px** ← the worst case |
| `maxFallSpeed` ÷2 | 2099.8 px |
| `maxFallSpeed` ×2 | 3408.7 px |

At 1.25× headroom that puts the floor at **y 6030** and the world at **7150 px**, against the
hand-written 6000 / 8000. The hand values were adequate — by 1020 px of slack nobody had measured.
`SPAWN_Y` is read off a real `createWorld` rather than copied, because it is private to
`src/sim/world.ts` and a copy of a private constant is the drift this file exists to stop.

**The two regime preconditions.**

1. `longFall` — the clamp **saturated** inside the window at baseline (`vy === maxFallSpeed`), and
   **nothing landed or died** under *any* tuning in the envelope. Landing converges every
   perturbation on one resting fingerprint; crossing `belowKillPlane` respawns them all to the same
   place. Those are the two ways this scenario has actually failed.
2. `coyote` — the ledge **was** left (`leftGround` fired, and not on tick 0), and the perturbations
   **straddle the press**: `coyoteTicks` 3 / 7 / 14 against a 5-tick wait must not all produce the
   same jump count, or the scenario is on one side of the window for every tuning.

A shared `probe` records the last world and the leave-tick. The alternative was returning a tuple
from all eleven scenarios to instrument two.

### Red proofs — five, each watched failing, each reverted with the count confirmed *(C1, C12)*

| # | mutation | result |
|---|---|---|
| 1 | `FALL_HEADROOM` 1.25 → 0.3 (floor inside the fall) | **2 failed / 15 passed** — regime gate **and** `sweeping maxFallSpeed` |
| 2 | `LONG_FALL_TICKS` 100 → 20 (window too short to saturate) | **2 failed / 15 passed** — same pair |
| 3 | `coyote` never walks off the ledge (`input.right` removed) | **2 failed / 15 passed** — regime gate and `sweeping coyoteTicks` |
| 4 | `coyote` wait 5 → 0 ticks (press inside every window) | **2 failed / 15 passed** — same pair |
| 5 | 🔴 **`FALL_HEADROOM` 1.25 → 0.9** — *only* the `gravity ×2` arm lands | **1 failed / 16 passed** |

🔴 **Proof 5 is the one that justifies the gate.** In proofs 1–4 the sweep goes red too, so the new
tests are *diagnosis* — they name the cause the human previously had to find. Proof 5 is the case the
sweep **structurally cannot see**: one perturbation of one knob silently leaves the regime, every
knob still moves *something* in *some* scenario, and all twelve sweeps stay green. The regime gate
was the only thing that failed, with the floor and world height in its message:

> *a perturbation LANDED inside longFall (floor y 4560, world 5680 px). Every tuning that lands
> converges on one resting fingerprint, so the scenario stops discriminating.*

Reverts confirmed by *content changed AND the original count dropped by one* each time, and the file
returns to **17 passed** after every one.

### Not done

The plan noted the existing "can fail" proof at the file's foot covers `gravity` × `jumpHeld` only.
It is untouched — widening it is a separate question from §3c's, and proof 5 above already
establishes the sweep's blind spot more directly than a second sensitivity check would.

**Verified:** typecheck clean · `knob-sweep.test.ts` **17 passed** · full unit suite **167 files /
2486 tests** (2484 baseline **+2**, the two regime tests; the two new modules are helpers, not spec
files, so the file count is unchanged) · `file-size` green with the three files at 148 / 284 / 110.

---

## Batch 9 — §3d, item 5.20: the HUD's inter-element spacing is gated

`hudFits` checks two things: everything is on **screen**, and the bar is inside its own **plate**.
Nothing checked the space *between* elements — and `src/render/hud.ts:61` says so in as many words:
*"no gate checks spacing between HUD elements (item 5.20)."* `COUNTER_GAP`, the constant that
produces that spacing, had **zero test references repo-wide**.

### 🔴 `COUNTER_GAP` stays private — the Codex plan review's correction, and it is the point

The obvious fix is to export it and assert `gap === COUNTER_GAP * scale`. **That proves nothing.** An
assertion derived from the same implementation constant moves whenever the constant moves, so it can
never disagree with the code: the shape of a gate with the substance of a restatement. `src/` is
untouched by this batch.

The three claims are independent and geometric, and all run at **every supported size** because what
breaks is the scaling, not one viewport:

1. **Nothing overlaps anything** — a rectangle intersection test. No tolerance, no constant.
2. **A readable gap survives** — `MIN_ELEMENT_GAP_PX = 8`, a *refusal* bound in the sense
   `MAX_LEVEL_CREATE_MS` is: chosen to say what is unacceptable, not fitted to what is measured. The
   shipped design gaps are **24** and **12** px, so 8 sits below both with headroom and forbids
   "touching, overlapping or crowded" without forbidding a future tightening. Scaled with the layout,
   so at 852×480 the floor is 3.56 px against a 10.7 px actual.
3. **The assembly holds together vertically** — the icon and the counter's ink both sit *within* the
   plate's vertical span. A containment claim, not a copy of the centring formula.

⚠️ The counter's **width** is not asserted and cannot be: only the engine can measure rendered text,
which is why `hudFits` takes `counterW` as a parameter. Its width extends rightward, away from every
other element, so the inter-element claim is about its **origin** — the right edge is already
`hudFits`'s job. The plan flagged the same limitation from the e2e side: `hudHelpers.ts:129` returns
full rects for the plate and counter but gives `gearIcon` only `x`, `y`, `willRender`, so a live
spacing assertion would need icon dimensions added first. **Not done — this stays a unit check**,
which is where the layout function lives anyway.

### Red proofs — three, all against real `src/render/hud.ts` mutations *(C1, C12)*

| # | mutation in `src/` | result |
|---|---|---|
| 1 | `COUNTER_GAP` 24 → **0** | **3 failed / 30 passed** — *"only 0.0 px between the plate and the gear icon"*, at all three sizes with three different scaled floors |
| 2 | `COUNTER_GAP` 24 → **−40** | **3 failed / 30 passed** — *"the gear icon is drawn ON TOP of the health plate"* |
| 3 | gear icon un-centred (`plate.y + plate.h/2 − iconSize/2` → `plate.y − iconSize`) | **3 failed / 30 passed** — *"the gear icon rides above the plate"*, −48 against a floor of 24 |

Each reverted with `git checkout --`, the original count confirmed back at 1, and the file returns to
**33 passed** after every one. `git status src/` clean.

**Verified:** typecheck clean · `hud-layout.test.ts` **33 passed** (29 + 4: three sizes plus the C2
red proof) · full unit suite **167 files / 2490 tests** · `hud-layout.test.ts` at 381/400.

---

## Batch 10 — §4, the `play`-owned capture round: **one real defect, shipped and gated**

Driven with the `playwright-cli` skill against the dev server on the real GPU. Images and readings in
[`docs/evidence/session-tier5/`](../evidence/session-tier5/README.md), which is the scannable index the
plan asked for.

### 🔴 The finding: the page scrolled at every viewport, and the game lost 15 px

Found by **looking at a screenshot** — the lane's entire justification. Both scrollbars were present
in every capture, so I measured instead of guessing:

| viewport | client | document | canvas gaps (L/T/R/B) |
|---|---|---|---|
| 1920×1080 | 1905 × 1065 | 1920 × 1084 | 0 / 0 / **−15** / **−15** |
| 1280×720 | 1265 × 705 | 1280 × 724 | overflow both axes |
| 852×480 | 837 × 465 | 852 × 483 | overflow both axes |
| 2000×900 | 1985 × 885 | 2000 × 904 | 200 / 0 / **185** / **−15** |

**Two causes, one rule.** `index.html` sized `#game` at `100vw × 100vh`. `100vw` is the viewport
*including* the scrollbar gutter, so any vertical scrollbar makes the div wider than the client area,
which creates a horizontal scrollbar, which shortens the client area. And a `<canvas>` is
`display: inline`, so its line box adds ~4 px of descender room — which is what produced the *first*
scrollbar whenever FIT filled the height exactly.

Fixed with `width: 100%; height: 100%; overflow: hidden`. ⚠️ **No `canvas` rule** — `index.html`'s own
comment forbids a second writer of `canvas.style`, and `overflow: hidden` on the parent absorbs the
descender without one. After: 1920×1080 reads 0/0/0/0 and 2000×900 reads **200/200**.

### 🔴 Why five phases of gates missed it

- **Criterion 6.7** measures canvas centring at **1400×900** and **2000×900**, chosen *"deliberately
  NOT 16:9: at the game's own aspect ratio the canvas fills the viewport and any centring bug is
  invisible."* That choice is right for centring and is exactly what hid this: at 1400×900 the canvas
  is 787 px tall inside a 900 px div, which absorbs the descender. **The one aspect ratio the game is
  authored for was the ratio nothing looked at.**
- And 6.7 measured centring **inside the overflowing box**. Its own pillarboxed case read **200 px of
  gap on the left against 185 on the right** — visibly off-centre — and passed.

### The gate

`tests/e2e/phase-06-viewport.spec.ts` (new, 58 lines): at 1920×1080, 1280×720, 852×480 and 2000×900,
the document must not scroll and all four canvas edges must be inside the **client** area rather than
inside `#game`. Type asserted before value. Extracted to its own spec because
`phase-06-chrome.spec.ts` would have gone to 413/400; it matches exactly one project, re-verified by
`playwright-projects.test.ts`.

**Red proof:** restoring `100vw`/`100vh` → **4 failed**, all four viewports named. Re-applying the fix
→ **4 passed**. Counts read positively in both directions *(C1, C12)*.

### The other three readings

**852×480 — read, and it moved the question.** ⚠️ **`hudLayout`'s scaling path never runs in the
shipped game.** `UIScene` lays out from `this.scale.gameSize`, and under `FIT` with a fixed game size
that is **always 1920×1080**: measured live at 852×480 and at DPR 2, `layout.scale` is **1** and every
rect is identical to the design size. So the HUD is a 1920×1080 layout the browser downsamples to
44 %, not a layout computed for 852×480.

That is not a defect — but it means the multi-size unit tests (including `hud-layout.test.ts`'s
*"the counter stays legible at the smallest supported size"*, and §3d's three new size cases) describe
a configuration the game cannot currently enter. They are a **specification for a mode not in use**,
which is worth having and worth not mistaking for a live reading. 🔴 **Recorded, not acted on** —
changing the scale mode is a design decision and the owner's. Looking at the image: the HUD plate,
bar and gear counter are clean at 44 %; the controls banner is the marginal element, running edge to
edge over busy art at roughly 7 CSS px.

**DPR 2 — read, and it is fine.** The canvas backing store stays **1920×1080** at every DPR, so DPR 2
is a 2× upscale of the same buffer. With `pixelArt: true` deriving `antialias: false`, that is
*nearest-neighbour doubling of pixel art* — the one case where upscaling is crisp rather than soft.
`phase-06-dpr2.spec.ts` passed all along; now a human has looked.

⚠️ **2026-08-26 — an owner PLAY observation was added, and the item is STILL OPEN.** The owner
played the shipped game on this machine (173–174 Hz) and reported it looked good, with no judder
visible in ordinary play. That is real evidence from the only hardware that can show the effect, and
it is recorded in `devMotionProbe.ts`. **It is not the probe's outcome and does not close the item:**
*"nothing looked wrong while playing"* is consistent with NEITHER-ghosts AND with a STEPPED-only
ghost too subtle to catch without the side-by-side lanes — which is exactly why the lanes exist. The
probe freezes one pose so that pose cadence is excluded by construction; ordinary play excludes
nothing. What closes it is `?probe=1` on this display and a reading of which of the three outcomes
occurred.

✅ **2026-08-26, LATER — the probe was RUN and the outcome is `STEPPED ghosts, SMOOTH is clean`.**
The owner reported *"the bottom one that is smooth is what looks good."* Bottom is SMOOTH by
construction (`LANE.smoothY` 640 vs `steppedY` 300), so the reading is unambiguous: **outcome 1 of
three.** It survived the falsifier the Codex plan review proposed — one frozen pose, pose cadence
excluded by construction, only the position schedule differing. **Item 3.12 and the S.9 entry are
CLOSED.**

🔴 **CORRECTION, same day, before anything was built on it.** The first version of this entry said
the outcome *"authorises render interpolation"*. **It does not — interpolation ALREADY SHIPS.**
`src/render/interpolate.ts` landed in `01f2ae7` on 2026-08-14, the same day the probe was built
(`7ccc4ad`), and `renderAlpha` / `interpolatedPosition` are consumed unconditionally by
`gamePlayerDraw.ts` and `enemyLayer.ts`. Caught by reading the render path before planning the work,
which is the only reason no time was spent building a thing that exists.

What the run therefore establishes is better than what was claimed:

1. **The shipped behaviour is the SMOOTH lane**, confirmed by eye on hardware that can show the
   difference — the first such confirmation this project has had, every prior measurement having run
   on an 18–60 Hz headless harness that cannot exhibit the effect.
2. **The probe's on-screen captions had gone STALE for twelve days**, reading *"how the game moves
   today"* over the STEPPED lane and *"what interpolation would do"* over SMOOTH — written before
   `01f2ae7` and never updated. A dev overlay telling its reader the game has a defect it already
   fixed is worse than no overlay, and an owner read it in that state. Both captions repaired.
3. It dissolves the apparent contradiction: ordinary play looked good **because** interpolation
   ships, and STEPPED ghosted **because** it reproduces the old schedule deliberately.

**240 Hz judder — the below is the pre-run state, kept for the record.** The harness measured **173–174 Hz**, so this box is
the right substrate, and `probe-240hz-readout.png` shows `?probe=1` running. But the probe's three
outcomes are decided by **a pair of eyes** comparing the STEPPED and SMOOTH lanes, and no automated
reading can substitute. **Not closed.**

**Sentry coverage — recommendation: NOT a defect.** Measured per sentry: 3 of 9 lose shots, 13 of 96
standable spots, and **every lost spot has `dy` 616 or 712** with `dx` inside ±421 — the player six to
seven tiles below a sentry standing on a raised block, with several tiles of solid brick between them.
`sentry-level-05-x14304.png` shows it plainly. Those bolts used to pass through rock; the levels read
as authored for each sentry to cover its own ledge, which is the coverage that survived. The open
question in `sentry-coverage.test.ts` — *"whether the levels were authored assuming those shots
landed"* — is answered **no**, with pictures. ⚠️ It is a recommendation, not a unilateral close: the
final call is the owner's.

**Verified:** typecheck clean · `phase-06-viewport` **4 passed**, and **4 failed** on the mutation ·
port 5173 killed *(C13)*.

### ⚠️ Criterion 6.9 failed during this batch, and it is NOT this session's change

Running the whole `phase-06` project after the `index.html` fix, **1 of 34 failed**: 6.9's
`MAX_HUD_GPU_DELTA_MS` read **0.853 ms** against a 0.2 bound.

Settled the only way this project allows — a **same-session interleaved A/B**, `phase-06-perf` alone,
alternating the two versions of `index.html`:

| round | `100vw`/`100vh` | `100%` + `overflow:hidden` |
|---|---|---|
| 1 | 0.0051 ms · pass | 0.0051 ms · pass |
| 2 | 0.0041 ms · pass | 0.0036 ms · pass |

**Both arms identical, both passing, four runs.** The loaded reading is **200×** the isolated one, so
6.9 is measuring spec contention, not the HUD — the same diagnosis `phase-08-levels.md` recorded for
it, now with two orders of magnitude of separation instead of a factor of four. Appended there, since
that is where 6.9's instability record lives. **Not attributable to this session, and not fixed by
it.**

---

## Batch 11 — §5, the `brass-sentry/idle` re-shoot: **generated, rejected, restored**

Owner-approved after the mandatory pre-spend STOP, which showed the rendered command, the prompt and
the price. **$1.19 spent. Nothing adopted.**

### The seven-step transaction, as executed

**1. Schema re-run — no drift.** `genmedia schema bytedance/seedance-2.0/image-to-video` returns
`duration`, `resolution`, `aspect_ratio`, `generate_audio` and `end_image_url` with the enums
FAL-MODELS.md documents. `genmedia pricing` still returns **$0.014 / "unit"** with "unit" undefined,
so the price put to the owner was the `3.10` precedent — same endpoint, resolution and duration —
not the CLI's number.

**2. The dependency inventory, and it is bigger than the item said.** *"Budget a rebuild, not a
swap"* understates it: `idle` sources **three** scales.

| number | value | dependency on `idle` |
|---|---|---|
| slug `scale` | `0.28915663` | `192 / 664`, derived from `brass-sentry-idle-r2.mp4` itself |
| `fire.scale` | `0.57558748` | derived against **idle's tripod span of 205 px** |
| `death.scale` | `0.44081578` | the same 205 px landmark |

A new idle moves the tripod span, so both per-action scales must be re-derived against it or `fire`
and `death` silently resize — the exact 23.4 % defect the `3.10` re-shoot produced.

**3. Generated under a versioned candidate name.** `01a039b1-c187-7e73-a1e7-26a9c44d406b`, seed
882334275, 996 394 bytes, landed at `_generated/phase05/video/brass-sentry-idle-r3.mp4`. No shipped
artifact touched.

**4–5. It never reached the scale derive.** `assets:clips brass-sentry idle` **threw at G6**:

> `"brass-sentry/idle" frame 5 of 8 fails G6 edge bleed — subject mask comes within 3px of the frame
> on the top edge(s) (margins: left 70px, right 120px, top 0px, bottom 120px) — this reads as
> cropped, not merely packed. This clip must be re-shot, not packed.`

⚠️ **A `--derive-scale` run BEFORE the extraction printed the old numbers and looked like a pass** —
664 px, `0.28915663`, identical to the record. `printDerivedScale` reads `findSource(generated, …)`,
the *extracted strip*, not the clip; the strip was still `-r2`'s. Deriving before extracting reports
the previous take's measurement with the new take's name on it. **Extract first, always.**

**6. Adopted as one batch or not at all — so, not at all.** `clipJobs.mjs` and `clipAdoption.mjs`
reverted, `-r2` still the adopted clip, tree clean. The waiver was re-confirmed green:
`every-slug-loop-gate.test.ts` **11 passed**, `ceiling: 0.0138` untouched.

**7. Spend logged either way.** `docs/GENERATION-LOG.md` — **$53.86 of $55, $1.14 remains.**

### 🔴 What the $1.19 bought, which is worth more than the clip

**The prompt does not constrain the vertical axis at all.** `FRAME_MARGIN`
(`tools/gen/motionClauses.mjs:37`) reads *"stays entirely inside the middle 70 % of the **frame
width**, with clear green margin visible at both the **left and right** edges."* Top and bottom are
unconstrained. `-r2` passed G6 on the same words; `-r3` failed on the top edge. **This is variance on
an axis nothing asks about**, not a regression and not a prompt that got worse.

And the obvious repair is already recorded as tried and failed: the withdrawn centring clause in the
same file cost **$4.76** across four clips and came back *"a coin flip"* — added wording did not move
framing. So a `-r4` shot on re-worded prompt has a poor prior.

**Recommendation for whoever attempts it next: change the geometry, not the words.** The `-r3`
params record `"anchorPadded": false`. `tools/gen/padAnchor.mjs` exists, and this project's own
history says the padded round is the one that worked — `brass-courier/attack`'s `-r3` is logged as
*"the PADDED round: passed G6 cleanly."* Padding the anchor puts guaranteed green above the subject
in the start frame, which is a geometric guarantee rather than a linguistic request.

⚠️ **$1.14 remains and one generation costs ~$1.19.** The next re-shoot is a **ceiling decision**, not
a budget one, and needs the owner.

---

## Batch 12 — §10a, the owner round: **two narrowings my own §2a repair introduced**

Six briefs were dispatched — `voltagent-qa-sec:code-reviewer` ×2 and
`voltagent-qa-sec:performance-engineer` ×2 for **8.7**, `code-reviewer` ×2 for **9.2/9.3** — each pair
a checklist brief and an adversarial *"how could this be wrong?"* brief, launched together so brief 1's
findings could not reach brief 2 *(A7)*. ⚠️ **Stated as the log requires:** they are read-only, cannot
run Playwright, cannot plant a mutation in a real `src/` file, and every C1/C12 confirmation below is
this session's own work.

### 🔴 Found while preparing the round, in this session's own commit `c7800f0`

§2a resolved callee identity so the sim-mutator rule could grow 6 → 32 names without becoming
enforcement-by-name-collision. **It closed that widening and opened two narrowings in the same
stroke.** Measured against the production predicate, before and after the repair:

| fixture | before | after |
|---|---|---|
| `import { damagePlayer } from '../sim/worldDamage'` | 1 violation | 1 |
| `import { damagePlayer } from '../sim'` — **the barrel** | **0** | 1 |
| `import { damagePlayer as hurt } from '../sim/worldDamage'` | **0** | 1 |
| both at once | **0** | 1 |
| a local `damagePlayer` with no sim import | 0 | **0** ← no widening |
| `from '../simulacrum'` | 0 | **0** ← still a segment match |

**The barrel miss is the serious one.** `/(^|\/)sim\//` requires a trailing slash — and **`src/scenes/`
imports from the barrel**: `gameEmitters.ts`, `gamePlayerDraw.ts`, `goalLayer.ts`, `hudFade.ts`,
`hudGearFlyers.ts`, `hudGearPop.ts` and `PlaygroundScene.ts` all do `from '../sim'`, with
`src/sim/index.ts` re-exporting the mutators. So the pattern excluded the exact import style the code
under this rule actually uses. **Before identity resolution existed, the bare-name match would have
caught it** — which makes this a coverage regression introduced by a repair, the shape this project
keeps paying for.

The alias miss is the same shape one level down: the set recorded the **local** name (`hurt`) while
`SIM_MUTATORS` is keyed by the **exported** one (`damagePlayer`), so the two could never meet. The
docstring even described the mechanism — *"aliases resolve to the LOCAL name"* — and stopped short of
its consequence.

**Fixed:** `/(^|\/)sim(\/|$)/`, and `simImports` now returns a **Map** of local → exported name that
the call site resolves through. A namespace import (`import * as sim`) is still unreached — the callee
becomes a member expression, a different machine, and `src/` has no `import * as` today. **Recorded as
a narrowing, not silently absent.**

**Red proofs, both halves, each reverted with the count confirmed *(C1, C12)*:**

| mutation | result |
|---|---|
| pattern back to `/(^|\/)sim\//` | **1 failed / 13 passed** — *"a barrel import of a sim mutator was invisible to the rule"* |
| map back to `local → local` | **1 failed / 13 passed** — *"an aliased import of a sim mutator was invisible to the rule"* |

Both return to **14 passed** on revert. The fixtures are permanent, in `tween-sim-writes.test.ts`.

### 🔴 And a second catch, from a gate rather than from me

The full suite went red on `clip-adoption.test.ts`:

> *`brass-sentry-idle-r3.mp4` is on disk but neither declared nor knowingly superseded.*

§5's restore reverted `clipAdoption.mjs` **one step too far**. Step 6 of the transaction says restore
every shipped artifact *and log the discard* — and listing the rejected round in `SUPERSEDED_CLIPS`
**is** the log. Reverting the file erased that record while leaving the clip on disk. Now recorded,
with the G6 failure and the padded-anchor recommendation at the entry.

⚠️ Worth naming: this is the second time in one session that *restoring* was done less carefully than
*changing*. A revert is a change and gets the same verification.

**Verified:** typecheck clean · full unit suite **167 files / 2491 tests** (2490 + 1) ·
`tweenCallbacks.ts` at **383/400**, `tween-sim-writes.test.ts` at **269/400**.
