[← Phase 5 QA log index](phase-05-combat.md) · [QA-LOG index](../QA-LOG.md) · [phase doc](../prd/phase-05-combat.md)

### 🔴 Death never ended. The game had no respawn at all.

**Reported 2026-08-14:** *"I cannot die. It gets stuck before I actually see the kill. [It] stops
getting low health when I get hit. Also, the animation doesn't play anymore for anything."*

Every clause is one bug with four faces, and all four are now closed.

| # | what | evidence |
|---|---|---|
| 1 | **`combatCounter` never advanced in `death`** | `stepCombat` excluded the state from its expiry block outright, so the counter sat at 0 forever and the death window could never close |
| 2 | **Nothing anywhere respawned the player** | `DEATH_TICKS`'s docstring said *"45 ticks before the respawn"*; `stepCombat` said *"the respawn is the caller's decision"*; **no caller decided** |
| 3 | **`brass-courier-death` was not in the catalog** | so `playAnim` no-ops and the corpse holds whichever frame it was on — *"the animation doesn't play anymore"* |
| 4 | **A corpse could be walked around** | `movementLocked` tested `hurt` only; `canAct` blocks a dead player from ATTACKING and nothing blocked them from MOVING |

**`hazards.ts` had recorded the missing respawn as deliberate Phase-4 debt** — *"bolting a respawn
onto a game with no health model would have had to be undone here"*. Phase 5 built the health model
and never came back for it. The note was right when written and became the defect it was deferring.

**Not one test caught any of it, because every test asserted that dying HAPPENS.** Nothing asked what
happens *next*. Vault 9.4's shape, applied to the terminal state of the whole game.

#### The fix

- **`stepCombat` advances the counter for every combat state**, `death` included. What has NOT
  changed is that death is terminal *there* — it still never releases itself into `idle`, because
  that would let a corpse walk. The counter advances so the window can be *asked about*.
- **`deathWindowClosed` is an exported predicate**, not an inequality restated at the call site
  *(vault 5.3)*: the window belongs to the module that declares `DEATH_TICKS`, and two statements of
  one window is where the off-by-one lives.
- **`tick.ts` gains step 4c**, before step 5, so the respawned player is alive for the whole of that
  tick's movement rather than being a corpse's pose in a new position.
- **`World` gains `spawn`.** It was previously a `createWorld` *argument* that initialised the player
  and was then forgotten, which is precisely why nothing knew where to put a player back. Keeping it
  on the world rather than in the scene is what lets the respawn stay inside `tick()`; a scene-driven
  one would be a second place deciding when a death ends, and the tick contract would stop describing
  the whole simulation.
- **`movementLocked` locks `death` too**, with no window on that half — death is locked for as long
  as it lasts, which is what the respawn now bounds. Friction still applies, so a body killed
  mid-run slides to a stop rather than stopping dead.
- **`respawned` joins `TickEvents`** as an edge (vault 2.5). A consumer cannot reconstruct it: a
  respawn restores full hp, so "hp went up" is also what a pickup looks like. `GameScene` drops
  `prevPlayer` on it — `interpolatedPosition` already snaps past `MAX_LEAP_PX`, but only past it, and
  a player who dies within 48 px of the spawn would otherwise be blended across the gap.

**What the respawn deliberately does NOT do: reset the world.** Enemies you killed stay dead, shots
in flight keep flying. A life is not a checkpoint restart. Recorded as a decision because the missing
respawn itself was once read as one.

It also closes the **Phase 4 "fall forever" defect** as a side effect: the kill plane now leads
somewhere.

#### Red-proofs *(C1/C12)*

| mutation | result |
|---|---|
| delete step 4c — the pre-fix behaviour | `Tests 5 failed` |
| freeze the death counter again | `Tests 6 failed` |
| let a corpse walk again | `Tests 1 failed` |

⚠️ Mutation 3 initially reported *"changed=NO"* from a `perl` substitution that silently matched
nothing: **`combat.ts` is CRLF and its neighbours are LF** (recorded finding T18). Verifying the
mutation applied by `cmp` rather than by exit code is what caught it — a "refused" mutation that
looks applied is exactly the C12 failure mode, and this is the first time T18 has actually bitten.

### The player's death sheet, and the cell that had to widen

