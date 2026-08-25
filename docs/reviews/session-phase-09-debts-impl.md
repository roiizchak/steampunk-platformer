# Codex IMPLEMENTATION review — Phase 9's debts session (2026-08-25)

**Verdict: BLOCK.** Five findings — one blocker, two high, one medium, one low. **All five applied.**

⚠️ Codex's sandboxed shell cannot spawn processes on this machine (`CreateProcessAsUserW failed: 5`).
The review ran through the `node_repl` MCP tool with `fs.readFileSync`, so **every finding is file
evidence only** and each was re-verified locally before being acted on. Its own "Could not check"
list is reproduced at the end.

Codex's summary line, for the record: *"Section 1a's non-closure is honest: the shipped assertions
guard combat activity, spark admission, and rendering without claiming a millisecond bound. The four
`expect.soft` sites are genuinely upper bounds, while the premises remain hard. I found no second
counter-polarity inversion, but did find another high-impact timing-semantics error in the combat
driver."*

## Findings

### 1 — blocker: the tween-alias repair was HALF applied and the log claimed the whole of it

`tween-boundary.test.ts:89`, `:261`, `tweenCallbacks.ts:149`

`isTweenCall` learned to resolve `const tm = scene.tweens` on 2026-08-25, which closed the **callback**
rules (9.2b, 9.2c). Criterion **9.3's** two rules were untouched and remain pattern-driven: `TWEENS_ADD`
requires the literal word `tweens`, and the 9.3c scan filters files by `code.includes('tweens.add')`.
So `const tm = scene.tweens; tm.add({…})` with no teardown passed **both** handle gates — and the
gate-round log recorded the alias hole as **APPLIED**.

**Verified locally:** `tween-boundary.test.ts:132` is `scanned.filter(([, code]) => code.includes('tweens.add'))`
— an aliased opener's whole *file* is excluded from the scan, not merely unmatched.

**APPLIED.** `tweenOpenings.ts` exports an alias-aware AST inventory (method, `held`, `aliased`), and
a new **9.3d** describe drives criterion 9.3 from it, *beside* the patterns rather than instead of
them — the shape 9.2c already takes. `held` is answered from the parent node (declarator init,
assignment right, `return` argument) instead of the preceding characters.

The committed fixture asserts the **blindness itself**, which is the evidence the claim never had:
`unbound(...)` returns `0` and `includes('tweens.add')` is `false` for the aliased source, while the
parser rule reports `held: false, aliased: true`. A third test pins that both rules agree on all six
unaliased shapes, so a future edit cannot silently split them.

> **This is the session's second false "applied", and both were mine.** Codex's plan review named
> destructuring in PR-03 and the log marked it applied when it was not; here the alias fix was applied
> to one of two rule families and logged as complete. *A disposition of "applied" is a claim like any
> other, and this session produced two false ones.*

### 2 — high: REST is not quiet "by construction", and the control was mislabelled

`combatDrive.ts:117`, `combatFrames.ts:92`, `:294`

Two distinct problems. The driver writes keys and `iFrameCounter` from a `requestAnimationFrame`
callback that runs **after** the game loop has drained this frame's sim ticks — and this harness
drains up to 4 ticks per frame — so a FIGHT→REST edge can execute REST ticks with fight inputs and
vulnerability still live. Separately, `reduceCombat` **never checked the phase at all**: its control
was every non-spawn frame far enough from an observed event, and it *printed* those as "rest frames".

**APPLIED, both halves.** `startPhasedCombat` publishes `__phase`; `CombatFrame` records it; the
control filter now requires `phase === 'rest'` **and** the margin. And rather than asserting quiet, the
reduction **measures the leak**: `restEventFrames` counts REST frames on which a hit stamp advanced,
and the spec prints it. The docstrings that said "by construction" now say *"in practice and by a wide
margin, but not by construction"* and point at the counter.

### 3 — high: the new call-argument rule false-reds reads, and widened an owner-authorised rule

`tweenCallbacks.ts:277`, `tween-sim-writes.test.ts:130`, `CLAUDE.md:158`

The gate-round fix reported **any** sim-rooted argument to **any** function as a sim-state write, so
`renderPlayer(world.player)` and `invulnerable(world.player)` were rejected. The owner authorised
*"may not **write** sim-owned state"*; the implementation silently enforced *"may not **pass** sim
state"*. **Widening an approved architectural rule is a STOP-and-ask** (CLAUDE.md §3) — and a test
quietly enforcing more than the rule says is one form of that.

