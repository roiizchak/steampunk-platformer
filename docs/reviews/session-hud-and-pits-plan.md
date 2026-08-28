# Codex — PLAN review, session `hud-and-pits`

`gpt-5.6-sol`, high effort, `-s read-only`, thread `01a043b0`. Three rounds attempted, **two
completed**; round 3 died on a ChatGPT usage limit and was later re-run against the *implementation*
instead. Plan: `C:\Users\royko\.claude\plans\there-are-a-few-soft-snowflake.md`.

Every prompt carried the `CreateProcessAsUserW failed: 5` paragraph — Codex's sandbox cannot spawn
processes on this machine, so it read files through the `node_repl` MCP tool with `fs.readFileSync`.
Its findings are therefore **file-evidence only** and every one was re-verified locally before it was
applied. Several needed correction on the way in; those are marked.

Two defects were under review, both reported by the owner from playing the **shipped production
build**: the controls legend drew full-width across the level, and levels 2–4 contained pits you
could fall into that could not hurt you.

---

## Round 1 — `VERDICT: REVISE`, 11 findings, 2 blockers

| # | Finding | Disposition *(C11)* |
|---|---|---|
| 1 | **Blocker.** Pit fixtures placed under `tests/fixtures/bad-levels/` would break `tilemap-data.test.ts:307`, which sweeps that directory. | **Applied** — verified locally; fixtures live in `tests/fixtures/pit-levels/`, which Codex confirmed escapes every existing sweep (`bad-levels/*.fixture` is non-recursive and is the only level sweep). |
| 2 | **Blocker.** The proposed banner arithmetic reserved a counter width computed from `GEAR_ICON_PX` / `COUNTER_FONT_PX` and a hardcoded digit count — two of which are private to `hud.ts`. | **Applied, differently** — the formula is gone entirely. The banner reads the counter's **measured** `Text.width`, so no estimate exists to be wrong. |
| 3 | The banner `Text` was discarded on creation (`addHelpBanner` returned `void`), so **no e2e could reach it and deleting the draw call left the whole suite green**. | **Applied, differently** — round 2 rejected the proposed `UIScene` route; a new `src/scenes/helpBannerLayer.ts` owns and exposes the object. |
| 4 | `scale.resize()` re-lays-out the HUD through `hudLayout()` while the banner sat at raw design pixels with a raw font size. | **Applied** — the layer listens for `resize`; the e2e re-asserts every bound after a real one. |
| 5 | Gear and goal validation ignore hazards, so a derived spike run could swallow either silently. | **Applied** — `level-pits.test.ts` asserts it, with the `gear-in-spikes.json` fixture. |
| 6 | The pit definition was overbroad. | **Applied** — narrowed to ground-row floors, ≥ 2 columns, ≥ 2 tiles of wall on both sides. Restructured again in build; see the implementation review. |
| 7 | The pit e2e's hp drop is **not attributable** — level-02's scavenger patrols cols 76–78 next to the pit, and `applyWorldDamage()` collapses every source into `{ hurt, died }`. | **Applied** — enemies are cleared for the spec, and the exact-tick claim moved to a sim test. |
| 8 | The two-line character budget left 7 px of margin on an advance estimate **Phaser never consults** — it wraps on the browser's `measureText()`. | **Applied, then superseded** — `MONO_ADVANCE` is gone, and the owner's later *"keep every key, allow 3 lines"* decision removed the character budget entirely, so there is no margin left to be thin. |
| 9 | Three proposed unit gates were circular: an `x + wrapPx + margin <= GAME_WIDTH` identity, a counter-gap check proving a formula against itself, and source-text containment that passes on an import alone. | **Applied** — all three dropped. |
| 10 | The measured jump apex is **449.5 px**, not the 413 the plan claimed, and *"no new death mode"* was false: hazards deal 20 hp, so a fall at 20 hp kills. | **Applied** — both corrected; the low-hp death path became its own gate criterion. |
| 11 | "Union" of derived and hand-authored spikes must be a **normalised interval union**, not array concatenation — nothing rejects overlapping hazard rects and `hazardHit()` returns the first match. | **Applied** — merged per row before painting and emission; the gate asserts no overlap. |

## Round 2 — `VERDICT: REVISE`, 11 findings, 5 blockers

Round 1's own fix — move the banner into `UIScene` — was itself wrong, and round 2 is why.

