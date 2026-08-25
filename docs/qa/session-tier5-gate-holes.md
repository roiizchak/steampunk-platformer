# Session — Tier 5, the gate holes, and §1a's catch-up criterion

Branch `session-tier5-gate-holes`, off `main` at `aaa5399`. Plan approved after **three Codex plan
review rounds** (thread `01a0391f-739c-7fe0-8d00-cd19883d8d36`, `gpt-5.6-sol` at high effort), all
three returning REVISE and all findings applied or recorded.

**Starting baselines** — unit **2465 / 164 files**, e2e **130**, `test:sim-isolated` 2462 + 3 skipped,
typecheck clean. ⚠️ These are *starting* figures, not expectations: this session adds tests, so every
batch states its own expected count as `baseline + added` and asserts it. Carrying a fixed count
forward is how a run that selected nothing reports `PASS (0)` and exits 0.

---

## What recon killed before any work started

Three parallel Explore agents verified every open claim against source; each finding was then
re-verified locally. **Four of the items on the list were wrong about themselves** — the same rate the
2026-08-23 session recorded.

| item | recorded as | verified |
|---|---|---|
| **5.26** | `hudGearPop.destroy()`'s idle branch has no fixture | ❌ **STALE.** `hudGearPop.ts:130-136` is one unconditional path — the branch was removed — and `hud-gear-pop.test.ts:237-247` is a fixture whose comment names this exact item. The "wrong test file cited" half resolves to nothing on the tree. |
| **5.17** | no e2e took the frozen-clip failure mode | ❌ **FALSE.** `phase-05-combat.spec.ts:204` samples `anims.currentFrame` once per rAF and asserts `distinctFrames > 1`. The real remaining defect is **R4**: that assertion is weaker than its title — a walk pinned to frames 0 and 1 passes on a 12-frame sheet. |
| **PRD row 9** | its three "owed forward" items all landed in `7c04a63` | ⚠️ **HALF WRONG.** `phase-09-perf.spec.ts` still has **one** `test()`; the split never happened, `expect.soft` landed instead, and the spec itself records *independence* as unachievable. D9's wait and 9.3's bypasses did land. |
| **5.3** | the algebra was "accepted and never applied" | ⚠️ **MISLEADING.** `effectSweep.ts:97-108` is an explicit, data-backed **refusal** to move the floor, not an oversight. Whoever reopens it is arguing with a written argument, not filling a gap. |

---

## Batch 1 — §3g, the Playwright project-selection invariant

**Not on any open-items list.** Found during recon, and it is the project's own most-bitten failure
mode sitting ungated.

`playwright.config.ts` states the rule **twice, in prose**, at `:113-116` and `:161-164`:

> *"`testIgnore` and `testMatch` below are the SAME pattern and must stay identical — a file that
> matches neither runs nowhere, and a file that matches both runs twice, once on the rasteriser its
> assertions are meaningless on."*

**Nothing executed it.** A spec matching neither project reports `expected: 0, unexpected: 0` and
exits 0 — indistinguishable from a clean pass unless the count is read.

### What shipped

`tests/unit/playwright-projects.test.ts`, 4 tests. It reads the config as **raw source** rather than
importing it: importing would pull `@playwright/test` and `devices` into the unit suite, which
`npm run test:sim-isolated` runs with Phaser uninstalled, and that is a new coupling for no gain.

It extracts four patterns by project block and asserts:

| # | assertion |
|---|---|
| 1 | all four patterns extracted — the vacuity guard |
| 2 | `chromium.testIgnore` ≡ `chromium-gpu.testMatch` |
| 3 | `chromium-gpu.testIgnore` ≡ `chromium-dpr2.testMatch` |
| 4 | every `*.spec.ts` is selected by **exactly one** project |

Assertion 4 is not a tautology. With `P` the shared pattern and `D` the DPR-2 pattern, the three
projects select on `!P`, `P && !D`, and `D`; summing over the four `(P, D)` cases gives 1, 1, 1 and —
for `!P && D` — **2**.

### The red proofs *(C1)*, three of them, one per rule *(C2)*

**Mutation 1 — the one-sided pattern edit, which is how the defect actually happens.**
`5-perf|` → `5-perf|5-combat|` on `playwright.config.ts:130` (chromium's `testIgnore` only).

```
PASS (2) FAIL (2)
  chromium's testIgnore and chromium-gpu's testMatch are the SAME pattern
  every e2e spec is selected by EXACTLY ONE project
    phase-05-combat.spec.ts -> NOWHERE
```

🔴 A **shipped spec** silently stopped running. Reverted: `5-combat|` count 1 → 0, original pattern
count 1 → 2, `git diff` empty *(C12)*.

**Mutation 2 — the mirror drift.** `phase-06-dpr2` → `phase-06-dpr2x` on `:170` (chromium-gpu's
`testIgnore` only). Count `dpr2..spec` 2 → 1.

🔴 **This one found a defect in the gate itself, and it is worth recording.** The first draft reddened
**only** assertion 3 — assertion 4 stayed green. The reason: the selection model used `dpr2Match` for
chromium-gpu's exclusion *because the two are supposed to be mirrors*, which made it blind to a drift
in the very value it was modelling. **Modelling a project by the value it is SUPPOSED to have rather
than the one it HAS is how a gate ends up asserting its own assumption.** Fixed to read all four
extracted values independently; re-run under the same mutation:

```
PASS (2) FAIL (2)
  chromium-gpu's testIgnore and chromium-dpr2's testMatch are mirrors
  every e2e spec is selected by EXACTLY ONE project
    phase-06-dpr2.spec.ts -> chromium-gpu + chromium-dpr2
```

The DPR-2 spec running twice, once at DPR 1 — passing while measuring the exact case inventory 2b.6
says is untested. Found only by building the mutation the file's own claim names.

Reverted: `dpr2x` 0, `dpr2..spec` back to 2, **PASS (4)**.

**Mutation 3 — the vacuity guard.** Renamed the project `chromium-gpu` → `chromium-webgl`, a realistic
refactor.

```
PASS (0) FAIL (4)
  extracted all four patterns — the config shape has not drifted out from under this gate
    expected 2 to be 4
```

The whole file reds rather than comparing `null` to `null` and passing — the correct direction for a
source-text gate. Reverted: name count 0 → 1, `chromium-webgl` 0, `git diff` empty.

### Verification

`npm run typecheck` clean. `npm test` → **165 files / 2469 tests**, against the 164 / 2465 baseline:
**+1 file, +4 tests, asserted rather than assumed.**

### What this gate does NOT do

- It reads **source text**, so a config refactor (a pattern hoisted to a `const`, a project renamed)
  reds it rather than passing. That is deliberate and mutation 3 is the proof, but it means the file
  is a maintenance cost on `playwright.config.ts`'s *shape*, not only its values.
- It cannot see a spec excluded by a mechanism other than these three patterns — a `grep`-level
  `test.skip`, or a `testDir` change.
