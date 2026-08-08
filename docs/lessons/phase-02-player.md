# Vault-in — Phase 2 — Player controller (grey-box) + Character Playground

Phase 2's slice of [LESSONS-APPLIED.md](../LESSONS-APPLIED.md) §D. The root rule, §A, §B and §C
live there and bind every phase.

**Also binding on this phase:** every §C rule, plus **A6** (knob-sweep verification). Read them in
the hub — they are defined once, there.

### Phase 2 — Player controller (grey-box) + Character Playground

- [x] **2.1** **Every duration is an integer count of 60 Hz ticks; every distance is pixels.** Never a
  float of seconds, never a `deltaTime` multiplication inside the sim. **One `delta` multiply
  reintroduces every problem the rule removes.** *(`Architecture/Timing is integer ticks, never wall-clock seconds.md`, blocker)*
  → **Phase 2:** `src/sim/` takes no delta and reads no clock; the only ms->tick conversion is `src/game/frameClock.ts`, outside the sim. Verified by the sim-boundary scan and by `frame-clock.test.ts` proving 30/60/75/144/240 Hz agree to within one tick over a minute.

- [x] **2.2** **Number the steps inside `tick()` and declare the numbering authoritative.** A step
  order is invisible in a diff and broken by refactors that read as tidying.
  *(`Architecture/The tick step order is the contract, not an implementation detail.md`, blocker)*
  → **Phase 2:** `src/sim/tick.ts` header, 14 numbered steps, declared authoritative. Step 4 is RESERVED for Phase 5 combat before it has any content, so combat inserts without renumbering.

- [x] **2.3** **Seed your own RNG** (xorshift32 or similar), sample once per tick inside the fixed
  loop, and **gate every roll on `chance > 0`** — a zero-probability roll still advances the shared
  stream. *(`Architecture/Determinism means no clock and no RNG you did not seed.md`, blocker)*
  → **Phase 2:** `src/sim/rng.ts` xorshift32, seed 0 rejected; the stream advances in exactly one place — step 1 of `tick()` — and `rollChance` reads that sample. Mutation M13 (make a roll pull from the stream) turns `rng.test.ts` red. **The `chance > 0` gate itself is untested (M9 survives) and is recorded as such in QA-LOG.md.**

- [x] **2.4** **The input snapshot handed to a multi-tick batch must be a mutable working copy**, and
  the batch must consume from it. Reusing one snapshot **replays a jump/attack press twice**; clearing
  the latch on "a tick ran" **drops it entirely**. Both are real.
  *(`Architecture/One input snapshot reused across a multi-tick batch replays the press.md`, costly;
  `A tick ran is not your input was consumed.md`, blocker)*
  → **Phase 2:** Both failures reproduced as tests before the fix: REPLAY (one press, one jump across a 12-tick batch) and DROP (a press latched during a frame that drained zero ticks). Mutations M5 and M6 turn each red.

- [x] **2.5** **Never reconstruct an *edge* from a frame-to-frame state comparison** — a whole 15-tick
  action can start and finish inside one render frame. Emit per-tick booleans OR-accumulated into a
  per-advance array. Persistent state (grounded / not grounded) is still safe to sample.
  *(`Architecture/A render frame can drain many sim ticks, so a state comparison is not an event.md`, blocker)*
  → **Phase 2:** `TickEvents` emitted per tick and OR-accumulated into `AdvanceEvents` by `advance()`. Held state is polled, edges are latched from the keyboard EVENT — `JustDown` was rejected as a consuming read.

- [x] **2.6** **Give every state exactly one door.** If entering a state requires bookkeeping (clearing
  a hit-window id, resetting coyote-time), make the entrance singular. A comment asking callers to
  remember is not enforcement. *(`Architecture/Give every state exactly one door.md`, costly)*
  → **Phase 2:** `enterState()` is the single entrance; `resolveState()` derives the state from facts rather than assigning it from six places. Trivial now on purpose, because Phase 5 adds three states that each need entry bookkeeping.

