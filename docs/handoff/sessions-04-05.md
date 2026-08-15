[← HANDOFF.md index](../HANDOFF.md)

## 10. Session 4 — 2026-08-11. **The measurement killed the planned probe; a better one confirmed the cause.**

Plan: `C:\Users\royko\.claude\plans\resume-phase-5-combat-pure-crane.md` (revision 2, approved).
Its Codex plan review — **BLOCK, 4 blockers, all four re-verified locally and CONFIRMED** — is appended
to [reviews/phase-05-plan.md](../reviews/phase-05-plan.md).

**Spend: $15.18 → $16.37 of $40. $23.63 remains.** One generation, user-approved, and it was **not**
the one the plan budgeted for — see the two blocks below in order.

> ### ✅ THE PROBE THAT DID RUN — and it worked
>
> After the padding probe was cancelled (next block), the data pointed at **reframing** instead, and
> a single-variable ratio-match re-shoot of `brass-sentry/idle` confirmed it.
> **`request_id 019fef56-67bf-7922-943c-417809ed8ba0`**, full log in
> [generations/phase-05-ratio-match.md](../generations/phase-05-ratio-match.md).
>
> Same anchor, same 720p/4 s, **prompt byte-identical by md5**; only `aspect_ratio` moved, `9:16` →
> `1:1`, so anchor ratio equals output ratio and nothing reframes.
>
> ```
> CONTROL 9:16   6 of 6 frames FAIL G6, left 0 / right 0 on every one
> PROBE   1:1    0 of 6 frames FAIL G6, margins 84-180px on all four edges
> ok  brass-sentry/idle 8 frames from 97 — cycle 35 frames (2.8 in clip)
> ```
>
> **The first Phase 5 clip ever to survive extraction.** Adopted — `CLIP_JOBS` declares
> `brass-sentry-idle-r2.mp4`; round 1 kept, not deleted.
>
> **What it does NOT show:** that ratio-matching is enough for **high-motion** actions. `idle` is the
> lowest-motion clip in the phase, picked deliberately to isolate reframe from motion. The four
> `brass-courier` clips cut with **no reframe at all** are cut by motion and remain unsolved.
>
> **`padAnchor.mjs` is not dead — this is what gives it its real job.** The courier anchor is 0.558,
> so the courier can only be ratio-matched by **padding it to 1:1** and shooting square.

### 🔴 THE RESULT THAT MATTERS — 17 paid clips measured, and neither hypothesis survived intact

`tools/gen/framingReport.mjs` measured every generation this project has paid for: 17 clips, 3
anchors, 6 evenly-spaced frames each, keyed with the new `borderKey` so a cropped frame can be
*measured* instead of throwing. Full data in `_generated/framing-report.json`.

```
REFRAMED (anchor ratio != output ratio), cut:  7 of 7   -- 100%
NOT reframed, cut:                             6        fall jump attack attack-r2 death hurt
NOT reframed, clean:                           4        idle run walk hurt-r2
```

**Two causes, and the split is clean:**

1. **Reframing cuts the subject every single time — 7/7, two subjects, both directions of mismatch.**
   Deterministic, not a tendency.
2. **Without reframing, cutting is motion-dependent.** The four clean clips and the six cut ones come
   from the **same anchor with the same margins**. What separates them is how far the motion throws a
   limb: `idle`/`run`/`walk`/`hurt` stay inside the standing silhouette; `jump`/`fall`/`attack`/`death`
   do not.

### 🔴 The padding probe is CANCELLED. It was never submitted.

**Margin is not the resource, at the scale actually available.** `brass-courier`'s clips are cut
left/right where the anchor held **18.4 % / 20.6 %** of margin there; `rust-scavenger`'s against
**20.0 % / 19.5 %**; `brass-sentry`'s on top against **18.8 %**. A fifth of the frame should absorb
ordinary motion. It did not.

The plan's own stop rule — *"a contradicting result CANCELS the probe rather than renegotiating it"* —
fires here. **The padded anchor was built, inspected, gated and NOT submitted.** It cost **$0** to
learn this, which is the entire reason the measurement ran before the spend.

