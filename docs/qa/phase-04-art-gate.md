[← Phase 4 QA log](phase-04-art.md) · [QA-LOG index](../QA-LOG.md)

## Lane A — `voltagent-qa-sec:qa-expert`, brief 1

Every finding re-verified locally before being accepted *(a subagent's summary is a claim, not
evidence)*. Two of them corrected a verdict I had already written as PASS.

| # | Finding | Disposition |
|---|---|---|
| 1 | **4.2b unmet, and the project's own log says so.** A nine-clip batch ran before any invoice reconciliation. | **Accepted.** Already the phase's top blocker. Nothing to change — the record was already correct, which is the point of having one. |
| 2 | **4.19's oracle is narrower than "independent".** The manifest's `liftPx` is `packStrip`'s own returned value, so the gate guards the PACK step, not the MEASUREMENT step: a systematic bug in `figureMetrics` would move the manifest and the sheet together. | **Accepted, ceiling recorded.** Verified: `build-assets.mjs` writes `liftPx` straight from the `frames` array `packStrip` returns. What *is* independent is real — the suite re-measures the shipped PNG's pixels with a function defined only in the test file and demands exact equality, which is what catches a placement bug diverging from its own reported lift. The distinction is now stated rather than implied. |
| 3 | **4.10's instrument has never been run against real art.** `gateReachBand` is called only from `selfTest()` and the unit fixtures. | **Accepted → 4.10 is UNRUN.** Verified by grep: no call site against the `brass-courier` sheets anywhere, and no result recorded in any log. The instrument is proven to work; the audit it exists for has not happened. |
| 4 | **4.27 was satisfied after the fact, not before.** The anchor's sole offset was found from the user's report, post-ship; no code measures an anchor's contact geometry before it is used. | **Accepted → my PASS was wrong, corrected to FAIL below.** The defect is genuinely fixed and verified in-game, but the criterion asks for a pre-generation measurement and there is no such step. A one-off manual correction is not a gate. |
| 5 | **4.20 does not hold for `idle`, and a regression could hide there.** Every one of idle's twelve frames measures a lift of 0, so "at least one other frame does not reach the final row" is literally false for it — and a revert to per-frame anchoring would be indistinguishable from correct behaviour inside that sheet. Nothing asserted a non-zero lift on `jump` or `fall` at all. | **Accepted and FIXED.** Verified: `idle 0×12`, `walk max 6`, `run max 17`, `jump max 54`, `fall max 16`. Idle's flatness is correct — the courier breathes without lifting a boot — so the fix is to assert it as a deliberate expectation and to assert a non-zero lift on the four animations that DO leave the ground. Watched fail: flattening `jump`'s lifts to zero turns the new assertion red, plus two existing ones; reverted byte-clean. |
| 6 | **`selfTest()` is not wired into the build.** `art-gates.test.ts` says it lives beside the gates "so the BUILD runs it too", but no build script calls it. | **Accepted, recorded, not fixed.** Verified by grep: zero call sites in `build-assets.mjs`, `build-world.mjs`, `build-clips.mjs`, and no `pre` hook in `package.json`. "Gates self-test before judging real art" is currently enforced by remembering to run `npm test` first. The comment claiming otherwise is now the misleading part. |
| 7 | **`docs/qa/phase-04-art.md` does not exist**, so five code comments cite a C11 record that is absent. | **Already resolved, and the agent read a pre-commit tree.** This file was created in `ef7b915`, after the agent started. Kept in the table rather than deleted, because "the reviewer saw an older tree" is a thing to notice, not to hide. |
| — | **4.12 has the right shape but was never exercised.** `findSource` throws on a missing or ambiguous action, but no test covers it and no log records the "deliberately remove one" run being watched fail. | **Accepted → 4.12 is UNRUN**, not passing. The agent explicitly declined to call it green from the code shape alone, which is the correct call. |

**What the agent could not check, preserved** *(vault 9.3)*: the real invoice; whether 4.12's manual
removal was ever performed; the contents of the QA log that did not yet exist; the e2e-owned
criteria, which are not its; and 4.11, which it confirmed is not implemented as an automated gate —
only design-intent comments about deterministic encoding exist, with no test that clones fresh,
rebuilds and diffs bytes.

## Lane A — `voltagent-qa-sec:code-reviewer`, brief 1

