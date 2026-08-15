[← Phase 5 QA log index](phase-05-combat.md) · [QA-LOG index](../QA-LOG.md) · [phase doc](../prd/phase-05-combat.md)

## Session 10 — two reversed decisions, and the scavenger's own foot-plant

Both entries below reverse a decision that is written down with a rationale, so both are recorded
here as reversals rather than applied as silent knob edits. Both are the user's calls, taken
2026-08-14 off a screen recording of live play.

### 🔴 Aggro is PERMANENT. `releaseRadius` and `CHASE_COMMIT_TICKS` are deleted.

**Reverses:** `enemyScavenger.ts`'s *"`chaseSpeed` sits between `walkMax` and `runMax` —
**deliberately escapable**. A chaser faster than the player's run means fleeing is never an option,
and with no stamina system that is not tension, it is a tax."* That reasoning stands on its own
terms; the user simply wants a different game. Their words: **"it should keep coming until I kill
it."**

**And it was already the source of a reported defect.** The second half of the same report —
*"after it sees me, it gets stuck after I get far from him"* — was the 720 px `releaseRadius`
combined with the patrol clamp: driven past its patrol bound, a chasing scavenger was pinned there
playing a run animation while covering no ground, until the player crossed the release threshold and
it went back to patrolling. On screen that reads as broken, not as territorial.

| | before | after |
|---|---|---|
| enter a chase | inside `detectRadius` 480 | unchanged |
| leave a chase | outside `releaseRadius` 720, after `CHASE_COMMIT_TICKS` 30 | **only death** |
| reach of a chase | clamped to `patrolMin`/`patrolMax` | **bounded by ground** |
| anti-flap mechanism | hysteresis gap + commitment floor | **unreachable by construction** |

