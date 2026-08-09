# Phase 5 — combat and enemy clips

Pointer row in [GENERATION-LOG.md](../GENERATION-LOG.md). Criterion **5.4e**.

**Model:** `bytedance/seedance-2.0/image-to-video`, `9:16`, `720p`, `duration 4`,
`generate_audio false`, `sync_mode false` — `sync_mode true` is not saved to request history and
would break the rebuild contract.

**`image_url`** is the uploaded locked anchor for each subject. Seedance needs a URL, not a path, so
all three were uploaded first; the URLs are in `_generated/phase05/anchor-urls.txt`.

**`end_image_url`** is set to the same anchor **for cyclic states only** — `brass-sentry/idle`,
`rust-scavenger/walk`, `rust-scavenger/chase` — so the loop closes on the pose it opened from. The
six one-shots omit it: an `attack` or a `death` that returns to its start pose is not a one-shot.

**Rate:** ~$1.19 per clip, the invoiced Phase 4 figure.

## The generations

Two batches of five and four, each proposed and run separately, per the standing rule that a batch
over five is a STOP.

| # | Sheet | `request_id` | Loop | `simTicks` derives from |
|---|---|---|---|---|
| 1 | `brass-courier/attack` | `019fe7b7-5493-7d22-b43b-f971641db5d5` | — | `attackTotalTicks(ATTACK)` = 20 |
| 2 | `brass-courier/hurt` | `019fe7b9-895d-71b2-ab57-818be35fbb03` | — | `HURT_TICKS` = 18 |
| 3 | `brass-courier/death` | `019fe7bb-df01-70c0-91ff-79b409e950d7` | — | `DEATH_TICKS` = 45 |
| 4 | `brass-sentry/idle` | `019fe7bd-ba1c-7151-b74c-9da069b89afb` | ✅ | `IDLE_TICKS` = 90 *(authored)* |
| 5 | `brass-sentry/fire` | `019fe7c0-42b9-7271-a953-3ad80a459899` | — | `SENTRY_FIRE_TICKS` = 18 |
| 6 | `brass-sentry/death` | `019fe7c2-cc11-7603-a411-b6f23958a71a` | — | `DEATH_TICKS` = 45 |
| 7 | `rust-scavenger/walk` | `019fe7c4-529e-7823-a07b-6f6b96134f65` | ✅ | `strideTicks(stride, patrolSpeed)` |
| 8 | `rust-scavenger/chase` | `019fe7c6-3c04-7012-a791-4262461f325c` | ✅ | `strideTicks(stride, chaseSpeed)` |
| 9 | `rust-scavenger/death` | `019fe7c8-f11d-7091-b86b-af12535a6cc5` | — | `DEATH_TICKS` = 45 |

### Round 2 — the two `SPAN_CLIP` failures, re-shot

| # | Sheet | `request_id` | Why round 1 was discarded |
|---|---|---|---|
| 10 | `brass-courier/attack` | `019fe7cf-d5e9-7590-bf62-2872c177eaa4` | Round 1 contained **no strike at all** — he raised the spanner overhead and held it. No sampling recovers a contact frame from a clip that never has one. |
| 11 | `brass-courier/hurt` | `019fe7d2-593f-7b91-87e5-308729f36a06` | Round 1 read as a turn-and-reach and lost the side profile as he rotated toward the viewer. Nothing in it looked like being struck. |

**Spend: ~$13.09 across 11 clips.** Running Phase 5 total: **≈$13.99 of the $40 ceiling.**

## THE FINDING OF THIS BATCH: `poseSpan` works, `SPAN_CLIP` does not

The split was total and it was visible before a single sheet was packed:

| Tail | Clips | Outcome |
|---|---|---|
| `poseSpan` — three timed poses | `fire`, and all three `death`s | **4 of 4 hit their specified poses**, including the exact halfway pose |
| `SPAN_CLIP` — "extend then return" | `attack`, `hurt` | **2 of 2 failed** |

`SPAN_CLIP`'s *"extending through the first half and returning through the second"* is a perfectly
reasonable sentence that describes a **shape**. Asked to swing a spanner, the model read it as
*raise it, then lower it* — which satisfies the sentence exactly and is not the motion. Three timed
poses describe a **geometry**, and this model obeys geometry over shape. That is the same finding
STYLE.md §6 records for stills, arriving in the video path: a named element beats a description.

