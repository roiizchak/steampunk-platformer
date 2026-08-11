# Phase 5 — the ratio-match probe, and what $1.19 finally bought

Index entry in [GENERATION-LOG.md](../GENERATION-LOG.md). Provenance contract: every generation
logged with its `request_id` and reconciled cost *(criterion 5.4e)*.

**Ran:** 2026-08-11, session 4, with explicit user approval for the spend.
**Result: the hypothesis is CONFIRMED.** This is the first probe in Phase 5 that came back positive,
and the first Phase 5 clip in the project's history to pass extraction.

---

## Why this probe, and why not the one that was planned

Session 4's approved plan was going to spend this $1.19 on **anchor padding**. It did not, because a
$0 measurement ran first and refuted the premise.

`tools/gen/framingReport.mjs` measured all **17** clips this project had already paid for — 3 anchors,
6 evenly-spaced frames each, keyed with `borderKey` so a cropped frame can be *measured* rather than
throwing:

```
REFRAMED (anchor ratio != output ratio), cut:  7 of 7   -- 100%
NOT reframed, cut:                             6        fall jump attack attack-r2 death hurt
NOT reframed, clean:                           4        idle run walk hurt-r2
```

**Margin was not the resource.** The `brass-courier` clips are cut left/right where the anchor held
**18.4 % / 20.6 %** of margin there; `rust-scavenger`'s against **20.0 % / 19.5 %**; `brass-sentry`'s
on top against **18.8 %**. A fifth of the frame did not absorb ordinary motion, so the padded anchor's
17.5 % headroom was aiming at a level already shown to fail. The plan's own stop rule — *"a
contradicting result CANCELS the probe rather than renegotiating it"* — fired, and the padded anchor
was built, inspected, G1-gated and **never submitted**.

What the data pointed at instead was **reframing: 7 of 7, deterministic, across two subjects and both
directions of mismatch.** And the fix for it was already sitting in version control.

## The probe was genuinely single-variable

| | round 1 (**paid**, session 1) | this probe |
|---|---|---|
| `request_id` | `019fe7bd-ba1c-7151-b74c-9da069b89afb` | **`019fef56-67bf-7922-943c-417809ed8ba0`** |
| anchor | `0aa5ad07/eTruVD1130OxBEzbPfi0G_anchor.png` (2048², ratio **1.000**) | **same URL** |
| prompt | `brass-sentry-idle.txt` | **byte-identical**, md5 `9b62af475122dc93c115fe66f985cf3e` |
| resolution / duration | 720p / 4 s | 720p / 4 s |
| **`aspect_ratio`** | **`9:16`** | **`1:1`** |
| output | 720 × 1280, 97 frames | **960 × 960**, 97 frames |
| anchor → output | 1.000 → 0.5625 — **a reframe** | **1.000 → 1.000 — no reframe** |
| seed | 1605721860 | 2083575051 *(output-only; the endpoint has no seed input)* |

**The prompt identity was verified, not assumed** — md5 of the round-1 file against the file this
round submitted. Had they differed, this would have been a two-variable probe and worth nothing.

> ⚠️ **One honest limitation.** Round 1's `.job.json` records only the **response**. Its exact request
> parameters were never written down — that is precisely the defect `CLIP_JOBS` and `submit-clips.mjs`
> were built to fix, and they postdate round 1. So `--end_image_url` presence in round 1 is
> **unverifiable from the record**. What the record does prove: same anchor URL, 720p, 4 s, 97 frames,
> and an output of 720 × 1280 that can only come from `9:16`. The probe follows `CLIP_JOBS` exactly, and
> `CLIP_JOBS` is the version-controlled configuration every future clip will use — so what was tested
> is the recipe that ships, which is the thing that needed testing.

---

## The result — categorical, not marginal

Per-frame G6 at the opaque threshold, 6 evenly-spaced frames each:

```
CONTROL  brass-sentry-idle     9:16, reframe          PROBE  brass-sentry-idle-r2   1:1, no reframe
  f1  FAIL  L   0  R   0  T 240  B 160                  f1  PASS  L 102  R 116  T 180  B 120
  f2  FAIL  L   0  R   0  T  96  B 160                  f2  PASS  L  96  R 116  T 180  B 120
  f3  FAIL  L   0  R   0  T   0  B 160                  f3  PASS  L  84  R 116  T 180  B 120
  f4  FAIL  L   0  R   0  T   0  B 160                  f4  PASS  L 102  R 116  T 180  B 120
  f5  FAIL  L   0  R   0  T   0  B 160                  f5  PASS  L  96  R 116  T 180  B 120
  f6  FAIL  L   0  R   0  T   0  B 160                  f6  PASS  L  86  R 116  T 180  B 120
  --> 6 of 6 FAIL                                       --> 0 of 6 FAIL
```

**Confirmed by eye at the six-frame contact strip**, because `ffprobe` cannot see what a clip depicts:
the turret is complete in every frame — barrel, body, both leg assemblies — with clear green margin on
all four edges. Motion is a subtle steam-and-settle, which is correct for a machine at rest and
retires the old *"near-frozen, may be wrong"* suspicion recorded in the QA log.

