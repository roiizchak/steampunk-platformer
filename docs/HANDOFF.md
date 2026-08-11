# Session handoff — Phase 5 (combat, enemies, hazards)

**Branch:** `phase-05-combat`. **Written:** 2026-08-09 (session 1), amended each session since.
**§11 (session 5) supersedes §10, which supersedes §9, §8, §4 and §6.**
**Phase 5 is NOT complete and must not be reported complete.**

Read this first, then [PRD.md](PRD.md), then
[prd/phase-05-combat.md](prd/phase-05-combat.md) §6 (the gate), then
[qa/phase-05-combat.md](qa/phase-05-combat.md) (what has already been decided and measured — **read
it before re-measuring anything**).

---

## 1. State in one paragraph

The **simulation is complete and mutation-gated**: combat timings, both enemies, hazards, the kill
plane, world edges, damage in both directions, projectiles. It is **playable as a grey box** — enemies,
spikes and the attack key all work in the browser and I drove them by hand. The **art is bought**:
two enemy anchors and eleven clips, ≈$13.99 of a $40 ceiling, all provenance logged. **Nothing is
packed.** `build-assets.mjs` is still single-slug, so no sheet exists, `renderFrames` is unknown, and
**not one derived fps exists yet**. Most of the QA gate is unrun.

```
622 unit tests / 36 files · 44 e2e · typecheck clean · build + verify-dist ok · test:sim-isolated green
```

---

## 2. What is DONE, with evidence

| Area | Where |
|---|---|
| Combat timing table, one window predicate | `src/sim/combat.ts`, `windows.ts` |
| Both enemies, episode-committed with hysteresis | `src/sim/enemies.ts` |
| Hazards (swept), kill plane, three-edge clamp | `src/sim/hazards.ts`, `worldDamage.ts` |
| Player→enemy damage, once per swing, facing-aware | `src/sim/playerAttack.ts` |
| Sentry projectiles, aimed in 2D | `src/sim/projectiles.ts`, `enemyTurn.ts` |
| Hazards + enemy spawns as LEVEL DATA | `src/game/tilemap.ts`, `tiledObjects.ts`, `level-01.tmj` |
| Enemy render + health bar (drawn-width predicate) | `src/render/enemyView.ts`, `enemyHealthBar.ts` |
| Player HUD bar driven by hp | `src/render/playerHud.ts` |
| Live enemy knobs | `src/render/enemyTuning.ts`, `PlaygroundScene` |
| **G1 anchor contact gate** | `tools/gen/anchorGate.mjs` + 5 fixtures |
| Timing freeze (5.4b) | `docs/qa/phase-05-combat.md` |
| Two anchors + 11 clips, all logged | `docs/generations/phase-05-*.md` |

**Every gate added this phase was watched go red**, with the mutation confirmed applied and reverted
by count. The list is in each commit message; don't redo them.

---

## 3. The gate — honest per-criterion status

**The Owner column is an instruction.** A criterion owned by an agent is **unrun** until that agent
has run it, twice *(A7)*. Almost nothing below has had its owner run. "Code covered" means the tests
exist and pass; it does **not** mean the criterion is met.

| # | Status | What is left |
|---|---|---|
| 5.1 | code covered | qa-expert ×2 |
| 5.2 | code covered | qa-expert ×2 |
| 5.3 | code covered (flap test, mutation-verified) | code-reviewer ×2 |
| 5.4 | **BLOCKED** | Needs packed sheets + real sprites. `EnemyLayer` draws Rectangles today. Then `play` + the frame-index e2e. |
| 5.4b | **DONE** | — |
| 5.4c | **BLOCKED** | Needs packing, then G5. See §5. |
| 5.4d | code covered (hand-computed fps) | qa-expert ×2; and no real `renderFrames` until packing |
| 5.4e | **DONE** | — |
| 5.5 | code covered | qa-expert ×2 |
| 5.6 | code covered (`player-combat.test.ts` collects the open window) | qa-expert ×2 — verify both endpoints are pinned |
| 5.7 | unit done + mutation-verified | **e2e live scene-tree assertion still missing (Codex C8)** |
| 5.8 | partial | Screenshotted at 2/60 HP on the grey box. **Redo at true sprite size once art lands.** |
| 5.9 | code covered + mutation-verified | qa-expert ×2 |
| 5.10 | code covered (named invariant) | qa-expert ×2 |
| 5.11 | **NOT STARTED** | No way to spawn N enemies. performance-engineer. Must measure worst case and distinguish "fast" from "not drawing" *(9.4)*. |
| 5.12 | file-size green | code-reviewer ×2 |
| 5.13 | **DONE** | `docs/reviews/phase-05-plan.md` |
| 5.14 | **NOT STARTED** | Codex implementation review on the diff, `--wait --resume`. **Runs last**, after the agent owners' findings are applied. |
| 5.15 | code covered + mutation-verified | qa-expert ×2 |

