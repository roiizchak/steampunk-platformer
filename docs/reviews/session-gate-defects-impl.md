[← reviews index](./) · [QA log](../qa/session-gate-defects.md)

# Codex implementation review — the four-gate-defects session


---

## Codex implementation review — 2 BLOCKER, 3 MAJOR, 1 MINOR

Session `01a00e61-c274-7452-8cc4-ddc269712508`. Ran **last**, after all four gate owners, per the
protocol. File-evidence only; every finding was re-verified locally before acting.

Full review: [../reviews/session-gate-defects-impl.md](../reviews/session-gate-defects-impl.md).

### 🔴 BLOCKER 1 — `MAX_MS_PER_SIM_TICK` missed a whole band, and the docstring understated it

**Verified locally against the real `drainTicks` arithmetic**, and Codex was exactly right:

| uniform frame cost | ticks/frame | **ms per tick** | frames per 180 ticks |
|---|---|---|---|
| 20 ms | 1.20 | **16.69** | 151 |
| 40 ms | 2.39 | **16.70** | 76 |
| 49 ms | 2.94 | **16.69** | 62 |
| 80 ms | 4.79 | **16.70** | 38 |
| 110 ms | 5.00 | **22.00** | 36 |

A **20–49 ms per-frame regression is invisible to ms-per-tick AND stays above `MIN_SAMPLES`**. The
ratios divide it out because it lands in both arms. So it passed *every* assertion in 5.11.

My docstring admitted a blind spot but placed it above 83 ms; **it starts at 0**. It also called
20 ms "an effective 50 Hz", which is false under this clock. Both corrected.

**Fixed** by adding `MAX_FLEET_WORK_MS` = 8 — the fleet arm's median frame work in milliseconds, the
one assertion that is neither a ratio nor a function of the tick clock. Clean 0.50–0.60 ms, so 13×
margin. **Red-proved at 42.80 ms** with a uniform 40 ms/frame stall, which reached this assertion —
meaning every earlier bound passed it, exactly as Codex predicted.

### 🔴 BLOCKER 2 — criterion 7.7 is REPORTED FAILING, not green-but-weak

Codex is right and I was wrong to label it and move on. CLAUDE.md: *"A phase with a failing or unrun
criterion is reported failing."* 7.7's frame-loss half cannot distinguish its own proving mutation
(1.0943) from a clean run (1.0961). A gate that cannot discriminate is **unrun**, whatever colour the
suite prints.

**Status: criterion 7.7's frame-budget half is FAILING.** The assertion stays in place at 1.15 so it
still catches a gross collapse, `MAX_AUDIO_WORK_DELTA_MS` remains load-bearing, and the constant's
docstring says so — but this is recorded as a failing criterion, not a passing one, and the handoff
leads with it.

Codex also found a methodological cause worth carrying forward: **every pair samples `on` then `off`,
never `off` then `on`**, in 7.7 *and* 6.9. Warm-up and directional drift are therefore attributed to
the treatment arm rather than counterbalanced. Balanced AB/BA ordering is the first thing the
follow-up session should try.

### MAJOR 3 — the landing assertion was a proxy, not the landing

`hurt`, `attack`, `death` and a respawn all satisfy "first later state that is neither `jump` nor
`fall`" — combat states bypass the grounded-derived movement state. **Fixed:** the sampler now reads
the sim's own `grounded` flag and the spec asserts a real `!grounded → grounded` transition.

### MAJOR 4 — 6.9's resolution floor is bracketed, not measured — NOT FIXED

Codex is right that the scrim sweep establishes only that **1 layer is invisible and 5 are visible**.
It does not establish where between them the gate starts resolving, so "2.0 loses nothing" is
weaker than stated: a stable 1.25–2.0 regression is now accepted.

**Not fixed.** The 2- and 3-layer measurements were attempted and the run was interrupted; rather
than report a number I do not have, this is recorded as open. Combined with the unbalanced pair
ordering above, 6.9's GPU half needs the same follow-up session as 7.7.

### MAJOR 5 — the citation gate still false-greened, two ways

Both verified in a REPL before fixing:

- `'lines=4100'.includes('lines=410')` → **true**. A 4100-line citation exempted a 410-line file.
- `'src/scenes/Example.tsx'.includes('src/scenes/Example.ts')` → **true**. A `.tsx` citation exempted
  the `.ts` beside it.

A gate written to stop one substring coincidence had introduced two more. **Fixed:** the record is
now parsed (`SIZE-EXEMPTION: <path> lines=N`) with exact path and numeric comparison. Two more
committed fixtures cover both holes.

### MINOR 6 — stale comments the session's own account got wrong

All fixed: `prevPlayer` said "read only by `renderPlayer`" (inlined, and the 4.23 sampler now reads
it); `gamePlayerDraw.ts` said the scene keeps a one-line method (it does not); `phase-06-perf.spec.ts`
said its delta was bounded at 2 ms (it is 1 ms).

### Confirmed by Codex

- Importing `interpolatedPosition` and `renderAlpha` into 4.23 is **appropriate** — the unit suite
  supplies independent hand-computed arithmetic, and the e2e verifies the scene supplies and applies
  the live inputs.
- `perfSampler` captures `ticks` at the same stop condition as `frames` and `elapsedMs`.
- **No behaviour change or weakened DEV guard in the `GameScene` split** — setup order preserved,
  render order preserved, moved helpers retain their internal DEV checks.

### Files that crossed 400 lines again while fixing this

`phase-05-perf.spec.ts` reached 412 when the new bound landed. Split, not shaved: the `[5.11]` report
builder → `perfReport.ts`, and the GPU-renderer assertion → `realGpu.ts`, the latter **deduplicating
three copies** across the Phase 5, 6 and 7 perf specs. That is the fourth time this session's ratchet
caught its own author.
