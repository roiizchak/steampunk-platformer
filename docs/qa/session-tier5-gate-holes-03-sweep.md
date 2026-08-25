# Session log — Tier-5 gate holes, part 3: §3c onward

Continues [session-tier5-gate-holes-02-tweens.md](session-tier5-gate-holes-02-tweens.md). Flat
sibling per CLAUDE.md §6 — `tests/unit/file-size.test.ts` globs `docs/qa/*.md` non-recursively, so a
subdirectory would silently leave the split half ungated.

---

## Batch 8 — §3c, item 5.9: the knob sweep now checks its own regime

### The hole, in the file's own words

`knob-sweep.test.ts` carried a floor at `y: 6000` and a world `heightPx: 8000` — hand-written
constants sitting **directly beneath a docstring about themselves**:

> *"The floor and the window are properties of the tuning, not constants — anything that lowers
> gravity has to move them or this gate quietly stops measuring."*

That sentence exists because the failure happened **three times in one session**: a physics change
moved the saturation point, the geometry did not follow, and the sweep reported a live knob as DEAD
while blaming the knob. Every one of those was caught by a human reading a suspicious green.
**Recording the rule in prose and then hand-writing the constants is the same defect one level up.**

And the sweep's assertion is *"this knob moved something"*. Nothing asserted the scenario was in the
regime where that knob is observable at all.

### What landed

| | |
|---|---|
| **`tests/unit/knobSweepGeometry.ts`** *(new, 110 lines)* | `fallDistance` by the sim's own integration (`player.ts:271`), `tuningEnvelope`, `worstCaseFall`, `longFallGeometry`. The floor and the world are now computed. |
| **`tests/unit/knobSweepScenarios.ts`** *(new, 284 lines)* | The fixture — roster, eleven scenarios, the derived geometry, the regime probe — extracted when §3c pushed `knob-sweep.test.ts` to **415/400**. |
| **`tests/unit/knob-sweep.test.ts`** *(330 → 148)* | The two gates, both reading the one fixture. |

**The derivation, and the one decision inside it.** ⚠️ *One fixed worst case from the WHOLE
perturbation envelope, never re-derived per mutated tuning* — the Codex plan review's round-2
refinement. A per-tuning window would let each perturbation pick the geometry that flatters it, and
the sweep would then be measuring its own scenario generator rather than the knob.

The envelope is **one knob at a time**, because the sweep is (`{ ...DEFAULT_TUNING, [key]: value }`):

| tuning | fall in 100 ticks |
|---|---|
| baseline | 3213.4 px |
| `gravity` ÷2 | 1704.4 px |
| **`gravity` ×2** | **4199.5 px** ← the worst case |
| `maxFallSpeed` ÷2 | 2099.8 px |
| `maxFallSpeed` ×2 | 3408.7 px |

At 1.25× headroom that puts the floor at **y 6030** and the world at **7150 px**, against the
hand-written 6000 / 8000. The hand values were adequate — by 1020 px of slack nobody had measured.
`SPAWN_Y` is read off a real `createWorld` rather than copied, because it is private to
`src/sim/world.ts` and a copy of a private constant is the drift this file exists to stop.

**The two regime preconditions.**

1. `longFall` — the clamp **saturated** inside the window at baseline (`vy === maxFallSpeed`), and
   **nothing landed or died** under *any* tuning in the envelope. Landing converges every
   perturbation on one resting fingerprint; crossing `belowKillPlane` respawns them all to the same
   place. Those are the two ways this scenario has actually failed.
2. `coyote` — the ledge **was** left (`leftGround` fired, and not on tick 0), and the perturbations
   **straddle the press**: `coyoteTicks` 3 / 7 / 14 against a 5-tick wait must not all produce the
   same jump count, or the scenario is on one side of the window for every tuning.

A shared `probe` records the last world and the leave-tick. The alternative was returning a tuple
from all eleven scenarios to instrument two.

### Red proofs — five, each watched failing, each reverted with the count confirmed *(C1, C12)*

| # | mutation | result |
|---|---|---|
| 1 | `FALL_HEADROOM` 1.25 → 0.3 (floor inside the fall) | **2 failed / 15 passed** — regime gate **and** `sweeping maxFallSpeed` |
| 2 | `LONG_FALL_TICKS` 100 → 20 (window too short to saturate) | **2 failed / 15 passed** — same pair |
| 3 | `coyote` never walks off the ledge (`input.right` removed) | **2 failed / 15 passed** — regime gate and `sweeping coyoteTicks` |
| 4 | `coyote` wait 5 → 0 ticks (press inside every window) | **2 failed / 15 passed** — same pair |
| 5 | 🔴 **`FALL_HEADROOM` 1.25 → 0.9** — *only* the `gravity ×2` arm lands | **1 failed / 16 passed** |

🔴 **Proof 5 is the one that justifies the gate.** In proofs 1–4 the sweep goes red too, so the new
tests are *diagnosis* — they name the cause the human previously had to find. Proof 5 is the case the
sweep **structurally cannot see**: one perturbation of one knob silently leaves the regime, every
knob still moves *something* in *some* scenario, and all twelve sweeps stay green. The regime gate
was the only thing that failed, with the floor and world height in its message:

> *a perturbation LANDED inside longFall (floor y 4560, world 5680 px). Every tuning that lands
> converges on one resting fingerprint, so the scenario stops discriminating.*

Reverts confirmed by *content changed AND the original count dropped by one* each time, and the file
returns to **17 passed** after every one.

### Not done

The plan noted the existing "can fail" proof at the file's foot covers `gravity` × `jumpHeld` only.
It is untouched — widening it is a separate question from §3c's, and proof 5 above already
establishes the sweep's blind spot more directly than a second sensitivity check would.

**Verified:** typecheck clean · `knob-sweep.test.ts` **17 passed** · full unit suite **167 files /
2486 tests** (2484 baseline **+2**, the two regime tests; the two new modules are helpers, not spec
files, so the file count is unchanged) · `file-size` green with the three files at 148 / 284 / 110.
