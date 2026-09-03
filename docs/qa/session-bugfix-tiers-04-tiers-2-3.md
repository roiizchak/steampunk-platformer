[← bug-fix session log index](session-bugfix-tiers.md) · [QA-LOG index](../QA-LOG.md)


## Verification sweep — 2026-08-23, after twelve items

| check | baseline (Phase 9 close) | now |
|---|---|---|
| typecheck | clean | **clean** |
| unit | 2154 / 0 fail, 133 files | **2212 / 0 fail** |
| build | exit 0, `verify-dist ok` | **exit 0, `verify-dist ok`: 5 levels + 11 audio byte-identical** |
| `test:sim-isolated` | 2151 passed / 3 skipped | **2209 passed / 3 skipped**, Phaser reinstalled cleanly |
| e2e | 118 passed / **1 failed** (criterion 1.4) | **119 passed / 0 failed** |

**The e2e suite is fully green for the first time in this record.** Criterion 1.4 had failed 6 runs
of 6; G.7b stayed fixed.

⚠️ Worth noting for the inventory's §0.2: this e2e run came **immediately after
`npm run test:sim-isolated`**, which is the exact sequence the inventory blamed for poisoning the
dep cache. The warm-up absorbed it — `dev server warm in 34.4s` — and all 119 specs then ran warm.
That is the second measurement showing cache state was never the variable; the first page load
costs ~33 s whatever the cache holds.

Port 5173 confirmed clear afterwards *(C13)*.

---

## B3 / 1.3 / 4.4 — the spec that contradicted its own docstring

**Status: RESOLVED. The bug was fixed; the paragraph saying otherwise was stale. Both halves proven
by mutation, not by reading the green.**

`phase-06-lifecycle.spec.ts:186` headed a paragraph *"🔴 `test.fixme` — it FAILS, and the failure is
a real defect, not a flaky test"*, describing the HUD frozen over an error screen with
`TypeError: … reading 'glTexture'` in the console, and saying *"Phase 7 owns it"*. Phases 7, 8 and 9
all shipped. The test below it has been a plain `test(...)`, passing, the whole time.

Exactly one of two things could be true. **It is the first.**

The fix is in `BootScene.init()` — it stops `Game` and `UI` **before** the reload, unconditionally,
instead of relying on `refuseToRoute`'s stops at the end of a boot attempt. Its own comment names
this very test as how it was found: *"found by writing the restart-based refusal test Codex's second
implementation review asked for."*

| mutation on `BootScene.init()` | result |
|---|---|
| remove **both** pre-reload stops | **FAILS**, and only this test of the five — `bootError` never arrives, 20 s timeout. Nothing runs after the render loop throws, so the refusal never completes. The described bug, exactly |
| remove **only** `stop('UI')` | **all 5 still pass** |

So the gate is real and the docstring was three phases out of date. Replaced in place with the
evidence rather than deleted, so a reader sees what was settled and how.

⚠️ **The second row is a real, narrower gap, recorded rather than hidden.** This test depends on the
**`Game`** stop: `GameScene` draws the world textures `preload` frees, and the HUD alone does not
touch them. An edit dropping only the UI stop would go unnoticed here. It is harmless today — the
HUD still stops via `refuseToRoute`, because nothing threw — so it is left as redundancy. Closing it
would mean reaching into UIScene's display list, and no defect currently makes that worth doing
*(C11)*.

Also closes **4.4**, which was the same item seen from the Tier-4 side.

Spec green after revert: **5 passed**. Port 5173 clear *(C13)*.

---

## B8 / 1b.4 (T13) — the parallax rig, and the three modules still uncovered

**Status: PARTIALLY FIXED. The named module is gated; three siblings are still open and are named.**

T13, recorded LOW in Phase 5 and never done:

> The six modules extracted from `GameScene.ts` have **no tests**. `parallaxRig.ts` returning
> `100 + i` instead of `-100 + i` would draw all three backgrounds *over* the player and every gate
> would stay green.

