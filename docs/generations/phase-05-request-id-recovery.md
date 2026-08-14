# Phase 5 — criterion 5.4e closed: every clip reconciled to its `request_id`

**Date:** 2026-08-14 (session 10) · **Cost: $0.** · **Criterion 5.4e: was BLOCKED, is now CLOSED.**

---

## What was believed

`brass-sentry-death-r4` and `rust-scavenger-death-r5` are declared winners in `clipJobs.mjs` with
**no `request_id` anywhere under `docs/`**. Codex confirmed `_generated/phase05/params/*.json` does
not carry one either, and the `-r3`/`-r4`/`-r5` `.job.json` files that would have held them were
never written. The session-10 prompt therefore recorded 5.4e as *"unclosable from the repository —
either the user reads them off the fal dashboard, or they are recorded as permanently
unrecoverable and 5.4e fails for those two rows."*

## What is actually true

**There is a third copy of record nobody had looked at.** The `genmedia` CLI keeps a per-run gallery
at `~/.genmedia/gallery/sessions/<session>/data.json`, and each run object carries:

```
{ ts, request_id, endpoint_id, modality, prompt, duration_ms,
  files: [ { path, url, ... } ] }
```

`files[].path` is the **absolute download path genmedia actually wrote**. So a clip on disk maps to
its `request_id` by **exact filename**, not by inference, not by timestamp correlation.

> **This was found the expensive way.** Session 10's own `brass-sentry/death` re-shoot had its
> `genmedia run` output truncated before the `request_id` was read — the 5.4e failure mode
> reproducing live. Recovering that one id revealed the store that closes the whole criterion.

Across **111 gallery sessions**, 58 `bytedance/seedance-2.0/image-to-video` runs are recorded, and
**35 of 35 Phase 5 clips on disk match one, with zero unmatched.**

## The two that were "unrecoverable"

| clip | `request_id` | run timestamp (UTC) |
|---|---|---|
| `brass-sentry-death-r4.mp4` | `019ff1d2-0316-7a30-a9fe-f842e8676e11` | 2026-08-11 17:18:27 |
| `rust-scavenger-death-r5.mp4` | `019ff1f9-1a0e-7973-be7d-4e3f8d8994ac` | 2026-08-11 18:00:11 |

## Full reconciliation — every Phase 5 clip on disk

