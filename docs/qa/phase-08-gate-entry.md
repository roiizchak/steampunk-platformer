# QA log — the gate-art + gate-entry session

← [QA-LOG.md](../QA-LOG.md) · plan review:
[reviews/session-gate-art-and-entry-plan.md](../reviews/session-gate-art-and-entry-plan.md) ·
impl review: [reviews/session-gate-art-and-entry-impl.md](../reviews/session-gate-art-and-entry-impl.md)

**Branch `session-gate-art-and-entry`, off `main` at `3affbf8`. Opened 2026-08-19.**

A scoped follow-up on Phase 8's exit, not Phase 9. Two deliverables: the generated gate art
that replaces `goalLayer.ts`'s grey box, and a scripted run-in that replaces "touched the
gate" with "entered the gate".

---

## Baseline, taken before the first change

| | |
|---|---|
| `npm run typecheck` | clean |
| `npm test` | **112 files · 1882 tests · 0 failed** |
| HEAD | `3affbf8` |

Recorded because a later count only means something against a recorded one — the trap
[QA-LOG.md](../QA-LOG.md) records from session 8, where a sweep was written down *after* the
edits it claimed to describe.

---

## The measurements this session is built on

Read off the repository, not off prose *(the CLAUDE.md rule: `src/game/constants.ts` is the
authority)*.

| Fact | Value | Source |
|---|---|---|
| Goal rect, levels 01–04 | `192 × 288` at `y 1632` | the shipped `.tmj` files |
| Goal rect, level 05 | `192 × 288` at `y 1728` | `level-05.tmj` |
| Floor top under every goal | `goal.y + goal.h` **exactly** | solids at 1920 ×4, 2016 |
| Player box | `132 × 288` world px | `PLAYER_BOX` 22×48 × `RENDER_SCALE` 6 |
| `runMax` | **9.0 px/tick** | `FOOT_PX_PER_FRAME.run` 18.0 / `LOCOMOTION_TICKS_PER_FRAME` 2 |
| `walkMax` | 4.5 px/tick | same |

### 🔴 The consequence that shaped the whole design

**The player box is exactly as tall as the goal rect, and the goal sits flush on the floor.**
So full containment is satisfiable — `top === goal.y` and `bottom === goal.y + goal.h` — but
**only while the player stands on that floor**. One pixel airborne is not contained.

Horizontally there is 60 px of slack, 30 each side. Entering from the left, first overlap is
at `player.x > goal.x − 66` and containment at `player.x ≥ goal.x + 66`: **132 px of travel,
≈ 15 ticks at `runMax`**. The gate centre is 162 px, ≈ 18 ticks. `GOAL_ENTRY_TICKS = 20` is
chosen so the **tick count**, not the geometry, is what binds completion — which is what makes
"assert which tick" a deterministic test rather than a race.

Codex's plan review confirmed independently that grounded play reaches that exact equality
reliably: `resolveCollisions` snaps `player.y` to `solid.y`, and the game has no slopes and no
moving platforms.

---

## Findings

### Codex plan review — 12 findings, 10 applied, 2 recorded

Full report and triage table in
[reviews/session-gate-art-and-entry-plan.md](../reviews/session-gate-art-and-entry-plan.md).
**Three were blockers**, and all three were re-verified locally before being acted on:

- **C1** — a player killed during the run-in respawned with the counter still armed and input
  still locked, auto-running from spawn and unable to jump. **The level becomes unwinnable.**
  Level 1 has a scavenger patrol ending 96 px from its exit; level 5 a sentry 384 px from its
  own. Fixed by a cancel in `stepGoalEntry`.
- **C2** — the planned attack lock passed a spread clone to `stepCombat`, so
  `consumeAttackPress` cleared the *clone* and left the real snapshot's edge latched forever.
  Vault 2.4 exactly. Fixed by consuming off the real snapshot.
- **C3** — the planned unit fixture could never have reached the gate: `createWorld` defaults
  `bounds` to the 1920×1080 grey-box extent and step 9 clamps a player at `x 8640` back inside
  it. The test would have failed for a reason unrelated to the feature.

Two findings the plan's own red proofs depended on were also wrong and are worth repeating
here, because both are the shape this project keeps paying for:

- **C5** — the mutation for Task 2's red proof grepped `"height":288`. The shipped `.tmj`
  writes `"height": 288`, **with a space**. Verified locally: `grep -c` returns **0** for the
  planned pattern and **6** for the real one. The mutation would have changed zero bytes and
  the "watched it go red" claim would have been a lie. *(C12 — this is exactly why "content
  changed AND the original count dropped by one" is the rule, and not "the count is now zero".)*
- **C6** — the shipped-art gate sampled 64×96 px, **11 % of the image**. An opaque dark slab
  with no doorway around it passed every machine gate. Widened, and a `play`-owned by-eye
  criterion (G.1b) added, because STYLE.md §5 already says the material rule is a local edge
  cue no whole-region metric can see.

### Gate-owner agents

Three owners x two briefs (A7): `qa-expert`, `code-reviewer`, `performance-engineer`. Brief 1 is
the checklist; brief 2 asks only *"how could this be wrong in a way a checklist would not see?"*,
and brief 1's findings are withheld from it.

#### 🔴 The first dispatch corrupted the working tree, and a commit captured it

All six ran concurrently **in the primary working tree**, while mutation verification for the red
proofs below was running in that same tree. Their briefs banned modifying files. At least one did
it anyway, and did not restore what it changed.

Two lines were left mutated and **commit `57006a0` committed them as if they were the
implementation**:

| File | What was left behind |
|---|---|
| `src/render/playerView.ts` | `goalEntryAlpha` returned `1` — the fade deleted |
| `src/sim/goal.ts` | completion dropped `&& containedInGoal(world)` — the session's whole point |

They were invisible because they are **the same two mutations this session's own red proofs use**,
so they read as work in progress rather than as damage. `57006a0` also committed a test RED,
because the commit was chained after the test run with `&&` and ran regardless of the result.

Repaired in `6a28761`: both files restored from `551d29d` and verified with an empty
`git diff 551d29d -- <file>`, then typecheck clean and 1935 tests green. Three rules came out of it,
and they are the reason the re-run below is shaped the way it is:

1. **Never run mutation verification in a tree background agents can write to.** A ban in a brief
   is not an enforcement mechanism.
2. **`git diff --quiet` after a `cp` proves the state at that instant, nothing about the next one.**
   Two of the restores did not hold and the third turned up in a state nobody had written.
3. **Never chain a commit after a test run with `&&`.** It commits whatever the tests said.

Re-run under `isolation: worktree`, so each agent gets its own checkout and cannot reach this tree
at all, and with an added instruction to *describe* any mutation it wants rather than apply it.

#### Findings applied

| # | Owner | Sev | Finding | Disposition |
|---|---|---|---|---|
| **A1** | qa-expert b2 | **HIGH** | Nothing proved `stepGoalEntry` uses **containment** rather than overlap. Verified locally: swapping `containedInGoal` for `overlapsGoal` inside it left **all 1933 tests green** — the auto-run carries the player to the centre before the counter matures, so on every path the tests drove, the two predicates agree. | **APPLIED** (`57006a0`, repaired in `6a28761`) — two tests call `stepGoalEntry` directly with a matured counter, one at the gate's edge and one at its centre. Watched red under the swap. |
| **A2** | qa-expert b2 | **HIGH** | The e2e asserted the drawn gate's **size** and never its **position**. A correctly-sized image drawn 500 px from its trigger passed every word of it — the same defect `completeHelpers.ts` records for the grey box, arriving through the image branch. | **APPLIED** (`38d90fe`) — compared against the sim's own goal rect read live off the scene. Watched red under exactly that 500 px offset: 1 unexpected, 2 expected, then reverted byte for byte. |
| **A3** | qa-expert b2 | MEDIUM | G.4b's unit test wrote `hp` and `state` by hand and read the counter one tick later. That proves the cancel *branch* fires; it does not prove the player is *playable*, which is what G.4b claims. `DEATH_TICKS` of corpse, step 4c's `deathWindowClosed` and `respawnPlayer` all sit between the two facts and none of them ran. | **APPLIED** (`38d90fe`) — a second test drives `damagePlayer` to zero, asserts the counter null on **every** death tick, then the respawn point, the hp, and a jump that has to leave the ground. Watched red under a mutation the hand-written test **survives** (arming without requiring overlap): 7 failures, and `DEATH cancels the sequence` was not among them. |
| **A4** | qa-expert b2 | LOW | The attack edge is not consumed on the **arming tick itself** — `entryLocked` is read after step 0 and 9d arms last, so on that one tick the courier is still an ordinary player. | **INVESTIGATED, NOT A DEFECT — pinned by a test.** `movementLocked` (`src/sim/combat.ts:322`) covers `death` and `hurt` only, so an attack in flight never stalls the auto-run, and `stepCombat` consumes the edge on that tick exactly as at any other time — nothing is left latched *(vault 2.4)*. A test now mashes attack through the arming tick and requires the same 20-tick window ending in the same containment. |
| **A5** | perf b1 + b2 | — | **Both perf briefs concluded independently that the existing perf specs cannot measure this session's frame cost at all.** `sampleLevel` never moves the player, so the gate is never on screen and `stepGoalEntry` never leaves its early return; and all three additions are level-size-invariant, so they divide out of every ratio the suite computes. | **RECORDED, then MEASURED.** Reported UNRUN at first; the owner asked for it to be fixed, so `phase-08-gate-perf.spec.ts` now measures it on a real GPU. See below. |

#### The re-run, in isolated worktrees — three more briefs, and two live defects

`qa-expert` brief 1, `code-reviewer` brief 1 and `code-reviewer` brief 2, each in its own git
worktree with an added instruction: **describe any mutation you want, do not apply it.** Both
code-reviewer briefs took that further and ran their mutations against a disposable `git archive`
extract in the scratchpad, then restored and re-observed a clean suite. The primary tree stayed
untouched throughout, which is the whole difference from the first dispatch.

Every finding below was **re-verified locally before being acted on**, and two of them turned out to
be live defects that six earlier briefs, a Codex plan review and a hands-on pass on all five levels
had all missed.

##### 🔴 B1 — a real hit during the run-in left the courier invisible OUTSIDE the door

The one thing the feature exists to prevent, reachable by ordinary play, in the one paragraph that
promised it could not happen. `goal.ts` cancelled on `!overlapsGoal` and claimed that covered a
knockback. Clearing the rect from the gate's mouth takes **162 px**; `KNOCKBACK_SPEED` is 17.5
px/tick against a `goalEntryDir` already pulling the other way.

**Driven, not computed** — the review supplied the arithmetic, the sim supplied the verdict:

| | before | after |
|---|---|---|
| distance the shove actually moved the player | **25.9 px** | 21.1 px |
| cancel fired | **no** | yes |
| counter reached | **25** (past its own window) | 20 |
| **ticks drawn at alpha 0 while NOT inside** | **5** | **0** |

**APPLIED** — the trigger is the HIT, not the geometry: `stepGoalEntry` now also cancels on
`player.state === 'hurt'`, which fires on the tick the shove lands rather than 162 px later. Being
hit at the threshold costs the entry, which is the better game as well. Gated by a test that
asserts the ALPHA rather than the counter — a fix that clamps the ramp or holds the counter would
satisfy it too, and a fix that merely widened the shove would not. Watched red under the exact
revert.

##### 🔴 H1 — an armed run-in had no termination guarantee

Completion is an AND, so a player who overlaps the rect and can **never** be contained satisfies
neither half and nothing released them. The checklist brief drove it: one solid inside the doorway,
`right` held for 4000 ticks —

```
counter=3938  completed=false  x=1554  overlaps=true  contained=false  grounded=true  hp=100
```

Alive, grounded, still counting, invisible, no input, no jump, no attack. **Waiting to be killed is
the only exit**, and both level 01 and level 05 put an enemy near their door.

**Latent, not live** — all five shipped goal rects were probed and none contains a solid.
**APPLIED anyway**: `stepGoalEntry` cancels above `GOAL_ENTRY_TICKS * 2`. A data gate protects the
levels somebody remembered to check; this protects every level there will ever be. `tiledGoal.ts`'s
rules were left alone — out of scope, and the sim guard is the smaller and more general fix.

##### The rest, applied

| # | Owner | Sev | Finding | Disposition |
|---|---|---|---|---|
| **B2** | cr b1 | MED | `GOAL_ENTRY_TICKS` 20 to 40 left the **whole unit suite green at 1937**. The window's LENGTH was pinned only in the e2e. | **APPLIED** — a value lock in `player-view.test.ts` naming it a balance change. Watched red. |
| **B3** | cr b1 | MED | *"plays the run animation for the whole sequence"* evaluated **one tick**. Mutating the override to `goalEntryTicks > 10 ? state : run` — the courier reverting to `idle` for the entire back half of its own entry — left 1937 green. | **APPLIED** — loops every tick of the window, as the alpha test above it already did. Watched red under that exact mutation. |
| **B4** | cr b2 | HIGH | The shipped-bytes gate's measurements did not pin the shape. A **64 px slit** and a **barcode** both passed all five; the slit fades half the 132 px courier against bright brass. The interior window is 64 px — half the width of the thing it protects — so it cannot order a mutation that narrows the opening to its own size. | **APPLIED** — two new measurements: the longest **unbroken** dark run must be at least half the body (bound from `PLAYER_BOX`, not from this generation; shipped art measures **92 px**), and the dark fraction is taken across the body's real span `x 30..162` (measures **0.794**). Both counterexamples synthesised and watched red: the slit fails 2, the barcode fails 4. |
| **B5** | cr b2 | HIGH | The luminance test used `x 0..20` — **the window this same file documents two tests above as one that "straddled a transparent margin and a pipe gap and measured neither jamb"**. It averaged the copper pipe at column 8 over a region only 57 % opaque and called it frame material. The correction had been applied to the jamb test and not to its sibling. | **APPLIED** — both now measure the columns actually detected as frame, through one shared `frameColumns()`. A re-shoot that moves the pipe can no longer false-red a working asset. |
| **B6** | qa b1 | MED | *"in all 5 levels"* was asserted by unit tests reading level DATA plus one hands-on pass. No browser assertion ever left level 01: `bootToGame` always lands there. | **APPLIED** — the drawn exit is now checked in a browser on **all five**, position and size, against each level's own trigger rect. **And it found something:** the levels are LOCKED, so the first version asked for level-02, was silently handed level-01 by `resolveEntryLevel`, and timed out. The game was right; the test now seeds the same save the perf suite seeds. |
| **B7** | cr b1 | LOW | `level-goal-fits`'s flush-floor check filtered on *any* overlap, so a sliver of floor under one corner of the doorway passed. | **APPLIED** — the solid must span the **whole** rect. Watched red, and the red proof found a second thing: `tiledGoal.ts` checks ground below the exit's bottom-**centre** only, so a floor covering the centre and not the corners passes the **shipped validator** today. |
| **B8** | cr b2 + qa b1 | MED | `level-goal-fits`'s slack bound hardcoded `18`. The dead zone is `runMax` (9), a live Playground knob — `18 = 2 x runMax` by coincidence of authorship. Retuning `runMax` to 12 leaves the gate green while the guarantee it encodes becomes false. | **APPLIED** — derived from `DEFAULT_TUNING.runMax`. |
| **B9** | qa b1 | LOW-MED | G.4b's real-death test ended at one successful jump. *"Free"* and *"the level is still winnable"* are different claims, and only the synthetic knockback path proved the second. | **APPLIED** — chained: armed, really killed, respawned, driven back across the level, completed. |
| **B10** | cr b1 + cr b2 | MED | `entryLocked` is tested **before** `hitstunLocked`, so the run-in overrides hitstun's horizontal lock. A Phase 5 combat rule bent by a Phase 8 feature, with no header saying so. | **APPLIED as documentation** — the behaviour is deliberate, and B1's fix narrowed it to a single tick (the cancel fires at 9d of the tick the hit lands). Stated at the branch. |
| **B11** | cr b2 | LOW | Three comments in `goalLayer.ts` that this session made false: *"Absent today, by design"* about a texture that ships, the whole *"it stays grey-box this phase"* section, and *"the exit's reached-it flourish"* for something that now fires 20 ticks later over an empty doorway. | **APPLIED** — all three corrected *(vault C9)*. |
| **B12** | cr b2 | MED | `file-size.test.ts`'s docstring said the ratchet *"is at 0"* and described the residual hole as hypothetical *"while the ratchet has been raised"*. This session raised it to 1 and nobody re-read the sentence. | **APPLIED** — the paragraph is in the present tense now, and says the hole is open. |
| **B13** | cr b2 | MED | G.7's Owner column was a dash, its agents named only in the Method column without the `voltagent-qa-sec:` prefix every other row uses. `docs-contract.test.ts` lints gate tables under `### 6. QA gate` with `N.N` ids, so **this session's table is linted by nothing.** | **PARTLY APPLIED** — G.7 split into G.7a (`code-reviewer`, satisfied) and G.7b (`performance-engineer`, now measured), with real owners. The lint's blindness to `docs/qa/*` gate tables is real and **RECORDED for the owner**: teaching it a second table shape changes a cross-phase gate and is outside this session's scope lock. |

##### Recorded, not fixed *(C11)*

| # | Owner | Finding | Why not |
|---|---|---|---|
| R1 | qa b1 | The e2e never presses jump or attack, so G.4's *"unit + e2e"* method is really unit-only for the lock half. | 🔴 **WITHDRAWN.** The Codex implementation review showed this reasoning talks past its own gap — the unit coverage omitted the ARMING tick, which is exactly where the lock does not hold. Now covered by an arming-tick alpha test. |
| R2 | cr b2 | The e2e's `onRamp` accepts any `1 - k/20`, so a **2x fast** fade passes it, while the spec header claims it refuses a wrong curve. | True, and it is a division of labour the unit suite covers (B2 and B3 both go red on it). The header's claim was the defect, not the gate — corrected in the spec rather than duplicating a unit test in a browser. |
| R3 | cr b2 | `animsWhileArmed` is largely satisfied by the sim's own `run` state at ~11 fps, so deleting the render override might leave it green. | Same division. B3 now loops every tick of the window in the unit suite, which is where a 60 Hz claim can actually be measured. |
| R4 | cr b2 | `counterRange[1] === 20` is held up by the freeze, so it partly restates `completed === true`. | It still has one real tooth — a level where the player is not contained at tick 20 latches 21+ and reds. Kept for that. |
| R5 | cr b2 | A vertically **flipped** gate passes every pixel measurement. | No pixel metric distinguishes it, and orientation is exactly what G.1b's by-eye check is for. STYLE.md §5 already says the material rule cannot be measured by a whole-region metric. |
| R6 | cr b2 | Requiring *frame mass* (16+ bright opaque columns per side) would kill the thin-stripe slab counterexample. | Measured on the shipped art: **17 left, 11 right**. The real gate cannot clear a bound that would catch a 12 px stripe. Inventing one the art fails is fitting the test to a wish. |
| R7 | cr b2 | `buildChrome`'s note says letterboxing would leave transparent margin; the shipped gate has ~6 px each side anyway, inherited from the source bounding box. | Accurate observation, harmless outcome, and `tools/gen` is outside the scope lock beyond the one `buildGate` addition. |
| R8 | cr b1 | The ratchet names no file, only a count. | Mitigated by `citationProblem`, which demands an exact path and an exact `lines=N` — and it proved itself live today, reddening on its own when `tick.ts` grew from 422 to 428. |
| R9 | cr b1 | The QA log's *"fade frames"* column counts armed frames after the freeze, so it is not the ramp's duration. | Correct. The 20 distinct alphas and the 0.05 maximum step are the load-bearing numbers; the frame count is annotated rather than removed. |

##### 🔴 A measurement trap this re-run walked into, and the rule that comes out of it

**Vitest serves an already-transformed test file a CACHED copy of an `import.meta.glob('?raw')`
fixture.** Mutating a `.tmj` and re-running `level-goal-fits.test.ts` reported **green on a mutation
that had definitely landed** — `cmp` said the bytes changed, the mutation script read the file back
and printed the new width, and the gate still passed. A brand-new probe test compiled in the same
run saw the mutation immediately.

So: **when a red proof mutates DATA rather than source, touch the test file and its fixture module
before re-running.** Otherwise the mutation is real, the green is fake, and it looks exactly like a
gate that cannot go red. Every `.tmj` red proof in this log was re-run under that rule.

### G.7b — the frame budget, MEASURED

Reported UNRUN earlier in this session. The owner asked for it to be fixed, so it was: the criterion
now has a spec, a number and a held-out confirmation. `tests/e2e/phase-08-gate-perf.spec.ts`.

**No existing gate was touched.** The file is named `phase-08-*` so that `playwright.config.ts`'s two
matching regexes route it to the `chromium-gpu` project without either being edited — a rename was
the whole cost of getting onto real hardware.

#### The result

Measured on the real GPU the config exists to reach — `angle (nvidia, nvidia geforce rtx 4080,
direct3d11)`, not SwiftShader.

| run | 1 exit (gpu) | 41 exits (gpu) | **per exit** | main thread |
|---|---|---|---|---|
| 1 — bound chosen here | 0.140 ms | 0.234 ms | **0.0024 ms** | below the floor |
| 2 — held out | 0.177 ms | 0.214 ms | **0.0009 ms** | below the floor |
| 3 — held out | 0.128 ms | 0.389 ms | **0.0065 ms** | below the floor |

**One exit costs between 0.0009 and 0.0065 ms of GPU per frame** — at worst **0.04 % of a 16.67 ms
frame**. The bound is `0.05 ms`, so the measured worst case sits 7.7x under it and the best case 55x
under. Main-thread work is under the clock's own resolution in every run.

#### 🔴 The first version of this measurement was thrown away, and why that matters

It sampled *exit drawn* against *exit hidden* and compared medians:

```
exit drawn   work 0.600 ms   gpu 0.161 ms
exit hidden  work 0.400 ms   gpu 0.270 ms
ratios       work 1.500      gpu 0.595
```

Neither figure is a measurement. `performance.now()` is quantised to **0.1 ms** in this browser, so
`0.600` and `0.400` are adjacent steps on the clock's grid — that 1.500 is the quantum, not the gate.
And the GPU arm says drawing an extra 124 416-pixel image made the frame **40 % faster**, which is
not a small effect measured imprecisely; it is noise with a sign.

The bound would have gone red on correct code, and moving it would have made it green for anything.
**The statistic was replaced, not re-bounded** — which is this project's own rule, applied to a gate
written inside this session.

#### What replaced it, and why it can go red

Amplify until the signal clears the timer, then divide back down. 40 extra exits — identical texture,
size, origin, depth and position — are stacked on the real one; the delta over that window divided by
40 is the per-exit cost, measured above the 0.1 ms grid instead of underneath it.

**The mutation is not a separate test somebody has to remember to run — it is how the measurement is
taken.** An exit that got twice as expensive to draw doubles the delta and doubles the reported
figure. And the spec asserts its own premise: if 40 extra exits do not cost the GPU anything
measurable, the divisor is dividing noise, so it fails loudly rather than reporting a small number.

#### What this does NOT measure, stated rather than implied

- **`goalEntryAlpha` + `sprite.setAlpha`** run unconditionally on every frame of every arm, so they
  divide out of this exactly as they divide out of 8.7's ratio. One property write per frame against
  16.67 ms is far under anything measurable here. *An A/B toggle bounds what it can show.*
- **`stepGoalEntry`'s real work** lasts 20 ticks, then the level completes and the sim freezes. Not a
  steady state, by construction. It is nine comparisons and an increment.

#### Two things the spec had to learn first

1. **The scavenger closed the door.** Level 01's patrol ends 96 px from the exit. Parked at the
   threshold, the player is in its aggro range; it charges, the knockback shoves the body INTO the
   rect, the run-in arms, and 20 ticks later the level completes and `tick()` freezes at step 0. The
   tick-bounded sampler then never reaches its span and `page.evaluate` hangs. **Two runs died at
   240 s having measured nothing.** Enemies are now cleared in every arm identically.
2. **A perf spec has to be named for the project it needs.** `session-gate-perf.spec.ts` matched
   neither regex in `playwright.config.ts` and ran headless, where `assertRealGpu` correctly refused
   it. That refusal is the config working — the whole point of `chromium-gpu` is that a silent
   SwiftShader fallback is invisible.

---

### Codex implementation review — BLOCK, 4 findings, all applied

Filed verbatim with its triage at
[reviews/session-gate-art-and-entry-impl.md](../reviews/session-gate-art-and-entry-impl.md). It ran
AFTER the gate owners, so the diff it read is the one their fixes produced.

It returned **BLOCK** on two high-severity defects, and both were confirmed by driving the sim:

| | What Codex found | What the sim said |
|---|---|---|
| **1** | The jump is not locked on the ARMING tick — `entryLocked` is cached before step 1 and 9d arms at the end of the tick — so a hop there can fade the courier while outside the door. | **Mechanism confirmed** (the jump fires, `vy -24.3`, counter 0). **Harm not reachable at current tuning**: the hop costs 11 of the 20 ticks and lands contained by 14. But that margin is a tuning coincidence and `runMax` / `jumpVelocity` are live Playground knobs. |
| **2** | The `GOAL_ENTRY_TICKS * 2` ceiling writes `null` and the arm branch re-arms on the very next tick, so an uncontainable player cycles instead of being released. And the test measured the longest single armed span — which stays under the ceiling **because the ceiling works** — so it passed while the behaviour it named stayed broken. | **Confirmed, and worse than described: 3 free ticks in 120.** After the fix, 120 in 120. |

Finding 1 took **three attempts**, and the two failures are worth more than the fix:

1. **A position test at step 7** — useless, because step 7 runs before step 8 integrates the body, so
   on the arming tick it reads the PREVIOUS position, reports "not in the doorway" and blocks
   nothing. Measured, reverted.
2. **Refusing to arm off the ground** — it worked, and took `level-completable.test.ts` red on four
   seeds. The auto-player jumps when the ground ahead runs out, and on every shipped level the floor
   ends just past the exit, so it hopped the threshold and sailed over the doorway, finishing at
   x 3338 with the goal at 1600–1792 and zero grounded ticks while overlapping. That gate exists for
   exactly this, and this session's plan said in as many words that a completability failure is a
   real defect and not a test to update. Reverted.

What shipped **freezes the counter while airborne**: the sequence still arms mid-hop and still steers
the body in — which is how an airborne arrival ever completed, and what attempt 2 destroyed — but the
fade measures *walking in*, and you do not walk through air.

**Finding 3** (G.7b measures marginal cost, not total, and never proved linearity) was a fair
objection to an inference rather than a defect. Answered by measuring instead of arguing: the spec now
takes the same per-exit estimate at **20 and at 40** copies and fails if they disagree by more than
4x. Measured **0.0037 vs 0.0060 ms — 1.6x apart** — so the division is sound and G.7b is proved
rather than asserted.

**Finding 4** (six stale sentences in live contracts) applied. **R1 was withdrawn**: Codex was right
that its reasoning talked past finding 1.

---

## The QA gate

| # | Criterion | Method | Owner | Status |
|---|---|---|---|---|
| G.1 | `goalIsGreybox()` false in all 5 levels; the gate renders at the goal rect | unit + e2e | `voltagent-qa-sec:qa-expert` | ✅ unit + e2e on all 5 levels |
| G.1b | **The art READS as a doorway with a dark opening** *(Codex C6)* | by eye, screenshotted *(C4)* | play | ✅ by eye, twice — before and after the fixes |
| G.2 | Edge contact does NOT complete; the predicate fixture **and** the per-tick loop, both watched failing | unit | `voltagent-qa-sec:qa-expert` | ✅ both watched failing |
| G.3 | Containment DOES complete, at a named tick | unit | `voltagent-qa-sec:qa-expert` | ✅ tick 20, watched failing two ways |
| G.4 | `run` plays from first overlap to completion; jump AND attack locked on the **sim** state; the attack edge is consumed | unit + e2e | `voltagent-qa-sec:qa-expert` | ✅ sim state, edge consumed |
| G.4b | **Dying during the run-in cancels it** — the respawned player is free *(Codex C1, blocker)* | unit + hands-on | `voltagent-qa-sec:qa-expert` + play | ✅ real death, respawn, and a finished level |
| G.5 | Alpha reaches 0 over a tick-counted window; the curve has a red proof | unit + e2e | `voltagent-qa-sec:code-reviewer` | ✅ curve, window length and override all watched failing |
| G.6 | No blink-out, no pop-back — all 5 levels, by hand | `playwright-cli` + hands-on *(C4)* | play | ✅ 5 levels pre-fix; probe-driven re-check after |
| G.7a | No file > 400 lines; diff reviewed; adversarial pass | `code-reviewer` ×2 | `voltagent-qa-sec:code-reviewer` | ✅ 1 file over 400, cited |
| G.7b | Frame budget unchanged | amplified A/B on real GPU | `voltagent-qa-sec:performance-engineer` | ✅ **0.0009-0.0065 ms/frame per exit, bound 0.05** |
| G.8 | Codex plan review ran; every finding applied or recorded | [the review](../reviews/session-gate-art-and-entry-plan.md) | — | ✅ **12 findings, 10 applied, 2 recorded** |
| G.9 | Codex implementation review ran on the diff; every finding applied or recorded | [the review](../reviews/session-gate-art-and-entry-impl.md) | codex | ✅ **BLOCK, 4 findings, all applied** |

---

## Hands-on, on the GREY BOX, before a cent was spent

Driven with `playwright-cli` against the dev server. Grey-box-before-art is a Global Constraint, and
the point of doing this first is that the art must not be bought against a broken sequence.

**Sampled once per animation frame, inside the page, returning an aggregate.** A wait expressed in
ticks cannot bound a sampling window — and `window.__game.tick` *stops* the moment a level
completes, so nothing here waits on a tick count. Every run waits on `ready`, then on `completed`.

### All five levels

| level | completed | armed at x | goal.x | fade frames | distinct alphas | biggest 1-frame drop | anims while armed | final α | popped back |
|---|---|---|---|---|---|---|---|---|---|
| level-01 | ✅ | 8577 | 8640 | 137 | **20** | **0.05** | `brass-courier-run` | 0 | **no** |
| level-02 | ✅ | 10343 | 10368 | 169 | **20** | **0.05** | `brass-courier-run` | 0 | **no** |
| level-03 | ✅ | 11975 | 11904 | 137 | **20** | **0.05** | `brass-courier-run` | 0 | **no** |
| level-04 | ✅ | 13556 | 13440 | 137 | **20** | **0.05** | `brass-courier-run` | 0 | **no** |
| level-05 | ✅ | 14910 | 14976 | 137 | **20** | **0.05** | `brass-courier-run` | 0 | **no** |

**`0.05` is exactly `1 / GOAL_ENTRY_TICKS`** — one step of the ramp, never more. That is the number
that rules out a blink-out: a character that winked out at the threshold would show a single drop
near 1.0. And **20 distinct alphas** is the whole ramp, seen on screen.

`tailAlphas` was `[0]` on every level across the 60 frames sampled *after* the level-complete panel
appeared — no pop-back, which is structural rather than remembered: the sim freezes at step 0 and
`goalEntryAlpha` keeps returning 0 from the held counter.

**level-04 travelled −30 px while armed** — it armed at 13556, right of the gate's 13536 centre,
and ran **left** into it. The auto-run is genuinely bidirectional and the dead zone settles it.

### Screenshots — [docs/evidence/gate-entry/](../evidence/gate-entry/)

| | |
|---|---|
| `01-approaching.png` | the courier on the floor, gate ahead, full opacity |
| `02-armed-first-contact.png` | at the doorway's left edge, sequence armed, still fully drawn |
| `03-mid-fade.png` | **counter 17, α 0.15 — the courier is inside the dark opening and nearly gone** |
| `04-complete.png` | LEVEL COMPLETE panel, the courier entirely absent, the void still drawn |

Looked at by eye, which is the only thing that can settle this *(C4)*: it reads as a character
walking into a doorway and being swallowed by the dark, not as a sprite being switched off.

### G.4b — dying mid-run-in, the blocker Codex predicted

Killed through the **kill plane**, not by writing `hp`. Writing `hp` directly bypasses `killPlayer`
and the death window, so the respawn never runs and the half that matters goes unobserved — the
first attempt did exactly that and produced a misleading pass.

| | |
|---|---|
| armed at | frame 156, x 8574 |
| killed at | frame 176, entry counter **5**, α 0.75 |
| `goalEntryTicks` after | `5 → **null**` — **cancelled** |
| alpha after | `0.75 → **1**` — fully opaque again |
| respawned | **true**, at the spawn (x 625, `world.spawn.x` 624) |
| hp after | **100** |
| then | ran to **x 2224** under held input — **the controls came back** |
| level completed | **false** — you do not finish by dying on the doorstep |

Without the cancel this is the unwinnable state: locked, auto-running, unable to jump, at a spawn
1600 px from the first pillar it has to clear.

### The same five levels again, on the REAL ART — G.1b and G.6

Re-run after `goal-gate` shipped. Identical numbers on all five, which is itself the point: swapping
a `Container` of two `Rectangle`s for a generated `Image` changed nothing about the sequence.

| level | completed | armed at x | goal.x | distinct alphas | biggest 1-frame drop | anims while armed | final α |
|---|---|---|---|---|---|---|---|
| level-01 | ✅ | 8574 | 8640 | **20** | **0.05** | `brass-courier-run` | 0 |
| level-02 | ✅ | 10302 | 10368 | **20** | **0.05** | `brass-courier-run` | 0 |
| level-03 | ✅ | 11838 | 11904 | **20** | **0.05** | `brass-courier-run` | 0 |
| level-04 | ✅ | 13374 | 13440 | **20** | **0.05** | `brass-courier-run` | 0 |
| level-05 | ✅ | 14910 | 14976 | **20** | **0.05** | `brass-courier-run` | 0 |

Every level arms at exactly `goal.x − 66` — the body's half-width — which is the geometry this
session is built on, observed rather than asserted.

**G.1b, settled by eye** *(C4)*, screenshots in [docs/evidence/gate-entry/](../evidence/gate-entry/)
as `art-01`…`art-04`:

- The gate reads as a **Victorian steampunk doorway** standing on the walkway: riveted iron jambs,
  brass arch and edging, two pressure gauges, a valve wheel, copper pipework, a lit lamp above the
  lintel. Not a slab, not a window, not a decorated wall.
- It is **the same height as the courier**, which is correct and not a coincidence — both are 288 px.
- **At counter 12 / α 0.40 the courier is a ghost inside the dark opening** (`art-03-mid-fade.png`).
  The void swallows them. That single frame is the whole feature and it does what it was for.
- At completion the courier is entirely gone and the opening is still drawn.

### Two things the probe got wrong first, both worth keeping

- **A synthetic `new KeyboardEvent` does not move the character.** Phaser's keyboard manager matches
  on `event.keyCode`, which the init dict cannot set. The first probe ran 3600 frames with the
  courier standing still and reported *"no fade, no arming"* — which reads exactly like a broken
  feature. Fixed with `Object.defineProperty(e, 'keyCode', …)`, and the difference between a broken
  probe and a broken feature is one line of evidence.
- **A jumping bot flies over the exit.** The goal rect is exactly the body height, so an airborne
  player's feet rise above `goal.y + goal.h` and `overlapsGoal` is false. On level-02 the bot
  bunny-hopped straight over the doorway and out the far side, never arming. **This is unchanged
  pre-existing behaviour** — the old rule used the identical vertical test — but it is worth
  recording: *you cannot enter the exit while jumping.* The bot stops jumping within 700 px of the
  gate; a human walks in.

**level-05's traversal is not claimed here.** The browser bot dies 21 times on it and never reaches
the exit — a limitation of a crude probe, not of the level: `level-completable.test.ts` finishes
level-05 under every gate seed. Its run-in above was observed by placing the courier 400 px left of
its exit and letting the game do the rest, which exercises arm → run → fade → complete in full.
Stated rather than glossed.

---

### The hands-on re-check, after the two fixes — and a third defect it found

The fixes changed what happens when the courier is hit at the door, so the earlier hands-on pass no
longer covers it. Re-driven in the running game with `playwright-cli`.

⚠️ **Level 01 could not be platformed through the CLI.** Each command is a round trip while the game
runs on real time in between, so a stall-triggered jump fires tens of pixels too late — the courier
died in the pit at 3840–4128 on every attempt. `levelDriver.ts` avoids this by running the whole
driver **inside the page**, sampling once per animation frame; a CLI loop structurally cannot. So the
observations below use an **instrumented probe**: the body is placed at the gate's mouth and the sim
then runs untouched from there. Stated plainly because it is not the same thing as playing the level,
and the earlier full five-level pass — which did play them — stands as the record for G.6.

#### The clean entry is unchanged by the fixes

| Measured, in the running game | Value |
|---|---|
| ticks from arming to completion | **21** (counter 0 → 20) |
| distinct alphas drawn | **21** |
| biggest single-tick drop | **0.05** — exactly 1/20 |
| sim states while armed | `run` only |
| frames at alpha 0 before completion | **0** |
| alpha after the panel | **0**, held |

Identical to the pre-fix pass. Neither fix touches the path a clean entry takes.

#### The hit at the door, watched

```
counter/alpha/state, one entry per tick

0/1/run  1/0.95/run  …  8/0.6/hurt      the hit lands mid-fade
null/1/hurt  × 17                        cancelled, opaque, the whole hurt window
0/1/run  1/0.95/run  …  20/0/idle        re-armed from zero, full window, completes
```

Which is the intended behaviour: being hit at the threshold costs the entry, the courier snaps back
to full opacity and takes the hit like anywhere else, then walks in again.

#### 🔴 …and the first run of that trace showed the counter FLICKERING

```
8/0.6/hurt  null/1/hurt  0/1/hurt  null/1/hurt  0/1/hurt  …
```

The cancel branch had learned about `hurt` and the arm branch had not, so the sequence cancelled at
9d and re-armed at 9d of the very next tick, for the whole hurt window.

**Nothing looked wrong on screen** — a counter of `0` draws at alpha 1 exactly as `null` does — so no
alpha assertion anywhere could have seen it, and none did. It was found by watching the *counter* in
the running game rather than the render. What it actually cost: `entryLocked` was true on every other
tick, so the auto-run fought the knockback on alternating ticks and hitstun was half-applied.

**APPLIED** — one `entryBlocked()` predicate, read by both branches *(vault 5.3)*. Watched red: with
the arm branch reverted, `stays cancelled for the whole hurt window` fails and nothing else does.
Re-watched in the running game afterwards: `null/1/hurt` × 17, no flicker.

This is the session's third defect found by driving rather than reading, and the second one no gate
in the suite could have caught — both because the wrong thing was being measured, not because a
bound was wrong.

#### Screenshots — [docs/evidence/gate-entry/](../evidence/gate-entry/)

| File | What it shows |
|---|---|
| `fix-01-fade-a.png` | counter 4, alpha 0.80 — the courier at the doorway's mouth, part-faded, with the scavenger beside it |
| `fix-02-fade-b.png` · `fix-03-fade-c.png` | counter 20, alpha 0 — gone, panel up |
| `fix-04-complete.png` | the finished state at true size |

**G.1b, by eye, again:** the gate reads as a Victorian brass-arched doorway with gauges down the
jambs and a genuinely dark opening. The figure standing opaque beside it in the completed shot is
the **scavenger**, not the courier — worth writing down, because it looks exactly like a pop-back
until you check which sprite it is.


---

### 🔴 The gate was the same height as the character, and nine machine gates said it was perfect

Found by the owner, looking at a screenshot: *"the gate is smaller than the character. This gate needs
to be bigger than the character."*

The goal rect is `192 x 288`. The courier's box is `PLAYER_BOX` 22 x 48 at `RENDER_SCALE` 6 =
`132 x 288`. The gate was authored at the rect's size and drawn `setDisplaySize(goal.w, goal.h)` — so
**the doorway stood exactly as tall as the person walking through it.** It read as a hatch.

#### Why nothing caught it

Every measurement in the suite compared the drawing to the rect, and **against the rect it was
correct**: `shipped-gate.test.ts` asserted `192 x 288` because that is what the rect is; the e2e
asserted the drawn bounds matched the trigger, because they did. The size was consistent, documented,
and wrong — there was no assertion anywhere that the door had to be bigger than the character,
because nobody had thought to say it.

That is exactly what a `play`-owned criterion is for, and it is the second time this session a human
eye found what the machine gates could not. *(C4.)*

#### The fix: art and trigger volume are now separate numbers

| | before | after |
|---|---|---|
| drawn size | 192 x 288 | **288 x 432** (`GATE_PX`) |
| anchor | centred on the rect | **bottom-centre on the rect** |
| trigger rect | 192 x 288 | **192 x 288, unchanged** |
| height vs the courier | **1.0x** | **1.5x** |

`GATE_PX` lives in `src/scenes/goalArtSize.ts` because it is needed on both sides of a boundary that
cannot be crossed: the scene draws with it and a `.mjs` build tool authors the PNG at it, and a `.mjs`
file cannot import a `.ts` module. `shipped-gate.test.ts` asserts the shipped PNG against the TS
constant, so the two copies cannot drift in silence *(vault 5.3)*.

**Anchored bottom-centre** so the door stands ON the threshold the sim tests and grows upward and
outward from it. Centring it on the rect instead would sink its base into the floor.

**Containment is untouched.** `overlapsGoal` and `containedInGoal` read `world.goal`, and the vertical
test is an exact equality against the rect's 288 — see `goal.ts`. This scales the IMAGE, never the
rect, and the `.tmj` files were not opened.

**No fal spend.** `npm run assets:world` re-downscaled the same 1636 x 2355 crop from the existing
generation. Rescaling the shipped 192 x 288 PNG would have been an upscale of already-downscaled
pixels; this is one clean downscale.

#### The bigger gate measurably improved the art

| measured on the shipped PNG | 192 x 288 | 288 x 432 |
|---|---|---|
| unbroken dark run at the courier's heights | 92 px | **138 px** |
| …against the 132 px courier | **0.70x — narrower than the body** | **1.05x — wider than the body** |
| dark fraction over the courier's real box | 0.794 | **0.973** |

At the old size ~30 % of the drawn character faded against brass jamb, and the gate could only
honestly ask for *half* the body width. Now the opening is genuinely wider than the person walking
through it, so **the test says so**: the bound is `BODY_W`, from `PLAYER_BOX`.

⚠️ 138 against 132 is ~4.5 % of headroom, which is thin, and deliberately: a re-shoot that dips under
is a real regression — the courier would fade against the jamb again — and the fix is a better
generation, **never** a lower bound.

Both counterexamples re-synthesised at the new size and watched red: a 96 px opening (narrower than
the body) fails 2 assertions, a barcode fails 4.


---

## Red proofs — every new gate watched failing *(C1)*, every mutation confirmed reverted *(C12)*

### The e2e spec — and the harness trap it walked into from the wrong end

**Mutation:** delete `sprite.setAlpha(desc.alpha)` from `gamePlayerDraw.ts`, so the fade is computed
and never reaches the screen. `setAlpha` occurrences **1 → 0**, `cmp` confirms the file changed,
`git diff --quiet` confirms it restored.

**Red:** `1 failed`, naming
`fades to 0 over many frames, plays run throughout, and never pops back`, on
`the courier was never drawn PARTIALLY faded — that is a blink-out, not a fade`. Restored: `3 passed`.

That mutation is the one this spec exists for. `player-view.test.ts` stays **completely green**
through it, because the descriptor is still correct — only nothing applies it. It is the same shape
as Phase 2's *deleting `renderPlayer()` left every test green*.

#### 🔴 Two false reds before that, both the harness rather than the feature

**1. The bound was unmeasurable in this project.** The first version counted *distinct alphas per
animation frame* and required more than five. It failed on the real build with **one**. The headless
project renders at roughly **11 fps** against a fixed 60 Hz sim, so one frame drains five or six
ticks and the entire 20-tick ramp spans about **three animation frames** — there are not five frames
in the window to have five alphas in.

This is the project's oldest measurement trap arriving from the opposite end. Phase 7 learned that
at ~240 fps a percentile over rAF frames cannot see a cost carried by 2 % of frames; here, at ~11
fps, a per-frame sampler cannot see a ramp lasting a third of a second.

**The bound was not lowered to fit the harness — the statistic was replaced** *(the rule from
2026-08-19: a statistic that cannot order its own mutation cannot be fixed by moving the bound)*.
The claim is now:

> every alpha the sprite is ever drawn with is a value **on** the ramp (`1 − k/20` for whole `k`),
> it never increases, and at least one is strictly between 0 and 1.

That holds at 11 fps and at 240 fps, it is what the fade actually claims, and it still refuses an
instant blink, a wrong curve and a pop-back. Pairing each alpha with the counter read in the same
callback was rejected: the sampler and Phaser's update run in an unspecified order within a frame,
so the pair can skew by one tick through no fault of the code under test.

**2. The sampler measured an empty window.** `playToExit` waits on `world.completed`, so a sampler
installed *after* it returns begins life on a finished level. It saw one alpha (`0`), a counter
frozen at 20, and reported *"never drawn partially faded"* — **a true statement about a window it
had entirely missed**, indistinguishable from a real blink-out defect. Fixed by installing the
sampler before the drive. Worth stating plainly: **two of the three shape assertions were red
against a feature that works**, and the difference was five lines of ordering.

### The shipped art — three mutations, three different ways to be wrong

**Target:** `public/assets/objects/gate.png`, mutated as bytes and re-run against
`tests/unit/shipped-gate.test.ts`. Restored with `cmp` confirming byte-for-byte equality after
each.

| | mutation | landed | `Tests N failed` | caught by |
|---|---|---|---|---|
| **A** | **transparent void** — the interior keys away, so the gate ships as a **ring** | yes | **2 failed** | dark-opaque opening · mostly-opaque overall |
| **B** | **slab** — an opaque dark rectangle with no doorway around it | yes | **2 failed** | bright frame flanking the opening · frame-vs-void luminance |
| **C** | **lit interior** — the opening is a lit room, not a dark passage | yes | **2 failed** | dark-opaque opening · frame-vs-void luminance |

Mutation A is the one the whole test file exists for: **a ring is still exactly one connected
component and still 192 × 288**, so `buildGate`'s refusal cannot see it and the asset ships as a
see-through hole the player fades into instead of a dark passage.

🔴 **The first run of this loop proved nothing and said so.** The mutation script sat in `/tmp` and
its relative import of `tools/gen/png.mjs` did not resolve, so it threw, no bytes changed, and all
seven tests passed. The `landed=` column — a `cmp` before believing the result — is what caught it;
without it the honest record would have been three false greens read as "the gate cannot catch
these". *(C12, and the second time this session that a red proof was nearly recorded from a run
that mutated nothing.)*