`tools/gen/padAnchor.mjs` is kept, working and tested: `brass-courier --fill 0.65` produces
**3886 × 3886**, figure 91.8 % → **65.0 %** of height, headroom 5.1 % → **18.2 %**, sides → 37.5 %/38.4 %,
and G1 returns an **identical** verdict on padded and unpadded (`PASS, sole-spread=0px of 39px`),
proving the blit is a pure translation. Output goes to `_generated/anchors-padded/` and **never** to
`public/`. It is available the moment a padding-based probe is worth running — but the measurement
says 18 % of headroom is *comparable to margins that already failed*, so at `--fill 0.65` it is
under-powered on the vertical axis.

> **The one thing that makes the reframe finding cheap:** `CLIP_JOBS` already reads `1:1` out of
> `ASSET-PIPELINE.md` and hard-rejects `9:16`. Every sentry and scavenger clip on disk was shot at
> **9:16 from a 1:1 anchor** — session 1's error — so **the 7/7 deterministic cause is already fixed
> for every future generation, at no cost.** No probe is needed to fix it. What is *not* yet answered
> is whether removing the reframe is *sufficient* for a high-motion action.

### 🔴 NO PHASE 5 CLIP IS PACKABLE. All three slugs fail G6.

With action-level scoping in place, extraction reached Phase 5's own clips for the first time in the
project's history. G6 fails all three:

```
brass-sentry/idle      frame  0 of  8   left 0, right 0, top 0
rust-scavenger/walk    frame  0 of 12   left 0
brass-courier/attack   frame  1 of  8   left 0
```

Not worked around, not tolerated. **Every Phase 5 clip needs re-shooting**, which is what makes the
framing question the phase's whole critical path rather than a side quest.

### What session 4 landed — 8 commits, verified by the orchestrator, not by agent report

`npm run typecheck` clean · `npm test` **`Tests 757 passed (757)`, 52 files** (baseline 708/47) ·
`npm run test:sim-isolated` **757/757** · `npm run build` + verify-dist ok · `npm run test:e2e`
**44 passed (4.2m)** · dev servers killed by port. **Nothing committed by any subagent — `git log`
checked each time.**

| | What | Where |
|---|---|---|
| **A-T1** | **R3.** G6 keys with the **border median**, per cell, after the crop. Re-validated in **four** directions incl. the intersection case. `DEFAULT_MIN_ALPHA` stays 255. | `8b77638` · `chroma.mjs` `borderKey:150`, `build-clips.mjs` |
| **A-T4** | **R1 + R2.** The sheet filename is an exact contract, not a prefix scan. R2 (cross-slug collision) is now **structurally impossible**. | `5ba301b` · `slugConfig.motionKeyFor`, `build-assets.findSource` |
| **A-T6** | **A1.** The 9b ordering is gated. **No sim change** — the fixture the false rationale said could not exist. | `a5ccc56` · `tests/unit/tick-damage-order.test.ts` |
| **A-T7** | **A2/R4/R9/R10.** Sentry fire guard preserved (see below), `playIfChanged` extracted, action lists pinned. | `9c4e76d` · `src/scenes/playAnim.ts` (26) |
| **A-T8** | **W10a/W10b/W11.** Two record corrections + the live schema compared field by field. | `24f5dbc` |
| **A-T3** | `padAnchor.mjs` — built, gated, **not submitted**. | `09e3624` |
| **A-T5** | Action-level scoping of both asset scripts. `fire-elevated` no longer attempted. | `ccdd72e` |
| **A-T2** | The 17-clip framing measurement. | `232278c` |

### Traps session 4 added or confirmed — read before continuing

- 🔴 **`src/sim/enemies.ts:138` and `:144` are NOT duplicates.** `:138` is a **saturating increment**,
  `:144` is the **fire guard**. The session-4 plan said to delete `:144` as redundant; the Codex plan
  review caught it first. **Deleting it makes every sighted sentry fire on every tick**, and
  `play-anim.test.ts` stays green while it happens. It is now a `windowOpen` **replacement** — same
  line count, so **`enemies.ts` stays at exactly 400 with zero headroom.** The earlier claim that this
  fix bought a file-size slot is **withdrawn**.
