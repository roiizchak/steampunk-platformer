# Phase 5 — the padded round, and what padding cost

Index entry in [GENERATION-LOG.md](../GENERATION-LOG.md). Provenance contract: every generation
logged with its `request_id` and reconciled cost *(criterion 5.4e)*.

**Ran:** 2026-08-11, session 6, with explicit prior user approval for a 7-clip batch.
**Phase 5 spend: $23.51 → $31.84 of $40. $8.16 remains.**

---

## The batch

Seven clips, one per key, all `bytedance/seedance-2.0/image-to-video` at 720p / 4 s.
Every one returned **960 × 960, 97 frames**.

| clip | `request_id` | anchor | ratio | landed |
|---|---|---|---|---|
| `brass-courier/attack` | `019ff189-2309-7ee3-bb6b-afc8278dda98` | courier padded 5050² | `1:1` | `-r3.mp4` |
| `brass-courier/death` | `019ff18b-df29-7c00-bb4a-6f46ebb5ec1c` | courier padded 5050² | `1:1` | `-r2.mp4` |
| `brass-sentry/death` | `019ff18e-5a54-7202-a356-e3d7a3df7bb7` | sentry padded 3130² | `1:1` | `-r3.mp4` |
| `brass-sentry/fire` | `019ff190-98e1-7950-a566-e0d772097edb` | sentry padded 3130² | `1:1` | `-r4.mp4` |
| `rust-scavenger/chase` | `019ff193-250b-7110-ae4f-8007eb7bb855` | scavenger padded 3690² | `1:1` | `-r3.mp4` |
| `rust-scavenger/death` | `019ff196-22ab-7d13-89e6-b6964cf454ae` | scavenger padded 3690² | `1:1` | `-r3.mp4` |
| `rust-scavenger/walk` | `019ff199-330c-7512-9343-95ee8d982ec3` | scavenger padded 3690² | `1:1` | `-r3.mp4` |

**Two anchors were uploaded for this round and both were hash-verified by re-download** — the fetched
bytes matched the local digests exactly, because anchor identity has been assumed once on this
project and it cost a probe.

| slug | canvas | `--fill` | sha256 |
|---|---|---|---|
| `rust-scavenger` | 3690² | 0.45 | `1fd1a6b8768229e47aad0a6d69d8286bbe306fc8aa2c89edcf922936c9f917c1` |
| `brass-courier` | 5050² | 0.50 | `f0785a0393eb57f6295369175b20428cb49662d7dc4d6ff9cec607900274fe8a` |

## What went right — framing is solved

**Not one subject crop in five of the seven contact strips**, on two anchors that had never been
ratio-matched before. Confirmed by eye at full resolution, which is the only way: `ffprobe` reported
identical perfect container properties for all seven and can see none of this.

**`rust-scavenger/walk` closes.** It previously passed G6 and then failed extraction outright —
*"declared cyclic but no window of it closes"*, the sway-not-a-gait defect finally measured. The
session-5 stride prompt fix worked:

```
ok  rust-scavenger/walk  12 frames from 97 — cycle 49 frames (2.0 in clip), wrap/step 0.33
ok  rust-scavenger/chase 12 frames from 97 — cycle 38 frames (2.6 in clip), wrap/step 0.19
```

The prompt asked for exactly two cycles and got **2.0**. Compare `brass-sentry/idle`, which asked for
two and delivered 2.8 — the cycle-detection remainder that is still an open expected-failure lock.

## 🔴 What went wrong — padding breaks the sprite size

`brass-courier/attack` extracted, packed, catalogued — and drew **114 px tall against `hurt`'s
288 px.** The character shrinks to 40 % the instant it swings.

`scale` is stored per SLUG *(vault A5)*. The courier's, `0.23723229`, was derived from an **unpadded**
idle in which the figure stands 1214 px of a 1280 px frame. The padded round puts it at ~480 px of
960. Same scale:

```
480 × 0.23723229 = 114 px drawn      (hurt, from an unpadded clip: 288 px)
```

**Padding is a property of a GENERATION, and so is the scale it implies.** That is this project's own
session-5 lesson — *padding is not a property of a subject* — arriving one layer further down, at
packing rather than submission. A per-slug scale cannot serve a padded and an unpadded generation of
the same character.

**Decision (user, 2026-08-11): re-shoot courier `attack` and `death` UNPADDED**, keeping one scale per
slug. Their padded records were removed. The $2.38 spent on the padded courier pair bought this
finding and two unusable sheets; the clips are **kept, never deleted**.

### And "unpadded courier" means `9:16`, not `1:1`

The courier anchor is **1536 × 2752 = 0.5581**, which *is* 9:16. So for the courier, `9:16` is the
**ratio-matched** choice and `1:1` is the reframe — the opposite of the sentry and scavenger, whose
anchors are square. Every clean courier sheet the project ships was shot at `9:16`.

`validateClipJob` banned the literal string `"9:16"` as *"the specific defect"*, which would have
forced the re-shoot through the very reframe the ban exists to prevent. The guard now compares the
**anchor's ratio** against the submitted ratio. Stricter, not looser: it catches a reframe on any
subject in either direction, where the string ban caught one value on one anchor shape.

## Per-clip verdicts, measured

| clip | extraction | G6 | disposition |
|---|---|---|---|
| `rust-scavenger/walk` | ✅ 12 frames, cycle 2.0 | PASS | blocked at pack: needs a **296 px** cell against the 288 px global (decision M3) |
| `rust-scavenger/chase` | ✅ 12 frames, cycle 2.6 | PASS | blocked at catalog: stride not yet measured |
| `brass-courier/attack` | ✅ 8 frames, onset f4 | PASS | **wrong scale** — re-shoot unpadded |
| `brass-courier/death` | ✅ 10 frames, onset f9 | PASS | **wrong scale** — and cell 7 of 10 is 122×25 against a median 54, flagged a fragment |
| `brass-sentry/fire` | — | **FAIL** f0/6 · L232 **R0** T278 B244 | one edge only; see below |
| `brass-sentry/death` | — | **FAIL** f1/8 · **L2 R0 T16** B244 | genuine, three edges |
| `rust-scavenger/death` | — | **FAIL** f7/10 · L14 **R0** T532 B228 | genuine, debris leaves frame |

**`brass-sentry/fire-r4` has almost no discharge.** Session 5 added `DISCHARGE_MARGIN` to keep the
muzzle flash inside the frame; the model satisfied it by very largely **not firing** — frames 4–5 show
a thin wisp of smoke and no flash at all. That is the recorded `SPAN_CLIP` failure shape: a constraint
describing a SHAPE, met by not performing the action. *(`SPAN_CLIP` asked for a swing that extends and
returns, and got a spanner raised and lowered.)* It is declared as the winner because it is the round
the gates must now judge, **not** because it is agreed to be better art.

**`rust-scavenger/death-r3` is now an explosion, not a collapse** — parts fly off the top edge at
frame 3. `brass-sentry/death-r3` collapses at frame 2 of 6, front-loaded, which is what the W9
back-loading fix was for; its smoke column reaches the top edge, but that is smoke, not subject.

## Cost

| item | qty | cost |
|---|---:|---:|
| Seven clips from padded anchors @ 720p / 4 s | 7 | **$8.33** |

**Phase 5 spend: $23.51 → $31.84 of the $40 ceiling. $8.16 remains.**

**Approved and not yet run:** four more clips — courier `attack`/`death` unpadded at `9:16`, and
`brass-sentry/death` + `rust-scavenger/death` with a tighter debris clause. **$4.76 → $36.60.**