`brass-courier/death` was bought in an earlier session and **could not pack**: `packStrip` refused
seven of ten frames against the 288 px cell, needing **332 px at frame 9**. A falling body is wider
than a standing one. Vault 4.14 and the packer's own error say the same thing — **widen the cell,
never rescale the animation to fit** — so the courier's cell is **336** now, four pixels over the
true maximum, the same margin convention as the scavenger's 512 over its 510.

Widening is visually neutral: `packStrip` centres each frame and the sprite draws at origin (0.5, 1)
on the feet. It costs payload and nothing else. It had been parked as a STOP-and-ask while it was
only a missing animation; it stopped being optional when dying read as a freeze.

#### 🔴 The W2 gate caught a live instance of its own defect, within the hour

Widening the cell repacks every courier sheet — and the build **aborted** on `brass-courier/jump`:

> `catalog: "brass-courier/jump" was rebuilt but has no timing rule, and index.json already carries
> a "brass-courier-jump" row. That row describes the PREVIOUS sheet and would ship unchanged.`

`jump` and `fall` were the last two "Phase-4 row, no rule" pairs — the exact hole `idle` had been
in, and `catalogTimings.mjs`'s own docstring already records the lesson: *"A Phase-4 row is not a
reason to have no rule; it is a row nobody can correct."* Without the gate, `jump.png` would have
shipped at 336 px with the catalog still saying 288, and Phaser would have sliced it into garbage.

Both now have rules. **18 ticks is the jump's RISE time** — `jumpVelocity / gravity` = 48.6 / 2.7 —
which is a sim quantity, as `asset-catalog.test.ts` requires of any non-looping row. The shipped
values are reproduced exactly, so the catalog does not move; it just becomes correctable.

#### Three stale gates, and one that was measuring the wrong number

Packing `death` fired four expiry tests on schedule (catalog count, `PENDING_ART`, the shipped-sheet
list, the lift-profile action list) — all updated, all still able to go red.

The fifth was **not** an expiry: `sheet-packing.test.ts` re-derived every animation's `liftPx` using
`liftProfile.scale`, the **slug-wide** figure. Two courier actions carry a per-action override —
`attack` at 0.6 and `death` at 0.60504202, against the slug's 0.23723229 — so the re-derivation was
out by 2.55×. It went unnoticed while `attack` was the only override because its lifts round to the
same small integers either way; `death` made it fail loudly. It reads `anim.scale` now, which the
profile records precisely so this is re-derivable, and the assertion is strictly stronger: it can
now catch a per-action scale that disagrees with the strip it produced.

#### One change nobody asked for, recorded rather than buried

Rebuilding `fall` produced **8 frames where the shipped sheet had 6** — a fuller extraction of the
same clip (verified by eye; the two extra poses are real, not a split frame), because the packed
sheet was stale relative to its source. It ships, because reverting one sheet while the rest move to
336 px is exactly the art/catalog divergence this session closed.

**The cost is an uneven dwell**: 8 frames over 18 ticks is **2.25 ticks/frame**, against `jump`'s
even 3. That is the judder mechanism session 9 fixed for loops. It cannot be fixed here without
either pinning the frame count (no lever exists — the count comes from silhouette detection) or
letting a one-shot carry an authored cadence, **which is a gate rule change and therefore a
STOP-and-ask**. Flagged, not absorbed.

### 🔴 The sentry shrank when it fired, and shrank further when it died — twice, the same mistake

Reported on 2026-08-14, in two parts:

> *"This is a K-1 animation now for stationary, but when you shoot, the animation becomes smaller."*
> *"The stationary character, when it dies, when they play the K/O animation, it becomes smaller."*

**The second was introduced while fixing the first**, by the same method, which is why the fix below
is a landmark rather than a number.

#### Why the obvious measurement is the wrong one

A per-action scale is derived by matching the drawn figure to the slug's `renderHeightPx`. The
tempting landmark is the **silhouette** — the opaque bounding box — and for a walk cycle it is fine.

It is wrong for anything carrying an **effect**. The sentry's clips have a muzzle flash, a steam
plume and a debris spray, and every one inflates the bounding box **without making the machine any
bigger**. Match that box to a target and the machine shrinks by exactly what the effect added.

| | derived from | tripod span | vs `idle` |
|---|---|---|---|
| `idle` | the slug scale | 205 px | — |
| `fire` @ 0.42572062 | mean silhouette height | 198 px | −3 % (barely visible) |
| `death` @ 0.34408602 | its first frame's silhouette height | **160 px** | **−22 % (obvious)** |

