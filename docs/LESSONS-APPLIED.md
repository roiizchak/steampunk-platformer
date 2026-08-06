# LESSONS-APPLIED.md

Vault-in for the Steampunk Platformer. Source: `gamedev-vault-curator` read-only query against
`C:\Claude\Game development valut`, 2026-08-04 (Gate 2 of Phase 0). 133 notes read — 116 Evidence,
16 Background, 4 Meta. Nothing was written to the vault.

**These are hard requirements on the PRD, not suggestions.** Every phase must address each item
scoped to it: mark it `[x] applied` with evidence, or `[–] N/A` with a one-line reason. An unaddressed
item fails that phase's QA gate.

Citations are vault note paths, relative to the vault root. Severity is the vault's own tag:
**blocker** / **costly** / (untagged).

**The root rule everything hangs off:**

> **Measure the claim against the thing it claims about.**
> — `10 - Evidence/Testing/Measure the claim against the thing it claims about.md` (blocker)
> Every defect it lists shipped through a fully green suite, because the tests only ever compared
> code to other code.

---

## §A — Contradicts or complicates a locked decision

Highest priority. Our rule is that the vault outranks tutorials and our own assumptions.

| ID | Item | Resolve by | Source |
|---|---|---|---|
| **A1** ✅ **RESOLVED — Gate 3** | **PowerShell vs. the `genmedia` CLI.** The vault's rule cost a credit: drive a `.cmd` CLI from a shell, never from a subprocess API — `cmd.exe` quoting mangles multi-line `--prompt` and **the job silently succeeds at the wrong aspect ratio**. **Verified at Gate 3: DOES NOT APPLY to this invocation path.** A multi-line string containing newlines, double and single quotes, `$dollar`, `` `backtick ``, `--flag`, `/slash`, `100%` and `&` round-tripped **byte-intact** through PowerShell 7 → `genmedia.exe`, confirmed by the CLI echoing its parsed `query` back as JSON (a $0 test — `genmedia models` echoes its input). **Reason it differs:** the vault's hazard is about `.cmd`/`.bat` shims routed through `cmd.exe`, and about Python `subprocess`. `genmedia` here is a **native 122 MB Go `.exe`**, and PowerShell 7 passes arguments to native executables directly with no `cmd.exe` round-trip. **Still binding:** the underlying rule — *the failure mode to fear is not a crash, it is a successful run with dropped arguments* — so Phase 4 must still read returned pixel dimensions off the job record (see 4.11) rather than trusting the request went through as written. | done | `10 - Evidence/Art & Audio Pipeline/Drive a .cmd CLI from a shell, never from a subprocess API.md` (costly); `10 - Evidence/Deployment & Tooling/Resolving an npm CLI on Windows needs PATHEXT first and a shell for .cmd.md` (costly) |
| **A2** ⚠️ **PARTIALLY RESOLVED — Gate 3** | **The prompting evidence is from a different service.** Method transfers; facts are Higgsfield-era. **Verified at Gate 3 from endpoint schemas ($0):** (a) **No endpoint exposes a transparent-background parameter** — `openai/gpt-image-2` offers only `output_format` jpeg/png/webp, and the routed pipeline pairs generation with `fal-ai/bria/background/remove`, which is itself evidence that generators are not expected to emit alpha. The vault's "no model emits alpha" finding therefore **provisionally holds on fal.ai**, and the chroma-key apparatus (4.13) stays in the plan. (b) **STILL UNVERIFIED — must be measured, not assumed:** whether the returned PNGs carry a real alpha channel. ~~**Measure it on the Gate 5 style-probe images at zero extra cost**~~ — ⛔ **no longer free.** That measurement was taken on `nano-banana-2` (result: `mode=RGB`, alpha genuinely absent) and the Gate 7 model swap invalidated it. It must be re-taken on a **paid** `nano-banana-pro` generation — [STYLE.md](STYLE.md) §7 gate 0.2, $0.15. Read the alpha channel directly — never test `mode == "RGBA"` (4.12). (c) Aspect-label accuracy, thin-band inflation and cost-preflight accuracy remain unverified; all three need a real generation to test. | Gate 5 | `20 - Background/Engine-agnostic/Generative art pipelines are a supply chain, not a tool.md` |
| **A2b** 🔴 **NEW — found at Gate 3** | **The routed default model cannot be seeded, and our STYLE.md contract requires a seed strategy.** `openai/gpt-image-2` — which `model-routing` names first for both text-heavy and premium still work — **has no `seed` parameter at all** (schema: `output_format`, `num_images`, `image_size`, `prompt`, `sync_mode`, `quality`). A locked recipe built on it would be **unreproducible by construction**, contradicting the Phase 0 requirement that every later asset reuse the approved recipe. `fal-ai/nano-banana-2`, `fal-ai/nano-banana-pro` and `fal-ai/flux-2/klein/9b` all **do** expose `seed`. **Second-order trap:** the nano-banana family takes `aspect_ratio`, not explicit dimensions — walking straight into 3.2 / 4.11 (*aspect labels lie*). Only `flux-2/klein/9b` and `gpt-image-2` take `image_size` with explicit `{width, height}`. **The two properties we need most — reproducible seed and exact pixel dimensions — are split across different models.** | Gate 5 | `genmedia schema <id> --json`, 2026-08-04 |
| **A2c** ⛔ **SUPERSEDED at Gate 7 — kept for provenance only.** The project's image model is now **`fal-ai/nano-banana-pro`** ($0.15/image at 1K/2K, **4K at 2×**, `resolution` enum `1K/2K/4K` with no `0.5K`, and **no `4:1` / `1:4` / `8:1` / `1:8` ratios**). The sprite-strip and parallax ratios praised below **are not available on the current model** — an 8-frame strip must be packed in post, not asked for. See [STYLE.md](STYLE.md) §2/§2b. Everything after this sentence describes the retired endpoint: **`fal-ai/nano-banana-2` (Gemini 3.1 Flash Image), $0.08/image flat, seeded.** Verified against fal's own OpenAPI (`genmedia schema <id> --format openapi`), not the compact view: `aspect_ratio` enum = `auto, 21:9, 16:9, 3:2, 4:3, 5:4, 1:1, 4:5, 3:4, 2:3, 9:16, 4:1, 1:4, 8:1, 1:8`; `resolution` enum = `0.5K, 1K, 2K, 4K`; free-integer `seed`; `output_format` png/jpeg/webp. **`fal-ai/nano-banana-2/edit` is identical plus `image_urls`, same $0.08** — so the vault's "change the reference, not the prompt" workflow (4.1) is available at the cheapest tier. **Price is flat per image, not per megapixel**, so 4K costs the same as 0.5K. **Directly useful ratios:** `8:1` / `4:1` for sprite-sheet strips (an 8-frame walk cycle *is* an 8:1 strip of 1:1 cells); `21:9` for parallax layers — the exact ratio that bought +417 px of camera travel in the vault's side-scroller lesson. **Binding constraint: no explicit `{width, height}` exists.** Grid-exactness for the Phase 3 tileset must therefore be achieved **in post** — generate at 2K/4K, read actual returned dimensions off the job record, downscale and slice deterministically. **Run one probe per aspect ratio we intend to use and record measured dimensions in `GENERATION-LOG.md`; those measured numbers are the contract, never the labels.** | Gate 5 locks it | `genmedia schema`, `genmedia pricing`, 2026-08-04 |
| **A3** | **Tiled + Phaser tilemaps — the vault has ZERO coverage.** No note on tilemaps, tileset packing, collision layers, object layers, or tilemap-to-collision agreement. **Phase 3 is unlit territory.** Nearest transferable rules: at least one test must load the shipped `.tmj` (preferably sweep all of them — the defect usually lives in one entry, not the schema); and derive world width from **measured background pixels**, never from a label. | Phase 3 | gap; nearest: `10 - Evidence/Testing/A test built on a hand-authored fixture cannot see a defect in the shipped data.md` (blocker) |
| **A4** | **The Gym writing a saved config is two hazards at once.** (a) A dev save endpoint is an **authorization decision** and must live inside a typecheck program and a test include list — last time a build config was typechecked by nothing right up until it owned exactly this. (b) *"A spec that writes shipped configuration is using live ammunition"*: atomic write plus a restore that survives a Windows file-lock error, or the real registry ships a mutated entity into every later spec. **Our e2e suite touching the Gym can mutate the shipped catalog.** | Phase 4 | `10 - Evidence/Deployment & Tooling/Config files typechecked by nothing became a decision nothing could check.md` (blocker); `90 - Meta/Deliberately unwritten links.md` |
| **A5** | **The Gym deriving anchors/bounds/scale hits a known ordering trap.** If the Gym derives one scale per entity from a single reference frame, regenerating that frame **silently rescales every other animation** and moves every measured active frame. Write the rebuild order down beside the commands; make the build deterministic; **prefer deriving the constant from something that does not get regenerated**. | Phase 4 | `10 - Evidence/Art & Audio Pipeline/Rebuild order matters when one asset derives a constant for all the others.md` (blocker) |
| **A6** | **The Playground needs knob-sweep verification wired in from day one.** *A slider that visibly exists reads as a slider that visibly works.* Change it, run, confirm the output moved. The Playground makes the vault's cheapest experiment free — and it is exactly what nobody does. **✅ Phase 2, and the italicised sentence is the part that bit:** the sweep test was green on all eleven knobs while four of them showed the player nothing at all. Only playing it found that. The Playground now displays eleven derived numbers beside the knobs, and `derived-feel.test.ts` requires every knob to move a DISPLAYED one. | Phase 2 | `10 - Evidence/Testing/Sweep every tuning knob once and confirm the number moves.md` (blocker) |
| **A7** | **Ten QA gates are necessary but demonstrably not sufficient.** A dedicated QA agent returned **8/8 PASS** on a diff an adversarial review then found **three real defects** in. A checklist cannot find a defect nobody thought to list. **Budget both briefs per gate:** one verifying stated criteria, one asking how this could be wrong. Review the diff, not only the plan. Say "read-only" explicitly if the reviewing tool can edit files. | every gate | `10 - Evidence/Process/Run an adversarial review even after QA passes.md` (blocker) |
| **A8** | **Vite: the reflex ESM fix is wrong for the native config loader.** If Vite warns about its config loader, `.ts` — not `.js` — is the extension that works. Adding `.js` silences the warning *and breaks the loader*. **A warning going quiet is not evidence the underlying thing works.** | Phase 1 | `10 - Evidence/Deployment & Tooling/The reflex fix can be wrong and a quiet warning is not evidence.md` (costly) |

