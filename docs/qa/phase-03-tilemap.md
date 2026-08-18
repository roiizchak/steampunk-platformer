[← QA-LOG index](../QA-LOG.md) · [phase doc](../prd/phase-03-tilemap.md) · [Codex reviews](../reviews/)

## Phase 3 — Tiled tilemap pipeline + Element Editor

**Branch:** `phase-03-tilemap` · **Date:** 2026-08-07

Levels become authored artefacts: a Tiled `.tmj` under `public/assets/levels/`, loaded through the
boot gate, validated by tests that read the **shipped** bytes, drawn by a real Phaser tilemap, with
a camera that follows inside the map. Plus `ElementEditorScene`, and the numbers Phase 4 spends
money against. The simulation's collision resolver is untouched — only the SOURCE of its rects
changed, which is what `src/sim/tick.ts` said Phase 3 would do.

### Decisions recorded

**Collision is a Tiled OBJECT layer, not the tile grid.** The tile layer is art; collision is
rectangles carrying a boolean `solid` property, and spawn is a point carrying `spawn`. Two reasons,
and the second is load-bearing: solidity is read from **data, never a name** *(vault 3.3)*, and a
tile grid cannot represent a sub-tile nudge, so it cannot round-trip one back out of the Element
Editor. The whole point of the editor is moving a collision strip a few pixels relative to the art.
Codex reviewed this deviation from the phase document explicitly and called it defensible; only the
word *tile* in criterion 3.2's prose becomes loose.

**Levels live in `public/assets/levels/`, and PRD.md's locked file structure was amended to say so.**
Asked and approved first, per CLAUDE.md's STOP-and-ask rule. Vite copies `public/` verbatim into
`dist/` and copies nothing else, so a root-level `levels/` would be served in dev and absent from
the build — making a "shipped data" sweep green against a file the player never receives. That is
vault 3.1's blocker wearing a disguise, and the Codex plan review caught it before any code existed.

**CPU `TilemapLayer`, never `TilemapGPULayer`.** The game runs `Phaser.AUTO` with a live Canvas
fallback, and `TilemapGPULayerRender.js:7-20` installs a **no-op Canvas renderer** where
`TilemapLayer` installs both — so on a Canvas fallback a GPU layer draws nothing while every
collision test stays green. Same reasoning ENGINE-NOTES already recorded for tint. Asserted at
runtime with `instanceof`, because `createLayer` returns a union whatever the `gpu` argument says.
**§7 asked whether the GPU layer was usable; the answer is no, with a source citation.**

**The character contract, resolved here rather than deferred.** Phase 2 shipped a 46 px character —
4 % of screen height, which no art can be generated against. Codex (P9) named it as the number
Phase 4 needs and does not have. `PLAYER_BOX` is now `22 × 48` local at `RENDER_SCALE` 2, giving a
**44 × 96 px** world box = 1.375 × 3.0 tiles = **8.89 %** of screen height, the bottom of STYLE.md's
locked *96–128 px = 3–4 tiles* band. **This is a Phase 2 balance change made inside Phase 3**, taken
on the user's explicit decision.

**The re-tune's rule: double every distance-dimensioned knob, touch no other.** `runAccel`,
`airAccel`, `runMax`, `groundFriction`, `airFriction`, `gravity`, `maxFallSpeed` and `jumpVelocity`
doubled; `coyoteTicks`, `jumpBufferTicks` and `jumpCutDivisor` did not. Ticks-to-apex is `v / g`, so
this is a pure spatial scaling: airtime is unchanged and the apex exactly doubles.

**Feel is preserved in TIME and scaled in SPACE — not preserved outright.** Codex (I8) was right
that the first wording overstated it: the body grew by **2.087×**, not 2×, so jump height measured
in body heights moves **3.27 → 3.13**. Both numbers were recorded correctly in the table below from
the start; the prose around them was loose.

### Measurements — things that were checked rather than assumed