The `death` note in the bounds file even recorded *why* the mean was rejected — the eight frame
heights run 558…722, a 26.7 % spread, "because a wreck legitimately GROWS as its debris spreads" —
and then used the **first frame's silhouette instead**, which has the same disease in a smaller dose.

#### The landmark that works: the tripod base

It is the same physical object in all three sheets, it sits at the bottom of the frame, and **no
effect in any of these clips touches it** — steam rises, debris falls outward, the muzzle flash is at
barrel height. Its span across the bottom 24 rows measures the **machine**, not the picture.

Correcting each to idle's 205 px gives **0.44077135** (fire) and **0.44086021** (death) — agreeing to
**0.02 %**. That agreement is the real finding: both clips were shot from the same padded anchor, so
**one scale was always right for both**, and two independently-derived numbers were never justified.
Shipped at their mean, **0.44081578**. Re-measured after repacking: **205, 205, 205**.

#### The scavenger is NOT the same defect

*"When he dies, the animation of the kill becomes bigger for each character."* Measured: `death`
frame 0 stands **240 px** against the walk's **239** — correctly scaled. What grows is the
**explosion**: the debris reaches **476 px** wide against a 200 px body, which is the art doing what
an explosion does. Asserted in both directions, so "it is the explosion" is not an explanation for
something that never happens.

#### A landmark has to be chosen per body plan

`tests/unit/sprite-size-consistency.test.ts`'s first version applied the tripod landmark to the
scavenger too and failed by **56 %**. Not a scale error: the sentry's tripod is a **rigid** frame and
the scavenger's legs are not. In `walk` frame 0 one foot is planted and the other mid-swing (a 42 px
footprint); in `chase` frame 0 both legs extend (143 px). **Its footprint is a pose**, and comparing
poses across two gaits measures the gait.

Height is the landmark that survives for a legged body, and the scavenger's own bounds file already
derives its slug scale from exactly that. `brass-courier` is deliberately not gated at all: a person
legitimately changes both footprint and height between standing, running and lying down.

That generalisation is the entry worth keeping. **The gate is per body plan, not per project.**

#### Red-proof

Restoring `death` to the shipped 0.34408602 and repacking turns the new gate red with the diagnosis
in the failure message: *"brass-sentry-death frame 0 has a 160px base against idle's 205px — −22.0 %
… almost certainly a per-action scale derived from the SILHOUETTE."* The file also carries a
sensitivity assertion, so a gate that could not tell that from correct would itself be red.

### 🔴 Five one-shots juddered, and the reason recorded for two of them was wrong

Session 9 fixed the ghosting by making every drawn frame of a **loop** occupy a whole number of
60 Hz ticks. `tests/unit/loop-dwell.test.ts` gated that — and gated only loops, carrying a
`KNOWN_UNEVEN_ONE_SHOTS` list which recorded `brass-courier-attack` (2.5 refreshes a frame) and
`rust-scavenger-death` (4.5) as permanent, with this reason:

> *"A one-shot's `simTicks` is a SIM WINDOW … Rounding one to suit the art would be a balance
> change wearing an animation change's clothes … The honest fix is a frame count that divides the
> window — which is a re-pack of the art, not an edit here."*

**The first half is right and the second half is false.** The list named the fix and then called it
out of reach, on a belief that a one-shot's frame count is detected from the art. It is not: it is
**declared**, in `VIDEO_MOTIONS[key].frames`, and `build-clips.mjs:293` samples exactly that many
source frames out of the clip. The window is the sim's and was never touched. The count was ours the
whole time.

Widening the gate to every row found **five**, not two — the flagged `fall` among them:

| row | window | frames | refreshes/frame | now |
|---|---|---|---|---|
| `brass-courier-attack` | 20 | 8 | 2.500 | **10 frames, 2.000** |
| `brass-courier-death` | 45 | 10 | 4.500 | **9 frames, 5.000** |
| `rust-scavenger-death` | 45 | 10 | 4.500 | **9 frames, 5.000** |
| `brass-sentry-death` | 45 | 8 | **5.625** | **9 frames, 5.000** |
| `brass-courier-fall` | 18 | 8 | 2.250 | ⚠️ blocked — see below |

All four re-extracted and repacked cleanly at $0; `brass-sentry/death` re-declared its existing
`ACCEPTED_EDGE_BLEED` waiver on the way through, printed as it is designed to be. Deaths land on
9 frames rather than 15 deliberately: 5 refreshes reads fine for a collapse and 15 would have added
50 % to a sheet on a boot payload already pinned to `workers: 1`.