---

## §B — Declared gaps: the vault has nothing here

The curator refused to invent content. Treat these as areas where **we generate the lessons**.

- **B1 — Performance.** No note on frame budget, draw calls, batching, texture memory, GC pressure,
  object pooling, or particle cost. **Phase 9 is unlit.** (The `Platform & Performance` theme folder
  is about display scaling, cameras, input and audio — not FPS.)
- **B2 — Tilemaps.** See A3. Phase 3.
- **B3 — Over-built vs under-built retrospection.** Not recorded. Only two deliberate rejections exist:
  a worker-scoped shared page tried for boot cost and **reverted — do not re-buy it**, and one
  deliberate version-hold short of a bundler replacement.
- **B4 — Module size.** The vault does **not** record a module that became unmaintainable by size.
  The recorded structural pressure is different: *logic written into a scene where no unit test can
  reach it.* Our 400-line ceiling is our own rule, from the reference repo — not vault-backed.
- **B5 — Browser-harness mechanics.** `90 - Meta/Deliberately unwritten links.md` records **7–9
  unwritten Evidence notes** on e2e harness mechanics: the pumped clock (a headless browser reports
  itself hidden and pauses the engine loop, so the spec must own the clock); a debug input seam that
  forces a flag every frame is not a rising edge; worker concurrency capped at 4 because every worker
  cold-boots the whole asset set (*"a new spec broke three unrelated ones" is usually contention, not
  a regression*); a wait-until loop must check *before* it steps and must not step in chunks; two ways
  a touch spec goes silently vacuous. **Directly relevant to Phases 1, 2 and 10.**