- 🔴 **`estimateKeyColour` throws on exactly the frames G6 must measure.** The real cropped fixture
  scores **78.41 %** border agreement against a 90 % floor, because the subject occupies 21.6 % of the
  border — *which is the crop*. Use **`borderKey(image)`** (`chroma.mjs:150`, `minAgreement: 0`), never
  `estimateKeyColour` directly, anywhere a possibly-cropped frame is keyed.
- **Agreement separates cleanly and is worth knowing:** a uniform background of **any** colour scores
  **1.0000** (including the off-key `(0,195,64)` field); only subject-on-the-border drops it, to
  0.78–0.93.
- **`build-clips.mjs`'s `main()` is now guarded** by an `import.meta.url` check so tests can import
  `gateSheetEdges`. It previously ran unconditionally at import. **Verify the script still actually
  runs** after touching that guard — a wrong guard makes it a silent no-op, which is byte-identical to
  success.
- **`build-assets.mjs` writes inside its per-action loop** (`findSource` `:174` → `writeFileSync`
  `:281`), so a throw on action *n* still leaves actions `0..n-1` rewritten. A "byte-identical" claim
  must be paired with **mtimes** proving the write happened — a skipped write is byte-identical too.
- **PowerShell here-string syntax (`@'...'@`) breaks inside the Bash tool** and silently corrupts a
  commit message. Write the message to a file and use `git commit -F`.
- **`_generated/` is gitignored**, so the padded anchor is not in git. It is regenerable from the
  committed tool plus the committed anchor.

### Where to pick up

**Both groups were run. Spend is $23.51 of $40. Two levers are now proven, and one clip packs.**

**Ratio-matching is NECESSARY but NOT SUFFICIENT**, and the residual tracks motion magnitude:

| clip | motion | round 1 → `1:1` | state |
|---|---|---|---|
| `brass-sentry/idle` | lowest | 6/6 fail → **0/6** | **PACKS** |
| `rust-scavenger/walk` | moderate cyclic | cut L,R → **0/6** | G6 clean, **fails extraction — no loop closes** |
| `rust-scavenger/chase` | fast cyclic | cut L,R → 1/6 | gated, min L8 |
| `brass-sentry/fire` | discharge at peak | 6/6 → 5/6 → **1/6 padded** | gated on the muzzle blast |
| `brass-sentry/death` · `rust-scavenger/death` | large pose change | 4/6 fail | genuine — debris spans the frame |
| `brass-courier/*` | limb extension | untouched | needs a **padded 1:1 courier anchor** |

**Padding is the second lever and it is PROVEN** — `brass-sentry/fire` from a 3130² padded anchor went
**5/6 fail → 1/6**, margins roughly doubled, single-variable against the unpadded `-r2` control. It
costs subject resolution (~69 % → ~45 % of frame height) to buy margin.

**Three things to do next, in this order, and only the third costs money.**

1. **$0 — `rust-scavenger/walk` needs a STRIDE PROMPT FIX, not a re-shoot decision.** It passes G6 and
   then fails extraction: *"declared cyclic but no window of it closes."* That is session 2's *"a sway,
   not a gait"* verdict finally measured. **Its prompt was UNCHANGED by W9** — the five corrections
   covered the courier's prop and grip, the deaths' back-loading and `fire-elevated`; the stride was
   never among them. Fix the prompt first, then it re-shoots as part of the next batch.
2. **$0 — decide what G6 should do about DISCHARGE.** `brass-sentry/fire`'s turret is complete in every
   frame; what touches the edge is the muzzle blast. G6 measures an opaque mask and cannot tell a
   sheared limb from a flash — the same blind spot recorded for G1. Either the gate learns the
   difference or `fire` is accepted with a written reason. **Do not loosen a threshold to pass it.**
3. **Then spend.** Padded re-shoots for `brass-sentry/death`, `rust-scavenger/death`,
   `rust-scavenger/chase`, plus the courier set from a padded 1:1 anchor. That is ~6 clips ≈ **$7.14**,
   landing near **$30.65 — which CROSSES the $30 STOP-and-ask.** Get approval with the number in hand.