| # | Finding | Disposition *(C11)* |
|---|---|---|
| 1 | **Blocker.** `setHelpText()` would fire before `UIScene.create()` had built anything — `attachHud()` returns first (`gameHud.ts:48`). | **Applied** — the banner never enters `UIScene`; its own layer defers first layout to the owning scene's first `update`. |
| 2 | **Blocker.** `UIScene.update()` hardcodes `this.scene.get('Game')` and **stops itself** when that scene goes away (`UIScene.ts:182`), so the Playground and Element Editor legends would die on transition. | **Applied** — verified locally at that line; the design changed so `UIScene` is not involved at all. |
| 3 | **Blocker.** A fake-scene unit test cannot import `UIScene` — it names Phaser as a **value** (`UIScene.ts:41`), which is why `enemy-feedback.test.ts:29` records it as gated by source text only. `test:sim-isolated` runs with Phaser uninstalled. | **Applied** — verified at both lines; the new layer is `import type Phaser` only, which is what buys it the stronger behavioural gate. |
| 4 | **Blocker.** Phase 6's e2e runs the **dev** server, so the shipped legend form is never measured with real glyph metrics — every existing project always sees the four-row DEV string. | **Applied** — a case was added to `phase-10-production.spec.ts`, which is in the `chromium-prod` project. It had to go **into that existing spec**: `PROD_SPECS` is the narrow regex `/phase-10-(production\|campaign)\.spec\.ts/`, so a new file would silently never run there. |
| 5 | **Blocker.** The three-row DEV form versus two-row centring, and the two dev-scene legends are ungated entirely. | **Applied** — `helpBannerLayout()` takes a **measured** `lineCount` with a top clamp; all four strings get bounds assertions; the criterion gates clearance and on-screen bounds, never a row count. |
| 6 | **The narrowing clauses have no discriminating fixtures** — a far broader detector returns the same five valleys, because the shipped maps contain no negative case. Four fixtures about coverage would all have passed against a rule that had quietly lost every clause. | **Applied** — the sharpest finding of either round. One committed fixture per shape the rule must reject. *(This is also what made the round-3 restructure findable — see the implementation review.)* |
| 7 | A `walkableValleys: []` opt-out cannot work: the shipped `.tmj` carries no such metadata, so a byte-side gate would re-detect the valley and report it unspiked. Also empty in all five levels, i.e. speculative. | **Applied by deletion** — dropped. If a walkable valley is ever wanted the gate fails loudly, which is the right moment to decide. |
| 8 | Exact-tick attribution is **not observable**: `window.__game` is closed at eight aggregate fields by a Phase 1 ruling, and carries no tick events, no previous position and no hazard identity. Widening it is a STOP-and-ask. | **Applied** — moved to a sim integration test over the shipped level; e2e keeps the arc it can actually observe. |
| 9 | `Text.width` is only valid **after** `setFontSize()` — Phaser rewrites it synchronously, so a read taken first returns the previous scale's width. | **Applied** — the order is pinned (position counter → set font size → read width → compute → apply) and asserted in the behavioural test. |
| 10 | File-size claims were wrong: `UIScene.ts` is 335 and `GameScene.ts` is **exactly 400** with no `SIZE-EXEMPTION`, against a ratchet permitting zero files over. | **Applied** — verified locally; the design was made net-negative on `GameScene.ts`, and it is a gate criterion. |
| 11 | Obsolete geometry prose in the evidence README and `helpBanner.ts`. | **Applied** — all four records listed and corrected. |

Codex re-derived the valley and entity inventories from the shipped bytes in **both** rounds and
confirmed them each time. Nothing was rejected outright; findings 2, 3 and 7 were resolved by a
different mechanism than proposed, noted above.

## Round 3 — aborted, then repurposed

Round 3 was launched against the twice-revised plan and **died mid-review on a ChatGPT usage limit**.
No verdict was returned and none is claimed — a flagged gap beats a false "approved".

Its six open questions were all locally checkable, and the repo's own rule is that Codex findings are
file-evidence only and must be re-verified locally anyway. All six were checked directly; three
tightened the plan:

| Question | Answer |
|---|---|
| (a) Can `attachHud()` carry the help text, and is `GameScene.ts` really net-negative? | **Yes** — verified line by line; net −1 |
| (b) Does `helpBannerLayer.ts` stay under 400 lines? | Budgeted, and gated |
| (c) Can a Phaser-type-only module create a `Text` and register `resize` + teardown? | **Yes** — `SCENE_SHUTDOWN` is already vendored in `engineLiterals.ts` for exactly this |
| (d) Is `ui.hudObjects().counter` populated by the owner's first `update`? | Yes — `UIScene.create()` runs before the next frame's `update`; a guard covers the pathological case |
| (e) Is adding a prod spec safe? | **Only inside the existing `phase-10-production.spec.ts`** — plan corrected |
| (f) Can one pit detector serve both `levelBuilder.mjs` and a TS test? | **Yes** — `.mjs` + `.d.mts`, the `anchorGate` precedent. Plan corrected |

**Owner decision, revised twice.** First: wait for the limit and re-run round 3 before writing any
code. Then, after a live probe came back still hard-blocked: **continue without it.**

So the plan was approved for build on **two** completed rounds, not three. That is a stated gap, not
a claimed convergence — and round 3's brief was preserved and later run against the implementation,
where it produced the two findings that forced the detector restructure. See
[`session-hud-and-pits-impl.md`](session-hud-and-pits-impl.md).
