# Codex implementation review — Phase 6 (Collectibles, HUD, steampunk UI chrome)

← [reviews index](../PRD.md#the-codex-review-protocol) · plan review: [phase-06-plan.md](phase-06-plan.md) ·
QA log: [qa/phase-06-hud.md](../qa/phase-06-hud.md)

**Review 2 of 2.** Run 2026-08-15, `/codex:rescue --wait --resume`, on the `phase-06-hud` diff after
the agent gate owners had run and their findings had been applied — which is the required order, and
the reason the diff Codex read is not the diff the owners read.

Carried the mandatory `node_repl` preamble. Codex cannot spawn processes here, so it ran no git, no
vitest, no playwright, no build and no frame-budget harness; every finding below is **file evidence
and must be re-verified locally**, which is what the triage records.

## The verdict

> **BLOCK — Phase 6 cannot yet be reported done.** Two blockers, two high-severity proof gaps, and
> one medium false-positive test.

## The review, verbatim

1. **Blocker — the collect tween violates the tick-duration rule.** `TWEEN_MS = 260` is passed directly to Phaser as `duration`; 260 ms is 15.6 simulation ticks, not an integer tick count. `src/scenes/UIScene.ts:52`, `src/scenes/UIScene.ts:251`, `tests/e2e/phase-06-hud.spec.ts:93`, `docs/PRD.md:60`.

2. **Blocker — criterion 6.9 reported PASS although its frame-budget check is explicitly unrun.** QA log says a HUD-vs-no-HUD A/B "is owed," yet the verdict is PASS. `docs/prd/phase-06-hud.md:56`, `docs/qa/phase-06-hud.md:37`, `docs/qa/phase-06-hud.md:220`, `docs/PRD.md:73`.

3. **High — the "gear flies to the counter" e2e test never observes flight or the counter destination.** Only checks a tween/extra child existed and was later removed; deleting the tween's `x`/`y` targets would still pass. `tests/e2e/phase-06-hud.spec.ts:86,104,122`, `src/scenes/UIScene.ts:251`.

4. **High — the resize test can pass without proving the UI camera didn't crop the HUD.** Asserts game size, layout, `hudFits`, `willRender`, but never reads the UI camera's viewport; would stay green if a cropping camera were introduced. `tests/e2e/phase-06-chrome.spec.ts:150,162`, `docs/qa/phase-06-hud.md:96`.

5. **Medium — "HUD objects would actually be drawn" asserts a `willRender` flag, not what Graphics actually draws.** `barFill.willRender` stays true with an empty command buffer; deleting `drawHealth()` would leave this named assertion green (the separate 6.4 pixel test would still catch the regression). `tests/e2e/phase-06-chrome.spec.ts:101`, `src/scenes/UIScene.ts:126,213`.

### Mechanical checks

- `src/sim/` boundary: clean, no Phaser / `Date.now` / `Math.random` / DOM.
- Durations: no float-second duration elsewhere; the 260 ms tween (finding 1) is the one violation.
- Animation FPS: no newly authored runtime fps; the catalog derives `renderFrames × TICK_HZ / simTicks`.
- 400-line ceiling: clean, largest file exactly 400 lines.

### Acceptance criteria, as Codex read them

6.1 incomplete (finding 3) · 6.2 incomplete (finding 5) · 6.3 appears sufficient only (finding 4) ·
6.4 satisfied · 6.5 satisfied (evidence not independently rerun) · 6.6 satisfied for the shipped
level only, a future bright background ungated · 6.6b satisfied · 6.7 satisfied · 6.8 satisfied ·
**6.9 failing/unrun (finding 2)** · 6.10 satisfied · 6.11 supplied by this review, pending triage.

### What Codex could not check — preserved verbatim

> Codex could not run git, vitest, playwright, the build, or the frame-budget harness (no process
> spawning); file reads via node_repl succeeded and no files were modified.

---

## Triage

| # | Finding | Severity | Disposition |
|---|---|---|---|
| **C1** | `TWEEN_MS = 260` is not an integer tick count | Blocker | **APPLIED.** Correct, and correct about *why* it slipped: the render layer is where the rule is easiest to forget, because Phaser's tween API genuinely takes milliseconds. Now `TWEEN_TICKS = 15` converted through `ticksToMs` — 250 ms exactly, derived rather than authored |
| **C2** | 6.9 reported PASS while its frame-budget half is unrun | Blocker | **APPLIED, and it is the finding that decides the phase.** The QA log said "PASS, with an open coverage gap" one line above admitting the A/B is owed. The project's own rule is that *a phase with a failing or unrun criterion is reported failing, never as done*. **6.9 is now recorded UNRUN and Phase 6 is reported NOT DONE.** The verdict, not the wording, was wrong |
| **C3** | The tween test never observes flight or the destination | High | **PARTIALLY APPLIED, remainder OWED.** The leak half was a genuine race and is fixed — the key is now released before measuring and the test waits out a full tween. Asserting the flyer's *trajectory* is not done; it is on the owed list in the QA log rather than claimed |
| **C4** | The resize test never reads the UI camera's viewport | High | **RECORDED, not fixed.** Independently found by the qa-expert owner from the other direction. The guarantee currently holds by *not creating an explicit camera* — verified by reading Phaser's own `CameraManager.onResize` — which is an emergent property, not an assertion. A camera-viewport assertion is owed |
| **C5** | `willRender` on a Graphics is true with an empty command buffer | Medium | **APPLIED, and it had already been applied to the sibling test before this review ran.** The code-reviewer gate owner found the same hole in `phase-06-hud.spec.ts`'s full-health test, which now reads the command buffer. Codex found the *second* instance, in `phase-06-chrome.spec.ts:101`. That one is **still a flag-read** and is owed |

**Applied: 3. Partially applied: 1. Recorded: 1. Rejected: 0.**

### The disagreement worth naming

Codex read `docs/qa/phase-06-hud.md` at the moment it said **6.9 PASS**. That was my error, not a
disagreement: the log's own body said the A/B was owed, and a verdict that contradicts its own
evidence is exactly the failure the two-review protocol exists to catch. Review 1 asked *is this the
right thing to build*; review 2 asked *is this a correct build of it*; the honest answer to the
second is **not yet**.

### Re-verified locally

- `src/sim/` boundary, duration rule, fps derivation and the 400-line ceiling: confirmed by
  `npm run typecheck`, `npx vitest run` (1221 pass) and `npm run build` (verify-dist ok) after C1
  was applied.
- Codex's line citations for findings 3, 4 and 5 were checked against the files by hand; all three
  are accurate.

---

## Review 2, round 2 — 2026-08-16, after the owed work

Run with `/codex:rescue --wait --resume` and the mandatory `node_repl` preamble, after the eight
gate-owner agent runs and before the phase was reported done. **Verdict: BLOCK.**

Codex was asked the standard review-2 questions plus four specific to this session: whether C3/C4/C5
were really closed, whether the new frame-budget spec can pass while the HUD is broken, whether the
HUD teardown is correct across restart/pause/sleep/refusal/dev-exit, and whether the docs-contract
row requirement holds now that Phase 6 is marked done.

### The findings, verbatim in summary

1. **Blocker** — Phase 6 marked done while the QA log's own banner and criterion 6.11's row still
   said NOT DONE / BLOCK.
2. **Blocker** — 6.9's PASS rests entirely on ratios, and `GearLayer.sync()` plus the `renderHud()`
   call run in both arms and divide out, so the criterion's *frame budget* was only answered for the
   part the A/B could vary.
3. **Major** — the teardown predicate gets `SLEEPING` wrong: Phaser neither updates nor renders a
   sleeping scene, so the HUD would survive over a game that is not on screen.
4. **Major** — the refusal lifecycle test cannot go red for the line it names.
5. **Major** — the correctness guard accepts a bar that paints no pixels: deleting `fillRect` while
   leaving `fillStyle` keeps the command buffer non-empty and the parsed alpha healthy.
6. **Minor** — a restart preserves an in-flight collect flyer; its test checks only liveness and
   child count.

It confirmed C3, C4 and C5 closed; no Phaser/clock/random/DOM in `src/sim/`; durations integer ticks;
animation fps still derived; no file over 400 lines.

### What Codex could not check — preserved verbatim

> Codex could not run Git, Vitest, TypeScript, build, Playwright, browser, or GPU harness (sandboxed
> shell cannot spawn processes). It reconstructed branch/diff state from `.git` objects via node_repl
> file reads only. Recorded red runs, timing numbers, and visual/contrast evidence in the QA log
> remain unexecuted claims from this review's perspective. No files were modified.

### Triage

| # | Disposition |
|---|---|
| 1 | **Applied** — banner rewritten (old text kept verbatim beneath it), 6.11's row updated to record both rounds |
| 2 | **Applied** — an **absolute** bound added to `phase-06-perf.spec.ts`: the whole HUD-on frame must cost under a third of a 16.67 ms frame. Nothing divides out of it. The tween-transient limit stays stated |
| 3 | **Applied** — threshold moved from `>= SHUTDOWN` to `>= SLEEPING` in `UIScene.update()`. PAUSED still renders and is correctly kept, which is also what criterion 6.4's spec relies on |
| 4 | **Applied — and it found a live defect, which is now FIXED.** A restart-based refusal test was written and failed with `TypeError: … reading 'glTexture'`: on a refusal following a successful boot the play scenes render on through the reload, hit a freed texture, and kill the loop before `refuseToRoute`'s stops can run. Fixed by stopping `Game` and `UI` in `BootScene.init()` — a no-op on a fresh boot. The test is a live gate; the full suite is green |
| 5 | **Applied** — `barWidestRect` reports the widest rectangle actually filled and is asserted `> 0` |
| 6 | **Recorded** — bounded and cosmetic; the flyer destroys itself on completion |

**Applied: 5. Recorded: 1. Rejected: 0.**

Finding 4 is the one that paid for the review: a gate that could not go red was hiding a real bug,
which is the exact shape this project's C2 rule exists to catch.
