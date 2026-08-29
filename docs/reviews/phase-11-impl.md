# Codex implementation review — Phase 11 (Welcome screen + volume repair)

**Model** `gpt-5.6-sol`, high reasoning effort, read-only sandbox.
**Skill** `claudex-loop:codex-review` — the owner-authorised substitution for `/codex:rescue`, as in
Phase 10. The plan half is [phase-11-plan.md](phase-11-plan.md).

⚠️ **Codex's sandboxed shell cannot spawn processes on this machine** (`CreateProcessAsUserW failed:
5`). Every prompt in this file told it to use the `node_repl` MCP tool with `fs.readFileSync`, which
restores file *reading* and not command *execution* — so every finding below is file evidence, and
every one was re-verified locally before it was applied. Codex says so itself in the last two rounds:
*"I did not rerun the supplied verification."*

This phase got **two** implementation reviews, because the owner changed the design after the first
had already converged.

---

## Review A — the first build, before the redesign

Run against the branch diff after the QA gate's agent owners. Converged to `VERDICT: APPROVED` over
**5 rounds** (REVISE ×4).

⚠️ **Its transcript was not captured to a file at the time, and this section is a reconstruction.**
That is a gap in the record, not in the work: every finding is cited individually, in place, in the
code it changed — `grep -rn "Codex implementation review" src/ tests/` lists them. The ones with the
longest reach:

- **round 2, finding 3** — `title-attach.test.ts`'s fake modelled only `isActive`, which is exactly
  the blind spot the code had: a PAUSED or SLEEPING title is still there and `isActive` says false
  for both. Detecting them and re-pausing `Game` was itself only a half-fix, because a paused title
  takes no input and a sleeping one draws nothing — either way the player is stranded.
- **round 2, finding 4** — a source-text gate that reads comments is satisfied by commented-out code.
  `stripComments` exists for that, and **round 3, finding 4** extended it to trailing `//`, which had
  let `void 0; // make(...)` satisfy every line assertion while the screen drew nothing.
- **round 3, finding 2** — the `[stop Title, resume Game, pause Game]` interleaving in `gameTitle.ts`,
  recorded as knowingly undefended *(C11)*. It no longer exists; see Review B, round 2.
- **round 3, finding 4** — a source-text gate could only prove the scene *calls* something named
  `audioHint`; an implementation ignoring both arguments would have passed. `audioHint` moved to the
  engine-free module so the test could drive it.
- **round 4, finding 3** — `GymScene` extends `Phaser.Scene` directly and publishes nothing to the
  debug surface, so a leaked `G` left both of that spec's assertions true while the gym ran
  underneath. Each dev key's scene is now named and asserted absent.
- **finding 6**, twice in different rounds — nothing deleted the DOM listener's SHUTDOWN cleanup and
  then restarted `Game`; and asserting only that the menu opened would pass with `Game` still
  running under it.

---

## Review B — the redesign

**Subject** `git diff 166cef1..HEAD` over `src/` and `tests/` — the owner's 2026-08-29 redesign
(parallax backdrop, one way in through the level menu) plus the two harness repairs it forced.
**Thread** `01a04c20-c861-7e60-b265-de9619217240`
**Rounds** 5 — `REVISE` ×4, then `VERDICT: APPROVED`.
**Findings** 4 + 3 + 2 + 1 material, every one applied.

### Round 1 — 4 findings

1. **HIGH — the drift was per FRAME under a `PER_TICK` name.** `TitleScene.update` incremented
   `drift` once per rendered frame, so the backdrop moved four times faster on this 240 Hz box than
   on the owner's 60 Hz screen, and crawled under SwiftShader's ~18 fps. *Applied:* the delta now
   goes through `frameClock.drainTicks`, the same seam `GameScene` uses, remainder carried. New
   source-text gate, watched red by reverting to the per-frame add.
