# Phase 4 — fal art production + Character Gym

← [PRD spine](../PRD.md) · prev: [Phase 3](phase-03-tilemap.md) · next: [Phase 5](phase-05-combat.md)

> Global Constraints and the Codex review protocol live in [PRD.md](../PRD.md) and apply here in full.

### 1. Goal and scope
Produce the real art from the STYLE.md recipe and make it **game-ready**. Split deliberately:
**4a** one hero asset regenerated and checked at true sprite size before any batch spend; **4b** the
full run, estimate presented first. Includes **GymScene** — asset registration: catalog entry, bounds,
anchor, active frames, saved config.

> *"Art is not an asset yet. It becomes an asset when the game can trust its catalog entry, bounds,
> anchor, active frames, and saved config."* — adopted verbatim as this phase's acceptance test.

🔴 **Scope boundary, corrected after the Gate 7 Codex review.** This phase produces **only the
animations whose sim timings already exist**: `idle`, `walk`, `run`, `jump`. It does **not** produce
`attack`, `hurt` or `death`.

The reason is that gates 4.7 and 4.8 derive `fps = renderFrames × TICK_HZ / simTicks` and align the
contact frame to the **active window** — and `simTicks`, `startup` and the active windows for combat
are defined in `src/sim/combat.ts`, which is a **Phase 5** deliverable. Generating attack art here
would mean either authoring a flat fps (vault **4.22**, blocker: *the strike was never drawn*) or
inventing timings that Phase 5 then changes, forcing a re-generation. **Attack, hurt and death sheets
move to Phase 5**, where the windows they must align to exist and where the enemies they belong to
are specified. That also restores *grey-box before art* for combat, which this phase was quietly
violating.

🔴 **Phase 4a now begins with the Gate 0 model-swap re-probe** ([STYLE.md](../STYLE.md) §7 gate 0).
The image model changed to `fal-ai/nano-banana-pro` and the animation model to
`bytedance/seedance-2.0/image-to-video` on 2026-08-05. **Nothing measured on the old models carries
over** — not the returned pixel dimensions, not the absent alpha channel, not the frame rate, not the
price. See [SOURCE-ANALYSIS.md](../SOURCE-ANALYSIS.md) §6.

**Required reading before the first generation:** [FAL-MODELS.md](../FAL-MODELS.md) §1–§5 — the full
schemas, prices and gotchas for `nano-banana-pro`, `nano-banana-pro/edit`, both Seedance 2 endpoints
and Bria. Re-run `genmedia schema` on each; the documented snapshot is dated 2026-08-05.

### 2. Required skills
`loading-assets` · `animations` · `sprites-and-images` · `render-textures` · `fal-gamedev` ·
`fal-prompting` · `model-routing` · `genmedia-workflow` · `character-design`

### 3. Vault-in
**4.1** the reference image is the lever, not the wording · **4.2** name what to discard, element by
element · **4.3** never contradict your own prompt · **4.4** describe the camera, not the percentage ·
**4.5** anchor scale to a person · **4.6** name the height one joint lower; never name the move ·
**4.7** the sampling rate is a prompt variable — name the cycle count · **4.8** know your noise floor
before attributing anything to a prompt edit · **4.9** probe one model on one cue before a batch;
**budget from the invoice, not the estimate** · **4.10** one number moves per reference change ·
**4.11** read dimensions from the file · **4.12** read the alpha channel, never `mode == "RGBA"` ·
**4.13** key by L1 colour distance with tolerance; judge specks by connected-component area ≥256px;
**keep-largest-component must not be applied to jump/air/attack states** · **4.14/A5** rebuild order —
never derive one global constant from a single regenerable frame · **4.15** frame picks live in the
tracked generator and must rebuild byte-identical · **4.16** a missing declared input fails loudly in
the build · **4.17** save prompt + job record beside every asset; stdout only · **4.18** a box is a
claim about a sprite — diff each frame against frame 0; report INDETERMINATE rather than guess ·
**4.19** enumerate the axes your metrics measure · **4.20** silhouette metrics score an extra limb
favourably · **4.21** gates self-test on fixtures before judging real art · **4.22** derive fps from
the sim: `fps = renderFrames × TICK_HZ / simTicks`; align contact frame; budget wind-up `startup − 1` ·
**4.23** verify the loop flag per clip · **4.24** look to find, count to decide · **4.25** re-verify
the POT/mipmap constraint on Phaser 4 · **A4** the Gym's save endpoint is an authorization decision

