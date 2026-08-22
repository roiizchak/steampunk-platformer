# Next session — the bug-fix session

← [PRD spine](PRD.md) · [HANDOFF](HANDOFF.md) · [qa/phase-09-polish.md](qa/phase-09-polish.md)

> **This session fixes bugs. It does NOT start Phase 10.** Owner's ruling, 2026-08-22. Phase 10 is
> deferred and its blocking question (where the game ships to) is not asked here — see §7.
>
> Written at the close of the Phase 9 session by the integrator, while the context was still live.
> **Read [HANDOFF.md](HANDOFF.md) first.** `main` is `20b0539`, pushed. Phase 9 is merged and
> owner-approved.

---

## 0. How this session works — read before touching anything

This is a **fix** session, not a feature session, and the failure mode of a fix session is specific:
you fix the symptom, the suite goes green, and the defect is still there. Phase 9 found **twenty-two**
gates that asked whether a value *came back* rather than whether it could *do anything*. So:

1. **Every fix ships with a gate, and the gate is watched failing first** *(C1)*. Build the mutation
   the fix's claim actually names — not the convenient one. Confirm the revert by "content changed
   AND the original occurrence count dropped by one" *(C12)*, **never** by "the count is now zero".
2. **A bug the owner reported by eye is closed by eye** — measure pixels or count emissions, then
   show it. An evidence clip was once approved this project for effects that were not on screen,
   because they were *inferred* from sim state rather than observed. Keep the clip; do not delete it.
3. **Fix at the root, not at the caller.** Grep every caller of a function before changing it. One
   guard in the shared function is a smaller diff than a guard in each caller — and patching only the
   path the report names leaves every sibling still broken.
4. **Work the list in order.** §1 is player-visible; §2 is only the suite. If time runs short, §2 is
   what gets dropped — say so explicitly rather than reporting the session done.
5. A defect you decide **not** to fix gets a one-line reason in `docs/qa/` *(C11)*. Silently skipping
   one is not permitted.

---

## 1. Player-visible defects — fix these first

### 1.1 The jump clip reads 69% of idle · **owner-reported**

The owner played the merged build and reported: **the jump animation looks different from the rest,
and looks smaller.** Measured before being written down, so this starts from numbers.

Drawn figure height per frame — opaque rows inside the 336 × 384 cell, read off the shipped
`public/assets/characters/brass-courier/sheets/*.png` with `tools/gen/png.mjs`:

| clip | per-frame heights | mean | vs idle |
|---|---|---|---|
| idle | 287–289 | 288.1 | — |
| walk | 286–292 | 288.9 | 100% |
| attack | 283–289 | 287.6 | 100% |
| run | 261–279 | 275.7 | 96% |
| fall | 277,263,246,224,206,203,206,218,232 | 230.6 | starts full, tapers |
| **jump** | **215,186,195,201,204,197** | **199.7** | **69%** |
| death | 288 → 64 | 145.2 | shrinks legitimately (the character collapses) |

**Jump never reaches full height on any of its six frames** (max 215). Fall's *first* frame is 277 —
an airborne pose can read near-full height on this character, so a tucked pose alone does not
explain jump.

**Lead 1 — jump has no `_actionScale` override and may need one.** In
`public/assets/config/character-bounds.json`, `fall` carries `scale: 0.6`, `attack` `0.6` and `death`
`0.60504202` — per-(slug, action) overrides for clips shot from **padded** generations. **`jump`
carries none**, so it packs at the unpadded slug default `0.23723229`. Jump and fall are the airborne
pair and both use `verticalAnchor: "centroid"`; one having a padded scale and the other not is the
asymmetry to check first.

> ⚠️ **Do not paste 0.6 into jump.** A straight missing 0.6 override would put jump at roughly **40%**
> of idle, and it measures **69%**. If lead 1 is the cause at all, jump's padding differs from fall's
> and the number must be **re-derived**, never guessed.
> `node tools/gen/build-assets.mjs brass-courier jump --derive-scale` prints it and **a human pastes
> it**, in that order *(vault A5)*. `assets:build` **reads** the scale and never computes it.

