# Session 11 — the decisions, then finish Phase 5

**Branch `phase-05-combat`, HEAD `2689248`. Phase 5 is FAILING and stays reported failing** until
its gate genuinely completes. Nothing merges to `main` without approval.

**This session opens with decisions, not code.** Session 10 ran the full QA gate — three agent
owners, two briefs each, then the Codex implementation review — and every finding is either applied
or recorded. What is left is **eleven things only you can decide**, most of them because they cost
money, change a gate, or change the game's balance. They are in § 1. Nothing below § 1 should start
until they are answered.

Read [docs/HANDOFF.md § 15](HANDOFF.md) first — it is where session 10 stopped and what is not
visible in the code. Then [docs/qa/phase-05-combat.md](qa/phase-05-combat.md)'s last two sections,
which carry the gate's 25 findings and their dispositions.

---

## 1. The decisions — answer these before any work starts

Each one states what was measured, the options, what each costs, and a recommendation. **A
recommendation is not a decision.** If a cheaper answer exists that I have missed, say so.

### D1 · `brass-courier/fall` — the animation that judders, and the gate it never passed

**Measured.** `fall` ships **8 frames over an 18-tick window** = 2.25 refreshes per frame. A display
can only hold a frame for a whole refresh, so it is served as 2,2,2,3,2,2,2,3 — the judder session 9
removed everywhere else. **9 frames would divide 18 exactly.**

Getting 9 means re-extracting, and re-extraction runs the G6 edge gate, where **frames 0–4 of
`_generated/video/fall.mp4` fail** on the left, right and top edges (frame 0: `left 0, right 0,
top 0, bottom 76`, contiguous edge runs of 138, 60 and 50 px). `windowIndices` starts every sampling
at the measured motion onset, so frame 0 is the same source frame at 6, 8 or 9 frames — **all three
fail identically.**

🔴 **Which means the sheet shipping today never passed G6 either.** `build-clips.mjs:300-301` writes
the strip and gates it *afterwards*, so a failing extraction leaves a complete, usable strip that
`assets:build` packs without complaint. Regenerating the rejected 8-cell strip reproduces
`public/assets/characters/brass-courier/sheets/fall.png` **byte for byte against HEAD** — that is how
the path was confirmed rather than guessed.

**Looked at at full resolution, the courier is NOT cropped.** There is clean green on every side.
What survives keying is green that differs enough from `borderKey`'s sample to stay opaque on the
highest-motion frames.

| option | cost | consequence |
|---|---|---|
| **A. Leave it** | $0 | One animation judders. Recorded in `tests/unit/blockedDwell.ts`, asserted in both directions so it cannot rot. `jump` is the same batch and already known-bad. |
| **B. Key with the ESTIMATED colour** instead of the default | $0, but it is a **gate change** | `build-assets.mjs` already calls `estimateKeyColour` first; `build-clips.mjs` does not. This is finding **R3** from the session-3 Codex review, still open. It may fix G6 for `fall` *and* be correct on its own merits. **Needs both-directions re-validation** — a gate change must be watched fail. |
| **C. `ACCEPTED_EDGE_BLEED` entry** | $0 | Requires a reason someone can state. *"Green that did not key"* is a description of a bug, not a justification. **I do not think this one is honest yet.** |
| **D. Re-shoot the clip** | ~$1.19 | The Phase-4 9:16 batch is the known-bad one. `jump` was re-shot once already and its `-r2` also fails G6. |

**Recommend B first, because it is free, is an open finding on its own merits, and would be
diagnostic** — if a correctly estimated key fixes the margins, the art was never the problem. Fall
back to A if it does not; D only if you want the art anyway.

### D2 · A 47.9 MB screen recording is tracked in git

`Recording 2026-08-12 173100.mp4`, still tracked. `.gitignore` gained `Recording*.mp4` but that has
**no effect on an already-tracked file**. Merging this branch puts 48 MB into `main`'s history
**permanently**.

The file is already deleted from your working tree. The fix is `git rm --cached "Recording 2026-08-12 173100.mp4"`
and a commit. It is **your file**, and deleting a file is a STOP-and-ask.

| option | consequence |
|---|---|
| **A. `git rm --cached`, commit the deletion** | The blob stays in this branch's history but never enters `main` as a tracked file. Simplest. |
| **B. Also rewrite history to drop the blob** | Removes the 48 MB entirely. Rewrites commit hashes on this branch. |
| **C. Keep it** | 48 MB in `main` forever. |

