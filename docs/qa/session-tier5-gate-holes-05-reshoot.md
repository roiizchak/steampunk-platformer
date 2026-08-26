# §5 — the `brass-sentry/idle` re-shoot: **ADOPTED**, and the last loop waiver is gone

**2026-08-26.** Owner-approved after the mandatory pre-spend STOP, which put the rendered command, the
prompt, the price **and the ceiling overrun** in front of them. **$1.19 spent, adopted as one batch.**

⚠️ **This spend went $0.05 over the $55 ceiling** — knowingly, on the owner's explicit decision, with
the overrun quoted before the money moved. The ceiling was **not raised**. `docs/GENERATION-LOG.md`
carries the arithmetic and the note that the next generation needs a raise, not a decision.

## What changed, and it was one thing

**The prompt is byte-identical to `-r3`, which is byte-identical to `-r2`.** The only change was the
anchor.

| take | anchor | verdict |
|---|---|---|
| `brass-sentry-idle-r2.mp4` | unpadded 2048² | passed G6, **FAILED `gateLoopWrap`** at 0.01371 against a budget of 0.01143 — shipped under the `0.0138` waiver |
| `brass-sentry-idle-r3.mp4` | unpadded 2048², same words | **failed G6**: frame 5 of 8, **top margin 0 px**. A discard, $1.19 |
| **`brass-sentry-idle-r4.mp4`** | **padded 2560² (`padAnchor --fill 0.55`)**, same words | **passes G6 and passes `gateLoopWrap` outright** |

`request_id 01a03c8d-72ac-7cc1-8287-5a2b36ae1241`, seed 321260100, 1 268 608 bytes.

**Why the anchor and not the wording.** `-r3`'s failure was on the **vertical** axis, and
`FRAME_MARGIN` (`motionClauses.mjs:37`) constrains *"the middle 70 % of the frame **width**, with
clear green margin at both the **left and right** edges."* Top and bottom are unconstrained, so `-r2`
and `-r3` passing and failing on the same words is variance on an axis nobody asked about — not a
regression. And the wording lever was already measured and spent: the withdrawn centring clause cost
**$4.76** across four clips and came back *"a coin flip."* Padding is a geometric guarantee instead of
a linguistic request, and it raised the anchor's top margin **18.8 % → 25.0 %**.

## The seven-step transaction, as executed

**1. Schema re-run — no drift.** `genmedia schema bytedance/seedance-2.0/image-to-video` returns
`prompt`, `image_url`, `end_image_url`, `duration`, `resolution`, `aspect_ratio`, `generate_audio`,
`bitrate_mode` and `end_user_id` — every one documented in FAL-MODELS.md §3, including the two
(`bitrate_mode`, `end_user_id`) the last session's note omitted from its own summary. `genmedia
pricing` still returns **$0.014 / "unit"** with "unit" undefined, so the price put to the owner was
the `3.10`/`-r3` precedent — same endpoint, resolution and duration — not the CLI's number.

**2. The dependency inventory, taken FIRST.** `idle` sources three scales: the slug `scale`
(`0.28915663`), `fire.scale` (`0.57558748`) and `death.scale` (`0.44081578`), the latter two derived
against **idle's tripod span of 205 px**.

**3. Generated under a versioned candidate name.** Landed at
`_generated/phase05/video/brass-sentry-idle-r4.mp4`. No shipped artifact touched at this point.

**4. Extracted BEFORE deriving.** `node tools/gen/build-clips.mjs brass-sentry idle` → *"8 frames from
97 — cycle 34 frames (2.9 in clip)"*, G6 clean. ⚠️ The `-r3` attempt recorded why the order matters:
`printDerivedScale` reads the extracted strip, not the clip, so **deriving first prints the previous
take's measurement under the new take's name.**

**5. Re-derived, then measured rather than assumed.**

```
idle frame heights: 532, 532, 534, 534, 532, 532, 532, 532
mean standing height: 533 source px  (spread 2 px, 0.4%)
scale for a 192 px render height: 0.36022514
```

🔴 **`fire` and `death` needed NO re-derive, and that is the interesting half** — the `3.10` re-shoot
forced one and drew the turret 23.4 % small until it was caught. Measured after repacking, not
inferred:

| sheet | tripod base span |
|---|---|
| `brass-sentry-idle` | **205 px** |
| `brass-sentry-fire` | **205 px** |
| `brass-sentry-death` | **205 px** |

Identical to before the re-shoot. `renderHeightPx` is fixed at 192, so moving the source-px→game-px
**ratio** leaves the **rendered** machine exactly as big; only a change in the machine's proportions,
or an effect-inflated silhouette, can move the tripod — and padding is a pure translation that does
neither. `sprite-size-consistency.test.ts` is the gate that says so, and it passed unedited.

**6. Adopted as one batch.** Every sheet gate green on the repack:

```
ok  idle  8 frames  512x384  drawn 241x192  PASS
      motion:   PASS — peak motion 0.02852 >= floor 0.002
      adjacent: PASS — closest adjacent pair 4-5 differs by 0.00453 >= 0.0004
      loop:     PASS — wrap 0.02068 within 0.02273
