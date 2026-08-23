# Session: the branch cleanup, a recovered QA brief, and the Tier-5 tranche

**2026-08-23, on `main` after the tiers session merged.** No phase. The user played the game, found
it good, and asked for two things: check whether the stale GitHub branches are still needed, and
continue the plan.

Both were done. The branch half turned up work nobody had lost on purpose.

---

## 1. The branch audit, and the thing it was hiding

| | found | done |
|---|---|---|
| `origin/main` | **49 commits behind** — the whole bug-fix session had never been pushed | pushed |
| remote branches | `phase-08-levels`, `phase-09-polish`, `session-gate-art-and-entry`, all fully merged into `main` | deleted, owner-approved |
| local phase branches | 8, all merged | kept — they are the phase record |
| `worktree-agent-*` | 23 branches, 18 worktrees on disk, **5.5 GB**, all merged, all clean but one | removed, owner-approved |

### ⚠️ `git worktree remove --force` deleted the real `node_modules`

Agent worktrees are created **without** `node_modules`, so every agent that needed to run a test made
a **junction** to the root one. `worktree remove` deletes *through* a junction rather than unlinking
it, so removing 18 worktrees emptied the root `node_modules` and `tsc` stopped existing.

Nothing was lost — `npm ci` restores it exactly and the lockfile pins `phaser@4.2.1`, verified — but
it reads like a broken checkout. Recorded in `CLAUDE.md §1` beside the existing `test:sim-isolated`
recovery note.

### The dirty worktree was a QA deliverable nobody copied out

One of the 18 had an untracked `gate-qa-expert-A.md`: a **Phase 9 `qa-expert` brief**, written
2026-08-21, 209 lines, never applied. That is a *(C11)* violation with a mechanical cause worth
naming — **a worktree agent's deliverable is not in the repository unless somebody copies it out**,
and nothing in the dispatch checked.

It is worth more than its findings. `phase-09-polish.md`'s **9.4** and **9.7** rows both read
*"findings closed in the fix round, **not re-run against the fix**"*. **This report is that re-run**,
against the fix, and it passes both — with a red proof executed in both directions and all 24 of
9.7's thresholds tabulated against vault 9.2's four parts. Preserved as
`phase-09-polish-qa-expert-brief-a.md`; both rows now cite it.

Of F1–F9: five had been fixed independently, two are informational, two were open.

**F8 applied.** `effects-draw-path.test.ts` red-proves itself by editing `gameEffects.ts` — which is
not the test file but **is** its `?raw` glob fixture. Vitest caches those; this project has already
lost a `.tmj` mutation to it. The warning is now above the glob.

**F6 applied, and the finding was wrong about its own consequence.** Measured rather than accepted:

| | `effects.test.ts` |
|---|---|
| `maxFallSpeed: 51.6 → 40.0`, hard-coded copy in place | **30 passed / 0 failed** |
| the same mutation, after importing `DEFAULT_TUNING.maxFallSpeed` | **31 passed / 0 failed** |

The prescribed fix — *"one import closes it"* — closes nothing, because `landingDust`'s `maxFall`
only **clamps** and the ramp saturates by `fall = 18`; every ramp literal is an absolute vy far below
it. Shipping that import with a note claiming it fixed something is worse than the duplication,
because it retires the question.

**What was actually open** is the invariant the copy was hiding: the clamp must stay *above* the
ramp's saturation point, or the absolute-vy literals start measuring the clamp instead of the ramp.
A gate now asserts it, with the saturation point derived from the shipped function. Watched red at
`maxFallSpeed: 15.0`.

---

## 2. The Tier-5 tranche

### Fixed, each watched red on the mutation its own claim names

| item | what was wrong | evidence |
|---|---|---|
| **5.11** | `resolveCollisions` derived its HORIZONTAL offsets through `toWorld` and its vertical ones not at all — bare `player.y` as the body's bottom. Correct only because `PLAYER_BOX.y === 0`, and **unreachable from a test** because the box was read from module scope. | Identical output today (2365 before and after). New gate reds on `player.y = solid.y`; the ceiling half reds separately. **Under that mutation the entire rest of the suite is PASS (2365) FAIL (0)** — nothing else could see it. |
| **5.15** | The centroid was rounded to 3 dp before an **exact** `Math.round` comparison — a false-red envelope on correct art. | Closest shipped frame (`jump` 4) sits **0.0208** from a boundary against a **0.0003** injected error: latent, 69× headroom. Fixed at source; margin gate reds at bound 0.05. **Confirmed against a real regeneration** — all three lift profiles rebuilt, only `sourceCentroidY` moved, every `liftPx` byte-identical, no sheet PNG changed. |
| **4.6** | `GymScene.loadConfig` did `this.edits = result.edits`, discarding anything typed while the fetch was in flight — and `refresh()` then drew the file's value, so the loss was invisible on the one screen whose job is measuring by eye. | `mergeEdits`, pending wins per action. Red on inverted precedence. The recorded fix was to make the loss *loud*; this makes it impossible. |
| **5.25** | The **named** pair (`motion` ↔ `motionCombat`) was already fixed. Measured across all 55 modules, **two other cycles were live**: `gates` ↔ `gatesBrassCap` and `sheets` ↔ `sheetsPack`. | Both closed by moving the shared primitive to a leaf (`gateVerdict.mjs`, `figureMetrics.mjs`). Detector added, carrying its own synthetic counter-fixture. |
| **5.12** | The Element Editor's *"overlay for every solid"* e2e matched on `w`/`h` alone, so one correctly-sized rectangle satisfied every solid. | Matched on position too, matches consumed. **The discriminating mutation took two attempts** — `slice(0,1)` reds the old assertion too and proves nothing; one strip per distinct *size* leaves the old assertion **passing** and reds the new one by name. |
| **sentry** | `brass-sentry/idle` fails its own loop gate and has since generation — because **`npm run assets:build` with no slug builds only the courier**, so the sentry's gates run only if someone types the slug. | All-slug unit gate over the real `gateLoopWrap` (7 looping sheets, one failure, at the recorded 0.01371). `assets:build:all` deriving slugs from `slugConfig.SLUGS`. |

