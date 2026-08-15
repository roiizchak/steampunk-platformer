[← Phase 5 QA log index](phase-05-combat.md) · [QA-LOG index](../QA-LOG.md) · [phase doc](../prd/phase-05-combat.md)

## Session 6 — the spend ceiling was raised, and by whom

**The $40 ceiling was raised to $45 by the user on 2026-08-11, mid-session, with the number named
explicitly.** Recorded here because a ceiling that moves without a record is not a ceiling.

The sequence matters. At **$36.60** spent, all four re-shoots of that round still failed G6, and the
margins diagnosed the cause as **off-centre positioning rather than excessive motion** — `left 188 /
right 0`, `left 160 / right 0`, `left 154 / right 0`, each of which has roughly 90 px a side if
centred. `HOLD_CENTRED` was written against that diagnosis at $0 and remained unproven.

The options put to the user were: spend the last $3.40 on two clips, spend $1.19 on one,
spend nothing and hand off, or raise the ceiling. **The user chose to raise it, and was asked to name
a figure rather than leave it open** — because the ceiling is a hard STOP agreed before any spend,
and Phase 4's **$6.39 overrun against a $25 ceiling** is the reason this phase had one at all. An
elastic ceiling is the Phase 4 failure with extra steps.

**$45**, chosen for 4–5 clips of measured need plus 2–3 for a second round if `HOLD_CENTRED` only
partly works.

> ⚠️ **[prd/phase-05-combat.md](../prd/phase-05-combat.md) §1b still reads *"This phase's ceiling is
> $40, and it is a hard STOP."* That line is now stale.** It is **not** edited here: `docs/prd/` is
> outside this session's scope lock, and silently rewriting a phase's stated constraint from a
> session that spent against it is exactly the move that makes a ceiling meaningless. Flagged for the
> next session to correct deliberately, with this entry as the authority for who changed it and why.

### What the money established, so the next session does not re-buy it

| lever | verdict |
|---|---|
| **Ratio-matching** | **PROVEN.** Reframing cut 7 of 7 measured clips; matching removes it. The guard now measures anchor-vs-output ratio rather than banning the string `9:16`, which for the courier's 0.558 anchor is the *matched* value. |
| **Padding** | **PROVEN for framing, and it costs the scale.** It fixes the crop and shrinks the subject in frame, so a per-slug `scale` (vault A5) cannot serve a padded and an unpadded generation of one subject. The padded courier `attack` packed at 114 px against `hurt`'s 288 px. |
| **`DEBRIS_MARGIN`** | **WORKED.** `brass-sentry/death` went from `left 2 / right 0` to `left 226 / right 200`, its wreck compact rather than frame-spanning, **and it still ends broken rather than intact** — the anti-`SPAN_CLIP` sentence doing its job. |
| **`DISCHARGE_MARGIN`** | **BACKFIRED.** Satisfied by the model very largely **not firing** — `fire-r4` returned a thin wisp of smoke and no flash. A constraint describing a SHAPE, met by not performing the action. The second instance of that failure after `SPAN_CLIP`, and the reason `DEBRIS_MARGIN` carries an explicit "this governs the scatter, not the destruction" sentence. |
| **`HOLD_CENTRED`** | **UNPROVEN at the time of writing.** Authored at $0 against a measured diagnosis; the batch testing it is the one the raised ceiling paid for. |

---

## Session 7 — 2026-08-12. Four decisions, and the measurements behind them

Plan: `C:\Users\royko\.claude\plans\resume-phase-5-combat-vectorized-hanrahan.md`. Its Codex plan
review — the **seventh** for this phase — returned **BLOCK, 4 blockers, 3 major, 1 minor**; the two
decisive blockers were re-verified locally and **CONFIRMED**, and all eight were applied. Appended to
[reviews/phase-05-plan.md](../reviews/phase-05-plan.md).

**Verified baseline before any change**, taken from the JSON reporter rather than a summary line:

```
suites passed 255  failed 0  total 255
tests  passed 847  failed 0  total 847
```

### D1 — the global cell goes 288×384 → 384×384. Decision M3 stays intact.

**Taken by the user, 2026-08-12, after being shown every measurement rather than one.** Session 6
asked with a single data point (`walk` needs 296) and got an answer — 320×384 — that the next
measurement invalidated. The full set, at the scavenger's scale `0.56074766`:

| sheet | width required | fits 288? | fits 320? | fits 384? |
|---|---:|---|---|---|
| `rust-scavenger/chase` | 288 | ✅ | ✅ | ✅ |
| `rust-scavenger/walk` | **296** | ❌ | ✅ | ✅ |
| `rust-scavenger/death` | **358** | ❌ | ❌ | ✅ |
| every `brass-courier/*` | 288 | ✅ | ✅ | ✅ |
| every `brass-sentry/*` | 288 | ✅ | ✅ | ✅ |

**A collapsed scavenger lying flat is genuinely wider than it is tall** — that is why `death` is the
outlier and why it was not predictable from `walk`. 384 covers it with **26 px spare**.

**The cost was stated before the choice, not after:** 288 → 384 is a **~33 % atlas area increase**
against the **~11 %** that was agreed in session 6. That is a materially different decision, so it went
back to the user rather than being rounded up quietly. The alternatives offered were a **per-slug cell**
(smallest atlas, but amends M3 so one subject gets special treatment) and **320 with
`rust-scavenger/death` shelved** (cheapest, but discards paid art that already passes G6).

> **Why one global cell is worth 33 %.** M3 exists so that no subject silently gets its own geometry.
> The turret's wasted area is a recorded, measurable number; a per-slug cell is an invisible
> divergence that every consumer must then carry.

### D2 — `scale` becomes declarable per `(slug, action)`

**Taken by the user, 2026-08-12.** The courier's framing was already solved on disk and what remained
was a number in a config file.

`brass-courier-attack-r3.mp4` is padded, **passed G6 cleanly**, and packed — and drew **114 px against
`hurt`'s 288 px**. The arithmetic, so nobody re-derives it:

```
courier slug scale      0.23723229   derived from an UNPADDED idle,
                                     figure fills 1214 px of 1280
padded round            figure fills  ~480 px of 960
480 x 0.23723229      = 114 px drawn                (hurt, unpadded: 288 px)
```

**Padding is a property of a GENERATION, and so is the scale it implies.** A per-slug scale cannot
serve a padded and an unpadded generation of one subject. The declared per-action scale is **pasted by
hand with provenance and never computed by the build** — which is what vault A5 actually protects.

**This reverses a decision session 6 took, and the reversal is legitimate for a stated reason.**
Session 6 chose to re-shoot the courier unpadded, keeping one scale per slug. That was correct *given
its premise* — that per-slug scale could not serve both. **D2 removes the premise.** And the
alternative it chose has since been measured and failed: **three containment clauses were tried and
`brass-courier/attack`'s margins never moved off `L188 R0`** (`/death`: `L172 R0`). The $4.76 spent
since is what established that the prompt lever is exhausted for this subject.

> **What this costs, stated plainly.** The one-scale rule in `upsertLiftProfile` now binds only
> **slug-sourced** entries. That is a **narrowing**, not a strengthening, and the Codex review caught
> an earlier draft of the plan describing it as "strictly stronger". Three genuinely new checks are
> added alongside it — every entry must carry a finite scale and a known source, and a **cross-slug
> merge now throws where it was silently accepted** — but the narrowing is real, deliberate, and is
> this decision.

### D3 — the ceiling goes $45 → $55

**Taken by the user, 2026-08-12, figure named explicitly on request.** Recorded in full, with the
whole chain from $40, at [prd/phase-05-combat.md §1b](../prd/phase-05-combat.md) — which was also
corrected this session, since it still read "$40, and it is a hard STOP".

