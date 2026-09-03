# QA log — Phase 6 — Collectibles, HUD, steampunk UI chrome

← [QA-LOG.md](../QA-LOG.md) · phase doc: [prd/phase-06-hud.md](../prd/phase-06-hud.md) ·
reviews: [plan](../reviews/phase-06-plan.md) · generations: [phase-06-hud](../generations/phase-06-hud.md)

Written 2026-08-15, on branch `phase-06-hud`.

> ✅ **PHASE 6 IS DONE — closed 2026-08-16.** Criterion 6.9's frame budget is measured, the owed
> list is resolved, and both Codex implementation reviews have run with every finding applied or
> recorded. See **§Session 2**.

## This log, split into parts

**This log reached 559 lines.** On 2026-09-03 session 2's journal moved to a flat sibling, per
CLAUDE.md §6 — `docs/qa/` splits into **flat siblings**, never a subdirectory, because
`tests/unit/file-size.test.ts` globs `docs/qa/*.md` non-recursively.

The criterion table and the vault-out stayed here: `docs-contract.test.ts` slices this file between
the phase heading and the vault-out heading and reads the criterion rows out of that slice, so
neither heading is free to move — and this paragraph deliberately does not quote either one
verbatim, because `between()` takes the FIRST match of its start marker.

| Part | What is in it |
|---|---|
| [02 — session 2, the owed list closed](phase-06-hud-02-session-2.md) | 2026-08-16: the ten owed items, 6.9's frame budget, and both Codex implementation reviews |
>
> ⚠️ **The paragraph below is the state on 2026-08-15 and is kept verbatim.** It is the question
> §Session 2 answers, and the record of a verdict that was wrong before it was right:
>
> > 🔴 **PHASE 6 IS NOT DONE AND MUST NOT BE REPORTED DONE.**
> >
> > **Criterion 6.9's frame-budget half is UNRUN.** The performance gate owner established that
> > criterion 5.11's existing spec provides no evidence about Phase 6's cost *by construction* — it
> > is a ratio between two halves of one page that vary only in enemy count, so any constant
> > per-frame cost divides out to ~1×. A HUD-vs-no-HUD interleaved A/B is owed and has not been run.
> >
> > This log said **"6.9 PASS, with an open coverage gap"** until Codex's implementation review
> > called it a blocker (C2), and it was right: a verdict that contradicts its own evidence one line
> > below is exactly what the second review exists to catch. *A phase with a failing or unrun
> > criterion is reported failing.* The remaining owed work is listed at the end.

## Phase 6 — Collectibles, HUD, steampunk UI chrome

### What this phase turned out to be

Not what the phase doc described. Three of the four things that took the most work were **defects
already shipped in `main`**, found while building on top of them:

- the player's health bar drew **154 of 156 px at 99 hp**, which is vault 6.4's own case on the bar
  that matters most;
- `GameScene.update()` **threw away the events of every tick but the last** in a multi-tick frame;
- the canvas was **centred twice** and sat 28 px off at any non-16:9 window.

None had a gate. All three are fixed, each with a watched red run.

---

### Criterion-by-criterion

<!-- gate-verdicts -->

