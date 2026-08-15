# Phase 5 — combat, enemies and hazards

Index entry in [QA-LOG.md](../QA-LOG.md). Findings from the gate's agent owners land here;
`docs/reviews/` stays Codex-only.

---

## Phase 5 — the gate, criterion by criterion

**Written 2026-08-15, when the phase was marked done.** Everything below it in this file is the
working journal that produced these verdicts, across ten sessions; this section is the summary the
journal never had, and it is what `docs-contract.test.ts` reads.

**It adjudicates nothing new.** Every row points at where the verdict was actually reached — a gate
section in this log, a test file, or a Codex review. Where a verdict changed across sessions, the row
carries the **last** one and says so. A row here is still a claim a human wrote *(C11)*; the
adversarial briefs and the Codex implementation review are what test that.

| # | Verdict | Where it was decided |
|---|---|---|
| 5.1 | **PASS** | `qa-expert` brief 1; re-verified in § *§6 gate — run 2026-08-12 (session 7)*. Negative + positive control through the real `tick()`; radius tunability measured as shots fired, not a readout. |
| 5.2 | **PASS — but not by the test that claims to** | The named test sweeps only `patrolSpeed`; the criterion is met by `enemy-tuning.test.ts:93-109`, which sweeps `chaseSpeed` on the live field. Codex C4 called this risk and it is half-real: the knob is honest, the test's title is not. Confirmed unchanged in session 10. |
| 5.3 | **PASS, mutation-measured** | `code-reviewer` brief 1: single-threshold → **36 state changes**, correct → **0**. ⚠️ Carries finding **R1** — 5.3's own flap test cannot go red, recorded not fixed. |
| 5.4 | **PASS** | § *`play`-owned criteria — 5.4 and 5.8, run 2026-08-12*. Hand-driven in a live browser against real art for the first time; **12 distinct frame indices** observed. |
| 5.4b | **PASS** | § *THE FROZEN COMBAT TIMINGS*, recorded **2026-08-09, before any Phase 5 generation**. The ordering is the criterion. |
| 5.4c | **PASS** | First measurement that was ever runnable (session 7). Its structural hole became **G1** in session 10 — `rust-scavenger/attack` had no window at all — found, fixed by recentring the **sim** window on the drawn strike, and red-proved. |
| 5.4d | **PASS** | fps derived, never authored. Three mirrors that pinned nothing became **G2**; all three now locked in `catalog-timings.test.ts`. |
| 5.4e | **PASS** | Two `request_id`s recorded as lost were recovered from `~/.genmedia/gallery/` at **$0**. Structural hole closed: G5 runs over the shipped bytes on every `npm test`. |
| 5.5 | **PASS** | Both active-window endpoints pinned by name, `combat.test.ts:92-114`. **G4** later found nothing walked `attackIsLive` per tick; fixed with a full 36-tick walk plus a damage-once assertion. |
| 5.6 | **PASS** | Fixture runs `IFRAME_TICKS * 2` = 90 ticks against a 45-tick window; both endpoints pinned and the length asserted. |
| 5.7 | **PASS** | Session 7 — *and it had never actually been run by its own owner before then*. |
| 5.8 | **PASS, with a caveat** | § *5.8 — health bar legible…*. A live scavenger driven to **2/60 hp**, camera zoom 1, true sprite size, against `level-01`'s cool wall. Judged by eye at 3× magnification — a downscaled view cannot settle a legibility question. |
| 5.9 | **PASS** | `enemyTuning.ts:43-59` writes the live entity's own field, so the stale-readout failure mode is structurally excluded, not merely untested. ⚠️ **R6**: `attackRange` and `attackCooldown` have no Gym knob — a recorded scope gap. |
| 5.10 | **PASS** | Session 7 proved the **ratio**, not a kill. The caveat is closed: the real-swing kill test added in session 10 is filed under 5.16. |
| 5.11 | **PASS — on the fourth build of the measurement** | § *Criterion 5.11 — rebuilt*. Every earlier number measured something else: SwiftShader not a GPU, a fleet drawn **0 of 20** on screen, rAF *interval* not rAF *work*. **G5** (worst case not connected to `MAX_LEVEL_ENEMIES`) and **G6** (would pass with an invisible fleet) both fixed and red-proved. Final: **11× the enemies costs ~1.1× the frame work**, bound 4×. |
| 5.12 | **PASS, by written justification** | The rule permits a file over the limit *with a written justification in this log*; § *the EIGHT files over 400 lines, each with its reason* is that justification, plus a ratchet in `file-size.test.ts`. Ceiling raised 7 → 8 and recorded as a loosening, not edited quietly. ⚠️ **R2, R3, R8** — the ceiling is a count not a set, the globs have blind spots, and A7 is structurally compromised for this criterion. All recorded. |
| 5.13 | **PASS** | [reviews/phase-05-plan.md](../reviews/phase-05-plan.md). |
| 5.14 | **PASS** | [reviews/phase-05-impl.md](../reviews/phase-05-impl.md), signed off 2026-08-13. Note the ordering rule it carries: 5.14 runs on the final diff, so **art spend afterwards invalidates it**. |
| 5.15 | **PASS** | Kill plane pins the **crossing tick**; the tunnelling fixture derives the band from the real trajectory and asserts both halves — no tick sampled inside, damage landed anyway. |
| 5.16 | **PASS for the scavenger; recorded vacuous for the sentry** | **G3** found the damage clause vacuous — the fixture's geometry was unreachable *even alive* — and it was rewritten to arm a dead scavenger mid-strike on top of the player, with a live control that must take damage. **R7** records that the clause remains unfalsifiable for the sentry, which never had a contact-damage mechanic. |

