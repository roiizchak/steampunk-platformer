# Phase 3 — Codex plan review (review 1 of 2)

**Ran:** 2026-08-07, before any code was written.
**Invocation:** `/codex:rescue --wait --fresh`, first attempt — carrying the `node_repl` /
`fs.readFileSync` instruction from
[PRD.md § The Codex review protocol](../PRD.md#the-codex-review-protocol).
**Reviewed:** [phase-03-tilemap.md](../prd/phase-03-tilemap.md) and the execution plan at
`C:\Users\royko\.claude\plans\docs-prd-phase-03-tilemap-md-if-you-hav-quirky-nest.md`, against
[PRD.md](../PRD.md), [LESSONS-APPLIED.md](../LESSONS-APPLIED.md), [QA-LOG.md](../QA-LOG.md),
[ASSET-PIPELINE.md](../ASSET-PIPELINE.md), [ENGINE-NOTES.md](../ENGINE-NOTES.md),
[STYLE.md](../STYLE.md), [CLAUDE.md](../../CLAUDE.md), `docs/reviews/`, and the Phase 1–2
source and test files.
**Repository state at review time:** Phases 1–2 merged to `main`. `levels/` did not exist; no
`.tmj` or `.tmx` file existed anywhere; `src/game/tilemap.ts`, `src/render/cameraRig.ts` and
`src/scenes/ElementEditorScene.ts` did not exist; no camera call of any kind existed in `src/`;
`GameDebugView.levelId` was declared and written nowhere.

The execution plan lives outside the repository. Codex read it with `fs.readFileSync` without
difficulty. **The shell tool was not used and could not have been** — see the operational note
in PRD.md. Codex confirmed at the end: *"Per instruction, no shell was used; all file
inspection succeeded through `node_repl`."*

Two deliberate deviations from the phase document were put to it explicitly and are answered
at the end of the report: object-layer collision instead of tile-grid collision, and the CPU
`TilemapLayer` instead of `TilemapGPULayer`.

---

## The report, verbatim

### 1. Low — deliverables not required by §1

Only `src/render/cameraRig.ts`. Camera following is introduced by criterion 3.4 and the demo,
not by §1's tilemap/collision/editor goal. A dedicated module is also an implementation
choice, not a goal requirement. The test deliverables remain required by the project's
mandatory QA gates, so I do not count them as excess. `docs/prd/phase-03-tilemap.md:7`;
`docs/prd/phase-03-tilemap.md:43`; `docs/PRD.md:70`

### 2. Acceptance criteria that could pass while broken

- **Blocker — 3.3 can pass against repository source while the production game has no level.**
  The plan places `level-01.tmj` under root-level `levels/`, but runtime loads it by URL from
  the catalog; Vite has no public-copy/build rule for `levels/`, and Playwright runs the
  development server. Thus the raw `import.meta.glob` sweep can be green while `dist/` lacks
  the file. plan`:79-83`; plan`:214-225`; `vite.config.ts:10-19`; `playwright.config.ts:18-28`

- **High — 3.3 can also pass while Boot accepts a catalog containing no levels.** The plan
  deliberately makes `levels` optional, despite GameScene requiring one. That recreates Phase
  1's "zero expectations satisfy themselves" failure at a new catalog field. plan`:154-168`;
  `src/game/assetCatalog.ts:26-40`; `docs/QA-LOG.md:131-135`

- **High — 3.1 and 3.2 can pass with the tile layer missing or visually displaced.** Their
  proposed oracle reads positions from the same collision-object data driving the sim; it
  never asserts that Phaser drew the `ground` layer or that its visible platform top agrees
  with the rectangle top. Phase 2 already demonstrated this exact seam: deleting render
  synchronization left debug-state tests green. plan`:236-246`;
  `tests/e2e/phase-02-movement.spec.ts:79-85`; `docs/prd/phase-03-tilemap.md:7`

- **High — 3.2's proposed position oracle is incorrect if read literally.** `player.x` is the
  feet-centre, the body is 26 px wide, and the resolver correctly stops its centre at
  `solid.x − 13×scale`; the plan says the stop position itself matches the strip's left edge.
  A test implemented literally could bless half-body penetration. plan`:240-243`;
  `src/sim/types.ts:98-106`; `src/sim/player.ts:43-44`; `src/sim/player.ts:159-179`

- **Medium — 3.4 proves containment and some camera movement, not following.** An unrelated or
  scripted pan can keep every `worldView` sample in bounds and increase `scrollX` without
  tracking the player. plan`:244-246`

- **Medium — 3.7 proves that a download contains the edited coordinate, but never reloads that
  download through `parseLevel` and Phaser.** It can pass without proving the downloaded
  artifact is a usable replacement for the shipped level. plan`:248-252`;
  `docs/prd/phase-03-tilemap.md:53`

- **Medium — 3.6b is doc-only while the plan declares `CAMERA_ZOOM` in both `cameraRig.ts` and
  `constants.ts`.** Those two runtime sources and ASSET-PIPELINE can drift while the doc
  review remains green. plan`:139-143`; plan`:266-278`

### 3. Blocker — cited vault item claimed but not satisfied

**Vault 3.1.** It requires a test to load the shipped `.tmj` the player loads. The proposed
unit test loads the root-level source through `import.meta.glob`; no planned build step places
that file in the production artifact, and the browser tests exercise only Vite's development
server. That is source-data coverage, not yet shipped-data coverage.
`docs/LESSONS-APPLIED.md:226-231`; plan`:214-225`; `vite.config.ts:10-19`

### 4. Blocker — dependency no earlier phase produces

**A production-served location or build-copy contract for `levels/*.tmj`.** Earlier phases
produce `public/assets/index.json` and assets under `public/assets/`; the current catalog
points only to a public image, while the plan introduces a runtime-fetched level outside
`public/` without changing Vite's build configuration. `public/assets/index.json:1-6`;
plan`:79-83`; plan`:161-167`; `vite.config.ts:10-19`

### 5. High — most likely subtle shipping error

The collision rectangles and visible tile platforms disagree by a few pixels, producing a
character that floats or sinks while every collision test passes. The plan explicitly permits
art/collision disagreement, and its E2E expectations are derived from collision strips rather
than visible tile geometry. That is the precise defect the phase goal says motivated the
Element Editor. plan`:41-49`; plan`:240-246`; `docs/prd/phase-03-tilemap.md:8-11`

### Phase 4's missing published number

Phase 4 needs an exact standing-character render height — and therefore the exact
`RENDER_SCALE` — not the current `96–128 px` range. The existing body is 46 px high and
rendered as `46 × scale`; current scale is 1, with a comment saying Phase 4 will raise it. At
1920×1080 and zoom 1, the proposed range is 8.9–11.9% of screen height, while STYLE describes
approximately 20%. "True sprite size" cannot be tested or generated against a 33% range.
Publish one final pixel height and its corresponding scale before generation.
`src/scenes/GameScene.ts:22-23`; `src/sim/player.ts:43-44`; `src/render/playerView.ts:54-67`;
`docs/ASSET-PIPELINE.md:25-31`; `docs/STYLE.md:310-315`; `docs/QA-LOG.md:779-780`

Phase 4 also needs the level/background extent published durably: `5760×1536`, with `3840×456`
px of camera travel. The plan chooses those numbers but its publication step records only
grid, zoom, and viewport; Phase 4 is explicitly where measured background dimensions begin to
bind. plan`:83-88`; plan`:266-278`; `docs/LESSONS-APPLIED.md:232-240`

### Deviation (a): object-layer collision

**Defensible.** The goal requires Tiled-authored `.tmj`, Phaser loading, and a working
collision layer; it does not require collision to originate in a tile layer. Criteria 3.1 and
3.2 are behavioral, and 3.3 asks for a collision-layer check. A Tiled object layer containing
rectangles selected by boolean `solid: true` satisfies those intents and vault 3.3's
data-not-name rule. The phrase "solid tile" in 3.2 becomes terminologically inaccurate, but
the required behavior is preserved. `docs/prd/phase-03-tilemap.md:7`;
`docs/LESSONS-APPLIED.md:242`; plan`:34-49`

The deviation does not excuse the missing visual-to-collision agreement proof described in
finding 5.

### Deviation (b): CPU `TilemapLayer`

**Defensible and technically correct.** The game deliberately uses `Phaser.AUTO`, while
installed Phaser 4.2.1 documents `TilemapGPULayer` as WebGL-only and gives it a no-op Canvas
renderer. The ordinary `TilemapLayer` installs both WebGL and Canvas renderers. Shipping the
GPU layer would therefore violate the live Canvas-fallback contract. `src/game/config.ts:16-20`;
`docs/ENGINE-NOTES.md:11-16`; `node_modules/phaser/src/tilemaps/TilemapGPULayer.js:14-24`;
`node_modules/phaser/src/tilemaps/TilemapGPULayerRender.js:7-20`;
`node_modules/phaser/src/tilemaps/TilemapLayerRender.js:7-24`

### Could not check

The planned `.tmj`, parser, camera rig, editor, and Phase 3 tests do not exist yet, so
implementation of those could not be inspected or executed. Per instruction, no shell was
used; all file inspection succeeded through `node_repl`.

---

## Triage

Every finding is **applied** or **rejected with a reason** *(vault C11)*. Codex's "could not
check" section is preserved above verbatim *(vault 9.3)* — it is a real blind spot, because
review 1 by definition runs before the code exists, and it is precisely what review 2 covers.

| # | Sev | Finding | Disposition |
|---|---|---|---|
| P1 | Blocker | Root `levels/` is outside `public/`; Vite never copies it to `dist/`, so the unit test would read a source file the shipped build does not contain — **vault 3.1 unsatisfied** | **Applied.** Levels live in `public/assets/levels/`, which Vite copies verbatim into `dist/`. The bytes the unit test globs are the bytes the browser fetches. PRD's locked file-structure line amended with user approval — see below. |
| P2 | Blocker | The phase depends on a served/built location for `.tmj` that no earlier phase produces | **Applied.** Same fix as P1. A post-build check that `dist/assets/levels/level-01.tmj` exists is added to the gate, so the claim is verified rather than assumed. |
| P3 | High | Optional `levels` in the catalog recreates Phase 1's "zero expectations satisfy themselves" | **Applied.** `levels` is **required and non-empty**, validated exactly like `images`. The six phase-01 catalog-refusal fixtures gain a valid `levels` array so each keeps failing for the reason it was written to test rather than incidentally — recorded as a deliberate regression-set amendment. |
| P4 | High | 3.1/3.2 read their oracle from the same collision data that drives the sim, so they pass with the tile layer missing or displaced | **Applied.** Both criteria additionally assert against the **drawn** `TilemapLayer` reached through `window.__phaserGame` — the same seam Codex finding I5 forced in Phase 2, for the same reason. |
| P5 | High | 3.2's stop position is wrong as written: `player.x` is the feet centre, so the stop is `strip.x − PLAYER_BOX.w × scale / 2` | **Applied.** Oracle corrected. This one would have shipped a test that blesses half-body penetration. |
| P6 | Med | 3.4 proves containment plus *some* motion; a scripted pan would pass | **Applied.** `cameraRig.ts` gains a `tracksTarget()` predicate, asserted on every sampled frame alongside `viewFits()`. |
| P7 | Med | 3.7 proves the download contains the edit, not that the download is a usable level | **Applied.** The spec feeds the downloaded bytes back through the real `parseLevel` and asserts the result is a valid level whose nudged strip moved by exactly the expected delta. |
| P8 | Med | `CAMERA_ZOOM` in two runtime files plus a doc — three sources that can drift while a doc review stays green | **Applied.** One definition, in `src/game/constants.ts`. A unit test pins ASSET-PIPELINE.md's published numbers against the runtime constants, so 3.6/3.6b stop being doc-only. |
| P9 | — | Phase 4 needs the exact character render height and `RENDER_SCALE`, not a 33 % range | **Applied.** Resolved in this phase by user decision: `PLAYER_BOX` `22 × 48` local, `RENDER_SCALE` 2 → **44 × 96 px world collision box = 1.375 × 3.0 tiles**, and every distance-dimensioned tuning knob doubled. See the note on the STYLE.md figure below. |
| P10 | — | Phase 4 needs the level/background extent published durably | **Applied.** `5760 × 1536` px extent and `3840 × 456` px of camera travel are published in ASSET-PIPELINE.md and pinned by the doc↔code lock test. |
| P11 | Low | `src/render/cameraRig.ts` is not required by §1's goal | **Rejected.** §5 names it as a deliverable, and criterion 3.4 needs a containment/tracking predicate shared by the unit test and the e2e spec so the gate is asserted against one definition rather than two. |

### On the STYLE.md "~20 %" figure (part of P9)

Codex read `docs/STYLE.md:310-315` as a requirement in conflict with the published number.
Re-verified locally: it is **§9 "Scale reality check"**, which is *outside* all three
hash-locked slices in `tests/unit/style-lock.test.ts` (§2 ends at `**Price source`, §4 at
`**\`[SETTING]\` values verified`, §5 at `They are deliberately redundant`), and its text
already reads *"These mockups are concept art, not the game camera… That is expected, and
**Phase 3 sets the real camera**."*

So there is no conflict to escalate. STYLE.md's locked position is *96–128 px character on a
32 px grid = 3–4 tiles*, which the published `96 px = 3.0 tiles` satisfies exactly. The
"~20 %" was an unmeasured prediction that STYLE.md itself delegated to this phase. §9 is
updated with the measured **8.9 %** and the reconciliation recorded in QA-LOG. **No locked
slice is touched and no hash changes.**

### On the PRD amendment (part of P1)

`docs/PRD.md`'s file structure is locked *"so decomposition decisions are not made ad hoc
later"*, and CLAUDE.md requires a STOP-and-ask before contradicting it. Asked and approved:
the `levels/` line becomes `public/assets/levels/`. The alternative — a Vite copy plugin
keeping the root path — was rejected as more machinery and a second path to keep in sync,
which is the drift class vault 3.1 exists to prevent.
