[← HANDOFF.md index](../HANDOFF.md)

# Superseded — the gate-art + gate-entry session (Phase 8). **Superseded by the section above.**

> ## ✅ Every criterion is green. **STOP for the owner's approval before merging.**
>
> All nine gates pass, both Codex reviews ran and every finding from both is applied or recorded, the
> gate owners ran twice each in isolated worktrees, and the whole thing has been played by hand.
> Nothing is merged and nothing should be until the owner says so.
>
> Full record: [qa/phase-08-gate-entry.md](../qa/phase-08-gate-entry.md) ·
> [plan review](../reviews/session-gate-art-and-entry-plan.md) ·
> [implementation review](../reviews/session-gate-art-and-entry-impl.md) ·
> [generations/session-gate.md](../generations/session-gate.md) ·
> [evidence/gate-entry/](../evidence/gate-entry/)
>
> **The Codex implementation review returned BLOCK**, on two high-severity defects that six agent
> briefs and a five-level hands-on pass had all read past. Both were confirmed by driving the sim,
> both are fixed, and the story of fixing the first one is the most useful thing in this session:
>
> | | |
> |---|---|
> | **The jump is not locked on the arming tick** | `entryLocked` is cached before step 1 and 9d arms at the end of the tick. **Three attempts.** A position test at step 7 was useless — step 7 runs before the body is integrated, so it reads the previous position. Refusing to arm off the ground worked and took `level-completable` red on four seeds, because the auto-player jumps where the floor ends just past every exit. What shipped freezes the COUNTER while airborne: the run-in still arms mid-hop and still steers the body in, but the fade measures walking in, and you do not walk through air. |
> | **The ceiling was a blink, not a release** | It wrote `null` and the arm branch re-armed on the very next tick — **3 free ticks in 120** against a blocked doorway. The test passed because it measured the longest single armed span, which stays under the ceiling *because the ceiling works*. Now a latch, cleared only when the body leaves the rect: 120 in 120. |
>
> **Settled along the way:** G.7b measured on a real RTX 4080 (**0.0009–0.0065 ms of GPU per exit per
> frame**, plus a linearity check at two amplifications after Codex objected that marginal cost is not
> total cost) · the art-spend ceiling reconciled at **$55** · the gate rebuilt at **288 × 432** after
> the owner saw it was the same height as the character.

## What shipped

Branch `session-gate-art-and-entry`, off `main` at `3affbf8`.

**The exit is art.** One `fal-ai/nano-banana-pro` generation, two takes, **$0.30** — a Victorian
brass-arched doorway with gauges down its jambs and an opaque near-black opening, shipped at
192 × 288 as the `goal-gate` texture. `drawGoal`'s image branch, written dead in Phase 8, is now the
branch that runs.

**You enter the exit, you no longer brush it.** Completion changed from AABB overlap to a scripted
**20-tick run-in** at step 9d that completes only on **full containment**, with input locked, the
`run` animation forced, and the courier fading to alpha 0 as a **render decision** driven by a
sim-owned integer tick counter. No tween, no clock, no millisecond anywhere in `src/sim/`.

Step 9d's **meaning widened in place**; nothing was renumbered, inserted or lettered. Codex ruled on
that at plan review and `tick.ts`'s header states it.

## The traps this session paid for — read these before touching the same ground

1. **🔴 Never run mutation verification in a tree background agents can write to.** Six gate-owner
   agents ran concurrently in the primary working tree. Their briefs banned modifying files; at
   least one did anyway and did not restore. Two mutated lines — the fade deleted, the containment
   check dropped — were **committed as if they were the implementation**, and they were invisible
   because they were the same two mutations this session's own red proofs use. A ban in a brief is
   not an enforcement mechanism. The re-run used `isolation: worktree` and nothing leaked.
2. **Never chain a commit after a test run with `&&`.** The same commit captured a test RED.
3. **`git diff --quiet` after a `cp` proves the state at that instant and nothing about the next
   one.** Two restores did not hold; a third file turned up in a state nobody had written.
