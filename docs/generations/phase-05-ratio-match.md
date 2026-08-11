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