| What | Measured | How |
|---|---|---|
| Jump apex | **300.6 px** (was 150.3) | `derivedFeel` over the live knobs |
| Airtime | **37 ticks — unchanged** | same |
| Apex ÷ body height | **3.13** (was 3.27) | same |
| `v²/2g` gap | **16.16 px** (was 8.08) | the anti-vacuity guard got *stronger* |
| World collision box | **44 × 96 px = 1.375 × 3.0 tiles** | `PLAYER_BOX × RENDER_SCALE` |
| Character as % of screen height | **8.89 %** | at `CAMERA_ZOOM` 1 on 1080 px |
| `level-01` extent | **5760 × 1536 px** from 180 × 48 tiles × 32 | read off the shipped `.tmj` |
| Camera travel | **3840 × 456 px** | extent − world view |
| Tiles drawn at spawn | **491 of 8640** | the layer culls; it is really rendering |
| Wall stop position | **x = 1898** = `wall.x 1920 − 22` | driven in the browser |
| `dist/` level | **96.4 K, byte-identical to `public/`** | `verify-dist.mjs` |

**The wall stop is the one to keep.** `player.x` is the feet **centre**, so a body stopped flush
against a wall has its centre half a body-width short of it. Codex (P5) caught the plan's oracle
asserting `x === wall.x`, which would have blessed 22 px of the player standing inside the wall.

### Mutation evidence — every gate watched going red *(vault C1, C2, C12)*

Nineteen mutations, driven from the shell. Redness detected **positively** from the runner's own
summary plus a named failing suite — never from an exit code, which a vitest dying at import also
produces. Each verified applied by *content changed **and** the original count dropped by exactly
one*, never "the count is now zero".

| # | Mutation | Result |
|---|---|---|
| M19 | `describeLevelProblem` always accepts | RED — 10 failed |
| M20 | solidity falls back to a NAME when the property array is absent | **SURVIVED TWICE** — see below |
| M21 | `widthPx` stops being a measurement | RED — 4 failed |
| M22 | `cameraSetup` accepts a level with no camera travel | RED — 2 failed |
| M23 | `viewFits` drops the right-edge check | RED — 2 failed |
| M24 | `tracksTarget` ignores the inset | RED — 2 failed |
| M25 | `CAMERA_ZOOM` drifts from the published number | RED — 2 failed |
| M26 | solidity keyed off the layer NAME | RED — 1 failed |
| M27 | the tile layer is never drawn | RED — **3 failed** |
| M28 | camera bounds dropped | RED — 2 failed |
| M29 | camera never follows the player | RED — 2 failed |
| M30 | half-body offset dropped | RED — 1 failed |
| M31 | the boot gate stops validating levels | RED — 2 failed |
| M32 | the editor saves the authored file, not the edit | RED — 1 failed |
| M33 | the jump listener stops honouring `playerInputEnabled` | RED — 3 failed |
| M34 | `widthPx` becomes a hardcoded `5760` | RED — 1 failed |
| M35 | an all-empty tile layer is accepted | RED — 2 failed |
| M36 | the spawn no longer has to stand on a solid | RED — 2 failed |
| M37 | a rectangle spawn is accepted as a point | RED — 2 failed |
| M38 | layer offsets silently ignored again | RED — 2 failed |
| M39 | `group` layers accepted again | RED — 2 failed |
| M40 | the character contract drifts (`RENDER_SCALE` 2 → 3) | RED — 4 failed |
| M41 | the catalog key no longer has to match the filename | RED — 1 failed |

**M27 is the one that justifies a Codex finding.** Deleting `drawLevel()` fails criteria 3.1, 3.2
**and** 3.3. Before Codex (P4) forced drawn-tile assertions into those specs, every oracle read the
same collision data the sim collides against — so all three would have passed with nothing drawn at
all, which is the exact art-versus-collision defect this phase's editor exists for.

**M20 survived twice, and both rounds were real defects in the gate.**

