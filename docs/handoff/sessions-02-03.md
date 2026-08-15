[← HANDOFF.md index](../HANDOFF.md)

## 8. Session 2 — 2026-08-10. **This section supersedes §4 and §6.**

The full plan is `C:\Users\royko\.claude\plans\resume-phase-5-combat-synthetic-starfish.md`
(revision 2, user-approved). The Codex review of it and its triage are appended to
[reviews/phase-05-plan.md](../reviews/phase-05-plan.md). What follows is only what will not survive in
the code.

### The clip content audit — only 2 of 11 bought clips are shippable

Every clip was judged by eye against the mechanic its sim state names, from the six-frame contact
strips. **KEEP:** `brass-courier/hurt-r2` (recoil peaks ~20 %, correct for 18 ticks) and
`rust-scavenger/chase` (real run, stride 40–50 % of body height; trim the lead-in so f6 loops to f1).
**Everything else is re-shot.** That is an 82 % rework rate against Phase 4's 77 %, and it is not
presented as a good number. `rust-scavenger/walk` is a **sway, not a gait** — stride ≲15 % of body
height — so the pair is currently "idle + run", not "walk + run".

**§5's three "unresolved" clips are now resolved, and the answer was not the one expected.** The
deaths are genuinely back-loaded (collapse begins at frame 4 of 6), *and* the sentry clips are
cropped — but the framing defect, not the back-loading, is what condemns them. `brass-sentry/idle`'s
near-frozen motion turned out to be **correct** for a machine; it is re-shot only for the crop.

### The three defects, root causes

1. **Crop — a parameter, not a prompt.** `ASSET-PIPELINE.md:147-170` already prescribes
   `--aspect_ratio "1:1"` for `bytedance/seedance-2.0/image-to-video`. **Session 1 submitted `9:16`.**
   The sentry is wider than tall, so its square anchor forced into 9:16 lost ~14 % off each side.
   **The prompt was never the problem** — `HOLD_CAMERA` (`motion.mjs:160-163`) already says *"is never
   cropped by any edge"* and the forbid tail already lists `cropped limbs`. Do not try to fix this
   with more prompt words. **And the parameters are in no file at all:** `write-prompts.mjs:28-35`
   writes prompt text, the job is submitted by hand, `.job.json` records only the response.
2. **Hands.** No gate, and the only two hand mentions in the whole prompt corpus are incidental
   (`motion.mjs:226`, `motionCombat.mjs:122`). **No hand gate is being built** — a semantic one is not
   cheap, and the plan says so rather than pretending. The levers are a grip clause and a required
   full-resolution strip review.
3. **Depiction.** The locked anchor carries a **small silver open-end spanner in a belt tool loop**
   with both hands empty — confirmed by eye. The attack clip invented a large two-handed pipe wrench.
   And `src/sim/projectiles.ts` fires a real bolt that nothing draws.

### Three blockers Codex found that were invisible from the code alone

- **`build-clips.mjs` cannot extract any grounded one-shot.** Its non-cyclic branch throws on no foot
  lift; its own comment names `attack` as the case and promises `motionOnset` as the fallback —
  **which is never called.** This blocks *all* packing and is now the phase's first task.
- **There is no projectile event to hang an impact spark on.** `TickEvents` is six booleans, none
  about projectiles; `hitLanded` is the *player's melee*. Off-bounds bolts vanish at
  `projectiles.ts:99-104` with no signal. Solved with **no sim change**: diff the projectile list
  between ticks — present then absent means despawned.
