[← Phase 5 plan review index](phase-05-plan.md)

# Phase 5 — Codex plan review of the SESSION-6 execution plan

**Ran:** 2026-08-11, session 6, **before any code and before any further spend.**
**Invocation:** `/codex:rescue --wait --fresh`, carrying the `node_repl` / `fs.readFileSync`
instruction from [PRD.md § The Codex review protocol](../PRD.md#the-codex-review-protocol).
**Reviewed:** `C:\Users\royko\.claude\plans\resume-phase-5-combat-staged-mountain.md` (revision 1)
against HANDOFF.md §11, the phase plan of record, the five reviews above, the §6 gate,
`docs/qa/phase-05-combat.md`, `docs/generations/phase-05-ratio-match.md`, CLAUDE.md, and the source
each claim named.

**Still a PLAN review, not the implementation review.** Criterion 5.14 remains **UNRUN**.

**Scope split.** Codex again had no network and again could not spawn a process
(`CreateProcessAsUserW failed: 5`), so it ran no typecheck, test, build, ffmpeg, Playwright or fal
command. File access through `node_repl` only — **but it again did more than read**, evaluating the
repository's own job tables and the installed Phaser source in-process. Codex stated its own limits
rather than being asked to.

**Verdict: BLOCK — 6 blockers, 3 major. All re-verified locally. All CONFIRMED**, including two the
plan's author had stated wrongly himself.

## The review, verbatim

> **BLOCK**
>
> Do not execute Task 2. The plan still has several pre-spend blockers, including one that makes all
> seven new downloads resolve to the wrong—or no—input during extraction.
>
> **1. Task 3 catalog finding — verified, but the fix is incomplete**
>
> - Confirmed: `brass-courier/attack` and `/death` are silently skipped. `CATALOG_TIMING_SLUGS`
>   contains only the keys of `FIXED_TIMINGS`, currently sentry and scavenger; `build-assets` only
>   creates rows when that set contains the slug. `catalogTimings.mjs:34`, `build-assets.mjs:319`
> - Confirmed: scavenger `walk` and `chase` enter the catalog path, then `timingFor()` throws because
>   only scavenger `death` exists. `catalogTimings.mjs:40`, `catalogTimings.mjs:46`
> - Downstream runtime accepts valid rows: catalog validation accepts the full `SheetEntry` shape,
>   Boot loads and frame-count-checks them, and GameScene registers every catalog sheet.
>   `assetCatalog.ts:132`, `BootScene.ts:102`, `GameScene.ts:467`
> - Enemy action agreement is already correct and mechanically tested: sentry `idle/fire/death`,
>   scavenger `walk/chase/death`. `enemyView.ts:69`, `slug-config.test.ts:73`
>
> Blocker: Task 3's proposed coverage test cannot pass as described. It says every action of every
> slug must resolve, but courier has eight actions; the plan adds timings only for `attack/hurt/death`.
> Its predicted failure list wrongly omits courier `idle/walk/run/jump/fall`. Worse, adding courier to
> the slug-level `CATALOG_TIMING_SLUGS` while supporting only three actions makes a later bare courier
> build throw partway through. `plan:185`, `slugConfig.mjs:23`
>
> Blocker: the clean existing `brass-courier/hurt` clip is never extracted or packed. Task 4 processes
> only the seven purchased clips, but `hurt` remains required and pending. `plan:206`,
> `asset-catalog.test.ts:103`
>
> **2. Spend ordering — still blocked**
>
> The submitted parameters will use the padded anchors after Task 1, and only `walk` and `chase`
> correctly receive `--end_image_url`. That half is sound. `submit-clips.mjs:82`
>
> The fatal problem is filename resolution:
>
> | Key | New download selected from current disk | `CLIP_FILES` still declares |
> |---|---|---|
> | sentry/fire | `brass-sentry-fire-r4.mp4` | `-r3.mp4` |
> | sentry/death | `brass-sentry-death-r3.mp4` | `-r2.mp4` |
> | scavenger/walk | `rust-scavenger-walk-r3.mp4` | `-r2.mp4` |
> | scavenger/chase | `rust-scavenger-chase-r3.mp4` | `-r2.mp4` |
> | scavenger/death | `rust-scavenger-death-r3.mp4` | `-r2.mp4` |
> | courier/attack | `brass-courier-attack-r3.mp4` | `-r2.mp4` |
> | courier/death | `brass-courier-death-r2.mp4` | `null` |
>
> `submit-clips` computes the next free download independently of `job.file`; `findClip` later trusts
> `job.file` exactly. Therefore six actions consume the superseded clip, while courier death becomes
> ambiguous and throws once both files exist. `submit-clips.mjs:27`, `submit-clips.mjs:65`,
> `clipJobs.mjs:170`, `clipSource.mjs:44`
>
> `validateClipJob()` never validates `file` against the rendered download path, so all seven commands
> can look valid while producing files later work ignores. `clipJobs.mjs:235`
>
> Severity: Blocker. Catalog wiring does not alter submitted bytes, but the producer/consumer filename
> contract must be closed before spending or explicitly updated immediately after each successful
> download and before extraction.
>
> **3. Task 4 scale ordering — deadlocked**
>
> - `assets:clips` does not read the bounds config or scale, so `scale: null` does not structurally
>   block extraction.
> - Ordinary `assets:build -- rust-scavenger walk` fails because normal packing requires `scale > 0`.
>   `build-assets.mjs:178`
> - `--derive-scale` hardcodes `findSource('idle')`; it does not derive from the requested `walk`
>   action. `build-assets.mjs:153`
> - Scavenger deliberately has no `idle` action or sheet. `character-bounds-rust-scavenger.json:25`
>
> Thus even after extracting `walk`, `node ... rust-scavenger walk --derive-scale` searches for
> `rust-scavenger-idle-clip.png` and throws.
>
> Severity: Blocker. The scale derivation must be made action-aware, and because that requires changing
> the exactly-400-line `build-assets.mjs`, the file-size split must move ahead of this work.
>
> **4. Expected-failure lock and suite impact**
>
> No command in the written plan repacks `brass-sentry/idle`; its expected-failure lock remains intact.
> `shipped-sheets.test.ts:137`
>
> But `npm test` will not pass when the new rows land:
>
> - `shipped-sheets.test.ts` requires the catalog keys to equal its current exact six-item list. Any
>   new row breaks it.
> - `asset-catalog.test.ts` still declares courier `attack/hurt/death` pending; adding attack/death
>   without updating this test fails both count and pending-art assertions.
> - `enemy-layer-catalog.test.ts` requires shipped enemy keys to remain a proper subset; completing all
>   six intentionally expires and fails that assertion.
> - `slug-config.test.ts` should remain green.
>
> Severity: Blocker — these are required expiry updates, not test loosening.
>
> **5. Tasks 6–7 — W19, 5.11 and 5.7**
>
> Blocker — the 5.7 fixture reopens a previously applied requirement. `createScavenger({ hp: 2 })` sets
> both `hp` and `maxHp` to 2, producing a full 2/2 bar rather than a low-health 2/60 bar, so the
> near-empty rendering can pass while broken. Construct at normal 60 HP and then set only `hp = 2`.
> `enemies.ts:212`, `enemyHealthBar.ts:67`
>
> Major — the plan misstates the current growth failure. The `continue` occurs before bar drawing, so a
> late enemy gets neither body nor bar. `enemyLayer.ts:104`
>
> Major — the 5.11 count remains underspecified. The shipped level already starts with two enemies. The
> assertion must count the delta of enemy body sprites with enemy texture keys and name a fixed
> positive N, or baseline bodies / shared Graphics can satisfy it vacuously.
>
> Installed Phaser finding: `commandBuffer` is public and readable in installed `phaser@4.2.1`;
> `fillRect` appends `[FILL_RECT,x,y,w,h]`. `clear()` empties it, but both renderers only read it — they
> do not consume/reset it — and `sync()` clears/redraws synchronously, so Playwright sees the completed
> non-empty buffer between frames. `Graphics.js:133`
>
> `playIfChanged` is compatible with runtime growth: `addBody` starts the animation once and the
> following sync sees the same key. No new `verify-dist` scene-key or prose entries are required; the
> exported spawn-helper symbol belongs in the bare-symbol list.
>
> **6. Task 8 and criterion 5.12**
>
> Blocker — the ordering argument misses `clipJobs.mjs` at 372. Six new records add at least 30 lines,
> taking it to roughly 402 — an eleventh over-limit file — and Task 3 runs full `npm test` before Task
> 8, so it cannot produce its promised PASS. `clipJobs.mjs:145`, `file-size.test.ts:78`
>
> Fixing Task 4 also necessarily touches the exactly-400-line `build-assets.mjs`, so Task 8 cannot
> remain at position 8.
>
> The barrel approach itself is viable and compatible with `sim-boundary.test.ts` and the
> Phaser-uninstalled import check; a barrel under 400 lines needs no QA-log name. However: the current
> tree has 18 direct importer files, not 22; the split design leaves
> `EnemySpawn`/`EnemySet`/`spawnEnemies`/both boxes/`overlapsScavenger` (lines 299–400) without a stated
> destination while `enemies.ts` is required to be re-exports only; and moving the boxes makes
> provenance references in both character-bounds JSON files stale, which Task 8 doesn't account for.
>
> Severity: Major after the ordering blocker.
>
> **7. Most likely subtle shipment**
>
> The 5.7 browser proof will spawn a "2 HP" scavenger as 2/2 HP, observe a full bar, and report the
> low-health bar correct without ever exercising it — reopening the phase's prior D10 finding. The stale
> `CLIP_FILES` issue is more immediate but usually stops loudly during extraction; the 2/2 health-bar
> fixture can survive the entire stated gate and ship unnoticed.
>
> **Could not check:** process spawning is permanently unavailable, so typecheck/Vitest/build/ffmpeg/
> Playwright/asset commands could not be run; network access is unavailable, so fal.ai pricing, live
> schema, licensing, and uploaded-byte hashes could not be verified; the seven new clips don't exist
> yet, so their extraction/gate outcomes could not be inspected. Findings are source evidence plus
> in-process evaluation of the repo's JS job tables and installed Phaser source; no files were modified.

---

## Local re-verification — all CONFIRMED

Every claim was re-checked against the working tree before triage, because Codex could run nothing.

| Claim | Verdict | Decisive local evidence |
|---|---|---|
| `CLIP_FILES` stale for all seven | **CONFIRMED, to the filename** | `brass-sentry-fire-r3.mp4` is on disk, so the next free path is `-r4`; the record declares `-r3`. The other five declare `-r2` while `-r2` already exists, so each new download becomes `-r3`. `brass-courier/death` declares `null` and two candidates would exist. |
| `--derive-scale` hardcodes `idle` | **CONFIRMED** | `build-assets.mjs:157` — `const { keyed } = keySheet(findSource('idle'));` with the comment *"The canonical standing height comes from `idle`."* `character-bounds-rust-scavenger.json` states the scavenger has no `idle` **by design**. |
| `createScavenger` sets `maxHp: hp` | **CONFIRMED** | `enemies.ts:213-229` — `const hp = options.hp ?? 60;` then `hp, maxHp: hp`. `healthBarFillWidth` returns the full `slotW` when `hp >= maxHp` (`enemyHealthBar.ts:74-76`). A "2 HP" scavenger draws a **full** bar. |
| `clipJobs.mjs` would cross 400 | **CONFIRMED** | `wc -l` = **372**. Six records with the docstrings this file's convention requires add ~30 lines. |
| The `continue` precedes the bar draw | **CONFIRMED** | `enemyLayer.ts:104` `this.bars.clear();` → `:107-109` `continue` → `:122-126` the bar draw. A late enemy gets **neither** body nor bar. Revision 1 said *"bar drawn, no body"* and was **wrong**. |

## Triage

`F1…F9`, applied or recorded with a reason *(C11)*.

| ID | Severity | Disposition |
|---|---|---|
| **F1** | blocker | **APPLIED.** The `CLIP_FILES` contract becomes a tested invariant (new Task 1), and updating it to the ACTUAL downloaded filenames is a **hard gate** before any extraction (Task 2 step 4). |
| **F2** | blocker | **APPLIED.** `--derive-scale` becomes action-aware (Task 4 step 1). |
| **F3** | blocker | **APPLIED.** The 5.7 fixture constructs at 60 HP and sets `hp = 2` only, and asserts `0 < fillW < slotW` — the upper bound is what the `maxHp` trap would otherwise hide. **This reopened D10 and Codex was right to call it the most likely subtle shipment.** |
| **F4** | blocker | **APPLIED.** The 5.12 split moved from position 8 to **Task 0**. |
| **F5** | blocker | **APPLIED.** The coverage test is scoped to (slug, action) pairs this phase packs; catalog gating moves from per-slug to **per-(slug, action)**. |
| **F6** | blocker | **APPLIED.** `shipped-sheets`, `asset-catalog` and `enemy-layer-catalog` assertions are updated as **required expiries, not loosening** (Task 4 step 6). |
| **F7** | blocker | **APPLIED.** `brass-courier/hurt` added to the packing list. |
| **F8** | major | **APPLIED.** The growth-bug rationale corrected in place rather than quietly fixed — a wrong rationale is exactly what finding A1 was about. |
| **F9** | major | **APPLIED.** `enemyPlacement.ts` named as the destination for lines 299-400; importer count corrected to 18; both `character-bounds-*.json` provenance references updated. |

**Net effect:** the review **moved the file-size split to the front of the session**, closed a
producer/consumer contract that would have made all seven paid downloads invisible to the pipeline,
un-deadlocked the scavenger's scale derivation, and caught a 5.7 fixture that would have passed the
entire QA gate while proving nothing. **Revision 1 would have spent $8.33 and extracted the clips it
was buying replacements for, silently, for six of seven keys.** The plan was rewritten as
**revision 2** rather than patched. **9 of 9 applied, none rejected, nothing silently dropped.**

**Still to run:** criterion 5.14, the Codex **implementation** review (`--wait --resume`) against the
diff, saved to `docs/reviews/phase-05-impl.md`.

---

# Phase 5 — Codex plan review of the SESSION-7 execution plan

**Reviewed:** `C:\Users\royko\.claude\plans\resume-phase-5-combat-vectorized-hanrahan.md`, against
`docs/prd/phase-05-combat.md` §1b and §6, and `docs/PRD.md` Global Constraints.
**Invocation:** `/codex:rescue --wait --fresh`, carrying the `node_repl` + `fs.readFileSync`
instruction (the sandboxed shell cannot spawn processes on this machine — `CreateProcessAsUserW
failed: 5`, permanent).
**Run:** 2026-08-12, before `ExitPlanMode`, per CLAUDE.md §4 and criterion 5.13.
**Verdict: BLOCK — 4 blockers, 3 major, 1 minor.**

**This is the seventh plan review of this phase.** The plan under review proposed: the global cell
288×384 → 384×384 (decision D1), a declarable per-`(slug, action)` scale (D2), the ceiling raised
$45 → $55 (D3), and config-then-gate ordering with art last (D4).

## The review, verbatim

> # BLOCK — revise the plan before implementation
>
> ## Findings
>
> 1. **BLOCKER — Task 2 cannot reach its promised green commit because `rust-scavenger/walk` also lacks a stride.**
>
>    The plan says only `chase` is blocked on `stridePxPerCycle`, then requires `walk` to be packed, the orphan-coverage test to pass, and Task 2 to commit before Task 4 measures the strides (plan:31, plan:245, plan:249). In fact, both `walk` and `chase` are `null` (`character-bounds-rust-scavenger.json:22`), and the timing tests explicitly classify both as unmeasured (`catalog-timings.test.ts:152`).
>
>    `build-assets` writes the PNG first, then asks `catalogRowFor` for timing (`build-assets.mjs:232`, `build-assets.mjs:256`); missing timing throws (`catalogTimings.mjs:121`). That leaves a PNG without a catalog row, precisely what `catalog-completeness.test.ts` rejects (`catalog-completeness.test.ts:37`).
>
>    Measure/set both strides before writing shipped `walk`/`chase`, or pack them only to scratch until Task 4. As ordered, Task 2 cannot pass its own gate.
>
> 2. **BLOCKER — the proposed scale guard is not executable against the existing profiles, and RED-B is logically false.**
>
>    Existing lift profiles store one root `scale`; their animation entries have neither `scale` nor `scaleSource` (`lift-profile.json:3`, `lift-profile.json:6`). The proposed guard requires every merged entry to have both fields (plan:268), while the writer preserves all old animation entries during a per-action merge (`catalogWrite.mjs:57`). Therefore the first Task-3 build will reject the legacy entries unless the plan explicitly migrates them.
>
>    Separately, removing `attack`'s override does **not** produce the claimed collision. The proposed resolution falls back to `config.scale`; that produces another valid `'slug'` entry with the same scale as every existing slug entry (plan:269, plan:284). The guard has no information from which to infer that this particular action required an override.
>
>    The redesign adds useful finite/source/cross-slug checks, but it is not strictly stronger: it deliberately accepts multi-scale profiles that the current guard rejects (`catalogWrite.mjs:50`). Add explicit legacy migration and tests for every stated invariant, including cross-slug merge and unknown source.
>
> 3. **BLOCKER — Task 5 still leaves criterion 5.12 failing.**
>
>    The phase criterion says "No file > 400 lines" (`docs/prd/phase-05-combat.md:138`). The plan splits four files and accepts merely "strictly below 10," with remaining offenders justified (plan:375, plan:417). That leaves six over-limit files. The existing QA log explicitly warns that a green result does not satisfy 5.12 (`docs/qa/phase-05-combat.md:209`).
>
> 4. **BLOCKER — optional Task 9 invalidates the implementation review.**
>
>    The plan says art after the gate is art the gate has not reviewed (plan:51), runs the implementation review in Task 7 (plan:455), then allows new art in Task 9 (plan:489). If Task 9 runs, review 2 and full verification must rerun on the phase's final diff — otherwise Task 9 must be made explicitly post-phase.
>
> 5. **MAJOR — criterion 5.4 has no durable "advanced past frame 0" procedure** — a screenshot cannot prove frame advancement; needs e2e or Playwright sampling of multiple `currentFrame.index` values.
>
> 6. **MAJOR — the adoption-reversal checklist omits durable supersession records and a courier-specific anchor contract** — `GENERATION-LOG.md:170` and `docs/generations/phase-05-padded-round.md:66,71` still declare the padded courier clips unusable and need a dated supersession entry; `SUPERSEDED_CLIPS` needs `attack-r5`/`death-r4` added explicitly.
>
> 7. **MAJOR — Task 2 can pass without proving its named pure-padding behaviour** — the catalog metadata test compares frame dimensions only, not figure placement, so centroid-alignment could regress silently.
>
> 8. **MINOR — the claimed lift-profile `_comment` diff is unsupported** — for a width-only repack, the expected profile diff is no diff at all; the comment is a constant unrelated to frame width.
>
> ## Claims that check out
>
> - Global width is data in the three bounds files (currently 288), mirrored via `catalogTimings.mjs:146`.
> - The pure-padding claim holds: crop/scale happen before centroid-aligned placement in `sheets.mjs:341-352`; widening by 96 adds exactly 48 to each cell-relative `left`.
> - `frameDifference` scales by exactly 0.75; `gateLoopWrap` is invariant; `gateMotionFloor`'s worst existing peak (0.02046) leaves 7.67x headroom — supports "no shipped verdict flips," not new sheets.
> - Literal disagreement resolved: only `sheet-packing.test.ts:269` is a real shipped-width literal; the 288/384 values in `catalog-timings.test.ts` and `gym-geometry.test.ts` are synthetic/independent fixtures and should stay unchanged.
> - File-size inventory (exactly 10 over 400, `GymScene.ts` at 399) and the `<= 10` cap are accurate.
> - No Phaser/`Date`/`Math.random`/DOM in `src/sim/`; no fractional-second durations; no authored fps (all derived via `deriveFps`).
>
> ## Could not check
>
> Codex could not execute any test suite, build, or Playwright run; could not diff against `main` or check working-tree cleanliness; could not validate fal.ai URLs/prices/schemas or visually judge contact strips; and could not independently establish freshness of gitignored `_generated` snapshot values. No files were modified — this was read-only via `node_repl`/`fs.readFileSync`.

## Local re-verification — the two decisive blockers CONFIRMED

Re-verified by the orchestrator before triage, not taken on Codex's word.

**Blocker 1 — CONFIRMED.** `character-bounds-rust-scavenger.json:22` reads verbatim:

```
"stridePxPerCycle": { "walk": null, "chase": null },
```

**Both are null.** Every prior handoff records `walk` as blocked on cell width and `chase` as blocked
on the stride, as though they were different problems. `walk` hits the pack blocker first, so nobody
ever reached its catalog blocker. **This is the fourth time in this phase that "extraction stops at
the first failure" has hidden a second defect behind the first.**

**Blocker 2 — CONFIRMED.** `lift-profile.json:3` carries a root `"scale": 0.23723229`, and its
animation entries begin `"idle": { "anchor": "feet", …` — **no `scale`, no `scaleSource`.** Since
`upsertLiftProfile` preserves old animation entries on a per-action merge (`catalogWrite.mjs:57`), the
proposed clause-1 check would reject every legacy entry on its first run. Codex's second point is also
correct on inspection: removing an override falls back to `config.scale` and yields a valid
slug-sourced entry, so the plan's RED-B red-run **could not have fired**.

**Blockers 3 and 4 and majors 5–7 are judgement calls about the plan's own claims, not repository
facts, and are accepted as stated.**

## Triage — 8 of 8 applied, none rejected, nothing silently dropped

| ID | Sev | Disposition |
|---|---|---|
| **1** | blocker | **APPLIED.** A stride prerequisite is added to Task 2 with the `build-assets.mjs:232` → `:256` → `catalogTimings.mjs:121` → `catalog-completeness.test.ts:37` chain spelled out, and two legal orders offered (fold Task 4's measurement in, preferred; or pack to scratch only). **The plan's own state table was corrected — `walk` now reads "296 px cell AND a null stride".** |
| **2** | blocker | **APPLIED.** An explicit legacy-migration step is added ahead of the guard change, stamping every existing entry with the root scale and `scaleSource: 'slug'` and verifying the numbers are unchanged. **RED-B was replaced** (`scale: null` / omitted source) and **RED-C added** (cross-slug merge, impossible to trigger today). The false RED-B claim is called out in place rather than deleted. |
| **2b** | blocker | **APPLIED, and this is the important half.** The plan's "strictly stronger" framing is **withdrawn**. The redesign is stronger on three axes and **deliberately narrower on one** — the one-scale rule now binds only slug-sourced entries. That narrowing **is decision D2**, and it must be recorded in the guard's own comment as a deliberate scope reduction with its reason. Disguising a narrowing as a strengthening is exactly the move this project's gate rule exists to prevent. |
| **3** | blocker | **APPLIED.** Task 5's acceptance is rewritten. **Criterion 5.12 is reported FAILING at the end of this session** unless the count reaches zero; four splits are progress on a criterion that has not moved in three sessions, not closure. Closing it fully (three e2e specs plus `BootScene.ts`) is escalated to the user as a scope decision rather than absorbed silently. |
| **4** | blocker | **APPLIED.** Task 9 is made **explicitly post-phase**. Two legal paths, no third: a future session with its own gate, or re-running 5.14 **and** the entire Task 8 verification on the resulting diff, knowingly. |
| **5** | major | **APPLIED.** 5.4 gets a written-out procedure. The `animations` skill, invoked during planning, supplied a better instrument than the polling Codex suggested: **the `animationupdate` event fires on every frame change carrying `frame.index`**, so the spec collects a Set in-page and asserts ≥2 distinct values. It also confirmed the root cause mechanically — `play()` restarts, `play(key, true)` is the guard — which is this phase's own vault-in note *(5.1)*. |
| **6** | major | **APPLIED.** `docs/GENERATION-LOG.md:170` and `docs/generations/phase-05-padded-round.md:66,71` added to the reversal checklist as **dated supersessions, not edits**, and `attack-r5` / `death-r4` are now named explicitly for `SUPERSEDED_CLIPS`. |
| **7** | major | **APPLIED.** Task 2 gains an explicit before/after assertion on the drawn figure's bounding box **relative to its own cell**, because the catalog test compares frame dimensions only. Without it the task's headline claim was untested. |
| **8** | minor | **APPLIED.** Corrected: a width-only repack should produce **no** `lift-profile.json` diff at all. `_comment` is a constant unrelated to frame width. The earlier wrong claim is noted in place. |

**A ninth finding came from the planning skills rather than Codex, and is recorded here because it
would have been a live render bug.** The `sprites-and-images` skill flags that a Sprite constructor
runs `setSizeToFrame` → `setOriginFromFrame`, so widening the frame moves `displayOriginX` from 144 to
192. Checked and **cleared**: `enemyView.ts:113,129`, `playerView.ts:112` and `GymScene.ts:127` all use
**originX 0.5** — the frame centre, which is exactly where `packStrip` puts the figure's centroid — so
the figure does not shift. Vertically `frameHeight` is unchanged and `baselineY = frameHeight`, so an
`originY` of 1 still lands on the contact line.

**Net effect:** the review **reordered Task 2** around a null stride that six sessions of handoffs had
misdescribed, **made an unexecutable guard executable** by forcing a legacy migration, **stopped a
scope narrowing from being presented as a strengthening**, **prevented criterion 5.12 from being
quietly downgraded from "no file over 400 lines" to "fewer than ten"**, and **stopped optional art
spend from invalidating criterion 5.14**. Two of the eight findings contradicted claims this plan's
own author had made — the same pattern as sessions 4 and 6.

**Still to run:** criterion 5.14, the Codex **implementation** review (`--wait --resume`) against the
diff, saved to `docs/reviews/phase-05-impl.md`.

> ⚠️ That line was written in session 7 and is now historical: **5.14 ran**, returned BLOCK with 6
> blockers, and is recorded in [phase-05-impl.md](phase-05-impl.md).

---

# Plan review 8 — session 8, 2026-08-12

**Invocation:** `/codex:rescue --wait --fresh`, carrying the `node_repl` + `fs.readFileSync`
instruction (the sandboxed shell cannot spawn processes on this machine — `CreateProcessAsUserW
failed: 5`, permanent), and **naming `docs/HANDOFF.md` §13 and `docs/qa/phase-05-combat.md` as
known-stale** so the reviewer would not spend findings on them. That instruction is itself an
application of session 7's lesson: *a handoff document is stale from the first commit of the session
that will rewrite it*, and two of session 7's six blockers were Codex correctly reporting exactly that.

**Target:** `C:\Users\royko\.claude\plans\resume-phase-5-combat-whimsical-lightning.md`, against
HEAD `b37ccf9`.
**Verdict: BLOCK — 2 blockers, 4 major, 2 minor.**

**Every finding was re-verified locally and every one was confirmed.** That keeps this phase's record
unbroken: **eight plan reviews plus one implementation review, and not one checkable finding has ever
been refuted.**

---

## The review, verbatim

> BLOCK
>
> 1. **Blocker — W4's prescribed knockback ordering is impossible against the current API and can shove lethal or refused hits.** The plan says to apply knockback "after damage and before the combat-state write," but `damagePlayer()` performs HP reduction and the `hurt`/`death` transition atomically before returning. Applying knockback afterward without checking both its boolean result and surviving HP would also shove during i-frames or after lethal damage. The rule must be `damagePlayer(...) === true && player.hp > 0`, with an i-frame/refused-hit regression added. [plan:218-231] [combat.ts:191-212] [worldDamage.ts:64-85]
>
> 2. **Blocker — W4 voids criterion 5.15, but the rerun matrix omits it.** Criterion 5.15 signs off hazard and kill-plane timing through `applyWorldDamage`; W4 edits that exact step-9b path. The plan's owner list and explicit invalidation list omit 5.15. [phase-05-combat.md:155-159] [worldDamage.ts:54-85] [plan:402-414]
>
> 3. **Major — W4 neither defines nor tests its promised three-source behavior.** Its three planned tests could all exercise one source while projectile, contact, or hazard knockback remains untested. Hazard direction is unspecified since `hazardHit()` returns a rectangle, not an origin. The plan's claim that `hazards.ts:85,88` already stops hazard motion is false — those lines stop bodies at world bounds, not on hazard contact. [plan:223-234] [worldDamage.ts:64-85] [hazards.ts:79-89] [hazards.ts:143-161]
>
> 4. **Major — the proposed knockback can pass while being effectively invisible on the ground.** Damage lands at step 9b, so the next tick runs friction before integration; a 5.54 impulse is cut by 3.69 ground friction to 1.85 px before its first movement and hits zero the following tick. Air friction (0.51) behaves very differently. Plan tests should pin grounded/airborne displacement over the lock window, not just `vx` sign. [player.ts:79-85] [player.ts:211-241] [tick.ts:257-282] [plan:218-238]
>
> 5. **Major — W2's claimed criterion-5.9 sweep cannot be performed as designed.** W2 adds `CHASE_DEAD_ZONE` as a module constant, but 5.9's sweep machinery goes through `enemyKnobs()` over live entity fields; the proposed W2 tests never probe either side of the 96 px boundary either. [plan:179-188] [enemyTuning.ts:17-23] [enemyTuning.ts:68-93]
>
> 6. **Major — `TUNING.walkMax` does not exist.** The Phase 2 default is `DEFAULT_TUNING.walkMax`; live worlds carry `world.tuning` instead. The plan's exact implementation instruction as written does not typecheck; it must pick one of the two. [plan:228-231] [player.ts:79-85] [index.ts:44-54]
>
> 7. **Minor — W2 does not test the facing-preservation part of its refactor.** A test that only asserts the positional clamp can pass even if the two facing assignments remain shared, leaving the scavenger facing away from the player at the chase boundary. [plan:174-185] [enemyScavenger.ts:117-133]
>
> 8. **Minor — W10 asserts a stale comment that the tree already fixed.** The current e2e header already states the walk sheet exists and 5.4 has hands-on evidence; this work item should be dropped or narrowed to just the automated regression addition. [plan:369-377] [phase-05-combat.spec.ts:1-13]
>
> Positive checks that held up:
>
> - All four stated corrections are supported by the tree: `canAct` blocks attacks in combat states, the corpse test is vacuous for movement, rendering already selects death and retains the body at reduced alpha, and `isSprite` is reachable via the existing dev-only `__phaserGame` seam.
> - W2's control-flow refactor is patrol-preserving and fixes chase clamping, provided the facing assignments are genuinely patrol-only.
> - W3's predicate placement respects the tick order: it evaluates before step 4, counters 0–5 lock the six following movement ticks, counter 6 releases control, and attacks stay blocked through `hurt`.
> - W4 correctly places damage at 9b with knockback movement beginning the following tick; "no lethal knockback" is consistent with the documented principle, but finding 1 must define how it's enforced.
> - Criterion 5.16's proposed row would pass `docs-contract.test.ts`.
>
> No files were modified; no processes or tests were run.

---

## Local re-verification and triage — 8 of 8 dispositioned, 8 of 8 CONFIRMED

| ID | Sev | Disposition |
|---|---|---|
| **1** | blocker | ✅ **CONFIRMED AND APPLIED.** `damagePlayer` (`combat.ts:201-213`) reduces `hp` **and** calls `enterCombatState` in one body before returning, so the seam the plan described does not exist. Its own docstring says the **boolean return is the point** and that *"refusal is a normal outcome here, not an error."* The plan would have shoved the player on every hit refused during i-frames — **a free repositioning tool granted by a defensive omission.** Guard corrected to `damagePlayer(...) && player.hp > 0`, and a refused-hit regression added. |
| **2** | blocker | ✅ **CONFIRMED AND APPLIED.** 5.15 signs off hazard and kill-plane timing through `applyWorldDamage`, which is the exact function W4 edits. It was absent from the plan's void list. Added. **This is the second time this phase that the void list was found incomplete** — session 7 had to re-run 5.1 and 5.5 for the same reason. |
| **3** | major | ✅ **CONFIRMED AND APPLIED, and one clause was flatly wrong.** `hazards.ts:79-89` is **`clampToBounds`** — a world-bounds clamp that zeroes `vx` at the left and right edges. It has nothing to do with hazard contact, and the plan cited it as if it did. `hazardHit()` returning a **rectangle rather than an origin** means hazard knockback direction is genuinely undefined and must be stated, not derived. Plan now requires **one test per damage source**. |
| **4** | major | ✅ **CONFIRMED AND APPLIED — and it re-opens a user decision.** Ground friction 3.69 against a 5.54 impulse leaves **1.85 px** before the first integration and zero after; air friction is 0.51, a 7× difference. So `walkMax` buys roughly **2 px** of visible ground knockback. The user chose `walkMax` **before this was known**. Tests now assert **displacement over the lock window, grounded and airborne separately**, and the measured number goes back to the user rather than being silently changed. |
| **5** | major | ✅ **CONFIRMED AND APPLIED.** `enemyKnobs` (`src/render/enemyTuning.ts:68-93`) builds knobs over **live entity fields**; a module constant is invisible to it, so `CHASE_DEAD_ZONE` could never have satisfied 5.9. `deadZone` becomes a per-scavenger field defaulted in `SCAVENGER`, exactly as `detectRadius` and `releaseRadius` already are. Codex additionally caught that the proposed tests **never probed either side of the threshold** — a wrong constant would have passed all of them. Boundary probes at 95 px and 97 px added. |
| **6** | major | ✅ **CONFIRMED AND APPLIED.** The export is `DEFAULT_TUNING` (`player.ts:79`); there is no `TUNING`. The plan's instruction would not have typechecked. |
| **7** | minor | ✅ **CONFIRMED AND APPLIED.** The refactor lifts two `facing` assignments into the patrol branch, and nothing proposed would have failed if they were left shared. A facing-preservation test at the chase boundary added. |
| **8** | minor | ✅ **CONFIRMED AND NARROWED.** `tests/e2e/phase-05-combat.spec.ts:1-13` was already corrected in session 7 and now says so explicitly, including that it misled the previous Codex review. W10 reduced to the automated guard alone. |

### What this review is worth

**Six of the eight findings landed on a single work item — W4, the knockback — and W4 is the only
item in the plan building something that does not exist yet.** The five items repairing known defects
drew two minor findings between them. That is a usable signal: **the reviews are most valuable
against new construction, and least valuable against a fix whose target has already been measured.**

**Finding 1 is the one worth remembering.** The plan's guard was wrong by *omission* — it said what to
do on a successful hit and never said what to do on a refused one, and `damagePlayer` returns a
boolean precisely because refusal is normal. A reviewer reading the plan alone could not have caught
it; it needed the function's own docstring. **A plan that names a function without reading its
contract is guessing**, however carefully the rest of it is argued.

**Finding 4 is the one worth acting on beyond this phase.** A knockback that satisfies
`expect(vx).toBeGreaterThan(0)` while moving the player 2 px is the same failure shape as vault 4.22 —
a number that is correct in the sim and invisible on screen. **Assert the observable, not the
intermediate.**