---

## §C — Standing rules, every phase

- [ ] **C1 — Re-introduce the bug, watch the test go red, restore. Every time.** One phase shipped two
  fake regression tests before a real one; one passed vacuously on `undefined === undefined` through a
  debug hook that returned nothing. Assert `typeof x === "number"` before comparing.
  *(`Testing/A regression test you have not watched fail is decoration.md`, blocker)*
  → **Binds our `window.__game` hook directly.**
- [ ] **C2 — Before trusting a metric, ask what would make it go red.** An audit reported a ratio of
  exactly 1.00 for every state because it computed `art = sim` with the same formula the code used.
  **Every gate needs a committed fixture that fails it.**
  *(`Testing/A metric that cannot fail is decoration.md`, blocker)*
- [ ] **C3 — Write down which new test is a reproduction (red→green) and which is a guard
  (green→green).** If you set out to write a reproduction and it comes back green, **you have not
  found the bug yet.** *(`Testing/Write down which new test is a reproduction and which is a guard.md`)*
- [ ] **C4 — "We have tests" and "someone has played it" are unrelated statements.** Seven defects
  across seven phases a green suite could not see — one at 383 unit + 175 browser tests. Play it, look
  at it, and **record what the player closes**. *(`Process/Only playing it found this.md`, blocker)*
- [ ] **C5 — A skipped QA pass is debt with a known collection date**, and the interest is paid in
  **invalidated measurements**, not bugs. Anything tuned against an unreviewed benchmark must be
  re-*tuned*, not re-checked. *(`Process/The QA pass a phase never had is the one that finds the blocker.md`, blocker)*
- [ ] **C6 — Take a reviewer's symptom as evidence and their cause as a hypothesis.** One recommended
  fix, applied, would have dropped the hardest difficulty 66.7% → 36.0%. Another high-severity finding
  was a flat false positive. *(`Process/Take a reviewer's symptom as evidence and their cause as a hypothesis.md`)*
- [ ] **C7 — Re-derive a finding's blast radius before accepting its framing.** When did this become
  true? What else does it affect? Is it already mitigated by something the reviewer could not see?
  *(`Process/Re-derive a finding's blast radius before accepting its framing.md`)*
- [ ] **C8 — When two plausible fixes disagree, instrument instead of choosing.** Two explanations were
  on the table and **both were wrong**; one state-keyed counter settled it. **The instrument usually
  costs less than the argument.** *(`Process/When two plausible fixes disagree, instrument instead of choosing.md`, blocker)*
- [ ] **C9 — A comment is not enforcement, and a wrong comment is worse than none.** Three instances,
  each carried multiple phases, **each with a real defect behind it**. Correct in place, visibly and
  dated. *(`Testing/A comment describing a mechanism that does not exist turns nothing red.md`;
  `Process/A doc describing a protection the code does not have is worse than no doc.md`, blocker)*
- [ ] **C10 — Invoke the reference material the spec names, and show which facts came from which.**
  A plan citing engine docs without consulting them produced two defects a later review confirmed.
  Every plan gets two sections: *"API notes this design is built on"* and *"what was rejected and why"*.
  **Silence reads as skipping** — if a reference doesn't apply, say so out loud.
  *(`Process/Invoke the tools a spec names, and show which facts came from which.md`)*
  → **This is exactly our Ritual 1.**
- [ ] **C11 — Record what you decided not to fix, with the measurement and the sweep that produced
  it** — and be precise about the claim's strength. A "no parameter can fix this" conclusion was later
  disproved by a review finding a configuration reaching 32.7%.
  *(`Process/Record what you decided not to fix, with the measurement.md`)*
- [ ] **C12 — Confirm a mutation actually applied.** Mixed CRLF/LF made a substitution silently match
  nothing; the suite passed and reported exactly what an uncovered line looks like. **Two mutations
  were wrongly cleared that way.** *(`Testing/A mutation you have not confirmed applied is a false green.md`)*
  → **We already have CRLF warnings in this repo. Live risk.**
- [ ] **C13 — Kill every server you started before reporting done — by port, not image name.** Stale
  watchers **serve stale art after an asset rebuild**, presenting as "the sprite didn't update".
  Launch the dev server's real entry point directly, not via the package script — on Windows the
  script is a shell wrapper and killing the wrapper orphans the real process.
  *(`Deployment & Tooling/Kill every server you started before reporting done.md`)*

---

## §D — Per-phase checklists

### Phase 1 — Boot (Vite + Phaser 4.2.1 + TS + vitest + Playwright)