Its own disposition names the class: *"the same defect as 'deleting `renderPlayer()` left every
Phase 2 test green' — reintroduced by a split."* Splitting a file to satisfy the 400-line rule moves
code out of whatever coverage the original had, and nothing notices. CLAUDE.md §2 requires a
draw-path gate for every `src/render/` module; `parallaxRig.ts` had none.

### Behavioural, not source text

`gameParallax.ts` takes Phaser as a **type-only** import, so the whole path is driven against a fake
scene — the `enemy-feedback.test.ts` idiom, which CLAUDE.md prefers. That matters here: the defect
T13 names is not a missing call but **a number reaching `setDepth` with the wrong sign**, and no
source scan can see that.

### Both named mutations, run

| mutation | result |
|---|---|
| `depth: -100 + i` → `100 + i` *(T13's own)* | **`PASS (2221) FAIL (1)`** across the whole suite — one failure, `EVERY depth is negative`. One in 2222 is the measure of how uncovered it was |
| `image.tilePositionX = …` → `image.x = …` | `PASS (8) FAIL (2)` — the texture-offset assertion and the further-moves-less one |

The second mutation is the defect `gameParallax.ts`'s own comment records having **already shipped
once**: setting position instead of texture offset double-applies the scroll and slides the layer off
the viewport, *"which showed up as a black band above a strip of background."* It was fixed by hand
and nothing has watched it since.

**Revert confirmed** *(C12)*: suite **2222 / 0**, up 10.

### ⚠️ Still uncovered, named individually

T13 says *six* modules. Two now have behavioural tests (`gameParallax`, and `goalArtSize` via
`shipped-gate.test.ts`). **Three have none**: `gameAnimations.ts`, `gameHud.ts`, `gameLevelDraw.ts`
— each appears in `tests/` only through `file-size.test.ts`, which counts their lines.

They are **not reached this session** rather than judged safe. `gameAnimations.ts` is the one to do
first: its own header records a Codex finding that a comment there had been *believed* while being
false about where the fps comes from, which is the same failure this session keeps meeting.

---

## B4 / 1.4 — a body starting inside a solid, RE-AFFIRMED as a non-fix, with the coupling made executable

**Status: NOT FIXED, deliberately** *(C11)*. **The reason is now enforced rather than written down.**

Both resolvers refuse only a body that **was clear** on the previous frame:

- `blockedAt` (`enemyGeometry.ts:154`) — `const wasClear = …; if (wasClear) return true;`
- `resolveCollisions` (`player.ts:311-319`) — pushes out only under `wasLeft` / `wasRight`

So a body that *starts* inside a solid is not pushed out and keeps moving deeper. Verified real.

### Why it stays

The obvious fix — *"if you are inside, refuse"* — **breaks the `EVERYWHERE` fixture and would have
trapped a shipped enemy at boot.** `FOOT_TOLERANCE_PX`'s docstring carries the measurement: all
**twenty** enemies across the five levels stand with *exactly zero* separation from their floor, and
nudging a floor strip up by 1 px already made `describePlacementProblem` reject a level once. That
rule has been rewritten twice for this.

And the two resolvers share the rule. **Changing one without the other puts the player and the
enemies on different physics** — worse than the latent bug, and much harder to see. The paired change
touches the collision every Phase 2 assertion rests on; it is real work with real risk and is not
attempted here.

### What DID change: the coupling is no longer a sentence

*"Treat as a paired change or not at all"* lived in a review nobody re-reads — and this session has
now met three separate items (**1b.2**, **1b.6**, **2.3**) whose entire story is that a promise to
remember was not kept.

`tests/unit/overlap-escape-parity.test.ts` pins both behaviours **as a pair**, so a change to either
resolver alone goes red with the reason in the message.

**Watched red** *(C1)*: giving `blockedAt` an overlap rule and leaving the player untouched —
`PASS (4) FAIL (2)`, the failure reading *"`blockedAt` now refuses an overlap. `resolveCollisions`
must change WITH it, or the enemies and the player are on different physics."*

Each half also carries its **positive** case (a newly-entering body IS stopped) so the pin cannot be
satisfied by a resolver that does nothing at all — which is what a behaviour-pinning test degenerates
to if nobody checks.

**Revert confirmed** *(C12)*: suite **2248 / 0**.

---

## C5 / 2.5 — the controls banner was illegible, and it ships

**Status: FIXED.**

`addHelpBanner` hard-coded `fontSize: '18px'`. At 852 × 480 — the smallest size this project supports,
a 0.444 scale — that is **8 physical pixels**, a third under the ~11 px floor the gear counter is
sized against, and it was confirmed illegible in a playtest screenshot rather than inferred.

**The first question the plan asked was whether the banner is dev-only. It is not — it ships**, and
`helpLine()` says why in its own comment: the mute keys and `ESC levels` are in the shipped half
deliberately, because *"a mute control the player cannot discover is a mute control they do not
have."* This banner is the only place the game states its controls at all. An illegible one is those
controls not existing.

**`HELP_FONT_PX = 28`**, in `hud.ts` beside the counter's own sizing and derived the same way:
28 × 0.444 = **12.4 physical px**. Not larger, because the line runs ~110 characters shipped and ~150
in a DEV build — so it also gained `wordWrap` at the view width. Without the wrap the fix would just
push the right-hand controls off the edge, which is the same defect in a bigger font.

**Watched red with the shipped value** *(C1)*: `HELP_FONT_PX` back to 18 gives `PASS (21) FAIL (1)` —
*"the controls banner is under the legibility floor: expected 8 to be greater than or equal to 11"*.
The gate reads the scale from `hudLayout`, so it cannot drift from the counter's own measurement.

⚠️ **The `setScrollFactor(0)`-on-a-`GameScene`-object half is NOT fixed** *(C11)*. Moving the banner
to `UIScene` is scene plumbing with no observed defect behind it: the banner is created in
`create()` and dies with the scene, so it has none of the HUD lifecycle problem vault 6.1 is about.
Recorded, not chased.

---

## C6 / 2.6 — the exit's flourish played over an empty doorway

**Status: FIXED, and it needed a new tick edge.**

`animateGoalReached` was called from `onLevelCompleted`, which runs on `levelCompleted` — **twenty
ticks after** the player reached the door and one tick after the courier finished fading out. The
*completed-it* animation was playing where the *reached-it* one belongs. `goalLayer.ts` recorded the
defect against itself and nobody moved it.

### There was no arrival edge, and deriving one was not allowed

`TickEvents` had `levelCompleted` and nothing earlier. The scene could have watched
`world.goalEntryTicks` go `null` → number, but that is **re-deriving an event edge from two samples
across frames** — and a frame that drains several ticks steps straight over the arming tick, which is
precisely what `advanceSplit` exists to prevent.

So step 9d emits `goalReached`, from two samples taken **inside the tick that causes the transition**
— straddling one step, not one frame. `mergeEvents` walks the record rather than a field list, so it
merges the moment `noEvents()` declares it; `SILENT_EDGES` gains it, with a note that 3.6's
level-complete sting is the cue that belongs here and is unspent fal budget.

**Gated on the tick count, not on existence** — *"an existence assertion cannot verify a timing
claim"*, and the whole defect was a timing one. `completedTick - reachedTick === GOAL_ENTRY_TICKS`,
derived from the knob so a retune does not leave a stale literal the way 4.2's table did.

**Watched red with the shipped defect** *(C1)*: `events.goalReached = events.levelCompleted` gives
`PASS (2251) FAIL (4)` — both timing assertions, by name.

### ⚠️ `GameScene.ts` was at EXACTLY 400 lines with zero headroom

Adding the arrival branch put it at 421 and reddened the 400-line rule, correctly. It has **no active
`lines=N` citation**, so it was sitting on the limit exactly.

The dispatch moved to `runGoalFlow` in `gameComplete.ts` — whose own header already claims this flow —
rather than being trimmed back under by deleting comments, which the rule's own failure message
forbids. That is 4.16 and T16's recorded pressure arriving again, not something new: `GameScene.ts`
has been split six times and is full again.

Suite **2255 / 0**, build green.

---

## C8 / 2.8 — the gate run-in's foot-slide, closed by C2 without the ramp

**Status: FIXED — by item 2.3, and the upgrade path the comment named was not needed.**

`goal.ts` carried the repository's only `ponytail:` comment, accepting the slide and naming its own
upgrade path: *"a deceleration ramp over the last few ticks rather than a hard dead zone."*

**The dead zone is unchanged and the ramp was not built.** What changed is 2.3 — `resolveState` no
longer takes `dir !== 0`, so a stationary body reads `idle` whatever key is held. `player.ts`
predicted it exactly: *"fix that and both readings agree without this function knowing anything about
it."*

**Measured before deciding**, in the worst case the comment describes — spawning **on** the goal
centre so the dead zone holds for the entire 21-tick run-in:

| | before 2.3 | now |
|---|---|---|
| run-in ticks with **zero travel** | 13 of 21 | 13 of 21 |
| …of those, published as `run` | **all of them** | **0** |

The body still stands still; it simply no longer claims to be running while doing it — which was the
whole complaint. Gated in `goal-reached-edge.test.ts` so neither the dead zone nor
`movingHorizontally` can bring it back quietly.

The `ponytail:` comment is closed in place with the measurement, rather than deleted.

Suite **2256 / 0**.

---

## C1 / 2.1 + 2.2 — the courier's jump and fall: measured in full, and NOT re-shot

**Status: MEASURED, root-caused, and STOPPED for an owner decision. No fal spend made — and the
authorized ~$1.19 would very likely have been wasted.**

### The owner's 69% is confirmed, and the cause is not where it looked

Drawn figure height off the shipped sheets, in packed pixels:

| clip | frames | drawn height | of idle | frame spread |
|---|---|---|---|---|
| idle | 12 | **288.1** | 100% | 2 px |
| walk | 24 | 288.9 | 100% | 6 px |
| run | 15 | 275.7 | 96% | 18 px |
| **jump** | 6 | **199.7** | **69.3%** | 29 px |
| **fall** | 9 | 230.6 | 80.0% | **74 px** |

**It is not a packing error.** Both idle and jump come from the same *unpadded* anchor and pack at the
same slug scale `0.23723229`. The project's own tool gives the source heights:

```
idle  mean 1214 source px  (spread  0.8%)
jump  mean  842 source px  (spread 14.3%)
```

**The model drew the figure at 69% in the source video itself.**

### `_actionScale` is the obvious fix and it is the WRONG one — measured, not guessed

`HANDOFF.md:107` already says *"Jump has no `_actionScale` override and may need one"*; `fall` has one
(0.6) and jump does not. `build-assets.mjs … --derive-scale` duly prints **0.34204276**.

⚠️ **Pasting it would be a bug, for the reason `character-bounds.json` already documents at length**
— a mean across a deforming action is not a standing-height measurement, and doing it for `fall`
*"would have drawn the courier 25% LARGER in the air than on the ground, a pop the instant he leaves
the floor."*

The decisive check is a **pose-invariant** feature. A tuck bends legs; it does not resize a skull:

| clip | head width (packed px) | per frame |
|---|---|---|
| idle | **39.9** | 40, 39, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40 |
| jump | **125.8** | 66, 71, **166, 190, 189**, 73 |

Two findings in one measurement:

1. **The head is 1.65× too big** even in the frames where the top blob plausibly *is* the head
   (66–73 against 40). So the courier is drawn **larger and curled**, not smaller — the opposite of
   what the height alone suggests.
2. **In frames 2–4 the topmost part of the figure is not the head at all** (166–190 px wide). Something
   — an arm, a leg — is above it. That is the somersault tendency `motionAirborne.mjs` records
   fighting, showing up in the *shipped* clip rather than only in the rejected regenerations.

**So no packing scale can fix this.** Match the height and the head gets worse; match the head and the
body shrinks. The clip is off-model in proportion, and that is a generation defect.

### Why the re-shoot was NOT run

`motionAirborne.mjs` carries the history in detail, and it is a warning:

- a monotonicity clause was added → **the jump somersaulted**, frame 4 fully inverted, *"straight
  through five explicit negations"*;
- a *"motion has already begun"* clause was added → onset moved from frame 5 to frame **15**, later;
- both reverted, with the conclusion stated: ***"the non-monotonic middle is a real defect and is
  still open; the fix is NOT a stronger instruction in this paragraph."***

And the prompt's most likely culprit is a line that is there **on purpose**: `UPRIGHT_IN_AIR` requires
*"plain green above his head and plain green below his boots in every frame"* and *"no part of him is
ever cut off by any edge"* — which idle does not require, and which forces the model to fit the
figure inside two margins. Removing it re-opens cropped limbs; strengthening it is what backfired
twice.

⚠️ It also lives in the prompt template that `style-lock.test.ts` hashes, so changing it is an
**approval checkpoint**, not a tweak.

**Also relevant to the owner's instruction that the re-shot clips must use the same character as the
rest:** the IDENTITY clause in `jump.prompt.txt` is *already identical* to `idle.prompt.txt`'s —
same face, same goggles, same pauldron, same palette — and the clip still came back off-model in
proportion. So identity wording alone will not buy consistency here; that is the measurement's
warning about a naive re-shoot.

### What is owed

A decision, not more analysis:

1. **Re-shoot with a corrected framing clause** — needs a STYLE.md §4 change (approval), and carries
   the documented risk of a worse take.
2. **Re-extract from `jump-r2.mp4` / `fall-r2.mp4`**, which are **already on disk** — no new spend.
   Their extraction is what *"fails G6 on frames 0–4"*; the shipped sheets pass every gate today, so
   this trades a clean gate for possibly better art.
3. **Leave it**, with the measurement now on record.

⚠️ **`assets:build` was re-run during this investigation and is byte-identical** — `git status` clean
across `public/assets/`. That incidentally verifies 4.15's *"success is byte-identical PNGs"* claim,
which nothing had checked.

---

## C1 / 2.1 — RESOLVED. The first jump clip in this project's history to pass G6

**Status: FIXED.** Owner instruction: *"try 2, if it not fix do 1"* — option 2 was tried and refused;
option 1 took two takes. **Total spend: 2 generations (~$2.38).**

### Option 2 first, and it failed for a reason worth keeping

`CLIP_FILES` declared `jump: 'jump.mp4'` while **`jump-r2.mp4` sat on disk undeclared** — and the
paragraph directly above that table had predicted exactly this miss: *"once `jump-r2.mp4` lands
beside it, an undeclared `file` would make the glob ambiguous."* It landed and the line was never
switched, so every build since packed round 1 while the paid r2 went unused.

Switching it and re-extracting: **G6 refused it** — frame 0, top margin **0 px**.

⚠️ Running the same gate against round 1 shows **it fails G6 too** (frame 1, right 0 px). The
inventory's *"the sheet shipping today never passed G6 either"* is exact: today's jump is un-gated
art that predates the gate.

### The four takes, and why three read as random until they were tabled

| take | anchor / ratio | G6 margins L/R/T/B | cut |
|---|---|---|---|
| `jump.mp4` (shipped since Phase 4) | unpadded 9:16 | 64 / **0** / 24 / 336 | RIGHT |
| `jump-r2.mp4` | padded 1:1 | 252 / 204 / **0** / 58 | TOP |
| `jump-r3.mp4` | unpadded 9:16 **+ size clause** | 74 / **0** / 96 / 246 | RIGHT |
| **`jump-r4.mp4`** | **padded 1:1 + size clause** | — | **PASS** |

**A standing figure is narrow; a jump is wide.** 9:16 suits idle, walk and run and cut the jump at the
sides in *both* takes shot that way. r2 was the only take with real horizontal room and failed
vertically instead. **Neither change works alone** — which is why three takes looked like bad luck.

### The prompt fix, and why it is not "a stronger instruction"

`motionAirborne.mjs` warned in its own header that two earlier regenerations backfired (one
somersaulted *"straight through five explicit negations"*) and concluded *"the fix is NOT a stronger
instruction in this paragraph."*

The paragraph **asked for margins and never named a size** — *"plain green above his head and below
his boots"* is satisfiable at any scale, so the model oscillated between the only two ways to satisfy
it. The replacement **names the size by reference to the anchor**, which is the one move STYLE.md §6
says works on this model: **a named element beats a negation.**

⚠️ Verified **not** under `style-lock.test.ts`, which hashes STYLE.md §2/§4/§5 only — so this was not
an approval checkpoint, and that was checked rather than assumed.

### On the instruction that it use the same character as the rest

r4 is shot from **the same padded courier anchor `attack`, `death` and `fall` already use** — same
PNG, same sha256, same fill — and packs at the **same `scale: 0.6`** they do. Identity is pinned by
the shared anchor rather than by prompt wording, which matters: `jump.prompt.txt`'s IDENTITY clause
was *already byte-identical* to `idle.prompt.txt`'s while round 1 came back off-model, so wording
alone demonstrably does not buy it.

### The result, measured

| | round 1 (shipped) | **r4** | idle |
|---|---|---|---|
| drawn height | 199.7 px — **69.3 %** of idle | **238.8 px — 82.9 %** | 288.1 |
| G6 | FAIL (right edge) | **PASS** | PASS |
| anchor / scale | unpadded, 0.237 | padded, **0.6** | unpadded, 0.237 |

82.9 % sits beside `fall`'s 80.0 % — an airborne pose slightly shorter than a stand is the expected
sign, and it is the same consistency check `fall`'s own scale note uses.

### The scale, derived by the documented rule and NOT by the tool's number

`--derive-scale` printed **0.72361809**. ⚠️ **Pasting it would have been a bug**, for exactly the
reason `character-bounds.json` records for `death` (1.195) and `fall` (0.748): a mean across a
deforming action is not a standing-height measurement, and 0.7236 would have drawn the courier **21 %
larger in the air than on the ground**.

Jump has no upright frame at all, so `death`'s by-hand rule does not transfer either. The number comes
from the one standing measurement this anchor has — `attack`'s independently-derived 480 source px,
**288 / 480 = 0.6** — with the same consistency check `fall` uses: jump's tallest frame (440) is
**91.7 %** of 480, against fall's 96.3 %.

⚠️ **No automated gate covers this number**: `sprite-size-consistency.test.ts` deliberately does not
measure `brass-courier`, so it is verified **by eye in play and nowhere else**. Unchanged by this
work, and stated rather than glossed.

### Bookkeeping

`SUPERSEDED_CLIPS.jump` now lists all three predecessors (kept, never deleted — paid,
non-regenerable input). Suite **2256 / 0**, all 8 courier clips PASS, `verify-dist ok`.

⚠️ **2.2 (`fall` judders) is NOT closed.** `fall` already ran its r2 and packs at 80.0 %; its 74 px
frame-to-frame height spread is untouched by this work and remains open.

---

## 3.8 — the gear counter padded to a width the game cannot reach

**Status: FIXED.** `counterText` used `padStart(3, '0')` while `MAX_LEVEL_GEARS` is **64** — a third
digit is unreachable. `level-01` ships 7 gears and drew `007`, which
`docs/handoff/phase-06-owed.md` recorded as *"reads as a placeholder"*.

The width is now **derived from the cap**, not retyped as `2`: raise the cap past 99 and the counter
widens with it instead of silently truncating *(vault 5.3 — one number, one definition)*.

Three readings re-taken rather than edited to fit: two padding assertions and the clamp case, all
now derived from `MAX_LEVEL_GEARS` on both sides so the test and the counter cannot drift apart.

---
