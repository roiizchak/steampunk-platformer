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

## Vault-out — Phase 5

*(Written at the end of the phase.)*