**APPLIED — narrowed back to the authorised rule.** The argument check now fires only on a call to a
**named** `src/sim/` mutator (`SIM_MUTATORS`: `damagePlayer`, `killPlayer`, `respawnPlayer`,
`enterCombatState`, `stepCombat`, `stepEnemies`), read off the tree with the readers beside them
(`invulnerable`, `canAct`, `deathWindowClosed`, `isCombatState`, `combatStateTicks`) deliberately
absent. A local helper that writes is still caught by the one-hop resolution and needs no entry. The
name list is stated as a narrowing. **Four read-only accept fixtures added** — the boundary Codex
correctly said was untested. CLAUDE.md §3 now carries the correction.

### 4 — medium: `raw.length` is observed stamp changes, not landed hits

`combatFrames.ts:116`, `:183`, `combatDrive.ts:65`

The recorder samples once per animation frame and keeps only the `lastHitTick` visible in that
snapshot, so when catch-up advances several ticks in one frame the intermediate stamps are overwritten
and vanish. `dropped` cannot count them — it only sees events already discovered.

**APPLIED as a rename, not a fix, with the reason stated.** Counting every hit exactly needs a
tick-level event queue on `window.__game`, and **that surface is closed at eight fields by a Phase 1
Codex ruling** — a ninth is a STOP-and-ask, more than a floor assertion is worth. The gate asserts
*"at least N observed combat moments"*, which is true of an undercount; `MIN_EVENTS`, the failure
message and the console line all now say **observed**, never **landed**.

### 5 — low: three comments contradicting the record

**APPLIED.** The transitive-package count (`one` → **three**); the vacuity comment's stated mechanism
(`errorRecovery` yields a partial tree → **it throws**, with the stronger real reason substituted);
and the registry's "seven non-storm mutations" beside an array of eight — the number is now **removed
rather than corrected**, because a count in prose beside a list is a second source of truth that
drifts the moment the list grows, which is exactly what happened when `p95spike` was added.

## Consequential change: three files crossed the 400-line rule

The repairs pushed `tweenCallbacks.ts` (416), `combatFrames.ts` (427) and `effectMutation.ts` (404)
over. **Split on real seams, not by trimming the comments that explain the code** (the rule says so
explicitly):

| new file | seam |
|---|---|
| `tests/unit/tweenOpenings.ts` | *"what will this tween's callbacks run?"* (9.2x) vs *"was the handle kept?"* (9.3) |
| `tests/e2e/combatReduce.ts` | recording what the page did vs reducing it |
| `tests/e2e/mutationRegistry.ts` | declaring which mutations exist vs applying them to a page |

⚠️ **The third split had a trap and it was caught before landing.** `perf-mutation-routing.test.ts`
walks a spec's imports asking *"does anything mention this mutation?"*, and a **declarer** answers that
question for itself — the exact vacuity the gate round already fixed once. `mutationRegistry.ts` was
added to `DECLARERS` in the same change, and the `ghostproof` red proof was **re-run after the split**:
`PASS (4) FAIL (1)` with *"neither phase-09-perf.spec.ts nor anything it imports mentions it"*, then
`PASS (5) FAIL (0)` on revert with the count 1 → 0. *(C1) applies to a predicate whenever its inputs
move, not only when its logic does.*

## Could not check (Codex's own list, verbatim in substance)

- The branch, eight-commit history, worktree cleanliness, or exact diff against `main`.
- Unit, isolated-sim, Playwright, typecheck, build, or test-count claims.
- Positive greenness detection in actual command output.
- Whether each recorded mutation genuinely applied, went red for the named assertion, and reverted
  with both content change and count-dropped-by-one evidence.
- Actual `expect.soft` reporter behavior.
- The reported 32-spark/~85-particle peaks, 8× mutation invariance, 0.0000 ms deltas, or 22–39 ms
  catch-up attribution.
- Held-out performance stability and `p95spike` isolation.
- Runtime reproduction of the rAF phase-edge issue identified above.

**Every one of those is a local verification this session owes**, and the measurements are in
`session-phase-09-debts-02-perf.md`, the gate round in `-03-gate.md`, and the sweep at the end of the
index log. The rAF phase-edge issue was re-verified locally and is now measured per run rather than
argued.

**Codex session ID:** `01a03734-4196-7442-a0da-2391d751a531`
