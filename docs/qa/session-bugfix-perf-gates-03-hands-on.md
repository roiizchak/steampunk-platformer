# Session `session-bugfix-perf-gates` — the hands-on pass *(criterion S.10, vault C4)*

**This is the criterion no agent could run.** Both adversarial briefs said so in their own blind-spot
sections: everything they checked was sim, data or harness level, and **neither opened a browser**.
Phase 8 is the standing proof of why that matters — five green gates passed straight through a frozen
character, because every one of them measured the sim and none of them measured the *game*.

## How it was played

`playwright-cli`, headed Chrome, against `npm run dev` on `:5173`. Every input is a **real
`page.keyboard` event through CDP** — the same path a hand on a keyboard takes, not a synthetic
`KeyboardEvent` dispatched at `window` and not a call into the sim. The policy loop is node-side and
reads `window.__phaserGame`'s live world between presses; it decides *when* to press, it never moves
anything.

⚠️ **The jump trigger has to match the oracle's, and the first run proved it.** The driver's first
version looked **180 px** ahead of the leading edge, jumped that far early, and put the player into
level-03's valley spikes at `x 6654, y 1850` — 26 px inside the hazard. That is not a level defect:
`levelAutoPlay.ts`'s `LOOK_AHEAD_PX` is **16** on purpose, and its docstring already says why — *"the
obstacle's own left edge is the LATEST honest moment to jump"*, and jumping early spends run-up that
the crossing needs. Re-run at 16 px, the same crossing is clean. **Recorded because the failure looked
exactly like a bug in the level and was a bug in the driver** *(vault C4's other half: a hands-on run
can produce a false red as easily as a gate can)*.

---

## Bug 1 — the scavenger stops at a wall, and recovers

**Level-02, the second scavenger** (patrol `7296–7584`, floor `y 1920`) against the block at
`x 7872 … 8064`, top `y 1632`. Chosen after a live sweep of all five levels for a scavenger whose
**chase** reaches a wall face before it reaches a ledge — which most of them do not.

> 🔴 The first attempt used level-02's *first* scavenger and proved nothing. It stopped dead at
> `x 3587.5`, which looks like a wall stop and is not: the floor strip ends at `x 3648`, and
> `3587.5 + 60 = 3647.5`. That was the **pre-existing ledge veto**, firing before the wall ever came
> into play. A veto test staged where the old veto fires first cannot tell the two apart.

Staged by climbing onto the block and standing on top of it, so the scavenger is chasing a player it
can see and cannot reach — the exact framing in the reported video.

| observation | reading |
|---|---|
| scavenger x, held for 6 s | **`7808.5`, constant to the last decimal** |
| wall's left face | `7872` |
| body half-width | `60` → the last legal centre is `7812` |
| `chasing` | `true` throughout — it never gave up |
| `moving` | `false` throughout — the readback the unit gates assert |
| oscillation | **none.** `x` did not move by one unit in ~360 ticks |

It stopped one 6 px chase step short of `7812`: the step to `7808.5` was allowed, the next would have
entered the wall and was vetoed. **That is the veto doing exactly the arithmetic it claims to.**

**Recovery *(S.4)*, and it is not decoration.** With the wall between us the scavenger stayed pinned
for a further 5 s. The moment the player jumped the wall westward and cleared it — `px 7639` — the
scavenger **turned (`facing -1`) and moved in the same tick window**, tracking from `7808.5` down to
`7166.5` and eventually landing a hit. After the player died it **released and resumed its beat**
(`chasing:false`, `moving:true`, walking `7316 → 7466`).

So: pinned by geometry, never trapped by state.

### ⚠️ The pin is permanent while the player stays visible — and that is by design, not a regression

With the player standing at `px 8610` — **851 px away, well outside `detectRadius` 480** — the
scavenger stayed `chasing:true` at the wall indefinitely. That is `stepScavenger`'s stated contract:

> *"Permanent: nothing here can clear the flag. `stepEnemies` clears it on death, and that is the only
> exit."*