1. The vault 3.3 rename test cannot reach a name fallback in the **missing-property** path, because
   every object in the shipped level *has* a properties array. The parser's own comment claimed to
   guard that case; nothing tested it. Added a test that deletes the array and puts the answer in
   `name`, `type` and `class`.
2. That new test **still passed**, because `toMatch(/solid/i)` also matches an unrelated rejection —
   the mutant decided the zero-size spawn point was solid, and got rejected for *"solid #6 has a
   non-positive size"*. **An assertion that accepts the right answer for the wrong reason is not a
   gate.** Both vault 3.3 assertions now match the specific reason.

**A process failure worth recording.** M33 was run against a file with **uncommitted** changes, and
the harness's `git checkout --` restore silently reverted the fix it had just proven necessary. The
mutation result was correct; the tree afterwards was not. **Never mutate a file with uncommitted
work.** This is vault C12's lesson in a shape C12 does not name: the danger is not only a mutation
left applied, but a *fix* removed by the restore.

### QA gate results

| # | Criterion | Result |
|---|---|---|
| 3.1 | Player lands on the collision layer and does not fall through | **PASS** — settles at the strip top, `vy` 0, and the deepest sampled y across a full jump arc is the surface; plus the drawn tile's top edge asserted equal to it |
| 3.2 | Player cannot pass through a solid horizontally | **PASS** — stops at `wall.x − PLAYER_BOX.w × RENDER_SCALE / 2` = 1898, never exceeded on any sampled frame, with the drawn wall tile asserted at that column |
| 3.3 | **Every** `.tmj` loads and passes a schema + collision-layer check | **PASS** — `voltagent-qa-sec:qa-expert` ×2 briefs; sweep over the shipped bytes through the real parser, 13 committed bad fixtures each rejected for its own distinct reason |
| 3.4 | Camera follows within bounds; never shows outside the map | **PASS** — `viewFits` on every sampled frame, `scrollX` strictly increasing, `tracksTarget` on every frame, plus the left-edge case where clamping does the work |
| 3.5 | World width derived from the shipped `.tmj`, measured not assumed | **PASS** — `voltagent-qa-sec:qa-expert` ×2 briefs; 5760 × 1536 measured off the file, and a second synthetic map proves derivation rather than a constant |
| 3.6 | Grid cell size published, replacing the PROPOSED marker | **PASS** — ASSET-PIPELINE §0a, pinned against the runtime constants by a test |
| 3.6b | Camera zoom and viewport published | **PASS** — zoom 1, 1920 × 1080 = 60 × 33.75 tiles, plus extent, travel and the character contract |
| 3.7 | Element Editor shows and edits a collision strip; the edit persists | **PASS** — mechanically, and by the user's hands-on pass; the saved file is `level-01.tmj` at the repo root — see below |
| 3.8 | No file > 400 lines; diff reviewed; adversarial pass | **PASS, after a violation was found and fixed** — `voltagent-qa-sec:code-reviewer` ×2 briefs |
| 3.9 | Codex plan review ran; every finding applied or recorded | **PASS** — 10 applied, 1 rejected with a reason |
| 3.10 | Codex implementation review ran; every finding applied or recorded | **PASS** — 6 applied, 3 recorded with reasons; [phase-03-impl.md](../reviews/phase-03-impl.md) |

**Regression set:** Phases 1–2, specs 01–02 — **re-verified, not merely re-run**, because the
character contract changed the knobs those tests were written against.

### Criteria 3.3, 3.5 and 3.8 — the four review briefs, and what they found

Two owners, two briefs each *(vault A7)*, brief 2 blind to brief 1.

**`qa-expert` brief 1** confirmed both criteria and checked the claims rather than trusting them —
it diffed `public/` against `dist/` after a real build and independently measured 180 × 48 × 32 off
the shipped file. It then found that the plan-review triage table **claimed a post-build check
existed that did not**. It was right: the property held, but nothing enforced it, and P1/P2 were
blockers precisely because an unverified assumption about shipped data is how vault 3.1 happens.
`tools/gen/verify-dist.mjs` is that missing enforcement, now wired into `npm run build`.