**Recommend A.** B is disproportionate for a branch that has not merged and whose hashes are cited
throughout `docs/`.

### D3 · A cornered scavenger runs on the spot

**Measured.** When a chasing scavenger cannot move — inside `deadZone`, or vetoed by the ledge probe
— `scavengerAnim` still returns `chase` because it reads the flag, not the motion. The foot-plant
invariant (`ticksPerFrame × speed === footPxPerFrame`) is violated by **18 px per frame** at zero
travel. Under the old release radius this ended; **with permanent aggro it never does.**

| option | cost |
|---|---|
| **A. Buy `rust-scavenger/idle`** | ~$1.19 + a sim state to select it. It was descoped in session 4 precisely because no sim state needed it — permanent aggro created one. |
| **B. Derive the animation from actual travel** | $0. Needs the sim to expose "did it move this tick", which touches the one-flag-one-counter contract *(vault 5.1)*. |
| **C. Leave it** | It reads as running in place while adjacent to you. Only visible when cornered. |

**Recommend B.** It is free, it is the honest fix (the animation should follow the motion, not the
intent), and the extra field is a derived boolean rather than a second counter.

### D4 · Aggro survives your death

Nothing clears `chasing` on respawn, so after you die each scavenger walks toward the new spawn and
**never patrols again**. Repeated deaths converge every scavenger in a level on the spawn point.
Invisible today because `level-01` places one.

**Permanent aggro is what you asked for on 2026-08-14**, so this is a balance decision, not a repair
*(vault 5.9)*.

| option | consequence |
|---|---|
| **A. Death releases aggro** | Dying resets the board. Keeps permanent aggro's "it never gives up while you live". |
| **B. Leave it** | A death makes the level harder, cumulatively. Reads as punishing. |

**Recommend A** — and note it does not weaken what you asked for: within one life the scavenger
still never gives up.

### D5 · A turret can flip left/right at 60 Hz

`enemySentry.ts:104` re-derives `facing` **every tick** the player is visible, with no dead zone. A
player oscillating around `sentry.x` — a jump apex over a turret — strobes `flipX` at 60 Hz.
`setFlipX` does not restart an animation, so **no gate can see it**. Its docstring claimed it used
the scavenger's rule; that claim is corrected, the behaviour is not.

**Recommend: mirror the scavenger's `deadZone`.** Cheap, and the correct docstring already describes
it. Deferred last session only because it is a visual claim nobody has observed — **look at it
first** (stand on a turret and jump).

### D6 · Three gate tolerances that cannot catch what they were written for

Each is a **gate-tolerance change and therefore a STOP-and-ask**. Session 10 recorded all three
rather than touching them.

| | measured | ask |
|---|---|---|
| **`sprite-size-consistency`** | Tolerance is **10 %**. The `fire` shrink you reported was **3 %**. Restoring the old fire scale stays **green**. | Tighten to ~2 %? The tripod landmark is stable enough; the risk is a re-shoot legitimately moving it. |
| **`file-size.test.ts`** | Accepts a file if its **basename** appears in any QA log. Two 400+ files are "recorded" by unrelated citations. The path half was dead until session 10 fixed it. | Drop the basename fallback? It would force a real path citation for each of the seven. |
| **`file-size.test.ts` ceiling** | `over.length <= 10` with **7** over. You declined ratcheting it to 0 on 2026-08-13 (finding T7). | Ratchet to 7, so an eighth is red? |

**Recommend tightening all three.** Each currently passes for a reason unrelated to what it measures.
⚠️ **Never loosen a gate to clear a red** — that rule is unchanged; these are tightenings.

### D7 · `createSentry` still accepts a cooldown that jams its own animation

Codex found the session-10 fix is **partial**. `sentryAnim` derives the firing episode as
`windowOpen(cooldownCounter, SENTRY_FIRE_TICKS)` while `stepSentry` **saturates** that counter at
`cooldown` — so any `cooldown <= 18` leaves a window that never closes. The **Playground knob** now
floors above 18; **`createSentry({ cooldown: 18 })` does not**, and that is the exported factory a
level or a test can call.

