# The invisible blocker, attempt 4 — reproduced, then fixed

**Session:** 2026-08-28 · branch `session-invisible-blocker-repro`, off `session-hud-and-pits` · no fal spend (budget stays at $55.20/$55)

## The brief

> *"I keep getting stuck in something invisible while walking. I have now reported this FOUR times.
> Three fixes have shipped against it and none of them was the thing. Do not ship a fourth guess.
> Your first job this session is NOT to fix it. It is to REPRODUCE it."*

So this log records the reproduction first and the fix second, in that order, because that ordering
was the deliverable.

## 1. Why the previous three misses happened

Each of the three shipped fixes found a **plausible mechanism by measuring level data** and shipped
it as a proxy for the complaint. None of them ever put the owner's actual stuck state on a screen.
An unreproduced bug cannot tell you when you have fixed it, so each fix was scored against a
hypothesis rather than against the symptom — and the symptom kept coming back.

The instrument built this session exists because of that. See
[`src/sim/trace.ts`](../../src/sim/trace.ts), [`src/sim/stallAnalysis.ts`](../../src/sim/stallAnalysis.ts)
and [`src/scenes/devPinProbe.ts`](../../src/scenes/devPinProbe.ts).

## 2. The root cause

Commit `01a518e` — *"nowhere to stand: the 96 px gap that pinned the player in spikes"* — widened two
platforms so they sat flush against their spike runs. That fix was correct and is kept. It also made
those two platforms **abut their neighbours exactly**:

| level | before | after | new seam at |
|---|---|---|---|
| level-02 | `7872,1632,192,288` | `7872,1632,384,288` | **x = 8256** |
| level-03 | `9984,1536,288,384` | `9984,1536,768,384` | **x = 10752** |

Two solid rectangles that share a top edge and touch exactly **draw as one continuous platform and
collide as two.**

The mechanism, hand-verified against [`src/sim/player.ts`](../../src/sim/player.ts):

- gravity (tick step 6) runs **before** collision (step 9), so a grounded body sits `0.675 px` inside
  its own floor when the horizontal pass runs — every floor rect it spans is a wall candidate;
