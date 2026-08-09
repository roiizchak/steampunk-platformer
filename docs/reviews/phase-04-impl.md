[← reviews index](../reviews/) · [phase doc](../prd/phase-04-art.md) · [QA log](../qa/phase-04-art.md)

# Phase 4 — Codex implementation review (criterion 4.18)

**Run:** 2026-08-08, on `phase-04-art` at `403c289` (26 commits, 83 files) against `main` at
`35dd22c`. `--wait --resume`, so the reviewer had already seen the plan.

**Verdict: BLOCK.** *"The sheet-baseline and ground-cap fixes are fundamentally sound, but Phase 4
does not derive runtime FPS from the simulation, and malformed level catalog entries can still
recreate the boot hang."*

⚠️ **Codex ran nothing.** Its sandbox cannot spawn processes on this machine, so it read committed
blobs through `node_repl` + `fs.readFileSync` and said so on every finding. **Every claim below was
re-verified locally**, and the two blockers were re-verified by mutation.

---

## Disposition — every finding applied, or recorded with a reason *(C11)*

| # | Severity | Finding | Disposition |
|---|---|---|---|
| 1 | BLOCKER | **Runtime fps comes from the catalog, not from `animTimings()` — and the scene's own comment claims otherwise.** `GameScene` does not import `animTimings`; `registerAnimations` passes `frameRate: sheet.fps`. | **Confirmed, comment corrected, derivation deferred with a reason.** Verified by grep: the only occurrence of `animTimings` in that file was inside the false comment. I had read that comment earlier this session and believed it. The claim that retuning `runMax` changes the animation on the next boot is false. **Not a silent-drift risk**, which is the part Codex could not weigh: `asset-catalog.test.ts` derives fps from the live `DEFAULT_TUNING` and the shipped strides and asserts equality per animation, so a retune without a rebuild turns that suite RED. Deriving at runtime needs the per-cycle strides, which live in `character-bounds.json` and have no catalog field — adding one touches `describeCatalogProblem`, every boot fixture and `verify-dist`. Deferred deliberately inside a phase already reported failing. |
| 2 | BLOCKER | **`verifyLevels` can still throw during problem collection.** `levels: [null]` is an array, passes the `Array.isArray` check, then `entry.key` throws — reproducing `ready:false / bootError:null`. | **Confirmed and FIXED.** This is the same hang I fixed in `verifySheets`, and Codex is right about why it survived: **the fix had been applied to the instance rather than to the class.** `verifyLevels` now guards on `describeCatalogProblem` like its two siblings. Watched fail: removing the guard produces `TypeError: Cannot read properties of null (reading 'key')` and a 20 s timeout on the terminal state — the hang, exactly. |
| 3 | MAJOR | **The malformed-entry fixture cannot reach the behaviour it names**, because it omits `sheets` and boot refuses for that first. | **Confirmed and FIXED.** Rewired through `catalogWith(page, { images: [null] })`, and a new `levels: [null]` spec added for finding 2. |
| 4 | MAJOR | **4.16 fails: ten files over 400 lines**, eight of them crossing in this phase. The QA table's figure for `phase-03-tilemap.spec.ts` is stale (496, recorded 431). | **Confirmed; table corrected.** Already reported FAIL in the QA log. The staleness is real and mine — I added the vertical-follow test after writing that section. |
| 5 | MAJOR | **The documented clean-clone pipeline does not exist.** `ASSET-PIPELINE.md` promises `assets:fetch` and `assets:verify`; `package.json` defines neither, and `build-assets.mjs` does not write `index.json`. | **Confirmed, recorded, not fixed.** This is the mechanism behind 4.11 being unachievable, and it explains why the runtime consumes a hand-maintained catalog. A real find: an error message in `build-assets.mjs` instructs the user to run a command that does not exist. **Decided 2026-08-09: 4.11 re-scoped to packing determinism**, and the promised workflow recorded as
its successor rather than built inside this phase. The misleading error message in
`build-assets.mjs` stands as a real, unfixed defect against a command that does not exist. |
| 6 | MAJOR | **Gym edits made before the async config fetch resolves are silently discarded** — `loadConfig` replaces the whole edit object. | **Confirmed, recorded, not fixed.** Real, and narrow: the window is one fetch of a local file, and the readout then shows the file's value rather than the lost edit, so it is invisible rather than loud. Recorded as a Phase 5 item alongside the other Gym work; the honest reason for deferring is that the fix belongs with disabling the controls until load reaches a terminal state, which is scene work this phase should not start. |
| 7 | MAJOR | **4.23 does not test the surfaces it names** — the pillar and the three platform tops are never reached. | **Confirmed; already recorded in lane C.** The e2e proves the drawn-vs-sim invariant continuously across takeoff, flight and landing, which covers the mechanism; it does not place the player on a named platform. Independently reaching the same conclusion as the hands-on lane. |
| 8 | MAJOR | **The `dropCastShadow` height guard does not distinguish a legitimate component at or below 4%.** | **Accepted as a real residual limit.** The guard moved the failure mode from "a boot can be deleted" to "a component under 4% of the figure can be deleted". Measured no-op on today's art. Recorded rather than pursued: the alternative Codex suggests — no automatic destructive removal on protected states — reintroduces the cast shadow the guard exists to remove, and choosing between them is an art decision. |
| 9 | MAJOR | **4.20 is still false as written**; the test exempts `idle` rather than the PRD doing so. | **Confirmed and now RESOLVED.** The test's exemption is correct behaviour and the PRD text was wrong; I flagged it for approval rather than editing it silently, and **the phase owner approved the amendment on 2026-08-09**. The criterion now names the exemption as a *pinned per-animation expectation*, explicitly not a blanket tolerance — a tolerance would have let a revert to per-frame anchoring pass unseen, which is the regression 4.20 exists to catch. |
| 10 | MAJOR | **Gate self-tests are not guaranteed to run before real-art judgment.** | **Confirmed; already recorded** from the qa-expert brief-2 pass. |
| 11 | MINOR | **The centroid oracle rounds to three decimals before an exact assertion**, so a future centroid near a half-pixel boundary could produce a false red. | **Accepted, recorded.** A latent false-red rather than a false-green, which is the safe direction, but real. |
| 12 | MINOR | **CLAUDE.md still publishes the pre-Phase-4 contract** — 32 px grid, scale 2, 44×96 character — against the shipped 96 / 6 / 132×288. The false per-frame floor rule survives in GENERATION-LOG history and the session handoff. Also `fall` is missing from the phase scope list. | **Confirmed and FIXED for the live documents.** The historical entries are marked superseded rather than rewritten. |