#### `fall` is blocked on the ART, and the shipped sheet never passed G6

Re-extracting `fall` at 9 frames throws:

> `assets:clips: "fall" frame 0 of 9 fails G6 edge bleed — left 0px, right 0px, top 0px, bottom 76px`

Measured across all nine sampled frames: **0–4 FAIL, 5–8 PASS** (margins 46–148 px). The failing
edges carry contiguous opaque runs of 138 px (top), 60 px (left) and 50 px (right), so this is a
real mask reaching the edge and not speckle — but the frame itself, looked at at full resolution,
shows the courier with clean green on every side. What survives keying is green that differs enough
from `borderKey`'s sample to stay opaque, on the highest-motion frames of the clip.

**`windowIndices` starts every sampling at the measured motion onset**, so frame 0 is the same
source frame whether 6, 8 or 9 frames are asked for. All three fail identically — which means:

🔴 **The `fall` sheet that ships today never passed G6.** `build-clips.mjs:300-301` calls
`extract()` and *then* `gateSheetEdges()`, so a failing extraction leaves a complete, usable strip
on disk that `assets:build` will pack without complaint. Regenerating the 8-cell strip and repacking
reproduced `public/assets/characters/brass-courier/sheets/fall.png` **byte for byte against HEAD**,
which is how that path was confirmed rather than guessed. The file's own comment shows the hole was
half-seen: the geometry sidecar is written after the gate *"so a strip that fails G6 … cannot be
packed by the new path either"* — and the sentence continues *"consumers treat a missing sidecar as
use the old detection"*, which is the path that packed this one.

`brass-courier/jump` is the same batch and is already recorded as failing G6 on both rounds while
shipping. **`fall` was not recorded, and now is.**

**STOP-and-ask, not absorbed.** Three unblocks exist and each needs a decision: a chroma keying
tolerance (a gate parameter — never to be loosened to clear a red), an `ACCEPTED_EDGE_BLEED` entry
(which requires a reason someone can state, and "green that did not key" is not yet one), or a
re-shoot (money). Until one is taken, `fall` holds 8 frames at 2.25 refreshes.

#### A spec and its strip had silently drifted

`motion.mjs` declared `fall: frames: 6`. `_generated/sheets/fall-clip.png` held **8** cells. The
catalog shipped **8**. `assets:build` packs whatever the strip contains and never reads the spec, so
`assets:clips` and `assets:build` can be run at different times against different declarations and
nothing compares them. The spec now says 8, which is what actually ships.

#### The two gates, and both watched red

`tests/unit/loop-dwell.test.ts` now covers **every** row, not only loops, and its failure message
names the right lever per kind — an authored cadence for a loop, a divisor frame count for a
one-shot. `tests/unit/one-shot-divisor.test.ts` is new and checks the **head** of the chain: the
declared count divides the window *before* ffmpeg is invoked, and the shipped `frameCount` equals
the declared one, which is the assertion the drift above walked straight through.

| mutation | result |
|---|---|
| widen `loop-dwell` to every row, against the catalog as it stood | **5 failed** — the exact five rows above, each naming its lever |
| `brass-courier/attack` frames 10 → 8 | **3 failed** — divisor rule, spec-vs-catalog drift, *and* the "the blocked list must not grow quietly" cross-check |

Restored and confirmed byte-identical with `cmp` *(C12)*. `BLOCKED_ON_ART` lives in
`tests/unit/blockedDwell.ts` so both files skip the same row from one definition *(vault 5.3)*, and
it is asserted in **both** directions: red if `fall` leaves the catalog, red if its dwell changes at
all — including if the art is fixed and the row turns even — and red if any second row joins it.

### 🔴 Criterion 5.11 — rebuilt. Every number it had reported was measuring something else

5.11 asks for the *"frame budget under worst-case enemy count"*. It has been failing **as a
measurement** since session 8, and W10 replaces it. Four separate defects, each fixed:

| | before | after |
|---|---|---|
| **what ran it** | default headless Chromium — **SwiftShader**, a software rasteriser | a headed real-GPU project, `chromium-gpu`, scoped to one spec |
| **what was drawn** | `DEV_FLEET_OFFSET_X` 200 sim px against a **160 sim px** visible half-width — **0 of 20** enemies on screen | spread symmetrically about the player, all 20 inside the view |
| **which enemies** | scavengers only | scavengers **and** sentries, alternating, with bolts in flight |
| **what was sampled** | rAF **interval** over 90 frames vs a 100 ms ceiling | rAF **work**, every frame, vs a control measured in the same page |