**Lead 2 — "looks different" is probably the derivation path, not the pose.** In
`public/assets/index.json`, `jump` and `fall` are `derivedFrom: "sim"` while `idle`, `walk` and `run`
are `"authored"`. The airborne clips came through a different pipeline from everything the owner is
comparing them against. Read `tools/gen/motionAirborne.mjs` and `clipAnchors.mjs` before concluding
anything about the art.

**Before regenerating anything:** re-read [ASSET-PIPELINE.md](ASSET-PIPELINE.md) and
[STYLE.md](STYLE.md); the art direction is locked by `tests/unit/style-lock.test.ts` and **a red hash
is an approval checkpoint, never something to clear by editing the hash**. **Regenerating `idle`
re-derives the slug scale and silently rescales every other animation** *(vault A5)* — idle is
rebuilt FIRST or not at all. **A fal batch over 5 generations is a STOP-and-ask.** Prefer a config
fix to a regeneration; spending fal money on a number re-derivable from frames already on disk is the
expensive way round.

### 1.2 The landing effects are one tick out of phase with each other

`applyShake(camera, tick)` draws from the frame's `tickCount`, while the landing squash three lines
above it draws from `tick - 1`. Two effects fire on the same event and are drawn one tick apart.
Consequence: of `SHAKE.land`'s **3** ticks the renderer can only ever put **2** on screen.

Found while fixing criterion 9.2 and **deliberately left alone there**, on the grounds that a one-tick
phase change to a shipped effect is a balance decision needing its own gate — which is what this
session is for. Recorded in `tests/e2e/phase-09-polish.spec.ts` beside the `running` filter and in
`tests/e2e/polishSeries.ts`'s `coveredLanding`.

**Decide deliberately, do not just align them.** Either phase is defensible; what is not defensible is
that they disagree by accident. Whichever way it goes, the 9.2 spec's `(landTick, landTick + span)`
window is written against the current behaviour and must move with it.

### 1.3 `iFrameCounter` is paused by the player's own outgoing strike

Any player freeze stops `iFrameCounter` (`src/sim/combat.ts`), **including a freeze caused by the
player's own attack**, because `applyPlayerAttack` passes the player into `freezePair`
(`src/sim/playerAttack.ts`). Reachable and driven end to end: hurt lasts 18 ticks while invulnerability
lasts 45, leaving **27 actionable invulnerable ticks**; landing a hit inside that surplus pauses the
attacker's own remaining grace period, extending invulnerability.

Codex found this; it was confirmed by driving the sim, and the behaviour was **kept** with a ruling
written into `stepCombat`'s header and a gate (`hitstop-frozen-counters.test.ts`) pinning it. The
argument for keeping it: `IFRAME_TICKS`'s surplus is *actionable* ticks, and you cannot act while
frozen.

**This is on the list as a decision to re-take, not as an assumed bug.** If the ruling stands, leave
it and say so. If it goes, the gate pins the current behaviour and must be inverted deliberately.

### 1.4 `run`'s stride is provisional

`CLAUDE.md` states it outright: animation timings are settled for `idle`, `walk`, `run`, `jump` and
`fall`, but **"`run`'s stride is still provisional and is the number to distrust."** Foot-plant is a
hard constraint here — `ticksPerFrame × speed === footPxPerFrame` with a whole `ticksPerFrame`, which
is why `chaseSpeed` came out as a quotient rather than a taste. Check whether run's feet actually
plant at the shipped `footPxPerFrame: 18`, or whether it slides.

---

## 2. Gate gaps — the suite is weaker than it looks

None of these is visible to a player today. Each one is a mutation that **passes**, which means the
behaviour it covers can regress silently tomorrow. Every entry below was demonstrated green by an
adversarial review agent and re-verified.

> ⚠️ **Re-confirm each is still open before fixing it.** Several were found before the Codex fix round
> and the 9.2 repair; some may already be closed. Apply the mutation, watch the suite, then decide.