**Not started:** W12–W20, the entire §6 QA gate (every agent owner, two briefs each — 5.1 and 5.5 now
*must* re-run because A-T6/A-T7 changed their code), and the Codex **implementation** review (5.14).
**Phase 5 is failing and must be reported failing.**

---

## 11. Session 5 — 2026-08-11. **The spend was mis-ordered, and $0 of measurement proved it.**

Plan: `C:\Users\royko\.claude\plans\resume-phase-5-combat-glittery-sketch.md` (revision 2, approved).
Its Codex plan review — **BLOCK, 4 blockers, 4 major, 1 minor** — is appended to
[reviews/phase-05-plan.md](../reviews/phase-05-plan.md). **8 confirmed, 1 partly refuted.**

**Spend unchanged at $23.51 of $40 at the time of writing. Nothing was submitted.**

### 🔴 The finding that reordered the session

**Revision 1 would have spent $8.33 and produced nothing usable.** Three separate reasons, each
confirmed locally rather than taken on Codex's word:

| # | What | Decisive evidence |
|---|---|---|
| **A3a** | Every "padded re-shoot" would have submitted the **UNPADDED** anchor | `ANCHOR_URLS` (`clipJobs.mjs:108`) is keyed by **slug**, one URL each; `submit-clips.mjs:95` emits `job.anchorUrl` verbatim. No per-record override existed. |
| **A3b** | No per-slug bounds config existed, so **no enemy sheet could pack at all** | `public/assets/config/` held two files, neither per-slug. `build-assets.mjs:99` throws without one. |
| **A3c** | **Nothing wrote `public/assets/index.json`** | `build-assets.mjs` had three `writeFileSync` calls — strip PNG `:285`, report `:328`, lift profile `:349`. Its docstring `:5` claimed it wrote catalog rows. **The docstring was false**; HANDOFF §9 had already recorded the truth. |

**A3c is the one that matters most.** Without a catalog row, Boot registers no enemy animation and
`enemyLayer.ts` keeps drawing Rectangles — so **5.4, 5.4d, live 5.7, 5.8 and 5.11 were gated on the
catalog, not on the art.** Those four criteria were the entire stated justification for spending
early. All three are now fixed and committed.

> **The padded anchor's URL was in no version-controlled file at all.** Its only copy sat inside
> `_generated/phase05/video/brass-sentry-fire-r3.job.json`, and `_generated/` is gitignored — so the
> project's copy of record did not contain the address of art it had paid $1.19 to use. That is the
> **third** instance of one failure: `aspect_ratio` typed into a command line, the winning clip
> inferred from a directory listing, and now this. `PADDED_ANCHORS` is the same fix each time.

### ✅ Writing the first catalog row switched the Phase 4 gates on

The moment `brass-sentry-idle` got a catalog row, the **existing** shipped-art gates began policing
it and immediately failed it. They were never broken — nothing had been feeding them.

Three of the four failures were a **test** defect: `shipped-sheets.test.ts` resolved every sheet as
`characters/brass-courier/sheets/<key>.png`, the same single-slug assumption class as R1/R2. It now
reads the path from the catalog row's own `url`.

**The fourth is real: `brass-sentry/idle`'s loop seam SNAPS.** `wrap 0.02437` against a `0.02032`
budget — and that budget is already the *larger* of the median step and the clip's own largest step,
so the wrap genuinely exceeds anything inside the clip. Confirmed twice, by `build-assets` and by
`gateLoopWrap` on the shipped strip. **The clip §10 calls *"the first Phase 5 clip ever to survive
extraction"* produces a sheet that fails a shipped-art gate. Surviving extraction is not the same as
being shippable.**

It is held by an **expected-failure lock**, not an exclusion: a named assertion requires
`gateLoopWrap` to keep returning FAIL on this sheet. **That goes red in both directions** — if the
gate is ever weakened, and if the art is fixed without removing the key. No tolerance was touched.

### 🔴 A4 — every action measured before a price was named

Extraction stops at the first failure, so per-action runs were needed; session 4's knowledge was
incomplete by construction.

