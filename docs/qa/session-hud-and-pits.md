# Session: the HUD banner's placement, and the pits that could not kill you

**Not a phase.** Phase 10 is done and shipped (15/15). This follows the repo's non-phase **session**
precedent — `docs/qa/session-bugfix-tiers.md`, `docs/qa/session-tier5-*.md` — which is invisible to
`tests/unit/docs-contract.test.ts` while still carrying both Codex reviews, agent owners with two
briefs each *(A7)*, and a C11 disposition for every finding.

Branch `session-hud-and-pits`. Plan: `C:\Users\royko\.claude\plans\there-are-a-few-soft-snowflake.md`.
Gate-owner findings: `session-hud-and-pits-02-gate-owners.md`. Codex: `docs/reviews/`.

---

## What the owner reported

Two defects, both found by **playing the shipped production build** — neither reachable by any gate
in the suite, which is the third time this project has recorded that *(vault C4;
`owner-plays-on-60hz-dev-box-is-240`)*.

1. **The controls banner sits on the play area.** Four screenshots, the strip circled in red. It was
   drawn at `x = 24, y = HUD_MARGIN * 3 + HUD_PLATE.h`, 44 px bold, wrapped to the full 1872 px view
   width — a band of text across the middle of the screen, below the HUD plate. *"I want to change
   the position of the text of the controls to be right next to the health bar."*
2. **Levels 2, 3 and 4 have places you fall into that cannot hurt you.** *"There is a place where the
   character can fall through tiles due to missing tiles. It needs to be a rule for when the
   character can so if can die."* Then, unprompted, the diagnosis: *"missing spikes."*

---

## Part 2 — the pit rule

### The distinction that makes it a rule and not four edits

`belowKillPlane` (`src/sim/hazards.ts:59`) fires the tick the feet pass `heightPx`, so a
**bottomless** gap is already lethal. A **pit** is not: a run of ground walled in by raised masses on
both sides has a *bottom*, so you land on it, take nothing, and climb out.

**Five shipped. Four had no spikes.** The fifth — level-03 cols 65-69 — did, hand-typed, and that is
what proves the other four were an omission rather than a design: the intent was always *a pit bottom
carries spikes*.

Nothing in the suite could see it. `level-hazards.test.ts` is **existential** — at least one hazard
per level must hurt a walking player, which says nothing about a pit on the other side of the map.
`level-completable.test.ts`'s auto-player tanks damage and finishes anyway. `level-reach.test.ts`
ignores hazards outright. So four unspiked pits shipped with a green suite, and a sixth authored
tomorrow would have shipped the same way.

### Where the rule lives

`tools/gen/pitDetect.mjs` owns the definition. `levelBuilder.mjs` derives the spikes from the very
rectangles it emits as collision, and `tests/unit/level-pits.test.ts` imports **the same function**
to check the shipped `.tmj` bytes *(vault 3.1, vault 5.3 — one definition, two consumers, never a
near-copy that agrees on the easy cases)*.

> A **pit** is a maximal run of **≥ 2** columns whose walkable surface is the level's
> `groundTopRow`, where the column on **each side** is solid at the **2 rows immediately above the
> pit floor** — which is the only thing that actually stops you walking out sideways.

⚠️ **That is the SHIPPED rule, and it is two clauses. The plan specified five.** This block used to
quote the five-clause version — nearest surface 2 tiles higher, both neighbours existing, neither
bottomless, both reaching the ground — and **three of them were dead code**: an out-of-bounds index
reads `undefined` and `!undefined` is true, and a column no rectangle covers never has its
ground-reaching flag set, so `reachesGround` already subsumed the map-edge and bottomless tests. No
fixture could ever have discriminated them. Found independently and on the same day by the
`qa-expert` gate owner (brief 1) and by Codex round 3; restructured to `isWall()`, which asks the one
question all four were circling. The exclusions all survive as consequences of the live rule.

Each clause earns its place, and each SHAPE the rule must reject has a committed fixture — because
**the shipped maps cannot tell a correct detector from a sloppy one.** A far broader rule that checks
none of these clauses returns the same five pits. That was Codex plan review round 2's sharpest
finding and it is the
reason `tests/fixtures/pit-levels/` holds sixteen files rather than four.

