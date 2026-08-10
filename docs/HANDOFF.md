# Session handoff — Phase 5 (combat, enemies, hazards)

**Branch:** `phase-05-combat`. **Written:** 2026-08-09 (session 1), **amended 2026-08-10 (session 2)
— see §8, which supersedes §4 and §6.** **Phase 5 is NOT complete and must not be reported complete.**

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
