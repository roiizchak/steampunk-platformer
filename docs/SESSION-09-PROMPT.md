# Session 9 — continuation prompt

> Paste this whole file as the first message of the next session.

You are resuming **Phase 5 (combat + combat art)** of the Steampunk Platformer on branch
`phase-05-combat`, at **HEAD `a819d40`**. **Phase 5 is FAILING and must be reported failing** until
5.8 and 5.11 are resolved. Nothing merges to `main` without my approval.

## Read first, and do NOT re-derive anything they already record

- `docs/HANDOFF.md` **§14** — supersedes §13 and everything above it.
- `docs/qa/phase-05-combat.md` — especially the **session-8 gate section** (22 findings, IDs F/P/T),
  the **P4 real-hardware** section, and the **user video playtest** section at the end.
- `docs/reviews/phase-05-impl.md` — the **session-8 Codex review** (BLOCK, 4/4 confirmed).
- `docs/prd/phase-05-combat.md` §6 — the gate.
- `CLAUDE.md`.

**Everything in those documents is measured. Re-measuring it wastes the session; the traps below are
the ones that actually cost time.**

## State

```
275→276 suites · 904 tests · 0 failed · 64 test files
e2e 47 passed · sim-isolated 904 with Phaser uninstalled · typecheck clean · verify-dist ok
0 source files over 400 lines · $41.36 of the $55 ceiling spent
```

**Closed in session 8:** P1 (dead enemies acting), P3 (hitstun — three passes: horizontal, jump,
jump-cut), S1/S2 (chase dead zone + patrol clamp), knockback (scoped in Phase 5, never built),
the grey-box enemy, 5.12 (8 files over 400 → 0), sentry facing, walk resampled 12 → 24 frames.

**P4 is not a defect on real hardware.** RTX 4080: 4.2 ms median, 240 fps, 12/12 poses, against
90 ms headless. Every P4 number before session 8 came from SwiftShader.

---

## Work item 1 — FIRST, and it is 30 seconds

**Hard-reload the game (Ctrl+Shift+R) and look at the walk.** Session 8 resampled it 12 → 24 frames
(15.65 → 31.30 fps) and verified **all 24 poses paint** in a fresh Chrome profile — but the user
reported it still looked the same, and the asset URL is unchanged, so a cached `walk.png` is the
prime suspect. **Confirm or refute before doing anything else.** If it still looks unchanged after a
hard reload, the diagnosis is wrong and everything in work item 2 is built on sand.

## Work item 2 — the sentry fires from its belly

`src/sim/enemyTurn.ts:61`:

```js
fireProjectile(sentry.x, muzzleY, player.x, chestY, SENTRY.projectileSpeed, SENTRY.damage)
```

`sentry.x` is the body's **centre**; `muzzleY` is `sentry.y - (SENTRY_BOX.h / 2) * scale`, the
vertical **middle**. **There is no muzzle offset.** The user reported it from a screen recording.

- The sentry now HAS `facing` (added session 8, `7774e7e`) — offset along it.
- `lastFireDx` / `lastFireDy` are already frozen at fire time **for a renderer to aim a barrel**, and
  **nothing reads them** (`enemySentry.ts:45-47`). Either use them or say why not.
- Deferred from session 8 by user decision, to keep the 5.14 sign-off intact. **It voids 5.14 again,
  which is fine — 5.14 must re-run this session anyway.**

## Work item 3 — the four paid-for enemy sheets

`brass-sentry-fire`, `brass-sentry-death`, `rust-scavenger-chase`, `rust-scavenger-death` were all
generated in Phase 5, have logged request IDs, and have surviving `.mp4` sources with 3–5 takes each
under `_generated/phase05/video/`. **They were never adopted. Adopting them costs $0** — extraction,
chroma key and packing are local tooling.

This is what the user's "there is no KO animation" complaint actually needs.

⚠️ The generation log records an audit judging the sentry clips **"cropped at the left and right"**.
**Expect G6 edge-bleed failures and do not force them through** — see work item 4's warning.

Adopting `rust-scavenger-chase` also **dissolves finding T10**, which recorded that 5.3's chase
commitment is unobservable on screen because the chase sheet does not ship.

## Work item 4 — run / jump / fall smoothness, and what it costs

Measured in session 8, do not re-derive:

| | now | source | verdict |
|---|---|---|---|
| walk | **24 fr, 31.30 fps** | 27 fr/cycle | **done** |
| run | 12 fr, 26.67 fps | **~13 fr/cycle** | **at the ceiling** — needs new art |
| jump | 6 fr, 20 fps | fails **G6** at 8/9/10/12 | needs a re-shoot |
| fall | 6 fr, 20 fps | fails **G6** at 8/10/12 | needs a re-shoot |

🔴 **Both jump clips fail G6.** The declared `jump.mp4` has a documented defect, and the undeclared
`jump-r2.mp4` sibling fails at frame 0 with the head cropped at the top — which is presumably why it
was never adopted. G6's own message says such a clip **"must be re-shot, not packed"**.