**Full sweep at close** *(see § Full sweep at the end of this log)*: `typecheck` clean · **1146 unit
tests pass** · `test:sim-isolated` 1146 pass with Phaser uninstalled · `build` + `verify-dist` ok ·
**e2e 49 passed** · port 5173 clear *(C13)*.

**Carried out of this phase:** findings **R1–R8** are recorded-not-fixed with reasons, and Phase 4's
open debt (4.2b, 4.16, 4.27) is not closed by this phase. Both belong to whoever plans Phase 6.

---

## The journal, split into parts

**This log reached 3167 lines.** On 2026-08-15 the working journal below the summary above was
split into nine sibling files, oldest first. The summary and the vault-out stayed here, because
`docs-contract.test.ts` slices this file between the summary heading and the vault-out heading
and reads the criterion rows out of that slice.

**The parts are flat siblings in `docs/qa/`, never a subdirectory.**
`tests/unit/file-size.test.ts` globs `docs/qa/*.md` non-recursively, and four source files over
400 lines are recorded only inside these parts.

| Part | What is in it |
|---|---|
| [01 — frozen timings and sessions 3–4](phase-05-combat-01-timings.md) | the frozen combat timings (5.4b), the enemy animation scope, art findings, known limitations, the session-3 gate, session 4's framing mechanism |
| [02 — sessions 6 and 7](phase-05-combat-02-sessions-06-07.md) | the raised spend ceiling, session 7's four decisions and the amendments the Codex review forced |
| [03 — the session-7 gate](phase-05-combat-03-gate-07.md) | the 2026-08-12 gate run, 5.11 and 5.12, the hands-on 5.4 and 5.8, and the playtest that found three defects |
| [04 — session 8](phase-05-combat-04-session-08.md) | the four corrections to the inherited brief, P1 closed, the P4 frame-budget diagnosis, Phase 4 debt run |
| [05 — the session-8 gate](phase-05-combat-05-gate-08.md) | the 2026-08-13 gate run, the real-GPU playtest, 5.11 re-measured on a quiet machine, the user video playtest |
| [06 — session 10, first half](phase-05-combat-06-session-10a.md) | permanent aggro, `chaseSpeed` 8 → 6, level-01 traversal proved by simulation, the catalog staleness gate |
| [07 — session 10, second half](phase-05-combat-07-session-10b.md) | respawn, the player death sheet, the sentry that shrank when it fired, five juddering one-shots, 5.11 rebuilt as a ratio |
| [08 — the session-10 gate](phase-05-combat-08-gate-10.md) | the gate run, the GPU timer, 5.4c closed, and the 5.12 file-size table |
| [09 — session 11](phase-05-combat-09-session-11.md) | the locomotion retune that was measured and not applied, the session-11 gate, the airborne-window reversal |

---

## Vault-out — Phase 5

**Status: DRAFT, written 2026-08-14 (session 10), extended 2026-08-15 (session 11). Phase 5 is still
FAILING and this is not a phase-exit sign-off.** PRD §7 asks for a vault-out at phase exit; leaving
it as the words *"(Written at the end of the phase.)"* through five sessions meant every lesson below
was carried in a transcript instead of a file, and two of them had to be rediscovered by measurement.
Written as it is learned, and to be finalised when the gate actually passes.

