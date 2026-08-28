# Session `hud-and-pits` — the third defect: *"I still get stuck by a hazard that I cannot see"*

Owner-reported, 2026-08-28, playing the built game. The third defect this session that **only
playing found** — after the two in `session-hud-and-pits.md`. It was reported once, a fix was
shipped, and the owner came back with *"okay, I still get stuck by a hazard that I cannot see"* — so
what follows is the second attempt, and the first one is recorded here too, because its failure is
what located the real rule.

## What it actually was

Not the art. The visible hazard tile shipped earlier the same morning (see
`session-hud-and-pits.md`) was a real fix for a real problem, and it did not touch this one.

A probe that walks right from spawn stops dead in **every** level against the first raised mass. In
levels 2, 3 and 5 the box it stops in **overlaps a spike run**:

```
BLOCKS level-02 end=col29.3 :: col 29.3 y 1920 hp 60
BLOCKS level-03 end=col27.3 :: col 27.3 y 1920 hp 80
BLOCKS level-05 end=col23.3 :: col 23.3 y 2016 hp 80
```

The whole cause is one comparison:

| | |
|---|---|
| gap those runs left to the wall face | **96 px** — one tile |
| player width, `PLAYER_BOX.w 22 × RENDER_SCALE 6` | **132 px** |

**A tile of floor is not a standing spot for a body wider than a tile.** Land a beat late and you
are pinned in the spikes with a wall in front of you, taking damage you cannot see *because you are
standing on it*. That is the owner's sentence, exactly, and it is geometry, not rendering.

Five sites, measured over the shipped bytes:

```
level-02  hazard cols 27-28    96px to the wall at cols 30-31   (right)
level-03  hazard cols 24-26    96px to the wall at cols 28-29   (right)
level-04  hazard cols 102-103  96px to the wall at cols 94-100  (left)
level-05  hazard cols 20-22    96px to the wall at cols 24-25   (right)
level-05  hazard cols 134-136  96px to the wall at cols 126-132 (left)
```

## 🔴 Why every existing gate was blind

| gate | why it could not see this |
|---|---|
| `level-hazard-free.test.ts` | proves each level is finishable **without touching a spike** — its auto-player jumps early, clears both the run and the wall, and never lands in the gap |
| `level-completable.test.ts` | its auto-player tanks the damage and finishes anyway |
| `level-pits.test.ts` | asks whether a **pit** is spiked, never whether a **floor** has room |
| `level-reach.test.ts` | ignores hazards outright |
| `level-traversal.test.ts` | reads a frozen retired level |

Five gates over the same rectangles and not one of them asks the question a player asks by standing
still. That is *(vault C4)* again — the third hands-on finding in one session against a suite of
2705 unit tests.

### Ruled out before ruling anything in

- **Every solid rect has painted tiles**, in all five levels. Checked, not assumed.
- **Every solid rect's drawn cells are 100 % opaque.** Measured per-gid: gid 13 (spikes) is 48 %
  and gids 5-8 (brackets) 48-57 %, but those are hazard and decoration — no *collision* rect is
  drawn with a transparent gid.

So the blocker was never an invisible wall. It was a visible wall with no room in front of it.

## The rule

> A floor-level hazard run leaves either **no gap at all** to the wall facing it, or **at least one
> player width** of clear floor.

Zero is deliberately legal and is **not** a loophole. Spikes flush against a wall, or filling a
valley floor between two masses, are places you were never meant to stand — four shipped runs are
exactly that shape, including the level-03 cols 65-69 pit this session deliberately kept spiked.
What is forbidden is the **almost**-gap: floor a player can land on and not fit in.

⚠️ **The bound is `PLAYER_BOX.w * RENDER_SCALE`, never a tile count.** A tile is 96 and the player
is 132, so a rule written in tiles would have called this defect legal. It is imported from the sim
rather than written down, so a change to either constant reaches the gate *(vault 5.3)*.

## Where it lives — one definition, two consumers *(vault 5.3)*

`tools/gen/hazardClearance.mjs` + `.d.mts`, the `pitDetect.mjs` / `anchorGate.mjs` shape:

- **`tests/unit/level-hazard-clearance.test.ts`** runs it over the **shipped bytes** through the
  real parser *(vault 3.1)*;
- **`tools/gen/make-levels.mjs`** runs it at generation time — `assertStandable()` re-reads the
  `.tmj` it just wrote and **throws**, so a bad layout cannot reach `public/` at all. The player
  width is parsed out of `src/sim/playerTuning.ts` and `src/game/constants.ts` at run time, never
  hardcoded in the generator.

A separate module from `pitDetect.mjs` on purpose: that one owns whether a *pit* has spikes, this
one whether a *floor* has room. Same rectangles, different question — and `pitDetect.mjs` is near
the 400-line rule.

