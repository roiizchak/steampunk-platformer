[← gate-entry session log index](phase-08-gate-entry.md) · [QA-LOG index](../QA-LOG.md)

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