---

## 4. Do this next, in this order

### Step 6a — multi-subject pipeline (Codex C2 blocker; everything waits on it)

Hardcoded single-slug in: `build-assets.mjs:45,47,48,51` (`SLUG`, `OUT_DIR`, `CONFIG`,
`LIFT_PROFILE`) plus `findSource`'s action-prefix lookup and the report paths, **and**
`GymScene.ts:108,182` (loads the one `character-bounds.json`, derives its action by string surgery).

- Loop `main()` over slugs × actions; namespace `OUT_DIR`, the catalog key and the lift profile.
- **One bounds config per slug.** Each needs its own saved `scale`.
- `ACTIONS` becomes per-slug: courier `idle walk run jump fall attack hurt death`; sentry
  `idle fire death`; scavenger `walk chase death`. A declared-but-missing action **fails the build**
  by design *(4.16)* — that is wanted, not a bug.
- Cell size stays ONE global 288×384 (decision M3). Record the turret's wasted area as a measured
  number in the QA log.
- `packStrip` already throws on overflow with *"Enlarge the cell — do NOT rescale one animation"*.
  That is the guard that catches an enemy generated at the wrong scale.

> **Scale, and Codex C5.** The build already reads `scale` from config and never computes it, so A5
> holds in practice. What C5 objected to is its *provenance*: the courier's came from the idle sheet,
> a regenerable frame. For the new subjects derive it deliberately once and paste it in. **Note the
> trap I hit:** the anchor is 2048², the clips are 720×1280, so the anchor's figure height is **not**
> the sheet's — you cannot use G1's `figureHeight` directly as the scale basis. Derive from the
> packed source frames, save it, and never recompute.

### Step 6b — measure

Run G4 (vertical drift / per-frame baseline; every new sheet needs `verticalAnchor` in
`character-bounds.json` and a `lift-profile.json` row), then G5. G5 is a real piece of work, not a
wrapper — see §5.

### Then