### 🔴 A red gate fixed by correcting the WINDOW, not the bound

`has a solid frame down BOTH jambs` failed on the real asset at **0.574 against a 0.6 bound**. The
tempting move is to lower the bound. The column profile says the bound was never the problem:

```
  col   0    0 % opaque              transparent margin
  col   8  100 % opaque,  95 % bright   the copper PIPE
  col  16   13 % opaque              the GAP between pipe and frame
  col  24   92 % opaque,  22 % bright   the jamb begins
  col  40  100 % opaque,  91 % bright   the jamb proper
  col  56..136  100 % opaque, ~14 % bright   THE OPENING
  col 144  100 % opaque,  87 % bright   the right jamb
  col 176   15 % opaque              the gap again
```

The window `x 0..20` straddled a transparent margin and a pipe gap and **measured neither jamb**.
Replaced with a predicate that does not need to know where the jambs are — *somewhere between the
centre and each edge there is a column that is ≥90 % opaque and ≥60 % bright.* Hardcoding
`24..52` / `144..172` was rejected: that is fitting the test to one generation, and the next
re-shoot moves them.

The distinction is the point. **Moving a bound to clear a red gate is forbidden; correcting a
window that measures the wrong pixels is fixing the test.** Mutation B above then confirms the
replacement still refuses a slab, which the old window would also have done — so nothing was lost.

