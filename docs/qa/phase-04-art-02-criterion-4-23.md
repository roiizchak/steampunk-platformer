[← Phase 4 QA log index](phase-04-art.md) · [QA-LOG index](../QA-LOG.md) · [phase doc](../prd/phase-04-art.md)

---

## 2026-08-17 — criterion 4.23 was RED on `main`, and the renderer was never wrong

Recorded here rather than only in the session notes because **4.23 is a Phase 4 criterion and it
regressed after Phase 4 closed**. Phase 8 authors levels against the character's feet, so this had to
be settled before Phase 8 began.

### The reading that was wrong

The Phase 7 session recorded the failure as *environmental*, because it began after an `npm ci`. The
handoff then challenged that: the installed tree matched the lockfile exactly, so the current tree
was the canonical one and the earlier greens were the suspect runs. **Both readings were wrong.** The
tree was never the variable. The spec was.

### What was measured, in the running game, before the test was touched

Driven with `playwright-cli` against `npm run dev` — the hands-on read the plan required *first*,
precisely so a test would not be edited to fit a diagnosis.

| window | measurement |
|---|---|
| standing still, 240 rAF frames | worst `\|drawnBottom − simY\|` = **exactly 0** |
| screenshot at the feet | `docs/evidence/4-23-feet-standing-2026-08-17.png` — boots on the brass cap |
| run + jump + land, 600 rAF frames / 150 ticks, sampled continuously | worst gap among `simVy === 0` = **22.18104000003086 px** |
| the same sample, predicted `(1 − alpha) · \|dy\|` | **22.18104000003090 px** |
| `simVy === 0` samples where the sim had actually moved the player | **4 of 313** |
| worst gap where `prevY === simY` | **0**, over 313 samples |

Fourteen significant figures. The gap is render interpolation, exactly and only.

### The mechanism

`src/sim/player.ts` resolves a landing by setting `player.y` to the surface **and** `player.vy` to 0
**in the same tick**. `src/sim/advanceSplit.ts` snapshots `prevPlayer` immediately *before* that tick,
and `GameScene` hands that snapshot to `interpolatedPosition`. So on the landing tick a sample reads
`vy === 0` with `prev.y ≠ cur.y`, and the sprite is legitimately mid-blend between them.

The spec filtered on `simVy === 0` and asserted the gap was **exactly 0**, with the message
*"interpolation cannot excuse this"*. It can. The offending sample was `prevY` 1895.7 → `simY` 1920,
`dy` 24.3, `alpha` 0.0872.

**Timing-dependent, which is why it read as a flake.** Whether a sampled rAF lands on the landing
tick with `alpha < 1` varies run to run — and it is why the two recorded failures differed (14.7501
vs 14.7015) and why an earlier run in the same session passed. Nothing to do with `node_modules`.

**The second assertion was broken too**, and by the same mistake: it bounded divergence by *this*
frame's `|vy| + gravity`, when the travel being blended is the tick's. Worst excess over that bound
in the same window was **+21.506 px**. It had simply never been reached, because the exact claim
failed first.

### What replaces them

Both claims now derive from `prevY` — `GameScene.prevPlayer.y`, the value interpolation blends
*from*, sampled in the same rAF callback as the drawn and sim values. Read through `__phaserGame`,
the idiom `phase-05-perf.spec.ts` already uses; **the eight-field `window.__game` surface is
untouched**, so no STOP-and-ask.

1. **Exact, where `prevY === simY`.** The sim did not move the player across the blended tick, so
   interpolation is the identity for any alpha and the drawn bottom must equal the sim feet y to the
   bit. No tolerance, no velocity, no filter a landing can fool.
2. **Contained in `[prevY, simY]`, for every sample.** `lerp` with alpha in `[0, 1]` cannot leave the
   segment. Strictly stronger than the `|vy| + gravity` bound it replaces — it is `|dy|` with no
   slack — and it covers takeoff, flight and landing in one expression.

### 🔴 The red proof caught a bug in the fix, which is the whole reason for the rule

The first containment formula was `|drawn − simY| − |simY − prevY|`, and the `alpha * 1.5` overshoot
mutation **passed it green**. A drawing that overshoots *past* `simY` is still close to `simY`; the
claim being made was containment, so distance-from-one-endpoint was the wrong quantity. Rewritten to
true containment against `[min, max]`, the same mutation reports **11.34 px outside the segment**.

**Had the assertion been trusted without watching it fail, 4.23 would have gone green while blind to
the defect class it names** *(vault C1, C2)*.

`EPS` is `1e-9` — float slack, not tolerance. One ulp at these coordinates (~2000 px) is ~2.3e-13, so
it is thousands of ulps of headroom and fourteen orders of magnitude below the 22.18 px being caught.

### Verdict

**4.23 PASSES.** The renderer, the feet origin and the anchor were correct throughout; two assertions
in the spec were not. No tolerance was widened — both replacements are tighter than what they
replaced.