### 🔴 The deviation from the plan, and why the owner made it

The plan said **spikes at every pit bottom**, and that is what was built first. It made the game
unplayable.

`tests/unit/level-hazard-free.test.ts` already had the reason written in its own header: *"a run
placed where a DESCENT lands is unavoidable at any width, because the policy only reacts while
grounded. Three shipped runs were exactly that, and this gate found all three."* **Three of the four
unspiked pits sat exactly where a descent lands.** The auto-player took 11 deaths at level-02 and
never finished it.

Nine further hazard placements were tried, to keep the difficulty ramp while moving the spikes
somewhere survivable. **Every one was rejected by an existing gate**, and the list is worth keeping
because it is a map of where hazard cannot go in this game:

| # | Placement | Rejected by |
|---|---|---|
| 1 | level-04 col 30 | descent landing |
| 2 | level-05 col 120 | descent landing |
| 3 | level-04 col 33 | gap take-off column, blocked by the 29-32 run |
| 4 | level-04 col 20 | gear body inside the spikes |
| 5 | level-05 col 18 | gear body inside the spikes |
| 6 | level-04 col 92 | sentry patrol beat 89-91 |
| 7 | level-05 platform tops | attrition death — no single hazard kills, the sum does |
| 8 | level-05 col 89 row 12 | blocked the only route |
| 9 | near-spawn runs, both levels | re-crossed on **every** respawn, so the cost multiplies by deaths |

The owner then chose to **fill the pits in** rather than spike them: widen the walls and platforms so
the player cannot fall in at all. Four filled, one — level-03 cols 65-69, which is jumped mass to
mass from an elevated walkway rather than descended into — keeps its spikes.

| Level | Cols | Was | Now |
|---|---|---|---|
| 02 | 84-85 | unspiked pit | **filled** — wall at col 82 widened 2 → 4 |
| 03 | 65-69 | spiked (hand-typed) | **spiked** — now derived |
| 03 | 107-111 | unspiked pit | **filled** — wall at col 104 widened 3 → 8 |
| 04 | 123-125 | unspiked pit | **filled** — platform 114-122 → 114-125 |
| 04 | 128-131 | unspiked pit | **filled** — wall at col 126 widened 2 → 6 |

Hazard per level after the fills: **672 / 768 / 864 / 960 / 1056 px** — 96 px, exactly one tile, per
step. The ramp is monotone, which it was not mid-session.

**⚠️ State this plainly when reporting the work.** The owner asked for spikes at every pit bottom.
What shipped is four pits *removed* and one spiked. It fixes what was reported — you can no longer
fall into a hole and take nothing — and it is not what was asked for.

### The hand entry that would have made the gate decoration

`tools/gen/levels/level-03.mjs` listed `{ fromCol: 65, toCol: 69 }` in its `spikes` array **and** the
rule derived it. Harmless-looking; `mergeSpikeRuns` collapses the duplicate.

But with the other four pits filled, **65-69 is the only pit left in the game**. So with both
mechanisms producing it, deleting the derivation entirely left the whole suite green — the hand entry
covered for the rule failing. Deleted. The gate now goes red naming the level and the columns.

*A second mechanism that masks the first one failing is precisely the false green this session
exists to remove.*

---

## Part 1 — the banner

### Two constraints that decided the design, both found in review

- **`src/scenes/GameScene.ts` is at exactly 400/400** against a ratchet that permits zero files over
  (`tests/unit/file-size.test.ts:324`), with no `SIZE-EXEMPTION`. The `gameHud.ts:20` comment calling
  it *"the only file over the ceiling"* was **wrong** and has been corrected — it is *at* it, which is
  a different fact with the same consequence.
- **`src/scenes/UIScene.ts` imports Phaser as a VALUE**, which is why `enemy-feedback.test.ts:29`
  records it as *"still gated as source text"*. Anything put there cannot have the stronger
  behavioural draw-path gate, and `npm run test:sim-isolated` runs the suite with Phaser uninstalled.

Codex round 1's fix — move the banner into `UIScene` — fails both, and round 2 found three more
lifecycle defects it would have introduced. So the banner got **its own layer**,
`src/scenes/helpBannerLayer.ts`, `import type Phaser` only.