The second is the one that made the whole criterion vacuous. The fixture stepped 20 enemies in the
sim and the renderer culled all 20 — so the number that came back was reassuring precisely because
nothing extra had been drawn. Vault 9.4, on the criterion whose entire subject is cost.

#### The old ceiling was a hang detector wearing a budget's clothes

HANDOFF §14 measured the harness directly: the same scene reports **90.10 ms** headless against
**4.2 ms** on the real GPU, a factor of **21**. A 100 ms ceiling set against the first number cannot
fail for any reason short of a hang — and the old comment said as much in its own words. This is why
the fix is a different **measurement** and not a different tolerance.

#### `long-animation-frame` was tried first and cannot gate this

The plan called for `PerformanceObserver` on `long-animation-frame`, and it was built that way.
Measured on the GPU, **both halves reported zero entries and zero blocking time**: LoAF only emits
for frames over **50 ms**, and this game runs at **4.16 ms** a frame on a 240 Hz display. The ratio
was `0 / 0` and the gate could not be made to fail — decoration *(C2)*.

It is kept and reported, because *"no frame in the window exceeded 50 ms"* is true and worth having.
**Nothing is asserted on it.**

#### What gates instead: rAF's own timestamp

`requestAnimationFrame` hands its callback the frame's start time. Read at the top of a callback
registered **after** the game loop's, `performance.now() - frameStart` is the main-thread time that
frame has already spent — `update()`, the sim ticks inside it, and the render submission. It reports
on every frame rather than only slow ones, and it moves when the scene gets heavier.

The ordering holds because rAF runs callbacks in registration order and both parties re-register
from inside their own callback, so the sampler stays behind the work it measures. A median of 0
would mean it had got in front, and that is asserted, not assumed.

#### The gate is a RATIO, against a control in the same page

⚠️ **An absolute millisecond figure from this harness is uninterpretable** *(HANDOFF §14)*. So the
identical sampler runs **twice in one page, seconds apart** — first against the level's own 2
enemies, then against 22. Machine, driver, Vite still compiling, whatever else is on the box: all of
it is present in both halves and divides out. What survives is what 5.11 actually asks — *what
adding 20 enemies costs*.

**Recorded baseline**, four runs on this machine (240 Hz display, real GPU, 120-frame windows):

| | baseline, 2 bodies | fleet, 22 bodies | ratio |
|---|---|---|---|
| run 1 | 0.90 ms median | 0.90 ms | 1.00x |
| run 2 | 0.70 ms | 0.80 ms | 1.14x |
| run 3 | 0.70 ms | 0.80 ms | 1.14x |
| run 4 | 0.70 ms | 0.80 ms | 1.17x |

**11x the enemies costs about 1.1x the frame work**, peak 8–9 bolts in flight, zero frames over
50 ms in any run. `performance.now()` is coarsened to 100 µs in Chrome, which is why the ratios land
on a coarse grid at this magnitude — it is the reason the bound is 4x and not 1.5x.

`MAX_WORK_RATIO = 4` is set to catch a cost that grows **faster than the enemy count** — an O(n²)
sweep, a per-enemy texture upload, a per-frame allocation storm — not to pin today's number.

#### Red-proof *(C1/C12)*

An O(n²) sweep injected into `EnemyLayer.sync` (every subject against every subject, 3000 `sqrt`
each):

```
baseline  2 bodies: work median 0.70ms   <- unchanged
fleet    22 bodies: work median 4.50ms, p95 7.70ms
work ratio 6.43x for 11.0x the enemies   -> 1 failed
```

**The control did not move and only the fleet half did** — which is the proof that the measurement
isolates the enemy count rather than the machine. Restored and confirmed byte-identical with `cmp`;
re-ran green at 1.17x.

#### A false red found on the way, in a different test

The first full sweep after the split failed `the drawn enemy is interpolated between ticks` with
**every one of 90 lags exactly 0** — and it passed twice in isolation. Interpolation is only
observable while the subject is moving, and a patrol reversal or a chase paused inside the dead zone
holds the scavenger still; a window that catches that reports exactly what the defect reports. The
test now records the scavenger's own position alongside the lag and asserts it moved, in those
words, and samples 240 frames instead of 90. **The tolerance did not change** — what changed is that
the two causes are now distinguishable. Full sweep after: **49 passed**.
