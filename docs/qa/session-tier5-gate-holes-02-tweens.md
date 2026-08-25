# Session — Tier 5 and the gate holes, part 2: the tween boundary

Flat sibling of [session-tier5-gate-holes.md](session-tier5-gate-holes.md), split at 359 lines per CLAUDE.md §6. Batches 1–3 and the recon findings are in the index file.

---

## Batch 4 — §2b, D14: `this.add.tween(config)`, the entry point six rules could not see

`add.tween(config)` is a real Phaser 4.2.1 API — a factory at `phaser.d.ts:26869` and a creator at
`:28201` — that opens a tween with the identifier `tweens` appearing **nowhere in the expression**.
Every tween rule in the project keyed on that identifier.

| rule | where it keyed on `tweens` | closed by |
|---|---|---|
| 9.3b — handle held individually | `TWEENS_ADD` regex | a second alternative |
| 9.3c — a file that opens a tween must stop one | `code.includes('tweens.add')` | new `OPENS_A_TWEEN` |
| **9.3d — parser arm** | `TWEEN_METHODS` lacked `tween` | `namesSceneFactory` |
| 9.2 / 9.2b / 9.2c — callback rules | `TWEEN_CALLS` regex | a second alternative |

⚠️ **The gate log's list was one short, and it is corrected here.**
`session-phase-09-debts-03-gate.md:64` names 9.3b, 9.2, 9.2b, 9.2c and **omits 9.3d**, which is
genuinely bypassed — `isTweenCall` rejected on the method name *before* it ever reached the object
test. `SESSION-PROMPT-next.md:66` had it right. **Six rules, not five.**

### The recorded blocker was smaller than it looked

D14 was carried as *"closing it means resolving what `add` is bound to, a different machine from a
pattern."* It is the same machine. **`tween` is unique to the factory and creator** — `TweenManager`
has no `.tween()` — so the method name alone selects the entry point, and `namesTweenManager` was
already an alias-resolving name test. The change is ~15 lines across four files; the cost was the
fixtures, exactly as predicted.

### The asymmetry that keeps this from being a widening

`namesTweenManager` matches a **bare** `tweens` identifier. `namesSceneFactory` deliberately does
**not** match a bare `add` — it requires a member access (`this.add`, `scene.add`) while still
resolving an alias bound to one.

🔴 **That constraint is the Codex plan review's, and it is the difference between closing a bypass and
widening a rule.** `add` is an ordinary English word; an unrelated object exposing a `tween` method is
not Phaser's factory, and reddening it would strengthen the rule onto code it was never about. Two
acceptance fixtures pin it — one against the parser arm, one against the regex arm.

**This is a bypass closure, not a rule change.** The rule (9.2/9.3) is unchanged; what changed is that
a documented way *around* it no longer exists. Contrast §2a, where growing the enforcement set really
would broaden what the rule reaches — which is why that one needed the owner's ruling.

### Where it lives

The D14 pin test moved out of `tween-boundary.test.ts` into a new sibling,
**`tests/unit/tween-add-factory.test.ts`** (109 lines, 4 tests). That file was at **380/400** and the
fixture family would have burst it — the extraction the plan named, done as part of the work rather
than discovered at the end.

The old test *pinned the absence* and asserted `unbound('this.add.tween(…)') === 0` — i.e. it asserted
**the rule could not see it**. That assertion is now inverted; the absence check is kept but demoted to
informational, because it is no longer what carries the criterion.

### The red proofs *(C1)*

**Parser arm.** Replaced `if (method === 'tween') return namesSceneFactory(...)` with a comment
(`namesSceneFactory` refs 3 → 2):

```
PASS (2) FAIL (2)
  the parser arm SEES `this.add.tween({ onComplete })` — expected +0 to be 1
  an ALIAS of the factory is resolved — expected +0 to be 1
```

The acceptance fixture stayed green throughout, which is correct: it must never red from this
mutation. Restored by editing the line back — **not** `git checkout`, which would also have reverted
the real fix.

**Regex arm.** Removed the `.add.tween` alternative from `TWEENS_ADD`:

```
PASS (17) FAIL (1)
  9.3b — REJECTS the other FOUR tween-opening methods — expected +0 to be 1
```

Restored; 43 passing across the four tween files.

### Verification

typecheck clean. Unit **166 files / 2476 tests** against 165 / 2473: **+1 file, +3 tests** — four new
minus the retired D14 pin. Asserted, not assumed.

⚠️ **`tweenCallbacks.ts` is now at 390/400.** §2a adds identity resolution and a completeness gate to
that same file, so the `tweenIdentity.ts` extraction the plan named is **not optional and must happen
first**.

---

## Batch 5 — §2a, `SIM_MUTATORS`: identity first, then 6 names to 32