**`qa-expert` brief 2** was asked only *how could this pass while broken*, and constructed the
mutant that mattered: **with exactly one shipped level, `widthPx: 5760` hardcoded passes every 3.5
assertion** — the pinned literal directly, and the self-consistency check by coincidence, because
180 × 32 really is 5760. It also found the world-extent row of the doc-to-code lock was the only
hand-typed string in an array of interpolated constants, that an all-zero tile layer of the right
length passed, and that the *"spawn stands on a solid"* rule lived **only in the test** — so the
runtime boot gate was weaker than the criterion named after it. All applied; M34–M37 confirm.

**`code-reviewer` brief 1** measured `BootScene.ts` at **428 lines** — a hard-rule violation this
phase introduced, which a fully green suite could not see because nothing mechanises the limit.
Split at the same seam Phase 1 used for `assetCatalog.ts`; 375 + 80 now, nothing over 400. Its
adversarial half then found the phase's worst bug — recorded separately below. It also caught a
comment in our own source claiming `ElementEditor` appears zero times in the bundle, which is false
for the two empty method names, and a second local→world conversion in `resolveCollisions` that
ignored `PLAYER_BOX.x` — pre-existing, but this phase changed those exact numbers.

**It also answered honestly that 3.8 is unmechanised**: no test asserts a line count, so a 401-line
file leaves all suites green. The evidence for 3.8 is the review, not a passing suite.

### The bug four green suites and a Codex review missed

**Pressing ArrowUp in the Element Editor threw the character 57 px off the strip it was editing.**

The scene disables player input by clearing `GameScene`'s key arrays. That only half works: held
state is **polled**, so walking stops — but the jump **edge** arrives through `key.on('down')`
listeners bound to the `Key` objects themselves *(vault 2.5)*, and clearing the array holding them
detaches nothing. `heldJump` contains `UP`, which the editor binds to *nudge the strip up*.

**Nudging up is what you do when collision sits below the art** — the precise defect this scene
exists to fix. And the reason nothing caught it: the editor spec pressed `ArrowDown` at three call
sites and `ArrowUp` at none. *Three of the four vertical paths were untested, and the untested one
was the one that mattered.*

Fixed with one guard in the one place both input paths pass through, which covers `UP`, `SPACE` and
`W` together, rather than a detach per key. Mutation M33 turns the new tests red.

### The defect this phase inflicted on itself, and the brief that caught it

Applying `qa-expert` brief 2's finding — *"the spawn-stands-on-a-solid rule lives only in the test,
so the boot gate is weaker than the criterion named after it"* — was correct. Writing it as
`solid.y === spawn.y` was not.

**The Element Editor exists to nudge a collision strip a pixel or two. Nudge the strip the player
spawns on, press save, and drop the file in as the editor's own save note instructs — and the next
boot refuses to route.** The primary workflow emitted a level the boot gate rejected.

Nothing caught it because **every** editor spec pressed `BracketRight` twice on entry, landing on
the wall — a strip that cannot violate the spawn rule wherever it goes. Strip 0, the one under the
spawn, was selected by no test at all. `code-reviewer` brief 2 found it by reading the strip order
out of the generator and noticing which index the specs never reach.

Then the regression test written for that fix **caught the second wrong version**: `solid.y >=
spawn.y` still broke nudging the strip *up*, which is the direction you use when collision sits
below the art — the motivating defect, for the third time in one phase.

The rule is now stated as the thing it actually protects: *a solid spans the spawn horizontally and
its bottom is at or below it* — the player will not fall out of the world. Spawning slightly above
the ground means falling onto it; slightly inside means being pushed out on tick one. Neither is a
broken level. **The lesson is not "be careful": it is that a rule tightened in response to a review
is a change like any other, and needs the workflow it constrains exercised against it.**