**And it packs.** `npm run assets:clips -- brass-sentry`:

```
ok  brass-sentry/idle 8 frames from 97 — cycle 35 frames (2.8 in clip), wrap/step 0.13
```

That is **the first Phase 5 clip ever to survive extraction.** The run then correctly fails on
`brass-sentry/fire`, which is still round-1 `9:16` art cut at both sides.

### What this establishes, stated at the strength the evidence supports

**Reframing is a real and dominant cause of the crop, and matching the ratio removes it.** One clip is
one clip, and the endpoint is not seed-deterministic — but the effect size is categorical (6/6 → 0/6,
with 84–180 px of margin where there had been 0), it was predicted in advance from 7/7 prior
observations, and it is consistent with every clip in the 17-clip dataset.

**It does NOT establish that ratio-matching is sufficient for high-motion actions.** `brass-sentry/idle`
is the *lowest*-motion clip in the phase, chosen deliberately to isolate reframing from motion. The six
`brass-courier` clips that were cut **without** any reframe are cut by motion, and nothing here
addresses them.

## Disposition — ADOPTED

`CLIP_JOBS`'s `brass-sentry/idle` now declares `brass-sentry-idle-r2.mp4`, so `findClip` resolves the
re-shoot and the round-1 file creates no ambiguity — the W2b guard doing its job for the second time.
Round 1 is **kept**, not deleted; deleting a paid, non-regenerable input is a standing STOP-and-ask.

**`padAnchor.mjs` is not dead, and this result is what gives it its real job.** The `brass-courier`
anchor is 1536 × 2752 (ratio 0.558), so the courier can only be ratio-matched at `9:16` — where motion
still cuts it — or padded to `1:1` and shot square. Padding is now the tool that makes a
ratio-**matched** courier possible, rather than a margin play that the measurement had already refuted.

## Cost

| item | qty | cost |
|---|---:|---:|
| `brass-sentry/idle` @ 1:1, 720p, 4 s | 1 | **$1.19** |

**Phase 5 spend: $15.18 → $16.37 of the $40 ceiling. $23.63 remains.**

Still cropped and still needing a decision: `brass-sentry/fire`, `brass-sentry/death`,
`rust-scavenger/walk`, `rust-scavenger/chase`, `rust-scavenger/death` — five clips whose anchors are
`1:1` and which were all shot at `9:16`, i.e. **exactly the defect this probe just fixed**, at
5 × $1.19 = **$5.95**. The four `brass-courier` clips cut by motion are a separate, unsolved problem.

---
---

# The full `1:1` round — 6 more generations, $7.14

**Ran:** 2026-08-11, session 4, user-approved ("do group A then group B").
**Phase 5 spend: $16.37 → $23.51 of $40. $16.49 remains.**

## Group A — the five reframe-cut clips, ratio-matched. $5.95

All five had `1:1` anchors and were shot at `9:16` in session 1. Each was re-shot at the `1:1`
`CLIP_JOBS` already prescribes. **Anchors unpadded**, so the only change from round 1 is the ratio —
except for three whose prompts W9 also rewrote in session 2, which is recorded per row rather than
glossed.

| clip | `request_id` | seed | prompt vs round 1 |
|---|---|---:|---|
| `brass-sentry/fire` | `019ff0ca-52da-7cd1-87b3-3cfee97b55f6` | 1088495999 | **changed by W9** (FRAME_MARGIN, grip) |
| `brass-sentry/death` | `019ff0cc-8161-7983-866b-9dc73d30d212` | 1141874549 | **changed by W9** (back-loading fix) |
| `rust-scavenger/walk` | `019ff0cf-7b19-71f0-ab46-26626794e8df` | 941388860 | **unchanged** — ratio only |
| `rust-scavenger/chase` | `019ff0d2-bfba-7cc0-b3c1-ad4f011d9a7c` | 1841205082 | **unchanged** — ratio only |
| `rust-scavenger/death` | `019ff0d4-6905-7371-aa54-9c40122fd2f4` | 1433317132 | **changed by W9** (back-loading fix) |

*(Determined from git at the spec level — `git show dbfc206^:tools/gen/motionCombat.mjs` against HEAD —
not from the on-disk prompt `.txt` files, which are regenerated on every `submit-clips` run and
therefore prove nothing about what round 1 submitted. That regeneration was itself finding **R5**,
fixed earlier this session.)*

### Result — the ratio fix is NECESSARY but NOT SUFFICIENT

```
rust-scavenger/walk    PASS  0/6 fail   min L154 R154 T 59 B 96
rust-scavenger/chase   FAIL  1/6 fail   min L  8 R132 T  0 B 82
brass-sentry/fire      FAIL  5/6 fail   min L102 R  0 T  0 B  0
brass-sentry/death     FAIL  4/6 fail   min L  0 R  0 T  0 B100
rust-scavenger/death   FAIL  4/6 fail   min L  0 R  0 T 60 B 66
```