| | mutation that stays GREEN | what regresses unseen |
|---|---|---|
| 2.1 | delete both `onStop` settles in `src/scenes/hudFade.ts` | the level-complete fade never force-settles on stop — the criterion 9.4 the phase actually names |
| 2.2 | delete `this.gearPop?.pop();` in `src/scenes/UIScene.ts` | the gear pop is never asserted wired; its sole call site can vanish |
| 2.3 | `blend NORMAL` → `ADD` in `gameEffects.ts` | one batch flush per frame forever, invisible in a screenshot — the exact argument `effects-draw-path.test.ts` was created to close, which closed `depth` and `tint` and left blend out |
| 2.4 | `reserve` → 0, `maxAliveParticles` → 10000 | pinned only as facts about the table; e2e overwrites both, so nothing can see them |
| 2.5 | `emitting: false` → `true` | every emitter becomes a continuous fountain at (0,0) |
| 2.6 | drop the square in `perSecondSquared` | gravity 60× weak; the helper's own docstring says it exists so a value cannot be converted at the wrong order |
| 2.7 | the attack contact-frame **snap** (`anims.pause()` / `setCurrentFrame` / `resume`) | the frame *index* is pinned, the behaviour is not; a broken build holds a mid-wind-up pose and nothing tells it from the fixed one |
| 2.8 | `PARTICLE_RADIUS` 6 → 1 | particle size ungated |
| 2.9 | — | `IMPACT_BY_FREEZE`'s totality depends on three freeze lengths being distinct; nothing asserts `size === 3`, so a retune collapses the map silently and a light hit fires a `hurtVent` |
| 2.10 | — | `destroy()`'s idle branch has no fixture, and it is the common one — reached from `UIScene.applyLayout` on every resize |
| 2.11 | — | scene shutdown is a stop path with **no** force-settle: `TweenManager.shutdown()` → `killAll()` → `destroy()` dispatches no `onStop`. Undocumented. The `hud-gear-pop` fake's `stop()` unconditionally calls `cfg.onStop?.()`, which real Phaser does not (`BaseTween.js:507-517` guards on `!isRemoved() && !isPendingRemove() && !isDestroyed()`) |
| 2.12 | — | `spriteFeedback.ts` cites the wrong test file in two places *(C9)* |

**2.11 is the one to read carefully** — a fixture that re-implements the contract it is testing is the
same defect class as §1's, one layer down.

---

## 3. G.7b — the inherited perf gate

**Check its state first.** A repair was in flight when this was written and may have landed:
`git log --oneline main -5`, and look for a `worktree-agent-*` branch. **Re-verify before merging
rather than trusting the agent's report.**

`tests/e2e/phase-08-gate-perf.spec.ts:264`, criterion **G.7b** — a **Phase 8** criterion, inherited.
Fails roughly **3 runs in 8**, on `main` as well as on the phase branch. Last observed failure had
**both arms reading `0.0000 ms`**:

```
the per-exit cost measured at 20 copies (0.0000 ms) and at 40 (0.0000 ms) disagree by 25.6x.
```

Diagnosis, settled, in [qa/phase-09-polish.md](qa/phase-09-polish.md) § Vault-out §5:

> the failing shape is **reducing each arm to a single UNPAIRED median, then subtracting or dividing,
> when the effect is within a few timer quanta.** `performance.now()` quantises to **0.1 ms** here.

The repair is criterion 9.5's and needs **both** halves — pair the observations and take the median of
per-round *deltas*, **and** separate the arms far enough that the effect clears the grid. Pairing
alone still ordered only 4 runs in 6.

**Forbidden:** moving the bound, `test.skip`, deleting the gate. *A statistic that cannot order its
own mutation is not fixed by moving the bound — replace the statistic.*

---

## 4. Standing constraints — none of these are negotiable

- **Every agent that can touch files runs under `isolation: "worktree"`.** No agent merges its own
  work; no agent commits to `main`. A ban written into a brief is not enforcement — six Phase 8
  agents corrupted the shared tree and a commit captured it.
- **A subagent's summary is a claim, not evidence.** Re-verify locally whatever it could not run.
- **Withhold findings between adversarial briefs** *(A7)*; brief 2 never sees brief 1's output.
- **No new dependency.** Runtime `phaser@4.2.1` exact; dev `vite`, `typescript`, `vitest`,
  `@playwright/test`. Anything else: STOP and ask.
