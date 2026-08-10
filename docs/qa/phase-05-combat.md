# Phase 5 — combat, enemies and hazards

Index entry in [QA-LOG.md](../QA-LOG.md). Findings from the gate's agent owners land here;
`docs/reviews/` stays Codex-only.

---

## THE FROZEN COMBAT TIMINGS — criterion 5.4b

**Recorded 2026-08-09, before any fal generation for this phase.** At the moment this table was
written no `request_id` existed for Phase 5 and `docs/generations/phase-05-*.md` did not exist —
both do now, and the ordering between them is the criterion. The numbers art is derived from must be
fixed *before* the art is bought, or the art is what fixes the numbers. This paragraph is a dated
record of that ordering, not a description of the repository today.

Every value below is **live in `src/sim/`** and imported by `src/render/animTiming.ts` — never
retyped there *(vault 5.3)*. This table is a record of what was frozen, not a second definition; if
it and the code ever disagree, **the code is right and this document is stale**.

### Player

| Window | Ticks | ms @ 60 Hz | Source |
|---|---:|---:|---|
| `ATTACK.startup` | 6 | 100 | `combat.ts:62` |
| `ATTACK.active` | 4 | 67 | `combat.ts:62` |
| `ATTACK.recovery` | 10 | 167 | `combat.ts:62` |
| **`attackTotalTicks(ATTACK)`** | **20** | **333** | derived |
| `HURT_TICKS` | 18 | 300 | `combat.ts:65` |
| `IFRAME_TICKS` | 45 | 750 | `combat.ts:75` |
| `DEATH_TICKS` | 45 | 750 | `combat.ts:78` |
| `PLAY_LAG_TICKS` | 1 | 17 | `combat.ts:101` |

### Enemies

| Window | Ticks | ms | Source |
|---|---:|---:|---|
| `SENTRY.cooldown` | 90 | 1500 | `enemies.ts` |
| `SENTRY_FIRE_TICKS` | 18 | 300 | `enemyView.ts:41` |
| `CHASE_COMMIT_TICKS` | 30 | 500 | `enemies.ts` |
| `SCAVENGER.contactCooldown` | 45 | 750 | `enemies.ts` |

### Damage and health

| Value | Number | Source |
|---|---:|---|
| `PLAYER_MAX_HP` | 100 | `combat.ts:87` |
| `PLAYER_ATTACK_DAMAGE` | 20 | `playerAttack.ts:39` |
| `HAZARD_DAMAGE` | 20 | `hazards.ts:42` |
| `SENTRY.damage` | 10 | `enemies.ts` |
| `SCAVENGER.damage` | 15 | `enemies.ts` |
| `brass-sentry` hp | 40 | `createSentry` default |
| `rust-scavenger` hp | 60 | `createScavenger` default |

**The 5.10 invariant, stated so it can be checked rather than admired:** at equal incoming damage
the **sentry dies first** — 2 swings against the scavenger's 3. It is the static threat you remove
from a distance; the scavenger is the one you retreat from. If that ever inverts, the two enemies
have swapped roles. Gated in `player-attack.test.ts`.

### What each animation's frame rate will be derived against

`fps = renderFrames × TICK_HZ / simTicks`, and **`simTicks` is imported, never authored** *(vault
4.22, guard G2)*. `renderFrames` is measured off the packed sheet, so it is the only column that is
blank until the art exists — which is the point.

| Sheet | `simTicks` | Comes from | Loops |
|---|---:|---|---|
| `brass-courier-attack` | 20 | `attackTotalTicks(ATTACK)` | no |
| `brass-courier-hurt` | 18 | `HURT_TICKS` | no |
| `brass-courier-death` | 45 | `DEATH_TICKS` | no |
| `brass-sentry-idle` | 90 | `IDLE_TICKS` *(authored — recorded exception)* | yes |
| `brass-sentry-fire` | 18 | `SENTRY_FIRE_TICKS` | no |
| `brass-sentry-death` | 45 | `DEATH_TICKS` | no |
| `rust-scavenger-walk` | measured | `strideTicks(stride, SCAVENGER.patrolSpeed)` | yes |
| `rust-scavenger-chase` | measured | `strideTicks(stride, SCAVENGER.chaseSpeed)` | yes |
| `rust-scavenger-death` | 45 | `DEATH_TICKS` | no |

**Nine sheets, not thirteen.** See the scope decision below.

---

## The enemy animation scope — six clips where the plan priced ten

**Decision, taken after the combat sim was complete and recorded rather than made silently.** The
plan's budget table priced ten enemy clips. Four are not being generated:

| Dropped | Why it has no sheet |
|---|---|
| `brass-sentry-telegraph` | Needs a wind-up window in `stepSentry`. There is none. The turret's fairness comes from the **projectile's travel time**, which was the mechanism agreed with the user, so a telegraph is a second solution to a solved problem. |
| `rust-scavenger-idle` | **Unreachable.** The scavenger patrols continuously; there is no sim state in which it stands still, so the sheet would be money spent on a pose the game cannot enter. |
| `rust-scavenger-attack` | Its **body is the hazard** — contact damage, no swing. Giving it an attack animation would mean giving it an attack, which is a mechanic change. |
| `rust-scavenger-hurt` | Needs an enemy stagger state and window. Taking the plan's own named descope lever instead: **a tint flash**, drawn from the `hitLanded` event that `TickEvents` already emits. Feedback that the hit landed, at zero generation cost. |

The rule behind all four: **an animation named in `animTiming` must have a `simTicks` that comes
from the simulation.** Inventing a window to justify a sheet is vault 4.22's *"0.43 s of art over a
0.25 s move"* arriving from the other direction. Each is one mechanic change away from being worth
buying, and each is the user's call at that point, not a render module's.

Saving: **≈ $4.76** against the plan's first-pass estimate, before any rework.

---

## Art findings — what the first batch taught

Full provenance in [generations/phase-05-anchors.md](../generations/phase-05-anchors.md) and
[phase-05-clips.md](../generations/phase-05-clips.md). The three findings worth carrying forward:

**1. G1 caught the 4.27 defect on the first new art it ever saw.** A scavenger candidate came back
with one foot 52 px above the other against a 27 px limit. In Phase 4 that shape of defect shipped
and was found by eye after ≈$7 of clips had been shot from it; here it cost $0.15 and never left
`_generated/`. The gate had already been validated against the real historical files — the original
anchor fails at 59 px, the corrected one passes at 0, and the hand-recorded figure was 58.

**2. `poseSpan` works and `SPAN_CLIP` does not, and the split was total.** Four of four clips using
three timed poses hit their specified poses; two of two using `SPAN_CLIP` failed. `SPAN_CLIP`
describes a SHAPE — *"extending through the first half and returning through the second"* — and the
model satisfied it exactly by raising the spanner and lowering it, which is not a strike. Three
timed poses describe a GEOMETRY. **I reasoned that `attack` and `hurt` genuinely do extend and
return, so `SPAN_CLIP` was right for them; the reasoning was sound and the outcome was wrong.** All
six one-shots now use `poseSpan`. This is STYLE.md §6's stills finding arriving in the video path.

**3. `ffprobe` cannot see what a clip depicts.** All nine round-1 clips reported 720 × 1280, 97
frames, 4.041667 s — perfect, identical, and two of them were unusable. The six-frame contact strip
is what caught it, and it costs nothing.

### Uncertain, and deliberately not re-shot yet

| Clip | Suspicion | Why an eye cannot settle it |
|---|---|---|
| `brass-sentry/idle` | Near-frozen | For a machine at rest that may be correct rather than Phase 4's *"no breath, only boil"*. It will measure near the motion floor either way, and the gate is the arbiter. |
| `rust-scavenger/walk` | Possible near-idle | Legs move, poses are close. This is an IoU measurement, not a judgement. |
| all three `death`s | Back-loaded | The contact strips sample EVENLY; `sampler.mjs` selects on a difference matrix. A held opening that wastes three of six even samples may cost nothing once the real sampler runs. Re-shooting on the strength of a strip that uses the wrong sampling would be spending money to fix an artefact of the measurement. |

### Open against G5 (criterion 5.4c)

`brass-courier/attack`'s reach peaks **late** — around 5/6 of the way through the clip — while the
active window is ticks 6–10 of 20, i.e. 30–50 %. Whether that survives sampling is exactly what G5
measures. Written down before the measurement so the answer cannot be quietly rounded to a pass;
`INDETERMINATE` and `FAIL` are both legal outcomes.

---

## Known limitations, recorded rather than fixed *(C11)*