- [ ] **1.1** `src/sim/` imports **nothing** from Phaser — no `Date.now`, no `Math.random`, no DOM.
  Mechanical test: **can the sim suite run with Phaser uninstalled?** If not, the boundary is
  aspirational. This is what made vitest usable at all last game.
  *(`Architecture/The simulation imports nothing from the engine.md`, blocker)*
- [ ] **1.2** Vite config loader: `.ts` extension, not `.js`. See **A8**.
- [ ] **1.3** **The asset loader must refuse to route past boot if any expected texture is missing** —
  blocking a 404 *and* a corrupt 200. *(`Art & Audio Pipeline/A silent fallback for a missing input is the bug.md`, blocker)*
- [ ] **1.4** Loader has **no timeout by default**; a request that never resolves hangs boot forever.
  Last project measured this and **deliberately did not fix it** — the failure direction is safe.
  Decide consciously and record the decision.
  *(`Process/Re-derive a finding's blast radius before accepting its framing.md`)*
- [ ] **1.5** **Decide pixel-art vs. smooth filtering ONCE and assert it.** Phaser's scale-mode
  constants are reversed from intuition (linear = 0 and default, nearest = 1) — the pinning assertion
  needs a comment. A **CSS pixel-snapping property silently contradicted the engine-side decision on
  every phone** last time. *(`Platform & Performance/Mipmaps exist only for power-of-two textures.md`, costly)*
- [ ] **1.6** **Decide per seam, up front, which side of the build gate it lives on.** Production is a
  real build; dev seams are absent, so you cannot reach for a debug seam to diagnose production.
  → Applies to `window.__game`. *(`Deployment & Tooling/A push to main is a production deploy.md`, blocker)*
- [ ] **1.7** Reset scene state in the **`init` hook, not the constructor**; scene starts are queued.
  Both facts turned into real defects last time. *(`Process/Invoke the tools a spec names…md`)*

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

### Phase 3 — Tiled → Phaser tilemap pipeline
  → **Phase 2:** Apex measured at 150.3 px against a predicted 150.30 px. `v^2/2g` gives 142.22 — **8.08 px wrong**, against a ±2 px tolerance. The gap is itself asserted to exceed the tolerance, so retuning cannot make the check vacuous.

- [ ] **3.1** **At least one test must load the shipped `.tmj` the player will load** — preferably
  sweep all of them. A fixture suite and a registry suite answer different questions and **only one
  can see a data defect**. Last time a roster-wide trim edited shipped JSON and the tests stayed green
  through a controller dealing **zero damage for an entire round**. **The tell: a test green while
  something is visibly broken — check what the test is built from first.**
  *(`Testing/A test built on a hand-authored fixture cannot see a defect in the shipped data.md`, blocker)*
- [ ] **3.2** **Derive world width from measured background pixels, never from an aspect label.**
  `16:9` returned 2752×1536 = 1.7917:1 — against a 1280×720 viewport that left **10 px of scroll
  room**, i.e. no scrolling stage. `21:9` gave +417 px of camera travel. **For a side-scroller this
  is the single most load-bearing asset-pipeline number there is.**
  ⚠️ **The `2752×1536` figure is `nano-banana-2`'s and is now stale** — it is retained because it is
  what proved the *rule*, not because it is our number. `nano-banana-pro`'s returned dimensions are
  unmeasured. **In Phase 3 there is no background art at all**, so Phase 3's world width comes from
  the Tiled map's own `width × tilewidth`, measured off the shipped `.tmj`. This rule binds
  **Phase 4** — when real background art exists, measure it and re-derive.
  *(`Art & Audio Pipeline/Aspect labels lie, read the returned pixel dimensions.md`)*
- [ ] **3.3** **Derive behaviour from data, never from a name.** No `if (type === "spike")`, no
  hardcoded constant copied from one entity's data. **Grep for the numbers, not just the identifier.**
  *(`Architecture/Derive behaviour from data, never from the move's name.md`, blocker)*
- [ ] **3.4** Publish the **exact tile grid cell size** as the Phase 4 art contract (our own rule, from
  the reference-repo atlas lesson). Phase 3 cannot pass until this number is written down.

### Phase 4 — fal art production + Character Gym

**Generation control**

- [ ] **4.1** **The reference image is the lever, not the prompt wording.** A prompt rewrite explicitly
  naming the change moved the overlap score 0.95 → 0.95 — *changing nothing at all*. **Diagnose the
  reference before rewriting the prompt.** *(`…/The reference image is the lever, not the prompt wording.md`)*
- [ ] **4.2** **Reference dominance is steerable if you name what to discard, element by element.**
  A palette allow-list does not forbid a colour — naming it does. A generic "no logos" clause failed
  twice; naming the specific patch worked. *(`…/Reference dominance is steerable, name what to discard.md`)*
- [ ] **4.3** **Never contradict your own prompt — the model resolves a contradiction by maximising.**
  "Soft translucent glow" against a shared "flat colour, hard edges" block cost **12 credits** and
  produced glows that dragged the chroma background into the art. **Shared style blocks are the usual
  source** — directly relevant to our locked STYLE.md recipe. *(`…/Never contradict your own prompt.md`)*
- [ ] **4.4** **Describe the camera, not the percentage.** Four prompts requesting a thinner floor band
  moved nothing; one sentence about camera height fixed it in a single generation. **Heuristic: if the
  model ignores a dimension three times, the prompt is naming the wrong variable.** The model also
  inflates any requested thin band ~3× — generate and mask in post rather than buying retries.
  *(`…/Describe the camera, not the percentage.md`)*
- [ ] **4.5** **Anchor scale to a person, in a sentence the model can act on.** Forbidding figures in
  background art removes the only scale reference — every prop came out **~2× too big**. *"A grown
  adult on this roof is one quarter of the image height."* Percentages are not anchors; a human body
  is. *(`…/Anchor scale to a person or everything comes out twice too big.md`)*
