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

Completed 2026-08-22 *(criterion 9.11, C11)*. Every finding was re-verified locally before it was
acted on — Codex's shell could not run, so nothing below rests on its file evidence alone. Full
record in `docs/qa/phase-09-polish.md` §9.8 entries 14, 15, 47, 48 and 49.

| # | sev | verdict | what was actually observed |
|---|---|---|---|
| 1 | High | **APPLIED** (with 2, 6) | Correct: no gate read a texture pixel. The transcription in `effectCounts.ts` cannot — Phaser submits a transparent quad as happily as an opaque one. |
| 2 | Blocker | **APPLIED** | Reproduced. `fillStyle(spec.tint, 0)`: unit suite green, 9.6 `drawn 96 inView 96` **PASS** on a real GPU. Closed by `phase-09-draw.spec.ts`'s pixel read, watched red against that mutation and against `fillStyle(0xffffff, 1)`; the source-text `spec.tint` gate is gone. |
| 3 | High | **RECORDED** (behaviour kept, ruling written, gate added) | Reachable exactly as described — driven end to end: player leaves the hurt lock still invulnerable, lands a blow, is frozen by it, `iFrameCounter` holds for the whole freeze and resumes after. **Not wrong**: `IFRAME_TICKS`'s surplus is *actionable* ticks, and you cannot leave while frozen. Ruling written into `stepCombat`'s header; `hitstop-frozen-counters.test.ts` gates it, watched red by ungating step 4b.1. |
| 4 | Medium | **APPLIED where it overlaps 7, RECORDED otherwise** | The worst instance — the landing edge in the render layer because `types.ts` would cross 400 — is fixed by 7. The rest is a structural observation, not a defect; the tick contract is not restructured for it. Entry 48, with the round's own instance of the same pressure. |
| 5 | High | **PARTIALLY APPLIED — claim corrected, model and floor unchanged** | Codex's algebra is **exact** (`α = 0.2732` -> `k = 0.9001`; reported `1.034b` vs true `3.914b`; **3.79x**). The documented "at most 1.5x" is `(8192/96)^0.1` = 1.56x and holds only under `c·N^k` — it was stated unconditionally, and that is corrected. **The premise is refuted by the recorded data**: an affine law with `a >= 0` caps `k` at 1, and all seven runs measured `k = 1.086-1.286`; fitting `a + bN` through them gives a negative intercept. The floor was not moved. |
| 6 | High | **APPLIED** (with 1, 2) | Correct. §9.8 entry 14 disclosed the colour *choice* as by-eye and never that its *existence* was ungated. Rewritten, and the gap closed rather than only documented. |
| 7 | High | **APPLIED** | Confirmed by running it: the identical fall rendered at one tick per frame emits dust and squashes; at two ticks per frame it emits **zero** and never squashes. Fixed at the source — `PlayerSim.landedTick` / `landedFallSpeed`, stamped at step 10; `types.ts` split rather than exempted. |

**And one Codex did not find, uncovered while proving 7.** The emit window in `gameEffects.render`
was `(cursor, tickCount]` against stamps taken from the pre-increment count, so **no impact spark,
death plume or hurt vent had ever fired in the shipped game** at one tick per frame. Every unit
fixture had bumped the count before stamping — the one ordering the game never performs — and 9.5/9.6
drive `explode()` on the emitter handles directly, bypassing `render()` entirely. Entry 49.

---

## The close round's review — 2026-08-24. Verdict: **BLOCK**

**Ran through `codex:rescue` on the three close-round commits** (`1a58142`, `bb75bda`, `ad31b89`), with
the prompt instructing `node_repl` + `fs.readFileSync` because Codex's sandboxed shell cannot spawn
processes on this machine. Its findings are therefore **file-evidence only**, and every one below was
re-verified locally before being acted on — as the protocol requires and as this round's results
justify: four of the plan review's findings were confirmed by local check, and every implementation
finding acted on below was confirmed too.

> **BLOCK. Phase 9 should not be reported done: 9.5 is explicitly unmet, and the new 9.2 gate has
> substantial false-green paths.**

**It was right, and it caught the session doing the exact thing the session existed to stop.** The
close round marked 9.5 *"PASS, qualified"*. Codex's answer: *"A caveat cannot reverse the criterion's
wording; this is exactly the 'bare PASS wearing a caveat' case. D5 is a dodge, not an acceptable
non-fix."* Phase 9's done status was reverted within the hour.

