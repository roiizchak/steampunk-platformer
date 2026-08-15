# Session 10 — continuation prompt

> Paste this whole file as the first message of the next session.

You are resuming **Phase 5 (combat + combat art)** of the Steampunk Platformer on branch
`phase-05-combat`, at **HEAD `01f2ae7`**. **Phase 5 is FAILING and must be reported failing** until
its gate genuinely completes. Nothing merges to `main` without my approval.

## Read first, and do NOT re-derive anything they already record

- `CLAUDE.md` — architecture, non-negotiables, the phase workflow.
- `docs/HANDOFF.md` — where session 9 stopped, and §14 on why headless measurements lie here.
- `docs/qa/phase-05-combat.md` — the gate, its findings, and every deliberate non-fix.
- `docs/prd/phase-05-combat.md` §2 (required skills) and §6 (the QA gate and its Owner column).
- `docs/reviews/` — the Codex reviews, including session 9's plan review of render interpolation.

Nothing in this prompt overrides those. Where they disagree with it, they win — say so rather than
silently following me.

---

## 0. Before anything else: confirm the ghost fix landed

Session 9 ended by shipping render interpolation (`01f2ae7`) on the strength of a DEV probe, but
**I never confirmed the real fix in normal play.** My display is 240 Hz; every harness available to
you runs at 18–60 Hz, where interpolation is nearly a no-op and cannot show the difference.

**Ask me to play it and report, before building anything on top of it.** If the ghost is still
there, that changes the priority order of this whole session.

Also ask me whether the character now feels *less responsive* — interpolation costs up to one tick
(16.7 ms) of visual latency by design, and that trade was never put to me.

---

## 1. NEW — the enemy stops chasing, and I want it to chase until it dies

This is a **design change I am asking for**, not a bug report, and the distinction matters because
the current behaviour is deliberate and documented.

Today, in `src/sim/enemyScavenger.ts:17-38`:

| knob | value | why it is what it is |
|---|---|---|
| `detectRadius` | 480 | enters chase inside this |
| `releaseRadius` | 720 | **leaves** chase outside this — the gap is the hysteresis |
| `chaseSpeed` | 8 | vs the player's `runMax` 12 — *"deliberately escapable"* |
| `CHASE_COMMIT_TICKS` | 30 | a chase lasts at least half a second once entered |

The file states the rationale outright: *"A chaser faster than the player's run means fleeing is
never an option, and with no stamina system that is not tension, it is a tax."*

**I am overriding that. I want a scavenger that has seen me to keep coming until I kill it.**

Do not treat my request as a defect to be explained away — but do put the trade in front of me
before you implement, because two knobs interact and I have only decided one of them:

1. **Aggro persistence** (what I asked for): once `chasing` is true it never returns to patrol
   except by death. Probably `releaseRadius` becoming unbounded, or a `permanentAggro` flag.
2. **`chaseSpeed` 8 vs `runMax` 12** (what I have NOT decided): with permanent aggro and an
   escapable speed, the scavenger becomes a thing that trails behind me forever and never catches
   up — which may read as harmless rather than threatening. **Ask me whether chase speed should
   change too, and tell me what each option costs.** Faster than 12 removes fleeing entirely.

Also worth raising with me, briefly, not as a blocker:

- Does aggro persist across the enemy leaving the screen, and does the scavenger path around gaps
  or walk off ledges? `patrolMin`/`patrolMax` currently bound it; permanent aggro means deciding
  whether it may leave its patrol zone at all.
- The sentry is bolted down and cannot chase — this change is scavenger-only.

Whatever we settle: it is a **balance change**, so it wants a QA-log entry recording the reversed
decision and its reasoning, not a silent knob edit. `tests/unit/enemy-ai.test.ts` pins the
`releaseRadius > detectRadius` relationship and will need deliberate amendment.

---

## 2. UNFINISHED from session 9 — this is the bulk of the work

Session 9 was consumed by the ghosting investigation. Eight commits landed
(`adaa4a5..01f2ae7`): the sentry muzzle fix, the scavenger death animation, authored loop cadence,
whole-refresh dwell, the DEV probe and render interpolation. **The rest of the session-9 plan was
never started.** In priority order:

### 2a. The three re-shoots — ~$3.57, ALREADY APPROVED
`brass-sentry/death`, `brass-sentry/fire`, `brass-courier/death`. $41.36 of $55 spent.
**Buy margin with anchor padding, not prompt clauses** — the prompt lever is documented as
exhausted, and a shape-describing clause gets satisfied by *not performing the action*
(`DISCHARGE_MARGIN` is exactly why `brass-sentry/fire-r4` barely fires). Log every `request_id`
and reconciled cost **before** packing anything. Halt and ask if the real invoiced rate differs.

### 2b. Criterion 5.4e — two request_ids that are not in the repo
`brass-sentry-death-r4` and `rust-scavenger-death-r5` are declared winners in `clipJobs.mjs` with
no `request_id` anywhere under `docs/`. Codex confirmed `_generated/phase05/params/*.json` does not
carry one either. **This cannot be closed from the repository** — either I read them off the fal
dashboard, or they are recorded as permanently unrecoverable and 5.4e fails for those two rows.
Do not invent them. Also record that `brass-sentry-death-r4.params.json` contradicts itself
(`"file"` says `-r3`, `downloadPath` says `-r4`).

