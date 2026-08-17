[← QA-LOG index](../QA-LOG.md) · [phase doc](../prd/phase-04-art.md) · [Codex reviews](../reviews/)

## Phase 4 — fal art production + Character Gym

**Branch:** `phase-04-art` · **Date:** 2026-08-08 · **STATUS: NOT DONE — see §Status**

The real character, generated through fal.ai and made game-ready: catalog entry, bounds, anchor,
active frames, saved config. Plus `GymScene`, the only place where the drawn character and the boxes
claimed about it appear together at true size.

---

## Status — why this phase is reported FAILING, not done

**A phase with a failing or unrun criterion is reported failing.** This one has several of both.

| Blocker | Detail |
|---|---|
| **Spend overran, and 4.2b's ordering cannot be retro-fixed** | **RECONCILED 2026-08-09: `$31.39` against a `$25` ceiling — `$6.39` over (25.6 %).** The estimate was $6.21 – $31.60; the actual landed 0.7 % under the top. `genmedia pricing`'s `0.014 / "units"` was **wrong by ~21×**; the pessimistic rate was right to ~1 %. **4.2b still FAILS**, because it requires the invoice to be reconciled *before any animation batch* and 22 clips ran first — an ordering no later measurement can undo. ~77 % of the clips were rework; see [GENERATION-LOG § Spend](../GENERATION-LOG.md). |
| **Criteria unrun** | The gate's agent owners had not run at the time of writing. A criterion whose owner has not run it is UNRUN. |
| **Codex implementation review: BLOCK** | Criterion **4.18** ran. Two blockers found; one fixed, one corrected and deferred with its cost recorded. |
| **S7 not done** | Speed hand-tuning in the Playground; the shipped movement numbers are the derived starting point only. |
| **`run` stride provisional** | 320 px/cycle, two agreeing methods resting on a single frame. Criterion **4.10**'s INDETERMINATE condition is close. |
| **Traceability gap** | Five paid generations have `.mp4` files with no `.job.json`. A live vault-4.17 violation, recorded in [generations/phase-04-video.md](../generations/phase-04-video.md). |
| **400-line rule broken ten times** | Criterion **4.16**. Mostly this phase's doing, not inherited — see §File sizes for the measured before/after. |

---

## The defect this phase was actually about

The user reported three times, across two rounds of measured-green work, that the character did not
look like it was standing on the tiles. **Three independent defects were found; one inherited
hypothesis was disproved.** The order matters, because the first two were found by measuring and the
third was found by the user looking at the screen.

### 1. `packStrip` inverted every animation's vertical motion

Each frame's own lowest opaque pixel was pinned to the cell's last row. For a planted idle that is
right. For anything with a flight phase it is not merely lossy, it is **inverted**: at the frames
where both boots are clear of the ground the whole body is dragged DOWN to meet the baseline, so the
legs pump while the torso sinks.

| animation | head sank, game px |
|---|---|
| `run` | 15 |
| `jump` | 67 |
| `fall` | **98** — a full tile of concertina |

Fixed by computing **one baseline per sheet**: the deepest frame reaches the last row, every other
frame sits its measured, scaled lift above it. The source clips are camera-locked and their prompts
forbid translation, so what the model drew is **pose, not travel**, and preserving it cannot
double-count against the sim's own `stepVertical`.

**Airborne states use a different anchor, and the choice was made by looking.** Feet-anchoring gave
the jump 51 px of climb of its own and put a 48 px balloon in the middle of the fall; centroid
anchoring holds both inside ~11 px and lets only the pose change. Foot and head *ranges* discard
direction and correlation, so they cannot separate pose deformation from whole-figure drift — the
three candidates were rendered side by side against a ground line and chosen on sight. *(Codex plan
review blocker 1; criterion 4.25.)*

### 2. A 4-tile stretch of ground lost its brass cap

`applySurfaceTiles` asked `layer.getTileAt(x, y-1)` — *is any tile drawn above me* — while naming
the answer `hasSolidAbove`. The spike run at cols 24–27 is authored decoration standing on the
ground, so 384 px of walkable floor drew `BRICK_GID` instead of `SURFACE_GID`, in a game whose art
direction states that **a player identifies a platform by that brass edge alone**.

General, not a one-off: any decoration standing on the ground erased the cap beneath it. Now tested
against the object-layer collision rectangles with **half-open positive-area overlap** — load-bearing,
because an inclusive test counts the ground rect starting at `y=1920` as touching the row-19 query
cell and would bury **every** row-20 cap, the same defect inverted.

### 3. The anchor image's own soles were never level — the root cause

The locked anchor drew the forward boot **58 source px** above the rear one. `packStrip` aligns on
the lowest opaque row, so the rear boot was pinned to the ground and the forward one hung: a flat
**6 game-px gap under one sole, identical in all twelve idle frames**.

Identical-every-frame is the diagnostic signature that says the defect is in the **source**, not the
animation — and it is why two rounds of pipeline fixes could not touch it. Fixed at source and every
clip re-shot. Idle sole gap now **0 px in every frame**, confirmed on screen at 3× against the hazard
stripe.

