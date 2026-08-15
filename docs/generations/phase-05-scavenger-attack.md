# Phase 5 — `rust-scavenger/attack`: the swing the player asked for

**Date:** 2026-08-14 (session 11) · **Cost: $1.19 quoted** · **1 generation** · **First take adopted.**

---

## Why it was bought

> *"Just now, I just noticed the scavenger does not have an attack animation."* — the player,
> 2026-08-14, during the playtest of `rust-scavenger/idle`.

**It was not a bug. It was the spec.** `worldDamage.ts` hurt the player on any overlap with a live
scavenger, and criterion 5.16 still calls it *"contact damage"*. The creature was scoped as a chaser
whose **body is the hazard** — `enemyView.ts`'s own header said so explicitly, and its `hurt` sheet
was a named descope lever.

The instinct behind the report was still right: a thing that hurts you with **no windup and no
visual** reads as unfinished, because there is no telegraph and the hit feels arbitrary. Presented as
"record it and finish Phase 5" versus "build it now"; the user chose **build it now**.

## The mechanic, and the fact that it is a balance change

```
SCAVENGER_ATTACK = { startup: 14, active: 6, recovery: 16 }   // 36 ticks
attackRange    144 px (1.5 tiles)   — the windup must begin BEFORE contact
attackCooldown  72 ticks            — 36 ticks of visible recovery between swings
```

Startup is more than **twice** the player's own (`ATTACK.startup` is 6). The player already knows
what they pressed; an enemy's windup exists to be *read by someone who did not choose it*.

**Damage moved from the touch to the swing.** `attackIsLive` now gates it, and two consequences were
accepted deliberately:

- The scavenger deals **less** damage — back out during the 14-tick startup and you take nothing.
- Walking into a stationary scavenger is no longer instantly harmful.

`enemyView.ts` draws from the same module's `attackInProgress`, so **what hurts you and what you see
come from one definition** *(vault 5.3)* rather than two counter comparisons that agree today.

## $0 sim first, then the art — and `PENDING_ART` earned its keep the same session

The sim landed and was committed before any money moved, with `rust-scavenger-attack` **askable but
not declared**: `scavengerAnim` returned it while the sheet did not exist. Declaring a key with no
file fails the build by design *(vault 4.16)*, so it sat in `PENDING_ART`.

That machinery had been emptied one commit earlier, when `idle` landed, and **kept rather than
inlined as `[]`** on the reasoning that *"the next action bought ahead of its sheet needs it, and
rebuilding it is how the both-directions property gets lost."* It was needed within the hour.

## The generation

| field | value |
|---|---|
| `request_id` | **`01a003d5-2734-7f93-a7cf-7ce32a264f7d`** |
| endpoint | `bytedance/seedance-2.0/image-to-video` |
| seed | `2023738685` |
| `image_url` | `…/6X0GqPhD7r1-tuxbrx4Pm_rust-scavenger-padded.png` |
| `end_image_url` | **none** — a one-shot, not a cycle. The tooling omits it from `cyclic: false` records, which is why `idle` had one and this does not. |
| anchor sha256 | `1fd1a6b8768229e47aad0a6d69d8286bbe306fc8aa2c89edcf922936c9f917c1` |
| non-default inputs | `duration 4`, `resolution 720p`, `aspect_ratio "1:1"`, `generate_audio false` |
| quoted | **$1.19** |
| invoiced | *pending — reconcile against the fal invoice* |
| output | `_generated/phase05/video/rust-scavenger-attack.mp4`, 1 238 397 bytes |
| gallery session | `c125221bbfac` |
| disposition | **KEPT — first take, adopted** |

## 9 frames, and the count is forced

`attack` is a **one-shot** (`loop: false`), so `one-shot-divisor.test.ts` applies:
`simTicks % frameCount === 0`. The swing totals **36** ticks, so the frame count must divide 36 —
{1, 2, 3, 4, 6, 9, 12, 18, 36}. **9 gives 4 ticks/frame, fps 15**: slow enough to read a windup, fast
enough that the strike does not feel mushy.

The 36 is not free either — it is `startup 14 + active 6 + recovery 16`, all balance numbers.
Changing the sheet's frame count without changing them, or the reverse, is how a one-shot starts
dwelling unevenly.

## What the prompt had to get right

The three phases must be **legible as phases**, because the entire point is a telegraph. A model that
spreads one smooth motion across nine frames produces an attack with no readable commitment point,
which fails exactly the way having no attack does. So the prompt names them separately and in order:

1. **Winds up** — leans back, raises the near clawed arm high and behind the head, *holds* that pose,
   and this is stated as the slowest part of the clip.
2. **Strikes** — the claw sweeps down and forward in one fast arc to furthest extension.
3. **Recovers** — the arm drops and it settles back to its hunched stance.

Plus *"it swings exactly ONCE — there is no second swipe"*, and the same feet-planted constraint
`idle` carries: `stepScavenger` holds `x` still for the whole swing, so any travel in the art would
be a foot-plant violation against zero body movement.

## Outcome

Extraction, first try — and note it found the motion onset rather than starting at frame 0:

```
ok  rust-scavenger/attack 9 frames from 97 — one-shot, from motion onset at frame 8
```

Packing, first try: **9 frames, 512 × 384 cell, drawn 354 × 310**, key `(0,254,0)`, PASS.

The drawn box is the widest and tallest of any scavenger sheet — 354 × 310 against `chase`'s
260 × 255 — which is what a raised-and-extended claw should measure. `sprite-size-consistency.test.ts`
does not gate `attack` against the gaits, correctly: it measures **silhouette height** for this slug,
and a swing legitimately changes both height and footprint, exactly as the file's own header says of
`brass-courier`.

## Records touched

| # | file | edit |
|---|---|---|
| 1 | `tools/gen/motionCombat.mjs` | `COMBAT_MOTIONS['rust-scavenger/attack']`, `frames: 9`, ending `+ FRAME_MARGIN` |
| 2 | `tools/gen/clipAnchors.mjs` | `PADDED_ANCHORS['rust-scavenger/attack']` |
| 3 | `tools/gen/clipJobs.mjs` | `CLIP_FILES['rust-scavenger/attack']` — after download |
| 4 | `tools/gen/slugConfig.mjs` | `actions` gains `attack`, in order |
| 5 | `tools/gen/catalogTimings.mjs` | `FIXED_TIMINGS`, plus a new `SCAVENGER_ATTACK_TOTAL_TICKS` mirror of the sim constant |
| 6 | `character-bounds-rust-scavenger.json` | `animations.attack`, `activeFrames: [3, 4]` |
| 7 | `src/render/enemyView.ts` | `ANIMS_BY_SLUG` gains `attack`; header corrected — it had claimed the scavenger *"has no attack state because its BODY is the hazard"* |

## Spend

| | |
|---|---|
| before | $44.93 of $55 |
| this log | **+$1.19** |
| after | **$46.12 of $55** — $8.88 remaining |

⚠️ This was **not** a budgeted item. The session's plan allowed $3.57 (D1's re-shoot at up to $2.38
plus D3's idle at $1.19); this is a new decision taken mid-session on the player's report. `fall`'s
re-shoot has **not** been run, so $8.88 still covers its two authorised attempts with $6.50 to spare.
