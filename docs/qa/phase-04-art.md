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
| **Spend unreconciled** | 22 Seedance clips at **$6.21 – $31.60** against a **$25 ceiling**. `genmedia pricing` reports `0.014 / "units"` with no unit defined; no job record carries a cost field; two authoritative sources disagree by ~22×. Only the fal.ai dashboard invoice settles it, and it has not been read. Criterion **4.2b** cannot pass without it. |
| **Criteria unrun** | The gate's agent owners had not run at the time of writing. A criterion whose owner has not run it is UNRUN. |
| **Codex implementation review not run** | Criterion **4.18**. |
| **S7 not done** | Speed hand-tuning in the Playground; the shipped movement numbers are the derived starting point only. |
| **`run` stride provisional** | 320 px/cycle, two agreeing methods resting on a single frame. Criterion **4.10**'s INDETERMINATE condition is close. |
| **Traceability gap** | Five paid generations have `.mp4` files with no `.job.json`. A live vault-4.17 violation, recorded in [GENERATION-LOG.md](../GENERATION-LOG.md). |
| **400-line rule broken nine times** | Criterion **4.16**. Not justified, not split. See §File sizes. |

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

Note that six of the nine predate this session's work (`gates.mjs`, `chroma.mjs`, `prompt.mjs` and
`sheets.mjs` are Phase 4 tooling; the two e2e specs and `tilemap-data.test.ts` are older). That
explains how they got here; it does not excuse them, and **the rule has no test behind it** — Phase 3
recorded that deliberately, noting a line-count check is cheap but the rule permits a justification
a test cannot read. The consequence is visible above: with nothing mechanical watching, nine files
crossed the line across two phases without anyone noticing until the gate was run by hand.

---

## Criterion-by-criterion

**Not yet complete.** The rows below are filled only where evidence exists; the rest are UNRUN and
the phase is reported failing because of it. `docs-contract.test.ts` requires a row per criterion
before the PRD may mark this phase done.

| # | Verdict | Evidence |
|---|---|---|
| 4.19 | **PASS** | `tests/unit/sheet-packing.test.ts`, exact equality against the committed `lift-profile.json`; both anchoring and rounding mutants red. |
| 4.20 | **PASS** | Same suite: deepest frame on the final row, at least one other frame not. |
| 4.21 | **PASS** | Committed overflow fixture; the packer throws rather than clipping *(vault 4.14 — the cell was raised 336 → 384 instead)*. |
| 4.22 | **PASS** | `tests/unit/ground-tiles.test.ts` against shipped `level-01.tmj`: spike-run cap, all platform/pillar caps, discrimination, half-open boundary, sub-tile nudge. |
| 4.23 | **PASS** | `tests/e2e/phase-04-assets.spec.ts` — drawn bottom ≡ sim feet y on 120+ samples spanning takeoff, flight and landing; `originY` mutant red. |
| 4.24 | **PASS** | Same spec; old-packer geometry mutant red at 267 vs 279. See the weak-assertion note above. |
| 4.25 | **PASS** | Three anchoring candidates rendered against a ground line and chosen on sight; rationale in `character-bounds.json` `_verticalAnchor`. |
| 4.26 | **PASS** | `verify-dist ok`; sweep watched red on all three Gym checks. |
| 4.27 | **PASS** | Anchor sole gap 58 → 1 px at source, 6 → 0 px in game; [STYLE.md](../STYLE.md) §8 amendment; `anchor-original.png` retained. |
| 4.2b | **FAIL** | The invoice has not been read. This is the blocker. |
| 4.11 | **UNRUN** | Byte-identical rebuild is not implemented as an automated gate. |
| 4.18 | **UNRUN** | Codex implementation review. |
| all others | **UNRUN** | Awaiting their gate owners. |