### The fade curve — three mutations, and only one test does the work

**Target:** `goalEntryAlpha` in `src/render/playerView.ts`. Driven from the shell, never from a
Node script. `GOAL_ENTRY_TICKS` occurrences dropped **2 → 1** on every mutation, and the file was
restored with `cmp` confirming byte-for-byte equality afterwards *(C12)*.

| | mutation | `Tests N failed` | which tests caught it |
|---|---|---|---|
| **A** | delete the fade — `return 1` | **3 failed** | per-tick curve · monotonic · reaches 0 |
| **B** | make it instant — `return 0` | **2 failed** | per-tick curve · monotonic |
| **C** | **quadratic** — `1 - (t/N)²` | **1 failed** | per-tick curve **only** |

🔴 **Mutation C is the one worth keeping.** A quadratic ramp agrees with the linear one at tick 0
*and* at tick `N`, and is monotonically decreasing throughout — so **both endpoint assertions and
the monotonicity assertion pass it**, and the character visibly fades on a different schedule. Only
`pins the alpha at EVERY tick of the ramp` sees it.

That is the concrete form of the rule this project keeps re-learning: *"the endpoints are worthless
on their own."* Mutation B makes the same point from the other side — with an instant fade, the
test named `reaches exactly 0 at GOAL_ENTRY_TICKS` **still passes**, because a sprite that vanished
immediately is also a sprite that is invisible at the end. A gate asserting the end state of a fade
cannot tell a fade from a disappearance, and *"the player is invisible at the end" is true of a
sprite that was never drawn.*