| # | severity | finding | disposition |
|---|---|---|---|
| 1 | **blocker** | 9.5 is a failing criterion presented as a qualified PASS. The criterion says *max enemies + max particles + shake*; the frame carries no combat and the smallest shake, and the log calls its own defence *"an argument and not a measurement"* | **ACCEPTED IN FULL.** 9.5 marked **FAILING**; the PRD's Phase 9 row reverted to **NOT done** with the reason on it. Three ways out named, all the owner's: measure the stated worst case, amend 9.5 by explicit owner amendment, or leave it failing |
| 2 | **blocker** | The 9.2 token list does not mechanise the criterion. Seven scene methods only — `transition`, `run`, `sleep`, `wake`, `setActive` and `remove` are real ScenePlugin progression operations and all passed | **PARTIALLY APPLIED, and verified.** All six added; `scene.scene.wake()` planted in `settleFade` now reds the gate naming `hudFade.ts`, watched. The wider half — `world.completed = true`, `player.hp = 0`, `finishLevel()`, registry writes — is **NOT closed**: classifying game-state APIs is a new architectural rule, and 9.2 is not the criterion that authorises inventing one. Recorded as owed rather than waved through |
| 3 | high | `callbackCode()` materially overstates its reach — misses `onComplete() {}`, `function () {}`, `this.foo`, quoted keys, `{ onComplete }`, `async () =>`, multiline expression bodies, `cfg.onComplete = done` | **APPLIED.** The extractor was **rewritten**: it now scans the whole balanced `tweens.*(…)` call rather than trying to recognise each callback shape, which picks up every *inline* form for free, and follows bare-identifier callbacks to their declarations. The docstring now **names what it still cannot reach** (member-expression and imported callbacks, configs built elsewhere, shadowed names) instead of claiming totality |
| 4 | high | The selector fixed the tail endpoint and left its twin. The spec's live set is `tick > L && tick <= L + span`; `inWindow` still used `< L + span`, rejecting a landing whose only live sample is exactly `L + span` | **APPLIED.** `inWindow` now uses `<= L + span`, and the stale interval text in the thrown message was corrected. The first fix corrected one endpoint and left the other — the same defect class, opposite direction |
| 5 | high | Six mutations do not establish 9.7 for all 24 thresholds; dust, particle caps, i-frame/squash, frame-work/P95/delta and `MIN_COST_EXPONENT` are uncovered | **ACCEPTED.** 9.7 downgraded from PASS to ⚠️ **PARTIAL**, naming exactly which six families the mutations cover and which they do not. Closing it needs a current threshold → fixture → red-proof table — owed work |
| 6 | medium | 9.4 credits Brief A with mutations while the blind-spot section says *"no agent ran a mutation of any kind"* | **APPLIED — the blind spot was the wrong half.** The `qa-expert` brief **did** mutate, in an isolated scratchpad harness, never touching a repository file. The blanket sentence was corrected to say which briefs mutated and which did not |
| 7 | medium | D4 waves through two demonstrated bypasses in the 9.3 scan (bracket access, discarded wrapper) | **RECORDED, still not fixed — and now with a sharper reason.** Codex is right that *"a brittle gate is worse than none"* does not justify leaving two *unambiguous* bypasses. It is owed work on 9.3's gate, listed with 9.7's table. Not taken this session because 9.5 already blocks the phase and a rushed widening of a scan is how false reds arrive |
| 8 | medium | The docs-contract discoveries are correct, but bolding is not a durable repair — removing emphasis silently restores the bypass | **RECORDED.** Codex independently confirmed both discoveries and found no other contract-shaped rows in any done phase's slice. The durable fix — parse only the designated gate table and require exactly one row per criterion — is a change to a shared contract test and belongs with the owed work, not bolted on at the end of a blocked close |
| 9 | low | Documentation drift: *"four of five"* sites should be three; D12's path `bin/fal-site.mjs` does not exist; four stale `:line` self-citations; `coveredLanding`'s error text still names the old interval | **APPLIED** — count corrected, path corrected to `.agents/skills/fal-redesign/runtime/bin/fal-site.mjs`, interval text corrected. The four stale self-citations are pre-existing and are folded into the standing citation-drift problem the close round already recorded |

**Confirmed fine on file evidence:** 9.1's current-tree verdict · 9.3's live owners · 9.4's actual fade
behaviour · 9.9's scoped line count · the A0 marker analysis · D3's tail reasoning · every quoted
E1-E6 failure string. D1, D6, D8, D9, D10, D11 and D13 were judged defensible recorded reasons.
**D8 specifically**: Codex confirmed the one-tick arbitration/drawing mismatch and agreed that
deferring a behaviour-changing arbitration decision to the owner is legitimate — *"it is not what
blocks this close."*

**What blocks the close is 9.5, and it is the owner's call.**