**The anti-flap machinery went with it, and nothing was lost.** Hysteresis existed so a player
straddling the boundary could not toggle patrol↔chase every tick, which restarts the animation every
tick (vault 5.1's render-side consequence). With one one-way transition, **a state with no exit
cannot flap.** The flap test in `enemy-ai.test.ts` is kept *unchanged* and still passes: it asserts
the property (the drawn state does not oscillate), not the mechanism, so it outlived the mechanism.
Re-proved red against the current code by making the chase clearable — 1 state change becomes ~300.

**Ground-following replaced the patrol clamp.** A patrol bound is a level-design number about where
an idle machine walks; it was never the reach of a hunt. A chase now steps only where the body's
**leading edge** still has ground — `groundUnder` in `enemyGeometry.ts`, probed at
`x + dir × halfWidth`. The centre probe the first draft used would walk half a 120 px body over the
void (Codex plan review finding 7), and since enemies have no gravity it would *hang there* rather
than fall, which is worse than either. `stepScavenger` takes the footing as a **required** argument
for the same reason `createWorld`'s `scale` is required (vault 2.11): a caller that forgot it would
get the old pinned-at-the-bound behaviour, silently.

**Death is now the only exit, so it had to be written down.** `stepEnemies` clears `chasing` and
`chaseCounter` on `hp <= 0` — one place, covering every cause of death. Codex plan review finding 3:
the existing test for this was **vacuous**, setting `hp = 0` on a scavenger that had never chased,
so it passed on the field's initial value. Replaced with a scavenger that is chasing first and then
killed **by real swings through `tick`**, which also closes finding **T2** (nothing in the suite
killed a live enemy with the real attack path; 5.10 and 5.16 both assigned `hp = 0`).

**⚠️ Owed, and not done this session: the hands-on check at `x: 3198`.** A recorded playtest bug
wedges the player against terrain with a scavenger in contact, draining 100 → 35 hp with no way
past. It was never diagnosed and is not a Phase 5 criterion. A scavenger that never gives up *and*
follows out of its patrol zone turns that wedge from "escapable by breaking line of sight" into a
guaranteed death. **If it is now unsurvivable, that is a blocker to raise, not something to absorb.**

### 🔴 `chaseSpeed` 8 → 6, because it is a measurement now and not a taste

**Reverses** nothing written down — 8 was never justified against the art. It is recorded here
because the number moved and because the *method* is now binding on every future locomotion sheet.

The user reported *"when Scavenger is running fast, the animation is not smooth like the character."*
Correct, and the cause is the defect the player's own locomotion had until earlier the same session:
the chase shipped at **2 ticks/frame against `chaseSpeed` 8**, so the body advanced 16 px per drawn
frame while the art moved the planted foot **18**. Nothing was watching, because the scavenger's foot
travel had never been measured at all.

Measured off the shipped `chase.png` with the courier's planted-foot tracker; the derivation, the two
agreeing contact bands and the excluded foot-switch frames are in
`character-bounds-rust-scavenger.json` → `_footPxPerFrame`, which is the copy of record.

| | before | after |
|---|---|---|
| `chase` cadence | 12 frames / 24 ticks — 2 ticks/frame, 30 fps | 12 / 36 — **3 ticks/frame, 20 fps** |
| `chaseSpeed` | 8 | **6.0** |
| body px per drawn frame | 16.0 | **18.0** |
| foot slide | **+12.5 %** | **0.00 %** |

**The decided value was unreachable, and that is worth stating plainly.** The session's earlier
decision was *"three quarters of the run speed"* — 6.75 at `runMax` 9.0. Planted feet require
`ticksPerFrame × speed === footPxPerFrame` with a **whole** `ticksPerFrame`, so the chase speed is
`18 / n` and the only values that exist are **18, 9, 6 and 4.5**. 6.75 is not among them. 6.0 was
taken as the nearest reachable value below it — two thirds of the player's run rather than three
quarters. 9.0 was rejected as the alternative: it is exactly the player's run speed, and with aggro
now permanent that would make combat mandatory rather than chosen.

**`tests/unit/foot-plant.test.ts` gained a `rust-scavenger-chase` block** so the next slug is a rule
rather than a second discovery. `catalogTimings.mjs`'s mirrored `SCAVENGER_CHASE_SPEED` caught its
own drift on the same run the sim constant moved, which is the whole justification for a hand-copied
constant existing there.

### Red-proofs *(C1/C12)* — every mutation verified applied by count, and reverted

| mutation | result |
|---|---|
| delete the death transition in `stepEnemies` | `Tests 1 failed` — "a CHASING scavenger, killed by real swings, stops chasing" |
| centre probe instead of the leading edge | `Tests 1 failed` — "stops before its LEADING EDGE leaves the floor" |
| `CHASE_TICKS_PER_FRAME` 3 → 2 | `Tests 2 failed` — the whole-dwell and the plant-invariant assertions |
| make the chase clearable again (`if (!detects(...)) chasing = false`) | `Tests 7 failed`, including the untouched flap test |

Each verified as *content changed AND the original count dropped by one*, restored, and confirmed
byte-identical with `cmp` — never as "the original count is now zero" *(C12)*.

### One e2e flake, recorded rather than smoothed over

The first full `npm run test:e2e` after this change failed criterion 5.11's sanity ceiling at
`medianMs 102.3` against `< 100`. Four subsequent runs of that spec passed, as did a second full
sweep (**48/48**). It is recorded, not dismissed: the ceiling is a headless SwiftShader figure that
HANDOFF §14 measures at ~21× the real GPU, on a box that had just run the whole vitest suite — which
is exactly why **W10 rewrites what 5.11 measures**. It is not evidence about this change, and it is
not evidence the gate is sound either.

### 🔴 The scavenger was STILL not smooth, and the cadence was never the whole cause

The user re-reported it after the chase was planted: *"the scavenger, his animation is not smoothing
like my character."* Re-timing `chase` was correct and insufficient, because **two different defects
look alike at a glance** and only one of them had been fixed.

**Session 9 gave the interpolation to the player and to nobody else.** `src/render/interpolate.ts`
blends a drawn position across the leftover accumulator, and `interpolate.test.ts` gates that
function thoroughly. **What no test asked was who calls it** — the answer was
`GameScene.renderPlayer`, and only that. `enemyLayer.sync` wrote `body.setPosition(desc.x, desc.y)`,
the raw tick position, so every enemy was drawn as three identical frames followed by a jump on any
display faster than 60 Hz. The defect had become *more* visible for having been fixed on the
character standing next to it, which is exactly the comparison the user's words name.

| | player | enemies, before | enemies, after |
|---|---|---|---|
| drawn position | blended across the accumulator | **raw tick position** | blended, same accumulator |
| snapshot taken | before the last tick of a batch | — | before the last tick of a batch |
| gated by | `phase-02-movement.spec.ts` lag test | **nothing** | unit + e2e, both red-proved |

**Fix.** `EnemyLayer` gains `snapshot()` and `sync(alpha)`. `GameScene` calls the first at the exact
seam it captures `prevPlayer`, and feeds the second `renderAlpha(this.accumulatorMs)` — the same
factor from the same accumulator, so the two can never disagree about what "now" means on screen.
The sentries-then-scavengers ordering moved into one private `subjects()` used by `create`,
`snapshot` and `sync` alike *(vault 5.3)*: a snapshot walked in a different order would blend each
enemy toward a **different enemy's** position.

**Health bars ride the drawn body**, shifted by the same delta. `healthBarDesc` is positioned from
the sim, so without that shift the bar would hang still while the body slid underneath it — the same
defect one layer up, and more obvious for the two being inches apart.

**Projectiles are deliberately NOT interpolated.** A shot is created and destroyed by the sim, so
`world.projectiles[i]` is not the same bolt from tick to tick, and index-matched blending would slide
a *new* bolt out of a *different* one's position. Doing it properly needs an id per shot, which is
`projectileView.ts` (W16, unbuilt). At `projectileSpeed` 9 px/tick it is also the smallest of the
three steps by some distance.

**Two gates, because one of them could not see the bug.**
`tests/unit/enemy-interpolation.test.ts` gates the layer's arithmetic against a mock scene — it
sweeps alpha across the open interval and demands the drawn x actually vary, which is the assertion a
layer ignoring alpha cannot satisfy. But a unit test cannot see whether `GameScene` ever calls
`snapshot()`, and **that call site is precisely where the original hole was**. So the e2e in
`phase-05-combat.spec.ts` mirrors the player's own ghost test: sample `simX - drawnX` once per
animation frame, in-page, and require at least one non-zero.

| mutation | result |
|---|---|
| `setPosition(desc.x, desc.y)` — the original defect | unit: `Tests 3 failed` |
| delete `this.enemies.snapshot()` in `GameScene` | unit: **all green** · e2e: `1 failed` |

That second row is the entry worth keeping: **the unit gate alone would have passed a game with the
bug still in it.** The e2e is not redundant coverage, it is the only thing watching the wiring.

### W5 — level-01 traversal, proved by simulation. Two long-standing unknowns closed.

Codex plan review finding 5 killed the hand arithmetic this was going to rest on — it had the pit at
192 px (real: 288) and the airtime at 37 ticks (real: 35). `tests/unit/level-traversal.test.ts` runs
the **real** `tick` over the **real** shipped `.tmj` rectangles with the **real** collider and
acceleration curve, and reports what happened. Nothing in it is computed.

It found more than it was aimed at.

#### 🔴 The spike strip was impassable at any speed, and had been since Phase 4

| width | run-up | standing jump |
|---|---|---|
| 96 – 216 | clear | clear |
| **192 (now shipped)** | **clear** | **clear** |
| 240 | clear | **hit** |
| 252 – 384 | **hit** | **hit** |
| **384 (was shipped)** | **hit, −20 hp, stops at x 2554** | hit |

Nothing caught it because **the only reach gate in the suite was vertical**:
`tilemap-data.test.ts` asks whether every platform is within the measured apex, which cannot see a
gap too wide to cross.

**240 px was measured as the width where a run-up is REQUIRED but possible, and was deliberately not
taken.** That window is **12 px wide** — 252 already fails — so it exists only at exactly top speed
and would break silently on the next tuning pass. 192 is the user's approved value: crossing costs a
deliberate jump input, and walking into it still hurts. The test asserts the second fact rather than
a knife-edge one it cannot honestly hold.

**The narrowing was made in `make-greybox-level.mjs`, not in the `.tmj`.** The first attempt edited
the level file by hand and `level-entities.test.ts` caught it within one run: gid 13 was suddenly
drawn both inside and outside the hazard, i.e. two columns of spikes the player walks through. The
hazard rectangle is *derived* from the `SPIKES` array precisely so drawn-and-harmless cannot happen
again — Phase 4 shipped exactly that from two lists that drifted. Editing the output put the drift
back.

#### 🔴 `x: 3198` is DIAGNOSED. It is not a wedge and there is no bug.

Recorded 2026-08-12 as *"the player wedges against terrain, 100 → 35 hp, no way past"*, never
diagnosed, carried as an open unknown through two sessions. The first draft of the pit test reported
the player stalling at **x 3198** — the same coordinate, reproduced by accident.

`3198 + 66` (half the player's 132 px box) is **exactly 3264**: the left face of the level's 96 × 288
pillar, a solid the player is meant to **jump**. Running right into it stops you dead, which is a
collider working correctly. What made it read as a trap was taking contact damage there with no idea
why forward movement had stopped. Pinned now, both halves — blocked on the ground, clearable with a
run-up — so a future layout edit that makes the pillar genuinely unclimbable fails here instead of
being re-reported as the same mystery.

#### 🔴 The permanent-aggro blocker is SETTLED, and the answer is terrain

The plan raised it and was right to: a scavenger that never gives up *and* leaves its patrol zone
could turn the `x: 3198` stall into a guaranteed death.

**It cannot.** `level-01` stands its scavenger on the floor section beginning at **x 4128**, and the
pit at **3840–4128** separates that section from the pillar. Ground-following stops the chase at the
pit's eastern lip, over **400 px** from the player. The terrain that makes the pit an obstacle for
the player is the same terrain that makes it impassable for the enemy.

Asserted, not reasoned — and red-proved: **with the ground veto removed the scavenger closes to
92 px of the stall**, which is the blocker arriving exactly as predicted. The veto is what prevents
it, and the test says so in its failure message.

### W6 — criterion 5.8's health-bar block was measuring a width the game never draws

`enemy-view.test.ts` hardcoded `SLOT = 120`. The shipped slot is `barSlotWidth(RENDER_SCALE)` =
24 × 6 = **144**; 120 predates Phase 4's 3× rescale and nothing updated it because nothing connected
it to `BAR_LOCAL`. An entire `describe` — including the premise the criterion rests on — was
evaluated against a fiction. `barSlotWidth` is exported now and the test derives it.

**Correcting it exposed a second, worse problem.** At the real 144 px against 60 max hp, the naive
`Math.max(MIN, ratio × slot)` floor and the shipped compression behave **almost identically**: the
floor only bites at 1 hp, so no two adjacent hp values are flattened onto each other. The test
written specifically to distinguish the two implementations — *"1 hp and 2 hp are
distinguishable"* — **passed against the naive floor.** Found by mutation, not by reading; all 17
assertions stayed green.

`healthBarFillWidth` is a pure function of three arguments, so it is now also exercised at a geometry
where the difference lives (120 px / 100 max hp, the case it was designed for), with an explicit
premise assertion that two adjacent living hp values really do round below the floor there. Both
blocks are kept: the shipped one proves the criterion holds where the game runs, the dense one
proves the implementation is the right one and can still go red.

Stale prose in `enemyHealthBar.ts`'s header corrected too — it cited *"2 of 100 against a 120 px
slot"*, and no enemy in the game has 100 max hp.

### W7 / T6 — `withinRadius` had no direct test, and `dy` was decorative

Every fixture that reached it did so through a sentry or a scavenger, and **every one placed the
enemy and the player at the same `y`**. With `dy === 0` the vertical term contributes nothing, so
deleting it from the distance entirely left the whole suite green — the radius was only ever tested
as a horizontal one. That matters in the shipped level, which stands its sentry four tiles above the
player.

Direct tests added for both shared geometry predicates, including a 3-4-5 diagonal (each leg inside
480, the hypotenuse outside) that a per-axis test cannot express. Red-proved: deleting `dy * dy`
now fails two named assertions.

### Red-proofs this pass *(C1/C12)*

| mutation | result |
|---|---|
| spike strip back to 384 px | `Tests 2 failed` — the run-up and the pillar clearance |
| hand-edit the `.tmj` instead of the generator | `Tests 1 failed` — gid 13 inside and outside the hazard |
| remove the chase's ground veto | `Tests 1 failed` — scavenger reaches within 92 px of the x:3198 stall |
| `healthBarFillWidth` → naive `Math.max` floor | `Tests 2 failed` (was: **0 failed**, before the dense-geometry block) |
| delete `dy * dy` from `withinRadius` | `Tests 2 failed` (was: **0 failed**) |

Two of those five previously turned nothing red at all.

### A harness bug worth recording, because reading two failures together is what caught it

`level-traversal.test.ts`'s first draft took a `runUpTicks` argument and every call passed `999`
meaning *"jump whenever the trigger says"*. It actually meant *"wait 999 ticks"*, the loop runs 600,
and the player therefore **never jumped in any test**. The tell was a run-up that failed and a
standing hop that succeeded **in the same run** — impossible for any real geometry. The parameter is
gone. A test harness that can produce a contradiction is worth more than one that quietly produces a
plausible wrong answer.

### W2 — the catalog could ship a row describing a sheet that no longer exists

Codex plan review findings 2, 4 and 9, in one pass.

#### The hole

`build-assets.mjs` wrote a catalog row inside `if (hasCatalogTiming(slug, action))` **with no
`else`**, and `catalogWrite.mjs`'s `upsertCatalogSheets` deliberately leaves keys it was not handed
untouched. Together: a sheet rebuilt **without** a timing rule keeps shipping the row describing its
**previous** self — different frame count, different dimensions, same key, and the game slices the
new PNG by the old numbers. Silently. It bit `brass-courier/idle` in play.

The review also rejected the first proposed fix — a warning log — and was right to. The stale row
still ships, and one more line in a build that prints thirty is not a gate.

**A rebuilt sheet with no timing rule and an existing row now FAILS the build.** That is the only
safe answer of the three: writing a row means inventing a timing, which `timingFor` throws rather
than do; deleting the row silently removes an animation the game is currently registering, turning a
data problem into a missing-texture problem at runtime.

Proved against the **real build**, not just the unit: deleting `chase` from `AUTHORED_LOOPS` and
running `assets:build rust-scavenger chase` now aborts with the pair named, the stale key named, and
both repair routes spelled out. Before, it wrote the PNG and left the old row in place.

#### The check that could not fail

The plan's dimension check compared a row's `frameWidth × frameCount` against dimensions
`sheetsPack.mjs` had just constructed **from those same numbers** — tautological, and
`sheet-packing.test.ts` already covers the packer's arithmetic (finding 4).

`validateCatalogRows(rows, measure)` takes the measurement as a **function**. The production caller
decodes the PNG bytes off disk; the tests hand it a deliberately inconsistent object. That injection
is the only reason the check can go red at all, and it now refuses four distinct cases: a narrower
sheet, a different height, an unmeasurable file, and a non-function measurer (which would otherwise
pass every row unchecked — the same failure one level up).

#### The 400-line rule, obeyed rather than negotiated

`build-assets.mjs` was **406 lines before this session added anything to it** (finding 9), and
`file-size.test.ts` was green only because it tolerates ten named offenders. Adding the catalog fix
took it to **430**.

Extractions, in the order they were tried:

| what moved | to | result |
|---|---|---|
| the catalog decision + the two row shapes | `catalogDecision.mjs` | 430 → 427 — **barely anything**, because object literals became argument lists of the same length |
| the whole `--derive-scale` command mode | `deriveScale.mjs` | 427 → **393** |

The second is the real cut and the reason is worth keeping: `--derive-scale` reads frames, prints a
number and **returns before anything is written**. It shared argument parsing with the build and
nothing else, so `main()` was a function with two unrelated halves. Splitting by *what a thing does*
moved 34 lines; splitting by *object shape* moved 3.

Both command modes were re-run afterwards and produce byte-identical output: `assets:build
rust-scavenger chase` rewrites the same sheet and the same row, and `--derive-scale` still prints
**0.56074766**, the value the config carries.

#### Red-proofs

| mutation | result |
|---|---|
| `if (false && hasExistingRow)` — the missing `else`, restored | `Tests 2 failed` |
| delete `chase` from `AUTHORED_LOOPS`, run the REAL build | build aborts, PNG written, **catalog untouched** |
| measurer returns a narrower / shorter / unreadable sheet | `Tests 3 failed` |

`tools/gen/catalogDecision.d.mts` follows the hand-written declaration pattern `png.d.mts` and
`edgeExceptions.d.mts` already use — the implementation stays `.mjs` outside the tsconfig `include`,
so its `node:` imports never drag `@types/node` into a project whose dependencies are frozen.
