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

**Spend: ~$10.71.** Running Phase 5 total: **≈$11.61 of the $40 ceiling.**

Every clip measured with `ffprobe`, counted rather than read off the request: **720 × 1280, 97
frames, 24/1, 4.041667 s**, all nine identical — and identical to Phase 4's nine, which is the
consistency the sampler depends on.

## Status: GENERATED AND MEASURED, NOT YET VERIFIED

Stated plainly because the difference matters. What has happened: nine clips exist, their container
properties are measured, and their provenance is recorded. What has **not** happened:

- **Nobody has looked at them.** Phase 4's `fall` somersaulted and its `jump` rose out of frame;
  both had valid `request_id`s and correct container properties. A clip that exists is not a clip
  that is usable, and `ffprobe` cannot tell the difference.
- **They have not been packed into sheets** — `build-assets.mjs` is still single-slug (Codex C2),
  which is step 6a.
- **No measured gate has run on them**: not G4 (vertical drift / per-frame baseline), not G5 (the
  contact frame against the active window, criterion 5.4c), not the loop-wrap or motion-floor gates.
- **`renderFrames` is therefore still unknown**, so not one derived fps exists yet. The `simTicks`
  column above is what each WILL be derived against, not a result.

Any of the nine may need re-shooting. The ≈$23 of remaining headroom against the $40 ceiling is
what that is for, and Phase 4's rework rate was 77 %.

## What the briefs encode, and what they cost to learn

Each of these was paid for with a Phase 4 generation and is now in `motionCombat.mjs`:

| Rule | Where it came from |
|---|---|
| **`poseSpan` (three timed poses) for a motion that does NOT return** | `SPAN_CLIP` promises *"extending through the first half and returning through the second"*. That is true of a swing and false of a death — and the model resolves a self-contradicting prompt by **maximising** it, which is how the Phase 4 `fall` somersaulted through five explicit negations. `death` and `fire` use `poseSpan`; `attack` and `hurt` genuinely do return, so they keep `SPAN_CLIP`. |
| **Named limb mechanics BEFORE the cycle count** | Probe A asked for *"exactly six full strides"* and got a near-idle with a slow turn. The count fixes the sampling; the mechanics fix whether any walking happens at all. |
| **No travel across the frame** | `enemyView` draws each sprite at the position the sim moves, so a sprite that also translates inside its cell asks for the motion twice — the Phase 4 jump rose straight out of frame. |
| **Per-subject identity, no fallback** | New in Phase 5. `videoPrompt` throws if a namespaced entry declares no `identity`, because the legacy `HOLD` block opens with *"this is the same man… brass goggles… satchel"* and a turret handed that would be asked to grow a courier out of itself. |