- [ ] **4.6** **Name the height one joint lower than you want, and never name the move.** Asking for
  knee-height gave 61–127 px against an 18–58 target; asking for the **shin** gave 55–126, inside the
  box. "Low sweeping attack" produced chest-height punches for two phases.
  *(`…/The model lands a strike higher than you ask.md`)*
- [ ] **4.7** **The sampling rate is a prompt variable.** One-shot motions finish early and repeat a
  held pose; cyclic motions run too few cycles and 8 samples land at the same phase. **Name the cycle
  count** — "bobs exactly TWICE during the clip" took three frozen-looking idles to 0.35–0.44 first
  try each. *(`…/The forgotten prompt variable is the sampling rate.md`)*
- [ ] **4.8** **Know your noise floor before attributing anything to a prompt edit.** Five generations
  of the *same sheet with the same prompt* measured 50/61/57/55/60 px, **σ ≈ 4.6 px** against an 82 px
  target — run-to-run variance exceeded every effect prompt edits were chasing. When that happens,
  stop editing words and change the reference.
  *(`…/Prefer the prompt that measured best over the one that reads best.md`)*
- [ ] **4.9** **Probe one model on one cue before committing a batch, and budget from the invoice, not
  the estimate.** The CLI's own cost preflight **under-reported by ~6×**. Failed jobs cost nothing;
  completed job records are free to re-fetch. → **This is why Phase 4 splits into 4a/4b.**
  *(`…/Probe one model on one cue before committing a batch.md`)*
- [ ] **4.10** **Measure a new reference against the one it replaces before spending a credit, and
  expect exactly one number to move.** Two numbers moving means you cannot attribute the result.
  *(`…/Measure a new reference against the one it replaces before spending a credit.md`)*

**Generated file → game-ready asset**

- [ ] **4.11** **Read `width`/`height` out of the job record; aspect labels lie.** See **3.2**.
- [ ] **4.12** **Never test `mode == "RGBA"`; read the alpha channel.** No image model checked emitted
  alpha across all 30 job types, and the PNG's colour mode carries no information about it — three
  identical-parameter portraits came back RGBA/RGBA/RGB, all with alpha 255 everywhere. Hit in three
  separate phases. **Re-verify on fal.ai first (see A2)** — if fal emits real alpha, skip the chroma
  apparatus entirely. *(`…/No image model emits alpha, and the PNG's colour mode lies about it.md`)*
- [ ] **4.13** **Key by L1 colour distance with a tolerance, never equality.** Asked for `#FF00FF`,
  you get ~`(252,1,252)`; only **0.004%** of pixels were exactly pure. Working thresholds: a low/high
  pair (40 and 120) plus despill, in **one shared module** so every gate uses the same numbers. Judge
  specks by **connected-component area (min 256 px)**, not `alpha > 0`. **Keep-largest-component is
  safe for held/idle poses and MUST NOT be applied to jump/air/attack states**, where a key's
  anti-aliasing gap legitimately splits off a fist or foot.
  *(`…/The chroma void is never literally pure magenta.md`, blocker)*
- [ ] **4.14** Rebuild-order trap — see **A5**. **Corollary: never rescale one state's frames to fix
  framing; shift the figure with area preserved to the pixel.**
- [ ] **4.15** **Put the frame picks in the tracked generator, and prove it by rebuilding to a
  byte-identical PNG.** Hand-picked frames documented in prose meant the documented regeneration
  command would have rebuilt the known-bad sheet while the docs said in good faith it reproduced the
  good one. *(`…/Prose is not reproducibility, put the frame picks in the generator.md`, blocker)*
- [ ] **4.16** **A declared input that cannot be found must fail loudly, not fall back.** A missing
  start-image override silently substituted the standing idle — **exactly the setup that produced the
  worst art defect in the project**, and the default on any fresh clone because the source-art
  directory is gitignored. **Substitute in the editor; fail in the build.**
  *(`…/A silent fallback for a missing input is the bug.md`, blocker)*
- [ ] **4.17** **Save the exact prompt and job record beside every asset.** Redirect stdout only —
  merging stderr corrupts the JSON record — and write the record only *after* the call succeeds.
  → feeds `GENERATION-LOG.md`. *(`…/Drive a .cmd CLI from a shell, never from a subprocess API.md`)*

**Bounds, anchors, animation — the Gym's actual job**

- [ ] **4.18** **A box is a claim about a sprite, and no test comparing code to code can check it.**
  Method that worked: **difference each frame against frame 0, take the y band of the furthest-forward
  moved pixels.** Three traps inside it: furthest opaque *column* is the wrong metric (a planted leg is
  the widest thing in frame); a sheet the metric cannot call must report **INDETERMINATE**, never a
  guess; the number that matters is the **visible gap**, not skin contact. **Four defects found on the
  first run of a proper audit, on art that had shipped.** *(`…/A box is a claim about a sprite.md`, blocker)*
- [ ] **4.19** **Enumerate the axes your metrics measure, then ask which axis the failure lives on.**
  Every art metric was vertical, so a purely-upward super measured beautifully while nothing on screen
  ever crossed the gap — **an entire unmeasured defect class sitting between two passing gates.**
  *(`…/Every metric here is vertical and direction-blind.md`, blocker)*
- [ ] **4.20** **Silhouette metrics score an extra limb *favourably*.** A crouching heavy shipped with
  a literal **third leg** — passed the sheet gate, passed the box-vs-art audit, scored amplitude 0.93.
  **Enumerate what your metrics cannot see, and cover that class by looking.**
  *(`…/Every art metric is silhouette-shaped, so anatomy is invisible.md`, blocker)*
