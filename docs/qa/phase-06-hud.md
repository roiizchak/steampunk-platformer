# QA log — Phase 6 — Collectibles, HUD, steampunk UI chrome

← [QA-LOG.md](../QA-LOG.md) · phase doc: [prd/phase-06-hud.md](../prd/phase-06-hud.md) ·
reviews: [plan](../reviews/phase-06-plan.md) · generations: [phase-06-hud](../generations/phase-06-hud.md)

Written 2026-08-15, on branch `phase-06-hud`.

> ✅ **PHASE 6 IS DONE — closed 2026-08-16.** Criterion 6.9's frame budget is measured, the owed
> list is resolved, and both Codex implementation reviews have run with every finding applied or
> recorded. See **§Session 2**.
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

## Session 2 — 2026-08-16 — the owed list, closed

The ten items in *🔴 Owed before Phase 6 can be reported done* below were this session's input. All
ten are resolved: eight fixed, one **refuted** (item 5), one half-deferred with the reason recorded
(item 10's DPR arm). Criterion 6.9's frame budget — the blocker — is measured.

### 6.9 — the frame budget, measured at last

A new spec, `tests/e2e/phase-06-perf.spec.ts`, on `chromium-gpu`. Three interleaved HUD-on/HUD-off
pairs of 180 ticks in one page, after taking **real hazard damage** so the bar actually draws — at
full health `drawHealth` computes `spentW === 0` and queues nothing, so an idle HUD is nearly free
and measuring it answers the wrong question.

Renderer asserted not to be a software rasteriser before any number is trusted:
`angle (nvidia, nvidia geforce rtx 4080 (0x00002704) direct3d11 vs_5_0 ps_5_0, d3d11)`.

| run | work on → off | work ratio | GPU on → off | GPU ratio |
|---|---|---|---|---|
| 1 | 0.500 → 0.400 ms | 1.250× | 0.186 → 0.183 ms | 1.017× |
| 2 | 0.500 → 0.400 ms | 1.250× | 0.173 → 0.171 ms | 1.012× |
| 3 | 0.500 → 0.400 ms | 1.250× | 0.201 → 0.198 ms | 1.016× |
| 4 | 0.600 → 0.600 ms | 1.000× | 0.199 → 0.199 ms | 1.000× |

**The whole HUD costs ~0.1 ms of main thread and ~0.003 ms of GPU per frame — 0.6 % and 0.02 % of a
16.67 ms frame at 60 Hz.** Bounds were set *after* these runs, never before: `MAX_HUD_WORK_RATIO 2`,
`MAX_HUD_GPU_RATIO 1.25`, `MAX_HUD_WORK_DELTA_MS 1`, each justified in `perfBudget.ts`.

Run 4 is the important one. At 0.1 ms quantisation the ratio can legitimately read **1.000×**, which
is indistinguishable from *the HUD is not drawing* — so the ratio alone could never have carried this
criterion. That is why the correctness guard exists, and why it is asserted at both edges of every
window.

**Red runs — watched, and recorded here because a second reader could not otherwise verify them.**
*(C1; their absence was a `performance-engineer` finding.)*

| Mutation | Result |
|---|---|
| Queue `drawHealth`'s rectangle **400×** | GPU ratio **1.279× > 1.25** → RED |
| Main-thread burn inside `drawHealth` | work ratio **4.000× > 2.0** → RED |
| `barFill.setVisible(false)`, still queuing | correctness guard → RED |
| Leave `UI` running in the "off" arm | **PASSES at ~1.0×** — the mutation first proposed, and the reason the guard is not optional |

**Stated limits** *(vault 9.3)*: `GearLayer.sync()` and `GameScene.update()`'s `renderHud()` call
survive both arms and divide out, so this measures `UIScene`. The 15-tick collect tween is a
transient a 180-tick median cannot see. `SAMPLE_TICKS` is inherited from Phase 5's sentry-volley
rationale and has no HUD-specific derivation.

### 🔴 Item 5 — the "false green the suite cannot catch" DOES NOT EXIST

The recorded cause was that a unit-test file failing to import contributes zero tests **while vitest
reports PASS**. Codex predicted from `@vitest/runner`'s source that this was wrong. It is. Both
shapes were reproduced:

| Probe | Result |
|---|---|
| A test file importing a Phaser-touching module | `ReferenceError: window is not defined` · `Test Files 1 failed \| 90 passed` · **exit 1** |
| A test file that imports cleanly but declares no tests | `No test found in suite` · `Test Files 1 failed \| 90 passed` · **exit 1** |

Revert confirmed: probe deleted → `90 passed`, `1224 passed`, exit 0 *(C12 — content changed AND the
failed-file count dropped 1 → 0)*.

**What actually happened in session 1 was a misread, not a runner hole.** The `Tests N passed` line
stays green and merely *drops* (1218 → 1213); the redness lives on the `Test Files` line, in a
`Failed Suites` block, and in the exit code. **No gate was built** — a meta-test asserting what
vitest already asserts is decoration. The original section below is left standing, wrong, with this
correction pointing at it, because deleting it would erase the evidence that it was checked.

### The other owed items

| # | Item | Outcome |
|---|---|---|
| 2 | Tween never observed flying | **Fixed.** Flyer x/y sampled once per rAF; asserts ≥5 samples, a genuinely intermediate position, monotonic approach, arrival within 25 % of the start distance. Red-run: deleting the tween's `x`/`y` → *"ended 816.9px from the counter, having started 816.9px away"* |
| 3 | UI camera viewport never read | **Fixed.** `uiCamera` added to `HudProbe`; asserted at the design size **and** after a real `scale.resize`. The red run found the first version incomplete — a camera pinned to the *resize target* passed — so the before-check was added and both variants now fail |
| 4 | `willRender` on a Graphics | **Fixed.** Reads the command buffer after forcing a damaged render. ⚠️ It must be damaged: at boot the correct length is **zero**, so reading it there would be a false red |
| 6 | Nothing stopped `UIScene` | **Fixed on the third attempt** — see below |
| 7 | Gear-burial check lived in a test | **Fixed.** Moved into `describeGearProblem`, gated by `gear-inside-solid.fixture` (one field changed from the shipped level: gear 11 y 1872 → 2016). Disabling the rule fails exactly that one case |
| 8 | `readHud` raced `UIScene.create()` | **Fixed.** `waitForHud` inside `readHud` |
| 9 | 6.4 bypassed the real call site | **Fixed.** A test that takes real hazard damage **twice**, never pauses, and asserts the drawn width grew. Deleting `renderHud()` from `update()` fails it while **both synthetic 6.4 tests still pass** — which is the gap. Recorded honestly: 6.1's counter tests also catch that mutation, so the call site had *incidental* coverage; criterion 6.4's own evidence did not |
| 10 | 6.7 only letterboxed | **Half fixed.** Pillarboxed 2000×900 added, plus a canvas-aspect assertion — equal gaps alone pass a wrongly *sized* canvas. **DPR ≠ 1 deferred to Phase 9**, recorded |

### Item 6 took three attempts, and review caught the first two, not the tests

1. **`GameScene` SHUTDOWN → `scene.stop('UI')`.** Passed the dev-toggle test. **Both** code-reviewer
   briefs independently traced it from Phaser's own sources: `SceneManager.start('Game')` on a
   running Game calls `sys.shutdown()` synchronously, so the handler only *queues* the stop;
   `GameScene` has no `preload`, so `create()` runs in the same call and `attachHud`'s `isActive`
   guard skips the launch; the queue then drains and stops the HUD. **A running game with no HUD** —
   precisely the Phase 7 level transition the fix was written for. Reproduced in a browser, then
   discarded.
2. **`attachHud` → `stop` then `launch`.** Fixed the restart, broke the dev-toggle teardown.
3. **`UIScene.update()` retires itself once `GameScene` is gone.** A condition re-evaluated every
   frame, so there is no ordering to get wrong. First written as `!this.scene.isActive('Game')`,
   which retired the HUD the moment criterion 6.4's spec **paused** `Game` — `isActive` is
   `status === RUNNING`, and a pause screen would have hit the same wall. Keyed on
   `status >= Phaser.Scenes.SHUTDOWN` instead.

Both discarded attempts are recorded rather than quietly replaced. The lesson is that HUD lifetime
expressed through scene-event ordering is a trap; the durable form is a condition.

### Gate owners — eight agent runs this session, two briefs each

| Owner | Brief 1 | Brief 2 |
|---|---|---|
| `code-reviewer` | ✅ session 1, ✅ new diff — **BLOCK** | ✅ session 1, ✅ new diff — **BLOCK** |
| `qa-expert` | ✅ session 1, ✅ 6.3/6.4/6.7 | ✅ session 1, ✅ 6.3/6.4/6.7 |
| `accessibility-tester` | ✅ session 1 | ✅ **run this session** |
| `performance-engineer` | ✅ session 1, ✅ on the new measurement | ✅ **run this session** |
| `ui-ux-tester` | ✅ session 1 | ✅ **run this session** |

**The A7 shortfall recorded in session 1 is closed.**

### Findings — applied, or refused with a reason *(C11)*

| From | Finding | Disposition |
|---|---|---|
| code-reviewer b1+b2 | The SHUTDOWN handler deletes the HUD on a Game restart | **APPLIED** — reproduced, then redesigned (above) |
| code-reviewer b1 | `phase-06-perf.spec.ts` over 400 lines, named in no QA log | **APPLIED** — the drawn-state probe moved to `hudHelpers.ts`, beside the other HUD probes. Nothing in the repo exceeds 400 |
| code-reviewer b2 | `playwright.config.ts`'s `6-[a-z]+` matches no digit or hyphen, so `phase-06-hud-2.spec.ts` would silently return to SwiftShader | **APPLIED** — `6-[a-z0-9-]+` |
| code-reviewer b1+b2 | `releaseAggro` setting `attackCounter = attackCooldown` **refunds the whole cooldown**, re-arming a scavenger instantly on the player's death | **APPLIED** — `Math.max(attackCounter, SCAVENGER_ATTACK_TICKS)` ends the swing without refunding the cooldown. R5 asked only that the window end |
| performance b1+b2 | The correctness guard is satisfied by an **invisible** HUD: `willRender` ignores alpha, and `fillStyle(colour, 0)` still fills the command buffer | **APPLIED** — all four objects now answer three questions (`willRender`, `alpha`, and for the bar the command buffer). Red-run confirms |
| performance b1 | `barFill.willRender` was never called; `gearIcon` had no drawn-state check at all | **APPLIED** — both added |
| performance b2 | `MAX_HUD_WORK_DELTA_MS = 2` leaves room for a 10–19× regression | **APPLIED** — tightened to 1.0 ms. Not tighter: at 0.1 ms quantisation a delta measured at 0.1 ms can legitimately read 0.0–0.2 ms |
| performance b1 | The red runs backing the bounds were recorded nowhere a second reader could check | **APPLIED** — the table above |
| qa-expert b2 | 6.4's real-damage test reads only the rect's **width**, never its x/y — the right size in the wrong place passes | **APPLIED** — `expectInsideSlot` asserts containment after both hits |
| qa-expert b1 | The claim *"only the pillarboxed case catches the double-centring defect"* | **CORRECTED.** With flex on `#game` — the historical defect — **both** directions fail, at 56 px and 200 px. Only the `html, body` variant is caught by pillarbox alone. The pillarbox case still earns its place; the original claim was measured against a different mutation site |
| accessibility b2 | Health-bar state is colour-only and the gate never names SC 1.4.11 | **MEASURED, and it passes.** Drained `#241c18` against the shipped lit bar `#d6801a`, sampled from `health-assembly.png` = **5.55:1**, over the 3:1 requirement. The gate's scope gap is real; the product is unaffected |
| accessibility b2 | The counter's contrast was measured only against dark backgrounds | **CONFIRMED and quantified.** Fill `#f7e3b8` is 15.04:1 on near-black, **3.13:1 on mid-grey, 1.13:1 on bright sky**. Already recorded as a limitation; now it has numbers. Carries to Phase 8 with the levels that could trigger it |
| accessibility b2 | Stroke pixels may inflate a blended measurement against fill-only | **RECORDED, unresolved** — brief 1's exact sampling method is not written down. Re-measure fill-only when Phase 8 adds levels |
| ui-ux b2 | `addHelpBanner` uses a literal `18px`, never scaled — ~8 physical px at 852×480, below the project's own ~11 px legibility floor | **RECORDED, not fixed.** Verified locally. Outside the four HUD objects and pre-existing; 6.5's evidence never covered it. **Phase 9**, and it should move into `UIScene` |
| ui-ux b2 | That same banner uses `setScrollFactor(0)` on `GameScene` — vault 6.1's exact pattern, re-created for a different element | **RECORDED, not fixed.** Verified. Harmless only because `CAMERA_ZOOM` is 1. The same Phase 9 move fixes both |
| ui-ux b2 | Generic `monospace` resolves per browser profile and OS, so 6.1's tabular-figures gate proves a property of one machine | **RECORDED.** Real, and unfixable without shipping a font — a fal spend and an asset pipeline for one number. The trade is already documented in `UIScene` |
| ui-ux b2 | A burst of collected gears produces overlapping identical flyers | **RECORDED** — Phase 9, with the other tween polish |
| code-reviewer b2 | The gear-burial check misses a gear on the **seam between two floor rects**, and on faces and corners | **RECORDED, not fixed.** Real and well argued: strict inequality leaves a gear on a shared edge inside neither rect, and a 96 px grid makes that the *default* authoring outcome. The fixture covers the single-rect interior case only. **Phase 8 owns it** — that is the phase authoring multi-rect floors, and the fix wants `GEAR_BOX` overlap rather than a centre-point test |
| code-reviewer b2 | The refusal test cannot go red for the line it names — `?breakAsset=corrupt` is a fresh page, so `UI` was never launched | **RECORDED, not fixed.** Correct. The red-able version needs a *restart* into a refusal; `phase-01-boot.spec.ts:324-333` already has the apparatus. Carried to Phase 7 |
| code-reviewer b2 | `waitForHud`'s `plate !== undefined` clause can never be the failing clause, and three call sites reach `hudObjects()` without it | **RECORDED.** The `isActive` clause is load-bearing; the extra one is harmless. The unguarded call sites are worth closing in Phase 7 |
| code-reviewer b2 | The trajectory test's `path.length >= 5` is a wall-clock claim inside a fixed 2500 ms window | **RECORDED** — watched across many runs this session without flaking; revisit if it ever does |
| qa-expert b2 | 6.3 samples a continuous resize function at two points; 852×480 is never checked against `uiCamera` | **RECORDED** — a third point would not change the shape of the argument. Phase 9 |
| qa-expert b2 | The synthetic 6.4 renders rewind `lastGearTick` to 0 on the live `UIScene` | **RECORDED** — real cross-contamination, but inert; each test gets a fresh page |

### Codex implementation review, round 2 — findings and disposition

Run 2026-08-16, `--wait --resume`, after the eight gate-owner runs. Verdict **BLOCK**; every finding
below is applied or refused with a reason. Report and triage: [reviews/phase-06-impl.md](../reviews/phase-06-impl.md).

| # | Finding | Disposition |
|---|---|---|
| 1 | Phase 6 marked done while the QA log's own banner and 6.11's row still said NOT DONE / BLOCK | **APPLIED** — banner and 6.11 row corrected; this section is the second review's record |
| 2 | 6.9's PASS is built entirely on **ratios**, and a ratio cannot see cost that is identical in both arms — `GearLayer.sync()` and the `renderHud()` call divide out | **APPLIED.** An **absolute** bound added: the whole HUD-on frame must cost under a third of a 16.67 ms frame. Nothing cancels out of it. The transient-tween limit remains stated |
| 3 | The teardown predicate gets **SLEEPING** wrong — Phaser neither updates nor renders a sleeping scene, so the HUD would float over a game that is not on screen | **APPLIED** — threshold moved from `>= SHUTDOWN` to `>= SLEEPING`. PAUSED still renders, so it is correctly kept |
| 4 | The refusal lifecycle test cannot go red for the line it names | **APPLIED — and it found a real bug, now FIXED.** See below |
| 5 | The correctness guard accepts a bar that paints nothing: deleting `fillRect` while leaving `fillStyle` keeps the buffer non-empty and the alpha healthy | **APPLIED** — `barWidestRect` reports the widest rectangle actually filled, and is asserted > 0 |
| 6 | A restart preserves an in-flight collect flyer; the test checks only liveness and child count | **RECORDED** — bounded and cosmetic; the flyer destroys itself on completion |

### ✅ A live defect found by closing finding 4 — refusal AFTER a successful boot — FIXED

The old refusal test navigated to `/?breakAsset=corrupt`, a **fresh page**, where `GameScene` never
runs and the HUD is never launched — so `isActive('UI') === false` regardless of what
`BootScene.refuseToRoute` does. Deleting its `scene.stop('UI')` left the test green. `BootScene`'s
own comment says the stop matters *"only on a RESTART"*, and nothing tested a restart.

A restart-based test was written. **It fails, and the failure is real:** on a refusal that follows a
successful boot, the HUD is never stopped, and the console carries
`TypeError: Cannot read properties of null (reading 'glTexture')` — the render loop throwing on
destroyed textures, which leaves the HUD **frozen on screen** rather than merely un-stopped.

**Root cause, and it is not where the stop was.** `refuseToRoute` stops `Game` and `UI` correctly —
but it runs at the *end* of a boot attempt, and on a **restart** the play scenes keep rendering all
the way through the reload that precedes it. `BootScene.preload` deliberately drops the cached
catalog and textures, so a still-rendering `GameScene` reaches a freed texture and throws. Once the
render loop throws, nothing further runs — including `refuseToRoute`'s own stops — and the HUD is
left frozen over the error screen.

**Fixed** by stopping `Game` and `UI` in `BootScene.init()`, before any loading begins. A no-op on a
fresh boot, because stopping a scene that was never started does nothing, so the normal path is
unchanged and the restart path is safe by construction. The test is now a live gate, not a `fixme`:
`phase-06-lifecycle.spec.ts` runs 5/5, and the full suite is green either side of the change
(1224 unit · 48 headless · 24 GPU).

### Carried debt from Phases 4 and 5 — triaged *(item 12)*

Neither closes criterion 6.9 nor the owed list; this is user-authorised scope, recorded as such.

| Item | Verdict |
|---|---|
| **4.10, 4.12** | **Already closed PASS** in Phase 5 session 8. The PRD's Phase 4 row listing them open is **stale** — corrected this session |
| **4.16** | **CLOSED.** It read *"`GameScene.ts` at 459 lines is the only file left over 400"*. It is 392, and a sweep of `src/`, `tools/`, `tests/` finds nothing over the limit |
| **4.2b** | **Owner decision, not work.** A $6.39 invoice overrun with an ordering violation no later measurement can undo. Surfaced, not decided |
| **4.27** | **Deferred.** Needs a pre-generation anchor-geometry gate; belongs to the next generating phase |
| **R1** | Still true — 5.3's flap test cannot go red for any input |
| **R2, R3** | Still true — the 400-line ceiling is a count, not a membership set, and its globs have blind spots |
| **R4** | Still true — the frame-0 gate samples a patroller that cannot flap |
| **R5** | **FIXED this session**, in the narrower form both code reviewers asked for |
| **R6** | Still true — `attackRange`/`attackCooldown` have no Gym knob |
| **R7** | Still true — 5.16 is vacuous for the sentry |
| **R8** | Still true, and structural — brief 1's findings are quoted inside the file brief 2 is sent to attack |

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