> Sections **1–7** are session 10's. Sections **8–12** are session 11's, and section 3 carries a
> correction from it.

### 1. Episode-committed AI vs the frame-0 problem — and the stronger answer

The vault note says a per-tick decision is not a behaviour, because Phaser restarts a looping
animation on every state change and a flapping AI is the frame-0 bug arriving through the AI. Phase 5
implemented the textbook answer: **hysteresis** (a larger radius to leave than to enter) plus a
**commitment floor** (a chase lasts at least N ticks whatever happens).

Both worked. Both are now deleted, and what replaced them is worth the note:

> **A state with no exit cannot flap.** When the user made aggro permanent, hysteresis and the
> commitment floor became unreachable machinery, and the flap test — which asserts the drawn state
> does not oscillate — **passed unchanged**.

The lesson is not "permanent aggro is better". It is that the flap test survived a total rewrite of
the mechanism it was written against, because it asserted the **property** and not the
implementation. The two tests written against the mechanism (`releaseRadius > detectRadius`, and the
commitment floor) both had to be deleted. Gate on the observable.

### 2. The enemy tuning values that felt fair

| knob | value | how it was arrived at |
|---|---|---|
| `detectRadius` | 480 | authored, never contested in play |
| `chaseSpeed` | **6.0** | **not a taste — `18 / 3`, forced by the foot-plant invariant** |
| `patrolSpeed` | 2.5 | authored |
| `deadZone` | 96 (one tile) | fixes the off-axis sprite strobe (gate finding S1) |
| `SCAVENGER.damage` | 15 | authored |
| `KNOCKBACK_SPEED` | 17.5 | **tuned in px of TRAVEL (64 px ≈ half a body), not px/tick** |

Two of those six stopped being free numbers during the phase, and that is the finding:

- **`chaseSpeed` is a quotient, not a preference.** Planted feet require
  `ticksPerFrame × speed === footPxPerFrame` with a whole `ticksPerFrame`, so the only speeds that
  exist for a 12-frame sheet with 18 px of foot travel are **18, 9, 6 and 4.5**. The decided value
  (3/4 of the player's run = 6.75) was **not reachable**. Locomotion speed is a property of the art
  now, and a design decision that names a speed has to be checked against the sheet before it is
  agreed to.
- **`KNOCKBACK_SPEED` had to be re-expressed in the unit a human can judge.** At 5.54 px/tick it
  produced **9.7 px** of travel against a 132 px body — invisible, and reported as *"the knockback is
  not working, the animation got stuck"*. Every gate on it passed, because they all measured that
  knockback **happened**. Tune an impulse by the distance it moves something, never by its velocity.

### 3. What the frame budget actually was — **UNKNOWN, and that is the finding**

The vault has nothing on performance and this phase did not fix that.

- **No baseline exists.** Criterion 5.11 has never produced a number anyone should trust.
- **The measurement was measuring the wrong thing twice over.** `playwright.config.ts` has no
  `launchOptions`, so every figure came from headless SwiftShader — **90.10 ms headless against
  4.2 ms on the real GPU, a 21× difference**. And the sampler measured rAF *interval*, not work.
- **The worst case was never on screen.** `DEV_FLEET_OFFSET_X = 200 × RENDER_SCALE 6` = 1200 px
  against a 960 px visible half-width: **0 of 20 fleet enemies were in view**, and the fleet is
  scavengers-only — no sentries, no projectiles.
- **Rectangles are cheaper than Sprites**, so the grey-box fallback defect made the frame budget look
  *better*. Vault 9.4 exactly: a measurement that is cheap because it is not really being done.

**Carry forward:** absolute milliseconds from a headless browser are not evidence. Only a
same-session interleaved A/B decides anything, and a performance gate needs a recorded baseline
before it can be a gate at all.

> ✅ **Session 11 correction — the GPU half is no longer unknown, and the reason it stayed unknown
> was FALSE.** Two places recorded the blind spot as unclosable: `phase-05-perf.spec.ts` said a GPU
> timer query *"is not reachable from here"*, and finding P1 said *"not reachable without a new
> dependency"*. **A GPU timer is a WebGL extension**, available from the page itself, with no package
> involved and the frozen-dependency rule untouched. It was built in an afternoon.
>
> **A blind spot recorded with a WRONG reason is worse than one recorded with no reason**, because
> the wrong reason is precisely what stops the next person looking. Both wordings were corrected in
> place rather than merely superseded.
>
> Two further corrections came out of building it, and both were only findable by probing:
> the extension is `EXT_disjoint_timer_query` (**WebGL 1** — Phaser 4 runs WebGL 1, so the
> `_webgl2` name the plan specified cannot exist here), and Phaser 4's `WebGLRenderer` **is** the
> event emitter rather than having a `.events` property. Two plan-stated facts, both wrong, both
> cheap to find and expensive to assume.

### 4. Two defects that look identical on screen, and only one of them is timing

The most expensive lesson of the phase, because it cost two rounds of fixing the wrong half.

The user reported the scavenger as *"not smooth"*. There were **two** independent causes:

1. **Foot-slide** — the body advancing further per drawn frame than the art moves the planted foot.
   Fixed by re-timing the sheet and the speed together.
2. **Tick-stepping** — the drawn position updated only on simulation ticks, so on a 240 Hz display
   three frames out of four are identical and the fourth jumps.

Fixing (1) did not fix the complaint, because (2) was still there. Worse, **fixing (2) for the player
in session 9 made (1)+(2) more visible on the enemy**, since the character standing next to it had
become smooth. The user's own words named the comparison — *"not smooth **like my character**"* — and
that phrasing was the diagnostic.

**Carry forward:** when a smoothness complaint survives a timing fix, ask what else is drawn near the
subject and whether it is drawn the same way.

### 5. A correct, well-tested decision function with an unchecked consumer

`interpolate.ts` was engine-free, thoroughly unit-tested, and called from exactly one place. Nothing
asked *who calls it*, so the enemies never got it — and no unit test could see that, because the
missing call is in a Phaser scene.

This is vault 5.3 one step out. Two definitions of a concept is where the bug lives; **one definition
with an incomplete set of consumers is the same bug wearing a better hat.** The gate that catches it
has to be at the level where the wiring is real: deleting `GameScene`'s snapshot call left **every
unit test green** and only the e2e went red.

### 6. Level geometry needs a horizontal reach gate, not just a vertical one

`level-01` shipped a spike strip that was **impassable at any speed** from Phase 4's rescale until
session 10 — four sessions, two of them playtested. The suite had a reach gate; it asked whether
every platform was within the measured jump apex. It could not see a gap too wide to *cross*.

The related finding: a recorded playtest bug (*"wedges against terrain at x 3198, 100 → 35 hp"*) sat
undiagnosed for two sessions and turned out to be **the player's collision box against a pillar they
were meant to jump** — `3198 + 66 = 3264`, exactly the pillar's face. A traversal test found it by
accident within an hour of existing.

**Carry forward:** simulate the level. Hand arithmetic against a tick order with a jump-cut divisor,
a coyote window and per-tick friction was wrong on **both** inputs when the Codex review checked it.

### 7. The generated-art pipeline's own lessons

- **Anchor padding scales a subject; it cannot scale an effect.** Two paid single-variable
  experiments established it. A muzzle flash and a debris plume exist *to leave the frame*, and no
  amount of margin contains them — the framing gate has to learn the difference, or the clip is
  accepted with a written exception naming the file and the edges.
- **Version the sidecars, not just the download.** `submit-clips.mjs` versioned `-rN` on the `.mp4`
  and overwrote `.params.json`, so a re-render destroyed the provenance of the round already paid
  for. Two shipped clips carry self-contradicting params because of it.
- **The generation gallery is a recoverable source of truth.** Two `request_id`s recorded as
  permanently lost were both in `~/.genmedia/gallery/sessions/<id>/data.json`, with the download path.
  Cost to close criterion 5.4e: **$0**. Check the tool's own records before declaring provenance lost.
- **Measure before spending.** It saved money in sessions 4, 5 and 10; the only round that skipped it
  bought two clips that failed the same gate the first pair did.

### 8. A gate that has never run against the bytes that ship is not a gate

Three separate instances of one shape, all found in session 11, all of which had been green for
sessions:

- **G5 had never once been run against a shipped sheet.** The harness existed, the decode path
  existed, and `sheet-gates.test.ts` already ran `runSheetGates` in-process on a shipped PNG — for
  `brass-sentry/idle`, which has **no attack window**, so G5 reported `N/A` and the file looked
  covered. Nobody had written the one line naming a slug that does. When it was finally run, it
  passed — **and revealed the sheet passes only because of a tie-break**: frames 4, 5 and 6 all tie
  at 293 px of reach, and only the first lands inside the active window. Frames 5 and 6 would both
  fail. A verdict-only assertion could never have seen that; assert the *peak frame and tick*, not
  the pass.
- **`gateLoopWrap` was silently not running** on the scavenger's `idle`. Its absence was visible only
  as a line of build output that was not printed. A gate that skips quietly is indistinguishable from
  a gate that passes.
- **The shipped `brass-courier/fall` sheet had never passed G6 either.** `build-clips.mjs` writes the
  strip and gates it *afterwards*, so a failing extraction leaves a usable file on disk that
  `assets:build` packs without complaint. Confirmed rather than guessed: regenerating the old strip
  reproduced the shipped `fall.png` byte for byte.

**Carry forward:** for every gate, ask *"has this ever run against what ships?"* — separately from
*"does this gate work?"*. And **write-then-gate is a defect pattern**, not a style: any tool that
emits an artefact before validating it has already put a bad artefact where something else will find
it.

### 9. Keep the exception machinery when the exception list empties

`BLOCKED_ON_ART` and `PENDING_ART` both hold *"the thing we know is wrong and are waiting on"*, and
both are asserted in **both directions**: the gate skips these rows AND asserts the list equals the
set that actually fails. So a fixed entry left behind is red, and a broken row with nothing listed is
red too.

Both emptied in session 11. Both were kept as files rather than inlined as `[]` at their two call
sites — and the reasoning was tested almost immediately: **`PENDING_ART` was emptied one commit
before the scavenger's attack needed it, and was in use again within the hour.**

The load-bearing part is that emptying a list this way makes the gate **strictly stronger**:
`uneven === Object.keys(BLOCKED_ON_ART)` went from *"exactly one row may be uneven"* to *"no row may
be uneven at all"*, with no assertion rewritten. **Inlining `[]` twice is where that property dies.**

### 10. A player's report is a symptom. It is reliable about the symptom and not about the cause.

Two session-11 reports, both worth acting on, neither describing what was actually wrong:

- *"The scavenger does not have an attack animation."* **It was not a bug — it was the spec.** The
  creature was scoped as a chaser whose body is the hazard, and criterion 5.16 still called it
  *contact damage*. But the instinct behind the report was exactly right: **a thing that hurts you
  with no windup reads as unfinished**, because there is no telegraph and the hit feels arbitrary.
  Buying the swing was correct; "fixing a bug" would have been the wrong frame.
- *"Slow everything down about 10%."* Right that it was too fast; **10% is not a value the speed can
  take** (see section 11), and the reachable step breaks the level.

**Carry forward:** take the symptom literally and the diagnosis not at all. Then say plainly which
one you acted on.

### 11. Locomotion speed is quantised, and the LEVEL is the real ceiling

The most transferable number this phase produced.

Planted feet require `ticksPerFrame × speed === footPxPerFrame` with a **whole** `ticksPerFrame`, so
run speed is `18 / n` and the only values that exist are **18, 9, 6, 4.5**. Any request phrased as a
percentage must be checked against that set *before* it is agreed to — session 10 and session 11 both
agreed to one first and discovered it second.

And the harder constraint is not the art at all:

> **`level-01` tolerates a 13% slowdown and no more.** Measured by sweeping `runMax` over the real
> shipped `.tmj` with the real `tick`: 7.80 clears the 288 px pit at x 3840, **7.70 falls in.** It is
> a cliff, not a slope. Anything past it is a **level edit**, which is a different decision with a
> different owner.

The reachable step (33%) is four times past that ceiling, so it was built, measured, refuted by
`level-traversal.test.ts` within one run, and reverted. **The traversal gate paid for itself here** —
a vertical-apex gate cannot see a gap too wide to cross, and the failure would otherwise have arrived
as an unplayable level in a playtest.

### 12. A sweep that fails at its own control is reporting on the harness

The speed sweep above first reported **every** row failing — including the shipped 9.0, which
demonstrably works. The probe released the jump button one tick after pressing it, and
`jumpCutDivisor: 3` chopped every jump to a third of its height. The real harness holds
`input.jumpHeld = true` for the whole attempt and says so in a comment.

Nothing about the *subject* was wrong. **The known-good control row is what caught it**, and without
one the sweep would have "proved" that the game is already unplayable.

**Carry forward:** every sweep, mutation loop and A/B includes a row whose answer is already known.
It costs one line and it is the only thing standing between a broken harness and a confident wrong
conclusion. This is the same rule as *(C1)* — watch the gate fail — pointed at the measuring
instrument instead of the gate.

---