### The pattern: four items were wrong about themselves, all in the safe direction

| item | the claim | measured |
|---|---|---|
| **5.19** | *"`goal-completion.test.ts` gates it from BOTH directions"* | Only the first. **But the second is real** and spread across three other files — `goal: null` reds **67** tests, the `worldOptionsFor` drop reds one, `containedInGoal`'s strict edge reds **49**. The citation was wrong, not the coverage. |
| **5.6** | *"No gate could see that, **and none can now**"* | One sentence before naming the gate that does. The strobe is a **sim** fact and is gated at 40 ticks; verified red with `ENEMY_DEAD_ZONE = 0`. The blind layer was the drawn one, covered from the other side. |
| **5.8** | *"the one-component check … still is not enough"* | True, and the same comment names the gate that IS enough — `shipped-gate.test.ts`'s *"is mostly opaque overall — not a frame with a transparent hole"* is exactly the ring case. |
| **5.18** | *"a residual hole that reopens whenever the ratchet is above 0"* | Correct and **currently shut** — the ratchet is at 0, proven live when two of this session's own files tripped it. |

⚠️ **A purpose-built end-to-end gate was written for 5.19, watched red on all three mutations, and
then DELETED.** Every mutation it named was already caught. A redundant gate is worse than none: it
implies the coverage elsewhere is thinner than it is, and it is one more thing to keep true. What
shipped is the corrected citation, as a table naming which file holds which direction.

**The lesson, on its fourth instance today:** a sentence claiming something is uncheckable is how a
checkable thing stays unchecked — and a sentence claiming coverage is exactly what should not be
taken on trust. All four were settled by running the mutation instead of reading the claim.

### 400-line splits this session forced

4.6's comments took `gymBounds.ts` 368 → 402 and `GymScene.ts` **exactly 400** → 405. Split rather
than trimmed, per the size gate's own message:

- **`src/render/gymEdits.ts`** — the edit model and save payload. `gymBounds` MEASURES a sheet; this
  describes what a person CHANGED about one. 402 → 258.
- **`src/scenes/gymKeys.ts`** — the key map, byte-for-byte, behind a `GymActions` record. The seam
  `GameScene` already uses. 405 → 398.

⚠️ **`GymScene.ts` sitting at exactly 400 is why this surfaced**: it had no room for any edit at all.

### ⚠️ A commit message claimed a count I had not read

`fix(4.6)` says *"PASS (2390) FAIL (0)"*. The suite was at **2388 / 2** — `file-size.test.ts` was red
from the two files above. Corrected in the following commit's message rather than rewritten, because
the record of the mistake is worth more than a tidy history. **This is the rule the project already
has** — *detect greenness positively, including the count* — broken in the one place it is easiest
to break: a message written before the run.

---

## 3. NOT reached, named individually

**Recorded as deliberate non-fixes** (the bound is the deliverable): **5.10** full soft-lock coverage
is a search problem · **5.24** determinism holds for a fixed toolchain only.

**Still open, not reached this session:** **5.2** (GPU-ratio flake — characterised, load-sensitive,
1-in-4, not fixed) · **5.3** (Codex's cost-model algebra accepted, never applied) · **5.4** · **5.5**
(G5 blind to the contact frame) · **5.7** (the art blind spots, by-eye by nature) · **5.9** · **5.16**
(two conflicting hazard-width figures) · **5.17** (no e2e took the frozen-clip job) · **5.20** (no
gate for spacing BETWEEN HUD elements) · **5.21** · **5.26**'s remaining half · **4.5**'s optional
scripts · the three remaining `ENGINE-NOTES` hazards.

**Owed with a cost:** `brass-sentry/idle`'s re-shoot. Held as a **pinned waiver** at its measured
0.01371 with 0.00009 of headroom — visible, unable to worsen silently, and **deleted rather than
relaxed** when the re-shoot lands. `idle` is the sheet the slug's `scale` derives from, so it moves
every number in `character-bounds-brass-sentry.json`.

**Play-owned, the user's:** 2.2's by-eye judder reading · the 240 Hz probe · the sentry-coverage
question · 3.3's spark colour · the UI readings at 852×480.