ok  fire  6 frames  PASS      ok  death 9 frames  PASS
```

**7. Spend logged.** `docs/GENERATION-LOG.md`, including the overrun.

## What the adoption deleted, and what it inverted

Three recorded defects were closed by the art rather than by an edit, and each one's own text said how
to close it:

| artefact | before | now |
|---|---|---|
| `every-slug-loop-gate.test.ts` `WAIVED` | `'brass-sentry/idle': { ceiling: 0.0138, owed: 're-shoot' }` | **empty.** *"Delete the entry when the re-shoot lands; never raise it."* |
| `shipped-sheets.test.ts` `KNOWN_LOOP_WRAP_FAILURES` | `Set(['brass-sentry-idle'])` | **empty**, and the *"STILL FAILS 4.9"* assertion **inverted** to *"the set must stay empty"* — so the mechanism cannot quietly become a way to exempt a future sheet |
| `clip-jobs.test.ts` | *"leaves every other sentry action on the unpadded slug anchor"* | *"pads `idle` from its OWN canvas"* — see below |

⚠️ **The raw wrap went UP (0.01371 → 0.02068) while the verdict went FAIL → PASS, and that is not a
contradiction.** `gateLoopWrap`'s budget is derived from the sheet's own median frame-to-frame step,
so a livelier clip earns a larger budget. **It is also why the waiver could not simply be re-pointed
at the new number:** an absolute ceiling on `wrap` compares two figures measured against different
budgets. The gate judges the verdict; the waiver judged a raw value, which is the narrower thing.

## The one place this deviates from a recorded convention, stated rather than buried

`clipAnchors.mjs` says *"one padded PNG serves every sentry action."* **That is no longer true of this
slug.** `fire` and `death` share a `--fill 0.35` → 4024² canvas sized to give a **muzzle flash and a
steam plume** room; an idle turret has neither, and 0.35 would cost four times the resolution to solve
a problem it does not have. `idle` has its own `--fill 0.55` → 2560² canvas.

What makes that safe is measured, not assumed: `scale` resolves per `(slug, action)`, and the tripod
reads 205 px in all three packed sheets. The invariant `clip-jobs.test.ts` now defends is the one that
was always the real one — **one padded record per KEY, never inferred across a slug.**

⚠️ **A provenance drift found while separating the two canvases, and NOT fixed.** `padAnchor.mjs`
writes every fill to the same `<slug>-padded.png`, so idle's bytes had overwritten fire/death's. The
idle canvas now lives at `brass-sentry-padded-fill055.png` and the shared path was regenerated at
`--fill 0.35` — but the regenerated bytes hash `7ce74503…` against the `04d35f22…` recorded for
`fire`/`death`. **The tool no longer reproduces the historical bytes.** That is pre-existing and
harmless here: the recorded sha describes the **uploaded** bytes that actually shot those clips, and
the fal URL is unchanged. Recorded per *(C11)* rather than chased, because nothing reads the local
file.