Both re-shoots hit their poses first try. `attack` now contains a real strike — drawn back over the
shoulder, arm extended straight forward at full reach, follow-through — and `hurt` snaps the head
back with the spine arched, stays on both feet and holds side profile throughout.

**Recorded for G5:** `attack`'s reach peaks LATE in the clip, around 5/6 of the way through, while
the active window is ticks 6–10 of 20 (30–50 %). Whether that mismatch survives sampling is a
measurement on the packed sheet, not an eyeball call — it is exactly what criterion 5.4c exists to
catch, and it is written down here so the answer cannot be quietly rounded to a pass.

Every clip measured with `ffprobe`, counted rather than read off the request: **720 × 1280, 97
frames, 24/1, 4.041667 s**, all eleven identical — and identical to Phase 4's nine, which is the
consistency the sampler depends on.

## Status: EYEBALLED, NOT YET MEASURED

Every clip has now been looked at as a six-frame contact strip, which is what caught the two
`SPAN_CLIP` failures above — `ffprobe` reported all of them as perfect. That check is necessary and
nowhere near sufficient. What has **not** happened:

- **They have not been packed into sheets** — `build-assets.mjs` is still single-slug (Codex C2),
  which is step 6a.
- **No measured gate has run on them**: not G4 (vertical drift / per-frame baseline), not G5 (the
  contact frame against the active window, criterion 5.4c), not the loop-wrap or motion-floor gates.
- **`renderFrames` is therefore still unknown**, so not one derived fps exists yet. The `simTicks`
  column above is what each WILL be derived against, not a result.

### Eyeball triage, recorded so a later measurement can contradict it

| Clip | Read | Note |
|---|---|---|
| `brass-courier/attack` r2 | **good** | Real strike. Reach peaks late — flagged for G5 above. |
| `brass-courier/hurt` r2 | **good** | Clean recoil, on his feet, side profile held. |
| `brass-courier/death` | **partial** | Correct end pose; back-loaded — 3 of 6 evenly sampled frames are the same standing hold. |
| `brass-sentry/idle` | **marginal** | Near-frozen. For a machine at rest that may be right, but it will measure near the motion floor. |
| `brass-sentry/fire` | **good** | Flash and recoil land exactly on the specified halfway pose. |
| `brass-sentry/death` | **good** | Intact → split and sparking → collapsed heap. |
| `rust-scavenger/walk` | **marginal** | Some leg movement, poses close together. Possible near-idle — needs an IoU measurement, not an eye. |
| `rust-scavenger/chase` | **good** | Real stride with airborne phases, clearly distinct from `walk`. |
| `rust-scavenger/death` | **partial** | Correct end pose, back-loaded like the other deaths. |

**The back-loading may not be a defect.** These strips are sampled EVENLY, which is not how
`sampler.mjs` picks frames — it selects on a difference matrix. A held opening that wastes three of
six even samples may cost nothing once the real sampler runs. Recorded as a suspicion rather than a
finding, and deliberately not re-shot on the strength of a contact sheet that uses the wrong
sampling.

Two clips remain genuinely uncertain (`brass-sentry/idle`, `rust-scavenger/walk`) and the ≈$26 of
remaining headroom against the $40 ceiling is what that is for. Phase 4's rework rate was 77 %; this
batch is at 2 of 11.

## What the briefs encode, and what they cost to learn

Each of these was paid for with a Phase 4 generation and is now in `motionCombat.mjs`:

| Rule | Where it came from |
|---|---|
| **`poseSpan` (three timed poses) for EVERY one-shot** | It began as a rule for motions that do not return, on the Phase 4 finding that the model maximises a self-contradicting prompt. This batch widened it: `attack` and `hurt` genuinely DO return, kept `SPAN_CLIP` on that reasoning, and were the only two clips in the batch that failed. All six one-shots now use `poseSpan`. |
| **Named limb mechanics BEFORE the cycle count** | Probe A asked for *"exactly six full strides"* and got a near-idle with a slow turn. The count fixes the sampling; the mechanics fix whether any walking happens at all. |
| **No travel across the frame** | `enemyView` draws each sprite at the position the sim moves, so a sprite that also translates inside its cell asks for the motion twice — the Phase 4 jump rose straight out of frame. |
| **Per-subject identity, no fallback** | New in Phase 5. `videoPrompt` throws if a namespaced entry declares no `identity`, because the legacy `HOLD` block opens with *"this is the same man… brass goggles… satchel"* and a turret handed that would be asked to grow a courier out of itself. |