### The layout

`helpBannerLayout(counterRightPx, gameWidthPx, scale, lineCount)` in `src/render/helpBanner.ts`.

- **`counterRightPx` is MEASURED, not computed.** The first draft derived it from `GEAR_ICON_PX`,
  `COUNTER_FONT_PX` and a digit count — two of which are private to `hud.ts`, with the digit count
  hard-coded at 2 while `counterText()` derives it from `MAX_LEVEL_GEARS`. And Phaser wraps on the
  browser's own `measureText()`, so any advance-width estimate is fiction that happens to agree at
  one font size *(Codex round 1, finding 2)*.
- **`lineCount` is MEASURED too.** Four strings reach this layer — the shipped legend, the DEV legend
  with three extra keys, and the Playground and Element Editor legends. The owner's decision was
  **keep every key printed, allow three lines**, so no row count is written down anywhere in code or
  in a gate. `getWrappedText().length`, after the wrap width and font size are applied.
- **`y` centres those rows on the plate's middle, clamped to the top margin**, so a tall form grows
  downward into the empty band instead of off the top of the screen.

### 🔴 Layout is deferred to the next update, not ordered against the resize

Codex round 2, finding 9, asked for a pinned order — position, `setFontSize()`, then read
`Text.width`, because Phaser's setter synchronously rewrites the width. Deferring removes the
question instead of pinning it, and it had to, for a reason found in build:

**This layer's `resize` listener is registered BEFORE `UIScene`'s.** `GameScene.create()` builds the
layer; `UIScene.create()` registers its own listener afterwards; the emitter calls them in that
order. So reading the counter *during* a resize reads the **previous** size's geometry at any
ordering the layer could choose for itself. An `update` always runs after every listener for that
frame. The behavioural gate asserts exactly this and goes red against an implementation that lays out
inside the resize handler.

The same mechanism covers the first layout: `attachHud()` returns before `UIScene.create()` has run,
so the counter does not exist yet *(Codex round 2, finding 1)*.

### Two findings that only building produced

1. **The 4 px stroke draws OUTSIDE `wordWrap.width`.** Phaser adds `strokeThickness` to the measured
   width, so a banner wrapped to exactly the remaining band overruns it. The e2e right-margin
   assertion failed by **1.56 px at 852 × 480** on its first run. `helpBannerLayout` now subtracts
   `HELP_STROKE_PX * scale`. A layout that asks for an outline has to leave room for the outline.
2. **`UIScene` is not running at all in a dev scene.** It stops itself when `Game` goes away, which
   is Codex round 2's finding 2 — recorded there from the source, confirmed here live: switching to
   `Playground` leaves `scene.isActive('UI')` false. The banner still lays out, from the stopped
   scene's last counter geometry, so it lands in the same band. **Recorded, not fixed** — making
   `UIScene`'s owner key dynamic is in the plan's *Out of scope*.

### What was deleted

`addHelpBanner()` and `HELP_BANNER_Y` — no consumers left. `SCENE_UPDATE` joined the three vendored
engine literals in `engineLiterals.ts`, pinned against `UPDATE_EVENT.js` like the others.
`hud-layout.test.ts`'s source-text draw-path gate was **repointed** from `gameDev.ts` to
`helpBannerLayer.ts` rather than deleted: the new behavioural gate is stronger on the constant, but
only the source scan can say no hardcoded `px` size has crept back in anywhere in the module.

---

## Gates, and every one watched failing *(C1, C12)*

Redness detected **positively** from named specs and a failure count, never from an exit code; and
every revert confirmed by *content changed **and** the failure count dropping*, never by "the count
is now zero".

| Mutation | Gate | Red | Reverted |
|---|---|---|---|
| `pitSpikeRuns()` returns `[]`, levels regenerated | `level-pits.test.ts` | 1 failed — *"the pit at cols 65-69 has no hazard above column 65"* | 1 → 0, 30/30 |
| same | `pit-damage-tick.test.ts` | 4 of 6 failed | 4 → 0, 6/6 |
| same | `session-pit-death.spec.ts` | both cases | 2 → 0 |
| `layout()` returns early | `help-banner-layer.test.ts` | 4 of 13 | 13/13 |
| lay out inside the `resize` handler | same | 3 of 13, **including the ordering case** | 13/13 |
| drop the shutdown listener removal | same | 1 of 13 | 13/13 |
| banner restored to the old full-width geometry, `dist/` rebuilt | `phase-10-production.spec.ts` | band ink **0**; with the order swapped, old strip **5611 px** | 5/5 |