## The fix, and the attempt that failed first

**Attempt 1 — shift every pinning run one column AWAY from the wall.** Correct for three of the five
sites, and shipped for them:

| level | run | → | result |
|---|---|---|---|
| 02 | 24-25, 27-28 | 23-24, 26-27 | both moved so they do not merge; gap becomes 192 px |
| 03 | 24-26 | 23-25 | gap becomes 192 px |
| 05 | 20-22 | 19-21 | gap becomes 192 px |

Widths are unchanged in every case, so the hazard ramp totals (672 / 768 / 864 / 960 / 1056 px) are
untouched — pinned by `tests/unit/level-hazard-ramp.test.ts`.

**It failed on the two LEFT-wall sites, in both directions.** level-04 cols 102-103 and level-05
cols 134-136 sit between a wall and a descent, and there is no legal column for the run:

```
shift RIGHT (103-104 / 135-137)   level-hazard-free: "the route cost 1 hit(s), the first at
                                  x 10018.71" / "x 13090.71"  <- that is where the descent LANDS,
                                  which is unavoidable damage at any gap width

shift LEFT  (101-102 / 133-135)   level-hazard-free: "was not finished in 12000 ticks with hazards
                                  avoided". Furthest x 10398 of 13824 / 13470 of 15360
                                  <- flush spikes with no shelf above them block the route outright
```

**Attempt 2 — move the WALL, leave the run where it is.** Both walls are ziggurat shelves, so
widening one by a single column closes the gap to zero without changing a step height or a jump
distance — and zero is the rule's other legal answer:

| level | shelf | → | run | gap |
|---|---|---|---|---|
| 04 | 94-100 @ row 16 | **94-101** | 102-103 (unmoved) | 96 → **0** |
| 05 | 126-132 @ row 17 | **126-133** | 134-136 (unmoved) | 96 → **0** |

The runs return to their original, shipped columns — the placements that already passed
`level-hazard-free` on `main` — and the flush spikes now have a shelf directly above them to jump
from. Both gates green. The reasoning is recorded beside each run **and** each shelf in
`tools/gen/levels/level-04.mjs` and `-05.mjs`, so the next person to move one finds out why first.

### Measured after the fix, all five levels

`L` and `R` are the pixel gaps to the nearest wall face on each side; `∞` means no wall to be pinned
against.

```
level-01 ground 20 | c24-25 L:∞ R:768 | c27-28 L:∞ R:480 | c42-44 L:576 R:288
level-02 ground 20 | c23-24 L:∞ R:480 | c26-27 L:∞ R:192 | c65-67 L:0   R:1344
level-03 ground 20 | c23-25 L:∞ R:192 | c65-69 L:0 R:0
level-04 ground 20 | c22-23 L:∞ R:192 | c63-67 L:0 R:1152 | c102-103 L:0 R:960
level-05 ground 21 | c19-21 L:∞ R:192 | c97-98 L:0 R:1248 | c100-101 L:288 R:960 | c134-136 L:0 R:864
```

Every floor run is now `0`, `∞`, or `≥ 192`. **No 96 px almost-gap survives anywhere.**

## Watching the gates fail *(C1, C2, C12)*

Both were watched red before being trusted, and both reverts confirmed by content-changed **and**
count-dropped-by-one — never "the count is now zero":

- **the generator** refused with the whole sentence: level, run cols, gap in px, wall cols, side,
  and the player width it compared against;
- **the unit gate** went 14 pass / 1 fail → 15 pass / 0 fail on revert.

The gate carries **eight synthetic red proofs** as well, because the shipped maps contain no
violation any more — without them the sweep would pass just as happily against a function that
returned `null` unconditionally. They cover: rejects 96 px on the right, rejects 96 px on the left,
accepts 192 px, accepts flush, accepts a pit floor spiked wall-to-wall (the level-03 shape it must
**not** red), accepts an open floor with no wall, ignores a hazard on a raised ledge, and **the
bound moves with the player** — 132 passes what 200 fails, proving the rule is a body width and not
a magic number.

## Regression, counts read positively

```
tsc --noEmit                     clean
vitest run                       2705 passed, 0 failed (183 files)
test:sim-isolated                2701 passed, 4 skipped — Phaser uninstalled; phaser@4.2.1 restored
npm run build                    verify-dist ok: 5 levels + 12 audio byte-identical, no DEV surface
playwright test                  expected 148, unexpected 0, flaky 0
git diff --stat main -- public/assets/levels/   level-02, -03, -04, -05 (level-01 unchanged)
```

## Still open

**The owner's hands-on pass.** This defect was found by playing and reported twice; it does not
close on a green suite. The mechanical evidence says every almost-gap is gone — the confirmation
that the game no longer traps you has to come from the game.