**Recommend clamping or throwing in `createSentry`.** A throw is more in keeping with this project
(`createWorld`'s required `scale`, vault 2.11) — an unrepresentable tuning should fail loudly.

### D8 · The Phase-3 e2e test that runs at 31 s against a 30 s timeout

One full sweep in four failed `phase-03-tilemap.spec.ts` 3.2 with a **30 s timeout**. It passes
alone twice and in three of four full sweeps. It is **marginal, not random**.

⚠️ `playwright.config.ts` says explicitly: **do NOT fix this by raising `BOOT_TIMEOUT`** — a bound
loose enough to survive a contended dev server is loose enough to hide a genuine boot hang, which is
the failure mode the whole refuse-to-route design exists to catch.

The documented real fix is **shrink the payload**: every boot loads **34.5 MB of PNG**, 21.4 MB of it
three parallax layers (`mid.png` alone is 9.1 MB). That is also what would let `workers: 1` go back
to parallel.

| option | cost |
|---|---|
| **A. Shrink the parallax layers** | Real work; unblocks parallelism too. |
| **B. Leave it, accept ~1-in-4 flake** | Trains everyone to dismiss a red suite. |

**Recommend A**, as its own work item — but it is not Phase 5's, so it may belong to a later session.

### D9 · The frame-budget gate is blind to the GPU

5.11 measures **main-thread** work. `Phaser.AUTO` resolves to WebGL, and draw-call *submission* is
cheap even when rasterisation is not — so a regression made of overdraw, alpha blending or draw-call
count leaves the number flat. It is stated as a named blind spot in `perfSampler.ts`.

The honest closure is a **GPU timer query** (`EXT_disjoint_timer_query_webgl2`). No new dependency —
it is a WebGL extension. **Ask:** is it worth building, or is the blind spot acceptable and recorded?

**Recommend recorded-and-acceptable for now.** The measured headroom is large (11× the enemies costs
1.1× the frame work) and Phase 6 adds UI, not overdraw.

### D10 · `DEV_FLEET_COUNT = 20` is a chosen number, not a bound

**Nothing in `src/sim/` or the level format caps concurrent enemies** (finding S5, open since
session 8). So "worst case" in 5.11 means "ten times the shipped level", not "the most this engine
can be asked to draw".

**Ask:** cap enemies per level in the loader, or leave the criterion meaning "10× the shipped level"
and say so in its own words? **Recommend the latter** — a cap you never hit is a rule nobody tests.

### D11 · What Phase 5's exit actually requires

Phase 5's gate is now genuinely run, but **5.4e is unclosable from the repository**:
`brass-sentry-death-r4` and `rust-scavenger-death-r5` are declared winners with **no `request_id`
anywhere** — not in `docs/`, not in `_generated/phase05/params/`, and the `.job.json` files that
would carry them do not exist.

| option | consequence |
|---|---|
| **A. Read the two ids off the fal dashboard** | 5.4e closes properly. |
| **B. Record them as permanently unrecoverable** | 5.4e **fails for those two rows**, and Phase 5 exits with a recorded failure. |

**Do not invent them.** **Recommend A if the dashboard still has them**, B otherwise — an honest
recorded failure beats a fabricated id.

---

## 2. The work, once the decisions are made

In this order. Each item names the decision it waits on.

| # | work | waits on |
|---|---|---|
| **W1** | Apply D1–D5, D7 — the code and art decisions. Each with a red-proof. | D1, D2, D3, D4, D5, D7 |
| **W2** | Apply D6's tolerance tightenings, each watched fail first. | D6 |
| **W3** | 🔴 **Wire G5 into the unit suite.** The contact-frame gate runs **only** from `node tools/gen/sheetGates.mjs`, by hand; `reachGate.mjs` is unit-tested against synthetic fixtures and **never against the shipped `attack.png`**. Repacking that sheet in session 10 invalidated 5.4c's recorded evidence and **nothing went red**. This is vault 3.1's shape — *the unit suite runs the real validator over the shipped bytes* — and the art gates are the one place this project does not do it. Same move `tilemap-data.test.ts` already makes for levels. | nothing |
| **W4** | Re-run the criteria the decisions touch: 5.2, 5.3, 5.4c, 5.9, 5.11, 5.16. | W1, W2 |
| **W5** | Phase 5 vault-out (PRD §7 exit deliverable) — episode-committed AI vs the frame-0 problem, the enemy tuning values that felt fair, and what the frame budget actually was. The vault has **nothing** on performance, so 5.11 is new ground. | W4 |
| **W6** | The gate again, per § 4 below, then the Codex implementation review **last**. | W5 |

**If the session runs short, drop from the bottom.** Never drop W3 (it is the hole that let a stale
measurement read as PASS) or the gate itself.

### Raised as the first candidate for the session after this one

**Projectile rendering was never built.** `src/render/projectileView.ts` does not exist;
`enemyLayer.ts` draws `fillCircle(x, y, 8)` while `projectiles.ts` sweeps the shot as a **point**, so
the drawn threat is 8 px larger than the real one on every side. There is no bolt rotation, trail or
impact spark. The still would cost **$0.15** (W14) and is not bought.

---

## 3. Skills — invoked at the stage that needs them, never all at session start

Per [docs/prd/phase-05-combat.md § 2](prd/phase-05-combat.md).

| stage | skills |
|---|---|
| **Throughout** | `superpowers:executing-plans` · `superpowers:test-driven-development` · `superpowers:systematic-debugging` · `superpowers:verification-before-completion` |
| Before planning | `superpowers:brainstorming` — the using-superpowers rule: brainstorm before entering plan mode |
| Animation / catalog work (D1, D3) | `animations` · `events-system` |
| Enemy layer work (D3, D5) | `groups-and-containers` · `data-manager` |
| Authoring spec files (W3) | `e2e-playwright-testing` |
| Driving the running game for a `play`-owned criterion | `playwright-cli` |
| **Only if D1 chooses a re-shoot** | `fal-gamedev` · `fal-prompting` · `model-routing` · `genmedia-workflow` · `character-design` |

⚠️ **Not `physics-arcade`.** Hit detection is integer-tick sim code against the tick contract, never
a Phaser collider.

⚠️ **`playwright-cli` and `e2e-playwright-testing` are different jobs.** The first drives and
screenshots the *running* game and is how every `play`-owned criterion gets its evidence; the second
authors the spec files. This project standardises on `e2e-playwright-testing`; the near-identical
`playwright-e2e-testing` is deliberately never used.

**The superpowers rule is binding:** if there is even a 1 % chance a skill applies, invoke it
*before* responding — including before clarifying questions. Announce *"Using [skill] to [purpose]"*
and follow it exactly; if it has a checklist, make a todo per item.

---

## 4. The QA gate protocol — the Owner column is an instruction

Full text in [docs/PRD.md § The QA agent protocol](PRD.md#the-qa-agent-protocol).

- **A criterion owned by an agent is UNRUN until that agent has run it — twice** *(A7)*.
- **Two briefs per owner, run SEQUENTIALLY**: brief 1 returns, **then** brief 2 runs with **brief 1's
  findings withheld**. A second pass that has read the first confirms it instead of attacking it.
- **Every finding is applied, or recorded with a one-line reason** *(C11)*. Silently dropping one is
  not permitted.
- **A subagent's summary is a claim, not evidence.** No command output, file:line or screenshot means
  nothing was reported. **Re-verify locally whatever it could not run.**
- **Preserve the agent's own "could not check" section** *(vault 9.3)*. A gate's blind spots are part
  of its result.
- Agent findings go in `docs/qa/phase-05-combat.md`. **`docs/reviews/` stays Codex-only.**

**Owner → agent:** `qa-expert` → `voltagent-qa-sec:qa-expert` · `code-reviewer` →
`voltagent-qa-sec:code-reviewer` · `performance-engineer` → `voltagent-qa-sec:performance-engineer` ·
`e2e` is **not an agent** (`npm run test:e2e`) · `play` is **not an agent** (your hands, driven with
`playwright-cli`).

**Per-owner additions:** `code-reviewer` — *"does any file exceed 400 lines without a justification in
this phase's docs/qa/ log?"* · `performance-engineer` — *"measure under the worst case this phase can
produce, not the typical case. Distinguish 'fast' from 'not drawing'."*

> 🔴 **Session 10's evidence that this is not ceremony.** Brief 1 reported *no failures* for
> `qa-expert` and *PASS with defects* for `code-reviewer`. **Brief 2 of each found the two worst
> defects of the session** — a free mid-air jump out of every respawn, and a teleport guard smaller
> than the simulation's own maximum. Codex then found six false claims on top, **one of them a QA-log
> entry claiming a fix that had not been made.**

---

## 5. The Codex review protocol — both reviews mandatory, neither skippable

Full text in [docs/PRD.md § The Codex review protocol](PRD.md#the-codex-review-protocol).

- **Review 1: the plan**, before `ExitPlanMode`. **Review 2: the implementation**, before the phase
  can be reported done. Run through the **`codex:rescue` skill**, never the `codex` binary directly.
- **Use `--wait`.** The gate blocks on the result; a background task id is **not a review**. Session
  10 lost a round trip to this. `--fresh` for review 1, `--resume` for review 2.
- ⚠️ **Codex's sandboxed shell cannot spawn processes on this machine** (`CreateProcessAsUserW
  failed: 5`). **Permanent — retrying does not help.** Every review prompt must contain:

  > On this machine your sandboxed shell cannot spawn any process (`CreateProcessAsUserW failed: 5`).
  > Do NOT use the shell tool. Use the `node_repl` MCP tool with `fs.readFileSync` / `fs.readdirSync`
  > for all file access. If that also fails, say so plainly and do not invent findings.

- That restores file **reading**, not command **execution** — so findings are **file-evidence only
  and must be re-verified locally**.
- **Do not accept a review that could not read the repository, and never record its silence as a
  pass.**
- Every finding **applied or recorded with a one-line reason** *(C11)*.
- Codex's session-10 verdict was **NOT READY**. Tell it so, and tell it what changed since.

---

## 6. Testing rules that bind every change here

- **Watch every gate fail before trusting it** *(C1)*. Re-introduce the bug, see red, restore.
- **Verify a mutation applied by "content changed AND the original count dropped by one"** — never by
  "the count is now zero" *(C12)*. Both write the file before failing, so a "refused" mutation can
  sit applied in a green tree.
- ⚠️ **Restore from a backup taken immediately before THAT mutation.** Session 10 restored from a
  stale backup and silently reverted a real fix; `cmp` against the right baseline is what catches it.
- **A non-zero exit code is not evidence a gate caught anything.** Detect redness **positively**,
  from `Tests N failed` plus named failing specs. Drive mutation loops from the shell, not from Node.
- **A gate that cannot go red is decoration** *(C2)*.
- **An existence assertion cannot verify a timing claim.** Assert *which tick*.
- **Never `waitForTimeout`.** Wait on `window.__game.ready`.
- **A wait expressed in ticks cannot bound a sampling window.** Sample inside the page, once per
  animation frame, and return an aggregate.
- ⚠️ **Mixed line endings** — `src/sim/combat.ts` and several `tests/e2e/` files are **CRLF** while
  their neighbours are LF (finding T18). An exact-anchor edit that "matches nothing" is usually this.
- **Kill dev servers by port before reporting done** *(C13)*.

---

## 7. Standing constraints

- **NEVER `git stash` or `git checkout --`.** To revert one machine-generated file:
  `git show HEAD:path > path`.
- Subagents **do not commit** and **do not write to `docs/`**. Verify `git log` yourself.
- **No new dependencies.** `phaser@4.2.1` exact, no caret.
- **STOP and ask** before: a new dependency · deleting a file · any fal spend · a batch over 5
  generations · changing a gate's tolerance · adding a criterion · contradicting `STYLE.md` /
  `PRD.md` / `LESSONS-APPLIED.md`.
- **Do not "fix" a gate by loosening it. Change what it MEASURES, never what it TOLERATES.**
- `src/sim/` imports nothing from Phaser, reaches no clock, no `Math.random`, no DOM.
- **Every duration is an integer count of 60 Hz ticks. Every distance is pixels.**
- **A phase with a failing or unrun criterion is reported FAILING.**
- **Never run `npm run test:sim-isolated` while subagents are working** — it uninstalls Phaser.
  Recover with `npm i phaser@4.2.1 --save-exact`.
- **`motion.mjs` must be imported before `motionCombat.mjs`** — the reverse leaves a spread silently
  incomplete under Vite.
- PowerShell here-strings break inside the Bash tool. Write commit messages to a file and use
  `git commit -F`.
- **Ask me to look at things. It is faster than being wrong in a loop.**

### Scope lock

**In:** `src/`, `tools/gen/`, `tests/`, `public/assets/`, `docs/qa/phase-05-combat.md`,
`docs/generations/`, `docs/GENERATION-LOG.md`, `docs/reviews/`, `docs/HANDOFF.md`,
`docs/SESSION-11-PROMPT.md`.
**Out:** CI, `package.json` dependencies, `docs/lessons/`, `docs/FAL-MODELS.md`,
`docs/ASSET-PIPELINE.md`. `docs/prd/phase-05-combat.md` by approval only.

---

## 8. Verification

After **each** work item:

```bash
npm run typecheck
npm test
npm run build            # ends in verify-dist
```

Full sweep before reporting anything done:

```bash
npm run typecheck && npm test && npm run test:sim-isolated
npm run build
npm run test:e2e         # workers:1, two projects, ~6 min
```

⚠️ **`npm run test:e2e` now runs a headed browser.** The `chromium-gpu` project opens a real window
for `phase-05-perf.spec.ts` — that is deliberate, and the spec asserts the WebGL renderer is not
SwiftShader. Do not make it headless to keep the run quiet.

Then **kill dev servers by port** *(C13)* — Playwright launches
`node ./node_modules/vite/bin/vite.js` directly, and `npm run dev`'s wrapper orphans the real process
on Windows.

### Hands-on checks only you can sign off *(C4)* — I will ask, never assert

- **D5:** stand on a turret and jump. Does it flip left/right rapidly?
- **D3:** back a scavenger into a corner or a ledge. Does it run on the spot?
- **D4:** die a few times. Do the scavengers end up camped at the spawn?
- **5.8:** is the enemy health bar legible at full, half and 2/60 hp? *(still UNRESOLVED)*
- **D1, if B is chosen:** does the rebuilt `fall` look right, and does the judder go?

---

## 9. Do not re-plan these — already decided or already cancelled

- **The anchor-padding probe** — built, gated, never submitted. The 17-clip measurement refuted its
  premise. `padAnchor.mjs` is kept and working.
- **Six enemy clips the plan once priced at ten** — `telegraph`, scavenger `idle`/`attack`/`hurt` —
  dropped because each needs a sim window that does not exist. ⚠️ **D3 may reopen scavenger `idle`**;
  that is the one exception, and only if D3 chooses option A.
- **`brass-courier/hurt` needs no purchase.** Measured clean.
- **`brass-sentry/idle` re-shoot ($1.19).** Cancelled — a $0 investigation exonerated the art. The
  residual is a cycle-detection precision issue held visible by an expected-failure lock.
- **`fire-elevated`.** Cancelled in session 4. `enemyView.ts` types `SentryAnim` as
  `'idle' | 'fire' | 'death'` only.
- **The `HOLD_CENTRED` prompt clause.** Withdrawn as **unattributable, not disproven**. It stays in
  `motionClauses.mjs` applied nowhere. **Do not re-apply.**
- **The parallax retile.** Built and **reverted** — the crop duplicated a gauge panel in every frame.
  The reasoning is written into `build-world.mjs` at the point of temptation. ⚠️ **D8's payload work
  is a different thing** and is not covered by this cancellation.
- **Limitation 1 (9b ordering masked by i-frames).** Withdrawn 2026-08-11; the rationale was
  geometrically false.
- **T19**, the `glTexture` TypeError in the e2e log. Diagnosed as `phase-01-boot.spec.ts:311`'s
  deliberate texture invalidation. **Not a defect — do not "fix" it.**

---

## 10. Phase 4 debt still carried — none of it in this session's scope

Phase 4 was **approved and merged while reported failing**; `docs/prd/phase-05-combat.md` §1b is the
ledger. Still open: **4.10** (`gateReachBand` has only ever run from `selfTest()`, never against the
real sheets) · **4.12** (`findSource`'s missing-input throw has never been watched fail) ·
`assets:fetch` / `assets:verify` promised by `ASSET-PIPELINE.md` and **undefined in `package.json`**
· the shipped `jump` art is genuinely cropped and both rounds fail G6 · **10.2 MB of `dist/`** is
anchor art the game never loads · **`_generated/` is the only copy of a non-regenerable input**
(~128 MB of clips; Seedance is not seed-deterministic) — archive it outside git · Gym edits made
before the async config fetch resolves are silently discarded.