### 4. Codex plan review
**Runs now, before any code and before any spend.** Command and handling rules:
[PRD.md § The Codex review protocol](../PRD.md#the-codex-review-protocol).
Output → `docs/reviews/phase-04-plan.md`.

This is the phase where a plan review is worth the most, because its mistakes cost money rather than
time. Ask Codex in particular:

1. **The two model swaps.** Read STYLE.md §2b and SOURCE-ANALYSIS.md §6. **Which claim in this
   repository is still stated as measured fact but was measured on `nano-banana-2` or Grok?** Any it
   finds is a live vault-4.11 violation.
2. **The cost model.** Two sources disagree on Seedance 2's price by ~22×. **Does the plan authorise
   any spend that is only safe if the cheaper number is the real one?**
3. **The gates.** Which acceptance criterion in section 6 would pass on art that is visibly wrong?

### 5. Deliverables
`tools/gen/generate.ts` · `tools/gen/frames.ts` (tracked frame picks) · `tools/gen/chroma.ts` (shared
keying thresholds) · `tools/gen/gates.ts` + fixtures · `public/assets/index.json` ·
`public/assets/config/character-bounds.json` · `src/scenes/GymScene.ts` ·
`tests/unit/asset-catalog.test.ts` · `tests/unit/chroma-gate.test.ts` · `tests/e2e/phase-04-assets.spec.ts` ·
GENERATION-LOG.md updated **with request ids** · STYLE.md §2b re-measured and its 🔴 markers cleared ·
**STYLE.md §8 CHARACTER ANCHOR block written and locked** · **`docs/ASSET-MANIFEST.md`** — the agreed
list of every character, enemy and animation, so Phase 5 and Phase 6 are not surprised by a missing
sheet · `public/assets/index.json` **schema extended to cover non-character assets** (HUD sheets and
audio cues land in Phases 6 and 7 and need catalog entries too)

### 6. QA gate
| # | Criterion | Method | Owner |
|---|---|---|---|
| 4.0 | **Gate 0 re-probe run on `nano-banana-pro`**: dimensions, alpha, single health bar, scale ratio, **seed determinism** | STYLE.md §7 gate 0 | qa-expert |
| 4.0b | **CHARACTER ANCHOR chosen and written into STYLE.md as an immutable block** before any sheet is generated | STYLE.md §8 | — |
| 4.0c | **Asset manifest published**: every character and enemy slug, and every animation each one needs, agreed before spend | doc | — |
| 4.0d | Phase 3's **published camera zoom and viewport** read from ASSET-PIPELINE.md — "true sprite size" is meaningless without them | doc | — |
| 4.1 | **4a hero asset readable at true sprite size** before batch spend | downscale + look *(4.24)* | play |
| 4.2 | Batch estimate presented and approved before 4b | STOP | — |
| 4.2b | **One 4 s Seedance 2 probe run and reconciled against the actual invoice line** before any animation batch | invoice *(4.9)* | qa-expert |
| 4.2c | **Real clip fps and frame count read by `ffprobe`**, not assumed — Seedance 2 publishes neither | measured *(4.11)* | qa-expert |
| 4.3 | Every asset's dimensions read from the file, recorded | script | qa-expert |
| 4.4 | Alpha channel read directly; chroma keying applied where absent | script *(4.12)* | qa-expert |
| 4.5 | Chroma gate self-tests on fixtures **before** judging real art | fixtures *(4.21)* | qa-expert |
| 4.6 | Keep-largest-component **not** applied to jump/air/attack states | code review *(4.13)* | code-reviewer |
| 4.7 | Every animation's fps derived as `renderFrames × TICK_HZ / simTicks` from **Phase 2's** movement timings | unit *(4.22)* | qa-expert |
| 4.8 | ~~Contact frame lands inside the active window~~ — **moved to Phase 5** with the attack sheets | — | — |
| 4.9 | Loop flag verified per clip; held states meet a motion floor | measured *(4.23)* | qa-expert |
| 4.10 | Box-vs-art audit: frame-diff method, INDETERMINATE allowed, no guesses | *(4.18)* | qa-expert |
| 4.11 | Rebuild from a clean clone produces **byte-identical** PNGs | *(4.15)* | qa-expert |
| 4.12 | A missing declared input **fails the build**, does not substitute | deliberately remove one *(4.16)* | qa-expert |
| 4.13 | Every asset has catalog entry + bounds + anchor + active frames + saved config | `index.json` audit | qa-expert |
| 4.14 | Anatomy check by looking — metrics cannot see a third leg | eyeball *(4.20)* | play |
| 4.15 | Gym save path typechecked and inside the test include list | *(A4)* | code-reviewer |
| 4.16 | No file > 400 lines; diff reviewed; adversarial pass | code-reviewer ×2 | code-reviewer |
| 4.17 | **Codex plan review ran; every finding applied or recorded** | `docs/reviews/phase-04-plan.md` | — |
| 4.18 | **Codex implementation review ran on the diff; every finding applied or recorded** | `docs/reviews/phase-04-impl.md` | codex |

**Regression set:** Phases 1–3, specs 01–03.

### 7. Vault-out
Whether fal's alpha/aspect/cost behaviour matched the vault's Higgsfield-era findings *(A2)*. Whether
Seedance 2 clips held character identity across separate generations. **The real invoice versus both
quoted rates** — this is the highest-value number in the phase, because two authoritative sources
disagreed by ~22× and only the invoice settles it. Whether `end_image_url` actually produced a clean
loop. Whether N-frame resampling survived contact-frame alignment.

### 8. Demo
The real character animating in-engine at true size. The Gym opens, shows bounds overlays
(white/blue/green/red), per-frame toggles work, and a bounds edit saves and reloads.
