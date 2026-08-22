# Phase 9 — Codex implementation review

Second of the two mandatory Codex reviews (criterion 9.11). Run 2026-08-22 against
`phase-09-polish` at `467b462` — 50 commits, 89 files, +12597/−671 against `main`.

Codex's sandboxed shell cannot spawn processes on this machine (`CreateProcessAsUserW failed: 5`), so
the prompt directed it to the `node_repl` MCP tool with `fs.readFileSync`. **Its findings are
file-evidence only and must be re-verified locally** — see `docs/PRD.md § The Codex review protocol`.

---

## The reply, verbatim

1. **High — plan findings 2a/7 were not fully applied.** The triage promised a renderer-backed per-particle check ([phase-09-plan.md:53](../reviews/phase-09-plan.md)), but the implementation admits particles have no `willRender` and instead transcribes selected renderer predicates ([effectCounts.ts:41-60](../../tests/e2e/effectCounts.ts)). That transcription does not inspect texture pixels. The other claimed-applied findings are present in the current tree; notably, finding 4 is now independently tied to `MAX_LEVEL_ENEMIES` by the inherited Phase-5 gate ([phase-05-perf.spec.ts:173-188](../../tests/e2e/phase-05-perf.spec.ts)).

2. **Blocker — next green mutation:** change `pen.fillStyle(spec.tint, 1)` to `pen.fillStyle(spec.tint, 0)` at [particleTexture.ts:48](../../src/scenes/particleTexture.ts). Every generated particle texture becomes transparent. The unit gate merely checks that the function's source contains `spec.tint` ([effects-draw-path.test.ts:82-90](../../tests/unit/effects-draw-path.test.ts)); the runtime counter considers only emitter/particle alpha and scale ([effectCounts.ts:149-180](../../tests/e2e/effectCounts.ts)); and the real-trigger test counts alive particles plus emitter `willRender` ([phase-09-draw.spec.ts:321-337](../../tests/e2e/phase-09-draw.spec.ts)). None reads the generated texture's alpha, so the named suite remains green while all particles are invisible.

3. **High — `iFrameCounter` is gated too broadly.** Any player freeze stops it ([combat.ts:254-260](../../src/sim/combat.ts)), including a freeze caused by the player's own outgoing strike, because `applyPlayerAttack` passes the player into `freezePair` ([playerAttack.ts:173-185](../../src/sim/playerAttack.ts)). This is reachable: hurt lasts 18 ticks while invulnerability lasts 45, leaving 27 actionable invulnerable ticks ([combatTiming.ts:68-83](../../src/sim/combatTiming.ts)). Landing another hit during that surplus pauses the attacker's remaining grace period. The existing i-frame test covers only an incoming claw hit ([hitstop-interactions.test.ts:81-92](../../tests/unit/hitstop-interactions.test.ts)); the QA log records frozen-swing chaining and the stride/goal counters, but not outgoing hits extending i-frames ([phase-09-polish.md:373-376](../qa/phase-09-polish.md), [phase-09-polish.md:625-650](../qa/phase-09-polish.md)).

4. **Medium — the limit distorted ownership and APIs.** `tick.ts` no longer contains its own authoritative numbered pipeline: steps 5–8 were moved specifically to "buy" the 400-line rule ([tick.ts:91-98](../../src/sim/tick.ts)), with a `ran` status threaded back into later steps ([tick.ts:264-278](../../src/sim/tick.ts)); even the core `advance` loop is re-exported from another file solely because `tick.ts` reached 400 ([tick.ts:391-400](../../src/sim/tick.ts)). On the scene side, the effects attachment registers its own scene-shutdown listener explicitly because `GameScene.ts` has no remaining line ([gameEffects.ts:306-321](../../src/scenes/gameEffects.ts)). The worst ownership distortion is the landing edge and squash living in the render attachment: the comment explicitly rejects sim state because `types.ts` would exceed 400 lines ([gameEffects.ts:133-140](../../src/scenes/gameEffects.ts)).

5. **High — the fourth perf version fits the wrong model.** `costExponent` assumes `delta(N) = cN^k` and fits only 1024 and 8192 particles ([effectSweep.ts:94-103](../../tests/e2e/effectSweep.ts), [effectBudget.ts:88-103](../../tests/e2e/effectBudget.ts)), then divides the 8192 result back to the unmeasured shipped 96 ([phase-09-perf.spec.ts:214-221](../../tests/e2e/phase-09-perf.spec.ts)). The actual renderer has fixed per-emitter work before its particle loop and additional work taken only when the population is nonzero ([ParticleEmitterWebGLRenderer.js:34-78](../../node_modules/phaser/src/gameobjects/particles/ParticleEmitterWebGLRenderer.js)); the storm also conditionally calls `explode` per emitter ([effectMutation.ts:124-137](../../tests/e2e/effectMutation.ts)). Its cost can therefore be `a+bN`, not a pure power. At the accepted floor `k=0.9`, an affine cost with `a≈0.273×1024b` produces exactly that fitted exponent, yet `delta(8192)/8192≈1.034b` while the actual 96-particle per-particle cost is about `3.91b`: a 3.8× understatement, disproving the documented claim that the 0.9 allowance can understate by at most 1.5× ([effectSweep.ts:72-80](../../tests/e2e/effectSweep.ts)).

6. **High — §9.8 omits generated-texture visibility.** It records particle colour as a by-eye choice ([phase-09-polish.md:337-338](../qa/phase-09-polish.md)), but never states that no gate verifies the generated texture contains opaque pixels — provable from the source-only `spec.tint` assertion ([effects-draw-path.test.ts:82-90](../../tests/unit/effects-draw-path.test.ts)) and the runtime predicate, which never reads the texture ([effectCounts.ts:149-180](../../tests/e2e/effectCounts.ts)). This is the boundary exposed by the mutation in answer 2.

7. **High — the render-frame-derived landing edge is the likeliest Phase-10 break.** A render frame may execute several sim ticks, and the batching code warns an action can start and finish between frames ([advanceSplit.ts:67-93](../../src/sim/advanceSplit.ts)). Landing is not carried in accumulated events; `gameEffects` infers it only from `grounded` changing between render calls ([gameEffects.ts:243-262](../../src/scenes/gameEffects.ts)). A buffered jump can land on the first tick and jump on the next — the jump path clears `grounded` ([playerMotion.ts:154-170](../../src/sim/playerMotion.ts)) — leaving the renderer observing `false → false`. Dust, squash, and landing shake disappear precisely on slower release hardware where multi-tick frames become common. The QA log discloses only one-frame velocity inaccuracy, not complete loss of the landing event ([phase-09-polish.md:339-342](../qa/phase-09-polish.md)).

Codex could not run Git, unit tests, Playwright, browser rendering, performance measurements, or the proposed mutation — findings are source-proven from `node_repl` file reads only; branch identity, commit/file counts, and empirical greenness remain unchecked.

---

## Integrator triage

Pending — every finding to be re-verified locally and then applied or recorded with a one-line reason
*(C11)*. Codex's shell could not run, so **none of the above has been empirically confirmed**; the
mutations it names must be executed before they are believed, and the two that are arithmetic claims
(#5) must be checked against the recorded run data.
