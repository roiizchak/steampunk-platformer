[← HANDOFF.md index](../HANDOFF.md)

# Superseded — Phase 6 (collectibles, HUD, steampunk UI chrome)

**Branch:** `phase-06-hud`. **Written:** 2026-08-09 (Phase 5, session 1), amended each session since.
**§16 (2026-08-15) supersedes §15 and everything above it. Read §16 first.**
> ⚠️ **This document is stale from the first commit of any session that will rewrite it.**
> Two Codex blockers and one QA brief in session 7 were caused by reading it mid-flight.
> If you are reviewing during a session, ask which sections are known stale.

🔴 **§14 and §15 below say "Phase 5 is FAILING". That was true when they were written and is not
true now** — Phase 5 closed on 2026-08-15 and merged at `c38c76b`. **This header was itself the
example**: it carried "Phase 5 is NOT complete" for eleven days past the merge, while
[PRD.md](../PRD.md) marked the phase done, and the Phase 6 plan review had to be told which documents
to disbelieve. Sections are superseded, never edited in place; the header is the one place that
tracks the truth, so it is the one place to look first.

Read this first, then [PRD.md](../PRD.md), then
[prd/phase-06-hud.md](../prd/phase-06-hud.md) §6 (the gate), then
[qa/phase-05-combat.md](../qa/phase-05-combat.md) (what has already been decided and measured — **read
it before re-measuring anything**).

## 16. Phase 6, session 1 — 2026-08-15. **This section supersedes §15 and everything above it.**

> 🔴 **RESUMING PHASE 6? READ [handoff/phase-06-owed.md](../handoff/phase-06-owed.md) FIRST.**
> It is the complete list of what is left, with two options and a recommendation on each, and it is
> the document the next session was written for. **Phase 6 is NOT done** — criterion 6.9's
> frame-budget half is unrun — and the branch `phase-06-hud` is not merged.

**Phase 5 is done.** Closed 2026-08-15, merged at `c38c76b`, and `b8546a8` then took the over-400-line
file count from seven to one. **`src/scenes/GameScene.ts` at 459 lines is now the only file over the
ceiling, and `tests/unit/file-size.test.ts` allows exactly one** — so any new Phase 6 file that
crosses 400 is a hard red, and `tilemap.ts` (374), `GymScene.ts` (399) and `build-assets.mjs` (398)
are all close enough that an ordinary edit tips them.

**Phase 6 opened on `phase-06-hud`.** Baseline before the first change: typecheck clean · 1146 unit
tests pass · `npm run build` + `verify-dist` ok.

### Four things the code does not tell you, found while planning this phase

- 🔴 **The player's health bar already has the vault 6.4 defect.** `healthBarFillWidth(99, 100, 156)`
  returns **154 of 156 px** — a visually full bar at 99 % health, which is vault 6.4's "315 of 318 px"
  case on the bar that matters most. It shipped in Phase 5 and no gate looks at it.
- 🔴 **The canvas is centred twice.** [index.html](../../index.html) gives `#game` a flex centre while
  `config.ts:30` sets `autoCenter: CENTER_BOTH`, which writes CSS margins. Vault 6.6/6.7 exactly, and
  it is what criterion 6.7 exists to catch.
- 🔴 **`GameScene.update()` throws away events.** The split batch at `GameScene.ts:253-262` keeps only
  the last tick's events and discards those from `advance(world, input, ticks - 1)`. **This is a
  Phase 5 defect, not a Phase 6 one** — any edge landing in a dropped tick is silently lost — and no
  Phase 5 gate found it. Codex's plan review did (finding F8).
- **The HUD is not missing.** `assets/hud/health-assembly.png` ships, is catalogued as `hud-health`,
  and was generated on the **current** model, not a retired one. The phase doc's "drawn by a model we
  no longer use" is about the HUD *inside the anchor scene image*. The user chose to re-shoot anyway
  with that stated; the cost is a hand re-measure of `HUD_SLOT`, which no gate can catch.

### Decisions taken before any code