### `level-goal-fits.test.ts` — and the finding that Codex's "future-proofing" objection was wrong

**Mutation:** `level-01.tmj`'s goal rect height `288 → 240`, applied by editing the **parsed JSON**,
not by a text substitution.

🔴 **The planned text mutation would have changed zero bytes.** It grepped `"height":288`; the
shipped file writes `"height": 288`, with a space. Codex's plan review (C5) caught it and it was
verified here before anything ran: **6 matches for the real pattern, 0 for the planned one.** A
"watched it go red" record taken from that run would have been false — which is precisely why the
rule is *content changed AND the original count dropped by one*, and never *the count is now zero*.

| | |
|---|---|
| before | `grep -c '"height": 288'` → **6** |
| mutation landed | `cmp` reports the file differs → **yes** |
| after | **5** — dropped by exactly one, not to zero |
| gate red | `Tests 2 failed`, naming `level-01 is EXACTLY body-tall` and `level-01 has a solid whose top edge is flush with the exit bottom` |
| reverted | `git diff --quiet` clean → **byte-for-byte**; count back to **6** |
| green again | `Tests 95 passed` across both files |

**And the mutated level is genuinely unwinnable.** With the 240 px exit,
`level-completable.test.ts` fails on **all three seeds** (8201, 8202, 8203) — the solver plays the
real `tick()` over the real shipped bytes and can never finish. That retires Codex's C11 objection
(*"future-proofing, not current delivery"*) with evidence rather than argument: the failure this
ten-line file prevents is a shipped level that loads, validates, draws its door and cannot be
completed, and **no other gate in this repository sees it** — `level-goal.test.ts` passes it,
because one rect of positive size far from the spawn is all it ever asked for.

