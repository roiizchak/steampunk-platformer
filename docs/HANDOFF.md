# Session handoff — Phase 5 (combat, enemies, hazards)

**Branch:** `phase-05-combat`, 11 commits ahead of `main`, all committed, working tree clean.
**Written:** 2026-08-09, at the end of session 1. **Phase 5 is NOT complete and must not be reported
complete.** The next session finishes it.

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