This is now criterion **4.27**: measure the anchor's own contact geometry before generating from it.

### Disproved, and recorded so it is not re-investigated

The inherited hypothesis was that a platform's collision top did not match its drawn top. **All six
solid rectangles match their drawn tiles on all four edges.** The runtime is exact end to end: sim
feet `y` → collision-rect top → drawn tile top → sprite frame bottom is 0.0 px, `playerView` applies
no offset, origin is `(0.5, 1)`, and `setScale` is never called because the art is pre-scaled.

---

## The regression set was 23 red, and one of them was serious

Running the Phase 1–3 regression set found five defects. Recorded in full because four of them are
the same shape — **a gate still pointing at a world that has changed** — and that shape is the one
this project keeps paying for.

### R1 (blocker) — the boot gate reached the hang state it exists to prevent

`create()` COLLECTS problems and only then calls `refuseToRoute`. `verifySheets`, added this phase,
was missing the guard both its siblings carry, so a catalog whose `sheets` is missing or not an array
reached `for (const sheet of catalog.sheets)` and threw `catalog.sheets is not iterable`
**mid-collection**. The refusal never ran: `ready:false` with `bootError:null` — neither success nor
refusal, but the third state. Seven criterion-1.5 specs went from asserting a refusal to timing out
at 20 s.

Fixed by guarding on `describeCatalogProblem` exactly as `verifyExpectedTextures` does.

### R2 — five sharp gates had become one blunt one

The catalog-injection fixtures predated `sheets` becoming a required field, so each refused for
*"missing its sheets list"* rather than for the duplicate key, reserved key or empty images list it
was written to test.

**The comment directly above `VALID_LEVELS` predicts this exact failure.** Phase 3 hit it when
`levels` became required, wrote down what it cost, and Phase 4 did it again with `sheets`. The
fixtures now build **from the shipped catalog** with only the field under test replaced, so Phase 6's
HUD sheets and Phase 7's audio cues cannot cause a third round.

### R3 — three specs intercepted an asset that no longer exists

The 404, corrupt-200 and scene-restart specs all routed `**/assets/placeholder-tile.png`, which the
art work removed from the catalog. The interception matched nothing. The broken asset is now derived
from the catalog's first image.

### R4 — the test guarding against a deleted `renderPlayer()` found nothing

Phase 2's drawn-object test located the player by matching the collision box's dimensions. The player
is now a **Sprite sized to the 288 × 384 art cell**, not a 132 × 288 rectangle, so `drawn` came back
null. Phase 3 had already amended this test once, replacing a hardcoded size with a derived one — and
derivation could not protect it, because the thing the size stood in for changed shape. It now finds
the player by **texture key**, which is what identifies it.

### R5 — criterion 3.4 was geometrically unsatisfiable

Not a stale fixture. The map is 2112 px tall, the view 1080, and the walking surface sits at y 1920 —
so a grounded player is **192 px** above the world's bottom edge while `viewFits`, asserted three
lines earlier **in the same test**, pins the view there. Demanding a 200 px margin below the player
demands the camera leave the map. It failed on 200 of 200 sampled frames with the camera behaving
correctly.

The 3× world rescale earlier in this phase introduced it; nothing caught it because the other 22
failures were masking it.

Fixed in the predicate, not the threshold: `tracksTarget` takes optional map bounds and drops the
inset to zero on a side the view is flush against, keeping the full inset everywhere the camera can
still move. ⚠️ **This edits a Phase 3 contract during Phase 4** and should be read as one.

---

## Mutation testing — what was watched fail, and one that was not good enough

*(C1: watch every gate fail. C12: confirm the revert by content changed AND the original count
dropping by one.)*