- [ ] **4.21** **Self-test the gate on synthetic fixtures on every run, before it judges real art** —
  runnable with source art absent. Caught a 4-pixel speck scoring as a whole second figure, before a
  credit was spent. *(`…/An art gate self-tests on fixtures before it judges.md`)*
- [ ] **4.22** **Derive the animation frame rate from the simulation, never author it:**
  `fps = renderFrames * TICK_HZ / simTicks`. Every light attack had 0.43 s of art over a 0.25–0.27 s
  move, so **the strike was never drawn**. Then **align the contact frame with the active window**
  (the strike landed on a wind-up pose on 10 of 18 sheets). Then the tick-offset trap: **the animation
  starts one tick behind the sim** because `play()` runs in the render pass after the entering tick —
  budget the wind-up `startup - 1` ticks. Then **sweep the whole class**.
  *(`…/An animation is a claim about a move.md`, blocker)*
- [ ] **4.23** **A loop flag is a claim that the last frame can follow the first — verify per clip.**
  A held state must not loop if *any* frame leaves the pose, and needs **its own motion floor**: the
  minimum-motion check covered only attack states, so two held sheets shipped at amplitude 0.05/0.06,
  reading as frozen stills with every gate green.
  *(`…/A held state must not loop if any frame leaves the pose.md`)*
- [ ] **4.24** **Look to find, count to decide.** An eyeball pass over ten sampled frames put a defect
  boundary **ten frames off** and produced a confident, impossible remediation plan. And the inverse:
  a portrait slot passed every metric and still left a black band above every head, caught only by
  looking at a three-up composite. *(`…/A contact sheet is not a measurement.md`)*
- [ ] **4.25** **Mipmaps are built only for power-of-two textures**; a heavy downscale of an NPOT
  texture is a raw bilinear squeeze. Fix was a **second smaller bake** as its own texture. **Measure
  the ratio between a texture's size and its drawn size before concluding the source art is bad.**
  The note flags this as a WebGL 1 / older-GPU constraint largely relaxed in WebGL 2 — **re-verify on
  Phaser 4 before acting on it.** *(`Platform & Performance/Mipmaps exist only for power-of-two textures.md`, costly)*
- [ ] **4.26** Gym config-write hazards — see **A4**.
- [ ] **4.27** Atlas packing trade-offs are **Background only, explicitly unmeasured** (`verified: false`).
  *"The numbers that would make this actionable — how much padding, how large an atlas — are exactly
  what is missing."* **Do not cite it as evidence.**
  *(`20 - Background/Engine-agnostic/Sprite atlas packing trade-offs.md`)*

### Phase 5 — Enemies, hazards, combat + Enemy Gym

- [ ] **5.1** Episode-committed AI decisions — see **2.9**. **Direct hazard for enemy patrol AI.**
- [ ] **5.2** **Equal duty cycle is not equal difficulty.** Committing to episodes kept the marginal
  probability identical and moved per-window variance from **4.95 to ~99**. A player fights the
  distribution, not the mean. *(`Game Feel & Balance/Equal duty cycle is not equal difficulty.md`)*
- [ ] **5.3** **Two definitions of one concept is where the bug lives.** When a test or tool needs a
  judgement production already makes, **import it**. A restated predicate drifts — and it drifts in the
  direction that makes your numbers look good. Cost: every strength number in a shipped phase
  (63.2% → 30.1% against a repaired benchmark).
  *(`Architecture/Two definitions of one concept is where the bug lives.md`, blocker)*
- [ ] **5.4** **Whenever a result is "X versus Y", Y needs the same scrutiny as X.** The benchmark
  opponent entered block-stun **0 times across 48 matches while taking 1,169 hits**, and its docstring
  called it "a competent human". **A benchmark harness feels like infrastructure rather than code
  under test.** *(`Testing/The benchmark opponent is half of every measurement.md`, blocker)*
- [ ] **5.5** **When a measurement is exactly 0 or exactly 100%, ask whether the branch ran at all.**
  A fixture seeded 1..20 passed the first probability check every time and never reached the branch
  under test. **0 of 20 reads exactly like a dead feature.**
  *(`Testing/A fixture can switch off the branch it is testing.md`, blocker)*
- [ ] **5.6** **A golden/characterisation hash is silent about coverage.** Pair every golden file with:
  *which branches did this scenario actually execute, and how many times.*
  *(`Testing/A characterisation hash is only as good as the code paths its fixture reaches.md`, blocker)*
- [ ] **5.7** **Tune on one seed set and gate on another**, and **report the spread, not the headline**
  — a set spanning 53.0–65.8% with σ 4.8 and one block below the floor is concealed entirely by a
  single in-range number. When a comparison ties, **lengthen the measurement; do not loosen `<` to
  `<=`.** *(`Testing/Tune on one seed set and gate on another.md`)*
- [ ] **5.8** **Any cross-entity comparison of an absolute stat is suspect.** A round timer compared
  raw health when one character had 105 and others 100 — two fighters who never touched each other
  ended 2–0 on time, through 299 unit + 72 browser tests. **A test comparing two entities must use two
  *different* entities; a symmetric fixture is not a test of a comparison.**
  *(`Game Feel & Balance/Any cross-character comparison of an absolute stat is suspect.md`, blocker)*
- [ ] **5.9** **Closing a measurement gap is a balance decision, not a repair.** Setting every hitbox
  to match its art would have given the widest character the worst effective reach and brought back
  the original complaint. **The measurement was correct and the repair was a nerf.**
  *(`Game Feel & Balance/Closing a measurement gap is a balance decision, not a repair.md`)*