| clip | verdict | detail |
|---|---|---|
| `brass-sentry/idle` | extracts; **packed sheet fails loop wrap** | 8 frames from 97, cycle 35 |
| `brass-courier/hurt` | ✅ **CLEAN — DO NOT BUY** | 6 frames, one-shot from motion onset at frame 8 |
| `brass-sentry/fire` | G6 fail f0/6 | right 0, **top 0** — the *padded* `-r3` |
| `brass-sentry/death` | G6 fail f1/8 | left 0 |
| `rust-scavenger/walk` | **extraction fail** | *"no window of it closes"* — the stride, not the framing |
| `rust-scavenger/chase` | G6 fail f3/12 | **top 0**, left 8 |
| `rust-scavenger/death` | G6 fail f1/10 | top 0 |
| `brass-courier/attack` | G6 fail f1/8 | left 0 |
| `brass-courier/death` | G6 fail f7/10 | left 0 **and** right 0 |

**`brass-courier/hurt` needing no purchase is a $1.19 saving that only the measurement could find** —
§10's expected buy list had it as an open question. Note also that the scavenger failures have moved
to the **top** edge, which §10 did not record.

### ✅ Prompt fixes, both $0 (`c1d6f90`)

- **`rust-scavenger/walk` had no distance in it.** Diffed against `chase`, which *does* produce a
  40–50 % gait: `chase` names three visual facts, `walk` named an intention. Every quantity is now a
  fraction of the creature's own body — the only ruler the model and the gate share. **`poseSpan` is
  not the lever here**; a cyclic record gets no span tail at all (`motion.mjs:376`).
- **`FRAME_MARGIN` had never reached ANY cyclic entry.** It was appended by hand per record and every
  cyclic motion predated it, so `walk`, `chase` **and `brass-sentry/idle`** were shot with no margin
  clause at all. `idle` was found by the new test, not by reading.
- **`DISCHARGE_MARGIN`** measures the muzzle flash against the barrel and demands margin on **all
  four** edges — `FRAME_MARGIN` speaks only about frame *width*, and `fire` is cut top and bottom.
  **User decision: constrain the effect, not the gate.** No `edgeGate.mjs` threshold moved;
  `DEFAULT_MIN_ALPHA` stays 255.

### ✅ Both new padded anchors built and G1-verified ($0)

Codex's in-process arithmetic was exact.

| slug | canvas | figure h | margins T/B/L/R |
|---|---|---|---|
| `rust-scavenger` `--fill 0.45` | **3690²** | 81.1 % → **45.0 %** | 27.2 / 27.8 / 33.4 / 33.1 % |
| `brass-courier` `--fill 0.50` | **5050²** | 91.8 % → **50.0 %** | **5.1 → 25.5** / **3.2 → 24.5** / 40.4 / 41.0 % |

**G1 returns an IDENTICAL verdict on padded and unpadded** — scavenger `sole-spread 23px/23px`,
courier `0px/0px`, same limits, same contact-limb counts — proving the blit is a pure translation.

**The courier is the big one:** its anchor was 1536 × 2752 (ratio 0.558) with **3.2 % bottom margin**.
Padding to square fixes the ratio **and** the margin in one move. `--fill 0.65` was rejected: it
leaves 18.2 % headroom, and the 17-clip framing report shows courier clips already cut against
18.4 %/20.6 %. `0.50` matches the sentry's **proven** ~25 % profile.

### 🔴 USER-APPROVED SPEND — not yet submitted

**Approved up to 8 clips ≈ $9.52 / $33.03**, with both stop rules explicitly on the table (batch over
5; crossing $30), and with the instruction *"Do option one if needed. Do the 8 clip batch."* — i.e.
run the **$0 investigation of `idle`'s loop snap first** and do not waste $1.19 if it turns out to be
a keying/sampler bug rather than art.

**That investigation ran and exonerated the art (see "Where to pick up" item 1), so the batch is
7 clips ≈ $8.33 → $31.84, leaving $8.16.** The authorisation covered 8; 7 is what the measurement
justified, and the difference was not spent.