**The residual tracks motion magnitude, cleanly ordered** — which is the two-cause model holding up:

| clip | motion | outcome |
|---|---|---|
| `brass-sentry/idle` | lowest — a machine at rest | 6/6 fail → **0/6** |
| `rust-scavenger/walk` | moderate cyclic | cut L,R → **0/6** |
| `rust-scavenger/chase` | fast cyclic | cut L,R → 1/6 |
| `brass-sentry/fire`, both deaths | large one-shot pose change | still 4–5 of 6 |

**And what is at the edge is not always a cropped subject.** Confirmed by looking at the six-frame
strips, which is why that rule exists:

- **`brass-sentry/fire`: the turret is COMPLETE in every frame.** What touches the edge is the muzzle
  flash and the smoke plume. G6 measures an opaque subject mask and cannot tell discharge from a
  sheared limb — the same class of blind spot already recorded for G1 ("cannot tell a boot from a hand").
- **Both deaths are genuine.** The collapsed debris field really does span the frame width by frame 5.
  (W9's back-loading fix did work — collapse now begins at frame 3, not frame 4.)

### A separate defect surfaced, and it is not about framing at all

`rust-scavenger/walk` **passes G6 and then fails extraction**:

```
"rust-scavenger/walk" is declared cyclic but no window of it closes — no sampling of this
clip yields a loop. That is an INDETERMINATE, not a licence to fall back to even sampling.
```

This is session 2's *"a sway, not a gait — stride ≲15 % of body height"* verdict finally **measured**
rather than eyeballed. Decisively: **its prompt was UNCHANGED by W9.** The five W9 corrections covered
the courier's prop and grip, the deaths' back-loading, and `fire-elevated` — the scavenger's stride was
never among them. So the sway defect was never actually addressed, and no amount of reframing will fix
it. It needs a stride prompt correction and a re-shoot.

---

## Group B — the padding probe. $1.19. **CONFIRMED.**

With ratio matched, margin became testable single-variable for the first time: the sentry anchor is
already `1:1`, so padding it changes **nothing else**.

`node tools/gen/padAnchor.mjs brass-sentry --fill 0.45`:

```
before  2048x2048   figure 77.1% w, 68.8% h   T18.8 B12.5 L10.7 R12.1
after   3130x3130   figure 50.5% w, 45.0% h   T29.6 B25.5 L24.3 R25.2
```

G1 identical on both (`PASS, sole-spread=0px of 21px, 3 contact limbs`), proving the blit is a pure
translation. **The uploaded bytes were hash-verified against the local file** —
sha256 `4c6ec48b1d810568a2c30e7e7ab7c0b2e58437c7f40b78910e7644c165569e08` — because anchor identity has
been assumed once before on this project and it cost a probe.

| | control `fire-r2` | probe `fire-r3` |
|---|---|---|
| `request_id` | `019ff0ca-…` | **`019ff0db-0597-7490-ae69-921c125fed29`** |
| anchor | 2048², unpadded | **3130², padded** |
| `aspect_ratio` | `1:1` | `1:1` — unchanged |
| prompt | `brass-sentry-fire-r2.txt` | **the same file** |
| G6 | **5 of 6 fail** | **1 of 6 fail** |
| margins f1 | L102 R116 T180 B120 | **L232 R242 T282 B244** |

**Margins roughly doubled and the failures dropped from five to one.** The survivor is the discharge
frame — a bright muzzle blast reaching the right edge — with the turret itself comfortably framed.

**Padding works.** It is the second real lever, and unlike the first it costs a canvas rebuild rather
than a parameter. **The trade-off, stated:** padding shrinks the subject in the output (the sentry now
fills ~45 % of a 960 px frame instead of ~69 %), so it spends resolution to buy margin. At the 288×384
cell size that is still oversampled, but it is not free.

---

## Cost

| item | qty | cost |
|---|---:|---:|
| Group A — five clips ratio-matched to `1:1` | 5 | **$5.95** |
| Group B — `brass-sentry/fire` from a padded anchor | 1 | **$1.19** |

**Phase 5 spend: $16.37 → $23.51 of the $40 ceiling. $16.49 remains.**

## Disposition

`CLIP_JOBS` now declares the best measured candidate for every enemy clip. **A declared file is not a
passing file** — G6 remains the arbiter, and only `brass-sentry/idle` currently packs.

**Still open, and none of it is a framing problem any more:**

| clip | what it needs |
|---|---|
| `brass-sentry/fire` | a G6 that separates discharge from a cropped subject, **or** a re-shoot with less muzzle blast |
| `brass-sentry/death`, `rust-scavenger/death` | a padded anchor — the debris spread genuinely exceeds the frame |
| `rust-scavenger/chase` | one frame at L8; a padded anchor should clear it |
| `rust-scavenger/walk` | **a stride prompt correction** — it is a sway, not a gait, and W9 never touched it |
| `brass-courier/*` | a padded 1:1 courier anchor; the anchor is 0.558 so padding also matches the ratio |