| # | Criterion | Owner | Verdict |
|---|---|---|---|
| 6.1 | Pickup increments the counter; tabular figures | e2e | **PASS** — trajectory now asserted, §Session 2 item 2 |
| 6.2 | HUD pinned under pan **and** zoom | `qa-expert` | **PASS** — the flag read is now a command-buffer read, §Session 2 item 4 |
| 6.3 | Built from live game size; resize does not crop | `qa-expert` | **PASS** — UI camera now asserted at both sizes, §Session 2 item 3 |
| 6.4 | Bar never draws full below max | `qa-expert` | **PASS** |
| 6.5 | Legible at minimum supported resolution | play | **PASS** |
| 6.6 | Text contrast ≥ 4.5:1, WCAG 2.2 SC 1.4.3 AA, measured | `accessibility-tester` | **PASS — 9.47:1 to 11.87:1** |
| 6.6b | Catalog entry in `index.json` | — | **PASS** |
| 6.7 | Canvas not double-centred | `qa-expert` | **PASS — a real defect, fixed** |
| 6.8 | Chroma keyed cleanly; fill mask region correct | play | **PASS** |
| 6.9 | ≤400 lines; diff reviewed; adversarial; frame budget | `code-reviewer` ×2 + `performance-engineer` | **PASS — frame budget MEASURED 2026-08-16**, see §Session 2 |
| 6.10 | Codex plan review applied/recorded | — | **PASS — 8 findings, 8 applied** |
| 6.11 | Codex implementation review applied/recorded | codex | **PASS — ran TWICE.** Round 1 BLOCK: 3 applied, 1 partial, 1 recorded. Round 2 BLOCK: 5 applied, 1 recorded, and it found a live pre-existing defect now carried to Phase 7. [phase-06-impl.md](../reviews/phase-06-impl.md) |

---

### 6.1 — the counter, and the tween that had no gate

Gears are `gear: true` **points** in the collision object layer, parsed by `tiledEntities.ts` and fed
to `createWorld` from the same parsed level as hazards and enemies. Collection is **step 9c** of the
tick order — inserted, never renumbered, because that list is a contract Phase 5's combat timing and
Phase 4's frame rates are expressed against.

Tabular figures come from `fontFamily: 'monospace'`, zero-padded to three digits. Every digit in a
monospace face has the same advance width **by construction**, so the counter cannot jitter. A
bitmap font was the alternative and would have been a fal spend plus an asset pipeline for one
number — recorded as the deliberate trade.

🔴 **The plan made the tween cosmetic, which removed its only gate.** Codex's plan review (F3) caught
that before any code existed: criterion 6.1 names a collect→scoreboard tween, and a counter driven
straight from sim state satisfies every other assertion while nothing ever flies. The e2e now
asserts a flying object enters UIScene's display list and is gone once it lands.

**That test found a real off-by-one on its first run.** `gearsCollectedSince` used a strictly-greater
bound while the caller stores `world.tickCount` — the index of the *next* tick to run. A gear
collected during exactly that tick carries exactly that number, so **the first gear of every batch
produced no tween at all**. The counter still incremented, so nothing else in the suite could see it.
Renamed `gearsCollectedFrom`, bound made inclusive.

### 6.2 — pinned under pan and zoom

The HUD is a **parallel `UIScene`**, not a second camera.

**Deviation from vault 6.1, recorded rather than substituted.** The vault's remedy is a second
non-zooming camera with *reciprocal and exhaustive ignore lists* — an object missing from both
renders twice, one in both renders never. A parallel scene has its own display list and its own
camera, so there is nothing to ignore and therefore no list to get wrong as the HUD grows. The
hazard is designed out, not managed.

The e2e forces the world camera to zoom 2.5 and asserts screen position, size and
`willRender(camera)` on **all three** HUD objects — plate, health Graphics, counter. Checking the
plate alone was Codex F5: it lets the bar or the counter vanish while the criterion stays green.

⚠️ **Recorded limit (code-reviewer, brief 1, finding 10):** under the parallel-scene design there is
no code path by which zooming the world camera *could* move the HUD. The test is a genuine guard
against reverting to the old `setScrollFactor(0)` design — it would have failed against Phase 5's
HUD — but it **cannot go red for any change to the code as it stands**. It is a guard, not a
reproduction *(vault C3)*, and it is counted as one here.

### 6.3 — built from the live game size

`hudLayout(gameW, gameH, slot)` contains **no viewport literal**; `UIScene` reads
`this.scale.gameSize` and re-lays-out on `resize`.

⚠️ **Stated plainly:** the scale mode is `FIT`, so the game size is permanently 1920 × 1080 and
Phaser's cameras never resize in production. Vault 6.2's trap — *a second camera created at an
explicit size never auto-resizes* — **cannot currently bite**. What the unit tests bound is the
layout function, not a resize the engine performs *(vault 9.3)*.