### One gate that did NOT go red, recorded rather than implied away

Replacing `hazardHit`'s swept segment with a bare **point test** at the tick's end position leaves
`pit-damage-tick.test.ts` fully green. Measured, not assumed. The player comes to rest inside this
particular pit's band, so the pit cannot distinguish the two. The tunnelling property has its own
discriminating gate in `tests/unit/hazards.test.ts`, with a non-vacuity pair beside it, and this file
is **not** a second proof of it. Written into the file's own header.

---

## Regression

| Command | Result |
|---|---|
| `npm run typecheck` | clean |
| `npm test` | **2690 passed, 0 failed**, 738 files — count read, not inferred |
| `npm run test:sim-isolated` | **2686 passed, 4 skipped** (2690) — the four engine-literal pins, correctly skipped with Phaser removed |
| `npm run build` | dev-seam gate ok (27 bodies folded); `verify-dist ok: 5 level(s) and 12 audio file(s) byte-identical, no DEV-only scene key or debug surface` |
| `npm run test:e2e` | **148 passed**, exit 0 — the count read positively, not inferred from the exit code |

🔴 **Re-run in full after the hazard tile landed: unit 2690/0, e2e 148 passed exit 0, build and
verify-dist ok.** One spec failed on the first of those runs — 8.7's level-cost ratio, at
`2.0000000000034106` against a bound of 2 — and is written up at the end of this file as a float tie
in a quantised timer, not a regression. It passed 4/4 in isolation at the same bound on the same
commit before the comparison was made noise-proof, and 148/148 after.

⚠️ **These are the figures AFTER the gate owners' AND the Codex implementation review's findings
were applied.** The first pass through this table recorded 2677 / 2673 / 147 — the pre-review state.
The gate owners added eleven unit tests and an e2e case; Codex's review added two more (the shipped
legend's content, and the hazard ramp's exact per-level delta). The numbers moved with them.

⚠️ **`npm run assets:levels` regenerates the `.tmj` files, not `assets:world`** — `assets:world`
writes tiles, backgrounds, HUD and gear art and never touches a level. The plan said `assets:world`
in two places and was corrected; it was caught while driving a mutation loop, where a "reverted"
level that had never been regenerated made a gate look like it could not go red.

Levels 01 and 05 regenerate **byte-identical** to `main`; only `level-0{2,3,4}.tmj` changed.

Ports 5173 and 4173 freed before reporting *(C13)*.

---

## The third defect — *"there is a hazard that is not being seen"*

Reported by the owner on 2026-08-28, playing level 3, **after** everything above had shipped green.
Not a regression: it had been true since Phase 4.

### The reproduction, before any theory

A throwaway Playwright probe booted level-03, cleared the enemies, held ArrowRight and sampled the
player every 30 ticks until forward progress stopped:

```
STALLS [{"col":27,"x":2622,"y":1920,"hp":80}, ... ]
```

Two facts fall out of that one line. The player **stops dead at col 27.3**, against the 3-tile mass
at cols 28-29 — real, drawn, jumpable level design, and the *"jump above him"* half of the report.
And they arrive there at **hp 80**: they walked through the spike run at cols 24-26 and lost 20 hp
without ever seeing it.

`level-hazard-free.test.ts` proves every shipped level is finishable **without touching a single
spike** — its auto-player jumps them. So the spikes are avoidable and the level is not broken. What
failed is that a human did not know to jump.

### Why the tile could not be seen, in the project's own terms

The tile the sheet produced for `SPIKE_GID` is a **cool silver picket**. STYLE.md §5 rule 2 is
*"background entirely cool blue-grey and desaturated; foreground warm copper/brass/amber, saturated,
high contrast"* — the whole reason §1 says *"the player can tell what is standable without thinking
about it"*. **A cool desaturated object in the foreground reads as background because the separation
rules say it should.** It also shares a silhouette family with the ornamental fence in the very next
cell of the same sheet, which genuinely *is* decoration.