- [x] **2.7** **A test for a temporal invariant must span the time the invariant is about.** Ten tests
  covered "fires at most once per window"; deleting every latch left **all ten green**, because a
  one-tick fixture cannot distinguish "at most once" from "every time". **Directly binds coyote time,
  jump buffering, i-frames, cooldowns.** *(`Testing/A one-tick fixture cannot observe a per-window latch.md`)*
  → **Phase 2:** Every window fixture spans `2N + 2`. Mutations M1 and M2 — the two guards that make the windows exactly N — each turn `coyote-time.test.ts` red.

- [x] **2.8** **Derive a test's expected value from the live knob, and bracket it with a floor *and* a
  ceiling.** Literal expectations encode the tuning state at the moment of writing; a floor alone
  passes an implementation that fires on every eligible trial.
  *(`Testing/Derive a threshold from the live knob, and give it a ceiling.md`)*
  → **Phase 2:** No literal expectations. Both endpoints of both windows come from the live knob; the run bracket is `runMax * elapsed` on both sides.

- [x] **2.9** **A per-tick probability is not a behaviour.** Re-rolling a movement decision every tick
  gave a **1.8-tick expected run** against an 83 ms animation frame — and Phaser **restarts a looping
  animation on every state change**, so an 8-frame walk cycle **never left frame 0**. Commit decisions
  to an *episode*. **One counter plus one flag — two counters admit the unrepresentable state.**
  *(`Game Feel & Balance/A probability per tick is not a behaviour.md`, blocker)*
  → **Phase 2:** **N/A this phase** — no per-tick probability exists yet. `rollChance` is built and gated so Phase 5 inherits the rule rather than the bug.

- [x] **2.10** **Collision boxes authored in local space**, one stated convention (`+x` forward,
  `+y` up from the feet), one `toWorld`. Mirroring becomes a sign flip.
  *(`Architecture/All collision boxes are local to the fighter.md`, costly)*
  → **Phase 2:** `LocalBox` with `+x` forward and `+y` up from the feet; exactly one `toWorld()`. Mirroring is a sign flip, tested including the symmetric case.

- [x] **2.11** **Scale art and collision geometry in one place**; make `scale` a **required constructor
  argument** so a forgetful call site is a typecheck error. Validate `scale > 0`. **Do NOT scale
  velocities** — that is a balance change disguised as a rendering setting.
  *(`Architecture/Scale art and collision geometry in one place.md`, costly)*
  → **Phase 2:** `scale` is a required field of `CreateWorldOptions`, validated `> 0` and non-finite-rejecting, duplicated at the render seam. A 1x and a 2x world are asserted to reach identical velocities.

- [x] **2.12** **Pull render *decisions* out of scenes into engine-free modules.** Rule: *"if a scene
  rule has an edge case, that's the move — not a browser test."* Last project extracted eleven.
  *(`Architecture/Render-layer logic gets tested by being moved out of the scene.md`, costly)*
  → **Phase 2:** `src/render/playerView.ts` and `src/game/frameClock.ts` are both engine-free extractions. The second came from adversarial review brief 2, which found the backlog-drop branch untestable inside a scene method — the vault rule applied verbatim.

- [x] **2.13** Playground knob-sweep verification — see **A6**.
  → **Phase 2:** See A6 — and see the criterion 2.8 entry in QA-LOG.md, where playing it showed the sweep was green while four knobs were invisible.

- [x] **2.14** **Use the engine's *discrete* integrator to compute a jump apex.** A review caught a
  **7.4 px error** from using `v²/2g` where the game runs semi-implicit Euler.
  *(`Art & Audio Pipeline/An art gate self-tests on fixtures before it judges.md`)*
  → **Phase 2:** Apex measured at 150.3 px against a predicted 150.30 px. `v^2/2g` gives 142.22 — **8.08 px wrong**, against a ±2 px tolerance. The gap is itself asserted to exceed the tolerance, so retuning cannot make the check vacuous.