**Any re-shoot is fal spend and needs a fresh STOP-and-ask with a price first.** $13.64 remains.

## Work item 4b — the user thinks the character simply moves too fast. TEST IT.

Raised by the user, 2026-08-13, after the walk resample: *"Maybe we just slow down the character.
Maybe he just moves too fast."*

**This is a legitimate preference and does NOT contradict session 8's correction.** Session 8's error
was the *arithmetic* — claiming the speed was 6× off its documented target. It is not: measured top
speed is **2.50 body heights/sec, exactly the Phase 4 target**. But that target was a *choice*, and
the user is entitled to change it. Treat this as tuning, not as a bug, and **do not re-run the
6× retune** — see the trap at the end of this file.

🔴 **The trade, and it cuts against the smoothness complaint.** `simTicks = round(stridePx / topSpeed)`
and `fps = frameCount * 60 / simTicks`, so **a slower character takes more ticks per cycle and the
same frames spread thinner. Slowing down makes the animation CHOPPIER.** Derived stride is fixed by
the art: run **324 px**, walk **255 px**.

| speed | run ticks | run fps | walk ticks | walk fps (24 fr) | body heights/sec |
|---|---:|---:|---:|---:|---:|
| **×1 (shipped)** | 27 | **26.7** | 46 | **31.3** | **2.50** |
| ×0.85 | 32 | 22.5 | 54 | 26.7 | 2.13 |
| ×0.75 | 36 | **20.0** | 61 | 23.6 | 1.88 |
| ×0.6 | 45 | **16.0** | 77 | **18.7** | 1.50 |
| ×0.5 | 54 | **13.3** | 92 | **15.7** | 1.25 |

Cinema is 24 fps. **A 25 % slowdown puts run back under the fusion threshold** the user just
complained about.

Three ways out — **have the user judge them in the running game, do not pick one by argument:**

1. **Slow down and accept choppier run** until run gets new art. Cheapest; makes the complaint the
   user just raised worse.
2. **Slow down AND raise run's frame count.** The only option that satisfies both — and run's source
   clip holds only ~13 frames per cycle, so **it needs a re-shoot: fal spend, fresh STOP-and-ask.**
3. **Slow down and hold `simTicks` fixed** (stop re-deriving it). The animation rate is preserved and
   the stride stops matching ground travel — **that is vault 4.22 foot-slide**, the exact failure this
   project paid to avoid. **Measure the slide** so the user judges a number, not a vibe.

Also worth putting in front of the user: **jump height and airtime do NOT scale with horizontal
speed.** Airtime is fixed at 37 ticks (rise 18 / fall 18) because `tick.ts`'s order is authoritative
and Phase 5's combat windows are written against it. So slowing horizontal movement **shortens jump
distance proportionally** — at ×0.75 the 3-tile gap in `level-01` goes from a 27.8-tile capability to
~20.8, still fine, but check the level at whatever value is chosen. **Do not touch the `.tmj`.**

## Work item 5 — a real hole in the asset pipeline

`build-assets.mjs` writes a catalog row **only** when `hasCatalogTiming(slug, action)` is true, and
`catalogTimings.mjs` carries timings for **`rust-scavenger` only**. So packing a `brass-courier`
sheet updates the PNG and **silently leaves `index.json` stale**. Session 8 hit exactly this: a
24-frame sheet with a catalog still saying 12, which would have looped half a cycle.

**No gate compares a packed sheet's pixel width against its catalog `frameCount`.** Add one. It is
cheap, it is vault C2 ("a gate that cannot go red is decoration"), and it would have caught this.

## Work item 6 — the QA gate, and it is the blocker

**5.8 — needs the USER'S eyes, not an agent's.** The enemy health bar renders as a small red sliver
at true sprite size. "Legible" is a human judgement *(vault C4)* and an agent asserting it has
reported nothing. Drive the game, screenshot it, **ask**.

**5.11 — FAILING as a measurement, and do not "fix" it by changing the tolerance.** Three
independent problems, all with evidence in the QA log:

1. The gated spec has **never run on anything but SwiftShader**. The 4.2 ms real-hardware figure came
   from a manual probe, not the spec.
2. The **"worst-case" fleet spawns entirely outside the viewport**: `DEV_FLEET_OFFSET_X` 200 ×
   `RENDER_SCALE` 6 = 1200 screen px against a 960 px visible half-width. **0 of 20 on screen**,
   exactly **8 of 20** inside `detectRadius`. (That 8 independently explains the 12 grey Rectangles:
   20 − 8 = 12.)
3. `medianMs < 100` was **never a budget** — no baseline exists (S4, PRD §7).

**This needs a redesign decision from me, not a patch.**

Then the rest of the gate: **two blind briefs per owner *(A7)*, dispatched simultaneously** — that is
what makes brief 2 actually blind. Every finding **applied or recorded with a one-line reason**
*(C11)*. Then **criterion 5.14, the Codex implementation review, LAST**.

## The cheapest real improvements, if there is time