Codex F6 pointed out that declaring the inertness is not the same as testing it, so the e2e also
drives a real `game.scale.resize(1280, 720)` through the live handle and asserts the layout followed
it. The qa-expert owner additionally read Phaser's own `CameraManager.onResize` and confirmed the
default per-scene camera satisfies its resize condition — so the guarantee holds by *not doing the
risky thing*, which is fine until someone does it. **No repo-level assertion pins that**, and that is
this criterion's open edge.

### 6.4 — the bar is gated on what is DRAWN

`healthBarFillWidth(99, 100, 156)` returned **154**. Two pixels of a 156 px bar is not a difference
anyone can see. Fixed as a **compression of the live range**, not a clamp on its top: below max, the
fill maps into the first `HUD_READY_FRACTION` (0.92) of the slot, so full width is reserved for
actually-full and the mapping stays monotone. Clamping instead would make two different health
values draw the same width — a second lie in place of the first.

One predicate, two consumers: `fillIsHonest` gained the rule as an **opt-in** fourth argument, so
three-argument callers keep the Phase 5 meaning exactly and criterion 5.7's enemy bars are
untouched. An enemy bar carries no readiness claim and is entitled to look full at 99 %.

🔴 **The first reproduction came back GREEN.** It asserted `fill < slotW`, and 154 < 156 is true —
"not literally the maximum" was never the claim. Rewritten against the compression ceiling and
pinned to the literal 154. *A reproduction that passes has not found the bug (vault C3).*

🔴 **And the same mistake was made a second time, in the test of the shipped wiring.**
`playerHudFill`'s test asserted `fill.w < HUD_SLOT.w`; on the 239 px slot the worst uncompressed
fill is 237, and 237 < 239, so **deleting `HUD_READY_FRACTION` from the production path left the whole
suite green**. The code-reviewer owner computed it. Every *other* test in that file passes the
fraction in explicitly, so they proved the parameter and never the wiring.

**Both halves of the criterion are gated.** The unit suite asserts computed widths; the e2e reads
**canvas pixels** in the bar slot at 99 hp on a real GPU (Codex F4 — the renderer turns a width into
a rectangle whose coordinates can all be wrong while the arithmetic is right).

That pixel test **measured nothing twice before it measured anything**, and both failures are written
into it:
1. `GameScene.update()` re-renders every frame, overwriting the synthetic 99 hp draw before the
   screenshot. It read the same luminance at 99 and 100 hp, identical to four decimals. `Game` is
   paused first now.
2. `page.screenshot({clip})` clips in **CSS** pixels while the layout is in the game's design space,
   and under `FIT` the canvas is scaled. Clipping with raw game coordinates sampled a region that
   was not the bar — a plausible constant at every health value.

It is an **A/B on the same pixels one hp apart**, not an absolute threshold: an absolute number
would be a ceiling fitted to whatever this art happens to look like.

### 6.5 — legible at the minimum supported resolution

**Both 1280×720 and 852×480**, per the user's decision. Driven headed on a real GPU with
`playwright-cli`; evidence at
[`docs/evidence/phase-06/min-res-852x480-1hp.png`](../evidence/phase-06/min-res-852x480-1hp.png).

The UI/UX owner raised two risks from the code. **Both were investigated by measurement rather than
argument *(vault C8)*, and both are refuted:**

- *"the 3 px `BAR_MIN_FILL_PX` sliver becomes ~1.3 CSS px and disappears"* — measured at 1 hp on an
  852×480 viewport: the sliver survives as **2 CSS px of amber at mean luminance 192–198 against a
  drained interior at 39–44**, roughly 5×. Visible.
- *"the gear icon was only validated at its authored 72 px, not the ~32 px it renders at"* — looked
  at, magnified: teeth and spoke holes still resolve.

### 6.6 — contrast, measured

**9.47:1 to 11.87:1**, against backgrounds sampled from the running game. WCAG 2.2 SC 1.4.3, Level
AA. The threshold is 4.5:1 for normal text; the 44 px bold counter also qualifies as *large* text
(≥18.66 px bold), whose threshold is 3:1. It clears both with a wide margin.