- [ ] **5.10** **A global content change must be expressed in the variable the invariant is written
  in.** Additive preserves differences, multiplicative preserves ratios, **normalisation preserves
  neither**. *(`Game Feel & Balance/A roster-wide reach change must be a uniform delta.md`, blocker)*
- [ ] **5.11** **Check that waste is waste before you remove it** — partition the population and check
  each part. A "fix" for a 0.3% case un-exempted a category that was **32% of the volume and doing
  exactly its job**: fourteen points of win rate that would have shipped as a bug fix.
  *(`Game Feel & Balance/Check that waste is waste before you remove it.md`, blocker)*

### Phase 6 — Collectibles, HUD, steampunk UI chrome

- [ ] **6.1** **Zero scroll factor pins an object as the camera pans; it does NOT exempt it from camera
  zoom.** Requires a second, non-zooming camera with **reciprocal and exhaustive ignore lists** — an
  object missing from both renders twice, an object in both renders never.
  *(`Platform & Performance/Screen-space is not zoom-exempt.md`)*
- [ ] **6.2** **A second camera created at an explicit size never auto-resizes.** Phaser's resize
  handler only resizes cameras whose dimensions equal the previous game size; hardcoded at 1280 it
  cropped a whole HUD plate off a phone. **Build it from the live game size.**
  *(`…/A second camera created at an explicit size does not auto-resize.md`, blocker)*
- [ ] **6.3** **A container's own depth is what sorts it against the scene**; children's depths are
  only relative to each other. A menu container left at depth 0 rendered *under* a scrim — which looks
  like a colour choice, not a bug. *(same note)*
- [ ] **6.4** **Gate any HUD cue on what is *drawn*, not only on what is true.** A meter at 98/100 drew
  **315 px of a 318 px bar** — visually full — and the action then refused in total silence. Compress
  an unready fill into the first 92% of the slot; move the readiness decision into one engine-free
  module both sides consult. Mirror bug: a "MAX" label over a bar the entrance animation had scaled to
  zero. *(`Game Feel & Balance/A HUD cue must be gated on what is drawn, not only on what is true.md`, blocker)*
- [ ] **6.5** **A DOM overlay does not block engine input.** Phaser's touch manager listens on `window`
  and forwards any touch whose target is *not* the canvas straight into the input system. **Visibility
  is not interactivity.** Hiding an interactive object must also **deactivate** it — invisible objects
  keep their scene-level listeners. *(`Platform & Performance/A DOM overlay does not block engine input.md`, blocker)*
- [ ] **6.6** **Reshape the game to the device instead of letterboxing it.** Decide which axis the art
  fixes (likely height, if the tileset is height-locked). **Do not centre the canvas twice** — Phaser's
  centring writes CSS margins, a flex/grid parent centres the margin box, and the two compose to park
  it a quarter of the gap off. *(`…/Reshape the game to the device instead of letterboxing it.md`)*
- [ ] **6.7** **`scale.min`/`max` apply to the CSS display size, not render resolution, and the clamp
  runs *before* the parent comparison.** `min.width: 1280` writes `style.width: 1280px` onto an 851 px
  phone with a −215 px margin. **A trap that looks correct on a desktop.**
  *(`…/A minimum-size clamp applied to the CSS size breaks every smaller screen.md`, blocker)*

### Phase 7 — Audio

- [ ] **7.1** **Ask for the physical event, not the category.** *"Very short and clean"* returned
  literal silence (−37.9 dBFS floor); *"sharp percussive attack, clearly audible and punchy"* worked.
  **Trim each cue to its first event** — but a cue with a wind-up needs the trim to reach back before
  the loudest moment. *(`Art & Audio Pipeline/Ask for the physical event, not the category.md`)*
- [ ] **7.2** **Probe one model on one cue before committing a batch.** The model whose name promised
  audio measured **−29 dBFS with no transient** against −4.3 dBFS for a dedicated SFX model, at 2.5×
  the price. *(`…/Probe one model on one cue before committing a batch.md`)*
- [ ] **7.3** **Measure hot masters with a 32-bit float decode.** A +2.00 dBFS master decoded as 16-bit
  integer reports its peak as exactly 0.0 — **the instrument saturates at the value it is supposed to
  detect.** *(`…/Measure hot masters with a float decode.md`, blocker)*
- [ ] **7.4** **Cue volume is a clipping budget and the ceiling is measured, not chosen.** Three cues on
  one frame summed to **+3.9 dBFS** at full volume, on the game's most important moment.
  *(`Platform & Performance/Cue volume is a clipping budget and the ceiling is measured.md`)*
- [ ] **7.5** **A WebAudio getter is not a readback.** On a context that has not resumed (every context
  before the first gesture) the write is scheduled and the read returns the old value. **Never assert
  on `mute` or `volume`** — keep your own flag. Teardown: unsubscribe the *exact* unlock handler and
  **remove** long-running tracks from the manager. *(`…/A WebAudio getter is not a readback.md`)*
- [ ] **7.6** Emit audio cues from inside the tick that produced them — see **2.5**.

### Phase 8 — Level design & progression (3–5 levels)

- [ ] **8.1** Shipped-data test coverage across **all** `.tmj` files — see **3.1**.
- [ ] **8.2** Seeded RNG, knob sweeps, seed-set separation — see **2.3**, **5.5**, **5.7**.
- [ ] **8.3** Cross-level absolute-stat comparisons — see **5.8**.
- [ ] **8.4** Anchor prop scale to a human figure in background art — see **4.5**.
- [ ] **8.5** Uniform-delta rule for any global difficulty change — see **5.10**.

### Phase 9 — Polish, juice, particles