| # | Finding | Disposition |
|---|---|---|
| F1 | **HIGH — 4.22's predicate is proven, its call site is not.** Reverting `GameScene.applySurfaceTiles` to the original `layer.getTileAt` leaves every unit test green: `ground-tiles.test.ts` imports the pure function and never reads a drawn tile index, and the nearest e2e assertion (`index > 0`) is satisfied by `BRICK_GID` as happily as by `SURFACE_GID`. | **Accepted and FIXED.** Verified by mutation: with the shipped bug reintroduced, **464 unit tests passed** — only an incidental unused-variable typecheck warning noticed. So the gate for 4.22 could not see the defect 4.22 exists for. Two e2e tests added asserting the DRAWN index: `SURFACE_GID` on the four ground cells under the spike run, `BRICK_GID` one row down, and `BRICK_GID` under the pillar so the first assertion is a discrimination rather than "everything is capped". Watched fail — *col 24 lost its brass cap under the spikes* — then reverted clean. |
| F2 | **HIGH — 4.16 fails, and this log's own accounting was wrong.** `phase-01-boot.spec.ts` was 399 on `main` and crossed to 426 **inside this diff**, so it is the newest breach, not an inherited one. | **Accepted, and the section corrected.** Re-measured independently against `origin/main`; the agent's numbers reproduce exactly. My "six of the nine predate this session" was wrong: only two files were over on `main`. |
| F3 | **MEDIUM — the Gym's edits are never seeded from the config it saves over.** `serialiseBounds` assigns rather than merges, so nudging one field would silently discard every other value the file held. Latent today (all zeros), live the moment Phase 5 fills `activeFrames`. | **Accepted and FIXED.** The seeding is now `editsFromConfig` in `src/render/gymBounds.ts` — engine-free and unit-tested, which is also what took `GymScene.ts` back under 400. Six new tests, including one asserting the **pre-fix behaviour explicitly**, so the fix's test cannot pass merely because today's config happens to be all zeros *(C2)*. `revert()` now returns to the file's values rather than to zero. |
| F4 | **LOW — `this.action` is untested string surgery.** `sheet.key.split('-').pop()` yields `heavy` for `attack-heavy`. | **Recorded, not fixed.** Mitigated as the agent says: `serialiseBounds` throws *"edit for 'heavy', which character-bounds.json does not declare"*, so it fails loudly rather than writing garbage — which is the A4-relevant property. Revisit when Phase 5 adds a multi-word action. |
| F5 | **INFO — 4.6 satisfied in fact, not only in policy.** `keepLargestComponent` is never called anywhere in the pipeline, and its guard is inside the function so no call site can bypass it. Measured on the real clips, every survivor is one whole figure per frame and everything the 256 px floor removes is <=48 px; no cell is multi-component, so `dropCastShadow` is a no-op on today's art. | **Accepted.** This is the strongest form of the criterion and the measurement is the part worth keeping. |
| F6 | **INFO — the camera-predicate change is legitimate and covered.** Independently re-derived the 2112 / 1080 / 1920 geometry and confirmed the two predicates were jointly unsatisfiable; confirmed the three new unit fixtures cover excused-flush, rejected-non-flush and never-excused-off-screen. | **Accepted.** An independent reviewer reaching the same conclusion is what a contract change to another phase's criterion needed. |

**Corrections the agent made to itself, kept because they are the interesting part:** its first
`ls docs/qa/` came back truncated and it *nearly* reported `phase-04-art.md` missing — it re-checked
with `git ls-tree` and caught itself. The other agent, reading an earlier tree, did report it
missing. Same file, two reviewers, opposite conclusions, and the difference was one re-check.

**What it could not check, preserved** *(vault 9.3)*: it did not run `test:e2e` or `build`, so the
seven repaired 1.5 specs and 4.26 rest on the parent's evidence; its 4.22 mutation was replicated
out-of-tree rather than applied, so it did not see vitest report red; it has no runtime evidence of
the Gym at all, so F3 is read from code, not observed, and 4.14/4.25 are untouched by it; and it did
not audit the ~8,000 lines of generator internals owned by the other agent's criteria.

## The e2e suite went red at the close of the phase, and the code was not the cause

Found while taking the final verification run before STOP-for-approval. **29 failed / 15 passed** on
an invocation that had been 44/44 green earlier the same day, against **byte-identical source** — the
only commits in between were documentation.

**What it was not.** Not the code (`git diff --name-only` since the green run is `docs/` only, working
tree clean). Not a stale dev server *(vault C13)* — the port was verified free and the run repeated
red. Not leaked processes — counts were identical before and after. Not machine starvation — 18 % CPU,
9 GB free. The game booted correctly in a real browser at the same moment: `ready:true`, tick 478,
player grounded, console clean but for a `favicon.ico` 404.

