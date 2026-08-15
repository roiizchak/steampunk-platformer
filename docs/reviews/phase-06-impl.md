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
