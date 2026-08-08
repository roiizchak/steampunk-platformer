# Vault-in — Phase 4 — fal art production + Character Gym

Phase 4's slice of [LESSONS-APPLIED.md](../LESSONS-APPLIED.md) §D. The root rule, §A, §B and §C
live there and bind every phase.

**Also binding on this phase:** every §C rule, plus **A1**, **A2**, **A2b**, **A2c** (the fal
endpoint contract), **A4** and **A5** (the Gym). Read them in the hub — they are defined once,
there.

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