### 2c. The catalog/PNG pipeline hole
`build-assets.mjs` decides whether to write a catalog row via `hasCatalogTiming` and **has no
`else`** — no warning, no marker. Session 9 hit this live: `brass-courier/idle` had no timing rule
at all, so when `IDLE_TICKS` moved the packer rewrote the strip, printed `ok`, wrote no row, and
the catalog kept the stale number. One instance was fixed; **the hole is still open.** Gate at the
PNG write (which every packed action passes through), require
`width === frameWidth * frameCount && height === frameHeight`, and add the missing `else` as a log
line naming the skipped `(slug, action)`. **Red-prove both paths** — the dimension mismatch AND
the missing-timing skip.

### 2d. Criterion 5.11 redesign
The criterion is *"frame budget measured under worst-case enemy count"*; `medianMs < 100` was
invented by the spec. Four faults: it has only ever run on SwiftShader; `DEV_FLEET_OFFSET_X` puts
**0 of 20** enemies on screen; there is no baseline; and the sampler measures rAF **interval**, not
**work**, so it is floored by vsync on real hardware. Fix what it MEASURES: real fleet on screen
including sentries and projectiles, a headed GPU project, and instrument work
(`PerformanceObserver` on `long-animation-frame`, no new dependency). Prove it can go red.

### 2e. Criterion 5.8 — needs my eyes
Screenshot the enemy health bar at full, half and 2/60 hp against `level-01` and ask me. The
"small red sliver" was a scavenger at 2/60 hp where `BAR_MIN_FILL_PX` yields an 8 px fill — that is
5.7 working, not a defect. Separately, `tests/unit/enemy-view.test.ts:30` hardcodes `SLOT = 120`
while the shipped slot is **144**; the fill-math block runs against a width the game never draws.

### 2f. Cheap gaps, in priority order
- **T2** — nothing swings the attack repeatedly at a live enemy and asserts death; 5.10 and 5.16
  both set `hp = 0` directly. This is the gap that let P1 ship past the entire gate. **Keep.**
- **T6** — `withinRadius` has no direct test and every sentry fixture is `y:0`, so deleting
  `dy * dy` reds nothing. One fixture. **Keep.**
- **T13** (`parallaxRig.ts` depth) and **T8** (`verify-dist`'s identifier greps cannot go red under
  minification) — **only if time remains.**

### 2g. The walk sheet's near-duplicate poses
Codex verified with the repository's own `frameDifference` metric: pairs `1–2, 4–5, 14–15, 18–19`
differ by `0.175, 0.220, 0.204, 0.032` per 255 — effectively repeated poses in a nominal 24-frame
sheet, so those poses last ~66 ms instead of 33 ms. **My "six duplicate pairs" claim last session
was wrong**; `6–7` and `21–22` differ by ~0.8–1.1 and by a pixel of bounding box. Real, independent
of the 240 Hz issue, and the motion gate cannot catch it because it only checks peak movement from
frame zero — not adjacent-frame distinctness.

### 2h. Then the gate
QA owner briefs **sequentially** per `docs/PRD.md:280` (brief 1 returns, then brief 2 runs with
brief 1's findings withheld), then the **Codex 5.14 implementation review LAST**. Every finding
applied or recorded with a one-line reason *(C11)*.

---

## 3. Standing constraints — these do not change

- **NEVER `git stash` or `git checkout --`.** To revert one machine-generated file, use
  `git show HEAD:path > path`.
- Subagents **do not commit** and **do not write to `docs/`**.
- **No new dependencies.** `phaser@4.2.1` exact.
- **STOP and ask** before: a new dependency · deleting a file · any fal spend beyond 2a · a batch
  over 5 generations · changing a gate's tolerance · adding a criterion · contradicting
  `STYLE.md` / `PRD.md` / `LESSONS-APPLIED.md`.
- **Do not "fix" a gate by loosening it. Change what it MEASURES, never what it TOLERATES.**
  Session 9's foot-plant amendment is the pattern: bounded by that frame's actual `|vy|` and still
  exact wherever the player is vertically still — tighter than the blanket constant it replaced.
- `src/sim/` imports nothing from Phaser, reaches no clock, no `Math.random`, no DOM.
- **A phase with a failing or unrun criterion is reported FAILING.**
- Kill dev servers by port before reporting done *(C13)*.

## 4. Scope lock

In: `src/`, `tools/gen/`, `tests/`, `public/assets/`, `docs/qa/phase-05-combat.md`,
`docs/generations/`, `docs/GENERATION-LOG.md`, `docs/reviews/`, `docs/HANDOFF.md`.
Out: CI, `package.json` dependencies, `docs/lessons/`, `docs/FAL-MODELS.md`,
`docs/ASSET-PIPELINE.md`. `docs/prd/phase-05-combat.md` by approval only.

---

## 5. What session 9 got wrong, so you do not repeat it

I spent most of a session on one defect and was wrong **six times** before finding it. The pattern
is worth internalising:

- **Every hypothesis I could not test on the affected hardware survived far too long.** Cadence,
  speed, canvas filtering, a second sprite, camera jitter, pose-doubling — all falsified by asking
  me to try something, none by my own measurement. My machine is the only instrument that can see
  a 240 Hz defect *(HANDOFF §14)*.
- **I misread my own evidence.** A paint sample showing 23 refreshes for 12 frames was the defect
  written out, and I called it proof the mechanism was fine.
- **I built a fix on an unproven story once** (`36ad73e`) and it did not help. The Codex plan
  review then refused the next story on the correct grounds that a 60 Hz panel also holds a frame
  for 16.7 ms. **Shipping the cheap falsifier first (`?probe=1`) is what finally settled it** —
  do that again before any expensive fix.
- **A bounded tolerance proves nothing.** With interpolation mutated out, the tolerance test still
  passed; only the assertion that the drawing moves *between* ticks went red. When you loosen an
  equality, add the assertion that the new behaviour actually happens.

Ask me to look at things. It is faster than being wrong in a loop.