🔴 **The accessibility owner refuted a claim in the code's own comment.** It said the counter was
drawn over the HUD plate's dark background, "so the measurement is stable". It is not:
`hudLayout` places `counter.x` beyond `plate.x + plate.w`, so **the counter draws over the level**.
Corrected in place *(vault C9)*.

⚠️ **Recorded limit:** the measurement is therefore of the *shipped level's* background, not of a
guaranteed one. The 6 px `COUNTER_STROKE` is what holds the contrast when the player walks in front
of something pale, which makes it load-bearing rather than decorative. A level with a bright
background could lower the ratio, and nothing gates that.

### 6.6b — catalog entries

`hud-health` and the new `gear` are both in `index.json`'s `images` array.
`tests/unit/shipped-gear.test.ts` and `tests/unit/shipped-hud.test.ts` assert both, because
`catalog-completeness.test.ts` globs `characters/` only and would not notice an orphaned object
sprite.

### 6.7 — the canvas was centred twice

**A real defect, present since Phase 1.** `index.html` gave `#game` a flex centre while `config.ts`
sets `autoCenter: CENTER_BOTH`, which writes CSS **margins** onto the canvas; a flex parent then
centres the margin box and the two compose.

Measured on this machine at 1400 × 900:

| | top | bottom |
|---|---|---|
| with the flex rule (the defect) | **85 px** | **29 px** |
| without it (fixed) | 56 px | 57 px |

28 px off — *"about a quarter of the leftover gap"*, exactly as the vault note predicts. It survived
five phases because it looks almost right, and because at the game's own 16:9 aspect ratio the
canvas fills the window and the bug is invisible. The e2e therefore tests at **1400 × 900
deliberately**.

The file's own comment already said the ScaleManager owns `canvas.style`. Flex centring was a second
writer of exactly that, and the comment did not stop it — *a comment is not enforcement (vault C9)*.

### 6.8 — chroma key and the fill mask

Inspected on a real GPU. The gear's four spoke cut-outs are holes the chroma shows through, so a
partial key leaves green **inside** the sprite; `shipped-gear.test.ts` asserts **zero** surviving
chroma pixels and reads the alpha **channel**, never `mode === 'RGBA'` *(vault 4.12)*.

Fill mask verified by driving the render at 50 hp and looking:
[`hud-50-percent.png`](../evidence/phase-06/hud-50-percent.png). The drained rectangle sits inside
the bezel, on the amber only — not over the brass frame or the end cap.

### 6.9 — size, diff, adversarial, frame budget

**File size.** `GameScene.ts` went 459 → 471 and was then **split to 385** on the user's decision:
the dev overlays, dev fixtures and dev scene toggles moved to `gameDev.ts`, with every
`import.meta.env.DEV` guard still **inside** its own body — which is what keeps the scene-key
literals out of `dist/`, and `verify-dist.mjs` confirms it. Four further splits were forced by the
same ceiling: `tiledEntities.ts`, `promptWorld.mjs`, `buildChrome.mjs` + `rawSource.mjs`, and
`phase-06-chrome.spec.ts`. **No file in the repository now exceeds 400 lines**, for the first time
since Phase 4.

**Frame budget — 🔴 UNRUN. This is what makes the phase not done.** The performance owner's substantive
finding is that **criterion 5.11's spec provides no evidence about Phase 6's cost, by construction**:
it is a ratio between two halves of the same page that vary only in enemy count, and gears are
present and unchanged in both. Any *constant* per-frame cost — which is exactly the shape of
`UIScene.render()` and `GearLayer.sync()` — appears in both the numerator and the denominator and
divides out to ~1×. **6.9's frame-budget half must not be reported as covered by "5.11 still
passes".** A Phase 6 HUD-vs-no-HUD interleaved A/B is owed.

Two cheap findings were applied: `setText` and a `.filter()` ran every frame regardless of whether
anything changed, and both are now guarded on a changed count — the same early-out discipline
`GearLayer.sync()` already used.