**Nothing was ignored.** Findings 5, 6, 8, 9 and 11 are recorded with reasons rather than fixed; the
rest are applied.

---

## What Codex confirmed, which is worth as much as what it found

Its "specific rulings" section independently verified several things this phase asserted:

- **`src/sim/` is clean.** No executable import or use of Phaser, `Date.now`, `Math.random` or the
  DOM in any committed `src/sim/*.ts` — the matches are comments. Timing knobs are integer ticks. No
  float-of-seconds duration anywhere.
- **`packStrip`'s arithmetic is sound**, including that the centroid branch subtracts *the same
  rounded `drawnHeight` used by placement* — which is precisely the bug I shipped and then fixed
  mid-session — and that the overflow guard throws before the copy loop rather than after.
- **The camera change is justified**, with the 2112 / 1920 / 200 arithmetic re-derived from the
  level file rather than taken from my comment, and the new vertical-follow test judged *capable of
  failing when vertical lerp is zero*.
- **The lift-profile oracle is not tautological for packing**, though `liftPx` itself is copied from
  `packStrip`'s return — the same ceiling the qa-expert brief found, reached independently.
- **The Gym's dev-only containment is structurally present in all five places.**
- **Half-open overlap is correct**, and an inclusive test would invert every cap.

---

## The one place two reviewers disagreed, and the tiebreak

Codex says the ground-cap level test "would pass if `applySurfaceTiles()` were deleted". That is
true of *that* test and false of the criterion: the drawn-index e2e assertions added after the
code-reviewer's brief-1 finding F1 do catch a deleted call site — verified by mutation, which
reproduced *col 24 lost its brass cap under the spikes*. Codex names those assertions in the same
paragraph, so this reads as a scoping nuance rather than a disagreement about fact.