### Criteria 3.8 and 3.10 — the adversarial pass and the Codex implementation review

`code-reviewer` brief 2 and the Codex implementation review ran on the same diff and **neither found
the other's headline defect**, which is the case for running both. Codex's report and full triage are
in [phase-03-impl.md](../reviews/phase-03-impl.md); the highlights either found:

- **A level could pass the boot gate and then hang the game.** `GameScene` hardcoded
  `addTilesetImage('greybox')` and `createLayer('ground')` while `describeLevelProblem` reads no
  names — so a renamed layer was approved by the gate and threw in `create()`, leaving `ready=false`
  with `bootError=null`. That is the third state, a hang, reached *from an approved level* — the one
  outcome the whole refuse-to-route design exists to prevent. Both reviewers found this seam
  independently. Fixed by resolving both by position, which is what vault 3.3 wanted anyway.
- **Criterion 3.4 never exercised the right or top clamp.** The player wall-stops at x=1898 of 5760,
  so of `viewFits`'s four inequalities only two were ever evaluated against a clamp doing work — a
  `bounds.w` of twice the level's width passed the entire suite.
- **The Phase 2 suite is structurally incapable of noticing this phase's re-tune.** Every movement
  assertion derives from `world.tuning.*`, so multiplying all eight distance knobs by one factor is
  the single perturbation it cannot see — and the anti-vacuity guard gets *easier* to satisfy,
  because doubling `v` and `g` doubles the gap it demands. The character contract is now pinned in
  absolute pixels, where a re-tune has to come and edit it deliberately.
- **Production shipped a help line advertising two dev-only keys**, and `verify-dist` could not see
  it: the sweep matched quoted `Playground`, and the string is lowercase inside a longer literal.
  Both fixed — and the widened sweep immediately cried wolf on the `togglePlayground` identifier,
  which is why it now matches user-facing phrases rather than bare words.
- **A false claim in our own documents.** ASSET-PIPELINE §0a and the plan-review triage both stated
  STYLE.md §9 *"has been updated"* with the measured 8.89 %. It never was — §9 still said ~20 %, so
  Phase 4 would have opened two documents disagreeing by 2.25×. **Criterion 3.9 had been signed off
  on a statement that was false in the tree.**
- **Layer offsets and `group` layers were silently mis-read.** Drag a layer in Tiled and every
  collision rect shifts — and every oracle in this phase is that same parser, so the unit sweep, the
  e2e specs and the editor's own overlays would all shift *with* the bug and agree with each other.
  Both are now refused rather than half-supported.

### Criterion 3.7 — what playing it found *(vault C4)*

Driven with `playwright-cli` and screenshotted into `docs/evidence/`: the editor opens, overlays
every strip, selects with `[` / `]`, parks the player on the selection, nudges, reverts, and saves
a `.tmj` the real parser accepts. The 7 px offset in `phase-03-editor-nudged.png` is the
art-versus-collision disagreement made visible — the character visibly sits below the drawn tile.

**Playing the game itself found what no gate did:** running right off the end of the ground puts
the player into an **unbounded fall** — sampled at x 17617, y 45957, still accelerating, while the
camera sat correctly clamped at its bounds. There is no world boundary and no kill plane. The
camera is right; the world simply ends and the player keeps going.

This is **not** a Phase 3 criterion, and it is recorded rather than fixed — see below.

**The user's hands-on pass discharges 3.7.** They ran the editor by hand and saved; the browser
download landed at the repo root as `level-01.tmj`, which is kept as the artefact — **moved in Phase 8
to [`../evidence/phase-03-editor-download.tmj`](../evidence/phase-03-editor-download.tmj)**, beside the
two screenshots from the same pass. It sat at the repo root for five phases and was mistaken for the
shipped level in Phase 8's planning session, because it is the **pre-rescale** file: 180 × 48 at
32 px against `placeholder-tile.png`, from before Phase 4's 3× rescale. Same bytes, same evidence, no
longer in the way. Verified against the authored `public/assets/levels/level-01.tmj` **as it stood in
Phase 3** — Phase 8 replaces that level, so the comparison below is historical:

- **object count unchanged** (7 → 7), **tile layers byte-identical**, **every non-layer top-level
  field identical** — the editor rewrites object geometry and nothing else, which is the round-trip
  claim P7 asked for
- **exactly two strips moved**, and both were moved *and* resized, so the `Shift`+arrow path was
  exercised by hand and not only by the spec: id 2 `x` 4096 → 3908, `y` 1280 → 1275, `height`
  256 → 308; id 5 `y` 896 → 792, `width` 256 → 270
- the saved bytes pass **`describeLevelProblem` → null** and **`parseLevel`** — the same validator
  the boot gate runs, so this file would boot

The sub-tile deltas (`y` 1275, a 5 px nudge; `width` 270, a 14 px resize) are the point: they are
not expressible in a tile grid, which is why collision is an object layer *(§ Collision is an object
layer)*. A hand-made 5 px nudge surviving `JSON.stringify` → download → `parseLevel` is the whole
criterion.

**The shipped level is deliberately left as authored.** The root file is evidence of the editor
working, not a level-design change; re-authoring `level-01` is Phase 8's job, and swapping it in
here would move the strips the Phase 3 e2e oracles derive their expectations from.

### Deliberately not fixed *(vault C11)*

- **No world bounds or kill plane.** Found by playing. A pit that kills and respawns needs somewhere
  to respawn *to* and something to spend, which is Phase 6's health and Phase 8's level progression.
  Building a death plane now would be inventing semantics two phases early. **Recorded here so
  Phase 6 or 8 inherits it as a known gap rather than a surprise.**
- **A structurally valid but unplayable level still passes.** Raised by `qa-expert` brief 2: a spawn
  boxed in on three sides, or a gap wider than the jump, satisfies every schema and collision-layer
  rule. Reachability is a level-design property, not a schema property, and criterion 3.3 asks for a
  schema + collision-layer check. Phase 8 authors real levels and is where a traversability check
  would belong.
- **The 400-line rule stays unmechanised.** A line-count test is cheap, but the rule explicitly
  allows justified exceptions, so the gate would need to parse QA-LOG for the justification. Left as
  a human check, now with the evidence that it can be breached through a green suite.
- **`ElementEditorScene` matches the Nth solid object to `world.solids[N]`** when serialising. Both
  now use the *same* exported predicate, which closes the way Codex (I6) found to desynchronise
  them. The ordering coupling itself remains, written down in the method's own comment rather than
  defended by a test.
- **Phase 4's animation timings do not exist yet** *(Codex I1)*. Phase 4 wants
  `fps = renderFrames × TICK_HZ / simTicks`, and the sim publishes neither per-animation `simTicks`
  nor a `walk` state — it has `idle | run | jump | fall`. **Not a Phase 3 deliverable**: §5 publishes
  the grid and camera contract, while animation timing derives from Phase 5's combat windows and
  Phase 4's own frame counts, neither of which exists. Authoring the numbers now would be inventing
  them two phases early, which is the trap P9 avoided by measuring instead of guessing.
  **Owner: Phase 4 gate 0, before any generation spend.**
- **`resolveCollisions` is still untested for a vertically offset `LocalBox`** *(Codex I4)*. It now
  goes through `toWorld`, so the horizontal offset is correct for an asymmetric box; `PLAYER_BOX.y`
  is 0 and the vertical case has no coverage. Recorded rather than speculatively supported.
- **The editor's "overlay for every solid" test is satisfiable by fewer overlays than there are
  strips** *(Codex I7)*, because three platforms share `256 × 32` and the assertion reads sizes, not
  positions. The live nudge tests already prove a *specific* strip moves, so this is a weak
  assertion rather than an absent one.

---

## Vault-out — Phase 3