---

### 🔴 A false green the suite still cannot catch

`tests/unit/shipped-gear.test.ts` imported a constant from `gearLayer.ts`, which imports Phaser,
which cannot load in the node test environment. **The file failed to collect and vitest reported
`PASS`.** Six assertions vanished; nothing went red. It was found only because the suite total
dropped 1218 → 1213 between two runs.

The constant moved to the engine-free `render/hud.ts` and the tests are back. **The hole is not
closed:** nothing asserts that every `tests/unit/*.test.ts` file contributes at least one test, so
any future file that fails to import is silently worth zero. Recorded here rather than fixed at the
end of a long session *(vault C11)* — it needs a suite-level gate, and it is the highest-value thing
a Phase 7 could add.

### Findings recorded, not fixed

| From | Finding | Reason |
|---|---|---|
| code-reviewer b1 #10 | 6.2's zoom test cannot go red under the current design | It is a guard against reverting, not a reproduction. Stated in the criterion above rather than deleted |
| code-reviewer b1 #11 | `collectGears`/`spawnGears` exported from `sim/index.ts` but unused outside `src/sim/` | The barrel exports the module's surface; harmless |
| code-reviewer b1 #12 | `hud.ts` defines a local `Rect` duplicating `sim/types.ts` | Deliberate: one is screen space, one is world space. Nothing enforces the distinction, which is the actual gap |
| code-reviewer b1 #13 | `GEAR_ICON_PX = 72` is documented as `GEAR_BOX.w × RENDER_SCALE` but hardcoded, a third copy | `shipped-gear.test.ts` catches drift on the shipped PNG, which is where it would hurt |
| code-reviewer b1 #14 | Both Phase 6 specs moved to the headed GPU project; 6.1's assertions would run fine headless | Splitting one spec across two projects to save a window is not worth the config complexity |
| code-reviewer b1 #15 | `UIScene.render()` early-returns before `built` without advancing `lastGearTick` | Bounded and benign: at worst one tween on the first built frame |
| performance b1 | Whether a second scene adds a full render pass / GPU batch flush | Needs the `gpuTimer` harness pointed at the HUD; part of the owed A/B above |
| ui-ux b1 #2 | 3-digit zero padding may read as placeholder if no level exceeds 99 gears | `level-01` ships 7. Kept: stable width is what criterion 6.1 turns on, and Phase 8 adds levels |
| ui-ux b1 #3 | The collect tween lands at alpha 0.25 with no arrival punctuation on the counter | Polish, not a defect. Worth a Phase 9 pass |
| ui-ux b1 #5.3 | Phaser `Text` centres on a full ascent+descent box; digits have no descenders, so the counter may sit a few px high | Below the threshold anything measured could confirm; noted for a Phase 9 look |

---

## Vault-out — Phase 6

Whether the two-camera ignore-list rule bit us: **it did not, because the rule was designed out
rather than followed.** A parallel scene has no ignore lists to get wrong. That is the reusable
lesson — vault 6.1's remedy is a *mitigation for a second camera in one scene*, and the cheaper move
is not to have one.

Whether the drawn-vs-true gate caught a real case: **yes, twice, and both times it was the weak
assertion that failed first.** `fill < slotW` passed at 154 of 156, and then again at 237 of 239 in
the wiring test. The lesson is sharper than "assert on what is drawn": **"not the maximum" is never
the claim — "a player can see it is not full" is**, and only a threshold expressed against the
compression ceiling says that.

How the generated HUD sheet behaved through chroma keying: cleanly, on the first take, with a key
measured from its own border. The expensive part was not the keying — it was that the re-shoot came
back **413 × 128 where the retired plate was 305 × 128**, because the model is not seed-deterministic,
which silently invalidated every constant measured off the old one. `shipped-hud.test.ts` now pins
the plate size so a re-shoot cannot land in silence again.

Full generation detail: [`docs/generations/phase-06-hud.md`](../generations/phase-06-hud.md).


---

## ✅ Owed before Phase 6 can be reported done — RESOLVED 2026-08-16