The user was asked with the honest framing that **nothing in the remaining QA gate needs money**: the
gate, the file splits and the Codex review are all $0, and the only remaining art problem with an
unattempted fix is `brass-sentry/fire`'s missing muzzle flash. Spend at the time: **$41.36**.

### D4 — config and gate first, at $0; art last

**Taken by the user, 2026-08-12.** Art bought after the gate is art the gate has not reviewed. The
Codex review then sharpened this into a hard rule rather than a preference: the implementation review
(criterion 5.14) runs on the final diff, so **any art spend afterwards invalidates it**. Art work is
therefore **explicitly post-phase** — either a future session with its own gate, or a knowing re-run of
5.14 and the full verification.

### What the money has already established — do not re-buy any of it

| lever | verdict |
|---|---|
| **Ratio-matching** | **PROVEN.** Reframing cut 7 of 7 measured clips. The guard now compares anchor ratio against submitted ratio rather than banning the string `9:16` — which, for the courier's **1536 × 2752 = 0.558** anchor, is the *matched* value and not the defect |
| **Padding** | **PROVEN for framing, and it costs the scale.** That cost is what D2 pays |
| **`DEBRIS_MARGIN`** | **WORKED**, single-variable: `brass-sentry/death` `L2 → L226`, wreck compact, **and it still ends broken**. Its "this governs the SCATTER, not the destruction" sentence is load-bearing |
| **`DISCHARGE_MARGIN`** | **BACKFIRED** — satisfied by the model very largely **not firing**. Second instance of the `SPAN_CLIP` failure: a constraint describing a SHAPE, met by not performing the action |
| **`HOLD_CENTRED`** | **Withdrawn as UNATTRIBUTABLE, not disproven.** 1 win, 1 loss, 2 no-change over four clips. **The endpoint has no `seed` input**, so four samples cannot separate a clause from run-to-run variance. Kept in `motionClauses.mjs`, applied nowhere. **Do not re-apply it** |

### A correction the Codex review forced to the repository record

**Every handoff since session 4 has described `rust-scavenger/walk` as blocked on cell width and
`chase` as blocked on its stride, as if these were different problems.** They are not.
`character-bounds-rust-scavenger.json:22` reads:

```
"stridePxPerCycle": { "walk": null, "chase": null },
```

**Both are null.** `walk` hits the pack blocker first, so no session ever reached its catalog blocker.
This is the **fourth** time in this phase that *"extraction stops at the first failure"* has hidden a
second defect behind the first — after the G6/`idle` false positive hiding the real `jump` crop, the
per-action sweep finding `brass-courier/hurt` already clean, and `--derive-scale`'s hardcoded
`findSource('idle')` deadlocking on a subject with no idle by design.

**The generalisable rule, since it now has four instances:** when a pipeline stops at the first
failure, a clean verdict on stage N is evidence about stage N **only**. Any statement of the form
"X is blocked on Y" is provisional until X has actually reached the end.

### A render risk that was checked and cleared, not assumed

Widening the cell moves a Sprite's `displayOriginX` from 144 to 192, because the constructor runs
`setSizeToFrame` → `setOriginFromFrame`. That would shift every drawn figure by 48 px **if any renderer
used a horizontal origin other than the frame centre**.

**Checked: none does.** `enemyView.ts:113`, `enemyView.ts:129`, `playerView.ts:112` and
`GymScene.ts:127` all use **originX 0.5** — which is exactly where `packStrip` centres the figure's
centroid (`sheets.mjs:353-354`). Vertically `frameHeight` is unchanged and `baselineY = frameHeight`,
so an `originY` of 1 still lands on the contact line. **The repack is render-safe, and this is why.**

### 🔴 D1 is AMENDED, and the reason is that the number it was decided on was wrong

**D1 as first recorded above — one global 384×384 cell — was taken on a figure that does not survive
measurement.** It was applied, went green, and was then withdrawn the same session. The record is kept
rather than rewritten, because the mistake is the lesson.