---

## The 400-line rule — one exemption, written before it was taken (CLOSED 2026-08-20)

> **🔴 The exemption is SPENT and the citation line is deleted.** Phase 9 needed a home for the
> hit-stop gate, which has to cover steps 5, 6, 7 and 8 together, and moving that block whole into
> `src/sim/playerMotion.ts` took this file back under the limit. The split refused below was the
> wrong split;
> the one that worked was not on the list, because in Phase 8 nothing yet needed a seam through the
> numbered steps themselves. **The ratchet goes back 1 → 0.** Everything under this line is kept as
> written — it is the reasoning that was true when it was taken, and the record of what changed it.

**`src/sim/tick.ts` crossed the limit at 422 lines, up from 398.** The gate's own text says the
way past is *"to split the file or write the justification, in that order of preference"*, so the
split was attempted first and is recorded here as rejected, with the reason.

**What the +24 lines are.** The whole feature's footprint in this file: the widened-9d paragraph in
the contract header (8), the `entryLocked` cached read (3), the attack-edge consumption block (6),
the `dir` ternary gaining a branch (2), and one line each on steps 5, 7 and 9d. Roughly 11 further
lines were **moved out to `goal.ts`** while getting here — every one of them reasoning that
`goal.ts`'s own header already claims (*"the step in `tick.ts` is three lines and a pointer, and the
reasoning lives with the code that implements it"*). That was a real defect in the first draft, not
a line-count trick, and it is why this exemption is for 422 and not 445.