- **`src/sim/` imports nothing from Phaser**, reaches no clock, no `Math.random`, no DOM, no Arcade
  Physics. Every duration is an integer count of 60 Hz ticks; every distance is pixels.
- **Do not renumber `src/sim/tick.ts`'s 14-step order.** Lettered inserts only — renumbering is a
  balance change and needs a STOP-and-ask.
- **No source file over 400 lines** without a written justification in `docs/qa/`.
- **`window.__game` is closed at eight fields.** A ninth needs a STOP-and-ask.
- **STOP and ask** before: a new dependency · deleting a file · a fal batch over 5 generations · a
  ninth `__game` field · contradicting STYLE.md / PRD.md / LESSONS-APPLIED.md · renumbering the tick
  contract · merging to `main`.

### Testing rules that bind every change here

- **Watch every gate fail before trusting it** *(C1)*; confirm the revert by "content changed AND the
  original count dropped by one" *(C12)* — **never** "the count is now zero".
- **Detect redness positively** from `Tests N failed` plus named specs; **detect greenness positively
  too, including the test COUNT.** A run that selected nothing reports `expected: 0, unexpected: 0`
  and exits 0. **A zero exit through a pipe is `tail`'s exit, not the gate's.**
- Drive mutation loops **from the shell**, never from a Node script.
- **Only one Playwright run at a time, and nothing heavy beside it.** Kill the dev server by port
  between runs — Playwright leaks 5173 on Windows.
- **A perf bound is chosen on one set of runs and confirmed on a HELD-OUT set** that had no say in it.
  **Never attribute a perf red from one run per arm** — that mistake was made on G.7b and was wrong.
- **The headless harness is not the frame rate** — SwiftShader inflates e2e ms ~21×.
- **Never `waitForTimeout`.** Wait on `window.__game.ready`.
- **Never re-derive an event edge from two samples of a level** — read the sim's stamp.

---

## 5. Verification before anything is called done

```bash
npm run typecheck                 # tsc --noEmit
npm test                          # unit — read the COUNT, not the exit code
npm run build                     # tsc + vite build + verify-dist.mjs
npm run test:sim-isolated         # recover with: npm i phaser@4.2.1 --save-exact
npm run test:e2e                  # one at a time, nothing heavy beside it
```

At the close of Phase 9 these read: typecheck clean · unit **2154 pass / 0 fail** (133 files) ·
build exit 0 with `verify-dist ok: 5 level(s) and 11 audio file(s) byte-identical` ·
`test:sim-isolated` **2151 passed / 3 skipped** · e2e **118 passed / 1 failed** (the failure is
G.7b). **Anything worse than that is a regression this session caused.** Every fix in §1 and §2 should
*raise* the unit count — a fix that lands without raising it probably shipped without a gate.

---

## 6. Do not re-litigate these — already decided

| | decided |
|---|---|
| Hit-stop shape | per-body integer tick counter; **both** bodies freeze the same count, the world keeps ticking. User ruling. |
| The tick contract | 14 numbered steps, authoritative. Phase 9's additions went in as lettered inserts 4a/4b/4c and 9b/9c/9d. Not to be renumbered. |
| `_actionScale` lives in the config | on purpose *(vault A5)*. `assets:build` reads it, never computes it. |
| The perf failure shape | unpaired median per arm — **not** "a ratio with a quiet denominator". That first diagnosis was written down, refuted and corrected. |
| Phase 9's evidence clip | approved twice; the first approval was withdrawn because it predated the emit-window fix. Closed. |
| G.7b's attribution | **not** Phase 9's. Established across eight runs on both branches. |
| The emit window | `hitTick >= cursor && hitTick < tick`. The old `(cursor, tick]` form meant no spark, plume or vent ever fired. Do not "simplify" it back. |

---

## 7. Explicitly NOT in this session

- **Phase 10 (Build and ship).** Deferred by the owner. When it does start it is blocked on one
  question no document in this repo answers — **where does this game ship to?** — because vault items
  10.4 and 10.5 need a rollback command and a CSP configuration, both properties of a hosting target.
  Do not ask it this session and do not pick a target on the owner's behalf.
- **New features.** This session fixes what exists.