**The idle investigation is the immediate next task and it is free.** Extraction reported a healthy
`wrap/step 0.13`; `gateLoopWrap` fails the packed strip. **The two stages key the image
differently** — `build-clips` uses `borderKey`, `build-assets` uses `estimateKeyColour`. That seam
has produced a false verdict on this project once already (R3).

**Before submitting anything:** upload both padded anchors, then add their URLs **and sha256** to
`PADDED_ANCHORS` in `clipJobs.mjs`. A padded record whose URL equals its slug's unpadded URL throws
at import by design. `brass-courier/hurt` is **NOT** in the batch.

### Traps session 5 added or confirmed

- **`build-assets.mjs` is now at exactly 400 lines**, a **second** zero-headroom file beside
  `src/sim/enemies.ts`. Both are *at*, not over, the ceiling, so `file-size.test.ts` is green at
  10 of 10 — but neither has room for one more line. Folded into the 5.12 work item.
- **`--derive-scale` cannot bootstrap a config.** It calls `loadConfig()` (`build-assets.mjs:154`),
  so the file must exist first — while the error message said *"Run with --derive-scale to produce
  one"*. That was the **second** false message found in this one file. Both corrected.
- **`tools/gen/*.d.mts`, not `.d.ts`.** A `find -name "*.d.ts"` returns nothing and will convince you
  there are no typings. There are seventeen.
- **`tsc` catches test bugs `vitest` cannot.** `motion-framing.test.ts` was passing the motion spec
  where `videoPrompt` wants the STYLE.md `blocks`, rendering a prompt production would never send —
  every assertion still passed, because the motion clause was intact.
- **`validateClipJob`'s parameter is deliberately looser than `ClipJob`** (`ClipJobCandidate`).
  Typing it as `ClipJob` makes the committed **failing** fixtures un-writable in TypeScript, which
  silently deletes the negative half of the gate *(C2)*.

### Where to pick up

1. ✅ **DONE, $0 — `brass-sentry/idle`'s loop snap is NOT an art defect, so clip 8 was NOT bought.**
   **The batch is 7 clips ≈ $8.33 → $31.84, leaving $8.16.** Measured on the packed strip:

   ```
   consecutive steps  0.01355 0.01553 0.01672 0.01277 0.01267 0.00708 0.01890
   wrap (f8 -> f1)    0.02437   against a budget of 0.02032
   per-frame bbox     every frame y[193..382]; f8 alone y[192..382]
   opaque px          23289 23559 23741 23843 23916 23883 23841 23600
   ```

   **Both original hypotheses were wrong.** Vertical alignment is clean to within 1 px, so it is not
   packer drift; and the keying seam (`borderKey` vs `estimateKeyColour`) is not implicated either.
   What the opaque count shows is a silhouette that swells 23289 → 23916 and comes back only to
   23600 — **the cycle closes about one frame short.** Extraction reported `cycle 35 frames
   (2.8 in clip)`: the prompt asked for **exactly TWO** cycles and the model delivered **2.8**, so the
   detected 35-frame cycle is a fraction long and the wrap inherits the remainder.

   **A re-shoot cannot be expected to fix a cycle-detection precision issue**, and it would not even
   reliably change the cycle count — the endpoint has no seed input and is not deterministic. The
   $1.19 was therefore not spent. **The fix, if one is wanted, is in cycle detection, not in art**,
   and the expected-failure lock keeps the defect visible until then.

2. **$0 — upload both padded anchors; record URL + sha256 in `PADDED_ANCHORS`.**
3. **Then submit the approved batch** (≤ $9.52 → $33.03), log every `request_id`, build the
   six-frame contact strip for each and **LOOK at it** — `ffprobe` cannot see what a clip depicts and
   G6 cannot tell discharge from a crop.
4. Then pack, derive fps, run G4/G5, and only then Phase C/D.

**Not started:** W19 spawn-N, `tests/e2e/phase-05-combat.spec.ts` (still does not exist; all 44 e2e
are phases 1–4), the 5.12 splits, the 5.1/5.5 re-runs, the **entire §6 QA gate** (every agent owner,
two briefs each) and the Codex **implementation** review (5.14).
**Phase 5 is failing and must be reported failing.**

---