- `wasLeft` at [`player.ts:343`](../../src/sim/player.ts#L343) is a **closed** comparison, so once the
  body is snapped flush against the seam it re-fires **every tick, forever**.

The player stops dead on open floor, holding the key, in the `idle` pose. Only a jump gets them past.

## 3. Seam census — this is what makes it the right answer

| branch | level-01 | level-02 | level-03 | level-04 | level-05 |
|---|---|---|---|---|---|
| `main` | 0 | 0 | 0 | 0 | 0 |
| `session-hud-and-pits` (before this fix) | 0 | **1** | **1** | 0 | 0 |
| after this fix | 0 | 0 | 0 | 0 | 0 |

Exactly two seams existed in the whole project, in exactly the two levels the owner named, and both
were introduced by the commit the owner's report followed. That is the strongest single piece of
evidence in this log — it is not a mechanism that *could* explain the symptom, it is the only change
whose footprint matches the complaint's footprint.

## 4. Confirmed on screen by the owner (the thing the three misses never had)

Read off the `?pin=1` probe, on the owner's machine, at 60 Hz:

```
level-02  tick 1723  feet (8190.0, 1632.0)  v (0.00, 0.00)
          #3 tick 1660 / #2 tick 1475 / #1 tick 1412
          feet (8190.0, 1632.0) dir=right cause=geometry (24 ticks)

level-03  tick 1637  feet (10686.0, 1536.0)
          #2 tick 1546 feet (10686.0, 1536.0) dir=right cause=geometry (24 ticks)
```

Feet at `8190` = seam `8256` minus the box half-width `66`. The coordinates are the prediction, and
they matched to the pixel.

Hand-simulated at the seam: **continue = STILL STUCK · reverse = FREED (793 px) · jump = FREED (672 px)**.

## 5. The fix

[`tools/gen/mergeStrips.mjs`](../../tools/gen/mergeStrips.mjs), called from
[`tools/gen/levelObjects.mjs`](../../tools/gen/levelObjects.mjs): merge strips that share a top edge,
a height **and** a boundary, at build time. Solid counts fell 11→10 (level-02) and 12→11 (level-03);
the other three levels are byte-identical.

**Merging the data removes the trigger with zero simulation risk.** The alternative — a foot
tolerance in `resolveCollisions` — is a change to the file the tick contract and every combat window
rest on, and it has a documented inverse failure (see §7).

Order is preserved: a merge extends the **earlier** strip and drops the later one, so the spawn strip
keeps index 0 and `phase-03-element-editor.spec.ts`'s `spawnStrip === 0` still holds.

## 6. Gates

| gate | what it does |
|---|---|
| [`tests/unit/no-flush-seams.test.ts`](../../tests/unit/no-flush-seams.test.ts) | Reads the **shipped bytes**: no two solids may share a top edge and touch, in any of the five levels. Plus a behavioural half that walks the real sim across both former pin sites. |
| [`tests/unit/stall-detector.test.ts`](../../tests/unit/stall-detector.test.ts) | The instrument's own proof, on **synthetic** geometry (see §9). |
| [`tests/e2e/pin-probe.spec.ts`](../../tests/e2e/pin-probe.spec.ts) | The overlay is actually **drawn** — counts magenta pixels in a real screenshot. |

⚠️ **`no-flush-seams.test.ts` is not redundant with the builder.** The builder merges only strips
sharing a top edge **and** a height; a same-top pair of different heights cannot be fused without
inventing collision, so the builder leaves it and the gate fails the suite instead. It also covers
hand-authored geometry and any future generator, because it reads shipped bytes rather than the
builder's intent. **Do not delete it because "the builder handles it now."**

## 7. Deliberate non-fix — the resolver latch stays open, tracked

The underlying resolver behaviour is **not** fixed and is filed as a latent defect. Two reasons:

1. `resolveCollisions` is what the 14-step tick contract and every combat window rest on.
2. The obvious repair has a **documented inverse failure**: give the horizontal pass a foot
   tolerance and the player can enter a solid whose top is a couple of pixels above the feet, while
   the vertical pass at [`player.ts:366`](../../src/sim/player.ts#L366) will **not** land them on it
   because `previousY` was already below that top — **the player falls through a low ledge.** That is
   invisible to a flat-pin sweep, and it is a worse bug than the one being fixed.

If it is ever authorised it needs 0/1/2/>2 px fixtures that **block or step up, never pass through**,
plus a **new** player/enemy foot-tolerance parity fixture — the existing
`overlap-escape-parity.test.ts` stays **green** through that change (its fixture is a full-height wall
at `y=0..3000` with the body at `y=2000`, so it offers the change no protection at all). Verified by
Codex round 2 after it corrected my own over-correction on that same file.

## 8. The offline sweep was NEGATIVE, and that is reported as-is

A dynamic sweep across all five levels × three seeds under the full live sim did **not** reproduce
the owner's five-clause signature: every stall it found freed on reversal. It found the class but not
the signature. Reported rather than papered over — the seam fix rests on §3 and §4, not on the sweep.

## 9. A gate that dies when the bug is fixed

`stall-detector.test.ts` originally asserted the detector fires at the live level-02 and level-03
seams. The moment the fix landed, it went **red** — it was proving the instrument against a live
defect. Rebased onto a **synthetic** two-slab seam, plus a paired assertion that the same slabs
merged into one produce no incident. The instrument stays trustworthy for the next bug.

## 10. `NOTHING EXPLAINS THIS STOP` at (2622.0, 1689.8) — a classifier gap, not a second bug

The probe's last-resort label fired at level-02 `x=2622`. Investigated: the box's right edge is
`2688`, exactly the left edge of the authored wall `x=2688 y=1632 w=192 h=288`, with the feet 230 px
above the floor. An airborne body against a visible wall — ordinary platforming. Added the
`airborneBlock` cause so `unexplained` stops firing on events that are perfectly well explained.

## 11. Regression

| gate | result |
|---|---|
| `npm test` | **2735 passed / 0 failed**, 187 files |
| `npm run typecheck` | clean |
| `npm run build` | ok — 28 DEV bodies folded out, 5 levels + 12 audio files byte-identical, no dev symbol in the bundle |
| `npm run test:sim-isolated` | **2731 passed + 4 skipped**, 187 files |
| `npm run test:e2e` | **150 passed** (was 148; +2 from `pin-probe.spec.ts`) |
| ports 5173 / 4173 | freed, no `LISTENING` socket |

## 12. Incidental repair — `package-lock.json` had lost `phaser`

My own commit `9643e11` this session committed the lockfile while `test:sim-isolated` had Phaser
uninstalled, so `package-lock.json` shipped with **zero** phaser entries. `npm ci` against that lock
would not have installed the runtime dependency — and CLAUDE.md's worktree-recovery note explicitly
relies on "the lockfile pins `phaser@4.2.1`". Restored in this commit.

## 13. Owner sign-off — all five levels, by hand, at 60 Hz

> *"okay, it tested all the levels, and now it's working as expected."*

The owner walked **all five** levels at `?pin=1` on their own machine and reported the stuck state
gone. That closes criterion C4 for this defect: the bug was first reported by playing and it is
closed by playing. No automated gate in this repo could have closed it — the offline sweep (§8) was
negative, and every one of the previous three misses was green across the entire suite.

## 14. Still open

- **The resolver latch** (§7) — tracked, deliberately unfixed, recorded in `HANDOFF.md`.
- **Codex implementation review** and the owner's own review of the diff.
