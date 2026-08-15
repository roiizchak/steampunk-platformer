[← Phase 5 plan review index](phase-05-plan.md)

# Phase 5 — Codex plan review of the SESSION-3 execution plan

**Ran:** 2026-08-10, session 3, **before any code and before any further spend.**
**Invocation:** `/codex:rescue --wait --fresh`, carrying the `node_repl` / `fs.readFileSync`
instruction. **Reviewed:** `C:\Users\royko\.claude\plans\resume-phase-5-combat-quirky-graham.md`
(revision 1) against HANDOFF.md, the phase plan of record, both reviews above, the §6 gate, and the
source each claim named.

**Still a PLAN review, not the implementation review.** Criterion 5.14 remains **UNRUN**.

**Scope split.** Codex again had no network and again could not spawn a process
(`CreateProcessAsUserW failed: 5`), so it ran no typecheck, test or build and verified no fal claim.
File evidence only, stated by Codex itself. **Verdict: BLOCK — 22 findings, 3 blockers.**

## The three blockers, verbatim and re-verified locally

> **Blocker 1** — the plan claims no circular import is created because *"`clipJobs` does not import
> `clipSource`."* But `tools/gen/clipJobs.mjs:32` imports `NAMESPACED_VIDEO_DIR` from
> `clipSource.mjs` and uses it at `:181`. Making `clipSource.mjs` import `CLIP_JOBS` would create
> `clipSource → clipJobs → clipSource`.
>
> **Blocker 5** — `submit-clips.mjs:45` always sets the download path to `${stem}.mp4`, and the plan
> does not include that file. The prescribed re-shoot command can **overwrite the existing canonical
> round-one file** instead of creating `-r3`.
>
> **Blocker 6** — `build-clips.mjs:203-204` creates only `_generated/sheets`, then writes to
> `join(SHEET_DIR, "${action}-clip.png")` at `:251-252`. A namespaced action such as
> `brass-courier/attack` targets `_generated/sheets/brass-courier/attack-clip.png`, but nothing
> creates that subdirectory. **The acceptance can pass immediately before failing at this next
> obstruction.**

Codex also **overturned a claim the plan's author had made**: that a Phaser `Group`'s children Set is
unordered. `node_modules/phaser/src/gameobjects/group/Group.js:106` uses a native JS `Set`, which
**is** insertion-ordered. The accurate objection is *no index-based access*. Corrected, not defended.

## Local re-verification — 3 of 3 blockers CONFIRMED

| Claim | Verdict | Decisive local evidence |
|---|---|---|
| Circular import | **CONFIRMED** | `clipJobs.mjs:32` reads `import { NAMESPACED_VIDEO_DIR } from './clipSource.mjs';`. `clipJobs.mjs:34-39` documents this exact TDZ hazard in its own comment. |
| Paid-clip overwrite | **CONFIRMED** | `submit-clips.mjs:45`: `` const downloadPath = `${VIDEO_OUT_DIR}/${stem}.mp4`; `` — no collision check. Would destroy ~$1.19 of non-regenerable input. |
| Nested output dir | **CONFIRMED** | `build-clips.mjs:204` `mkdirSync(SHEET_DIR…)` only; `:251` `join(SHEET_DIR, \`${action}-clip.png\`)`. |

## Triage

Full disposition table for all 22 findings is in the session-3 plan file. Summary: **21 applied, 1
partly applied with the remainder recorded** (finding 8 — `build-world.mjs:47-73` carries the same
latent glob-ambiguity defect as `findClip` did; it is Phase 3 territory and out of this session's
appetite, recorded here rather than silently left). Nothing was silently dropped.

**Net effect:** the design was inverted (`clipSource` stays a leaf; the declared filename is passed
in at the call site), two files were added to the blocking work item's scope, one work item gained a
hard dependency on another, and six acceptance checks were rewritten because they could have gone
green on broken work.

---
---

# Phase 5 — Codex plan review of the SESSION-4 execution plan

