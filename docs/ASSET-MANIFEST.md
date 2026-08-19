# ASSET-MANIFEST

The agreed list of every character, enemy and animation the game needs, and which phase produces
each one. Phase 4 deliverable, written so **Phase 5 and Phase 6 are not surprised by a missing
sheet** — the failure this document exists to prevent is discovering at combat-tuning time that the
sheet a mechanic needs was never generated, in a phase whose art budget is already spent.

← [PRD spine](PRD.md) · pipeline: [ASSET-PIPELINE.md](ASSET-PIPELINE.md) · art direction:
[STYLE.md](STYLE.md) · every generation: [GENERATION-LOG.md](GENERATION-LOG.md)

**This is a plan, not a record.** A row here is a commitment to produce something; the evidence that
it exists is `public/assets/index.json` (the catalog the game refuses to boot without) and
GENERATION-LOG.md (the request id it came from). Where the two disagree, they do — and the catalog
wins, because it is the one the game reads.

---

## 1. The rule that decides which phase owns a sheet

**An animation is produced in the phase that owns its timing.** Not the phase that owns its art.

`fps = renderFrames × TICK_HZ / simTicks` *(vault 4.22)*, so a sheet generated before its `simTicks`
exists has to be given an authored frame rate — and an authored rate against a real move is the
defect vault 4.22 records: *every light attack had 0.43 s of art over a 0.25 s move, so the strike
was never drawn.* This is why `attack`, `hurt` and `death` are **Phase 5** rows below even though
they belong to the Phase 4 character: `src/sim/combat.ts` does not exist yet, so their timings do
not either.

The corollary is the ordering rule inside each generating phase: **grey-box the mechanic and freeze
its timings first, generate second.**

---

## 2. Characters

### 2.1 `brass-courier` — the player · **Phase 4, DONE**

Anchor: `public/assets/characters/brass-courier/anchor.png`, locked in [STYLE.md](STYLE.md) §8.
Cell 288 × 384 px. Scale 0.23723229 source→game px, derived from idle and pasted by hand *(vault
A5)*. Collision box 132 × 288 px = `PLAYER_BOX × RENDER_SCALE`, published in ASSET-PIPELINE §0a.

| Animation | Frames | `simTicks` | Derived from | Loop | Anchor | State |
|---|---|---|---|---|---|---|
| `idle` | 12 | 90 | authored (breathing period) | yes | feet | ✅ shipped |
| `walk` | 12 | 46 | measured (stride 254 px) | yes | feet | ✅ shipped |
| `run` | 12 | 27 | measured (stride 320 px, **provisional**) | yes | feet | ✅ shipped |
| `jump` | 6 | 18 | sim | no | centroid | ✅ shipped |
| `fall` | 6 | 18 | sim | no | centroid | ✅ shipped |
| `attack` | TBD | from `src/sim/combat.ts` | sim | no | TBD | ⬜ **Phase 5** |
| `hurt` | TBD | from `src/sim/combat.ts` | sim | no | TBD | ⬜ **Phase 5** |
| `death` | TBD | from `src/sim/combat.ts` | sim | no | TBD | ⬜ **Phase 5** |

**`walk` and `run` are one animation state each, not a speed blend.** `SHIFT` selects walk; the state
machine in `src/sim/player.ts` picks the key and `src/render/playerView.ts` maps state → sheet key
through a `Record<PlayerState, string>`, so Phase 5 adding `attack` to the union is a compile error
here until it is handled — which is the seam that stops a new state shipping as a black sprite.

**The `run` stride is provisional and this is where that is recorded.** 320 px/cycle is agreed by two
methods, but eleven of the run's twelve frames measure a single boot in the foot band, so the
agreement rests on one frame — close to vault 4.18's INDETERMINATE condition. Settle it in the Gym
against the running character. **The observable if it is wrong is run foot-slide.**

**Vertical anchors are per-animation and deliberate.** `feet` where the ART puts the character on the
floor; `centroid` for airborne states, where the SIM owns altitude and art that also rises adds a
second uncorrelated motion. Rationale and the measurements behind it: `character-bounds.json`
`_verticalAnchor`.

### 2.2 Enemies · **Phase 5, all of it**

Two contrasting enemies, per [phase-05-combat.md](prd/phase-05-combat.md) §1. Slugs are **not yet
agreed** — they are named here as roles so the count is committed even though the naming is not.

| Enemy | Role | Animations needed | Notes |
|---|---|---|---|
| static turret | detection radius, does not move | `idle`, `telegraph`, `fire`, `death` | No locomotion, so no stride to measure. The **detection radius must be visible**, which is a render concern, not a sheet. |
| patrolling scavenger | chases on sight | `idle`, `walk`, `chase`, `attack`, `hurt`, `death` | Needs its own stride measurement, by the same foot-band method, or it foot-slides exactly as the player would. |