- **T6** — criterion 5.1's vertical term is untested: every sentry fixture is `y:0`/`playerY:0`, so
  deleting `dy * dy` from `withinRadius` reds **nothing**. One fixture fixes it.
- **T2** — nothing swings the attack to an actual kill; both 5.10 and 5.16 set `hp = 0` directly.
  **This is the gap that let P1 ship past the entire gate.**
- **T13** — the six modules extracted from `GameScene.ts` have no tests. `parallaxRig.ts` returning
  `100 + i` instead of `-100 + i` would draw the backgrounds over the player, green everywhere.
- **T8** — `verify-dist`'s four identifier greps **cannot go red** under minification (proven:
  `stepScavenger` and `createScavenger` both grep 0 while shipping). Codex's fix is better than more
  greps: a Vite `generateBundle` assertion that DEV-only modules contribute **zero rendered bytes**.

## Traps that cost real time in session 8 — read these

- 🔴 **`player.x`, `vx` and `runMax` are ALREADY in world pixels.** `toWorld` scales only the *box*
  (`x: feetX + forward * scale`). I multiplied by `RENDER_SCALE` a second time, concluded the game
  was 6× too fast, and got a full retune approved on it. It was wrong. Top speed is **2.50 body
  heights/sec**, exactly the documented target — and `tests/unit/tilemap-data.test.ts` pins that
  contract, which is what caught it. **Never re-derive a body-heights figure by multiplying a sim
  speed by `RENDER_SCALE`.** Work item 4b is a deliberate *preference* change and is not this.
- 🔴 **Absolute milliseconds from the headless harness are not comparable across sessions.** They
  moved four times in session 8 with background load alone (70.30 → 85.80 → 95.5 → 82.4) on
  unchanged or reverted code. **Only a same-session interleaved A/B (A,B,A,B,A,B) decides anything.**
- 🔴 **A trade against *look* cannot be approved from arithmetic.** The parallax crop was costed as
  "repeats 2.65× more often", shipped, and reverted after one screenshot showed the duplicate is in
  **every frame**. The reasoning is now written into `build-world.mjs` at the point of temptation.
  **Do not re-propose cropping the parallax.**
- 🔴 **A measurement written down after later edits is not a measurement of that tree.** Session 8
  swept for 400-line files, *then* fixed something that grew `tick.ts` by 21 lines, *then* wrote the
  earlier sweep's result into the QA log. Codex caught the false claim.
- **Hand your reviewers your own conclusions, not just the diff.** Both of Codex's corrections came
  from the section of the prompt that listed the gate's known findings and asked it to say if any
  were wrong.
- **`window.__game` has EIGHT top-level fields, not nine.** CLAUDE.md, PRD.md and `GameScene.ts:150`
  all say nine. The surface is closed either way — the **count** is wrong, the invariant is not.
- **NEVER `git stash` or `git checkout --`.** Two agents destroyed uncommitted work that way in
  session 7. Every subagent brief must carry the ban. Back up to a scratchpad temp copy instead.
- **Unit counts come from the JSON reporter**, never a summary line. **A non-zero exit code is not
  evidence a gate caught anything** — a vitest spawned from a Node parent dies at import and exits 1.
- **Never `waitForTimeout`**; wait on `window.__game.ready`. **Kill dev servers by port** *(C13)*.
- **Sample animation frames once per rAF at PAINT time**, never off `animationupdate` — that event
  fires when animation *state* advances and Phaser can advance several frames inside one rAF. That
  mistake reported 11–12/12 against a real 5/12.

## Standing constraints

- **NO new dependencies.** `phaser@4.2.1` exact.
- **STOP and ask before:** a new dependency · deleting any file · **any fal spend** · a batch over 5
  generations · changing a gate's tolerance · adding a gate criterion · contradicting STYLE.md /
  PRD.md / LESSONS-APPLIED.md.
- **Do not "fix" a gate by loosening it.** Change what it MEASURES, never what it TOLERATES.
- **`src/sim/` imports nothing from Phaser**, no clock, no `Math.random`, no DOM. Every duration is
  an integer count of 60 Hz ticks; every distance is pixels.
- **`src/sim/tick.ts` holds a numbered 14-step order, declared authoritative — read its header
  first.** Renumbering it is a balance change, not a refactor.
- **No source file over 400 lines** without a written justification in the phase QA log.
- Subagents **do not commit** and **do not write to `docs/`**.
- **A phase with a failing or unrun criterion is reported FAILING.**

## Scope lock

`src/`, `tools/gen/`, `tests/`, `public/assets/`, `docs/qa/phase-05-combat.md`, `docs/generations/`,
`docs/GENERATION-LOG.md`, `docs/reviews/`, `docs/HANDOFF.md`. **NOT** CI, **NOT** `package.json`
dependencies, **NOT** `docs/lessons/`, **NOT** `docs/FAL-MODELS.md`, **NOT** `docs/ASSET-PIPELINE.md`.
`docs/prd/phase-05-combat.md` only with my approval.