- [ ] **9.1** **Hang game logic on the delta-driven clock; keep tweens decorative.** Phaser's tween
  manager reads the system clock and **does not advance under a pumped test clock at all** — anything
  sequenced off a tween completion is untestable *and* one interrupted tween from deadlock.
  **Killing tweens by target kills every tween on that target**: an entry fade and a selection scale
  sharing an object left menu cards permanently at alpha 0, invisible, **with the full suite green**.
  Track the specific tween; have a fade force-settle its end value on stop as well as on complete.
  *(`Platform & Performance/Tweens run on the wall clock; the frame clock runs on the delta.md`, blocker, phaser)*
- [ ] **9.2** **Pick a threshold from what is correct, not from what currently passes.** A tolerance of
  60 with four shipped sheets at exactly 60 and a strict comparison = an unreachable failing branch.
  Four-part rule: pick from correct; commit fixtures on **both** sides; have the fixture call the
  **real gate**; **pin the threshold as a literal in its own assertion.**
  *(`Testing/A threshold set to the worst observed value has an unreachable branch.md`, blocker)*
- [ ] **9.3** **Say plainly what a gate does not cover, and prefer an honest recorded number to a gate
  that cannot fail.** A blob count that found the third leg was **deliberately not shipped as a gate**
  because no threshold would mean anything. Animation checks were **advisory (always exit 0)** by
  design; box-vs-art was a **hard gate** because it had a defensible threshold.
  *(`Process/Say plainly what a gate does not cover.md`; `Prefer an honest recorded number to a gate that cannot fail.md`)*
- [ ] **9.4** **B1 applies: the vault has nothing on particle cost or frame budget.** Phase 9 generates
  new lessons. Beware summary statistics — *"frame rate cannot distinguish 'fast' from 'not drawing
  anything'."* *(`Game Feel & Balance/A win rate cannot tell stronger from more passive.md`)*

### Phase 10 — Build & ship

- [ ] **10.1** **After a toolchain upgrade, diff the *outputs*, not only the changelog** — compilation
  target, module format, minifier defaults. A Vite major raised the default browser target to
  chrome111/safari16.4, **moving a user-facing contract nobody chose**. Write the accepted value down
  with reversal instructions attached. *(`Deployment & Tooling/A dependency upgrade can move your minimum browser contract.md`)*
- [ ] **10.2** **A post-upgrade size change is a hypothesis, not a finding.** The raw-vs-compressed
  ratio is a fast discriminator: real content removal moves both, syntax downlevelling moves mostly
  raw. *(`…/Check downlevel-helper counts before calling a size drop a regression.md`)*
- [ ] **10.3** **Typecheck the build config as a separate program with Node types**, and include the
  plugin directory in the test include list. *"The rigour applied to a file should follow what the file
  decides, not where it sits in the tree."* *(`…/Config files typechecked by nothing…md`, blocker)*
- [ ] **10.4** **A push to main is a production deploy.** Say what you are deploying; a push is a
  release, not a save. **Learn the rollback command before you need it** — the build-with-production-
  config command creates a production deployment *and moves the domain onto it*; it would have shipped
  mid-audit. *(`…/A push to main is a production deploy.md`; `The deploy command that reads like a dry run is a release.md`, blocker)*
- [ ] **10.5** **CSP details that cost time:** image sources need `data:` and `blob:`; `connect-src`
  needs `'self'` (the loader is XHR-based for JSON *and* images); **keywords must be quoted** — bare
  `self` is a hostname pattern and **blanks the game rather than erroring**; `style-src 'unsafe-inline'`
  is load-bearing because the scale manager writes inline margins.
  *(`…/A preview deploy behind SSO cannot gate a security header.md`, blocker)*
- [ ] **10.6** **Split licensing before the repo is public** — MIT for code, a separate
  `ASSETS-LICENSE.md` for generated art. **Check the full history (`git log --all -p`) for secrets,
  not the working tree.** **Hide dev-only chrome or the demo looks like a dev build** — a shipped
  on-screen legend advertised debug keys that don't exist in production.
  → **Binds `window.__game`, the Playground, and the Gym.**
  *(`…/A public repo means a push is also publication.md`; `The README is a public promise and its numbers are claims.md`)*
- [ ] **10.7** **Anything a human will watch needs a second driver.** A deterministic pump and
  real-time capture are fundamentally opposed — under the pump the sim runs ~1000× wall clock while
  every tween crawls. **Disable window-occlusion optimisation on Windows** or any window covering the
  browser freezes both the capture and the game's animation loop.
  *(`…/The test pump is the wrong tool for video capture.md`)*
- [ ] **10.8** **20 MB of assets loading inside a capture produced ~1 second of black**, and the
  duration moves with disk cache. The only recorded number about asset weight. *(same note)*
- [ ] **10.9** Reproducible asset rebuild (see **4.15**) verified from a fresh clone.

---

## Curator's caveats (recorded verbatim, per the evidence rule)

- The curator **did not** use the `obsidian` CLI or the `obsidian-cli` skill; it read the note files
  directly from disk. That deviates from the vault's tooling contract. Counts (133 markdown files;
  116 Evidence across 7 themes; 16 Background; 7 MOCs + `All lessons.base` + `Sim and render
  boundary.canvas`; 4 Meta) come from a filesystem walk, **not** Obsidian's index — they will not
  reflect anything unsaved in the app.
- **Nothing was written to the vault.** Vault-out for Gate 2 is a separate dispatch.
- The curator explicitly **declined to fabricate** content for Performance and for over-built /
  under-built scope retrospection, and flagged the Tiled gap rather than generalising fighting-game
  geometry notes into level-authoring advice. See §B.