| # | What | Why it is not fixed here |
|---|---|---|
| 1 | **The 9b ordering between the player's swing and the enemies' damage is ungated.** Swapping the two calls fails no test. | Not a missing test — a masked effect. Being in contact range means having already taken contact damage, which grants 45 ticks of i-frames, longer than the whole 20-tick swing. A test that only passed because of how it was posed would be worse. **Becomes reachable if `IFRAME_TICKS` drops below `attackTotalTicks(ATTACK)`.** |
| 2 | **`HUD_SLOT` is measured from the shipped `hud-health.png`.** | Uncomfortably close to what vault A5 forbids. Declared in one place with its provenance instead of re-measured at runtime. **If the HUD art is regenerated, re-measure those four numbers** — no gate can see a stale slot, the fill just sits slightly off inside the frame. |
| 3 | **The sentry's projectile does not collide with solids.** | It would need the solid list, an ordering decision against the player's own motion, and a second swept test. The sentry has clear line of sight in `level-01`, so the case does not arise. |
| 4 | **`enemyKnobs` uses a named field list, not enumeration.** | An enemy's `x`, `hp` and counters are state, not tuning; a panel that let you drag `hp` would be a cheat menu. Cost: adding a knob means adding it there too. |
| 5 | **G1 cannot tell a boot from a hand.** It measures ground-contact components and assumes they are what the subject stands on. | Exposed by the round-1 scavenger, whose fingertips entered the ground band so the gate compared a hand against a foot and reported 104 px. The number was right; the question was wrong. Giving it limb semantics is a much larger gate than 4.27 needs. Constraint pushed into the prompts instead: any subject putting something other than its feet into the bottom 12 % of its height must say so in its concept. |
| 6 | **The two new anchors add 7.5 MB under `public/`**, which Vite copies into `dist/`. | It grows the already-recorded debt about relocating anchor art out of the shipped payload. Followed the established `brass-courier` layout rather than inventing a second one; the relocation is a standing STOP-and-ask. |
| 7 | **`character-bounds.json`'s `scale` is saved and never recomputed by the build — but its PROVENANCE is the idle sheet**, a regenerable frame. | A5's protection is intact in practice: regenerating a sheet moves nothing, because the build reads the saved value. Codex C5's point stands about where the number came from, and it becomes live at step 6a when each new subject needs its own. |

---

## §6 gate — agent owners, run 2026-08-10 (session 3)

**Protocol:** each owner ran **two briefs** *(A7)*, dispatched in parallel so **brief 2 never saw
brief 1's findings** — a second pass that has read the first confirms it instead of attacking it.
Every finding below is **applied or recorded with a one-line reason** *(C11)*. Subagents were
forbidden from writing here; the orchestrator recorded these after verifying the decisive claims.

### `voltagent-qa-sec:qa-expert` — brief 1 (verify the stated criteria)

| # | Verdict | Note |
|---|---|---|
| 5.1 | **PASS** | Negative + positive control through the real `tick()`, `tick-world-damage.test.ts:223-241`; radius tunability measured as **shots fired**, not a readout. |
| 5.2 | **PASS, but not by the test that claims to** | ⚠️ `enemy-ai.test.ts:107-123` is titled *"patrol and chase speeds are independently tunable"* and **only sweeps `patrolSpeed`**; `:126-129` compares `chaseSpeed` against two constants with no live entity. The criterion is met **elsewhere** — `enemy-tuning.test.ts:93-109` sweeps `chaseSpeed` on the live field and measures travel. **Codex C4 called this exact risk and it is half-real: the knob is honest, the named test is not.** |
| 5.5 | **PASS** | Both active-window endpoints pinned **by name** (`combat.test.ts:92-114`), plus measured hp change, once-per-swing and facing. |
| 5.6 | **PASS** | Fixture runs `IFRAME_TICKS * 2` = 90 ticks against a 45-tick window; **both endpoints pinned** and the length asserted. |
| 5.9 | **PASS** | `enemyTuning.ts:43-59` writes the live entity's own field — the stale-readout failure mode is **structurally excluded**, not merely untested. |
| 5.10 | **PASS, with a caveat** | Two genuinely different entities, real constants. But it proves the **ratio** (`ceil(maxHp/damage)` = 2 vs 3), not a simulated kill sequence — **no test actually swings twice and asserts death**. |
| 5.15 | **PASS** | Kill plane pins the **crossing tick**; the tunnelling case derives the band from the real trajectory and asserts both halves — no tick sampled inside, damage landed anyway. |

### `voltagent-qa-sec:code-reviewer` — brief 1

| # | Verdict | Note |
|---|---|---|
| 5.3 | **PASS** | Commitment is real, not just determinism: one exported asymmetric predicate (detect 480 / release 720) plus a 30-tick commit floor. The flap test **oscillates ±10 px** rather than parking on the boundary — the parked version passed with hysteresis deleted. Reviewer reproduced the mutation independently: single-threshold → **36 state changes**, correct → **0**. |
| 5.12 | **FAIL** | See finding **R2** below. |

### Findings — every one applied or recorded

