# Phase 2 — Codex implementation review (review 2 of 2)

**Ran:** 2026-08-06, on the `phase-02-player` branch, after the phase's own tests were green and
after criterion 2.9's two review briefs had both run and been applied.
**Invocation:** `/codex:rescue --wait --resume`, carrying the `node_repl` instruction from
[PRD.md § The Codex review protocol](../PRD.md#the-codex-review-protocol).

The diff was fully staged, so `git diff --cached main` was the phase. 22 files, ~2.8k insertions:
the whole of `src/sim/` (`types`, `rng`, `input`, `player`, `tick`), `src/render/playerView.ts`,
`src/game/frameClock.ts`, `GameScene`, `PlaygroundScene`, Boot's new routing, seven unit suites and
one e2e spec.

---

## The report, verbatim

> Phase 2 is not ready to report complete. The staged code has two high implementation/contract
> defects, criterion 2.8 is unrecorded, and parts of the plan-review triage are marked applied
> without being fully enforced.

### Findings

**1. High — The jump-buffer implementation does not implement the tick header's stated
`N`-accepting-ticks definition.**

Coyote time is correct: walking off arms counter `0` after step 8; the following ticks test
`0…N−1`, while `N` rejects. `src/sim/tick.ts:193-205`, `src/sim/tick.ts:228-230`

Buffering is different. On a landing tick, step 8 still sees the previous airborne state; collision
then sets `landed`, and `!events.landed` prevents the counter advancing. The jump fires on the
following tick. Thus a press on the touchdown tick is not accepted until the next tick, and a press
`N−1` ticks before touchdown can produce `events.jumped` on tick `N+1` counting the press tick. That
contradicts "buffer first testable tick is the press itself; tick N accepts; tick N+1 does not."
`src/sim/tick.ts:32-42`, `src/sim/tick.ts:168-180`, `src/sim/tick.ts:217-233`

The buffer tests measure whether a jump occurs anywhere after landing, not which tick accepts it, so
they cannot distinguish a landing-tick acceptance from the implemented following-tick acceptance.
`tests/unit/coyote-time.test.ts:156-180`, `tests/unit/coyote-time.test.ts:193-206`

**2. High — `PlaygroundScene` is not dev-only.**

The phase requires a dev-only scene, but production configuration imports and registers it
unconditionally, and `P` starts it without an `import.meta.env.DEV` guard.
`docs/prd/phase-02-player.md:7-9`, `docs/PRD.md:218-223`, `src/game/config.ts:1-5`,
`src/game/config.ts:38-41`, `src/scenes/GameScene.ts:145-154`

This also makes `docs/QA-LOG.md`'s description of a "dev-only `PlaygroundScene`" false.
`docs/QA-LOG.md:419-425`

**3. High — QA criterion 2.8 is unrun or at least unrecorded.**

Criterion 2.8 requires a hands-on browser feel check covering weight, responsiveness, and input
drops. The Phase 2 record contains automated measurements, headless verification, mutations, and
reviewer briefs, but no recorded hands-on observation or final 2.8 result.
`docs/prd/phase-02-player.md:51-54`, `docs/QA-LOG.md:502-527`, `docs/QA-LOG.md:529-595`

Global constraints say an unrun criterion must be reported failing. `docs/PRD.md:67-70`

**4. Medium — Movement state is one tick behind the physics state.**

`resolveState()` runs before horizontal/vertical processing, jump resolution, integration, and
collision. A successful jump therefore publishes the prior `idle/run` state for its first airborne
tick; landing publishes `fall` for one grounded tick. `src/sim/tick.ts:156-180`,
`src/sim/tick.ts:183-206`, `src/sim/player.ts:94-106`

Visible because rendering colour is selected directly from `player.state`. No movement test asserts
state during jump initiation, apex transition, or the landing tick. `src/render/playerView.ts:37-52`,
`tests/e2e/phase-02-movement.spec.ts:148-192`

**5. Medium — Plan-review F2a is only partially applied.**

The distance floor and ceiling fix the trivial-movement hole, but render synchronization is still
covered only at the descriptor level. Deleting `GameScene.renderPlayer()` or its call leaves
`player-view.test.ts` green, and the movement E2E reads only `window.__game`, not the rendered
rectangle. `docs/reviews/phase-02-plan.md:107`, `tests/unit/player-view.test.ts:42-118`,
`src/scenes/GameScene.ts:103-106`, `src/scenes/GameScene.ts:162-179`,
`tests/e2e/phase-02-movement.spec.ts:57-66`

**6. Low — The accepted reason for the apex-oracle review note does not hold.**

The `v²/2g` assertion proves only that the continuous formula differs from the chosen discrete
calculation; it does not prevent production code and the test's parallel integrator from sharing the
same wrong step-order assumption. `docs/QA-LOG.md:609`,
`tests/unit/player-movement.test.ts:9-13,30-48`, `src/sim/tick.ts:165-187`

### Section 6 gate assessment

| Criterion | Assessment |
|---|---|
| 2.1 | Sim/debug movement satisfied; render-sync enforcement incomplete |
| 2.2 | Satisfied by file evidence |
| 2.3 | Functional coyote endpoints satisfied; header's shared-window claim is false |
| 2.4 | Behaviour satisfied; exact acceptance-tick semantics don't match header |
| 2.5–2.7 | Satisfied by inspection; execution not independently rerun |
| 2.8 | **Fail/unrun** — no recorded hands-on result |
| 2.9 | Briefs ran, but buffer conclusion and apex-oracle acceptance are unsound |
| 2.10 | **Fail as recorded** — F2a partial, F5's "identical endpoint semantics" claim false |
| 2.11 | Pending (this review) |

### What the reviewer could not check

> Codex could not run TypeScript, Vitest, Playwright, the build, or Git (no process spawning
> available). It reconstructed the staged index and `main` tree via Node file access and inspected
> staged blobs directly; runtime/test-result claims remain the existing QA-LOG evidence, not freshly
> re-executed verification.

*(Preserved per vault 9.3 — a gate's blind spots are part of its result. Every finding below was
re-verified locally by running the thing it names, per vault C6.)*

---

## Triage

Every finding **applied**, or **rejected with a reason** *(vault C11)*. Five of six applied.

| # | Finding | Sev | Disposition |
|---|---|---|---|
| I1 | The buffer does not implement the header's stated window definition, and its tests cannot tell the difference | **High** | **Applied — the sharpest finding of the review.** Re-verified locally: the buffered jump does fire one tick after touchdown, and every existing buffer test ORs over a range of ticks, so none of them could have noticed. The header now states the two windows **separately** and says plainly that "able to jump" means the tick after touchdown, with the reason. A new test, `fires on the tick AFTER touchdown, not on the touchdown tick itself`, records the landing tick and the jump tick and asserts `jumpedAt === landedAt + 1` — pinning the acceptance tick instead of its existence. Codex was right that the claim was false; the behaviour itself is correct and deliberate. |
| I2 | `PlaygroundScene` is registered in production builds | **High** | **Applied.** `gameConfig.scene` is now `import.meta.env.DEV ? [Boot, Game, Playground] : [Boot, Game]`, and the `P` key binding is guarded the same way — the same side of the build gate as `window.__game` *(vault 1.6)*. Verified in `dist/`: `select knob` is absent and the scene class is gone; the only surviving `Playground` string is `scene.stop('Playground')` in Boot's refusal path, which is a no-op on an unregistered scene and is kept so dev and production take the same branch. |
| I3 | Criterion 2.8 is unrun/unrecorded | **High** | **Applied as a correction to the report, not as a fix.** Codex is right and this is now stated: the automated half ran and is recorded; **the hands-on half has not been performed by a human**, and under PRD.md's rule the phase is therefore reported **failing on 2.8**, not done. |
| I4 | Movement state is published one tick behind the physics | Medium | **Applied.** `resolveState` moved from step 4 to step 11, after collision, so the state and the position published in the same tick describe the same moment. The numbering was updated rather than patched around — this was the last moment it is free, since nothing depends on the contract yet, and the plan review's own question 6 asked exactly this. Phase 5 is unaffected: combat gates on states it owns and which persist across ticks. New test `publishes the state of THIS tick, not the previous one`; mutation M17 (move it back) turns it red. |
| I5 | F2a only partially applied — deleting `renderPlayer()` leaves everything green | Medium | **Applied.** New e2e test reads the actual `Phaser.GameObjects.Rectangle` through the dev-only `__phaserGame` handle and asserts it matches `__game.player` both at rest and while moving. Mutation M18 (delete the `setPosition` call) turns it red — measured: expected 616.2, received 470, the spawn position. |
| I6 | The accepted reason for keeping the apex oracle does not hold | Low | **Applied.** The reason was weak and Codex was right. Added a **closed-form** discrete oracle — `rise(n) = n·v₀ − g·n(n−1)/2`, derived algebraically from the documented step order rather than by iterating — and asserted it agrees with the loop to 1e-9. Three independent derivations must now agree: the algebra, the loop, and the simulation. |

**Applied: 6. Rejected: 0.**

## Was review 2 worth its cost?

Yes, and on two findings that nothing else in the phase could have produced.

**I2 would have shipped.** A dev-only tuning console was registered in the production bundle, and
every gate in the phase was green. No test asserted its absence, because Phase 10 owns that check —
so the one reviewer looking at the *whole* diff against the *whole* PRD was the only reader
positioned to notice that `PlaygroundScene.ts`'s "DEV ONLY" label in the file structure was a claim
nobody had enforced.

**I1 is the more interesting one**, because it is the same lesson as the plan review's F5 arriving
from the opposite direction. F5 caught the *code* disagreeing with the *intent*; I1 caught the
*header* disagreeing with the *code* after the fix. The tests were green both times. What made I1
findable was Codex being asked to check a documented claim against the implementation rather than to
check the implementation against itself — and what made it invisible to my own tests was that they
asked "did a jump happen" rather than "on which tick". That distinction is the phase's most
transferable lesson and is recorded in the vault-out.

**I3 is the one that matters procedurally.** The reviewer had no way to run anything, and still
correctly identified that a criterion requiring a human had not had one. A phase where every
automated gate is green is exactly the phase where an unrun manual criterion is easiest to let slide.