**`rust-scavenger/death` does not need 358 px. It needs 510.** A full per-frame sweep, using the same
`figureMetrics` the packer uses:

```
f0 170  f1 179  f2 243  f3 236  f4 358  f5 505  f6 507  f7 510  f8 508  f9 508
                        ^^^^^^                          ^^^^^^
                    the recorded figure               the actual maximum
```

**358 is frame 4.** `packStrip` throws on the FIRST clipped frame, so at the 288 cell it reported
frame 4's requirement and **frames 5–9 were never evaluated**. HANDOFF §12b recorded that number as
though it were the maximum, and a user decision was taken on it.

> **Fifth instance of one pattern, and the first that cost a decision.** *"Extraction stops at the
> first failure"* has now hidden a second defect behind the first five times in this phase: G6's
> `idle` false positive hid the real `jump` crop · the per-action sweep found `brass-courier/hurt`
> already clean · `--derive-scale`'s hardcoded `findSource('idle')` deadlocked on a subject with no
> idle by design · `rust-scavenger/walk`'s null stride sat behind its pack failure · and now this.
>
> **The rule, now that it has five instances:** when a pipeline stops at the first failure, a verdict
> about stage N is evidence about stage N **only**. Any statement of the form *"X is blocked on Y"* is
> provisional until X has actually reached the end. **Prefer instruments that sweep and report a
> maximum over instruments that stop and report an instance** — which is exactly what was done to
> `packStrip` below.

### The instrument was fixed, not just the number

`packStrip` now **sweeps every frame on both axes** and reports the true maximum, naming every clipped
frame and which is widest. Horizontal (`sheets.mjs:378`) and vertical (`:399`) both had the defect;
both are fixed.

**The verdict is unchanged — any clipped frame still fails the build.** What changed is what the gate
*measures*, never what it tolerates: it now reports complete information instead of the first
instance. Watched go red *(C1)* against a committed fixture, and the revert verified **by count**
*(C12)*: the single-frame-throw literal went 1 → 0 on both axes with content confirmed changed.
New test: `tests/unit/sheet-packing-clip-report.test.ts`.

### D1-revised — the cell is PER SLUG. Decision M3 is amended.

**Taken by the user, 2026-08-12, on the complete sweep.**

| slug | cell | why |
|---|---|---|
| `brass-courier` | **288 × 384** | every courier sheet fits 288 — pays nothing |
| `brass-sentry` | **288 × 384** | every sentry sheet fits 288 — pays nothing |
| `rust-scavenger` | **512 × 384** | `death` frame 7 requires **510**; `walk` 296; `chase` 273 |