`assets:fetch`/`assets:verify` (promised by ASSET-PIPELINE.md, undefined in `package.json`, and
`findSource`'s own error message tells the user to run one) · 4.12 `findSource` deliberate-removal
red run · Gym async-load guard · the 5.11 spawn-N mechanism · then the **QA gate**: agent owners ×2
briefs each, **then** the Codex implementation review.

---

## 5. Things you will not work out from the code

**G5 is not a wrapper around `gateReachBand`.** I said it was, and Codex C1 proved me wrong.
`gateReachBand` returns ONE best candidate against a whole-frame noise floor. G5 needs a per-frame
reach **profile**, component isolation, left-facing handling, and — the whole point — a mapping from
frame index to **the tick it is actually drawn on**. A frame index never compared to its playback
tick proves nothing about the active window. Align by spending `startup − 1` ticks on frames
`0..hit-1`, because `play()` runs in the render pass *after* the tick that entered the state.
`INDETERMINATE` is a legal verdict and must be recorded as one.

**There is a stated expectation waiting for G5 to contradict.** `brass-courier/attack`'s reach peaks
**late** — ~5/6 through the clip — while the active window is ticks 6–10 of 20 (30–50 %). I wrote
that down *before* measuring so the answer cannot be quietly rounded to a pass. If G5 says FAIL, the
fix is a re-shoot, not a threshold.

**`poseSpan` works, `SPAN_CLIP` does not.** 4 of 4 clips using three timed poses hit their specified
poses; 2 of 2 using `SPAN_CLIP` failed. `SPAN_CLIP` describes a *shape* and the model satisfies it
literally — asked to swing a spanner it raised it and lowered it. Use `poseSpan` for every one-shot.

**`ffprobe` cannot see what a clip depicts.** All nine round-1 clips reported identical perfect
container properties; two were unusable. **Always build the six-frame contact strip** — it is free:
```
ffmpeg -v error -y -i clip.mp4 -vf "select='not(mod(n\,16))',scale=130:-1,tile=6x1" -frames:v 1 out.png
```

**G1 cannot tell a boot from a hand.** It measures ground-contact components and assumes they are
what the subject stands on. Any new subject putting something else into the bottom 12 % of its
height must say so in its concept, or its verdict answers a different question.

**Three clips are unresolved and deliberately not re-shot:** `brass-sentry/idle` (near-frozen —
may be correct for a machine), `rust-scavenger/walk` (possible near-idle), and all three `death`s
(look back-loaded). **The back-loading may be an artefact of my measurement**: contact strips sample
evenly, `sampler.mjs` selects on a difference matrix. Measure before spending.

**Mutation-testing trap I hit twice.** Restoring a mutated file from a stale backup — or from
`git checkout HEAD --` when HEAD predates your uncommitted work — silently reverts real changes.
Back up to a fresh temp copy immediately before each mutation, and verify the revert by count.

**PowerShell here-strings and backticks break inside the Bash tool.** Backticks inside a `node -e`
double-quoted string get command-substituted by bash and vanish from your doc comments. Use a
heredoc or write the script to a file.

---

## 6. Open decisions for the user

1. **7.5 MB of anchor art now sits under `public/`** and Vite copies it into `dist/`. This grows the
   recorded debt about relocating anchor art out of the shipped payload. Relocation is a
   **STOP-and-ask** and has not been done.
2. **Six enemy clips where the plan priced ten.** `telegraph`, scavenger `idle`/`attack`/`hurt` were
   dropped because each needs a sim window that does not exist; `hurt` uses the plan's own named
   lever, a tint flash off the `hitLanded` event. Each is one mechanic change from being worth
   buying. Reasoning in `docs/qa/phase-05-combat.md`.
3. **≈$26 of the $40 ceiling remains.** Rework so far is 2 of 11 against Phase 4's 77 %.

---

## 7. Verify before believing anything above

```bash
npm run typecheck && npm test && npm run test:sim-isolated
npm run build            # ends in verify-dist
npm run test:e2e         # workers:1
```
Then kill dev servers **by port** *(C13)* — Playwright launches `node ./node_modules/vite/bin/vite.js`
directly, and `npm run dev`'s wrapper orphans the real process on Windows.

**A phase with a failing or unrun criterion is reported failing.** Most of §3 is unrun.

---

## 8. Session 2 — 2026-08-10. **This section supersedes §4 and §6.**

The full plan is `C:\Users\royko\.claude\plans\resume-phase-5-combat-synthetic-starfish.md`
(revision 2, user-approved). The Codex review of it and its triage are appended to
[reviews/phase-05-plan.md](reviews/phase-05-plan.md). What follows is only what will not survive in
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
appended to [reviews/phase-05-plan.md](reviews/phase-05-plan.md).

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
[generations/phase-05-jump-reshoot.md](generations/phase-05-jump-reshoot.md).
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

## 10. Session 4 — 2026-08-11. **The measurement killed the planned probe; a better one confirmed the cause.**

Plan: `C:\Users\royko\.claude\plans\resume-phase-5-combat-pure-crane.md` (revision 2, approved).
Its Codex plan review — **BLOCK, 4 blockers, all four re-verified locally and CONFIRMED** — is appended
to [reviews/phase-05-plan.md](reviews/phase-05-plan.md).

**Spend: $15.18 → $16.37 of $40. $23.63 remains.** One generation, user-approved, and it was **not**
the one the plan budgeted for — see the two blocks below in order.

> ### ✅ THE PROBE THAT DID RUN — and it worked
>
> After the padding probe was cancelled (next block), the data pointed at **reframing** instead, and
> a single-variable ratio-match re-shoot of `brass-sentry/idle` confirmed it.
> **`request_id 019fef56-67bf-7922-943c-417809ed8ba0`**, full log in
> [generations/phase-05-ratio-match.md](generations/phase-05-ratio-match.md).
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
[reviews/phase-05-plan.md](reviews/phase-05-plan.md). **8 confirmed, 1 partly refuted.**

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

**8 clips ≈ $9.52, landing at $33.03 of $40, leaving $6.97.** Approved with both stop rules
explicitly on the table (batch over 5; crossing $30). The 7 measured failures **plus**
`brass-sentry/idle`, with the instruction: *"Do option one if needed. Do the 8 clip batch."* —
i.e. run the **$0 investigation of idle's loop snap first** and do not waste $1.19 if it turns out to
be a keying/sampler bug rather than art.

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

1. **$0 — diagnose `brass-sentry/idle`'s loop snap.** Keying seam first (`borderKey` vs
   `estimateKeyColour`), then the sampler's cycle boundary. Decides whether clip 8 is worth buying.
2. **$0 — upload both padded anchors; record URL + sha256 in `PADDED_ANCHORS`.**
3. **Then submit the approved batch** (≤ $9.52 → $33.03), log every `request_id`, build the
   six-frame contact strip for each and **LOOK at it** — `ffprobe` cannot see what a clip depicts and
   G6 cannot tell discharge from a crop.
4. Then pack, derive fps, run G4/G5, and only then Phase C/D.

**Not started:** W19 spawn-N, `tests/e2e/phase-05-combat.spec.ts` (still does not exist; all 44 e2e
are phases 1–4), the 5.12 splits, the 5.1/5.5 re-runs, the **entire §6 QA gate** (every agent owner,
two briefs each) and the Codex **implementation** review (5.14).
**Phase 5 is failing and must be reported failing.**
