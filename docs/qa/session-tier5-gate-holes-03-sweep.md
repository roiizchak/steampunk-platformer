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

---

## Batch 9 — §3d, item 5.20: the HUD's inter-element spacing is gated

`hudFits` checks two things: everything is on **screen**, and the bar is inside its own **plate**.
Nothing checked the space *between* elements — and `src/render/hud.ts:61` says so in as many words:
*"no gate checks spacing between HUD elements (item 5.20)."* `COUNTER_GAP`, the constant that
produces that spacing, had **zero test references repo-wide**.

### 🔴 `COUNTER_GAP` stays private — the Codex plan review's correction, and it is the point

The obvious fix is to export it and assert `gap === COUNTER_GAP * scale`. **That proves nothing.** An
assertion derived from the same implementation constant moves whenever the constant moves, so it can
never disagree with the code: the shape of a gate with the substance of a restatement. `src/` is
untouched by this batch.

The three claims are independent and geometric, and all run at **every supported size** because what
breaks is the scaling, not one viewport:

1. **Nothing overlaps anything** — a rectangle intersection test. No tolerance, no constant.
2. **A readable gap survives** — `MIN_ELEMENT_GAP_PX = 8`, a *refusal* bound in the sense
   `MAX_LEVEL_CREATE_MS` is: chosen to say what is unacceptable, not fitted to what is measured. The
   shipped design gaps are **24** and **12** px, so 8 sits below both with headroom and forbids
   "touching, overlapping or crowded" without forbidding a future tightening. Scaled with the layout,
   so at 852×480 the floor is 3.56 px against a 10.7 px actual.
3. **The assembly holds together vertically** — the icon and the counter's ink both sit *within* the
   plate's vertical span. A containment claim, not a copy of the centring formula.

⚠️ The counter's **width** is not asserted and cannot be: only the engine can measure rendered text,
which is why `hudFits` takes `counterW` as a parameter. Its width extends rightward, away from every
other element, so the inter-element claim is about its **origin** — the right edge is already
`hudFits`'s job. The plan flagged the same limitation from the e2e side: `hudHelpers.ts:129` returns
full rects for the plate and counter but gives `gearIcon` only `x`, `y`, `willRender`, so a live
spacing assertion would need icon dimensions added first. **Not done — this stays a unit check**,
which is where the layout function lives anyway.

### Red proofs — three, all against real `src/render/hud.ts` mutations *(C1, C12)*

| # | mutation in `src/` | result |
|---|---|---|
| 1 | `COUNTER_GAP` 24 → **0** | **3 failed / 30 passed** — *"only 0.0 px between the plate and the gear icon"*, at all three sizes with three different scaled floors |
| 2 | `COUNTER_GAP` 24 → **−40** | **3 failed / 30 passed** — *"the gear icon is drawn ON TOP of the health plate"* |
| 3 | gear icon un-centred (`plate.y + plate.h/2 − iconSize/2` → `plate.y − iconSize`) | **3 failed / 30 passed** — *"the gear icon rides above the plate"*, −48 against a floor of 24 |

Each reverted with `git checkout --`, the original count confirmed back at 1, and the file returns to
**33 passed** after every one. `git status src/` clean.

**Verified:** typecheck clean · `hud-layout.test.ts` **33 passed** (29 + 4: three sizes plus the C2
red proof) · full unit suite **167 files / 2490 tests** · `hud-layout.test.ts` at 381/400.