`enemy-ai.test.ts`'s "never gives up" pins it. It predates this session and the wall veto does not
change it — the same standing-and-staring happens at a **ledge** today. Recorded here because the veto
is what makes it *visible*, and because it is the honest answer to "why doesn't it wander off":
**it is not supposed to.** Whether permanent aggro is the right design is a balance question for a
later phase, not a bug this session introduced. It stays on the backlog beside its neighbour
(*`releaseAggro` leaves `attackCounter` set; aggro survives the player's death*).

### The patrol span, watched rather than asserted

Level-01's scavenger was observed through **three full laps over ~30 s**. It turned at `8544` and at
`7488` — `patrolMax` and `patrolMin` **exactly**, `minSx` reading `7488.0`. S.3's "no authored beat was
shortened" is a unit assertion; this is the same claim watched running.

---

## Bug 2 — every sentry, every level

A live audit of all **10 shipped sentries across all 5 levels**, computed from the world the game
actually built — *after* the spawn drop, not from the `.tmj` bytes the unit sweep reads. A genuinely
different observation point: the unit gate reads the file, this reads the running game.

| level | sentries | hazards on a body | gears inside a body | stands on solid | nearest gear's X clearance |
|---|---|---|---|---|---|
| 01 | 1 | 0 | 0 | yes | 204 px |
| 02 | 1 | 0 | 0 | yes | 396 px |
| 03 | 2 | 0 | 0 | yes | 204 px each |
| 04 | 2 | 0 | 0 | yes | 204 px each |
| 05 | 3 | 0 | 0 | yes | 204 px each |

**Nothing is near a boundary.** The tightest clearance anywhere is 204 px against a 72 px gear body.

Visually confirmed: `docs/evidence/session-bugfix/level-03-sentry-clean-ground.png` shows the sentry on
clean brick, the summit spike run clearly to its **right** and separated, and the gear floating in the
open to its **left** — collectable without touching the sentry. That is the reported bug, gone, on
screen.

---

## Bug 3 — the spiked low ground, crossed

`docs/evidence/session-bugfix/level-03-spiked-valley.png` is the picture of what was asked for: the low
ground between two raised masses is a **continuous run of spikes**, so the crossing is a jump and not a
walk.

**The two crossings the qa-expert's adversarial brief specifically asked for** — level-03's and
level-04's mass-to-mass jumps — were played by hand:

| level | valley | result |
|---|---|---|
| 03 | `6240 … 6720`, 480 px | crossed at **100 hp**, apex `y 1101`, landed on the far mass at `x 6695` |
| 04 | `6048 … 6528`, 480 px | crossed at **100 hp**, `hits: 0` |

Then all five levels end to end, one run each, real keys:

| level | completed | deaths | min hp | gears | **spike hits** | other hits |
|---|---|---|---|---|---|---|
| 01 | ✅ | 0 | 65 | 7 | **0** | 3 |
| 02 | ✅ | 0 | 85 | 8 | **0** | 1 |
| 03 | ✅ | 0 | 90 | 7 | **0** | 1 |
| 04 | ✅ | 0 | 70 | 8 | **0** | 2 |
| 05 | ✅ | 0 | 100 | 9 | **0** | 0 |

**Zero hazard contacts across five complete playthroughs.** Every hit was classified at the moment it
landed by testing the player's feet against every hazard rect; all of them were combat — sentry
projectiles and scavenger swings — and none was a spike. Level-05 finished untouched.

This is the claim `level-hazard-free.test.ts` makes, watched happening in the drawn game.

---

## What this pass did NOT cover *(vault 9.3)*

- **One run per level, one route.** The driver holds Right; it never backtracks, never fights, never
  explores a branch. A hazard reachable only off the main line is unvisited.
- **The wall veto was proved at one wall.** Level-02's second scavenger is the only one staged against
  a wall face; the other eight were watched patrolling, not blocked. The shipped-level sweep in
  `enemy-wall-collision.test.ts` covers the rest, and it is a unit assertion.
- **No `moving` → animation check.** `moving:false` was read off the sim. Whether the *sprite* holds an
  idle pose while pinned was not verified frame by frame — `enemy-view.test.ts` owns that.
- **Sentry projectiles still pass through solids** (existing backlog item). Two of the eight combat
  hits above are consistent with it. Out of scope, unchanged, still recorded.
- **The permanent-aggro pin** is recorded above, not fixed.
