# Vault-in — Phase 3 — Tiled → Phaser tilemap pipeline

Phase 3's slice of [LESSONS-APPLIED.md](../LESSONS-APPLIED.md) §D. The root rule, §A, §B and §C
live there and bind every phase.

**Also binding on this phase:** every §C rule, plus **A3** / **B2** (the vault has zero tilemap
coverage). Read them in the hub — they are defined once, there.

### Phase 3 — Tiled → Phaser tilemap pipeline

- [x] **3.1** **At least one test must load the shipped `.tmj` the player will load** — preferably
  sweep all of them. A fixture suite and a registry suite answer different questions and **only one
  can see a data defect**. Last time a roster-wide trim edited shipped JSON and the tests stayed green
  through a controller dealing **zero damage for an entire round**. **The tell: a test green while
  something is visibly broken — check what the test is built from first.**
  *(`Testing/A test built on a hand-authored fixture cannot see a defect in the shipped data.md`, blocker)*
  → **Phase 3:** `tests/unit/tilemap-data.test.ts` sweeps `public/assets/levels/*.tmj` with `import.meta.glob(?raw)` and runs the **real** `describeLevelProblem`/`parseLevel` that BootScene gates on — no parallel validator, no hand-authored fixture standing in for shipped data. The Codex plan review (P1, blocker) caught the first attempt putting levels in a root-level `levels/`, which Vite never copies into `dist/`: the sweep would have been green against a file the shipped build did not contain. Levels moved under `public/`, PRD's file structure amended, and `tools/gen/verify-dist.mjs` now asserts on every build that each `.tmj` reached `dist/` **byte for byte**.
- [x] **3.2** **Derive world width from measured background pixels, never from an aspect label.**
  `16:9` returned 2752×1536 = 1.7917:1 — against a 1280×720 viewport that left **10 px of scroll
  room**, i.e. no scrolling stage. `21:9` gave +417 px of camera travel. **For a side-scroller this
  is the single most load-bearing asset-pipeline number there is.**
  ⚠️ **The `2752×1536` figure is `nano-banana-2`'s and is now stale** — it is retained because it is
  what proved the *rule*, not because it is our number. `nano-banana-pro`'s returned dimensions are
  unmeasured. **In Phase 3 there is no background art at all**, so Phase 3's world width comes from
  the Tiled map's own `width × tilewidth`, measured off the shipped `.tmj`. This rule binds
  **Phase 4** — when real background art exists, measure it and re-derive.
  *(`Art & Audio Pipeline/Aspect labels lie, read the returned pixel dimensions.md`)*
  → **Phase 3:** `level-01` measures **5760 × 1536 px** from its own `180 × 48` tiles × `32`, read off the shipped file — never a label. That leaves **3840 × 456 px** of camera travel against the 1920 × 1080 view. `cameraSetup()` **throws** for a level not larger than the view, per axis independently, and a unit test demands at least one full viewport of horizontal travel — so "10 px of scroll room" is a hard error at load rather than something noticed in level design. A browser test proves a viewport-sized level refuses to route. Mutation M22 confirmed the rule can go red.
- [x] **3.3** **Derive behaviour from data, never from a name.** No `if (type === "spike")`, no
  hardcoded constant copied from one entity's data. **Grep for the numbers, not just the identifier.**
  *(`Architecture/Derive behaviour from data, never from the move's name.md`, blocker)*
  → **Phase 3:** solidity is read from a per-object `solid` **property**; nothing in `src/game/tilemap.ts` reads a layer name, object name, `type` or `class`. Proven behaviourally, not by grep: renaming every layer and object yields byte-identical solids (kills mutation M26), and — the case that actually matters — **deleting the properties array while putting the answer in `name`/`type`/`class` is rejected** (kills M20). That second test exists because M20 SURVIVED twice: the rename test cannot reach a name-fallback in the missing-property path, and the first replacement asserted `/solid/i`, which also matches an unrelated rejection the mutant produced.
- [x] **3.4** Publish the **exact tile grid cell size** as the Phase 4 art contract (our own rule, from
  the reference-repo atlas lesson). Phase 3 cannot pass until this number is written down.

  → **Phase 3:** published in [ASSET-PIPELINE.md](ASSET-PIPELINE.md) §0a as a binding table — cell size **32 × 32**, camera zoom **1**, view **1920 × 1080 = 60 × 33.75 tiles**, extent **5760 × 1536**, travel **3840 × 456**, character collision **44 × 96 px = 1.375 × 3.0 tiles** at `RENDER_SCALE` 2, render height **96 px = 8.89 % of screen height**. The PROPOSED marker is gone. Codex (P8) pointed out a doc-only criterion drifts from code silently, so `tilemap-data.test.ts` pins every number against the runtime constants; mutation M25 confirmed it goes red. Codex (P9) also caught that a 96–128 px *range* is not something art can be generated against — resolved by growing the character and re-tuning, rather than deferred.