Recorded here because none of them is derivable from the diff: minimum supported resolution is
**both** 1280×720 and 852×480 · gears come from a **Tiled object layer**, like hazards and enemies ·
up to **10 fal generations** authorised · **every pixel, screenshot and timing number in this phase
comes from the `chromium-gpu` Playwright project**, headed and on a real GPU — the headless project
is for logic regression only, because SwiftShader inflates milliseconds ~21× and is not the
rasteriser a player sees.

---

## 14. Session 8 — 2026-08-13. **This section supersedes §13 and everything above it.**

**Phase 5 is still FAILING, and it is much closer than it was.** Every defect the session opened
with is closed. What is left is two criteria that do not measure what they claim, and one that needs
your eyes.

HEAD `b988e66` on `phase-05-combat`. **275 suites / 900 tests / 0 failed · 64 test files · e2e 47
passed · sim-isolated 900 with Phaser uninstalled · typecheck clean · verify-dist ok · port 5173
clear · $41.36 of $55, no spend this session.**

### What closed

| | was | now |
|---|---|---|
| **P1** dead enemies kept acting | shipped defect | guard at the **call site** in `stepEnemies`, so `stepProjectiles` stays outside it and shots in flight keep travelling. `0466b9a` |
| **P3** hitstun was cosmetic | no lock at all | locks horizontal **and** the jump **and** the jump-cut. Five ticks, not six — the asymmetry is derived in the docstring. `7a63f13`, `8bfeee5`, `ea0c6e4` |
| **S1/S2** the chase | 200 px teleports, floating scavengers | `deadZone` 96 as a **per-entity field** (a module constant cannot satisfy 5.9's sweep), clamp on both paths. `dca73f1` |
| **Knockback** | scoped in Phase 5 §1, **never built** | shipped at step 9b. Grounded **7.39 px**, airborne **25.59 px**. `5765227`, `626f8b3` |
| **Grey-box enemy** | a chasing scavenger was a permanent `Rectangle` | `fallbackAnimKey`. The 5.11 spec reads **20/20** where it read 12/20. `626f8b3` |
| **5.12** | 8 files over 400 | **0 over 400.** `49a7d30`, `4eb08f3`, `ea0c6e4` |
| **P4** the frame budget | "the parallax is 64% of it" | **a software-rasteriser artifact.** See below. `f370a48` |

### 🔴 P4 was never a defect on real hardware, and every number before this session was wrong about it

Real Chrome, **RTX 4080** (D3D11/ANGLE, confirmed in-page off `WEBGL_debug_renderer_info`, not
assumed), same sampling method, **reproduced identically three times**:

| | headless (SwiftShader) | real GPU |
|---|---:|---:|
| median frame | 90.10 ms | **4.2 ms** |
| sustained | ~11 fps | **240 fps**, vsync-locked |
| poses painted per cycle | 4–6 of 12 | **12, 12, 10, 12, 12, 12** |

Every P4 number that existed before — 5.11's 12–18 fps, the 70.30/25.50 A/B, "64 % of the frame
budget", the 5-of-12 drop — came from headless Chromium with no `launchOptions`. **The harness was
measuring itself.**

**A parallax retile was built on the strength of those numbers and then reverted.** Its own
interleaved A/B refuted the texture-size hypothesis (ratio **2.42** against 2.76 before), and a
playtest showed the crop put a **duplicated gauge panel in every single frame** — because the
cropped texture was exactly the view width, so the mirror pair is permanently on screen. `ca84554`.
The reasoning is written into `build-world.mjs` **at the point of temptation**, because the 21.4 MB
payload will tempt someone to try it again.

⚠️ **Your original dropped-frames report is still unexplained.** It was a real browser. Either this
session's fixes changed it or it was something else. **It needs your hands, not another probe.**

### The gate — honest per-criterion status at `b988e66`

| # | status | note |
|---|---|---|
| 5.1 5.3 5.4c 5.4d 5.5 5.6 5.9 5.15 | **PASS** | owner-verified, this session, evidence in `docs/qa/phase-05-combat.md` |
| 5.2 5.7 5.10 5.12 5.16 | **PASS**, named caveats | 5.16 ran for the first time and passed |
| 5.4 | **PASS** | scavenger walk, **11 distinct poses**, sampled per-rAF at paint time on real hardware |
| 5.13 5.14 | **PASS** | both Codex reviews ran; **all 4 implementation findings confirmed and dispositioned** |
| **5.8** | 🔴 **UNRESOLVED — needs you** | the health bar renders as a **small red sliver** at true sprite size. "Legible" is a human judgement *(C4)* and no agent may assert it. Screenshot is in the QA log's playtest section. |
| **5.11** | 🔴 **FAILING as a measurement** | the number is real; it is not measuring what the criterion says |

### Why 5.11 fails, and do not "fix" it by changing the tolerance

Three independent problems, all recorded with evidence:

1. **The gated spec has never once run on anything but a software rasteriser.** The 4.2 ms figure
   came from a separate manual probe, not from the test that gates the criterion.
2. **The "worst-case" fleet spawns entirely outside the viewport.** `DEV_FLEET_OFFSET_X` 200 sim
   units × `RENDER_SCALE` 6 = **1200 screen px**; the visible half-width is **960 px**. **0 of 20**
   on screen; exactly **8 of 20** inside `detectRadius`. That 8 is the same geometry that produced
   the 12 grey Rectangles — two unrelated findings confirming each other.
3. **`medianMs < 100` was never a budget.** No baseline exists (S4, PRD §7). Quiet-machine
   re-measure: **82.4 / 82.5 / 82.9 ms**, spread 0.5 ms, matching session 7's 82.10 — so the
   95–97 ms the owner saw was machine load, **not** a regression. One run's `maxMs` hit **99.80**.

**Cross-session comparison of absolute ms from this harness is not evidence in either direction.**
Four times this session those numbers moved with background load. The one A/B that decided anything
was run **interleaved**, A,B,A,B,A,B, in a single session.

### Do this next, in this order

1. **Play it.** 5.8 is yours, and your dropped-frames report needs confirming or retiring. While
   you are in there: the player **wedges against terrain at `x: 3198`** with a scavenger in contact
   and drains **100 → 35 hp** with no way past. Not diagnosed, not a Phase 5 criterion, and it did
   not read as a fight.
2. **Redesign 5.11** — it needs a decision from you, not a patch. Options in the QA log under P1–P4.
3. **The cheapest real improvements**, in order: `withinRadius`'s vertical term is untested
   (**T6** — every sentry fixture is `y:0`/`playerY:0`, so deleting `dy*dy` reds nothing); nothing
   swings an attack to an actual kill (**T2** — *the gap that let P1 ship past the whole gate*); the
   six extracted `GameScene` modules have no tests (**T13**).
4. **`verify-dist`'s four identifier greps cannot go red** under minification (**T8**). Codex's fix
   is better than more greps: a Vite `generateBundle` assertion that DEV-only modules contribute
   **zero rendered bytes**.

### Things you will not work out from the code

- **`window.__game` has EIGHT top-level fields, not nine.** CLAUDE.md, PRD.md, `GameScene.ts:150`
  and several of this session's own commit messages all say nine. Caught by Codex. The surface is
  closed either way and nothing leaked into it — **the count is wrong, the invariant is not.** Both
  files are outside this session's scope lock, so it is recorded and not edited.
- **`file-size.test.ts` asserts `over.length <= 10`, not `0`** — with 0 over it now has ten free
  slots and cannot go red. **You declined tightening it** (2026-08-13); it is recorded as **T7**.
  `GymScene.ts` sits at **399**.
- **Two agents destroyed uncommitted work with `git stash` in session 7.** Every brief since carries
  an explicit ban, and nothing was lost this session. Keep the ban.
- **The QA log's 5.12 record has now been wrong three times** — twice stale, and once, in this
  session, **false when written**: I ran the sweep, then fixed a file that grew `tick.ts` by 21
  lines, then wrote the sweep's result down. **A measurement written down after later edits is not a
  measurement of the tree it claims to describe.**
- **Hand your reviewers your own conclusions, not just the diff.** The prompt for Codex review 8
  listed the gate's known findings and asked it to say if any were wrong. **Both corrections came
  from that section**, including the blocker.

---

## 15. Sessions 9 and 10 — 2026-08-13/14. **This section supersedes §14 and everything above it.**

**Written 2026-08-14.** Session 9's eight commits were recorded in **no** handoff section at all —
this file stopped at §14 while the branch moved on — and two of session 10's own numbers were wrong
*because of that gap*. Both sessions are here.

**Phase 5 is FAILING and must be reported failing.** Most of the QA gate is unrun; it last ran at
`b988e66`, and thirteen commits have landed since.

### Session 9 — the ghost, chased through three wrong causes

The user reported the character *"moves too fast, like a ghost"* and *"two overlapping copies"*.
Three separate defects were found under that one report, and the first two fixes did not resolve it:

| commit | what |
|---|---|
| `74cdfb0` | DEV-only playable feel variants, to stop guessing |
| `dc76df2` | **A loop has no window to outrun** — locomotion cadence became AUTHORED (`character-bounds.json` → `animations.<name>.fps`), replacing a stride measurement with a ±20 % spread |
| `ce6a56f` | DEV-only live locomotion tuner: `[`/`]` cadence, `-`/`=` speed, SLIP on the overlay |
| `36ad73e` | **`cadenceTicks` rounds TICKS PER FRAME, not the cycle** — an unevenly-held frame is judder. Of the values a ±1 fps step reaches around 31, only 30 divides evenly; that is why the user reported the first tuner as making no difference in either direction |
| `7ccc4ad` | a falsifier for the ghost report, built BEFORE the fix |
| `01f2ae7` | **render interpolation** — the sim runs at 60 Hz on a 240 Hz display, so three frames in four were identical and the fourth jumped |

**Confirmed in real play at 240 Hz: the ghost is gone and the character does NOT feel less
responsive.** Interpolation costs up to one tick (16.7 ms) of visual latency by design and the trade
is accepted.

⚠️ **The lesson session 10 paid for: `01f2ae7` gave interpolation to the PLAYER only.** See below.

### Session 10 — five commits, and three things nobody had measured

| commit | what |
|---|---|
| `fd18032` | The sentry can fire and die. Both clips were bought in **session 6** and never packed — nothing in `src/` needed changing |
| `40a35a1` | The character slows to the speed its own feet describe |
| `336bf9b` | Three playtest bugs: speed, the shrinking turret, an invisible shove |
| `7ec5308` | The scavenger keeps coming, and its feet finally land |
| `83b0c1e` | The enemies never got session 9's ghost fix, only the player |
| `79ed371` | The spike strip was never jumpable, and `x:3198` was never a bug |

#### 🔴 The foot-plant invariant, and why session 9's fix was incomplete

Session 9 tuned foot-slide **by eye**. By eye is not the same as gone. Measured against the art's own
foot travel, the shipped tune was never planted:

```
         art foot travel   ticks/frame   speed   body px/frame   slide
  run    22.5 px           2             12.0    24.0            +6.7 %
  walk    9.0 px           2              5.54   11.08           +23 %   ← worse than the reported defect
```

Nothing was watching, because nothing had ever compared the sim's speed to the art's measured foot
travel — the two halves lived in different files, one of them a DEV-only scene.
`tests/unit/foot-plant.test.ts` is that comparison now, as an **exact** equality.

**The invariant collapses speed to a quotient.** `ticksPerFrame × topSpeed === footPxPerFrame` with a
whole `ticksPerFrame` means speed is `footPxPerFrame / n` and **nothing between**. Consequences that
will recur:

- `run` had to be **resampled 12 → 15 frames** to reach 9.0, because 12 frames offered only 11.25 and
  7.5. Cost: ~13 distinct poses per cycle, so 15 repeats some.
- The scavenger's decided `chaseSpeed` of "3/4 of run" (**6.75**) **does not exist**. 6.0 was taken.

**A design decision that names a speed must be checked against the sheet before it is agreed to.**

#### 🔴 Two defects that look identical, and the diagnostic was in the user's phrasing

*"The scavenger's animation is not smooth"* had **two** independent causes: foot-slide, and
tick-stepping. Re-timing the sheet fixed the first and the complaint survived. `enemyLayer.sync`
still wrote `body.setPosition(desc.x, desc.y)` — the raw tick position — because `01f2ae7` wired
interpolation into `GameScene.renderPlayer` **and nowhere else**.

The defect had become *more* visible for having been fixed on the character standing next to it. The
user's words named the comparison exactly: *"not smooth **like my character**"*.

**`interpolate.ts` was correct, engine-free and thoroughly unit-tested. Nothing asked who called
it.** That is vault 5.3 one step out — one definition with an incomplete set of consumers. And no
unit test could see it: **deleting `GameScene`'s snapshot call leaves every unit test green**, which
is why the enemy interpolation carries a unit gate *and* an e2e one.

#### 🔴 The spike strip was impassable, and `x:3198` is not a bug

`tests/unit/level-traversal.test.ts` runs the real `tick` over the real shipped `.tmj`. It found:

- **The spike strip at 384 px could not be jumped at any speed**, and had not been since Phase 4's
  rescale — four sessions, two of them playtested. The only reach gate in the suite was **vertical**.
  Narrowed to **192 px**, in `make-greybox-level.mjs` (the hazard rect is derived from the `SPIKES`
  array; hand-editing the `.tmj` desynchronises art from collision and `level-entities.test.ts`
  catches it immediately).
- **`x: 3198` is the player's box against the pillar at 3264** — `3198 + 66 = 3264` exactly. The
  "wedge bug" recorded 2026-08-12 and carried as an open unknown through two sessions is a collider
  working correctly on a solid the player is meant to jump.
- **The permanent-aggro blocker is settled by terrain.** The level scavenger stands on the floor
  beginning at 4128; the pit at 3840–4128 stops the chase over 400 px from the player. Red-proved:
  remove the ground veto and it closes to **92 px**.

#### 🔴 Knockback was firing correctly and was invisible

`KNOCKBACK_SPEED` was aliased to `walkMax` — **one tick of walking** — producing **9.7 px** of travel
against a 132 px body. What a player sees is a hurt pose, six ticks of movement lock, and no
movement: *"the knockback is not working… the animation got stuck"*. Both halves of that report are
the same defect. Now **17.5 px/tick = 64 px of travel**, tuned in the unit that matters (px of
**travel**, not px per tick) and asserted by summing the real decelerating series.

#### What the money did and did not buy

**$43.74 of the $55 ceiling. $2.38 spent this session, both clips REFUTED the hypothesis they tested.**

- The sentry's `fire` and `death` clips were bought in session 6 and sat unpacked. Adopting them cost
  **$0** and gave the turret a firing pose and a K.O.
- **Anchor padding scales a subject; it cannot scale an effect.** Two paid single-variable re-shoots
  established it. A muzzle flash and a debris plume exist *to leave the frame*. Both clips accepted
  under a written G6 exception naming the file and the edges (`tools/gen/edgeExceptions.mjs`).
- **Criterion 5.4e closed for $0.** Two `request_id`s recorded as permanently unrecoverable were both
  in `~/.genmedia/gallery/sessions/<id>/data.json`, with the download path. Check the tool's own
  records before declaring provenance lost.

### Traps this pair of sessions leaves behind

- **`brass-courier/death` still cannot pack** — it needs a 332 px cell against the courier's 288.
  STOP-and-ask, undecided.
- **`docs/GENERATION-LOG.md`'s "66 generations · $31.39" is an INVOICE reading from 2026-08-09**, not
  a running total. It was being quoted as current five days later. The live figure is the Phase 5
  total; everything after that date is quoted, not invoiced, and the two must not be summed.
- **The `window.__game` surface has EIGHT fields, not nine.** Three documents and three code comments
  said nine; nobody had counted. `src/debug/globals.ts` is the authority.
- **`enemyView.ts:66` returns `chasing ? 'chase' : 'walk'`**, and aggro is permanent — so after first
  sighting the scavenger's `walk` sheet is never drawn in play again. A consequence, not a defect.
- **Two gates that could not go red were found by mutation, not by reading.** `withinRadius`'s `dy`
  term (every fixture placed enemy and player at the same `y`) and `healthBarFillWidth`'s low-end
  compression (at the real 144 px slot the naive floor behaves almost identically). Both now fail
  under mutation; before, neither did.
- **A test harness that can produce a contradiction is worth more than one that quietly produces a
  plausible wrong answer.** `level-traversal.test.ts`'s first draft never jumped in any test — the
  tell was a run-up that failed while a standing hop succeeded, in the same run.

### Session 10, second half — the dwell fix, the 5.11 rebuild, and the gate

Five more commits after the four recorded above.

| commit | what |
|---|---|
| `d0fac00` | **Four one-shots juddered because a "permanent" exception was wrong.** `loop-dwell.test.ts` gated loops only and carried a `KNOWN_UNEVEN_ONE_SHOTS` list calling two of them unfixable. The reason given was half right — a one-shot's `simTicks` IS a sim window and rounding it would be a balance change — and half false: a one-shot's **frame count is declared**, in `VIDEO_MOTIONS[key].frames`, and `build-clips.mjs` samples exactly that many. Widening the gate found **five**, not two. Four re-extracted and repacked at $0. |
| `21c56ff` | **Criterion 5.11 was measuring a frame that drew none of its enemies.** `DEV_FLEET_OFFSET_X` 200 sim px against a 160 sim px visible half-width: 0 of 20 on screen. Rebuilt on a real GPU with the fleet in view, both enemy kinds, and bolts in flight. |
| `64ac651` | **The gate's adversarial briefs found three shipped defects** — see below. |

#### The three defects the second briefs found, and the first briefs did not

Vault **A7** paid for itself again, harder than usual. Brief 1 returned *no failures* for
`qa-expert` and *PASS with defects* for `code-reviewer`. Brief 2 of each found these:

- **`MAX_LEAP_PX` was smaller than the simulation's own vertical maximum.** The teleport guard was
  the literal `48` while `maxFallSpeed` is **51.6** and `jumpVelocity` **48.6** — so the takeoff
  tick of every jump and every tick at terminal velocity were drawn **unblended**. 51 of 120 ticks
  over a jump plus a run off a ledge. Session 9's ghosting fix was only ever horizontal.
  Its docstring said *"vertical travel is capped by terminal velocity, which is smaller"*, and its
  test restated a stale literal `12` instead of importing the tuning — which is exactly how the
  constant survived two speed changes.
- **The respawn handed out a free mid-air jump.** A corpse stays `grounded` for the whole death
  window, so step 10 re-armed the coyote window on all 45 ticks. Jump held while dead launched the
  courier **216 px above the spawn**. `respawnPlayer`'s own docstring claimed it could not.
- **`advance()` dropped four of its seven events.** Named assignments for three fields while
  `TickEvents` had grown to seven, so `GameScene` read `events.respawned` as **always false** and
  the interpolation guard added earlier the same session could never fire.

**All three are the same shape: a comment that named the behaviour, and code or a test that checked
something adjacent to it.** That is the failure mode this project is most exposed to, because its
comments carry so much of its knowledge.

#### 🔴 Things that are open and need YOUR decision — none of them are bugs to go and fix

| | what | why it is yours |
|---|---|---|
| **`brass-courier/fall`** | Needs **9** frames to stop juddering. Re-extracting at any count fails G6 on frames 0-4, and frame 0 is the same source frame at 6, 8 or 9 — **so the sheet shipping today never passed G6 either.** The courier is not cropped; what fails is green that does not key out on the fastest frames. Regenerating the rejected strip rebuilds `fall.png` **byte for byte**, which is how the write-then-gate path was confirmed. | Three unblocks: a keying tolerance, an `ACCEPTED_EDGE_BLEED` entry with a stateable reason, or a re-shoot. Tolerance and money are both STOP-and-ask. `jump` is the same batch and already known-bad. |
| **A 47.9 MB screen recording is still tracked in git** | `.gitignore` gained `Recording*.mp4` but that does nothing to an already-tracked file. Merging puts 48 MB into `main`'s history permanently. Needs `git rm --cached` before the merge. | It is your file, and deleting a file is a STOP-and-ask. |
| **A stationary chasing scavenger still runs its chase cycle** | Inside the dead zone or vetoed by the ledge probe it does not move, but `scavengerAnim` returns `chase` from the flag. Foot-plant violated by 18 px a frame. Permanent aggro means this never ends. | The fix needs a stationary pose the scavenger does not have — `rust-scavenger/idle` was descoped as art with no sim state. Buying it, or deriving the animation from real travel, is a design call. |
| **Aggro survives your death** | Nothing clears `chasing` on respawn, so scavengers walk to the new spawn and never patrol again. Invisible today because `level-01` has one. | Whether death releases aggro is a **balance** decision, and permanent aggro is what you asked for. |
| **The sentry re-derives `facing` every tick** | No dead zone, so a player oscillating around its `x` strobes `flipX` at 60 Hz. Its docstring claims the scavenger's rule; the code does not implement it. | Deferred rather than fixed blind — it is a visual claim nobody has observed, and no gate can see it. Next session's first candidate. |

#### The gate hole worth closing first next session

**G5 — the contact-frame gate — runs only from a CLI, by hand.** `reachGate.mjs` is unit-tested
against synthetic fixtures and **never against the shipped `attack.png`**. So repacking that sheet
this session invalidated 5.4c's recorded evidence and **nothing went red**; the criterion kept
reading PASS against a sheet that no longer existed. (Re-run by hand: it passes. The number was
fine; the mechanism was not.)

That is the shape vault 3.1 exists for — *the unit suite runs the real validator over the shipped
bytes* — and the art gates are the one place this project does not do it.

#### Smaller things worth knowing

- **A one-shot's frame count is load-bearing, not a taste setting.** It must divide its sim window.
  `tests/unit/one-shot-divisor.test.ts` gates the declared count; `loop-dwell.test.ts` gates the
  shipped catalog; `tests/unit/blockedDwell.ts` holds the one exception from **one** definition so
  both gates skip the same row and neither can widen quietly.
- **`assets:clips` and `assets:build` can disagree.** The first reads the motion spec; the second
  packs whatever strip is on disk and never reads the spec. `fall` had declared 6 while shipping 8.
- **`build-clips.mjs` writes the strip and gates it afterwards**, so a G6 failure leaves a complete,
  usable strip that `assets:build` will pack without complaint.
- **The 5.11 sampler is bounded in TICKS, not frames**, because every sentry volleys on the same
  tick and then waits 90. At 240 Hz a 120-frame window was a third of one cooldown, so the burst
  the gate exists to catch could fall outside it entirely.
- **`long-animation-frame` cannot gate a frame budget here.** It only emits above 50 ms; the game
  runs at 4.16 ms. Both halves reported zero, and `0 / 0` is a gate that cannot fail.
- **`file-size.test.ts`'s path check was dead for every test file.** Vite resolves glob keys against
  `tests/unit/`, so anything under `tests/` came back as `../e2e/…` — a form no QA log could
  contain — leaving only the basename fallback. A 648-line file counted as "recorded" because its
  name appeared in an unrelated citation.
- **The e2e suite now has two Playwright projects.** `chromium` for everything, and `chromium-gpu`
  — headed, real GPU — for `phase-05-perf.spec.ts` only. It opens a window when it runs.

---

## 17. Phase 6, session 2 — 2026-08-16. **This section supersedes §16.**

> ✅ **Phase 6 is DONE and marked ✅ in [PRD.md](../PRD.md).** Criterion 6.9's frame budget — the
> blocker — is measured. The ten-item owed list is resolved. The A7 shortfall is closed: all three
> missing brief 2s ran, and eight gate-owner runs happened in total. Codex's implementation review
> ran a second time.
>
> **Not merged.** Stopped for approval, per the phase workflow.

**State, all re-run after the last edit:** typecheck clean · **1224 unit tests pass** · **1224 pass
with Phaser uninstalled** · `npm run build` + `verify-dist` ok · **48/48 headless e2e** · **23/23 on
`chromium-gpu`, 1 skipped** · port 5173 clear · Phaser 4.2.1 restored.

**The measurement that closed the phase.** The HUD costs **~0.1 ms of main thread and ~0.003 ms of
GPU per frame** — 0.6 % and 0.02 % of a 16.67 ms frame — measured as three interleaved
HUD-on/HUD-off pairs on a real GPU, in a damaged state so the bar actually draws. Full table,
bounds and red runs in [qa/phase-06-hud.md §Session 2](../qa/phase-06-hud.md).

### The three things worth knowing before the next session

1. **The recorded "false green the suite cannot catch" does not exist.** Vitest fails both shapes —
   an unimportable test file and a file with zero tests — and exits non-zero. What happened in
   session 1 was a misread: the `Tests N passed` line stays green and merely *drops*, while the
   redness is on the `Test Files` line and in the exit code. No gate was built; building one would
   have been decoration.
2. **HUD lifetime by scene-event ordering is a trap.** Three implementations: a `GameScene` SHUTDOWN
   handler (deleted the HUD on restart — both code-reviewer briefs traced it from Phaser's sources
   before any test caught it), `attachHud` stop-then-launch (broke the dev-toggle teardown), and
   finally `UIScene.update()` retiring itself when `GameScene`'s status `>= SLEEPING`. Only the
   condition is order-independent. **PAUSED still renders and must be kept** — criterion 6.4's spec
   pauses `Game` deliberately.
3. **A real defect was found and fixed in the boot path.** A refusal that follows a *successful*
   boot left the HUD frozen over the error screen, with the render loop throwing
   `TypeError: … reading 'glTexture'`. The stop was in the right place but ran too late: on a restart
   the play scenes render on through the reload that frees their textures, and the crash kills the
   loop before `refuseToRoute` can stop anything. **Fixed by stopping `Game` and `UI` in
   `BootScene.init()`** — a no-op on a fresh boot. Found only by writing the test Codex said was
   missing; the old one used a fresh page where the HUD was never running, so it could not go red for
   the line it named.

### Carried forward

- ~~**Phase 7:** the three `hudObjects()` call sites that bypass `waitForHud`.~~ **Closed in Phase 7
  — there were four, not three:** `phase-06-hud.spec.ts:139` and `phase-06-health.spec.ts:101`,
  `:211`, `:268`. All four now call `waitForHud` before reaching `hudObjects()`.
- **Phase 8:** the gear-burial check misses a gear on the **seam between two floor rects** — a 96 px
  grid makes that the default authoring outcome, and Phase 8 is the phase that authors multi-rect
  floors. Also re-measure counter contrast against any new palette: the fill alone is 3.13:1 on
  mid-grey and 1.13:1 on bright sky.
- **Phase 9:** ~~`addHelpBanner`'s literal `18px`~~ (**both banner items CLOSED 2026-08-28** by
  session `hud-and-pits` — the font is 43 px scaled and the banner lives in its own type-only layer,
  `src/scenes/helpBannerLayer.ts`; `addHelpBanner` no longer exists and the `setScrollFactor(0)` is
  now reconciled against the owning camera rather than removed); DPR ≠ 1 centring; the collect-tween
  polish.
- **Phase 4 debt:** only **4.2b** (owner decision — an ordering violation no work can undo) and
  **4.27** remain. 4.10/4.12 were already closed; **4.16 closed this session**. The PRD row was
  stale and is corrected.

