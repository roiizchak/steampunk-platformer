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
| 1 | ~~**The 9b ordering between the player's swing and the enemies' damage is ungated.** Swapping the two calls fails no test.~~ **WITHDRAWN 2026-08-11 — the rationale below is FALSE. See the correction under it.** | ~~Not a missing test — a masked effect. Being in contact range means having already taken contact damage, which grants 45 ticks of i-frames, longer than the whole 20-tick swing. A test that only passed because of how it was posed would be worse. **Becomes reachable if `IFRAME_TICKS` drops below `attackTotalTicks(ATTACK)`.**~~ |
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

## Session 4 — 2026-08-11. The framing mechanism, and the findings session 3 recorded

### 🔴 Limitation 1 is WITHDRAWN — the "masked by i-frames" rationale was geometrically false

Finding **A1**, raised by `code-reviewer`'s adversarial brief in session 3 and confirmed here.

The withdrawn rationale argued the step-9b ordering between the player's swing and the enemies'
contact damage was untestable, because being in contact range implies already holding 45 ticks of
i-frames (`IFRAME_TICKS` 45 > `attackTotalTicks(ATTACK)` 20). **The numeric premise holds. The
geometric premise does not.**

- `ATTACK_BOX` is `{ x: 11, y: 12, w: 26, h: 24 }` (`src/sim/playerAttack.ts:50`) and reaches well past
  contact-overlap distance, so a **dead zone** exists where a swing lands with **zero** contact damage
  and therefore grants no i-frames. `tests/unit/player-attack.test.ts:89` already builds a fixture at
  exactly that gap (`IN_REACH = 1200`, doc block at `:83-88`).
- **`src/sim/worldDamage.ts:77-87` iterates `world.enemies.scavengers` only.** A sentry never deals
  contact damage at all, so the premise never applied to a sentry in the first place.

**Now gated** by `tests/unit/tick-damage-order.test.ts`, driven through the real `tick()`.

**And a decision that had never been written down is now written down:** the sentry's damage is
**projectile-only by design**. `SENTRY.damage` is spent by `src/sim/projectiles.ts`; a static turret is
something you can stand next to without being hurt, and the bolt's travel time is what makes it fair.
That was an *absence* in the code and is now an asserted fact.

### W10a — an eyeball verdict was contradicted by a measurement, and both are kept

`docs/generations/phase-05-clips.md` rates `brass-sentry/fire` and `/death` **good**; session 2's audit
and session 3's corrected G6 found every sentry clip cropped at the left and right edges. **Both
readings are honest and answered different questions** — the table read *motion* (does the flash land
on the specified pose? it does) and did not read *framing*. The verdicts are **left as written** rather
than edited, because overwriting a dated reading destroys the record that makes the contradiction
visible. Recorded in place at that file. The transferable lesson: **an eye reading a contact strip sees
motion and does not see the frame edge.**

### W10b / W11 — the live schema, compared field by field rather than pasted

`genmedia schema "bytedance/seedance-2.0/image-to-video"`, run 2026-08-11 and compared
programmatically against `CLIP_JOBS` (a pasted quote proves nothing):

```
OK     endpoint      CLIP_JOBS=bytedance/seedance-2.0/image-to-video   live: same
OK     aspect_ratio  CLIP_JOBS=1:1     live: auto|21:9|16:9|4:3|1:1|3:4|9:16
OK     resolution    CLIP_JOBS=720p    live: 480p|720p|1080p|4k
OK     duration      CLIP_JOBS=4       live: auto|4|5|6|7|8|9|10|11|12|13|14|15
records in CLIP_JOBS: 15
```

**No drift on any submitted parameter.** Three further facts, and they bound the whole framing problem:

| fact | consequence |
|---|---|
| `aspect_ratio: auto` is documented live as **"infer from the input image"** | The answer W10b was owed. `docs/FAL-MODELS.md:183-197` tabulates `auto` and never says what it does. |
| **No `negative_prompt` field exists** | Every framing instruction must go in the positive prompt. The forbid tail (`cropped limbs`) is prompt text, not a model-level negative. |
| **No `seed` INPUT field exists** — `seed` is output-only | The endpoint is **not seed-deterministic**. Any single generation carries irreducible run-to-run variance, so one output can never attribute an outcome to one treatment with confidence. This is now stated wherever a probe is designed. |
| `end_user_id` and `bitrate_mode` are live and unused | `bitrate_mode` (`standard`/`high`) is absent from the documented snapshot. |

**`docs/FAL-MODELS.md` is outside this session's scope lock.** The `bitrate_mode` addition and the
missing `auto` semantics are **flagged, not fixed**.

### 🔴 The anchor measurement, and the correction it forced to the recorded root cause

Measured with the repository's own decoder and `estimateKeyColour`:

| anchor | canvas | ratio | figure fills | L / R | T / B |
|---|---|---:|---:|---|---|
| `brass-courier` | **1536 × 2752** | **0.558 ≈ 9:16** | **91.8 % of height** (2525 px), 61.1 % of width | 18.4 % / 20.6 % | **5.1 % / 3.2 %** |
| `brass-sentry` | 2048 × 2048 | 1.000 | 68.8 % h, 77.1 % w | **10.7 % / 12.1 %** | 18.8 % / 12.5 % |
| `rust-scavenger` | 2048 × 2048 | 1.000 | 81.1 % h, 60.5 % w | 20.0 % / 19.5 % | 9.0 % / 10.0 % |

Agreement was `1.000` on all three; keys `[4,249,6]` and `[1,252,3]` — **not pure green**, the same
finding `chroma.mjs:88-93` already records, now confirmed on all three shipped anchors.

**`docs/generations/phase-05-jump-reshoot.md:22` said the courier anchor was "square 2048²". It is
1536 × 2752 — already 9:16.** Found by the session-4 Codex plan review, re-verified locally, corrected
in place. HANDOFF §8's root cause — *"its square anchor forced into 9:16 lost ~14 % off each side"* —
**never applied to the courier at all.**

**There are two causes of crop, not one:**

| cause | evidence |
|---|---|
| **Reframing** — anchor ratio ≠ output ratio, so the model refits and eats margin on the squeezed axis | `jump-r2` (0.558 → 1:1) cut at the **top**, `figureHeight` = the whole canvas on f0; the three sentry clips (1.0 → 9:16) cut at **both sides** |
| **Motion-induced extension** — the subject moves outside its anchor's static silhouette and spends whatever margin existed | Phase 4 `jump` (0.558 → 9:16, **no reframe at all**) cut on the **right**. Already recorded independently at `motion.mjs:286,291`, describing a prior jump translating upward until sampled frames had no head |