**High value: the vault had ZERO tilemap coverage before this phase** *(vault A3)*. Everything below
is new. The engine-level notes went into [ENGINE-NOTES.md](../ENGINE-NOTES.md) under **Tilemaps** and
**Cameras**; these are the lessons that generalise past Phaser.

### New lessons

**A rename test cannot catch a name fallback in the missing-data path.** Vault 3.3 says derive
behaviour from data, not names, and the obvious test is to rename everything and assert nothing
changed. That test is blind to the branch that *only* runs when the data is absent — because every
authored object has the data. Mutation M20 walked straight through it. **Test the absent case
explicitly, not just the renamed one.**

**An assertion that accepts the right answer for the wrong reason is not a gate.** M20's second
survival: `toMatch(/solid/i)` passed for a mutant that had failed in a completely unrelated way, and
happened to say "solid" while doing so. Loose matchers turn a rejection test into a smoke test.

**Never run a mutation against a file with uncommitted changes.** The restore step is
`git checkout --`, which reverts to HEAD — so it does not merely undo the mutation, it deletes any
unstaged fix in that file. The mutation reported correctly and the tree was silently wrong.

**"Shipped data" is a property of the BUILD, not of the repository.** A test that reads an authored
file proves nothing about what the user receives unless something guarantees the two are the same
bytes. Vite copies `public/` and nothing else. `tools/gen/verify-dist.mjs` now asserts it rather
than assuming it — the fix vault 3.1 actually asks for.

**With one instance of a thing, "derived" and "hardcoded" are indistinguishable.** A single shipped
level makes `widthPx: 5760` pass a test asserting `widthPx === widthTiles * tileWidth`, because the
arithmetic coincides. Derivation needs a second, differently-shaped input — and that input is
legitimately synthetic, because shipped-data coverage and derivation coverage answer different
questions.

**Half-disabling input is worse than not disabling it.** Held state is polled and stops when you
drop the keys; edge state arrives through listeners that outlive the array holding them. Clearing
the array looked like it worked, and the one key that still fired was bound to the one action the
scene existed to perform. **Guard at the single point both paths cross, not at each key.**

**A criterion with no automated check is evidence-by-report, and should say so.** The 400-line rule
was breached this phase and stayed breached through a fully green suite, because nothing asserts it.
That is not an argument for mechanising every rule — it is an argument for the gate result naming
which criteria rest on a human having looked.

**The untested direction is the one that matters.** The editor spec pressed ArrowDown three times
and ArrowUp never; ArrowUp was broken. Coverage counted by call sites hides an asymmetry in the
thing being covered.

### Confirmed from earlier phases

- **Vault C4 again, and it earned its place again.** Four green suites, two agent owners with two
  briefs each, and a Codex plan review did not surface the unbounded fall off the end of the world.
  Playing it did, in about ninety seconds.
- **Vault C12, in a shape it does not name.** Its warning is about a mutation left applied in a
  green tree; the twin is a *fix removed* by the restore.
- **Adversarial briefs pay** *(vault A7)*. Brief 1 for each owner verified the criteria and found
  paperwork defects. Brief 2 for each found a real hole: the hardcoded-extent mutant, and the
  ArrowUp jump. Neither would have been reached by asking "does this satisfy the criterion".

### For Phase 4

- The art contract is published in [ASSET-PIPELINE.md](../ASSET-PIPELINE.md) §0a and **pinned against
  the runtime constants by a test** — cell size, zoom, viewport, world extent, camera travel,
  character collision box, render height and `RENDER_SCALE`. Changing any of them turns that test
  red, which is the intended approval checkpoint.
- **Sprite art is authored at true size**: a 32 px tile draws at 32 px, a 96 px character at 96 px.
  There is no further scaling between the sheet and the screen at `CAMERA_ZOOM` 1.
- STYLE.md §9's *"~20 % of screen height"* was an unmeasured prediction that §9 itself delegated to
  this phase. Measured: **8.89 %**. §9 is outside every hash-locked slice, so no hash moved.

---

