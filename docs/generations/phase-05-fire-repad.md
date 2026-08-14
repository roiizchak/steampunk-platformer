# Phase 5 — the second padding step on `brass-sentry/fire`

**Date:** 2026-08-14 (session 10) · **Spend: 1 generation, $1.19.**
**Result: the treatment is REFUTED. The second generation of the batch was NOT submitted.**

---

## Why this was shot

`brass-sentry/fire` and `brass-sentry/death` both fail G6 at `-r4`. Session 10 measured *where*,
and the answer was the same for both: **the machine is not cropped — an effect is.**

| clip | cell | machine margins | what crosses the edge |
|---|---|---|---|
| `brass-sentry-fire-r4` | 0 of 6 | L232 T278 B244 | right edge, **4 rows** at y 388–391 — the muzzle flash's spark tail |
| `brass-sentry-death-r4` | 3 of 8 | L226 R200 B244 | top edge, detached **steam puffs** spanning x 320–569 |

Both confirmed by eye at full resolution. G6 measures an opaque mask and cannot tell a sheared limb
from a discharge — the same blind spot already recorded for G1.

**The user was shown this and chose to re-shoot rather than write a G6 exception** (2026-08-14).
The lever chosen was **anchor padding, not a prompt clause**, per the standing rule: the prompt lever
is documented as exhausted, and a shape-describing clause gets satisfied by *not performing the
action* — which is exactly why `-r4` was ordered with `DISCHARGE_MARGIN` in the first place.

## The single variable

Only the anchor canvas changed. Same endpoint, prompt, resolution, duration and `1:1` ratio.

| | before | after |
|---|---|---|
| `--fill` | 0.45 | **0.35** |
| canvas | 3130² | **4024²** |
| figure height | 45.0 % | **35.0 %** |
| margins | T29.6 B25.5 L24.3 R25.2 | **T34.1 B30.9 L30.0 R30.7** |
| G1 | `PASS, sole-spread=0px of 21px` | **`PASS, sole-spread=0px of 21px`** — identical, so the blit is a pure translation |

Anchor uploaded 2026-08-14 and **hash-verified by re-download**: fetched bytes match the local file's
digest `04d35f22e309ab3fdc33a829c1845865e22fec35793c5547d2597d3092b64610` exactly.
URL `https://v3b.fal.media/files/b/0aa648b8/Xyt-uiNmmFDt72vwuwVCw_brass-sentry-padded.png`.

## The generation

| field | value |
|---|---|
| endpoint | `bytedance/seedance-2.0/image-to-video` |
| **`request_id`** | **`019fff77-93ab-7f92-b2c6-49cffe2d6ab2`** |
| seed | `10466351` |
| output | `_generated/phase05/video/brass-sentry-fire-r5.mp4` (616 903 bytes) |
| sidecars | `_generated/phase05/prompts/brass-sentry-fire-r5.txt`, `_generated/phase05/params/brass-sentry-fire-r5.params.json` |
| unit price at submission | `$0.014/unit` (`genmedia pricing`, checked before spending) |
| reconciled cost | **$1.19** |

## The result — padding moved the machine and did NOT fix the failure

```
r4  frame 0 of 6 FAIL   left 232  right 0  top 278  bottom 244
r5  frame 1 of 6 FAIL   left 276  right 0  top 308  bottom 296
```

The machine gained margin on every measured edge, exactly as the treatment intended. The right edge
is still 0.

**Per-cell right-edge occupancy on `-r5`:** cell 0 clear, **cell 1 = 8 opaque rows at y 406–413**,
cell 2 clear.

**What the frame actually shows** (verified by eye, not inferred): the turret has fired and the model
has drawn the **departing bolt streaking away to the right edge**, with the muzzle smoke well inside
the frame. A larger canvas gives that bolt *more room to travel*, so it reaches the edge regardless.

> **This is why padding cannot fix this clip.** Padding shrinks the subject relative to the canvas.
> It does not shrink a projectile whose whole purpose is to leave the scene. The effect is drawn to
> the frame, not in proportion to the gun.

**Secondary observation, recorded because it affects the choice of winner:** `-r5`'s discharge is a
smoke cloud plus a small bolt, where `-r4`'s is a large bright muzzle flash. For a sheet whose sim
window is an 18-tick `fire`, `-r4` reads better as *firing*. **The re-shoot produced worse art that
still fails.**

## Disposition

**The plan's stop rule fired**: *"changes one variable so the root cause is isolated; if it still
crops, STOP and re-plan — do not spend Batch 2."* The `brass-sentry/death` generation of this batch
was **rendered but never submitted**, so it cost **$0**.

- `brass-sentry-fire-r5.mp4` is kept on disk, not deleted.
- Adoption is **reverted to `-r4`** as the declared winner, on the art quality above; `-r5` joins
  `SUPERSEDED_CLIPS`.
- The open question returns to the one session 4 deferred and session 10 re-measured: **either G6
  learns to separate an effect from a cropped subject, or these two clips are accepted with a
  written reason.** It is now backed by two rounds of measurement rather than one.

## Addendum — `death` was submitted after all, and it failed the same way

The stop rule fired and the user was shown the refutation above. **They elected to spend the second
$1.19 on `death` regardless**, on the reasoning that its failure is a steam plume rather than a
departing bolt, so padding had a better chance there. Recorded as their decision, taken with the
`fire` result in hand.

| field | value |
|---|---|
| **`request_id`** | **`019fff81-d6cb-7e92-8598-2465d3d05f59`** |
| seed | `1367854450` |
| output | `_generated/phase05/video/brass-sentry-death-r6.mp4` (1 715 223 bytes) |
| reconciled cost | **$1.19** |

> ⚠️ **The `request_id` was nearly lost.** The `genmedia run` output was truncated before it was
> read. It was recovered from `~/.genmedia/gallery/sessions/<id>/data.json`, which records
> `request_id`, `endpoint_id` and the full prompt for **every** run.
> **This is a recovery path criterion 5.4e did not know existed** — the two "permanently
> unrecoverable" ids may be retrievable from the same place.

**Result: worse than `-r4`, and it fails a different edge.**

```
r4  frame 1 of 8 FAIL   left 226  right 200  top   0  bottom 244   <- plume leaves the TOP
r6  frame 1 of 8 FAIL   left 142  right   0  top  68  bottom 278   <- debris leaves the RIGHT
```

`-r4` fails one edge, on detached steam. `-r6` has lost 84 px of left margin and 200 px of right
margin, and now fails on the right with the wreckage itself closer to the frame. The larger canvas
gave the debris **more room to spread**, which is the same mechanism that defeated `fire`: padding
scales the subject, not the effect.

**Both re-shoots are superseded; `-r4` stays the declared winner for both keys.**

## Conclusion

**Anchor padding is refuted as a treatment for effect-driven G6 failures, in both directions** — a
projectile leaving the scene (`fire`) and debris spreading from a wreck (`death`). Two rounds,
$2.38, single-variable each time, both measured and both looked at.

What remains is the decision session 4 deferred and this session has now paid twice to sharpen:
**either G6 learns to separate an effect from a cropped subject, or these two clips are accepted with
a written reason.** A third re-shoot is not a proposal — it is the treatment that has now failed
twice on the same mechanism.

## Cost

| item | qty | cost |
|---|---:|---:|
| `brass-sentry/fire` from a 4024² padded anchor | 1 | **$1.19** |
| `brass-sentry/death` from the same anchor | 1 | **$1.19** |

**Phase 5 spend: $41.36 → $43.74 of the $55 ceiling. $11.26 remains.**