Both need **enemy health bars** — small, floating, distinct from the player's HUD assembly
*(STYLE.md line 399)*. Whether that is a generated sheet or drawn geometry is a **Phase 5 decision
that is not yet made**; recording it here so it is decided rather than discovered.

⚠️ **Neither enemy has an anchor image yet.** An anchor is generated before its animations and locked
in STYLE.md §8, and Phase 4 learned at cost that the anchor's own contact geometry must be measured
first: this character's anchor drew one boot 58 source px above the other, which put a flat 6 game-px
gap under one sole in **every frame of every animation generated from it**. Measure both soles
against one line before shooting any clip *(criterion 4.27)*.

---

## 3. Non-character assets

| Asset | Catalog key | Phase | State |
|---|---|---|---|
| walkway tile | `walkway-tile` | 3 | ✅ shipped |
| industrial tileset | `tiles-industrial` | 3 | ✅ shipped |
| parallax far / mid / near | `bg-far` `bg-mid` `bg-near` | 3 | ✅ shipped |
| HUD health assembly | `hud-health` | 4 | ✅ shipped, **unused until Phase 6** |
| gear pickup | `gear` | 6 | ✅ shipped, 72 × 72 |
| **level exit gate** | `goal-gate` | **8 follow-up** | ✅ shipped, **192 × 288** — authored at the goal rect so `setDisplaySize` is a no-op |
| collect → scoreboard tween art | — | 6 | ⬜ |
| hazard art (spikes beyond the tileset) | — | 5 | ⬜ |
| audio cues | — | 7 | ⬜ — needs the catalog schema extended |

**`hud-health` is shipped but nothing draws it.** That is deliberate and worth stating: the HUD is a
Phase 6 deliverable in a parallel `UIScene`, and the asset was generated in Phase 4 because it comes
off the same STYLE.md §4 template as the character. A catalog entry with no consumer is not a defect
here — but it is exactly the shape of one, so if you are reading this because something looks
unused, this is your answer.

**The catalog schema does not yet cover audio.** `public/assets/index.json` has `images`, `levels`
and `sheets`, all required and non-empty. Phase 7's audio cues need a fourth list, and adding one is
a `describeCatalogProblem` change plus fixtures — see §4 below for why that is not free.

---

## 4. What a new asset costs, in gates

Adding an asset type is not just a file. Everything in this list fired at least once during Phase 4:

1. **`public/assets/index.json`** — hand-maintained. `assets:build` writes sheets and never rewrites
   the catalog, and `tests/unit/asset-catalog.test.ts` rejects stale values.
2. **`src/game/assetCatalog.ts`** — a new required list means `describeCatalogProblem` must reject a
   catalog missing it, or a typo ships a game with none of that asset and a boot that is happy.
3. **Every catalog-injection fixture in `tests/e2e/phase-01-boot.spec.ts`.** This is the one that
   bites. When `levels` became required in Phase 3, every fixture began refusing for *"missing its
   levels list"* rather than for the defect it was written to test; Phase 4 repeated it exactly with
   `sheets`, turning five sharp gates into one blunt one. The fixtures now build **from the shipped
   catalog** with only the field under test replaced, which is what stops a third occurrence.
4. **`src/scenes/BootScene.ts`** — a per-entry verifier must guard on `describeCatalogProblem`
   before iterating. Phase 4 added `verifySheets` without that guard, so a malformed catalog **threw
   during problem collection** and the refusal never ran: `ready:false`, `bootError:null`, the hang
   state the whole refuse-to-route design exists to prevent.
5. **`tools/gen/verify-dist.mjs`** — the shipped bytes must reach `dist/`.
6. **GENERATION-LOG.md** — one row per generation, with its `request_id`. Non-negotiable: it is the
   only thing that makes a shipped asset traceable to what produced it.

---

## 5. Open decisions, listed so they are decided rather than discovered

| # | Decision | Owner phase | Cost of getting it wrong |
|---|---|---|---|
| M1 | Enemy slugs and their anchor images | 5 | An anchor is locked in STYLE.md §8; changing it later re-shoots every clip. |
| M2 | Are enemy health bars generated art or drawn geometry? | 5 | A generated bar needs a catalog entry, a chroma gate and a per-enemy scale. |
| M3 | Do the turret and scavenger share one sheet cell size with the player? | 5 | The cell is 288 × 384 for a 1214 px source figure; a smaller enemy at the same scale wastes most of every cell. |
| M4 | Catalog schema for audio | 7 | See §4 — a new required list touches boot validation and every fixture. |
| M5 | `run` stride 320 px confirmed in the Gym | 4/5 | Foot-slide, proportional to the error. |
