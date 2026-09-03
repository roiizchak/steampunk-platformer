[← Phase 6 QA log index](phase-06-hud.md) · [QA-LOG index](../QA-LOG.md) · [phase doc](../prd/phase-06-hud.md)

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
| ui-ux b2 | `addHelpBanner` uses a literal `18px`, never scaled — ~8 physical px at 852×480, below the project's own ~11 px legibility floor | **RECORDED, not fixed** at the time. **Now fixed** — the tier-5 pass took it to 44 px scaled, and session `hud-and-pits` settled it at **43**, one step off the 42.06 WCAG floor. `addHelpBanner` no longer exists |
| ui-ux b2 | That same banner uses `setScrollFactor(0)` on `GameScene` — vault 6.1's exact pattern, re-created for a different element | **RECORDED, not fixed** at the time. **Resolved differently** — it did NOT move into `UIScene` (which names Phaser as a value, so nothing in it can get a behavioural draw-path gate). Session `hud-and-pits` gave it its own type-only layer, `src/scenes/helpBannerLayer.ts`, and reconciled `setScrollFactor(0)` against the owning camera's offset rather than removing it |
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