So this was never a new art direction. It was the existing one, never applied to one tile.
**No STYLE.md amendment; the §2-§5 hash lock is untouched** and `style-lock.test.ts` stayed green.

### The fix: one isolated generation composited into cell 12

Re-shooting the sheet was the obvious move and the wrong one — it is **one** generation of sixteen
tiles, so fixing one re-rolls the walkway, the brass cap, the brick and the masonry the whole game
stands on, two of which `ground-tiles.test.ts` pins against shipped pixels.

`promptHazard.mjs` asks for the tile alone on chroma; `buildChrome.mjs`'s `hazardTile()` keys it and
`build-world.mjs` pastes it into cell 12 before the grid gate measures the sheet or `walkway.png` is
cut from it. Verified afterwards by comparing all sixteen cells against `main`: **exactly one cell
changed, 6378 pixels.**

Three things in that path are gates rather than hopes:

| gate | what it refuses |
|---|---|
| ONE detected component | the four blades are joined by the base rail, so two components means the rail keyed away and what ships is spikes floating over the walkway |
| ink in column 0 **and** column w-1 | runs are 2-5 tiles wide and painted as adjacent cells, so a tile that does not reach both edges draws a transparent gap every 96 px — a striped hazard that reads as decoration again, which is the defect being fixed |
| cell 12 must exist in the packed sheet | a sheet with a different column count would paste the spikes over the pipes |

🔴 **The key colour is estimated from a TOP STRIP, not the whole border.** `estimateKeyColour`
samples the border one pixel deep and refuses under 90 % agreement — right for every other asset here
and exactly wrong for this one, which is *required* to reach three of its four edges. It refused at
67.2 %. The strip is the part of the image where the estimator's assumption actually holds, and
running the real estimator over it keeps its agreement check rather than swapping in a hardcoded
green *(vault 4.13: key by distance with a tolerance, never by equality — the model returned
~(1,252,2), not pure green)*.

### The spend, and a ceiling that was already breached

**One generation, first take, adopted. `01a046c7-54ec-7eb0-8009-0d48530b570b`, seed 20260828,
`fal-ai/nano-banana-pro`, 2K, 1:1, $0.15.** *(Probe one, then batch — vault 4.9. There was no batch:
the probe was good.)*

🔴 **The project's $55 art ceiling was ALREADY $0.05 over before this**, knowingly, on 2026-08-26,
and `GENERATION-LOG.md`'s own last line said *"the next generation needs a ceiling raise, not a
decision."* The owner explicitly chose the fal option when the defect was put to them with four
alternatives — **but that is a choice between fixes, not a ceiling raise.** Total is now **$55.20,
$0.20 over.** Recorded as a breach in `GENERATION-LOG.md` rather than absorbed. The next generation
of any kind needs the ceiling moved first.

### Two files split to stay under the 400-line rule

`build-world.mjs` reached 424 and `promptWorld.mjs` 411. `hazardTile()` moved to `buildChrome.mjs`,
which is the isolated-object module and states that as its job; `spikesPrompt()` moved to a new
`promptHazard.mjs`, the same split `promptWorld.mjs` itself records in its own header. `TILE_SIZE` is
passed into `hazardTile()` as an argument rather than re-parsed, because `build-world.mjs` parses it
out of `src/game/constants.ts` precisely so this pipeline cannot hold a second copy of the grid size.

### One unrelated flake, fixed at its cause

The full e2e run that followed failed **one** spec: 8.7's level-cost ratio, at
`2.0000000000034106` against a bound of 2. Not a regression — a tile's pixels do not change frame
cost, and the same spec passed **four out of four** in isolation at the same bound on the same
commit. `performance.now()` is quantised, so two arms in an exact 2:1 relationship divide to 2 plus
3.4e-12 of IEEE-754 remainder. The comparison now rounds to 9 decimal places; **the bound is
unchanged at exactly 2** and a real regression moves the ratio by tenths. The spec's own
inverse case — *"the ratio bound goes RED on a level whose size stops being free"* — still passes,
so the gate can still go red *(C2)*.