**The rule was not "a future export will be invisible". It was already 81 % incomplete.**

Measured with the project's own parser over `src/sim/`:

| | count |
|---|---|
| exported functions | **86** |
| write to one of their own parameters | **26** |
| transitive closure (pass an own param to a known mutator) | **32** |
| listed in `SIM_MUTATORS` | **6** |

`tick(world, input)` — the most obviously param-mutating function in the simulation — was **not one of
the six**.

### Stage 1, and why it had to come first: identity, not collision

`SIM_MUTATORS` is a set of bare identifiers matched against a callee name. Growing it to 32 ordinary
verbs — `tick`, `advance`, `enterState`, `resolveState` — would make **any local helper sharing a
name** illegal. That is enforcement by name collision, structurally broader than the authorised rule
(*"a sim object passed to a `src/sim/` mutator"*), and it is the same shape as the widening a
2026-08-25 repair slipped past review once already.

So `simImports(ast)` now resolves the callee to an actual `src/sim/` import before the rule fires —
alias-aware (`import { damagePlayer as hurt }` records `hurt`) and type-import-aware (a `import type`
cannot be called at runtime). **The owner ruled this ordering explicitly**, on the Codex review's
evidence, and it is load-bearing rather than stylistic.

Two acceptance fixtures pin it: a local `function stepEnemies(w)` is **not** reported, and neither is
a type-only import. The existing red-proof fixtures gained the `import` line they had always implied —
without it they were calls to some unknown local, which the rule now correctly declines to claim.

### Stage 2: a reviewed manifest with a completeness gate, NOT a derived set

The set is not computed and used directly, and the reason is that **the two error directions are not
symmetric**:

- a **missing** name under-reports — a gap, which the tripwire names;
- an **over-inferred** name is a **false red on legal production code**, and this project's history is
  that a false red on a blocker rule gets the gate edited rather than the code fixed.

So `deriveSimMutators()` is a tripwire, not the source of truth. `EXCLUDED` (empty today) carries a
written reason per entry, so a future disagreement is recorded rather than settled by quietly editing
the manifest — the same move as clearing a red hash by editing the hash.

A full interprocedural alias-aware closure was **considered and rejected**, for precision as much as
size: more inference means more false reds in the one direction that hurts.

### The derivation's rule, and the case that shaped it

*Writes to one of its own parameters, **or** hands one of its own parameters to something already
known to be a mutator.*

🔴 **The second clause says "one of its OWN parameters" because of a measured false positive.** The
first draft asked only *"does it call a mutator?"* and reported **`derivedFeel()`**
(`src/sim/derived.ts:95`), which calls `advance(jump.world, …)` on a scratch world it builds itself —
pure from the caller's view. That would have put a pure function into a name-matched rule. Requiring
the argument to be the caller's own parameter drops it and drops nothing real: 33 → 32.

The transitive clause is not decoration — six names have **no direct write at all**: `advance`,
`advanceSplit`, `applyPlayerAttack`, `freezePair`, `nextFloat`, `resolveState`. Five of those six are
exactly the ones the Codex plan review named.

### The red proofs *(C1)*

**Mutation A — a real mutator missing from the manifest.** Deleted `'tick'` from `SIM_MUTATORS`:

```
PASS (6) FAIL (1)
  every derived mutator is either in the manifest or EXCLUDED with a reason
    ... never silently: tick
```

**Mutation B — identity resolution removed.** Deleted `&& imported.has(direct)`:

```
PASS (12) FAIL (1)
  ACCEPTS a LOCAL helper that merely SHARES a name with a sim mutator
    a local helper was reported as a sim mutator purely because of its NAME
```

That is the widening the owner ruled against, demonstrated rather than asserted. Both reverted with
the count restored *(C12)*.

The gate also carries its own synthetic red proof (a fabricated `src/sim/` source) and an acceptance
proof (a function mutating only locals), so each direction of the derivation is demonstrated.

### Verification

typecheck clean. Unit **167 files / 2484 tests** against 166 / 2476: **+1 file, +8 tests.**
🔴 **The whole suite is green with 32 names — no production file false-reds.** That was the risk the
identity work existed to remove, and it is measured rather than assumed.

`simMutators.ts` 195, `tweenCallbacks.ts` 351, `sim-mutator-manifest.test.ts` 110 — all inside the
400-line rule.

### What this does NOT do

- **The manifest is still a human artifact.** The tripwire says when it has fallen behind; it does not
  decide membership.
- **The derivation reads exported `function` declarations only.** `src/sim/` has no exported arrow
  consts — checked, 86 of 86 are plain declarations — so there is no second shape today, and a future
  `export const f = (w) => …` would be invisible to the tripwire. Recorded, not closed.
- **`readonly`-typed parameters are not distinguished**; a write through one is a type error caught by
  `tsc`, not here.