**This required no code change.** `frameWidth` was already per-slug data in
`character-bounds-<slug>.json`, already per-row in `index.json`, and `src/render/gymGeometry.ts` and
`gymBounds.ts` already read it per row. **M3 was a policy, not a structural constraint** — a fact
nobody had checked, and which made the amendment far cheaper than the options put to the user in the
first round implied. *(That first round's option C was described as "the packer, catalog and every
consumer must carry a per-slug cell". That was wrong.)*

**What M3 actually protects is that special-casing be VISIBLE.** It is satisfied here by recording, in
the open and with the measurement, that one subject's cell differs and exactly why. Each bounds file's
`_frame` note now states its own slug's number; none still claims to be "the ONE global cell size".

**Why not the alternatives:**

- **512 global** was rejected as **+78 % atlas area** over the 288 baseline, against the ~33 % that had
  just been approved and the ~11 % before that — and it argues against itself: criterion **5.11 is
  already uncomfortable** at median 55.70 ms ≈ 18 fps, is **unrun**, and the project carries a recorded
  34.5 MB parallax-per-boot debt that already pins Playwright to `workers: 1`. Inflating every atlas by
  78 % for one animation's debris, immediately before a performance criterion is assessed, is a finding
  waiting to happen.
- **320 global, death deferred** was the runner-up and remains the fallback if per-slug ever proves
  troublesome.

### 🔴 And `rust-scavenger/death` STILL does not ship — for a sixth-instance reason

**The 512 cell is correct and `packStrip` now succeeds on death for the first time. A different gate
then throws:**

```
assets:build: "death" cell 5 of 12 is 36x9 against a median height of 229
  — that is a fragment, not a frame. Same cause as an empty cell, caught one step earlier.
```

`detectFrames` segments the extraction by content, not by even division, and finds **12** islands where
the clip has 10 real frames: indices **5 and 7 are 64 × 16 debris flecks**, detected as separate frames.
**This was masked the entire time by the clipping throw that fired first** — the sixth instance of the
pattern, surfaced by fixing the fifth.

> ⚠️ **Note for anyone measuring this clip:** an even `width / height` split gives 10 frames and is the
> WRONG splitter. `detectFrames` gives 12. Both readings appear in this session's working notes; the
> 510 px width figure is unaffected, because it comes from the real collapse frames either way.

**Not fixed here, and deliberately so.** Fixing it means tuning `minGap` / segmentation, which is a
gate change with its own both-directions revalidation, in a session already carrying the cell change,
the per-action scale and the guard redesign. **It is also plausibly the wrong fix:** the figure goes
**169 px drawn at f0 to 476 px at f7**, which is debris scatter, not anatomy. `DEBRIS_MARGIN` is proven
single-variable on `brass-sentry/death` (`L2 → L226`, wreck compact, still ends broken) and **was never
applied to the scavenger**. The likely correct answer is art, and art is post-phase this session.

**`rust-scavenger/death` is therefore DEFERRED with its paid clip kept on disk**, and the 512 cell
stands ready for it. `rust-scavenger/chase` is also deferred — its stride is genuinely
**INDETERMINATE**, swept at band heights 16/24/32 px with every sweep showing one peak and one trough
across the 12-frame sheet instead of two: the same trailing-leg-airborne failure vault 4.18 names for
the courier's `run`. **No stride was guessed.** A guessed stride is the specific failure
`catalogTimings.mjs` exists to prevent.

### What DID ship from this work

**`rust-scavenger/walk` — the first scavenger sheet in the catalog.** Packs at 512, gates PASS/PASS,
stride **312 game px** measured by the courier's own documented foot-band method (24 px band, spans
`121,153,156,134,98,66,61,62,69,127,46,45`, peak 156 doubled), re-confirmed unchanged after the cell
moved from 384 to 512 — which it must be, since the cell change is pure padding.

⚠️ **The scavenger's slug scale `0.56074766` came from a GAIT, not a neutral pose** — spread 4.2 %
against the sentry's 0.3 %. Recorded in its config. **Re-derive it if `walk` is ever re-shot.**

### A latent single-slug assumption the amendment exposed

`tests/unit/asset-catalog.test.ts` globbed **only** the courier's bounds file and checked **every**
catalog row — enemy rows included — against it. That held only while all three slugs happened to share
one width. **Same class as R1/R2 and the `shipped-sheets.test.ts` path bug: correct by coincidence,
silent when the coincidence ends.**

**Scoping the loop to courier rows would have made it pass by checking LESS**, which is the forbidden
move — enemy rows would have stopped being checked at all. It now resolves each row against **its own
slug's** bounds, which catches everything the old form caught **plus** a row disagreeing with the file
that actually cut it. An unresolvable row is an explicit failure, not a skip. Watched go red *(C1)* by
setting `rust-scavenger-walk`'s row to 288 against its slug's 512 —
`AssertionError: rust-scavenger-walk frameWidth vs rust-scavenger: expected 288 to be 512` — restored
from a fresh temp copy, revert verified **by count** *(C12)*.

**Verified after all of the above**, from the JSON reporter:

```
suites 258/258  failed 0
tests  853/853  failed 0
typecheck clean · build + verify-dist ok
```

---