**Both spend the same resource: margin in the anchor.** That — not a single-axis mechanism — is what
justifies the anchor-padding probe. The earlier single-axis claim ("the crop lands on the anchor's
tightest axis") was correlation dressed as mechanism and is **withdrawn**.

### R3 — G6 now keys with the border median, and the fix is validated in FOUR directions

`build-clips.mjs` keyed with the **default** `[0,255,0]` while `build-assets.mjs` estimated first.
`chroma.mjs:88-93` records a real generation whose background came back `(0,195,64)` — above
`CHROMA.HIGH` — leaving it fully opaque, so at `minAlpha 255` the whole cell reads as subject and G6
throws on a well-framed clip.

**The obvious fix does not work, and the Codex plan review caught it before it was written.**
`crop → estimateKeyColour → keyOut` **throws** on the very fixture G6 must fail:
`brass-sentry-fire-frame.png` measures **78.41 %** border agreement against a 90 % floor — because the
subject occupies 21.6 % of the border, **which is the crop**.

Agreement turns out to *separate* the two cases cleanly:

| fixture | agreement |
|---|---:|
| synthetic uniform background, any colour (incl. off-key `(0,195,64)`) | **1.0000** |
| real clean Phase 4 `idle` frame, key `[3,231,8]` | **1.0000** |
| `touching-left` / `touching-right` (subject on an edge) | 0.9265 |
| real cropped `brass-sentry-fire` | **0.7841** |

So the border **median** is the correct key in both cases, and the **agreement floor** is what must be
bypassed — **not the alpha threshold**. `borderKey(image) = estimateKeyColour(image, { minAgreement: 0 })`.
`DEFAULT_MIN_ALPHA` stays **255** and `DEFAULT_MARGIN_PX` stays **3**; no threshold was touched.

**Re-validated in four directions, the fourth demanded by the Codex review:**

| direction | with `borderKey` | today (default key) |
|---|---|---|
| real cropped `brass-sentry-fire` | **FAIL** `{left:0,right:0,top:43,bottom:29}` | FAIL |
| real clean Phase 4 `idle` | **PASS** `{30,41,13,6}` | PASS |
| **R3:** off-key `(0,195,64)`, well framed | **PASS** `{30,30,30,30}` | **FAIL** ← the false positive |
| **R3 ∩ crop:** off-key **and** at the edge | **FAIL** `{60,0,30,30}` | FAIL |

The fourth row is what proves the gate was not loosened: a clean off-key PASS plus a pure-green cropped
FAIL does not cover their intersection. **This is the second time a G6 change has been made by changing
what it MEASURES rather than what it TOLERATES, and re-validated in both directions.**

### 🔴 A2 — the two `windowOpen` restatements were NOT both redundant

Session 3 recorded `enemies.ts:144` as a redundant restatement six lines below a correct `windowOpen`
call at `:138`. **They are not redundant, and deleting `:144` would have shipped a live combat
regression.** Caught by the session-4 Codex plan review, confirmed by reading `:137-149`:

- `:138` `if (windowOpen(counter, cooldown)) counter += 1` — a **saturating increment**
- `:144` `if (counter < cooldown) return { fired: false }` — the **fire guard**

Same expression, different jobs. Removing `:144` makes **every sighted sentry fire on every tick**.
The correct deduplication is a **replacement** with `windowOpen(...)`, not a deletion — so it buys
**no** file-size headroom, and `src/sim/enemies.ts` stays at **exactly 400 lines with zero headroom**.
The sentry cadence was **unguarded** until this session; it now has a test that goes red if `:144` is
removed.


---

## Vault-out — Phase 5

*(Written at the end of the phase.)*

---

## Session 6 — the spend ceiling was raised, and by whom

**The $40 ceiling was raised to $45 by the user on 2026-08-11, mid-session, with the number named
explicitly.** Recorded here because a ceiling that moves without a record is not a ceiling.

The sequence matters. At **$36.60** spent, all four re-shoots of that round still failed G6, and the
margins diagnosed the cause as **off-centre positioning rather than excessive motion** — `left 188 /
right 0`, `left 160 / right 0`, `left 154 / right 0`, each of which has roughly 90 px a side if
centred. `HOLD_CENTRED` was written against that diagnosis at $0 and remained unproven.

The options put to the user were: spend the last $3.40 on two clips, spend $1.19 on one,
spend nothing and hand off, or raise the ceiling. **The user chose to raise it, and was asked to name
a figure rather than leave it open** — because the ceiling is a hard STOP agreed before any spend,
and Phase 4's **$6.39 overrun against a $25 ceiling** is the reason this phase had one at all. An
elastic ceiling is the Phase 4 failure with extra steps.

**$45**, chosen for 4–5 clips of measured need plus 2–3 for a second round if `HOLD_CENTRED` only
partly works.

> ⚠️ **[prd/phase-05-combat.md](../prd/phase-05-combat.md) §1b still reads *"This phase's ceiling is
> $40, and it is a hard STOP."* That line is now stale.** It is **not** edited here: `docs/prd/` is
> outside this session's scope lock, and silently rewriting a phase's stated constraint from a
> session that spent against it is exactly the move that makes a ceiling meaningless. Flagged for the
> next session to correct deliberately, with this entry as the authority for who changed it and why.

### What the money established, so the next session does not re-buy it

| lever | verdict |
|---|---|
| **Ratio-matching** | **PROVEN.** Reframing cut 7 of 7 measured clips; matching removes it. The guard now measures anchor-vs-output ratio rather than banning the string `9:16`, which for the courier's 0.558 anchor is the *matched* value. |
| **Padding** | **PROVEN for framing, and it costs the scale.** It fixes the crop and shrinks the subject in frame, so a per-slug `scale` (vault A5) cannot serve a padded and an unpadded generation of one subject. The padded courier `attack` packed at 114 px against `hurt`'s 288 px. |
| **`DEBRIS_MARGIN`** | **WORKED.** `brass-sentry/death` went from `left 2 / right 0` to `left 226 / right 200`, its wreck compact rather than frame-spanning, **and it still ends broken rather than intact** — the anti-`SPAN_CLIP` sentence doing its job. |
| **`DISCHARGE_MARGIN`** | **BACKFIRED.** Satisfied by the model very largely **not firing** — `fire-r4` returned a thin wisp of smoke and no flash. A constraint describing a SHAPE, met by not performing the action. The second instance of that failure after `SPAN_CLIP`, and the reason `DEBRIS_MARGIN` carries an explicit "this governs the scatter, not the destruction" sentence. |
| **`HOLD_CENTRED`** | **UNPROVEN at the time of writing.** Authored at $0 against a measured diagnosis; the batch testing it is the one the raised ceiling paid for. |

---

## Session 7 — 2026-08-12. Four decisions, and the measurements behind them

Plan: `C:\Users\royko\.claude\plans\resume-phase-5-combat-vectorized-hanrahan.md`. Its Codex plan
review — the **seventh** for this phase — returned **BLOCK, 4 blockers, 3 major, 1 minor**; the two
decisive blockers were re-verified locally and **CONFIRMED**, and all eight were applied. Appended to
[reviews/phase-05-plan.md](../reviews/phase-05-plan.md).

**Verified baseline before any change**, taken from the JSON reporter rather than a summary line:

```
suites passed 255  failed 0  total 255
tests  passed 847  failed 0  total 847
```

### D1 — the global cell goes 288×384 → 384×384. Decision M3 stays intact.

**Taken by the user, 2026-08-12, after being shown every measurement rather than one.** Session 6
asked with a single data point (`walk` needs 296) and got an answer — 320×384 — that the next
measurement invalidated. The full set, at the scavenger's scale `0.56074766`:

| sheet | width required | fits 288? | fits 320? | fits 384? |
|---|---:|---|---|---|
| `rust-scavenger/chase` | 288 | ✅ | ✅ | ✅ |
| `rust-scavenger/walk` | **296** | ❌ | ✅ | ✅ |
| `rust-scavenger/death` | **358** | ❌ | ❌ | ✅ |
| every `brass-courier/*` | 288 | ✅ | ✅ | ✅ |
| every `brass-sentry/*` | 288 | ✅ | ✅ | ✅ |

**A collapsed scavenger lying flat is genuinely wider than it is tall** — that is why `death` is the
outlier and why it was not predictable from `walk`. 384 covers it with **26 px spare**.

**The cost was stated before the choice, not after:** 288 → 384 is a **~33 % atlas area increase**
against the **~11 %** that was agreed in session 6. That is a materially different decision, so it went
back to the user rather than being rounded up quietly. The alternatives offered were a **per-slug cell**
(smallest atlas, but amends M3 so one subject gets special treatment) and **320 with
`rust-scavenger/death` shelved** (cheapest, but discards paid art that already passes G6).

> **Why one global cell is worth 33 %.** M3 exists so that no subject silently gets its own geometry.
> The turret's wasted area is a recorded, measurable number; a per-slug cell is an invisible
> divergence that every consumer must then carry.

### D2 — `scale` becomes declarable per `(slug, action)`

**Taken by the user, 2026-08-12.** The courier's framing was already solved on disk and what remained
was a number in a config file.

`brass-courier-attack-r3.mp4` is padded, **passed G6 cleanly**, and packed — and drew **114 px against
`hurt`'s 288 px**. The arithmetic, so nobody re-derives it:

```
courier slug scale      0.23723229   derived from an UNPADDED idle,
                                     figure fills 1214 px of 1280
padded round            figure fills  ~480 px of 960
480 x 0.23723229      = 114 px drawn                (hurt, unpadded: 288 px)
```

**Padding is a property of a GENERATION, and so is the scale it implies.** A per-slug scale cannot
serve a padded and an unpadded generation of one subject. The declared per-action scale is **pasted by
hand with provenance and never computed by the build** — which is what vault A5 actually protects.

**This reverses a decision session 6 took, and the reversal is legitimate for a stated reason.**
Session 6 chose to re-shoot the courier unpadded, keeping one scale per slug. That was correct *given
its premise* — that per-slug scale could not serve both. **D2 removes the premise.** And the
alternative it chose has since been measured and failed: **three containment clauses were tried and
`brass-courier/attack`'s margins never moved off `L188 R0`** (`/death`: `L172 R0`). The $4.76 spent
since is what established that the prompt lever is exhausted for this subject.

> **What this costs, stated plainly.** The one-scale rule in `upsertLiftProfile` now binds only
> **slug-sourced** entries. That is a **narrowing**, not a strengthening, and the Codex review caught
> an earlier draft of the plan describing it as "strictly stronger". Three genuinely new checks are
> added alongside it — every entry must carry a finite scale and a known source, and a **cross-slug
> merge now throws where it was silently accepted** — but the narrowing is real, deliberate, and is
> this decision.

### D3 — the ceiling goes $45 → $55

**Taken by the user, 2026-08-12, figure named explicitly on request.** Recorded in full, with the
whole chain from $40, at [prd/phase-05-combat.md §1b](../prd/phase-05-combat.md) — which was also
corrected this session, since it still read "$40, and it is a hard STOP".

The user was asked with the honest framing that **nothing in the remaining QA gate needs money**: the
gate, the file splits and the Codex review are all $0, and the only remaining art problem with an
unattempted fix is `brass-sentry/fire`'s missing muzzle flash. Spend at the time: **$41.36**.

### D4 — config and gate first, at $0; art last

**Taken by the user, 2026-08-12.** Art bought after the gate is art the gate has not reviewed. The
Codex review then sharpened this into a hard rule rather than a preference: the implementation review
(criterion 5.14) runs on the final diff, so **any art spend afterwards invalidates it**. Art work is
therefore **explicitly post-phase** — either a future session with its own gate, or a knowing re-run of
5.14 and the full verification.

### What the money has already established — do not re-buy any of it

| lever | verdict |
|---|---|
| **Ratio-matching** | **PROVEN.** Reframing cut 7 of 7 measured clips. The guard now compares anchor ratio against submitted ratio rather than banning the string `9:16` — which, for the courier's **1536 × 2752 = 0.558** anchor, is the *matched* value and not the defect |
| **Padding** | **PROVEN for framing, and it costs the scale.** That cost is what D2 pays |
| **`DEBRIS_MARGIN`** | **WORKED**, single-variable: `brass-sentry/death` `L2 → L226`, wreck compact, **and it still ends broken**. Its "this governs the SCATTER, not the destruction" sentence is load-bearing |
| **`DISCHARGE_MARGIN`** | **BACKFIRED** — satisfied by the model very largely **not firing**. Second instance of the `SPAN_CLIP` failure: a constraint describing a SHAPE, met by not performing the action |
| **`HOLD_CENTRED`** | **Withdrawn as UNATTRIBUTABLE, not disproven.** 1 win, 1 loss, 2 no-change over four clips. **The endpoint has no `seed` input**, so four samples cannot separate a clause from run-to-run variance. Kept in `motionClauses.mjs`, applied nowhere. **Do not re-apply it** |

### A correction the Codex review forced to the repository record

**Every handoff since session 4 has described `rust-scavenger/walk` as blocked on cell width and
`chase` as blocked on its stride, as if these were different problems.** They are not.
`character-bounds-rust-scavenger.json:22` reads:

```
"stridePxPerCycle": { "walk": null, "chase": null },
```

**Both are null.** `walk` hits the pack blocker first, so no session ever reached its catalog blocker.
This is the **fourth** time in this phase that *"extraction stops at the first failure"* has hidden a
second defect behind the first — after the G6/`idle` false positive hiding the real `jump` crop, the
per-action sweep finding `brass-courier/hurt` already clean, and `--derive-scale`'s hardcoded
`findSource('idle')` deadlocking on a subject with no idle by design.

**The generalisable rule, since it now has four instances:** when a pipeline stops at the first
failure, a clean verdict on stage N is evidence about stage N **only**. Any statement of the form
"X is blocked on Y" is provisional until X has actually reached the end.

### A render risk that was checked and cleared, not assumed

Widening the cell moves a Sprite's `displayOriginX` from 144 to 192, because the constructor runs
`setSizeToFrame` → `setOriginFromFrame`. That would shift every drawn figure by 48 px **if any renderer
used a horizontal origin other than the frame centre**.

**Checked: none does.** `enemyView.ts:113`, `enemyView.ts:129`, `playerView.ts:112` and
`GymScene.ts:127` all use **originX 0.5** — which is exactly where `packStrip` centres the figure's
centroid (`sheets.mjs:353-354`). Vertically `frameHeight` is unchanged and `baselineY = frameHeight`,
so an `originY` of 1 still lands on the contact line. **The repack is render-safe, and this is why.**

### 🔴 D1 is AMENDED, and the reason is that the number it was decided on was wrong

**D1 as first recorded above — one global 384×384 cell — was taken on a figure that does not survive
measurement.** It was applied, went green, and was then withdrawn the same session. The record is kept
rather than rewritten, because the mistake is the lesson.

**`rust-scavenger/death` does not need 358 px. It needs 510.** A full per-frame sweep, using the same
`figureMetrics` the packer uses:

```
f0 170  f1 179  f2 243  f3 236  f4 358  f5 505  f6 507  f7 510  f8 508  f9 508
                        ^^^^^^                          ^^^^^^
                    the recorded figure               the actual maximum
```

**358 is frame 4.** `packStrip` throws on the FIRST clipped frame, so at the 288 cell it reported
frame 4's requirement and **frames 5–9 were never evaluated**. HANDOFF §12b recorded that number as
though it were the maximum, and a user decision was taken on it.

> **Fifth instance of one pattern, and the first that cost a decision.** *"Extraction stops at the
> first failure"* has now hidden a second defect behind the first five times in this phase: G6's
> `idle` false positive hid the real `jump` crop · the per-action sweep found `brass-courier/hurt`
> already clean · `--derive-scale`'s hardcoded `findSource('idle')` deadlocked on a subject with no
> idle by design · `rust-scavenger/walk`'s null stride sat behind its pack failure · and now this.
>
> **The rule, now that it has five instances:** when a pipeline stops at the first failure, a verdict
> about stage N is evidence about stage N **only**. Any statement of the form *"X is blocked on Y"* is
> provisional until X has actually reached the end. **Prefer instruments that sweep and report a
> maximum over instruments that stop and report an instance** — which is exactly what was done to
> `packStrip` below.

### The instrument was fixed, not just the number

`packStrip` now **sweeps every frame on both axes** and reports the true maximum, naming every clipped
frame and which is widest. Horizontal (`sheets.mjs:378`) and vertical (`:399`) both had the defect;
both are fixed.

**The verdict is unchanged — any clipped frame still fails the build.** What changed is what the gate
*measures*, never what it tolerates: it now reports complete information instead of the first
instance. Watched go red *(C1)* against a committed fixture, and the revert verified **by count**
*(C12)*: the single-frame-throw literal went 1 → 0 on both axes with content confirmed changed.
New test: `tests/unit/sheet-packing-clip-report.test.ts`.

### D1-revised — the cell is PER SLUG. Decision M3 is amended.

**Taken by the user, 2026-08-12, on the complete sweep.**

| slug | cell | why |
|---|---|---|
| `brass-courier` | **288 × 384** | every courier sheet fits 288 — pays nothing |
| `brass-sentry` | **288 × 384** | every sentry sheet fits 288 — pays nothing |
| `rust-scavenger` | **512 × 384** | `death` frame 7 requires **510**; `walk` 296; `chase` 273 |

**This required no code change.** `frameWidth` was already per-slug data in
`character-bounds-<slug>.json`, already per-row in `index.json`, and `src/render/gymGeometry.ts` and
`gymBounds.ts` already read it per row. **M3 was a policy, not a structural constraint** — a fact
nobody had checked, and which made the amendment far cheaper than the options put to the user in the
first round implied. *(That first round's option C was described as "the packer, catalog and every
consumer must carry a per-slug cell". That was wrong.)*

**What M3 actually protects is that special-casing be VISIBLE.** It is satisfied here by recording, in
the open and with the measurement, that one subject's cell differs and exactly why. Each bounds file's
`_frame` note now states its own slug's number; none still claims to be "the ONE global cell size".

**Why not the alternatives:**

- **512 global** was rejected as **+78 % atlas area** over the 288 baseline, against the ~33 % that had
  just been approved and the ~11 % before that — and it argues against itself: criterion **5.11 is
  already uncomfortable** at median 55.70 ms ≈ 18 fps, is **unrun**, and the project carries a recorded
  34.5 MB parallax-per-boot debt that already pins Playwright to `workers: 1`. Inflating every atlas by
  78 % for one animation's debris, immediately before a performance criterion is assessed, is a finding
  waiting to happen.
- **320 global, death deferred** was the runner-up and remains the fallback if per-slug ever proves
  troublesome.

### 🔴 And `rust-scavenger/death` STILL does not ship — for a sixth-instance reason

**The 512 cell is correct and `packStrip` now succeeds on death for the first time. A different gate
then throws:**

```
assets:build: "death" cell 5 of 12 is 36x9 against a median height of 229
  — that is a fragment, not a frame. Same cause as an empty cell, caught one step earlier.
```

`detectFrames` segments the extraction by content, not by even division, and finds **12** islands where
the clip has 10 real frames: indices **5 and 7 are 64 × 16 debris flecks**, detected as separate frames.
**This was masked the entire time by the clipping throw that fired first** — the sixth instance of the
pattern, surfaced by fixing the fifth.

> ⚠️ **Note for anyone measuring this clip:** an even `width / height` split gives 10 frames and is the
> WRONG splitter. `detectFrames` gives 12. Both readings appear in this session's working notes; the
> 510 px width figure is unaffected, because it comes from the real collapse frames either way.

**Not fixed here, and deliberately so.** Fixing it means tuning `minGap` / segmentation, which is a
gate change with its own both-directions revalidation, in a session already carrying the cell change,
the per-action scale and the guard redesign. **It is also plausibly the wrong fix:** the figure goes
**169 px drawn at f0 to 476 px at f7**, which is debris scatter, not anatomy. `DEBRIS_MARGIN` is proven
single-variable on `brass-sentry/death` (`L2 → L226`, wreck compact, still ends broken) and **was never
applied to the scavenger**. The likely correct answer is art, and art is post-phase this session.

**`rust-scavenger/death` is therefore DEFERRED with its paid clip kept on disk**, and the 512 cell
stands ready for it. `rust-scavenger/chase` is also deferred — its stride is genuinely
**INDETERMINATE**, swept at band heights 16/24/32 px with every sweep showing one peak and one trough
across the 12-frame sheet instead of two: the same trailing-leg-airborne failure vault 4.18 names for
the courier's `run`. **No stride was guessed.** A guessed stride is the specific failure
`catalogTimings.mjs` exists to prevent.

### What DID ship from this work

**`rust-scavenger/walk` — the first scavenger sheet in the catalog.** Packs at 512, gates PASS/PASS,
stride **312 game px** measured by the courier's own documented foot-band method (24 px band, spans
`121,153,156,134,98,66,61,62,69,127,46,45`, peak 156 doubled), re-confirmed unchanged after the cell
moved from 384 to 512 — which it must be, since the cell change is pure padding.

⚠️ **The scavenger's slug scale `0.56074766` came from a GAIT, not a neutral pose** — spread 4.2 %
against the sentry's 0.3 %. Recorded in its config. **Re-derive it if `walk` is ever re-shot.**

### A latent single-slug assumption the amendment exposed

`tests/unit/asset-catalog.test.ts` globbed **only** the courier's bounds file and checked **every**
catalog row — enemy rows included — against it. That held only while all three slugs happened to share
one width. **Same class as R1/R2 and the `shipped-sheets.test.ts` path bug: correct by coincidence,
silent when the coincidence ends.**

**Scoping the loop to courier rows would have made it pass by checking LESS**, which is the forbidden
move — enemy rows would have stopped being checked at all. It now resolves each row against **its own
slug's** bounds, which catches everything the old form caught **plus** a row disagreeing with the file
that actually cut it. An unresolvable row is an explicit failure, not a skip. Watched go red *(C1)* by
setting `rust-scavenger-walk`'s row to 288 against its slug's 512 —
`AssertionError: rust-scavenger-walk frameWidth vs rust-scavenger: expected 288 to be 512` — restored
from a fresh temp copy, revert verified **by count** *(C12)*.

**Verified after all of the above**, from the JSON reporter:

```
suites 258/258  failed 0
tests  853/853  failed 0
typecheck clean · build + verify-dist ok
```

---

## §6 gate — agent owners, run 2026-08-12 (session 7)

**Protocol:** four owners, **two briefs each** *(A7)*, all six agent briefs **dispatched simultaneously
so brief 2 could never see brief 1's findings**. Every finding below is **applied or recorded with a
one-line reason** *(C11)*. Subagents were forbidden from writing here; the orchestrator recorded these
after re-verifying the decisive claims. **Each agent's own "could not check" is preserved** *(9.3)*.

**Two sign-offs were VOID entering this run** — 5.1 and 5.5, signed in session 3 before session 4
changed `stepSentry`. Both were re-run from scratch.

### Verdicts

| # | Owner | Verdict | Basis |
|---|---|---|---|
| 5.1 | qa-expert | **PASS**, re-verified | Both sentry guards survived the barrel split — `enemySentry.ts:89` saturating increment, `:95` fire guard. Mutation-measured by code-reviewer: **deleting `:95` gives 265 shots in 270 ticks** against 3 |
| 5.2 | qa-expert | **PASS**, caveat unchanged | Still passes by `enemy-tuning.test.ts:74-109`, **not** by the test whose title claims it |
| 5.3 | code-reviewer | **PASS**, mutation-measured | Baseline 0 flap changes; single-threshold **36**; inverted asymmetry **36**; commit floor deleted → `:210` red. Reproduces session 3's 36 exactly, so session 4 did not weaken it |
| 5.4c | qa-expert | **PASS — newly measured, first time ever runnable** | `sheetGates.mjs brass-courier attack` → `G4 drift 0px within budget 3px` · `G5 frame 3 (tick 9) lands inside the active window [6, 10)` |
| 5.4d | qa-expert | **PASS** | `deriveFps` imports `attackTotalTicks(ATTACK)`/`HURT_TICKS`/`DEATH_TICKS` from `src/sim/combat.ts`, never retyped; `asset-catalog.test.ts:192-199` re-derives fps for **every** shipped row |
| 5.5 | qa-expert | **PASS**, re-verified | `combat.test.ts:84-121` walks every tick of the 20-tick swing and pins both endpoints by name |
| 5.6 | qa-expert | **PASS** | Fixture runs `IFRAME_TICKS*2` = 90 against a 45-tick window, both endpoints pinned |
| 5.7 | qa-expert | **PASS** — and it had **never actually been run by its owner** | Absent from session 3's owner table despite `qa-expert` being listed. Closed here: unit at 2/100 plus live e2e reading the real `Graphics` command buffer at 2/60 |
| 5.9 | qa-expert | **PASS** | Knobs enumerated live, swept both directions, asserted on behaviour signature not knob readout |
| 5.10 | qa-expert | **PASS**, caveat unchanged | Proves the **ratio** `ceil(maxHp/damage)` 2 vs 3; still **no test swings twice and asserts death** |
| 5.11 | performance-engineer | **MEASURED, NOT SATISFIED** — see below | |
| 5.12 | code-reviewer | **FAILING** — 8 files over 400 | |
| 5.15 | qa-expert | **PASS** | Kill-plane crossing tick pinned; tunnelling band derived from a real trajectory, both halves asserted |

### Findings — every one applied or recorded

| ID | Sev | Finding | Disposition |
|---|---|---|---|
| **S1** | **HIGH** | **The scavenger's chase has no dead zone.** `enemyScavenger.ts:118-120` is `dir = playerX >= x ? 1 : -1` with no tolerance, so a player the scavenger cannot reach — standing directly above it — makes `facing` flip **every single tick**. `enemyView.ts:133` reads `facing` for `flipX`, so the sprite strobes. **Measured against the real sim: 39 facing flips in 40 ticks** with the player 4 px to one side and 300 px up. Worse, `enemy-ai.test.ts:188` re-pins `s.x = 500` every tick and its own docstring names *"the player is above it"* as the real in-game case — **the test pins out exactly the case it names.** No test asserts `.facing`. | **RECORDED, NOT FIXED — blocker-class for session 8.** Confirmed by the orchestrator against the real sim, not taken on report. The fix needs a dead-zone width, which is a **balance decision**, and it is a change to gated combat code late in a long session — the same reasoning that deferred finding A1 rather than patching it ad hoc. **It is a visible defect and must not be shipped unfixed.** |
| **S2** | **HIGH** | **The chase ignores the patrol bounds, and release teleports.** `enemyScavenger.ts:121` returns before the clamp at `:127-133`. **Measured: patrolMax 700, chased to x=900, snapped back to 700 the first tick after release — a 200 px instantaneous jump.** `enemy-ai.test.ts:121` uses `playerX: 99999`, so the chase branch never meets the bounds. | **RECORDED, NOT FIXED — blocker-class for session 8.** Confirmed by the orchestrator. Whether a chase *should* respect patrol bounds is a design question (a scavenger that will not leave its ledge vs one that pursues), so it is the user's call, not a render module's. |
| **S3** | **HIGH** | **5.11's `bodyCount` cannot tell a real Sprite from the `Rectangle` fallback.** `EnemyLayer` tracks `isSprite` alongside `bodies` **for exactly this purpose** (`enemyLayer.ts:39-40`), but the spec's `snapshot()` and delta assertion read only `bodies.length` (`phase-05-combat.spec.ts:80-104`, `:188`). A catalog regression that un-registered `rust-scavenger-walk` would drop all 20 fleet scavengers to plain rectangles, **frame time would plausibly improve**, and 5.11 would still report green. | **RECORDED, NOT FIXED.** This is vault 9.4 exactly — *fast because nothing expensive is drawn* — one layer subtler than an empty scene. The fix is small (assert on `isSprite`, and add a lower bound on `medianMs`) but it is a change to the very spec whose measurement 5.11 is being judged on, and doing that inside the same session that judges it is the wrong order. **First item for session 8.** |
| **S4** | **HIGH** | **The `<100 ms` ceiling does not test the stated target and is simultaneously too tight and too loose.** The criterion and the spec docstring promise **60 fps** (16.6 ms); the assertion permits 100 ms. **And the number is not stable:** the recorded run was `median 55.70 ms / max 63.30`, an independent re-run on the same fixture with zero code changes gave **`median 82.10 ms / max 89.40`** — a ~48 % swing that is already 82–89 % of the cutoff. So it can fire on ordinary noise while still passing a 2× directional regression. | **RECORDED.** The ceiling is documented in-file as a deliberate sanity bound because **no baseline exists** — PRD §7 records the vault has nothing on performance (§B1). Replacing it needs a baseline, which is what this phase's vault-out is supposed to create. See the vault-out entry below. |
| **S5** | MED | **`DEV_FLEET_COUNT = 20` is worst-case by fiat.** `GameScene.ts:42-44` calls it *"a deliberate 10x stress multiple… no authored level approaches"* — a design claim, not a measurement. Nothing in `src/sim/` or the level format caps concurrent enemies, and the only shipped level places **2**. | **RECORDED.** Honest framing: 22 bodies is a *chosen* stress figure, not a derived worst case. It becomes checkable when level-02+ exist. |
| **S6** | MED | **`combat.ts`'s own docstring contradicted `tick.ts`.** It listed *"hazard / kill plane"* as step-4 internal item 2. World-geometry damage actually resolves at **step 9b**, after collision — `tick.ts:21,40-46`, which is the declared authority and states explicitly *"The plan put world-geometry damage in step 4. It cannot go there"*, because a swept hazard test needs both endpoints of the tick's motion. | ✅ **APPLIED.** Corrected in `src/sim/combat.ts`, with a note recording that this was the *"prose is not the authority"* trap in the one file least allowed to carry it. |
| **S7** | MED | **The session's own split introduced a duplicate and a cycle.** `verdict()` was defined identically in **both** `gates.mjs:32` and `gatesSelfTest.mjs:30` — the same restate-don't-import class as recorded finding A2 — and `gates.mjs` re-exported from `gatesSelfTest.mjs` while that file imported back, a **circular import** safe only for as long as `gatesSelfTest.mjs` declared no top-level `const`. One edit from a TDZ crash, and the same fragility already recorded for `motion.mjs`/`motionCombat.mjs`. | ✅ **APPLIED.** `verdict` is now exported once from `gates.mjs`; `fill` moved beside the gates that use it; the re-export is gone, so the edge is one-way. **The first fix attempt broke 23 suites** — other tests imported `fill` from `gates.mjs` — which is why `fill` moved rather than the importers. Both modules' docstrings corrected. `265 suites / 865 tests / 0 failed` after. |
| **S8** | MED | **`file-size.test.ts`'s globs cannot see two files over 400.** `.agents/skills/fal-redesign/runtime/src/upgrade.mjs` (**597**) and `bin/fal-site.mjs` (**413**) are invisible to `src/**/*.ts` · `tools/**/*.mjs` · `tests/**/*.ts`. | **RECORDED, no change.** Judgement: both are **vendored skill runtime, not this project's source**, so the honest count for criterion 5.12 remains **8**. The glob's blindness is real and is recorded here so it is not rediscovered. Within the project tree the blindness is currently harmless — `tools/**/*.ts` and `src/**/*.mjs` match zero files. |
| **S9** | MED | **The phase ADDED to the worst offenders while the split commit advertised a reduction.** Against `main`: `GameScene.ts` **+105** (613 → 657), `sheets.mjs` +22, `sheet-packing.test.ts` +14 — and `file-size.test.ts` stayed green throughout. | **RECORDED.** True and worth stating plainly: 10 → 8 is real, and the phase also grew the largest file by 105 lines. Both facts belong in the 5.12 verdict, which is **FAILING**. |
| **S10** | MED | **The 5.12 evidence table in this log was stale.** It read *"Ten files exceed 400"* and listed `chroma.mjs` 542 (now 55), `prompt.mjs` 586 (now 396), `enemies.ts` "exactly 400" (now 60) — **and that stale table is exactly what keeps `file-size.test.ts:68`'s name-drop check green.** | ✅ **APPLIED.** Corrected below. The *verdict* was always honest (5.12 marked FAIL); the evidence under it had rotted. |
| **S11** | MED | **5.7's e2e cannot catch the defect its unit test was written for.** The live assertion is `0 < fillRect.w < slotW` at hp 2/60 — which a naive `Math.max(MIN, ratio × slotW)` floor **also satisfies**. Only the pure unit test (`enemy-view.test.ts:74-75`, 1hp ≠ 2hp) catches a flattened low end. | **RECORDED.** The two tests are complementary, not redundant, and the e2e must not be mistaken for a superset. Worth a 1hp-vs-2hp live assertion later. |
| **S12** | LOW | No one-counter shape assertion for `Sentry.cooldownCounter` (only the scavenger has one, `enemy-ai.test.ts:229`), and that assertion enforces a **naming convention** (`endsWith('Counter')`) rather than a state-space property — a `chaseTimer` would bypass it. No test oscillates across `releaseRadius`. | **RECORDED.** Neither was reachable by any mutation the reviewer found. |
| **S13** | LOW | The hysteresis invariant is enforced at the **dev knob** (`enemyTuning.ts:119`), not at construction — `createScavenger` accepts inverted radii silently. | **RECORDED.** Caller-enforced invariant in the wrong layer; harmless today because the only writer is the dev panel. |
| **S14** | LOW | 5.6's test lives at `player-combat.test.ts:129-142`; session 3's log cites `combat.test.ts`. Citation drift, test intact. | ✅ **APPLIED** — corrected by this entry. |
| **S15** | LOW | The splits are recorded in **no** `docs/qa/` entry; commit `898c928` was their only record. | ✅ **APPLIED** — recorded below. |

### What this run proves about the protocol itself

**The adversarial brief earned its place for the third phase running.** Brief 1 for `qa-expert`
returned ten PASSes. The three adversarial passes — none of which saw a checklist result — produced
**S1, S2, S3 and S11**, including **two confirmed gameplay bugs in code that every checklist verdict
had just called PASS**. 5.3 is genuinely well-built and mutation-resistant, *and* the scavenger it
governs strobes its facing 39 times in 40 ticks. Both are true. A checklist pass asks whether the
stated thing works; only an adversarial pass asks what else is in there.

**And two agent reports were WRONG, which is why every decisive claim was re-verified:**

- The `performance-engineer` **checklist** brief reported *"all 22 bodies draw as `Rectangle`
  fallbacks — zero enemy keys in `index.json`"*. **False.** `brass-sentry-idle` and
  `rust-scavenger-walk` are both catalogued as of this session, `GameScene.ts:518` registers every
  catalog key, and a patrolling scavenger asks for `rust-scavenger-walk`. Its own adversarial
  counterpart said the opposite and was right.
- The `qa-expert` **adversarial** brief reported 5.4c and 5.4d as *"never run — no combat sheet is
  packed"*. **False**, and it said honestly that it had run no tests and was reading `docs/HANDOFF.md`.
  **`HANDOFF.md` was stale mid-session by construction** — §13 had not been written yet — so the
  document that exists to orient a reader actively misled one.

> **Two transferable lessons.** A subagent's summary is a claim, not evidence — *both* of these were
> caught only because the orchestrator re-read the catalog. And **a handoff document is stale from the
> first commit of the session that will rewrite it**; anything reading it mid-session must be told so.

**The orchestrator's own probe was wrong twice before it was right**, which is worth recording rather
than hiding: `createScavenger` takes `y` with **no default**, so omitting it made `withinRadius`
compare against `undefined` and detection silently returned `false` — the scavenger never chased and
the first run looked like a clean refutation of S1. The second attempt put the player outside the
480 px detect radius and failed the same way. **A probe that quietly does nothing looks exactly like a
probe that found nothing.** Both bugs were only confirmed once the fixture was checked for entering
the state it was meant to test.

### 5.11 — the measurement, and it is NOT satisfied

**Vault-out entry for performance, stated precisely because the vault has nothing (§B1):**

> Under headless Chromium + Vite dev server, `workers: 1`, **22 drawn enemy bodies** (2 placed by the
> level + `DEV_FLEET_COUNT` 20), with `rust-scavenger-walk` and `brass-sentry-idle` catalogued so the
> fleet renders as **animated Sprites**: median frame time **55.70 ms** (recorded session 6) and
> **82.10 ms** (independent re-run, session 7), max to **89.40 ms** — **roughly 12–18 fps against a
> 60 Hz (16.7 ms) target**, i.e. **3–5× over budget**, with a **~48 % run-to-run swing** on identical
> code.

**The swing is the most important number here and neither brief drew the connection: session 6's
55.70 ms was measured when the 20-scavenger fleet had no sheet and drew as rectangles. This session
shipped `rust-scavenger/walk`, so those 20 bodies now animate.** Part of the 55.70 → 82.10 movement is
very likely **not noise but the sprite path being exercised for the first time** — i.e. the cost of
this session's own art landing. That is a hypothesis, not a measurement: it is not isolated, and
isolating it needs a run with the catalog row removed. **Do not report the 48 % as pure variance.**

**Confounds, stated rather than assumed away:** headless Chromium (SwiftShader vs a real GPU
rasteriser — direction of bias genuinely unknown), `workers: 1`, **34.5 MB of PNG per boot** with
`mid.png` alone at 9.1 MB (an existing recorded debt), and dev-server rather than production build.

**Criterion 5.11 asks for the frame budget "measured under worst-case enemy count." A number exists
and it is bad. It is reported as measured-and-failing, not as passed.**

### 5.12 — FAILING, with the evidence table corrected (supersedes the stale one above)

**Eight files exceed 400 lines.** The three splits this session were real — export surfaces verified
identical (gates 19/19, prompt 13/13, chroma 15/15, nothing missing or added), and a multiset line
diff showed **zero lines lost** for prompt and chroma, so nothing was "shortened" by deleting
explanation, which `file-size.test.ts:22-26` names as the failure mode to fear most.

| file | lines | | file | lines |
|---|---:|---|---|---:|
| `src/scenes/GameScene.ts` | **657** | | `tools/gen/sheets.mjs` | 464 |
| `tools/gen/gates.mjs` | 562 | | `tests/e2e/phase-01-boot.spec.ts` | 449 |
| `tests/e2e/phase-03-tilemap.spec.ts` | 496 | | `src/scenes/BootScene.ts` | 438 |
| `tests/unit/tilemap-data.test.ts` | 466 | | `tests/unit/sheet-packing.test.ts` | 419 |

**None of these is justified, and this log will not pretend otherwise.** Phase 4's entry already calls
its list *"an open violation of a non-negotiable, not a justified exception"*, and that remains the
honest description.

**`file-size.test.ts` is not evidence for this criterion and should not be cited as such.** It asserts
`over.length <= 10` — **two free slots** at 8 — and its name-drop check is a bare-basename
`String.includes` across *all* `docs/qa/*.md`, so `src/sim/tick.ts` (379) could cross 400 tomorrow and
be "pre-approved" by an unrelated prose mention. It is a ceiling, not an assertion that anything is
fine, and its own comment says so.

**Why `gates.mjs` is still over:** removing exactly the fixtures and `selfTest` leaves **529 lines of
actual gate logic** — already over the cap before anything is extracted. Getting it under 400 requires
moving gate logic itself; the 153-line brass-cap section is the obvious candidate. **`GameScene.ts`
was excluded deliberately**: it is subclassed by `ElementEditorScene` and `PlaygroundScene`, and
`ElementEditorScene` already depends on its key arrays, making it the one split that can break
dev-only scene guarding.

**Splits recorded for the name-drop check and for the record** *(S15)*: `tools/gen/gatesSelfTest.mjs`,
`tools/gen/promptData.mjs`, `tools/gen/chromaKey.mjs`, `tools/gen/chromaComponents.mjs`.

### `play`-owned criteria — 5.4 and 5.8, run 2026-08-12

`play` is **not an agent**. Both were driven by hand in a live browser with `playwright-cli` against
the dev server, after the sheets that unblock them shipped this session. **Neither had ever been run
against real art**; 5.4 was excluded from the e2e spec on the grounds that `rust-scavenger-walk` did
not exist, and 5.8's only prior evidence was a grey-box screenshot.

#### 5.4 — enemy walk animation advances past frame 0 during patrol — **PASS**

**A screenshot cannot prove this.** It is a *timing* claim, and CLAUDE.md's own rule is that an
existence assertion cannot verify one. Sampled **inside the page** via Phaser's `animationupdate`
event, which fires on **every frame change** and carries `frame.index` — a strictly better instrument
than polling per animation frame, and it satisfies *"sample inside the page and return an aggregate"*
without a wait expressed in ticks, which cannot bound a sampling window.

```
sprites with a live animation : brass-sentry-idle, rust-scavenger-walk, brass-courier-idle
animationupdate events        : 41

rust-scavenger-walk   distinct frame indices [1..12] of 12   everLeftFrame0: true
brass-courier-idle    distinct frame indices [1..12] of 12   everLeftFrame0: true
brass-sentry-idle     distinct frame indices [1..8]  of 8    everLeftFrame0: true
```

**The scavenger walked through all twelve of its frames during patrol.** This is the criterion, and it
is the first time it has been answerable — `enemyLayer` drew `Rectangle`s until this phase, and the
frame-0 guard was only ever tested against a **mock scene, never a live Phaser `AnimationState`**.

**Why the criterion exists, confirmed mechanically:** this phase's vault-in *(5.1)* records *"Phaser
restarts a looping animation on every state change, which is how a walk cycle never left frame 0."*
That is exactly `play()`'s documented behaviour — it stops and restarts — and `playIfChanged`
(`src/scenes/playAnim.ts`) is the guard, skipping when `getName()` already matches. The 12 distinct
indices are that guard working in a live scene rather than in a unit fixture.

#### 5.8 — health bar legible at true sprite size against a cool background — **PASS, with a caveat**

Driven to a genuine low-HP state rather than screenshotted full: a live scavenger set to **2/60**, at
camera zoom 1 and true sprite size, against `level-01`'s cool blue-grey boiler wall. **Judged by eye at
3× magnification**, because a downscaled view cannot settle a legibility question.

**Verdict: legible.** The fill reads as a saturated red sliver on a black field — high contrast both
against the bar interior and against the cool background behind it — and it is **visibly non-empty at
2/60**, which is criterion 5.7's `BAR_MIN_FILL_PX` floor confirmed *visually* rather than only as a
predicate. A bar this size at 3.3 % HP would be invisible without that floor.

> ⚠️ **Caveat, and it is a real readability finding.** By capture time the scavenger had closed to
> ~120 px of the player, so the two sprites overlap at true size and the enemy bar renders **across the
> player's head**. At a glance it is ambiguous which entity the bar belongs to. It is not a blocker —
> the bar itself is legible and correctly positioned above its own body — but "legible" and
> "unambiguous" are different properties, and only the first is currently gated. Worth an offset or an
> ownership cue when enemy art is finished.

**Recorded here, not only in the session, because the repository had no record of either run and the
Codex implementation review correctly reported both as UNRUN on that basis.** See
[reviews/phase-05-impl.md](../reviews/phase-05-impl.md) findings 1 and 2, and the note there about a
handoff document being stale from the first commit of the session that will rewrite it.

---

## Playtest, 2026-08-12 — three defects found by hand that the whole gate missed

**Source:** `Recording 2026-08-12 173100.mp4`, 27.7 s of live play, reported by the user after the
§6 gate, both Codex reviews and 46 e2e had all been run and reported. **Every one of the three was
then confirmed in the code**, so these are not impressions — they are located defects with a line
number. None is fixed; all three are session-8 work.

> **This is vault C4 again, and more sharply than Phase 2 recorded it.** The gate had just finished:
> 4 owners × 2 briefs, 15 findings, two Codex reviews, 870 unit tests and 46 e2e green. **Two minutes
> of hands-on play found three defects, two of them one-line root causes.** A criterion is a question
> someone thought to ask; playing the game is what asks the questions nobody wrote down.

### P1 — dead enemies keep acting. **One missing condition, two visible symptoms.**

`src/sim/enemyTurn.ts:29-41` — `stepEnemies` iterates **every** scavenger and **every** sentry with
**no `hp > 0` filter**:

```js
for (const scavenger of world.enemies.scavengers) stepScavenger(scavenger, sighting);
...
for (const sentry of world.enemies.sentries) { if (!stepSentry(sentry, sighting).fired) continue; ... }
```

And `stepSentry` itself never reads `hp` — confirmed, the only occurrences of `hp` in
`src/sim/enemySentry.ts` are the interface (`:31`), the options type (`:49`) and the constructor
(`:55,64,65`). The fire path at `:89-99` gates on the cooldown window alone.

**So a sentry at 0 hp keeps counting its cooldown and keeps firing**, which is exactly what the user
saw. The same missing guard means **a dead scavenger keeps patrolling and chasing** — the
"corpse keeps walking" symptom that finding R4 predicted from the render side and that
`playIfChanged`'s missing-key no-op was only ever a partial mitigation for.

**Why no test caught it:** every combat test asserts hp reaching 0, and none steps the world
*afterwards*. `5.10`'s known caveat — *"no test actually swings twice and asserts death"* — is the
same blind spot seen from the other end. Death is asserted as a **number**, never as a **state the
world then has to behave correctly in**.

### P2 — the death animation never plays, for either enemy

Reported as "misses the animation of death", and it is a direct consequence of the catalog:
**neither `brass-sentry/death` nor `rust-scavenger/death` ships.** Both are blocked at the fragment
gate. `playIfChanged` (`src/scenes/playAnim.ts`) deliberately **no-ops on a missing key so the
previous animation keeps running** — documented as "the intended fallback while the catalog is
partial". Combined with **P1**, a killed enemy therefore keeps playing its *idle* or *walk* cycle and
keeps acting. The two defects compound: the fallback was designed for a body that had **stopped**.

### P3 — hitstun is COSMETIC. Being hit does not interrupt the player.

Reported as "even when he touched me, [it] broke the animation ... and I can actually move and can
attack him." Confirmed:

- `HURT_TICKS = 18` (`src/sim/combat.ts:71`) and `enterCombatState(player, 'hurt')` (`:211`).
- `COMBAT_STATES` (`:156`) and `isCombatState` (`:166`) are consumed in **exactly one place** —
  `src/sim/player.ts:185`, inside `resolveState`, whose only job is to stop **step 11 overwriting the
  state label**.
- **Nothing in the tick order suspends input, movement or the attack edge during `hurt`.** Step 5
  (horizontal accel) and step 4b (the attack edge) run unconditionally; neither consults
  `player.state`. `grep` for any movement gate on `hurt` returns nothing.

**So `hurt` reserves a label for 18 ticks and changes no behaviour.** The player slides and swings
through their own hitstun, which is also why the animation "breaks" — the sheet plays while the
character is being driven by live input.

⚠️ **This is a design decision that was never taken.** Whether hitstun should lock movement, lock
attack, or neither is a **balance call for the user**, not something to patch in. But the current
state is not a considered choice — it is an absence, and the criteria never asked.

### How this lands against the criteria

| criterion | status before | what the playtest shows |
|---|---|---|
| 5.5 | PASS | still true — the *attack window* is correct. It never asked what happens to the **defender** |
| 5.6 | PASS | still true — i-frames span their window. i-frames gate **damage**, not **control**; nobody noticed those are different |
| 5.10 | PASS, caveated | the caveat is now a defect. "No test swings twice and asserts death" is why P1 shipped |
| 5.4 | PASS | the walk cycle does advance — on a **live** enemy. It also advances on a dead one, which is P1/P2 |

**None of these verdicts was wrong. The gate simply had no criterion for "what does the world do
after something dies."** That is the gap to write into Phase 5's vault-out.

### P4 — the run cycle drops frames, and it is 5.11 made visible

Reported as "when the character is running, it is missing frames ... not using the whole 12 frames."

**The sheet is complete.** `brass-courier-run` is catalogued with **12 frames**, `simTicks 27`, and
**fps 26.67** derived as `12 × 60 / 27`. Nothing is missing from the art or the catalog.

**The renderer cannot keep up with it.** Criterion 5.11 measured **12–18 fps** actual. A 26.67 fps
animation sampled by a 12–18 fps render loop **must** skip: at 15 fps each drawn frame advances the
animation by ~1.8 frames, so roughly every other pose is never displayed. `run` is the fastest
animation in the game and therefore the first place the frame budget becomes visible as an art defect.

> **This is the most valuable thing in the playtest.** 5.11's number was abstract — "12–18 fps against
> a 60 fps target" — and the honest question was how much it actually mattered. **It matters enough to
> destroy a 12-frame animation the project paid to generate.** The frame budget is not a
> nice-to-have; it is already costing shipped art. It should be treated as the phase's top
> non-blocking priority, above further art spend.

**Do not "fix" this by lowering the run fps.** The fps is *derived* (`renderFrames × TICK_HZ /
simTicks`) and authoring it down to match a slow renderer would reintroduce vault 4.22's foot-slide —
trading a visible defect for a worse invisible one. **Fix the frame rate, not the number.**

---

# Session 8 — 2026-08-12. **This section supersedes the playtest section above.**

Plan: `C:\Users\royko\.claude\plans\resume-phase-5-combat-whimsical-lightning.md`, reviewed by the
**eighth** Codex plan review (BLOCK, 2 blockers / 4 major / 2 minor, **all eight confirmed locally**
— [reviews/phase-05-plan.md](../reviews/phase-05-plan.md)).

## Four corrections to the inherited brief, all verified in the tree before any code was written

The session-7 handoff and the session-8 prompt built on it were **wrong in four places**. Each was
checked against the code, and each changed the work:

| | the brief said | the tree says |
|---|---|---|
| **C1** | *"step 4b (the attack edge) runs unconditionally"* during `hurt`, so P3 needed to gate both movement and attack | **False.** `canAct` (`combat.ts:298-300`) is `!isCombatState(state)` and already gates the edge at `:286`. **Attacking during `hurt` was never possible.** P3 is movement-only — one condition, not two. |
| **C2** | *"That test does not exist today, and its absence is exactly why P1 shipped"* | **It exists, and it is worse than absent.** `player-attack.test.ts` *"a dead enemy stops threatening"* stepped **30 ticks past hp=0** and asserted only the **player's** hp, on a fixture authored `patrolMin === patrolMax === 1000` so the clamp pinned the corpse. **A false negative, not a gap** — the test ran, passed, and could not see the defect it was named for. |
| **C3** | *"a corpse still needs to be drawn … check what `enemyLayer`/`enemyView` expect of a 0-hp body before choosing"* | **Already resolved; the render side needed no change at all.** `enemyView.ts:49-54` and `:62-67` return `'death'` at `hp <= 0`, and `enemyLayer.ts:125-127` alphas the body to 0.35 with a comment explaining that a corpse vanishing on the frame it dies gives no feedback. Nothing splices or destroys a body anywhere in `src/`. **P1 was purely a sim fix.** |
| **C4** | 5.11's spec needs a `window.__game` field to reach `isSprite` | **No.** TypeScript `private` is erased at runtime, so `__phaserGame.scene.getScene('Game').enemies.isSprite` is reachable through the seam the spec already uses for `bodies`. **The nine-field surface stays closed** and no STOP-and-ask was needed. |

**The lesson is C2's.** A handoff that says *"no test covers this"* is a claim about the repository,
and it was checked and found false. The dangerous case is not the missing test — it is **the test
that exists, runs green, and is structurally incapable of failing.**

## Two things the brief did not know

- 🔴 **Knockback was never built.** Phase 5 §1 names it as scope, `tick.ts:245` and `combat.ts:15,25`
  place step 4 before integration **specifically so knockback reaches the same tick's movement** —
  and nothing has ever written `player.vx` on a hit. The only `vx` writes in `src/sim/` are
  friction/accel in `player.ts` and the world-bounds clamp in `hazards.ts`. **The seam was built and
  left empty for a whole phase**, and no criterion asked.
- **Enemy `y` is frozen at spawn.** `enemyScavenger.ts:70` sets it and nothing writes it again; there
  is no gravity or ground collision for enemies. So a scavenger that chases past its patrol bound
  does not fall — **it floats at ledge height over the gap.** This is what made S2's clamp the
  correct answer rather than merely the conservative one, and it was not visible from the defect
  report.

## User decisions, 2026-08-12

| | decision | note |
|---|---|---|
| **E1** | Attack moves **`Z`/`J` → `F`/`L`** | The user reported the old placement as unnatural. No e2e spec pressed either key, so the rebind was free. |
| **E2** | Hitstun hard-locks movement for **`ATTACK.startup` (6 ticks)**, then control returns while the `hurt` label runs its remaining 12 | Chosen over an authored 8 so the number **reuses a measured constant** rather than inventing one *(vault 5.3)*. |
| **E3** | **Knockback ships**, impulse `walkMax` — **provisionally re-opened** | Codex finding 4 showed ground friction 3.69 cuts a 5.54 impulse to 1.85 px before its first integration, so `walkMax` buys ~2 px. The user chose it **before that was known**; the measured displacement goes back to them. |
| **E4** | Scavenger dead zone **96 px**, holding facing **and** movement | One tile, 12× one tick of `chaseSpeed`. |
| **E5** | **The chase clamps to the patrol bounds** | Makes both the 200 px teleport and the floating scavenger structurally impossible. |
| **E6** | **New criterion 5.16** | Wording and rationale in [prd/phase-05-combat.md](../prd/phase-05-combat.md) §6. |
| **E7** | Full scope, **including the 5.12 splits** | Splits run last, so nothing is split while it is also being edited. |

## P1 — CLOSED

`stepEnemies` now filters `hp > 0` on both loops (`enemyTurn.ts:31`, `:43-45`); `stepProjectiles`
stays **outside** the guard so shots already in flight keep travelling. The guard is at the **call
site**, not inside `stepSentry`/`stepScavenger`, which keeps both step functions pure and stops a
corpse's `cooldownCounter` advancing — `sentryAnim` reads that counter, so a corpse whose counter
kept moving would compete a `fire` pose against its own death pose.

**Watched RED first**, as the whole point of the item: `expected 1 to be +0` on projectile count,
`expected 650 to be 500` on the corpse's `x`.

> 🔴 **A parity coincidence nearly produced a false green, in the very test written to catch a false
> negative.** The first fixture put the player at the corpse's own x. A *live* scavenger there
> oscillates around the player, so on an **even** tick count it lands back where it started — and the
> test passed with the bug present. Both fixtures now keep the player outside the 480 px
> `detectRadius`, so a live scavenger would only **patrol**, and patrol drift is monotonic. **"The
> number did not change" is not evidence unless you know the bug would have changed it.**

## P4 — H3 found, and it is a default nobody chose

`GameScene.ts:522-529` registers every animation with `key`, `frames`, `frameRate` and `repeat` —
and **never sets `skipMissedFrames`**, so it takes Phaser's default of **`true`**. That flag makes the
engine **skip frames when playback lags wall-clock**: a 26.67 fps `run` cycle under a slow renderer
does not slow down, **it drops poses**. That is precisely the reported symptom, and it explains why
`run` — the fastest animation in the game — is where the frame budget first showed as an art defect.

⚠️ **This does not license flipping the flag.** `skipMissedFrames: false` would show every pose while
letting the cycle run *slow*, which is **vault 4.22 foot-slide** — a worse defect because it is
invisible. H3 explains why the symptom is visible; **the fix is still the frame rate.**

### 🔴 P4 DIAGNOSED — the parallax layers are 64 % of the frame budget *(headless)*

> ⚠️ **This section said "SOLVED" and it was overstated. Read
> [P4 on real hardware](#-p4-on-real-hardware--the-defect-is-a-software-rasteriser-artifact) below
> before acting on anything here.** Every number in this section is headless SwiftShader. On a real
> GPU the frame budget is **4.2 ms and 12/12 poses**, and the defect this section attributes to the
> parallax layers **does not occur at all**. The A/B remains a correct measurement of the headless
> harness; it is not a measurement of the shipped game.

A controlled A/B in the identical harness, the fleet spawned exactly as criterion 5.11 spawns it,
`brass-courier-run` sampled while the player held a sustained run:

| | median frame | max | **run frames PAINTED per cycle** |
|---|---:|---:|---|
| parallax **ON** (shipped) | **70.30 ms** | 80.60 ms | **[12, 12, 7, 5, 7]** |
| parallax **OFF** (probe) | **25.50 ms** | 30.20 ms | **[12, 12, 12]** |

**The three background layers cost ~45 ms per frame.** With them removed the frame time drops by
**64 %** and **every one of the twelve run frames is painted, every cycle.** That is P4, start to
finish: the user's *"missing frames … not using the whole 12"* is 5–7 of 12 reaching the screen.

They are three **5092 × 1080 RGBA** `TileSprite`s (`GameScene.ts:546-560`) drawn into a 1920 × 1080
view — 21.3 MB of the 27.9 MB boot payload, and ~66 MB of texture sampled every frame.

**H2 is REFUTED.** The animation is not restarting: its state machine passes through 11–12 of 12
frames per cycle even at 70 ms. Nothing is wrong with the sheet, the catalog, the fps, or
`playIfChanged`. **H3 is the mechanism, not the cause** — `skipMissedFrames: true` is why the cycle
stays in time while dropping poses instead of running slow, which is the correct trade and must not
be flipped.

> 🔴 **Three metrics, and the first two both said "no defect". This is the finding under the finding.**
>
> 1. **Distinct frame indices over the whole sample → 12/12.** Useless: the sample spans ~19 cycles,
>    so the UNION reaches 12 even if every single cycle drops half. It reported perfect coverage.
> 2. **Distinct indices per cycle, off the `animationupdate` event → 11–12 of 12.** Still wrong, and
>    much more convincingly: **the event fires when the animation STATE advances, and Phaser can
>    advance several frames inside one rAF.** Every one fires the event; only the last is drawn.
> 3. **The current frame sampled once per rAF, at paint time → 5–7 of 12.** The truth.
>
> **An event that fires when state advances is not evidence a frame was drawn.** The first two
> metrics would each have closed P4 as "not reproducible" against a defect the user could see with
> their own eyes.

**Not measured:** whether real Chrome with a GPU holds 60 fps. The harness is headless with no
`launchOptions`, therefore SwiftShader, and the interactive-browser run was not available. The A/B
above is valid regardless — both arms ran in the identical environment — but the absolute
millisecond figures are a software-rasteriser number and **must not be quoted as the shipped frame
rate**.

**The fix is not applied**, because every candidate changes shipped art bytes and that is the user's
call: downscale the three sources to something nearer the 1920 px view; or split each into a smaller
tile the `TileSprite` repeats; or drop a layer. **Do NOT lower the run fps** — it is derived, and
authoring it down trades a visible defect for vault 4.22 foot-slide.

### The retile was attempted, and it REFUTED the texture-size hypothesis

User-approved, 2026-08-13: crop each layer to 960 px before the existing `mirrorLoop`, so it wraps at
**1920 × 1080** instead of 5092 × 1080. The `TileSprite` already draws at 1:1 into a 1920-wide window,
so the sharpness-preserving move is a crop and never a second resample. Shipped as `e1aaa92`.

A same-session **interleaved** A/B — A,B,A,B,A,B in one Playwright session, so a load drift partway
through cannot land entirely on one arm:

| | median of medians | run frames PAINTED per cycle |
|---|---:|---|
| retiled parallax **ON** | **90.10 ms** | mostly 4–6 of 12 |
| parallax **OFF** | **37.20 ms** | mostly 8–12 of 12 |

**Ratio 2.42, against 2.76 before the retile.** Shrinking the texture 2.65× moved essentially
nothing. **Texture size was never the mechanism** — the cost is three full-screen alpha-blended
1920 × 1080 draws, and cropping the *source* removes not one *drawn* pixel. The earlier reading of
"the layers are 64 % of the budget" was correct about *the layers*; it was silently assumed to be
about *their size*, and that assumption is now dead.

> The interleaving is why this comparison means anything. The first attempt measured the retiled
> build at 85.80 ms and compared it to the 70.30 ms recorded a day earlier — on a machine that then
> had ~24 concurrent `node.exe` processes on it. **That compares nothing**, and the agent that ran it
> flagged its own confound rather than reporting a regression. Absolute ms figures from this harness
> are not comparable across sessions; only within-session ratios are.

**Kept anyway, on the payload win alone** (user decision, 2026-08-13): 21.4 MB → 7.5 MB of boot
payload, 2.9× smaller, which also relieves the e2e serialization pressure. The cost is real and is
recorded here rather than buried: each layer now holds only 960 px of unique art, so **the background
repeats ~2.65× more often**. That is a visible art change, and it is a hands-on judgement no gate
makes — it belongs in the next playtest.

### 🔴 P4 on real hardware — the defect is a software-rasteriser artifact

Run 2026-08-13, user-approved, in **real Chrome with a real GPU**: `ANGLE (NVIDIA, NVIDIA GeForce RTX
4080 (0x00002704) Direct3D11 vs_5_0 ps_5_0, D3D11)`, confirmed in-page off
`WEBGL_debug_renderer_info` before sampling rather than assumed. Dev build, `window.__game.ready`
waited on, dev fleet spawned, `brass-courier-run` held, 4-second window, the **same** sampling method
as the headless probe: the current animation frame index read once per `requestAnimationFrame` at
paint time, aggregated in-page.

| | headless (SwiftShader) | **real Chrome, RTX 4080** |
|---|---:|---:|
| median frame | 90.10 ms | **4.2 ms** |
| p95 | — | **4.4 ms** |
| max frame | ~95 ms | **4.8 ms** |
| sustained | ~11 fps | **240 fps**, vsync-locked |
| poses painted per cycle | 4–6 of 12 | **12, 12, 10, 12, 12, 12** |

**Reproduced identically three times**, each after a page reload, with `runSamples` 745 and
`completeCycles` 6 every run — not one number moved between runs.

**P4, as measured, does not occur on real hardware.** The renderer never misses a 240 Hz vsync with
three parallax layers, a 20-scavenger fleet and the player running. Five of six cycles paint all
twelve poses; the worst paints ten.

> **What this costs us in confidence, stated plainly.** Every P4 number that existed before today —
> the 12–18 fps in criterion 5.11, the 70.30/25.50 A/B, the "64 % of the frame budget", the
> 5-of-12 pose drop — came from headless Chromium with no `launchOptions`, therefore SwiftShader.
> Three blended full-screen quads is punishing work for a CPU rasteriser and near-free for a GPU, so
> the harness was measuring **itself**, not the game. The W7 plan called for exactly this real-browser
> arm and it was skipped because the browser launch was unavailable; the whole retile was designed,
> executed and shipped against a number that the very first real-hardware reading contradicts by
> **21×**.
>
> The lesson is not "the headless harness is useless" — it is a fine *relative* instrument, and the
> ON/OFF ratio it reports is real. The lesson is that **a performance criterion with an absolute
> threshold cannot be owned by a software rasteriser.** 5.11's `medianMs < 100` was never a budget;
> it was a sanity ceiling on a renderer nobody ships.

**Open questions this does NOT close**, and they must not be quietly folded into the good news:

1. **The user's original report was a real browser.** It was *"missing frames … not using the whole
   12"* on their own machine, which is where the 4080 reading comes from. Either the retile and the
   grey-box fix changed it, or the original observation was of something else — a state flicker, the
   dev fleet, a different scene. **Not resolved. It needs a hands-on playtest, not another probe.**
2. **One cycle in six painted 10 of 12, not 12.** Small, reproducible, and unexplained. It is not the
   5-of-12 catastrophe, and it is not nothing.
3. **240 Hz flatters the result.** A 240 Hz display samples a 26.67 fps animation ~9× per pose. On a
   60 Hz display that margin is 4× smaller. Untested.
4. **This was the DEV build over the Vite dev server**, not `dist/`. The production bundle is
   smaller and drops the dev scenes, so it should only be faster — but "should" is not measured.

## S1 and S2 — CLOSED, and fixing S2 blinded criterion 5.9's sweep

`deadZone` is a **per-scavenger field**, not a module constant, because criterion 5.9's sweep runs
through `enemyKnobs()` over **live entity fields** and a constant is invisible to it — Codex plan
review 8, finding 5. It follows the exact shape `detectRadius` and `releaseRadius` already use, and
`enemyTuning.ts`'s own docstring at `:17-23` already stated that adding a tunable field means adding
it there. The chase clamp is now positional-only and shared by both paths; `facing` is decided per
path, so a chaser pinned at its bound still faces the player.

> 🔴 **Adding the knob turned `enemy-tuning.test.ts` RED — and the cause was this session's own S2
> fix.** `scav0.deadZone moved no observable output in either placement`. Not a dead knob: a blind
> fixture. In the `near` placement the scavenger chases the retreating player straight into
> `patrolMin` and **clamps**, so total travel saturates at `3000 - 2600 = 400` px for *every* value
> of `deadZone`. The clamp is S2's fix. **A gate can be made blind by a correct change to the thing
> it measures**, and only a knob that happened to need close range revealed it.
>
> Repaired by adding a third placement, `contact`, with patrol bounds wider than the scavenger can
> cross in 240 ticks — travel becomes speed-limited rather than clamp-limited — and the player
> starting inside the dead zone. The assertion is `some()` across placements, so a third placement
> can only make the sweep **more** sensitive: **broadening what the gate MEASURES, never loosening
> what it TOLERATES.** Watched red by mutating the dead-zone check to `if (true)`, restored from a
> fresh temp copy, revert verified **by count** (1 → 0 → 1, zero `if (true)` remaining).

> 🔴 **The parity coincidence struck TWICE in one session**, in W1 and again in W2, and both times in
> a test written to catch a false negative. A fixture with the player at the scavenger's own x makes
> a *live* scavenger oscillate `500 → 508 → 500`, so on an **even** tick count it lands home and the
> test passes with the bug present. **"The number did not change" is not evidence unless you know
> the bug would have changed it.**

## Phase 4 debt — 4.10 and 4.12 are RUN, and both PASS

Both were on the §1b ledger and both were confirmed still unrun by the Codex implementation review.
Closed with throwaway scratchpad probes; **no tracked file was changed to close either.**

**4.10 — `gateReachBand` against the REAL shipped sheets.** All nine catalogued sheets swept, each
with its own fresh call, and the gate's internal loop tracks a `best` across every frame rather than
breaking on the first failure (`tools/gen/gates.mjs:211-244`) — so this is a sweep, not an instance,
which is the standing correction to this phase's six stop-at-first-failure incidents. **Re-run
independently by the orchestrator; every number below reproduced exactly.**

| sheet | cell | frame | reachX | band y | movedPx |
|---|---|---:|---:|---|---:|
| `brass-courier-idle` | 288×384 | 7/12 | 199 | 242–254 | 14678 |
| `brass-courier-walk` | 288×384 | 5/12 | 215 | 232–244 | 20455 |
| `brass-courier-run` | 288×384 | 4/12 | 219 | 195–207 | 22741 |
| `brass-courier-jump` | 288×384 | 1/6 | 227 | 216–232 | 22250 |
| `brass-courier-fall` | 288×384 | 1/6 | 230 | 217–233 | 16687 |
| `brass-courier-hurt` | 288×384 | 1/6 | 216 | 237–247 | 21707 |
| `brass-courier-attack` | 288×384 | 3/8 | 269 | 148–152 | 23765 |
| `brass-sentry-idle` | 288×384 | 3/8 | 260 | 237–248 | 19650 |
| `rust-scavenger-walk` | **512**×384 | 6/12 | 403 | 288–293 | 33926 |

**Nine PASS, zero FAIL, zero INDETERMINATE.** The per-slug cell is confirmed live in the audit — the
scavenger is measured at 512, not at a global 288. **G5 does not substitute for this** (Codex impl
finding 6): different audit, different question, and this is the one that had never produced a number.

**4.12 — `findSource`'s deliberate-removal red run *(C1)*.** `_generated/sheets/brass-courier-attack-clip.png`
(1,210,555 bytes) backed up to a fresh temp copy, `findSource` confirmed working on the positive case
first, then the input removed. It threw, from `tools/gen/assetSources.mjs:36`:

```
assets:build: no source sheet for declared animation "attack" — expected
C:\Claude\Steampunk Platformer\_generated\sheets\brass-courier-attack-clip.png.
A declared input that cannot be found fails the build; it is never substituted (vault 4.16).
```

Restored and verified **by count (1 → 0 → 1)**, `cmp` byte-identical, and `findSource` resolving
again afterwards. `_generated/` is gitignored, and `git status --porcelain` stayed empty throughout —
which is exactly why the backup went to the scratchpad and **not** to `git stash`: the tree held two
other agents' uncommitted work at the time.