| Gate | Mutation | Result |
|---|---|---|
| lift profile / packer | anchoring per-sheet → per-frame | red |
| lift profile / packer | `round` → `floor`, and → `ceil` | red — **after the fixture was fixed**, see below |
| packer vertical guard | committed overflow fixture | throws |
| ground cap | `hasSolidAbove` → `layer.getTileAt` | red |
| `verify-dist` Gym sweep | register the dev roster unconditionally | red on all three: scene key `Gym`, symbol `GymScene`, prose `" gym"` |
| e2e 4.24 | `headAboveFeet` → `drawnHeight` only (the old packer's geometry) | red: **267 vs 279**, the head sinking |
| e2e 4.23 | `originY` 1 → 0.5 | red |
| e2e 3.4 | delete `startFollow` | red, **but on the wrong assertion** |
| e2e 3.4 | `startFollow` at 0.002× lerp — moves but lags | red on 113 frames — the right one |
| e2e 4.23 (2026-08-17) | `sprite.setPosition(x, y)` → `y - 5`, `originY` untouched | red — **exact claim, 5 px** |
| e2e 4.23 (2026-08-17) | `prev.y + dy * alpha` → `* alpha * 1.5` | red — **containment claim, 11.34 px outside the segment** |
| e2e 4.23 (2026-08-17) | the same overshoot, against the FIRST containment formula | **green — the formula was wrong**, see below |

### Two mutation lessons worth more than the results

**A rounding gate needs a fixture whose result is fractional.** The first rounding mutation
*survived*: the fixture used a 10 px lift at scale 0.5, which is exactly 5.0, where `round`, `floor`
and `ceil` all agree. A scale-0.4 fixture with lifts 1.2 and 1.6 was added; both mutants then went
red.

**Deleting a behaviour is not always the mutation that tests the gate you changed.** Deleting
`startFollow` tripped criterion 3.4's *"the camera actually moved"* assertion first and proved
nothing about the `tracksTarget` predicate that had just been relaxed. The mutation that proves it is
a camera that **moves but lags**, which is exactly the scripted-pan case the predicate was written
for.

### And one gate that is weaker than it looks

In e2e 4.24, `rise > 0` **survived** the packer mutation on its own, because `drawnHeight` varies by
pose regardless of anchoring. Only the ordering assertion — the highest-lift frame's head above the
contact frame's — discriminates. Recorded because it is the difference between a gate and decoration,
and the weak assertion reads perfectly convincing next to the strong one.

---

## Prompt findings, paid for in generations

**A named positive instruction OVERRIDES a negation it contradicts.** A monotonicity clause was added
to fix a non-monotonic airborne pose progression: *"at every instant the body is at a different
position from every other instant… never return to a pose already passed."* Regenerated with it, the
**jump somersaulted** — frame 4 fully inverted, boots above head — and the fall pitched to horizontal.
The same paragraph already said, two sentences later, that he *"does not rotate, does not tip over,
does not go horizontal, does not turn upside down and does not somersault."* The model satisfied
"keep changing, never come back" the only way that is geometrically monotonic — by rotating — straight
through five explicit negations. Reverted; `motion.mjs` records it so nobody re-adds it.

What worked instead: **three fixed pose points with their time named** (FIRST / HALFWAY / LAST). A
progression without asking for monotonic anything.

**An edit model will not make a small precise geometric correction.** `nano-banana-pro/edit`, asked to
level the anchor's boots, returned art with a 59 px offset against the original's 58.

**Never ask an airborne sprite to travel.** The sim already supplies the translation; a sprite that
also translates inside its cell asks for the motion twice. Four of six jump frames came back with no
head in frame, and no choice of sampling window puts a head back.

**The asked-for cycle count is not the delivered one.** Two cycles requested; 4.0 (walk), 6.1 (run),
2.6 (idle) delivered. The count still does its job — it prevents phase collapse — but nothing
downstream may depend on it, so cycle length is **measured off the finished clip**.

---

## Deliberate non-fixes, and where they went

| Item | Disposition |
|---|---|
| Player runs off `level-01`'s left edge and falls out of the world forever | **Phase 5.** A kill plane is a death, and death is Phase 5's state machine. Recorded in [phase-05-combat.md](../prd/phase-05-combat.md) §1 **with the part that is easy to miss** — the same hole exists on all four edges, not just the reachable one. |
| The spike run is non-solid and non-damaging | **Correct today, Phase 5 owns hazards.** You do not stand on spikes. |
| `hud-health` is shipped but nothing draws it | **Correct.** The HUD is Phase 6, in a parallel `UIScene`. Recorded in [ASSET-MANIFEST.md](../ASSET-MANIFEST.md) §3 because an unused catalog entry is exactly the shape of a defect. |
| An unedited Gym save is not byte-identical | **Accepted, and disclosed on screen.** The config carries 9 hand-authored blank lines and one-line animation entries that `JSON.stringify` does not reproduce. Pinned instead: no value changes, no key moves, the scale and its provenance survive, and the write is idempotent. |
| Codex's "snapshot the original greybox cells" alternative to the ground-cap fix | **Recorded, not taken.** It solves a hypothetical future Element-Editor divergence at the cost of new state; the sub-tile-nudge fixture covers the same risk. Revisit if the Editor ever moves a collision strip off its art. |

---

## File sizes against the 400-line limit — an open violation, stated in full

**Nine files are over 400 lines and none of them is justified.** An earlier draft of this section
named only `GameScene.ts`, which understated it.

```
726  tools/gen/gates.mjs
538  src/scenes/GameScene.ts
526  tools/gen/chroma.mjs
523  tools/gen/prompt.mjs
466  tests/unit/tilemap-data.test.ts
442  tools/gen/sheets.mjs
438  src/scenes/BootScene.ts
431  tests/e2e/phase-03-tilemap.spec.ts
426  tests/e2e/phase-01-boot.spec.ts
```

**The precedent is unambiguous and it is not "write a justification".** Phase 1 closed with its
largest file at 362, Phase 2 at 387, and **Phase 3 found a violation and SPLIT the file** — 375 + 80
at the same seam Phase 1 had used for `assetCatalog.ts`. The rule says *prefer splitting*, and three
phases running have.

So this is recorded as an **open violation of a non-negotiable**, not as a justified exception.
Criterion **4.16 does not pass** on the strength of this section.

Only one of the nine has been dealt with the way the rule asks: `src/scenes/GymScene.ts` came in at
402 and was trimmed to 397 by removing a footprint-rect computation repeated four times — smaller
*and* less able to disagree with itself, which is the argument for splitting in miniature.

**CORRECTED, by the `voltagent-qa-sec:code-reviewer` gate owner (F2), and the correction matters.**
An earlier version of this section claimed *"six of the nine predate this session's work… the two
e2e specs and `tilemap-data.test.ts` are older"*. Measured against `origin/main`:

```
                                    main   HEAD
tests/e2e/phase-01-boot.spec.ts      399 -> 426    crossed IN THIS DIFF
src/scenes/GameScene.ts              369 -> 538    crossed IN THIS DIFF
src/scenes/BootScene.ts              376 -> 438    crossed IN THIS DIFF
tests/unit/tilemap-data.test.ts      421 -> 466    already over on main
tests/e2e/phase-03-tilemap.spec.ts   424 -> 431    already over on main
tools/gen/gates.mjs                    0 -> 726    new this phase
```

`phase-01-boot.spec.ts` was **399 on main** — one line under — and crossed to 426 inside the four
commits under review, in the fixture repairs. It is the newest breach, not an inherited one. Only
**two** files were genuinely over on `main`, and those are Phase 3's unrecorded breach. The rest is
this phase's, which is a materially worse position than the one this section originally described.

Since then, `tests/unit/sheet-packing.test.ts` also crossed (405) when the 4.20 per-animation
assertions were added, making it **ten**. `src/scenes/GymScene.ts` came off the list the way the rule
asks: `editsFromConfig` moved to `src/render/gymBounds.ts`, where it is engine-free and unit-tested,
leaving the scene at 400.

`src/scenes/GameScene.ts` at 538 violates the strictest reading — CLAUDE.md §3 says *no source file*,
and `src/` is unambiguously that.

## The QA lanes, split out

**This log reached 518 lines.** On 2026-08-15 the four QA lanes, the e2e close-out and the rebuild
determinism measurement moved to [phase-04-art-gate.md](phase-04-art-gate.md) — a flat sibling
rather than a subdirectory, because `tests/unit/file-size.test.ts` globs `docs/qa/*.md`
non-recursively and this log is one of the two that record the over-400-line source files.

**The criterion table stayed here, and that is load-bearing.** `docs-contract.test.ts` slices this
file between its `## Phase 4 —` heading and its vault-out heading and reads the criterion rows out
of that slice, so the table cannot live in the sibling. It was briefly moved out on 2026-08-15 and
moved back the same day.

---

## Criterion-by-criterion

**Phase 4 is NOT done, and this table is the reason.** Filled per criterion on 2026-08-15, when the
phase owner asked whether it could be marked done. The previous version of this table had rows for
15 criteria and a single `all others — UNRUN` catch-all, which reads as an oversight rather than a
verdict; `docs-contract.test.ts` needs one row per criterion before the PRD may mark this phase
done, and it named **34 missing rows** when the flip was tried.

**3 FAIL · 13 UNRUN · 17 PASS · 1 moved.** A phase with a failing or unrun criterion is reported
failing *(CLAUDE.md §3)*, so PRD.md keeps `⚠️ merged with known debt` rather than ✅.

| # | Verdict | Evidence |
|---|---|---|
| 4.0 | **UNRUN** | No gate-0 re-probe against `nano-banana-pro` is recorded in this log. The Phase 0 probe in `docs/generations/phase-00-style-probe.md` is a different model and a different gate. |
| 4.0a | **UNRUN** | `tests/unit/style-lock.test.ts` is green in the suite, but the criterion's second half — *every locked-section hash change is an approved, recorded decision* — is a judgement its owner never made. Green hash ≠ approved hash. |
| 4.0b | **PASS** | `docs/STYLE.md:326` — `## 8. CHARACTER ANCHOR — LOCKED`, with the immutable block at `:362`, written before the sheets were generated. |
| 4.0c | **PASS** | [`docs/ASSET-MANIFEST.md`](../ASSET-MANIFEST.md) — every slug and every animation, agreed before spend. |
| 4.0d | **PASS** | [`ASSET-PIPELINE.md:25`](../ASSET-PIPELINE.md) — `## 0a. The Phase 4 art contract — PUBLISHED by Phase 3`, carrying the zoom and viewport this phase generated against. |
| 4.1 | **PASS** | Lane C, shot 1: standing on flat ground at true size, `x 624, y 1920, idle`. *"The character reads clearly against the industrial background at 1x — criterion 4.1."* |
| 4.2 | **UNRUN** | No record of a batch estimate being presented and approved before 4b. The spend ceiling was raised twice later, in Phase 5, which is a different decision. |
| 4.2b | ✅ **CLOSED 2026-08-16 by owner amendment — ceiling raised to $50.** The original verdict is kept verbatim below, because the ordering violation it records is real history. | The invoice was read on 2026-08-09: **$31.39, over the $25 ceiling by $6.39.** The criterion is two claims and only one holds. The probe ran *(4.2c)*. But it requires reconciliation **before any animation batch**, and 22 clips were generated before any invoice was read — **an ordering violation no later measurement can undo**, so it cannot be turned green retroactively and is not. What the number bought: the ~22× rate dispute is settled in favour of the pessimistic source, and `genmedia pricing` is now recorded as unusable for projection. |
| 4.2c | **PASS** | The 4 s Seedance 2 probe ran and its real fps and frame count were read by `ffprobe` rather than assumed — the half of 4.2b that does hold. |
| 4.3 | **UNRUN** | No dimensions audit recorded. `shipped-sheets.test.ts` pins the sheets that ship, which is a narrower claim than *every asset's dimensions read from the file and recorded*. |
| 4.4 | **UNRUN** | Chroma keying is implemented and was exercised on the real art, but no run of *alpha read directly, per asset, recorded* exists in this log. |
| 4.5 | **PASS**, with its ceiling recorded | `tests/unit/art-gates.test.ts` runs `selfTest()` on the fixtures. **Ceiling:** Lane A finding 6 — nothing wires `selfTest()` into the build, so "before judging real art" is enforced by remembering to run `npm test` first, and the comment claiming the build runs it is the misleading part. Recorded, not fixed. |
| 4.6 | **PASS**, in its strongest form | Lane A code-reviewer F5: `keepLargestComponent` is never called anywhere in the pipeline, and its guard is inside the function so no call site can bypass it. Measured on the real clips — every survivor is one whole figure per frame, no cell is multi-component. |
| 4.7 | **UNRUN** as worded | Codex B1: the runtime never derived fps, and the comment saying it did was false; `GameScene` passes `sheet.fps` from the catalog. What exists instead is `asset-catalog.test.ts`, which derives fps from the live tuning and asserts equality per animation, so a retune without a rebuild goes red. That is a real guard, but it is not the criterion. |
| 4.8 | **MOVED to Phase 5** | Struck through in the gate: the contact-frame-inside-the-active-window check went with the attack sheets. Carried as Phase 5's 5.4-series. |
| 4.9 | **UNRUN** | No per-clip loop-flag verification or held-state motion-floor measurement is recorded. |
| 4.10 | **PASS**, run 2026-08-13 (Phase 5, session 8) | `gateReachBand` swept across all nine catalogued sheets, each with a fresh call, `best` tracked across every frame rather than breaking on first failure. **Nine PASS, zero FAIL, zero INDETERMINATE**, re-run independently by the orchestrator with every number reproduced. Table in [phase-05-combat-04-session-08.md](phase-05-combat-04-session-08.md). |
| 4.11 | **PASS**, against the criterion as re-scoped | See §Rebuild determinism in the sibling. Same-input packing determinism is measured and holds byte for byte. The clean-clone half was **removed from the criterion by the phase owner on 2026-08-09**, not quietly restated: it is unachievable in principle (Seedance 2 is not seed-deterministic) as well as in practice (128 MB of gitignored clips). The successor work — `assets:fetch` / `assets:verify` — is recorded, unbuilt, and not a Phase 4 task. |
| 4.12 | **PASS**, run 2026-08-13 (Phase 5, session 8) | `findSource`'s deliberate-removal red run *(C1)*: the positive case confirmed first, then the declared input removed; it threw from `tools/gen/assetSources.mjs:36` rather than substituting. Restored and verified **by count (1 → 0 → 1)** and `cmp` byte-identical *(C12)*. |
| 4.13 | **UNRUN** | No `index.json` audit recorded asserting catalog entry + bounds + anchor + active frames + saved config for every asset. |
| 4.14 | **PASS** | Lane C, shot 3: the Gym at 1x and clamped 2x. *"Two arms, two legs, two boots, one head, one satchel, one pauldron. No third limb."* The 4x zoom cut the head off, which is why the zoom is now clamped — found by looking, not by a metric. |
| 4.15 | **UNRUN** | F3 fixed the Gym's save path to merge rather than assign, and `editsFromConfig` is unit-tested. But the criterion's own claim — *typechecked and inside the test include list* — was never asserted as such. |
| 4.16 | **FAIL**, but down from 7 offenders to **1** | **`src/scenes/GameScene.ts` at 459 lines is the only file left over 400.** Six came off the list on 2026-08-15 — see §The 400-line work below. F2 had also corrected this log's own accounting: only two files were over on `main`, so most were this diff's breaches, not inherited ones. |
| 4.17 | **PASS** | [`docs/reviews/phase-04-plan.md`](../reviews/phase-04-plan.md) — the Codex plan review ran and every finding is applied or recorded. |
| 4.18 | **RAN — verdict BLOCK** | [phase-04-impl.md](../reviews/phase-04-impl.md); 12 findings, all applied or recorded. Both blockers re-verified locally by mutation. |
| 4.19 | **PASS**, with its ceiling stated | Exact equality against the committed manifest, plus a fresh re-measurement of the shipped PNG's pixels. It guards the PACK step; it cannot catch a systematic bug in `figureMetrics`, because manifest and sheet would move together. |
| 4.20 | **PASS**, after qa-expert finding 5 and the 2026-08-09 PRD amendment | The test's exemption now matches the criterion's text; before the amendment the code was right and the PRD was wrong. `idle` is flat in all twelve frames, so 4.20's second half is literally false for it — correctly, since the courier breathes without lifting a boot. A regression to per-frame anchoring would therefore be invisible inside `idle`, and nothing asserted a non-zero lift on `jump` or `fall` at all. Now asserted per animation, with idle's flatness pinned as deliberate. |
| 4.21 | **PASS** | Committed overflow fixture; the packer throws rather than clipping *(vault 4.14 — the cell was raised 336 → 384 instead)*. |
| 4.22 | **PASS**, after F1 | The predicate's unit fixtures, PLUS two e2e tests asserting the drawn tile index — added because the call site was unguarded and the shipped bug passed 464 tests. |
| 4.23 | **PASS** | `tests/e2e/phase-04-assets.spec.ts` — drawn bottom ≡ sim feet y on 120+ samples spanning takeoff, flight and landing; `originY` mutant red. |
| 4.24 | **PASS** | Same spec; old-packer geometry mutant red at 267 vs 279. See the weak-assertion note in the sibling. |
| 4.25 | **PASS** | Three anchoring candidates rendered against a ground line and chosen on sight; rationale in `character-bounds.json` `_verticalAnchor`. |
| 4.26 | **PASS** | `verify-dist ok`; sweep watched red on all three Gym checks. |
| 4.27 | **FAIL** — an earlier PASS here was wrong | The defect is genuinely fixed and verified in-game. But the criterion asks for the anchor to be measured **before generating from it**, and it was measured after shipping, from the user's report. No code measures an anchor's contact geometry, so there is no gate — only a one-off manual correction. Raised by `qa-expert` brief 1, finding 4. **Priced, after the 2026-08-09 invoice: this defect forced batch V, ~6 clips at ~$1.19 = ~$7 — the largest single line of the $6.39 overrun. Closing 4.27 is the cheapest money this project can save.** |

### The 400-line work — criterion 4.16, 2026-08-15

**Seven files over 400 became one.** Every split moved a whole concern with its docstrings intact;
**not one line of explanation was deleted to hit the number**, which is the distinction
`file-size.test.ts`'s own header draws between splitting and gaming the count.

| File | Was | Now | Moved to |
|---|---:|---:|---|
| `tests/unit/enemy-ai.test.ts` | 727 | 203 | `enemy-ai-scavenger.test.ts` 337, `enemy-ai-lifecycle.test.ts` 230 |
| `src/scenes/GameScene.ts` | 517 | **459** | `gamePlayerDraw.ts` 99 — the player draw path |
| `src/sim/player.ts` | 486 | 274 | `playerTuning.ts` 240 — the hand-tuned constants, a leaf |
| `src/sim/combat.ts` | 468 | 351 | `combatTiming.ts` 152 — the frozen timings, a leaf |
| `tools/gen/motion.mjs` | 436 | 277 | `motionAirborne.mjs` 176 — `jump` and `fall`, a leaf |
| `tests/e2e/phase-04-assets.spec.ts` | 407 | 286 | `phase-04-assets-tiles.spec.ts` 150 |
| `tests/unit/sheet-packing.test.ts` | 402 | 215 | `sheet-packing-lift-profile.test.ts` 203 |

Every hub keeps its public API by re-exporting, so no call site changed. `file-size.test.ts`'s
ceiling was **ratcheted 7 → 1** and watched go red by concatenating two files back together.

🔴 **The unit suite could not see the one real defect this work introduced, and the e2e suite
could.** Extracting `registerAnimations` cut its body one line short, dropping the final
`registerCatalogAnimations(scene)` — so on the normal (non-`?feel=1`) path **no animations were
registered at all**. Typecheck passed. All 1146 unit tests passed. Four e2e tests failed, and the
one that named it was *"the run animation is not advancing"*: 1 distinct frame observed where 5
were expected. A baseline run against `HEAD` proved the failures were new rather than inherited,
which is what turned "probably flaky" into "I broke it". **A pure-function suite cannot see a
renderer that never registered anything** — the same gap criterion 4.22's F1 records.

**Why `GameScene.ts` did not close, stated rather than hidden.** What is left is `create()`,
`update()`, and five `protected` methods that `PlaygroundScene` and `ElementEditorScene` inherit —
moving those changes a class API two subclasses depend on. The three scene toggles cannot shrink at
all: their `'Gym'` / `'Playground'` / `'ElementEditor'` literals must stay inside
`import.meta.env.DEV`, because a bare literal outside the guard ships the key into `dist/` and
`verify-dist.mjs` fails the build on exactly that. Closing the last 59 lines is a restructure of the
production scene, not a move, and it is not attempted here.

### What is actually left

**Three FAILs, and they are not the same kind of thing.**

| # | Fixable by | Note |
|---|---|---|
| 4.16 | **work, mostly done** | 7 offenders → 1. Only `GameScene.ts` (459) remains, and closing it means restructuring `create()`/`update()`. |
| 4.2b | ✅ **the owner, and they did** | An ordering violation — the invoice cannot be read before a batch that already ran. Closed 2026-08-16 by amendment, not by work, which is what this row always said the only route was. |
| 4.27 | **work, then nothing** | A pre-generation anchor-geometry gate can be built, but it cannot retroactively have run before this phase's art. Same shape as 4.2b for Phase 4 itself; worth building for every phase after. |

### 🔴 Criterion 4.2b — the owner's amendment, 2026-08-16

**The art-spend ceiling is raised from `$25` to `$50`, and 4.2b is closed.** Recorded here rather
than edited into the history above, because two different things are true at once and collapsing
them would lose the part that still matters.

**What the amendment settles.** The overspend claim is void: Phase 4's `$31.39` is inside a `$50`
ceiling, with `$18.61` of headroom for Phases 7–10. The `$25` figure was set before anyone had a
real invoice, against a `genmedia pricing` quote later shown to be **wrong by ~21×** — so it was
never a measured number, and holding a phase to it permanently was holding it to an estimate that
the phase itself disproved.

**What the amendment does NOT undo, and must not be read as undoing.** 22 clips were generated
before any invoice was read. That ordering violation happened, it is why the overrun was invisible
until it was already spent, and **no ceiling makes it fine**. The rule it broke survives the
amendment intact and is restated here as a standing constraint:

> **Read the invoice before the next batch, not after it.** A ceiling is a bound on damage; the
> ordering is what makes the bound reachable at all. Phase 4 had a ceiling and still overran it,
> precisely because nothing was measured until the spend was over.

**Why closed rather than left failing.** The row two tables down has always said this was closable
*only* by the owner amending the criterion or accepting a permanent recorded fail — the two options
were put to the owner on 2026-08-16 and the amendment was chosen. The criterion is closed; the
lesson is kept; the history above is untouched.

**Bearing on later phases.** Phase 7 is audio, and audio is not fal image generation, so the `$50`
ceiling is the *art* ceiling and does not silently become an audio one. Set an audio budget before
the first real batch — which is the same ordering rule, applied one medium over, and the one thing
Phase 4 would tell you if it could.


**Thirteen UNRUN**, all owned by `voltagent-qa-sec:qa-expert` except 4.0b–4.0d's siblings: 4.0, 4.0a,
4.2, 4.3, 4.4, 4.7, 4.9, 4.13, 4.15. These are gate runs nobody performed, not defects — several may
pass on first run. **A criterion nobody ran is reported unrun, never assumed green** *(C2)*.

---

## Vault-out — Phase 4

**Added 2026-08-15.** This heading is what `docs-contract.test.ts` slices against, and Phase 4 shipped
without one — the criterion table above ran to the end of the file, so the test had no lower bound.
Every other phase's log has had one since Phase 1.

**1. A gate that has never run against real inputs is not a gate.** 4.10's instrument was written,
unit-tested and self-testing, and had never once been pointed at the shipped sheets. It took a
different phase, four days later, to produce a single number from it. The unit fixtures made it look
finished. *(Re-earned in Phase 5 as vault-out 8.)*

**2. A criterion satisfied after the fact is not satisfied.** 4.27 was corrected from PASS to FAIL by
a review that read the *order* of events rather than the end state. The defect was genuinely fixed;
the criterion asked for a measurement **before** generating, and no amount of after-the-fact
correctness converts into that. The same reasoning is what keeps 4.2b red.

**3. The catch-all row is where a gate goes to hide.** `all others — UNRUN` sat in this table for six
days and read as tidy. Expanded to one row per criterion it is 13 separate gaps, three of which had
been closed elsewhere and nobody had written down. The compression was doing real damage.

**4. Byte-identical determinism is a property of a step, not of a pipeline.** 4.11 as written could
never pass, because the generation model is not seed-deterministic. Decomposing it — packing is
deterministic and measured, clean-clone rebuild is unachievable without 128 MB in git — turned an
unrunnable criterion into a runnable one and a named successor task.

**5. Real art invalidated the test harness's budget, silently.** 34.5 MB of PNG per boot turned a
44/44 green e2e suite red at 8 workers, against byte-identical source. It presented as
`ready:false / bootError:null` — indistinguishable from the exact hang state refuse-to-route exists
to prevent. **A contended dev server and a genuine boot hang look the same at the assertion**, which
trains a reader to dismiss a red suite as flaky.

**6. Provenance that ships is 10.2 MB of dead weight.** `anchor.png` and `anchor-original.png` live
under `public/` because vault 4.17 requires the prompt and job record beside the asset. The
convention is right and the location is wrong; `verify-dist.mjs` checks for dev-only *symbols*, not
unreferenced *weight*.

---

## 2026-08-17 — criterion 4.23 was RED on `main`, and the renderer was never wrong

Recorded here rather than only in the session notes because **4.23 is a Phase 4 criterion and it
regressed after Phase 4 closed**. Phase 8 authors levels against the character's feet, so this had to
be settled before Phase 8 began.

### The reading that was wrong

The Phase 7 session recorded the failure as *environmental*, because it began after an `npm ci`. The
handoff then challenged that: the installed tree matched the lockfile exactly, so the current tree
was the canonical one and the earlier greens were the suspect runs. **Both readings were wrong.** The
tree was never the variable. The spec was.

### What was measured, in the running game, before the test was touched

Driven with `playwright-cli` against `npm run dev` — the hands-on read the plan required *first*,
precisely so a test would not be edited to fit a diagnosis.

| window | measurement |
|---|---|
| standing still, 240 rAF frames | worst `\|drawnBottom − simY\|` = **exactly 0** |
| screenshot at the feet | `docs/evidence/4-23-feet-standing-2026-08-17.png` — boots on the brass cap |
| run + jump + land, 600 rAF frames / 150 ticks, sampled continuously | worst gap among `simVy === 0` = **22.18104000003086 px** |
| the same sample, predicted `(1 − alpha) · \|dy\|` | **22.18104000003090 px** |
| `simVy === 0` samples where the sim had actually moved the player | **4 of 313** |
| worst gap where `prevY === simY` | **0**, over 313 samples |

Fourteen significant figures. The gap is render interpolation, exactly and only.

### The mechanism

`src/sim/player.ts` resolves a landing by setting `player.y` to the surface **and** `player.vy` to 0
**in the same tick**. `src/sim/advanceSplit.ts` snapshots `prevPlayer` immediately *before* that tick,
and `GameScene` hands that snapshot to `interpolatedPosition`. So on the landing tick a sample reads
`vy === 0` with `prev.y ≠ cur.y`, and the sprite is legitimately mid-blend between them.

The spec filtered on `simVy === 0` and asserted the gap was **exactly 0**, with the message
*"interpolation cannot excuse this"*. It can. The offending sample was `prevY` 1895.7 → `simY` 1920,
`dy` 24.3, `alpha` 0.0872.

**Timing-dependent, which is why it read as a flake.** Whether a sampled rAF lands on the landing
tick with `alpha < 1` varies run to run — and it is why the two recorded failures differed (14.7501
vs 14.7015) and why an earlier run in the same session passed. Nothing to do with `node_modules`.

**The second assertion was broken too**, and by the same mistake: it bounded divergence by *this*
frame's `|vy| + gravity`, when the travel being blended is the tick's. Worst excess over that bound
in the same window was **+21.506 px**. It had simply never been reached, because the exact claim
failed first.

### What replaces them

Both claims now derive from `prevY` — `GameScene.prevPlayer.y`, the value interpolation blends
*from*, sampled in the same rAF callback as the drawn and sim values. Read through `__phaserGame`,
the idiom `phase-05-perf.spec.ts` already uses; **the eight-field `window.__game` surface is
untouched**, so no STOP-and-ask.

1. **Exact, where `prevY === simY`.** The sim did not move the player across the blended tick, so
   interpolation is the identity for any alpha and the drawn bottom must equal the sim feet y to the
   bit. No tolerance, no velocity, no filter a landing can fool.
2. **Contained in `[prevY, simY]`, for every sample.** `lerp` with alpha in `[0, 1]` cannot leave the
   segment. Strictly stronger than the `|vy| + gravity` bound it replaces — it is `|dy|` with no
   slack — and it covers takeoff, flight and landing in one expression.

### 🔴 The red proof caught a bug in the fix, which is the whole reason for the rule

The first containment formula was `|drawn − simY| − |simY − prevY|`, and the `alpha * 1.5` overshoot
mutation **passed it green**. A drawing that overshoots *past* `simY` is still close to `simY`; the
claim being made was containment, so distance-from-one-endpoint was the wrong quantity. Rewritten to
true containment against `[min, max]`, the same mutation reports **11.34 px outside the segment**.

**Had the assertion been trusted without watching it fail, 4.23 would have gone green while blind to
the defect class it names** *(vault C1, C2)*.

`EPS` is `1e-9` — float slack, not tolerance. One ulp at these coordinates (~2000 px) is ~2.3e-13, so
it is thousands of ulps of headroom and fourteen orders of magnitude below the 22.18 px being caught.

### Verdict

**4.23 PASSES.** The renderer, the feet origin and the anchor were correct throughout; two assertions
in the spec were not. No tolerance was widened — both replacements are tighter than what they
replaced.