| ID | Sev | Finding | Disposition |
|---|---|---|---|
| **A1** | **HIGH** | **The recorded "9b ordering is masked by i-frames" rationale is geometrically false.** Limitation 1 above argues the swing/contact-damage ordering is untestable because being in contact range implies already holding 45 ticks of i-frames. But `ATTACK_BOX` reaches ~26 units **beyond** contact-overlap distance, so a **dead zone** exists where a swing lands with **zero** contact damage and therefore no i-frames. `player-attack.test.ts:44-58` *builds a fixture at exactly that gap*. **Worse: `worldDamage.ts:77-87`'s contact loop only iterates `scavengers`** — a sentry never deals contact damage at all, so the premise never applies to a sentry kill. | **RECORDED, NOT FIXED — and limitation 1 above is now WRONG and must not be relied on.** The numeric premise (45 > 20) holds; the **geometric** premise does not. Fixing it is a sim change to gated combat code and belongs to a planned work item, not an ad-hoc edit late in a session. **Raised to a blocker-class item for session 4.** |
| **A2** | MED | **Two raw reimplementations of `windowOpen`** — `enemies.ts:144` sits six lines below a correct `windowOpen(...)` call; `enemyView.ts:52` restates the same shape. Both agree today. | **RECORDED.** Exactly the vault 5.3 drift class Codex C3 fixed once already. Import-not-restate is the fix; deferred to session 4 because it touches `src/sim/enemies.ts`, which is at **exactly 400 lines**. |
| **R1** | **CRITICAL** | **Producer/consumer filename collision, self-inflicted this session.** W2b changed `build-clips.mjs:255` to write `<slug>-<action>-clip.png`, but `build-assets.mjs:80` still globs `` f.startsWith(`${action}-`) ``. `slugConfig.mjs` then added `attack, hurt, death` to brass-courier. `assets:build` will throw *"no source sheet for declared animation attack"* while the sheet sits there under the namespaced name. **Both test suites pass because neither crosses the seam.** | **VERIFIED LOCALLY, RECORDED.** Confirmed: files on disk are `idle-clip.png` (legacy stems unchanged) but a namespaced action yields `brass-courier-attack-clip.png`, which `startsWith('attack-')` cannot match. **Latent until W7b runs, and W7b rewrites that exact scan** — so it is W7b's first test case, not a separate fix. `slugConfig.mjs:6`'s claim that nothing changes for brass-courier is **now false** and must be corrected there. |
| **R2** | **CRITICAL (latent)** | All three slugs share `generated: '_generated/sheets'` **with bare action names**. Once `build-assets` runs for `rust-scavenger`, `findSource('walk')` matches the **courier's** `walk-clip.png` and packs it as the scavenger's walk — **silently, not as a throw.** | **RECORDED as W7b's defining requirement.** This is precisely why the source scan must become slug-aware rather than prefix-based. Wrong-character art shipping silently is worse than a build failure. |
| **R3** | **HIGH** | **G6's new `minAlpha = 255` is fragile against an off-key background.** `build-clips.mjs:191` calls `keyOut()` with the **default** key while `build-assets.mjs:117` calls `estimateKeyColour` first. `chroma.mjs:88-93` records a real clip whose background came back `(0,195,64)` — key-distance **above** `HIGH`, so `keyOut` leaves it **fully opaque**, and at `minAlpha 255` the whole cell reads as subject: margins 0 on all four sides, G6 throws on a perfectly framed clip. **The `255` floor makes this failure mode worse than `8` did, and its remedy is fal spend.** | **RECORDED, NOT FIXED — highest-value follow-up.** The G6 correction this session is right for the measured case but is **not robust to background drift**. The fix is to key with the **estimated** colour, as `build-assets` already does. Not changed now because it is a second gate change in one session and needs its own both-directions re-validation. |
| **R4** | **HIGH** | **`enemyLayer` checks `anims.exists()` at CREATE time for ONE key**, then plays any later state's key. With a partial catalog (walk packed, death gate-failed), killing a scavenger calls `play()` on a missing key: Phaser no-ops, `getName()` never changes, so it **re-fires every frame forever and the corpse keeps walking**. | **RECORDED.** A real hole in this session's W8. The guard must be **per-key at play time**, not per-body at create time. Deferred to session 4; harmless today because **zero** enemy sheets are catalogued, so no body takes the Sprite path at all. |
| **R5** | MED | `submit-clips.mjs` versions the download `-rN` but **not** the sidecars (`${stem}.txt`, `${stem}.params.json`), so a re-render overwrites the params of the round that was actually paid for. | **RECORDED.** Undermines the very provenance `CLIP_JOBS` exists to create. Cheap to fix; belongs with the next generation work. |
| **R6** | MED | The overwrite guard is **render-time, not run-time**: `nextFreeDownloadPath` reads disk when the command is *printed*. Print twice → same path; run a printed command twice → the paid file is clobbered anyway. | **RECORDED.** It reduces the window rather than closing it. Honest framing: this is a speed bump, not the atomic guard the commit message implies. |
| **R7** | MED | `videoDirExists()` guards one directory while `missingClipFiles()` spans two; `submit-clips.mjs:68` `mkdirSync`s the namespaced dir, so merely *rendering a command* on a fresh clone flips the guard true and reds the test with no defect present. | **RECORDED.** A false-red generator in the exact test written to avoid false greens. |
| **R8** | MED | **`declaredFile` bypasses the stem check.** A copy-paste in `CLIP_FILES` (`attack` → `…hurt-r2.mp4`) packs the wrong animation; the glob path's stem filter would have caught it. `clipSource.mjs:61` also restates `action.replace('/','-')` instead of importing `clipStem`. | **RECORDED.** The structural test asserts the stem rule, but `findClip` itself does not enforce it — the guard lives beside the data rather than in the code path. |
| **R9** | LOW | **Three independent action lists** — `enemyView.ANIMS_BY_SLUG` (what the game plays), `slugConfig.actions` (what the build makes), `slug-config.test.ts:EXPECTED_ACTIONS` (a third literal). Add an anim to one and no sheet is ever built; `enemyLayer` silently falls back to a Rectangle. `gymBounds.KNOWN_ACTIONS` is a fourth. | **RECORDED.** Assert `configFor(slug).actions` against `enemyAnimKeys()` — the two that must agree are currently pinned to nothing. |
| **R10** | LOW | Frame-0 guard implemented **twice** — `enemyLayer.ts:115-117` and `GameScene.ts:437-440`. `enemyLayer.ts:33-35` says *"two implementations of that one rule is where the bug lives"* and then writes the second. | **RECORDED.** One `playIfChanged(sprite, key)` helper closes it. My W8 brief caused this by saying "match the player's form" without saying "extract it". |
| **R11** | LOW | `enemy-ai.test.ts:151-152`'s comment claims the mutation goes *"from 1 state change to ~20"*; measured **0 → 36**. | **RECORDED.** A stale recorded baseline in a mutation note — wrong in both directions. |
| **R12** | LOW | `enemyLayer.ts:134` draws shots as radius-8 circles; `projectiles.ts:112-124` sweeps them as a **point**. The drawn threat is 8 px larger than the real one on every side. | **RECORDED.** A fairness/readability mismatch the player can feel. Relevant to W16's bolt art, which replaces this circle anyway. |
| **A3 / R13** | LOW | Sentry projectiles have no line-of-sight or solid collision; nothing gates that a future `level-01` placement puts a wall between sentry and player. | **ALREADY RECORDED** as limitation 3 above. No change. |