**What it was.** Every boot loads **34.5 MB of PNG**, 21.4 MB of it the three parallax layers
(`mid.png` alone is 9.1 MB). Phases 1–3 booted greybox art measured in kilobytes. **This phase's real
art silently invalidated the suite's parallelism budget** — 8 concurrent Chromium instances each
pulling 34.5 MB through one vite dev server, each with a 20 s boot bound. One run surfaced
`ECONNRESET` on `GET /assets/index.json`, which is the server dropping a connection rather than the
game hanging.

| workers | result |
|---|---|
| 8 (Playwright's default here, 16 logical cores) | **29 failed / 15 passed** |
| 4 | failed |
| 2 | failed |
| 1 | **44 passed**, twice, ~260 s |

**Fixed by pinning `workers: 1`** in `playwright.config.ts`, with the measurement table and the
reasoning in the file. `npm run test:e2e` — the default invocation, not a special flag — is now
**44 passed**.

🔴 **The part worth carrying, and it is not the fix.** Every one of these failures presented as
`bootToGame` timing out with **neither `ready` nor `bootError`** — which is *exactly* the
`ready:false / bootError:null` hang state that the whole refuse-to-route design exists to make
impossible, and that this phase already fixed twice (`verifySheets`, then `verifyLevels`). A
contended dev server and a genuine boot hang are **indistinguishable at the assertion**. That trains
a reader to dismiss a red suite as flaky, which is how a real hang ships.

**Explicitly rejected: raising `BOOT_TIMEOUT`.** A bound loose enough to survive a contended server is
loose enough to hide a real hang — the same reasoning that bans `waitForTimeout`. The honest fix is a
smaller payload: the parallax layers are uncompressed and enormous for what they draw. Restoring
parallelism is gated on that, and is Phase 5 work.

**Confidence, stated rather than implied.** The payload explanation is the *leading* one and is well
supported (the `ECONNRESET`, the size measurement, the monotone worker/failure relationship). It is
not proven — I did not isolate it by serving a compressed build. What *is* proven is the fix:
`workers: 1` is green twice, and every other count is red.

### A second defect, found while measuring the first

`anchor.png` (6.1 MB) and `anchor-original.png` (4.1 MB) are **absent from `index.json`, unreferenced
anywhere in `src/`, and present in `dist/`** — together with `anchor.job.json` and
`anchor.prompt.txt`. **10.2 MB of the shipped bundle is source art the game never loads.**

They live under `public/`, which Vite copies wholesale, and they are there deliberately: vault 4.17
requires the prompt and job record to sit beside the asset. **The convention is right and its
location is wrong** — provenance belongs somewhere that does not ship. `verify-dist.mjs` does not
catch this, because it checks for dev-only *symbols*, not for unreferenced *weight*.

Recorded, not fixed: moving provenance out of `public/` changes where vault 4.17's records live, which
is a decision, not a cleanup — and this phase is at its approval boundary. Phase 5 item.

## Rebuild determinism (4.11) — measured, and the criterion as worded cannot be met

**The half that holds, and it is now measured rather than assumed.** Running `npm run assets:build`
against the existing `_generated/sheets/` and diffing the tree produces **no change at all** — all
five strips and `lift-profile.json` come back byte for byte identical. The deterministic-encoding
comments in `png.mjs` and `resize.mjs` were design intent that nothing had checked; this checks it.

```
$ git status --short          # clean
$ npm run assets:build        # 5 strips + lift-profile.json rewritten
$ git status --short          # still clean -> byte-identical
```

**The half that cannot be met as written.** The criterion says *"rebuild from a clean clone produces
byte-identical PNGs"*. A clean clone cannot rebuild at all: `_generated/` is gitignored and holds
**128 MB** of source clips and intermediate sheets (63 MB of `.mp4`, 65 MB of extracted frames). The
build reads `_generated/sheets/` and correctly **fails loudly** on a missing input rather than
substituting *(vault 4.16)* — so on a clean clone it does not produce wrong PNGs, it produces none.

So the criterion is decomposed rather than declared passed:

| | status |
|---|---|
| same inputs → same bytes | **PASS**, measured above |
| clean clone → same bytes | **UNACHIEVABLE** without committing 128 MB of clips |

**This was a decision for the phase owner, not something to quietly restate — and it has been made.**
**2026-08-09: the criterion is re-scoped to the packing step**, the option the measurements support.
Committing the clips was rejected — 128 MB in git buys reproducibility of a step that is already
reproducible on any machine holding them — and "accept machine-local" was rejected as a *wording* for
the criterion, because a criterion that cannot be run is not a criterion. The new text and the full
rationale are in [phase-04-art.md § 6](../prd/phase-04-art.md), under the criteria table.

Two consequences are carried forward rather than closed:

- **The clips are the only copy of a non-regenerable input.** Losing `_generated/` freezes the art at
  its current packing; it must be archived outside git.
- **`assets:fetch` / `assets:verify` are still promised by `ASSET-PIPELINE.md` and undefined in
  `package.json`** (Codex impl-review finding 5). Building them is what would make a clean-clone
  rebuild real. That is the successor to this criterion, and Phase 4 does not own it.

Worth stating alongside: because the model is not seed-deterministic, re-running the GENERATION step
can never reproduce these bytes. The most any rebuild gate can prove is that the *packing* of fixed
clips is deterministic — which is the part that had a real bug in it this phase, so it is also the
part worth pinning.

## Lane C - `play`, hands-on with `playwright-cli`

The lane that closed this defect. Two prior rounds were closed on numbers and rejected on sight, so
these are looked at, not measured.

| Shot | What it shows |
|---|---|
| Standing on flat ground at true size, `x 624, y 1920, idle` | **Both boots on the hazard stripe, no float, no gap.** This is the defect the user reported, at the size a player sees it. The character reads clearly against the industrial background at 1x - criterion 4.1. |
| The ground under the spike run, `x 2523` | **The yellow-black cap runs unbroken beneath the spikes.** This is criterion 4.22 by eye: before the fix, four tiles of it were plain brick. The spikes are non-solid and he walks through them, which is correct until Phase 5 makes them hurt. |
| The Gym at 1x and clamped 2x | Anatomy check, criterion 4.14: two arms, two legs, two boots, one head, one satchel, one pauldron. **No third limb.** The 4x zoom cut the head off, which is why the zoom is now clamped - found by looking, not by a metric. |
| The Gym's overlays on `jump` frame 5 | White cell, blue measured footprint, green collision, red active-frame toggle, all drawn correctly, with `lift above cell floor 35 px` - the centroid anchor holding an airborne pose off the ground. |

**Checked and cleared, so it is not re-investigated:** the dark vertical band right of the spike run
is `bg-near` artwork - a shadowed alley between two pipe stacks - not a parallax seam. All three
layers are intact 1920x1080 tilesprites with only their `tilePositionX` differing.

**Not covered by this lane, and it is the honest gap:** the platform tops and the pillar were not
photographed, because reaching them means crossing the 288 px pit at x 3840-4128 and a missed jump
drops the player out of the world (the Phase 5 carry-in). The e2e spec asserts the drawn-vs-sim
invariant continuously across takeoff, flight and landing, which covers the mechanism; what is
missing is a human having looked at the character standing on a platform edge.

## Lane D — Codex implementation review (criterion 4.18)

**Verdict: BLOCK.** Full disposition of all twelve findings in
[docs/reviews/phase-04-impl.md](../reviews/phase-04-impl.md). The two blockers, both re-verified
locally by mutation:

**B1 — the runtime does not derive fps, and the comment saying it does was false.** `GameScene`
never imported `animTimings`; it passes `sheet.fps` from the catalog. I had read that comment
earlier in this session and believed it. Corrected in place. **Not a silent-drift risk** — that is
the part Codex could not weigh from files alone: `asset-catalog.test.ts` derives fps from the live
tuning and asserts equality per animation, so a retune without a rebuild goes red. Runtime
derivation needs strides the catalog has no field for; deferred with the cost written down.

**B2 — the hang fix had been applied to the instance, not the class.** `verifyLevels` still threw
during problem collection on `levels: [null]` — an array, so it passed the `Array.isArray` guard,
then dereferenced `entry.key`. Fixed the same way as `verifySheets`. Watched fail: the mutation
produces `TypeError: Cannot read properties of null (reading 'key')` and a 20 s timeout on the
terminal state, which is the hang reproduced exactly.

**The reviewer also disagreed with itself usefully once:** it says the new level-fill test "would
pass if `applySurfaceTiles` were deleted", which is true of that test and false of the criterion —
the drawn-index e2e assertions do catch a deleted call site, verified by mutation, and Codex names
them in the same paragraph.

**Recorded, not fixed** *(C11)*: the missing `assets:fetch`/`assets:verify` workflow, now the
recorded successor to a re-scoped 4.11 rather than an open question; the Gym's pre-fetch edit race;
`dropCastShadow`'s residual ≤4% window; and the centroid oracle's three-decimal rounding, which is a
latent false-RED and therefore the safe direction.

**Closed since, by the phase owner on 2026-08-09**: 4.11's wording (re-scoped to packing
determinism) and 4.20's PRD text (amended to name the flat-animation exemption the test already
implements). Both are now criteria the gate can actually run.

## Criterion-by-criterion

**Moved back to [phase-04-art.md](phase-04-art.md) on 2026-08-15.** `docs-contract.test.ts` reads the
criterion rows out of a slice of *that* file, so the table cannot live here.
