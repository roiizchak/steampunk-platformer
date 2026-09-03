[← bug-fix session log index](session-bugfix-tiers.md) · [QA-LOG index](../QA-LOG.md)


## 2.2 — the courier fall re-shoot: PAID, MEASURED, **NOT ADOPTED**

**Status: still OPEN.** $1.19 spent, one take, rejected on measurement. `fall-r2.mp4` still ships,
byte-identical.

### What was shot

The re-shoot applied **both** levers that made `jump-r4` the first jump clip in this project's
history to pass G6: the square padded courier anchor, and the `UPRIGHT_IN_AIR` size clause (*"He is
the SAME SIZE in the frame as he is in the reference image … There is a clear band of plain green
above his head, below his boots, and to his left and right"*). `fall`'s anchor record already
carried the padded canvas; the prompt already carried the clause.

`request_id` `01a02e75-f146-77e0-bbb6-78723778be42`, seed unset, 4 s, 1:1, 720p.

### It passed every gate the project has, and is worse

| | spread | worst adjacent step | per-frame heights |
|---|---|---|---|
| **`fall-r2`** (shipped) | 74 px | **22 px** | 277 263 246 224 206 203 206 218 232 |
| `fall-r3` (re-shoot) | **68 px** | **30 px** | 288 275 258 245 244 254 271 **250 220** |

G6 edge-bleed: pass. Motion floor: pass, 0.075 against a floor of 0.002. Adjacent distinctness:
pass, closest pair 0.026 against a floor of 0.0004. Loop wrap: n/a, one-shot. Nine frames extracted
cleanly from motion onset.

**And it is worse where it counts.** `fall-r2`'s heights fall smoothly to a minimum and rise back —
one tuck, one extension, which is what a fall *is*. `fall-r3` reaches 271 and then drops twice
(250, 220), a direction change in the last two frames, with a worst step of 30 px against r2's 22.

⚠️ **The re-shoot improved the number the inventory recorded and made the number that matters
worse.** 2.2 is written down as *"a 74 px frame-to-frame height spread"*. Spread went 74 → 68. A
reader taking the inventory at its word would have adopted this clip.

### The statistic problem, and the gate I built and then deleted

*(vault C2)*: **a statistic that does not order its own mutation cannot be fixed by moving the bound
— replace the statistic.** Spread does not order it, as above. So a replacement was written —
`gateHeightTrail.mjs`, measuring the worst adjacent height step as a fraction of the tallest frame,
plus the number of direction reversals — on the theory that judder is a *lurch*, not a *range*.

**Measured across all eight shipped courier clips, and it refutes itself:**

| clip | worst step | reversals |
|---|---|---|
| `idle` | 1 px (0.3 %) | 2 |
| `walk` | 3 px (1.0 %) | 3 |
| `run` | 18 px (6.5 %) | 6 |
| `jump` | **66 px (25.0 %)** | 2 |
| `fall` | 22 px (7.9 %) | **1** |
| `hurt` | 32 px (11.1 %) | 1 |
| `attack` | 5 px (1.7 %) | 1 |
| `death` | **60 px (20.8 %)** | 2 |

`jump` — the clip this session re-shot *successfully*, the first ever to pass G6 — has the **largest**
step of all eight, because a jump crouches and extends and that is the animation. `death` is second,
because a body collapsing is supposed to change height by 224 px. And `fall`, the clip that has been
called juddery since Phase 4, has the **fewest reversals of any clip in the set**.

So the second statistic does not order the defect either. **The gate was deleted rather than
shipped**, because a gate that flags six of eight good clips is decoration that gets disabled within
a session — and shipping it would have been the same mistake as keeping spread, one layer along.

### What is actually owed

**A by-eye reading, and nothing else will do yet.** Two independent numeric proxies have now failed
to separate `fall` from seven clips nobody complains about. That is evidence that the defect is not
in the height envelope at all — it is more likely *pose* judder (the figure's limbs hunting between
frames) than *silhouette* judder, and pose distance is what `gateAdjacentDistinct` already measures,
where `fall` passes comfortably.

Owed, and on the S.9 list:

1. Watch `fall` frame by frame at full size and say **what** is juddering — the whole silhouette, the
   legs, or the arms.
2. Only then decide whether a third statistic is worth writing.

Both takes are kept on disk. `fall-r3.mp4` is in `SUPERSEDED_CLIPS` — paid, non-regenerable input,
superseded but never deleted, so the next attempt can compare against it rather than re-buy it.

### Spend

$1.19. Running total **$51.48 of $55**, **$3.52 remaining**.

---

## 3.10 — `brass-sentry/fire`'s absent discharge: **NOT SHOT. Blocked on an owner ruling.**

**Status: OPEN, and deliberately unspent.** $1.19 was authorised and **not used**. Running total
stays **$51.48 of $55**.

### Why the money stopped

`fire` is already the most re-shot clip in the project — four superseded rounds. The recorded
diagnosis of 3.10 is that *"the margin constraint was met by the model largely not firing"*: the
discharge is nearly absent because the prompt told it to be.

That constraint is `DISCHARGE_MARGIN` (`motionClauses.mjs:107`):

> *The muzzle flash and the smoke are SMALL and CONTAINED: the flash reaches no further from the
> muzzle than the length of the barrel itself, and the smoke stays a thin wisp close to the muzzle.
> Neither the flash nor the smoke ever reaches any edge of the frame…*

It is the **only lever left**. `-r5` already tested the other one — a 4024² anchor at `--fill 0.35`,
single-variable against `-r4`'s 3130² — and **refuted it**: more padding did not move the discharge.
So a sixth take that changes neither variable is a repeat of a round already paid for, and the
project's own rule is *"budget from the invoice, not the estimate"*.

### And relaxing it reverses a recorded owner decision

`motionClauses.mjs:101` states it plainly:

> 🔴 **The user's decision was to constrain the effect rather than teach the gate** — so no threshold
> in `edgeGate.mjs` moved and `DEFAULT_MIN_ALPHA` stays 255.

Changing `DISCHARGE_MARGIN` is exactly the thing that ruling forbids, and CLAUDE.md makes reversing a
design ruling a STOP-and-ask. **So it was not done, and the shot was not taken.**

### ⚠️ But the ruling's premise has already expired, and that is the finding

`edgeExceptions.mjs:61` now carries:

```js
'brass-sentry/fire': { file: 'brass-sentry-fire-r4.mp4', edges: ['right'],
  reason: 'the muzzle discharge leaves the frame. The turret is complete … Confirmed by eye at full
           resolution, and re-shot once from a larger padded anchor (-r5) which did not move it.' }
```

**That is teaching the gate.** A later session added an `ACCEPTED_EDGE_BLEED` entry permitting the
discharge to cross the right edge — the exact outcome *"constrain the effect rather than teach the
gate"* was chosen to avoid. The two decisions now sit in the tree contradicting each other:

| | says |
|---|---|
| `motionClauses.ts` `DISCHARGE_MARGIN` | the flash must **never** reach any edge |
| `edgeExceptions.mjs` `ACCEPTED_EDGE_BLEED` | the flash reaching the right edge is **accepted, by eye** |

So the constraint is suppressing the discharge **and buying nothing**: the gate it was written to
satisfy no longer objects. That is a Tier-4-class contradiction — prose against code — living in the
one place it costs real money.

### The options, for the owner

1. **Relax `DISCHARGE_MARGIN` and re-shoot once (~$1.19, leaves $2.33).** The gate already accepts
   the bleed, so the clause's original purpose is served. Highest chance of actually fixing 3.10,
   and it needs the ruling reopened. *Recommended.*
2. **Delete the `ACCEPTED_EDGE_BLEED` entry instead**, restoring the original ruling, and accept that
   `fire` has a small discharge by design. Costs nothing; closes 3.10 as WONTFIX rather than open.
3. **Leave both.** Cheapest, and leaves a contradiction in the tree that the next art session will
   pay for again.

⚠️ **Either 1 or 2 removes the contradiction. Option 3 is the only one that does not**, which is why
it is listed last despite being the status quo.

### What was done without spending

Nothing in the tree changed for 3.10. The contradiction is recorded here and cross-referenced from
`motionClauses.mjs`, so the next reader finds a decision rather than a puzzle.

---

## 3.10 — RESOLVED. The discharge is back, and the waiver is gone

**Status: FIXED.** Owner reopened the ruling; `-r6` shot for $1.19. Running total **$52.67 of $55**.

### What changed, and it was one variable

`-r5` had already refuted the padding lever (a 4024² anchor at `--fill 0.35`, single-variable against
`-r4`'s 3130², **did not move the discharge**). So `DISCHARGE_MARGIN` was the only thing left, and
`-r6` changed it and nothing else.

| | old clause | new clause |
|---|---|---|
| flash size | *"no further from the muzzle than the length of the barrel"* | *"about TWICE the length of the barrel itself"* |
| edges | *"neither the flash nor the smoke ever reaches any edge"* | *"the flash and smoke may run off the right edge"* |
| the machine | (covered by the same sentence) | *"the MACHINE ITSELF never touches any edge"* |

Per STYLE.md §6 — **a named element beats a negation** — the flash was given a *size* rather than
permission. Deleting the containment would have left it unspecified, which is how it came back small
the first time. It is still measured against the **barrel**, the one part whose length the identity
clause commits to.

### Measured

| | turret alone | widest frame | discharge visible in |
|---|---|---|---|
| `-r4` | 206 px | 305 px | **1 of 6 frames** |
| `-r6` | 193 px | 294 px | **5 of 6 frames** |

`fire` plays over an 18-tick window, so a one-frame flash is a flicker and a five-frame one is a shot.

### ✅ And it satisfies BOTH rulings, which is the outcome worth having

`-r6` **passes G6 outright**. The `ACCEPTED_EDGE_BLEED` entry for `brass-sentry/fire` has been
**deleted** — nothing bleeds any more.

That is the contradiction resolved in the direction the *original* ruling wanted. Asking for a bigger
flash *by geometry* produced one that still fits the frame, where asking for a small one produced a
machine that barely fired. No gate threshold moved, no waiver is carried, and the effect is visible.
`edge-exceptions.test.ts` now asserts the **absence** of that waiver, so re-adding one is a
conversation rather than a commit.

### 🔴 The regression it caused, and the rule that caught it

Repacking at the inherited scale made the turret draw **23.4 % too small** — tripod base 157 px
against idle's 205. That is the exact defect the user reported twice: *"the stationary character, when
they play the K/O animation, it becomes smaller."*

**The cause is the fix.** A bigger muzzle flash inflates the silhouette without making the machine
bigger, so any scale derived from the silhouette shrinks the turret by however much the flash added.
`character-bounds-brass-sentry.json` already carried the rule — *"Re-derive from the tripod, never
from the silhouette, if either clip is ever re-shot"* — and this is its best demonstration yet.

Re-derived from the tripod: `0.44081578 × 205/157 = 0.57558748`. **Verified after repacking: idle 205,
fire 205, death 205.** `sprite-size-consistency.test.ts` is what caught it, and it named the cause in
its own failure message before anyone looked.

`fire` and `death` no longer share one scale. That is **correct, not a regression**: they shared it
because they were shot from the same padded anchor in the same round, and `fire` is now a different
round with a different discharge.

### Four readings re-taken

`clip-jobs` (`-r4` → `-r6`), `edge-exceptions` (acceptance → asserted absence), and the two
`motion-framing` wording gates. The second of those changed its **subject** rather than its strength:
it asserted *"margin stays visible on all four edges"*, which bound the flash as well as the machine —
and binding the flash is what made the sentry barely fire. It now holds the machine off every edge and
lets the discharge leave the right one.

### ⚠️ Found on the way, and NOT fixed: `brass-sentry/idle` fails its own loop gate

`⚠ idle 8 frames … FAIL — loop: wrap 0.01371 exceeds 0.01143 — it snaps.`

**Pre-existing** — reproduced with every change from this session stashed. It is not mine and it is
not new.

The reason nobody has seen it is worth more than the defect: **`npm run assets:build` with no slug
does not build the sentry at all.** It builds `brass-courier` only, so the sentry's gates run only
when someone types the slug by hand. A failing gate that the default command never runs is a gate
nobody reads.

Recorded, not fixed: `idle` is the sheet the whole slug's `scale` is derived from, so re-shooting it
moves every sentry number in the file — a piece of work, not a line change. **Owed.**

---

## 5.2 — the GPU-ratio gate flaked once in four, and here is the data

**Still OPEN and still unreconciled.** Not fixed here — but the final sweep produced the first
recorded observation of it failing, which is more than the item has ever had.

`phase-08-perf.spec.ts` → *"level-05 costs 4.47x level-01 on the GPU … Expected: <= 2"*.

| run | context | result |
|---|---|---|
| 1 | inside the full 128-test sweep (18.2 min, box busy) | **FAILED at 4.47×** |
| 2 | spec alone | passed |
| 3 | spec alone | passed |
| 4 | spec alone | passed |

**One in four, and the one was the loaded run.** That matches 5.2's recorded shape — *"~1 window in
10 reads 0.7–1.2 ms against a 0.14 ms baseline, on both arms"* — and sharpens it: the flake is
**load-sensitive**, so it is far likelier inside a full sweep than in the isolated re-runs anyone
reaches for when checking.

⚠️ **Not attributed to this session's changes, and the reason is structural rather than statistical.**
The only art this session touched is `brass-sentry/fire`'s sheet. This gate compares **level-05
against level-01 tile rasterisation**; a sentry's fire frames are neither, and the ratio is between
two levels whose tile counts did not move.

**It is not fixed because fixing it is 5.2's actual content**: the recorded repair shape is a
**paired** per-round delta with the arms kept separate until the effect clears the timer grid, which
is a rewrite of the measurement rather than a bound change. *(vault: a statistic that does not order
its own mutation cannot be fixed by moving the bound — and this is the second time this session that
sentence decided an outcome.)*

**Do not "fix" this by raising the 2× bound.** The bound is not the problem; an unpaired median per
arm is.