### What this run proves about the protocol itself

**The adversarial brief did the work again.** Brief 1 returned seven PASSes; brief 2 — which never saw
them — found that the **9b masking rationale in this very document is false (A1)**, that the G6 fix
landed this session is **fragile to background drift (R3)**, and a **critical filename collision the
orchestrator introduced himself (R1)**. A checklist pass confirms; an adversarial pass attacks. *(A7)*

**Criterion 5.12 is FAILING and is reported failing.** Ten files exceed 400 lines, `docs/qa/` contains
no Phase 5 file-size record at all, and the Phase 4 entry that names them explicitly calls itself
*"an open violation of a non-negotiable, not a justified exception."* A green `file-size.test.ts`
proves *"≤10 over-limit files, each name-dropped somewhere"* — **not** the criterion.

| file | lines | | file | lines |
|---|---:|---|---|---:|
| `tools/gen/gates.mjs` | 726 | | `tests/unit/tilemap-data.test.ts` | 466 |
| `src/scenes/GameScene.ts` | 613 | | `tests/e2e/phase-01-boot.spec.ts` | 449 |
| `tools/gen/prompt.mjs` | 586 | | `tools/gen/sheets.mjs` | 442 |
| `tools/gen/chroma.mjs` | 542 | | `src/scenes/BootScene.ts` | 438 |
| `tests/e2e/phase-03-tilemap.spec.ts` | 496 | | `tests/unit/sheet-packing.test.ts` | 405 |

`src/sim/enemies.ts` sits at **exactly 400** — one line from turning the 10/10 ceiling red.

---

## Vault-out — Phase 5

*(Written at the end of the phase.)*