**Ran:** 2026-08-11, session 4, **before any code and before any further spend.**
**Invocation:** `/codex:rescue --wait --fresh`, carrying the `node_repl` / `fs.readFileSync`
instruction from [PRD.md § The Codex review protocol](../PRD.md#the-codex-review-protocol).
**Reviewed:** `C:\Users\royko\.claude\plans\resume-phase-5-combat-pure-crane.md` (revision 1) against
HANDOFF.md §9, the phase plan of record, the three reviews above, the §6 gate,
`docs/qa/phase-05-combat.md`'s agent-owner findings, `docs/generations/phase-05-jump-reshoot.md`, and
the source each claim named.

**Still a PLAN review, not the implementation review.** Criterion 5.14 remains **UNRUN**.

**Scope split.** Codex again had no network and again could not spawn a process
(`CreateProcessAsUserW failed: 5`), so it ran no typecheck, test or build and verified no fal claim.
**But it did more than read this time:** it executed the repository's own pure PNG/chroma functions
in-process through `node_repl`, which is what produced the decisive 78.4 % measurement in blocker 2.

**Verdict: BLOCK — 4 blockers. All four re-verified locally. All four CONFIRMED.**

## The four blockers, verbatim

> **Blocker 1** — *"The padded anchor cannot have the promised geometry. The source is 1536×2752 with
> a 2525 px-high subject (91.8%). Placing it byte-identically into a 2752×2752 canvas leaves its height
> and vertical margins unchanged: it remains 91.8% tall, not ~51%, with 5.1% top headroom — not ~24%.
> The plan simultaneously requires a translation-only, byte-identical blit and an impossible vertical
> reduction."*
>
> **Blocker 2** — *"A-T1's proposed crop→estimate path fails its own historical regression fixture.
> `estimateKeyColour` requires 90% agreement over the one-pixel border. Fresh in-process evaluation of
> `brass-sentry-fire-frame.png` returned only **78.4%** and threw before G6 could report the promised
> left/right failure."*
>
> **Blocker 3** — *"A-T5 does not bypass the five shipped courier motions.
> `configFor('brass-courier').actions` begins `idle, walk, run, jump, fall` before the Phase-5 actions.
> Therefore the proposed work list still re-extracts all five and reaches the known-failing `jump`."*
>
> **Blocker 4** — *"A-T7's 'delete the redundant block' breaks sentry cadence. The first check
> increments the cooldown; the second check prevents firing while it remains open. Deleting lines
> 144–146 makes every visible sentry fire on every tick."*

## Local re-verification — 4 of 4 CONFIRMED

| Claim | Verdict | Decisive local evidence |
|---|---|---|
| Padding geometry impossible | **CONFIRMED** | The anchor is 1536×2752, measured with the repo's own decoder. Padding to 2752² adds **width only**; fill stays 91.8 %, headroom stays 5.1 %. Reaching 65 % fill by translation alone needs a **3884²** canvas. Revision 1 would have spent $1.19 on an anchor without the property under test. |
| `estimateKeyColour` throws at 78.4 % | **CONFIRMED, to the digit** | `estimateKeyColour: only 78.4% of border pixels are within 120 of the median (0,245,4)`. Measured 0.7841. |
| Courier work list still contains `jump` | **CONFIRMED** | `slugConfig.mjs:28` — `actions: ['idle','walk','run','jump','fall','attack','hurt','death']`. |
| `enemies.ts:144` is load-bearing | **CONFIRMED** | `:138` `if (windowOpen(...)) counter += 1` is a **saturating increment**; `:144` `if (counter < cooldown) return {fired:false}` is the **fire guard**. Different jobs, same expression. |

**Blocker 2's resolution is better than the plan it replaced, and Codex forced it.** Border agreement
turns out to *separate* the two cases cleanly, measured across every committed fixture: a uniform
background of **any** colour agrees at **1.0000** — including the off-key `(0,195,64)` field that R3 is
about — while subject-on-the-border drops it to **0.78–0.93**. So the border **median** is the right
key in both cases, and the **agreement floor** is what must be bypassed, not the alpha threshold.
`borderKey(image) = estimateKeyColour(image, { minAgreement: 0 })`.

**The four-direction re-validation, run before the plan was rewritten:**

| direction | with `borderKey` | today (default key) |
|---|---|---|
| real cropped `brass-sentry-fire` | **FAIL** `{left:0,right:0,top:43,bottom:29}` | FAIL |
| real clean Phase 4 `idle` | **PASS** `{30,41,13,6}` key `[3,231,8]` | PASS |
| **R3:** off-key `(0,195,64)`, well framed | **PASS** `{30,30,30,30}` key `[0,195,64]` | **FAIL** ← the false positive |
| **R3 ∩ crop** *(Codex §5)*: off-key **and** at the edge | **FAIL** `{60,0,30,30}` | FAIL |

The fourth row is the one Codex demanded, and it is the one that proves the gate was not loosened: a
clean off-key PASS plus a pure-green cropped FAIL does not cover their intersection.

## A correction Codex forced to the repository record

Codex noticed that `docs/generations/phase-05-jump-reshoot.md:22` calls the courier anchor
*"a **square 2048²** anchor"*. **It is 1536×2752 — ratio 0.558, which is essentially 9:16.**

That is load-bearing. HANDOFF §8 recorded the crop's root cause as *"its square anchor forced into
9:16 lost ~14 % off each side"* — a description that **never applied to the courier at all**. Phase 4's
`jump` was shot at 9:16 **from a 9:16 anchor**, so no reframing occurred, and it still cropped on the
right. The plan's single-axis mechanism was therefore correlation dressed as mechanism, exactly as
Codex said, and it has been replaced with **two** causes: reframing, and motion-induced extension
beyond the anchor's static silhouette — the latter already recorded independently at
`motion.mjs:286,291`, which describes a prior jump translating upward inside its frame until sampled
frames had no head.

## Triage

Full disposition for all four blockers and the eight section findings (§1–§8) is in the session-4 plan
file. Summary: **12 of 12 applied, none rejected, none silently dropped.** The plan was rewritten as
revision 2 rather than patched.

**Net effect:** the probe's canvas arithmetic was corrected (it would have tested nothing), the G6 key
seam was redesigned around a measurement Codex produced, scoping moved from slug-level to action-level,
a proposed "cleanup" that would have shipped a live combat regression was reversed, the mechanism claim
was withdrawn and replaced, eight omitted §6 criteria and the whole §1b debt ledger were restored to the
status table, and the task DAG was corrected for a file collision between two items the plan had called
parallel-safe.

**Still to run:** criterion 5.14, the Codex **implementation** review (`--wait --resume`) against the
diff, saved to `docs/reviews/phase-05-impl.md`. The phase cannot be reported done until it has run and
every finding of *its* is applied or recorded.

---
---

# Phase 5 — Codex plan review of the SESSION-5 execution plan

**Ran:** 2026-08-11, session 5, **before any code and before any further spend.**
**Invocation:** `/codex:rescue --wait --fresh`, carrying the `node_repl` / `fs.readFileSync`
instruction from [PRD.md § The Codex review protocol](../PRD.md#the-codex-review-protocol).
**Reviewed:** `C:\Users\royko\.claude\plans\resume-phase-5-combat-glittery-sketch.md` (revision 1)
against HANDOFF.md §10, the phase plan of record, the four reviews above, the §6 gate,
`docs/qa/phase-05-combat.md`, `docs/generations/phase-05-ratio-match.md`, and the source each claim
named.

**Still a PLAN review, not the implementation review.** Criterion 5.14 remains **UNRUN**.

**Scope split.** Codex again had no network and again could not spawn a process
(`CreateProcessAsUserW failed: 5`), so it ran no typecheck, test, build, ffmpeg, Playwright or fal
command. File access through `node_repl` only — **but it again did more than read**, evaluating
`padAnchor.mjs`'s geometry in-process to check the plan's canvas arithmetic. Branch confirmed as
`phase-05-combat`. Codex stated its own limits rather than being asked to.

**Verdict: BLOCK — 4 blockers, 4 major, 1 minor. All re-verified locally.
8 CONFIRMED, 1 PARTLY REFUTED.**

**Three user decisions were declared closed to redesign in the prompt** and Codex respected that:
spend early; re-shoot `brass-sentry/fire` with less muzzle blast rather than modify G6; split only
the files Phase 5 touches and report 5.12 failing.

## The blockers, verbatim

> **Blocker — 5.4d / catalog.** *"`enemyAnimTimings()` tests use invented fixture frame counts, not
> shipped catalog rows; `build-assets.mjs` never writes `index.json` for enemies, while
> `GameScene.ts` reads `sheet.fps` from that catalog."*
>
> **Blocker — dependencies.** *"No per-action padded-anchor job config exists — `CLIP_JOBS` assigns
> one original anchor URL per slug; nothing routes padded anchor URLs into job records before
> `submit-clips.mjs` fires."*
>
> **Blocker — dependencies.** *"`character-bounds-brass-sentry.json` and
> `character-bounds-rust-scavenger.json` don't exist; `build-assets.mjs` throws without them, and
> even `--derive-scale` needs `renderHeightPx` from the config first."*
>
> **Blocker — dependencies.** *"No catalog-writing path exists for enemy sheets — `build-assets`
> writes PNGs/reports/lift profiles but nothing updates `index.json`; Boot never registers enemy
> animations without it."*
>
> **Blocker — most likely wasted spend.** *"The `brass-sentry/fire` padded re-shoot would be
> submitted with the **original unpadded anchor**, because `submit-clips.mjs` reads `anchorUrl` from
> `CLIP_JOBS`, which the plan never updates to point at the padded/uploaded version. This would spend
> $1.19 without exercising the padding treatment it's meant to test."*

Codex also **confirmed the arithmetic revision 1 had guessed at**, evaluated in-process through
`padAnchor.mjs:58-80`: courier **5050²** at `--fill 0.50` → ~25.5 % / 24.5 % margins; scavenger
**3690²** at `--fill 0.45`. The prior session's review found this same arithmetic *impossible* and
saved $1.19; this time it holds, and the measured canvases supersede the plan's estimates.

## Local re-verification — 8 CONFIRMED, 1 PARTLY REFUTED

| Claim | Verdict | Decisive local evidence |
|---|---|---|
| Padded re-shoot submits the **unpadded** anchor | **CONFIRMED** | `clipJobs.mjs:108` `ANCHOR_URLS` is keyed **by slug**, one URL each; `:240` `const anchorUrl = ANCHOR_URLS[slug]`; `submit-clips.mjs:95` emits `--image_url "${job.anchorUrl}"`. No per-record override exists. |
| No per-slug bounds config | **CONFIRMED** | `public/assets/config/` contains exactly `character-bounds.json` and `lift-profile.json`. Neither is per-slug. |
| **Nothing writes `index.json`** | **CONFIRMED, and the docstring is false** | `build-assets.mjs` has exactly three `writeFileSync` calls — `:285` the strip PNG, `:328` the report, `:349` the lift profile. Its own docstring `:5` claims it *"writes both the PNG and the catalog rows"*. HANDOFF.md:251 already recorded the truth. `index.json` carries **five** courier keys and **zero** enemy rows. |
| One shared health-bar `Graphics` | **CONFIRMED** | `enemyLayer.ts:41` `private bars!: Phaser.GameObjects.Graphics`, `:60` one `this.scene.add.graphics()` for **all** enemies. |
| `sync()` skips uncreated bodies | **CONFIRMED** | `enemyLayer.ts:49-56` creates sprites once in `create()`; `:91-109` `sync()` has no growth path. |
| `verify-dist.mjs` checks a fixed list | **CONFIRMED** | `:82-111` enumerates literal scene keys, symbols and prose phrases. A new symbol is not covered until added. |
| `fire-elevated` missing from the buy list | **PARTLY REFUTED** | `slugConfig.mjs:13` omits it **deliberately, with the reason written in place**: *"that art has not been bought yet."* The repository is self-consistent; **the plan's wording was not.** |

## Triage

`E1…E10`, applied or recorded with a reason *(C11)*.

**8 applied, 1 partly refuted and applied as a wording correction, 1 recorded with a reason. Nothing
silently dropped.** The full disposition table is in the session-5 plan file.

**Net effect:** the review **moved three pieces of unbuilt pipeline in front of the spend** and
corrected a padded-anchor path that would have burned the entire batch. Revision 1 would have spent
**$8.33 shooting the unpadded anchors** — testing nothing — and then packed sheets that no catalog
row would ever have registered, leaving `EnemyLayer` drawing Rectangles and criteria 5.4, 5.4d, live
5.7, 5.8 and 5.11 exactly as unreachable as before. The plan was rewritten as **revision 2** rather
than patched, and the user re-confirmed the spend ordering with the new information in hand.

**Still to run:** criterion 5.14, the Codex **implementation** review (`--wait --resume`) against the
diff, saved to `docs/reviews/phase-05-impl.md`.

---
---