⚠️ **Kept verbatim as the input to session 2, not edited into agreement with the outcome.** Every
item below is resolved in §Session 2 — eight fixed, item 5 **refuted by measurement**, item 10's DPR
arm deferred with a reason. Read this list as the question and §Session 2 as the answer.

1. **Criterion 6.9's frame budget (blocker).** A HUD-vs-no-HUD interleaved A/B on `chromium-gpu`,
   built on `perfSampler.ts`, measuring the constant per-frame cost that 5.11's enemy-count ratio
   structurally cannot see. Until it runs, 6.9 is unrun and the phase is failing.
2. **Codex C3 — the tween's trajectory.** The test proves a flyer appears and is destroyed; it does
   not prove it travels toward the counter. Deleting the tween's `x`/`y` targets would still pass.
3. **Codex C4 / qa-expert b1 — the UI camera's viewport is never read.** The no-cropping guarantee
   currently holds because no explicit camera is created, which is an emergent property rather than
   an assertion. A regression that added one would go unnoticed.
4. **Codex C5 — `phase-06-chrome.spec.ts`'s "would actually be drawn" is still a flag read.** The
   sibling test in `phase-06-hud.spec.ts` was converted to read the Graphics command buffer; this
   one was not.
5. **The suite-level false green.** Nothing asserts that every `tests/unit/*.test.ts` file
   contributes at least one test. A file that fails to import is silently worth zero and the suite
   reports PASS — this phase lost six assertions that way and found it only by noticing a total.
6. **code-reviewer b2 #6 — nothing stops `UIScene` when `GameScene` exits to a dev scene.** Only
   `BootScene.refuseToRoute` stops it. Dev-gated today, so no shipped path hits it; the first Phase 7
   level transition or pause screen inherits a frozen HUD. A `SHUTDOWN` handler on `GameScene` is
   the symmetric fix.
7. **code-reviewer b2 #8 — the "no gear buried in a solid" check lives in a test of `level-01`, not
   in the validator.** A hand-authored gear inside the floor of a *future* level boots fine.
   `describeGearProblem` is the right layer; the bounds check already moved there this phase.
8. **code-reviewer b2 #9 — every Phase 6 spec's first `readHud` races `UIScene.create()`.** It works
   because the CDP round-trip outlasts one Phaser step. `window.__game.ready` is set in
   `GameScene.create()` and no longer covers the HUD.
9. **qa-expert b2 #4 — both 6.4 e2e tests bypass the real per-frame call site.** They pause `Game`
   and call `ui.render()` directly. If `renderHud()` were dropped from `GameScene.update()`, the
   player's real bar would freeze in production and every 6.4 test would still pass — the same shape
   as the Phase 5 defect this file's own header describes, one call site over.
10. **qa-expert b2 #6 — 6.7 is only asserted on a letterboxed viewport.** A pillarboxed one
    (wider than 16:9) and a `deviceScaleFactor` other than 1 are both unexercised, and `autoRound`
    floors CSS sizes.

### Brief 2 coverage, stated honestly — superseded

⚠️ **The shortfall below was closed on 2026-08-16.** All three missing brief 2s ran; see §Session 2's
gate-owner table. Kept because a gate's history is part of its result.

*(vault A7 — two briefs per agent-owned gate, brief 1's findings withheld from brief 2.)*

| Owner | Brief 1 | Brief 2 |
|---|---|---|
| `code-reviewer` | ✅ ran, 15 findings | ✅ ran, 10 findings |
| `qa-expert` | ✅ ran, 4 criteria | ✅ ran, 7 findings |
| `accessibility-tester` | ✅ ran, 6.6 measured | ❌ **NOT RUN** |
| `performance-engineer` | ✅ ran, 6 findings | ❌ **NOT RUN** |
| `ui-ux-tester` | ✅ ran, 5 findings | ❌ **NOT RUN** |

Three brief 2s were not run, and A7 is explicit that the second brief is not optional and is not a
re-run of the first. Recorded as a gate shortfall rather than quietly omitted.
