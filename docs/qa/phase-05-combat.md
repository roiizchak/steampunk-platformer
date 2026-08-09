# Phase 5 — combat, enemies and hazards

Index entry in [QA-LOG.md](../QA-LOG.md). Findings from the gate's agent owners land here;
`docs/reviews/` stays Codex-only.

---

## THE FROZEN COMBAT TIMINGS — criterion 5.4b

**Recorded 2026-08-09, before any fal generation for this phase.** No `request_id` exists for Phase 5
at the time of writing; `docs/generations/phase-05-*.md` is empty. That ordering is the criterion:
the numbers art is derived from must be fixed *before* the art is bought, or the art is what fixes
the numbers.

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

## Known limitations, recorded rather than fixed *(C11)*

| # | What | Why it is not fixed here |
|---|---|---|
| 1 | **The 9b ordering between the player's swing and the enemies' damage is ungated.** Swapping the two calls fails no test. | Not a missing test — a masked effect. Being in contact range means having already taken contact damage, which grants 45 ticks of i-frames, longer than the whole 20-tick swing. A test that only passed because of how it was posed would be worse. **Becomes reachable if `IFRAME_TICKS` drops below `attackTotalTicks(ATTACK)`.** |
| 2 | **`HUD_SLOT` is measured from the shipped `hud-health.png`.** | Uncomfortably close to what vault A5 forbids. Declared in one place with its provenance instead of re-measured at runtime. **If the HUD art is regenerated, re-measure those four numbers** — no gate can see a stale slot, the fill just sits slightly off inside the frame. |
| 3 | **The sentry's projectile does not collide with solids.** | It would need the solid list, an ordering decision against the player's own motion, and a second swept test. The sentry has clear line of sight in `level-01`, so the case does not arise. |
| 4 | **`enemyKnobs` uses a named field list, not enumeration.** | An enemy's `x`, `hp` and counters are state, not tuning; a panel that let you drag `hp` would be a cheat menu. Cost: adding a knob means adding it there too. |

---

## Vault-out — Phase 5

*(Written at the end of the phase.)*