| clip | `request_id` | run timestamp (UTC) |
|---|---|---|
| `brass-courier-attack-r2.mp4` | `019fe7cf-d5e9-7590-bf62-2872c177eaa4` | 2026-08-09 18:39:08 |
| `brass-courier-attack-r3.mp4` | `019ff189-2309-7ee3-bb6b-afc8278dda98` | 2026-08-11 15:58:18 |
| `brass-courier-attack-r4.mp4` | `019ff1d7-c8e3-7e63-bc4d-c2f3172189f3` | 2026-08-11 17:23:52 |
| `brass-courier-attack-r5.mp4` | `019ff1e9-41f6-7502-8ea5-7610dc941f74` | 2026-08-11 17:46:55 |
| `brass-courier-attack.mp4` | `019fe7b7-5493-7d22-b43b-f971641db5d5` | 2026-08-09 18:12:02 |
| `brass-courier-death-r2.mp4` | `019ff18b-df29-7c00-bb4a-6f46ebb5ec1c` | 2026-08-11 16:01:04 |
| `brass-courier-death-r3.mp4` | `019ff1da-29e4-7eb2-89a1-796ec97b10dd` | 2026-08-11 17:25:55 |
| `brass-courier-death-r4.mp4` | `019ff1ef-465c-71d2-8e76-d4c4969e3722` | 2026-08-11 17:49:22 |
| `brass-courier-death.mp4` | `019fe7bb-df01-70c0-91ff-79b409e950d7` | 2026-08-09 18:16:23 |
| `brass-courier-hurt-r2.mp4` | `019fe7d2-593f-7b91-87e5-308729f36a06` | 2026-08-09 18:42:01 |
| `brass-courier-hurt.mp4` | `019fe7b9-895d-71b2-ab57-818be35fbb03` | 2026-08-09 18:14:35 |
| `brass-sentry-death-r2.mp4` | `019ff0cc-8161-7983-866b-9dc73d30d212` | 2026-08-11 12:32:35 |
| `brass-sentry-death-r3.mp4` | `019ff18e-5a54-7202-a356-e3d7a3df7bb7` | 2026-08-11 16:03:30 |
| **`brass-sentry-death-r4.mp4`** | **`019ff1d2-0316-7a30-a9fe-f842e8676e11`** | 2026-08-11 17:18:27 |
| `brass-sentry-death-r5.mp4` | `019ff1f1-85c3-7eb0-b868-24f615e706a8` | 2026-08-11 17:57:39 |
| `brass-sentry-death-r6.mp4` | `019fff81-d6cb-7e92-8598-2465d3d05f59` | 2026-08-14 09:05:04 |
| `brass-sentry-death.mp4` | `019fe7c2-cc11-7603-a411-b6f23958a71a` | 2026-08-09 18:23:49 |
| `brass-sentry-fire-r2.mp4` | `019ff0ca-52da-7cd1-87b3-3cfee97b55f6` | 2026-08-11 12:29:19 |
| `brass-sentry-fire-r3.mp4` | `019ff0db-0597-7490-ae69-921c125fed29` | 2026-08-11 12:48:41 |
| `brass-sentry-fire-r4.mp4` | `019ff190-98e1-7950-a566-e0d772097edb` | 2026-08-11 16:06:17 |
| `brass-sentry-fire-r5.mp4` | `019fff77-93ab-7f92-b2c6-49cffe2d6ab2` | 2026-08-14 08:57:39 |
| `brass-sentry-fire.mp4` | `019fe7c0-42b9-7271-a953-3ad80a459899` | 2026-08-09 18:21:50 |
| `brass-sentry-idle-r2.mp4` | `019fef56-67bf-7922-943c-417809ed8ba0` | 2026-08-11 05:43:08 |
| `brass-sentry-idle.mp4` | `019fe7bd-ba1c-7151-b74c-9da069b89afb` | 2026-08-09 18:19:22 |
| `rust-scavenger-chase-r2.mp4` | `019ff0d2-bfba-7cc0-b3c1-ad4f011d9a7c` | 2026-08-11 12:37:58 |
| `rust-scavenger-chase-r3.mp4` | `019ff193-250b-7110-ae4f-8007eb7bb855` | 2026-08-11 16:09:33 |
| `rust-scavenger-chase.mp4` | `019fe7c6-3c04-7012-a791-4262461f325c` | 2026-08-09 18:28:51 |
| `rust-scavenger-death-r2.mp4` | `019ff0d4-6905-7371-aa54-9c40122fd2f4` | 2026-08-11 12:41:06 |
| `rust-scavenger-death-r3.mp4` | `019ff196-22ab-7d13-89e6-b6964cf454ae` | 2026-08-11 16:12:54 |
| `rust-scavenger-death-r4.mp4` | `019ff1d5-327f-7782-93a1-52e977763d84` | 2026-08-11 17:21:16 |
| **`rust-scavenger-death-r5.mp4`** | **`019ff1f9-1a0e-7973-be7d-4e3f8d8994ac`** | 2026-08-11 18:00:11 |
| `rust-scavenger-death.mp4` | `019fe7c8-f11d-7091-b86b-af12535a6cc5` | 2026-08-09 18:30:58 |
| `rust-scavenger-walk-r2.mp4` | `019ff0cf-7b19-71f0-ab46-26626794e8df` | 2026-08-11 12:36:09 |
| `rust-scavenger-walk-r3.mp4` | `019ff199-330c-7512-9343-95ee8d982ec3` | 2026-08-11 16:15:23 |
| `rust-scavenger-walk.mp4` | `019fe7c4-529e-7823-a07b-6f6b96134f65` | 2026-08-09 18:25:54 |

## Caveats, stated rather than buried

1. **The gallery is outside the repository and outside git.** It lives in the user's home directory
   and `genmedia` may prune it. This document is the durable copy — the table above is the record,
   not the store it came from.
2. **It is per-machine.** A clone on another machine has no gallery. That is exactly why the values
   are transcribed here rather than left as "run this script".
3. **`brass-sentry-death-r4.params.json` still self-contradicts** (`file` says `-r3`,
   `downloadPath` says `-r4`), and `rust-scavenger-death-r5.params.json` has the identical defect.
   That is not data loss: `file` records the *declared winner at render time* while `downloadPath`
   records *this* round. It is confusing rather than wrong, and the fix is to have
   `submit-clips.mjs` emit an unambiguous `roundFile` field.
4. **The four legacy Phase 4 bare keys** (`idle`, `walk`, `run`, `fall`) are not in this table — they
   predate the namespaced directory. Their `.submit.json` files carry a `request_id` already.

## Disposition

**Criterion 5.4e — "every combat generation logged with its request id and reconciled cost" — is
CLOSED.** 35 of 35 clips have a `request_id`, matched by recorded download path. No id was invented
and none was inferred from a timestamp.

The standing instruction to *"log every `request_id` before packing anything"* is unchanged; this
recovers history, it does not replace the habit. **The habit is what failed twice this session** —
once historically, once live.