- **`Sentry` stores no firing vector**, and `sentryRenderDesc` hard-codes `flipX:false` (*"A turret
  does not turn."*). Selecting the elevated-fire sheet from the player's *live* position would swing
  the barrel art after the bolt had left. Two integer pixel deltas are stored at spawn instead.

### Traps for whoever picks this up

- **`file-size.test.ts` green does NOT mean "no file over 400 lines."** It asserts *≤10 over-limit
  files, each name-dropped somewhere in `docs/qa/`* — its own comment says *"A ceiling, not an
  assertion that everything is fine."* Criterion 5.12 cannot be evidenced by that test alone.
  The repo is at **10 of 10**; `motion.mjs` is at 388 and `GymScene.ts` at **399**.
- **`enemy-view.test.ts` imports no Phaser.** Every 5.7 assertion today is a pure function. A live
  scene-tree assertion is still owed, and it must run **at 2/60 HP** — a full bar proves nothing.
- **`enemyLayer.ts` still draws Rectangles** and says so: *"step 6 swaps in `Sprite`s."* Nothing had.
- **Nothing writes `public/assets/index.json`** — it is hand-maintained, read at `BootScene.ts:65`.
- **G4 and G5 do not exist.** §4 said "run G4" as though it did. `anchorGate.mjs` (G1) has no CLI —
  it is a test, so session 1's anchor verdicts were produced out of band.
- HANDOFF §4's `GymScene.ts:108,182` is **stale in both numbers and characterisation**: the config
  load is `:140` and the action derivation `:187-189` uses `slugOf`/`actionFromKey`, not string surgery.

### Decisions taken with the user — do not relitigate

Draw the **belt spanner** (Phase 4 art untouched) · **generated bolt still + code trail/spark** ·
**re-shoot all three deaths now** · **buy a second elevated `fire` sheet**, selected by the persisted
shot-time vector. The bolt and `fire-elevated` are **approved expansion beyond the frozen nine-sheet
scope**, so `qa/phase-05-combat.md:65-77` must be amended to ten sheets.

### Spend

$13.99 spent. Plan spends **$9.67** — Batch 1 probe 3 clips $3.57, Batch 2 five generations $5.95,
Batch 3 one still $0.15 — ending at **$23.66 of $40**, leaving $16.34 of rework headroom.
**No descope lever is pulled.** Batch 1's `brass-sentry/fire` changes **one variable** (the ratio) so
the root cause is actually isolated; if it still crops, **STOP and re-plan — do not spend Batch 2.**

### What session 2 actually landed — 6 of 20 work items, **$0 spent**

`git log` from `d231212` to `dbfc206`. Verified after each: **`Tests 669 passed (669)`, 42 files,
typecheck clean.** Every gate was watched go red first and its revert verified by count *(C1/C12)*.

| | What | Where |
|---|---|---|
| **W1** | Grounded one-shots can be extracted at all. `airborne` is now a **data** flag on the motion spec, never an action-name list. Clips can live per slug. | `sampler.mjs` `oneShotOnset`, `clipSource.mjs` |
| **W6** | `Sentry.lastFireDx/lastFireDy` — integer px, frozen at spawn, `null` until first shot. | `src/sim/enemies.ts`, `enemyTurn.ts` |
| **W3** | **G6 edge-bleed.** Fails the real historical `brass-sentry-fire` frame at both edges. | `tools/gen/edgeGate.mjs` |
| **W4** | **G4 vertical drift** + the `verticalAnchor` it derives. Airborne allowance is caller-supplied. | `tools/gen/driftGate.mjs` |
| **W5** | **G5 reach vs active window** — the real thing, not a `gateReachBand` wrapper. | `tools/gen/reachGate.mjs` |
| **W2** | `CLIP_JOBS` — submission parameters in version control. **10 records**, `aspect_ratio` read out of `ASSET-PIPELINE.md` at runtime, not retyped. | `tools/gen/clipJobs.mjs` |
| **W9** | All five prompt corrections + `brass-sentry/fire-elevated`. `style-lock` stayed green. | `tools/gen/motionCombat.mjs` |

**The single most valuable proof in the whole session:** G5's two fixtures share identical frame data,
`peakFrame 3` and `peakTick 7` — yet `startup 6/active 4` **PASSes** and `startup 1/active 2` **FAILs**.
Same data, different window, different verdict. That is what makes the tick mapping real rather than
decoration, and it is the thing a wrapper could never have done.

### Traps this session ADDED — read before continuing

- **`src/sim/enemies.ts` is at exactly 400 lines. Zero headroom.** The rule is `> LIMIT`, proven
  empirically by the suite staying green at 10/10 with the file at 400. **One added line turns the
  whole suite red.** Split before touching it.
- **Never run `npm run test:sim-isolated` while other agents work.** It uninstalls Phaser; a parallel
  agent saw `Cannot find module 'phaser'` and mis-reported it as a `package.json` change by a sibling.
  It self-healed. Recover with `npm i phaser@4.2.1 --save-exact`.
- **`_generated/phase05/video/` holds BOTH round-1 and `-r2` clips for `attack` and `hurt`.**
  `findClip` will correctly refuse them as ambiguous. The round-1 files are superseded, but **deleting
  a file is a standing STOP-and-ask** — it has not been done.
- **`motion.mjs` / `motionCombat.mjs` have a circular-import ordering fragility.** Importing
  `motionCombat` first leaves the `...COMBAT_MOTIONS` spread silently incomplete under Vite — a TDZ
  read that does not throw the way plain Node does. Always import `motion.mjs` first, as
  `write-prompts.mjs`, `build-clips.mjs` and now `clipJobs.mjs` all do. **Flagged, not fixed.**
- **`tools/gen/*.mjs` cannot import TypeScript** anywhere in this repo, and `tools/gen` is outside
  `tsconfig`'s include. G5 therefore **mirrors** `PLAY_LAG_TICKS` and pins it equal to the real export
  with a dedicated test, rather than importing it. That is the closest this boundary gets to
  "derive, never hardcode", and it is a judgement call recorded rather than hidden.
- **A subagent reported "commit" and had not committed.** Verify `git log` yourself, always.

### Where to pick up

**Next unpaid work:** W7 (multi-subject pipeline — `slugConfig.mjs`, namespace `build-assets.mjs`,
split `GymScene.ts` which is at **399**, add a CLI to `anchorGate.mjs`) and W8 (swap `enemyLayer.ts`'s
Rectangles for Sprites). Both are Phase A and cost nothing.

**Then the first spend gate:** W10/W11 (reconcile the record, re-run `genmedia schema`) and **W12,
Batch 1 — 3 clips, $3.57.** That is a STOP-and-ask boundary and the user must approve it.

**Not started:** W7, W8, W12–W20, the entire §6 QA gate (every agent owner, two briefs each), and the
Codex **implementation** review (criterion 5.14). **Phase 5 is failing and must be reported failing.**

### ⚠️ DO THIS FIRST — W2b, the blocker between here and any spend

`assets:clips` **cannot run at all today.** `findClip` (`tools/gen/clipSource.mjs:41-44`) matches both
`<stem>.mp4` and `<stem>-*.mp4`, so `brass-courier/attack` matches **two** files
(`brass-courier-attack.mp4` and `-r2.mp4`) and it throws by design rather than pick — vault 4.16, the
same trap `raw()` in `build-world.mjs` hit. `brass-courier/hurt` is ambiguous the same way.

**Re-shooting does NOT fix this — it makes it worse.** Batch 1 adds `-r3`, taking `attack` to three
candidates; and `hurt` is a **KEEP**, never re-shot, so its ambiguity is permanent. This must be
cleared *before* Batch 1, or $3.57 is spent with the blocker still in place.

**Decision taken 2026-08-10, user unsure and deferred the call:** **declare the winning filename in
`CLIP_JOBS`** and have `findClip` read it from the record instead of globbing the directory. Chosen
because it is the safe option under uncertainty — **nothing is deleted**, every non-regenerable paid
input is kept, it is trivially reversible, and it is the identical pattern that closed the
`aspect_ratio` defect: stop inferring a decision from a filesystem listing, write it down where it
can be reviewed, diffed and tested. It also makes each future re-shoot a one-line record change.

Rejected: deleting the round-1 files (irreversible, ~$2.38 of non-regenerable paid input, and it
still recurs after every re-shoot) and archiving them out of the glob path (a habit, not a gate —
it must be remembered after each round, which is exactly the failure mode this phase already has).

The test must assert every declared filename actually exists, or a record can name a missing file.

---

## 9. Session 3 — 2026-08-10. **W2b is CLEARED. A new blocker took its place.**

Plan: `C:\Users\royko\.claude\plans\resume-phase-5-combat-quirky-graham.md` (revision 2, approved).
Its Codex plan review — **BLOCK, 22 findings, 3 blockers, all three re-verified and CONFIRMED** — is
appended to [reviews/phase-05-plan.md](../reviews/phase-05-plan.md).

### 🔴 THE NEW BLOCKER — G6 false-positives on clean Phase 4 art

**`assets:clips` still cannot complete, but the reason has changed and the new reason is a gate bug.**

W2b worked: `findClip` no longer throws on ambiguity. Execution therefore reached **G6 for the first
time in the project's history** — it was added last session (W3) and `findClip` had been throwing
before control ever got to it. G6 immediately failed the **shipped Phase 4 `idle` clip**:

```
"idle" frame 0 of 12 fails G6 edge bleed — subject mask comes within 3px of the frame on the
right edge(s) (margins: left 30px, right 0px, top 46px, bottom 14px)
```

**This is a false positive, and it was proven by looking, not by arguing.** The rightmost 90 px of
that frame is **pure chroma green with no subject in it** — verified by cropping and viewing it.

**Root cause, pinned to the constant:** `tools/gen/edgeGate.mjs:43` `DEFAULT_MIN_ALPHA = 8`. G6 counts
any pixel with `alpha >= 8` as subject. But `keyOut` (`chroma.mjs:202-222`) is a **soft** key: pixels
between `CHROMA.LOW` and `CHROMA.HIGH` are spill-suppressed and keep a **small non-zero alpha**. That
band is *background*, and G6 is counting it. Measured per column on the true source region:

| region | rows flagged subject (of 1280) |
|---|---|
| leftmost 6 columns | 2, 2, 18, 18, 18, 18 |
| **rightmost 6 columns** | **142, 142, 186, 170, 212, 204** |
| mid-frame (real body) | ~1074 |

Right-edge pixel `[4,231,11]` vs mid-frame **background** `[3,228,6]` — the same colour. The
left/right asymmetry is a faint luminance gradient in the generated background, not a subject.

> ⚠️ **The fix is NOT to raise `minAlpha` until it goes green.** That is the forbidden move — it
> would blind the gate to the real crop it was built for. Whatever is changed must be **re-validated
> against the historical cropped `brass-sentry-fire` frame**, exactly how G6 was validated originally.

### ✅ RESOLVED — and the corrected gate immediately caught a real defect

**User approved "Option A, opaque-only mask" after being shown the measurement.** `DEFAULT_MIN_ALPHA`
is now **255** (`edgeGate.mjs:65`). The threshold is **not tuned**: `keyOut` leaves alpha untouched
only where `d >= CHROMA.HIGH`, and every source frame starts fully opaque, so *"untouched by the
ramp"* is exactly `alpha == 255`. Re-validated **both directions** — the real cropped
`brass-sentry-fire` frame still FAILs, clean Phase 4 `idle` PASSes with 144 px of margin, and all five
pre-existing synthetic fixtures kept their verdicts. `Tests 708 passed (708)`, 47 files.

**The measurement, kept so nobody re-runs it:**

| threshold | real cropped `brass-sentry-fire` | clean Phase 4 `idle` |
|---|---|---|
| `>= 8` (old) | 0px / 0px | 30px / **0px** ← the false positive |
| `>= 32` | 0px / 0px | 114px / 144px |
| `>= 255` (opaque) | **0px / 0px** | 120px / 164px |

A categorical gap, not a knife-edge — which is what made this a correction rather than a tuning.

### 🔴 THE NEW REAL FINDING — shipped Phase 4 `jump` art is genuinely cropped

With `idle` no longer failing first, `assets:clips` reaches `jump` and G6 **correctly** fails it.
**This is not a false positive.** Measured at the opaque threshold, per frame of `jump-clip.png`:

```
frame 0: left=104px right= 82px          <- fine
frame 1: left= 64px right=  0px   col 719 occupied rows 472..524  (53px)
frame 2: left= 54px right=  0px   col 719 occupied rows 404..497  (94px)
frame 3: left= 34px right=  0px   col 719 occupied rows 386..475  (89px)
frame 4: left=  0px right=  0px   col 719 occupied rows 234..1040 (167px)
frame 5: left=  0px right=  0px   col 719 occupied rows 210..291  (82px)
```

**Confirmed by eye at 3× magnification:** it is the character's **hand**, sheared flat by the right
frame edge — no outline on its right side, fingers cut mid-stroke. **5 of 6 frames.** *(The subagent
reported this as a cropped "boot"; the body part was wrong, the conclusion right. Verify agent claims.)*

This was invisible for the whole of Phase 4 and all of Phase 5 so far, because `idle` threw first.
It belongs on the **Phase 4 debt ledger** — that phase was merged *reported failing* — and it is a
**STOP-and-ask**: re-shooting it is Phase 4 art and costs money. **Not decided, not worked around.**

**Note the leverage question this raises:** the five Phase 4 sheets are **already packed and shipped**
in `public/assets/`. Phase 5 does not need to re-pack them — `assets:clips` re-processes them only
because it iterates all of `VIDEO_MOTIONS`. Whether to scope the run per-slug is a live option and is
cheaper than a re-shoot.

### 🔴🔴 THE SPEND PLAN'S PREMISE IS REFUTED — read before spending anything

**User approved a $1.19 re-shoot of `jump` at `1:1`. It was run. Full log:
[generations/phase-05-jump-reshoot.md](../generations/phase-05-jump-reshoot.md).
`request_id 019fecbf-9ad4-7f93-a134-003e743b0a82`. Spend is now $15.18 of $40.**

It was a genuinely **single-variable** probe — same anchor (hash-verified byte-identical across two
different fal URLs), same prompt, same resolution and duration; **only `9:16` → `1:1`.**

**Result: the horizontal crop is fixed and a VERTICAL one replaced it.**

```
f0: left=178 right=192 top=  0 bottom=  0   figureHeight=960  <- fills frame, cut top AND bottom
f3: left= 26 right= 36 top=  0 bottom=106
f5: left=112 right= 16 top=  0 bottom=124
```

Left/right now 16–258 px, never 0. **Top is 0 on five of six frames** — confirmed by eye, the raised
hand sheared flat at `y=0`.

> **What this changes.** §8 recorded the crop as *"the sentry is wider than tall, so its square anchor
> forced into 9:16 lost ~14 % off each side"* — which implies `1:1` restores the missing margin.
> **It does not.** Seedance frames the subject to **fill whatever canvas it is given**; the ratio only
> decides **which edge gets violated**. Framing is a separate axis from ratio, and no ratio value
> controls it. §8's description is consistent with its data but incomplete, and this supersedes it.

**The approved plan's own stop rule now fires.** Of Batch 1 it says: *"changes one variable (the ratio)
so the root cause is actually isolated; if it still crops, **STOP and re-plan — do not spend Batch 2.**"*
This probe **is** that experiment, run on another subject for the same $1.19, and **it still crops**.

**→ Do not spend Batch 2 ($5.95). Re-examine Batch 1 ($3.57) before spending it.** Untested levers,
all previously deferred: **anchor padding** (margin the model cannot frame away), the **margin clause**
(W9 wrote one for combat motions; `jump` lives in `motion.mjs` and never received it), and the fact
that `HOLD_CAMERA` already says *"is never cropped by any edge"* and was not honoured — twice.

**`jump-r2.mp4` is NOT adopted.** `CLIP_JOBS`'s `jump.file` still declares `jump.mp4`, so `findClip`
resolves the original and the new file causes no ambiguity — the W2b guard passing its first real
test. **Neither clip passes G6** (original: right edge; re-shoot: top edge). `jump` is unresolved and
stays on the Phase 4 debt ledger.

### What session 3 landed — verified by the orchestrator, not by agent report

`npm test` → **`Test Files 47 passed (47)`, `Tests 706 passed (706)`** (baseline was 669/42).
`npm run typecheck` clean. **Nothing committed by any subagent — `git log` checked each time.**

| | What | Where |
|---|---|---|
| **W2b** | Winning clip filename is **declared data**, not a glob. `CLIP_JOBS[key].file`; `findClip` takes `declaredFile`. **The dependency is INVERTED from the plan** — `clipSource` stays a leaf importing only `node:fs`, and `build-clips.mjs` passes the value down, because `clipJobs.mjs:32` already imports *from* `clipSource`. | `clipJobs.mjs`, `clipSource.mjs`, `build-clips.mjs:208` |
| **W2b+** | **Two real bugs Codex found, both fixed.** Flat sheet name via `clipStem` (the nested dir was never created); and `submit-clips.mjs` now picks the next free `-rN` and **refuses to overwrite** a paid clip. | `build-clips.mjs:251`, `submit-clips.mjs:20-33` |
| **W7a** | `slugConfig.mjs` — `SLUGS` + `configFor(slug)`, per-slug `reportPath` so one slug cannot overwrite another's evidence. `build-assets.mjs` **373 lines**, under the ceiling. | `tools/gen/slugConfig.mjs` |
| **W7c** | `GymScene` split into `gymConfigLoader.ts` / `gymGeometry.ts` / `gymPixels.ts`, still **399 lines**, now multi-slug. | `src/render/gym*.ts` |
| **W7d** | **G1 has a CLI at last.** Validated on the real historical anchors: original **FAILs at 59 px**, corrected **PASSes at 0**, exit codes 1 and 0. | `tools/gen/anchorGate.mjs` |
| **W8** | Enemy Rectangles → **Sprites** behind `anims.exists()`, with the player's exact `getName()` frame-0 guard. Expiry test uses an **all-six-row** fixture. | `src/scenes/enemyLayer.ts` (137) |

### Traps session 3 added — read before continuing

- **Two parallel agents invented two different names for the same file, and each one's tests passed.**
  The build wrote `character-bounds-brass-sentry.json` while the Gym fetched `brass-sentry-bounds.json`
  — the Gym would have loaded a file the build never wrote. Classic vault 5.3. **Fixed, producer wins,
  and pinned by `tests/unit/gym-bounds-config-path.test.ts`** which asserts the two definitions agree
  for every slug. A third site (`gym-config.test.ts`) had pinned the *wrong* convention. **When
  dispatching parallel agents, any shared artifact name must be fixed in the brief up front.**
- **`enemyLayer.ts:1` changed to `import type Phaser`.** The value import threw `window is not defined`
  under vitest's `node` environment, which is why no prior test imported any `src/scenes/*` file.
  Type-only, elided at build — but it is what makes the file unit-testable at all.
- **W8's frame-0 guard is tested against a mock scene, not a live Phaser `AnimationState`.** The test
  proves the *guard logic* (one `play()` on a real key change, zero on repeats). Proving the animation
  actually advances past frame 0 on screen still needs Playwright — that is criterion 5.4 and it is
  **still unrun**.
- **W7c's positive acceptance is unit-level only.** Nobody drove the Gym in a live browser.

### Where to pick up

**Answer the G6 question first — nothing packs until it is resolved.** Then W7b (namespace
`build-assets.mjs`; it depends on `assets:clips` having produced sheets), then W10/W11, then the
**STOP** before W12 Batch 1 ($3.57). **$0 spent this session. $13.99 total, unchanged.**

**Not started:** W7b, W12–W20, the entire §6 QA gate (every agent owner, two briefs each), and the
Codex **implementation** review (5.14). **Phase 5 is failing and must be reported failing.**

---
