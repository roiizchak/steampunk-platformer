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