4. **Vitest serves an already-transformed test file a CACHED `import.meta.glob('?raw')` fixture.** A
   `.tmj` mutation that had definitely landed — `cmp` confirmed, the script read the bytes back —
   reported **green**. When a red proof mutates DATA rather than source, touch the test file and its
   fixture module before re-running, or the green is fake and looks exactly like a gate that cannot
   go red.
5. **`playwright-cli` cannot platform this game.** Every command is a round trip while the game runs
   on real time in between, so a stall-triggered jump fires tens of pixels late and the courier dies
   in level 01's pit every time. `levelDriver.ts` works because it runs the whole driver **inside the
   page**, sampling once per animation frame. For a hands-on look at something deep in a level, place
   the body with an instrumented probe and let the sim run untouched from there — and say that is
   what you did.
6. **The levels are LOCKED.** `resolveEntryLevel` silently hands back `order[0]` for a level the save
   has not unlocked, so an e2e asking for `level-02` gets `level-01` and times out looking like a
   bug. Seed `steampunk.progress` with `unlockAll()` the way the perf suite does.

## Three defects found by DRIVING the code, not by reading it

Six briefs, a Codex plan review and a five-level hands-on pass all read past the first two.

| | What was wrong |
|---|---|
| **A real hit at the door left the courier invisible OUTSIDE it** | The one thing the feature exists to prevent, in the paragraph that promised it could not happen. The cancel needed 162 px of travel; a knockback delivers 17.5 px/tick against an auto-run pulling back. Driven: the shove moved the player **25.9 px**, the cancel never fired, the counter ran to **25**, and the sprite drew at alpha 0 for **five ticks** while straddling the gate's edge. Now cancels on `hurt`. |
| **An armed run-in had no termination guarantee** | Overlapping but never containable satisfies neither half of the completion AND. One solid in the doorway, 4000 ticks: `counter=3938`, alive, grounded, invisible, no input, no jump, no attack — waiting to be killed was the only exit. Latent on shipped data; nothing stopped the next level. Now cancels above twice the window. |
| **The counter FLICKERED through hitstun** | The cancel learned about `hurt`; the arm branch did not. `null / 0 / null / 0` for the whole window. **Nothing looked wrong on screen** — a counter of 0 draws at alpha 1 exactly as `null` does — so no alpha assertion could have seen it. Found by watching the counter in the running game. It made `entryLocked` true on alternating ticks, so the auto-run fought the knockback and hitstun was half-applied. |

Eleven further gates asserted less than their names claimed and are now tighter, each watched red
under the mutation that motivated it — including a fade window whose **length** nothing pinned
(20 → 40 left the whole suite green), a `run` override evaluated at **one tick** of twenty, and an
art gate that passed a **64 px slit** and a **barcode**.

## And two the OWNER found, by looking

Both were invisible to every machine gate in the suite, and both were found from a screenshot.

| | |
|---|---|
| **The gate was the same height as the character** | The rect is 192 x 288 and the courier's box is 132 x 288, so the doorway stood exactly as tall as the person walking through it — a hatch, not a portal. Nothing caught it because every assertion compared the drawing to the **rect**, and against the rect it was perfect. No test said the door had to be bigger than the character, because nobody had thought to say it. |
| **The first frame-budget statistic was noise** | Its own first version compared *drawn* to *hidden* and reported a 1.5x main-thread ratio — which was the 0.1 ms clock quantum — and a GPU arm claiming that drawing an extra image made the frame 40 % **faster**. Replaced, not re-bounded. |

## Verification at the tip

| | |
|---|---|
| `npm run typecheck` | clean |
| `npm test` | **116 files / 1944 tests**, 0 failed |
| `npm run test:sim-isolated` | same count with Phaser uninstalled |
| `npm run test:e2e` | **114 passed**, including G.7b on a real GPU |
| `npm run build` | `verify-dist` ok — 5 levels and 11 audio files byte-identical, no dev-only key in the bundle |

`src/sim/tick.ts` is the one file over 400 lines (**428**), cited in
[qa/phase-08-gate-entry.md](../qa/phase-08-gate-entry.md). `tests/unit/goal-entry.test.ts` crossed the
limit too and **split by subject** rather than taking a second exemption.

Dev servers killed by port *(C13)*.


---