**Why it is not split.** This file is the numbered tick contract **and** the function that
implements it, and their co-location is the entire design premise — *"the code below is a numbered
list rather than a paragraph of arithmetic"*. The one extractable concern was already extracted:
`advance` moved to `advanceSplit.ts` in Phase 8 for exactly this reason, and that file's docstring
says so. The two remaining candidates were examined and both would **contradict a decision written
into this file**:

- **step 13's window advance** → `windows.ts`. Refused: step 13's own comment states that the
  guard in front of `advanceWindow` *"is the step-order rule above and stays here, with the
  numbered order that owns it"*.
- **step 4c's respawn** → `combat.ts`. Refused: the block states the decision is taken in `tick.ts`
  *"where the spawn point lives"*, and `combat.ts` deliberately imports no level data.

Splitting the contract header into a document was also rejected: CLAUDE.md's instruction is *"read
that file's header before changing anything in `src/sim/`"*, and its value is being in the file the
reader already has open.

**The ratchet moves 0 → 1** in `tests/unit/file-size.test.ts`, which is the deliberate act that
gate requires alongside this citation. Not one line of explanation was deleted to reach 422.

**2026-08-20 — and moved back 1 → 0.** Phase 9 moved steps 5–8 whole into `src/sim/playerMotion.ts`,
numbered comments and all, leaving one-line markers at the call site so `tick.ts` still reads as
fourteen steps in order. That is the seam the two candidates above did not offer: it contradicts no
decision written into the file, because the block carries its own numbering with it and nothing was
renumbered, lettered or inserted. Nothing was deleted to get there either.