2. **HIGH — the harness bypass left a real hole.** `dismissTitle` skips the screen through
   `__phaserGame`, so no spec walked title → menu → level; `LevelSelectScene.play()` could start
   `level-01` unconditionally and every saved-level spec would still pass, because none of them
   reaches the menu, and production would pass too, because it runs a fresh profile where the
   furthest unlocked level *is* level-01. *Applied:* a new spec walks the whole route with two levels
   completed, so the saved and highlighted levels differ. Watched red with exactly that mutation —
   1 failed / 10 passed, and only that test failed.
3. **MEDIUM — the contrast sweep's geometry premise was unguarded.** Every ratio in it is measured
   against the panel; nothing checked that the rows land on the panel. Shrinking it to 0.30 would
   drop the heading onto the raw backdrop and leave the unit sweep, both pixel bounds and all 183 e2e
   specs green. *Applied:* `TITLE_ROWS` moved into `titleInk.ts`; every ink's glyph box is asserted
   inside the band. Watched red at 0.30 — *"title overflows the top of the panel: expected 331.2 to
   be >= 378"*.
4. **MEDIUM — the double-dismiss gate could not go red.** It fired `L` and `ENTER`, and `L` stopped
   dismissing anything when the menu became the only way in. *Applied, and it went further than the
   finding:* fixing the keys was not enough — deleting the `dismissed` latch left the test green
   either way, because the dangerous sequence needed `onPlay` and `onPlay` is gone. The latch is kept
   as ungated defence, said plainly in its own docstring and recorded in the QA log; the test keeps
   only the end-state claim it can prove. Codex's round-2 reply agreed: *"Keeping the `dismissed`
   latch as an explicitly ungated idempotence defense is reasonable. The binding rule forbids
   presenting a test that cannot redden as a gate; it does not require deleting every cheap
   defensive guard."*

### Round 2 — 3 findings

1. **MEDIUM — the drift gate did not pin the remainder carry.** `this.accumulatorMs = 0` would pass
   every assertion while stopping the backdrop dead on any display whose per-frame delta never
   reaches a whole tick — which is every frame at 240 Hz. And `init` reset `drift` but not the
   accumulator, so a restart inherited the previous run's fractional phase. *Applied,* both, and
   watched red.
2. **MEDIUM — the route test read the cursor, not the drawn selection.** `paint()` could put the `>`
   marker on a different row and the test would agree with itself and pass. *Applied:* it now filters
   rows by the drawn marker and asserts exactly one carries it. Watched red by marking `cursor + 1`
   — it failed on *"the menu opened on a LOCKED row"*, the marker landing past the last unlocked row.
3. **LOW — three comments still described the removed route**, including `TitleScene`'s header
   argument for why level select could *not* be on ENTER. The trap it names is real;
   `LevelSelectScene.bindKeys()` closes it on its own side, which is why ENTER can be the single
   door. Corrected rather than deleted.

### Round 3 — 2 findings

1. **Material — the draw-path gate stopped before the draw sink.** Deleting `renderParallax`,
   replacing `panelSize`'s result with a literal, or changing `rows[index]` to `rows[0]` each left
   the new gates green — *"precisely the defects the tests claim to gate."* *Applied:* all three
   anchored, each watched red with the named mutation.
2. **Low — four residual comments**, including a false claim in `prodTitle.ts` that the static band
   kept the parallax drift out of the sample. It does not: the band is 82 % alpha and the layers show
   through. The twelve-decimal stability is now recorded as observed and unexplained, with the note
   that the bound is a ratio between two screens and is watched red rather than argued.

### Round 4 — 1 finding

**Material — the vacuity note was itself wrong.** Applying round 3 surfaced that a negative assertion
had reached the file as `/rows = [s*0[.]/`, its backslashes eaten in transit, and it was written up
as having matched nothing. Codex: *"In JavaScript, that character class includes a literal `[`, so it
matches `rows = [` and would catch the exact inlined-array mutation. It is overbroad — it also
matches `rows = 0` and identifiers beginning with `s` — but it was not vacuous."* Correct, and
re-verified. *Applied:* the note says overbroad.

### Round 5 — APPROVED

> No material findings. The corrected note accurately describes the old regex as overbroad, and
> in-memory replay confirms all three draw-path mutations now fail their intended assertions. No
> binding-rule regressions surfaced.
>
> `VERDICT: APPROVED`