⚠️ **No line count is quoted in any of the three sentences above, and that is deliberate.** The first
version of this note said 396 while `wc -l` said 395, and a later fix in the same phase moved the file
again. With the `SIZE-EXEMPTION` citation gone there is nothing left to gate such a number, and
`file-size.test.ts`'s own docstring is the authority on what that means: *"a hardcoded line count in a
comment is a fact with an expiry date and no test"*. The ratchet is the gate; the count is decoration
that had already been wrong twice in three days.

---

## Decisions and deliberate non-fixes

| | Decision | Why |
|---|---|---|
| **Tick contract** | Step 9d's **meaning** widened; nothing renumbered, inserted or lettered. | `tick.ts`'s header guarantees the numbering and the ordering. 9d already owned "the exit", and an exit you walk into for twenty ticks is still the exit. Codex's plan review was asked directly and ruled it not a substantive violation — the obligation is that the header text describe the widened semantics accurately, which it now does. |
| **Auto-run dead zone** | `dir` is 0 within one tick's travel of the centre. | Without it a 9 px/tick body oscillates around the centre forever. |
| **The foot-slide it costs** | For the last few ticks a fast entry plays `run` while standing still. **Accepted, not hidden.** | Alpha is ≤ 0.25 by then and the character is inside a dark opening. `ponytail:`-commented at the branch with its upgrade path (a decel ramp) named. |
| **`run`'s stride** | **Not retuned.** | It is documented as provisional and distrusted. If it reads wrong at gate scale that is *reported* — retuning it is a separate decision with its own foot-plant gate. |
| **`window.__game`** | No 9th field. | Closed at 8 by a Phase 1 Codex ruling. The e2e spec measures the sprite instead — what Phase 2 did when it wanted two fields it could not have. |
| **`level-goal-fits.test.ts`** | Kept, though Codex called it future-proofing. | It is the only guard against the exact-vertical-equality brittleness Codex itself confirmed. The failure it prevents makes a level unwinnable; the test is ten lines. |

---

## Open, for the owner

🔴 **The art-spend ceiling is recorded twice and the two disagree.** `PRD.md`'s Global
Constraints say **$50** (raised from $25 on 2026-08-16). `GENERATION-LOG.md` says
*"Running total after Phase 6: $47.61 of the **$55** ceiling."* This session's $0.15–$0.30 fits
under either reading, so it proceeds and names the contradiction rather than quietly picking a
winner. **Which number is current is the owner's call.**
