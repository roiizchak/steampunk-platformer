# Steampunk Platformer — Phased PRD

> **For execution:** run each phase with `superpowers:executing-plans`. One phase per session.
> Order within a phase is always: **vault-in → invoke required skills → build → QA gate → vault-out → STOP for approval.**

**Goal:** A short browser platformer — 3–5 levels, Victorian industrial steampunk, all art generated
through fal.ai — built as a learning exercise with a hard QA gate at every phase.

**Architecture:** A strict **simulation / render split**. `src/sim/` contains the entire game
simulation and imports *nothing* from Phaser — no `Date.now`, no `Math.random`, no DOM. Phaser scenes
observe sim state and draw it. This is the single most load-bearing decision in the document: it is
what makes the game unit-testable at all, and it comes directly from the vault as a blocker.

**Tech stack:** Phaser 4.2.1 · TypeScript · Vite · vitest · @playwright/test · Tiled · fal.ai via `genmedia`.

---

## Global Constraints

Every task in every phase inherits these. Copied verbatim from the locked decisions.

- **Dependencies are frozen at:** runtime `phaser@4.2.1`; dev `vite`, `typescript`, `vitest`,
  `@playwright/test`. **Anything else requires explicit approval — STOP and ask.**
- **`src/sim/` imports nothing from Phaser.** Mechanical test: the sim test suite must run with Phaser
  uninstalled. *(LESSONS-APPLIED 1.1, blocker)*
- **Every duration is an integer count of 60 Hz ticks. Every distance is pixels.** Never a float of
  seconds, never a `deltaTime` multiply inside the sim. *(2.1, blocker)*
- **No source file exceeds 400 lines** without a written one-line justification in `QA-LOG.md`.
- **Grey-box before art.** No fal spend on a feature whose mechanics are not already playable.
- **All art via `genmedia`**, following [STYLE.md](STYLE.md). Zero tutorial assets, zero stock assets.
- **Every generation logged** to [GENERATION-LOG.md](GENERATION-LOG.md): model, prompt, seed, cost,
  path, kept/discarded.
- **STOP and ask** before: any new dependency, deleting any file, any fal batch over 5 generations,
  or contradicting STYLE.md / PRD.md / LESSONS-APPLIED.md.
- **A phase with a failing or unrun criterion is reported failing.** Never as done.

---

## File structure

Locked now so decomposition decisions are not made ad hoc later.

```
src/
  main.ts                     entry point; boots Phaser, nothing else
  game/
    config.ts                 GameConfig: renderer, scale, pixelArt, FPS
    constants.ts              TICK_HZ, TILE_SIZE, world constants
  sim/                        ← ZERO Phaser imports, ZERO clock, ZERO Math.random
    tick.ts                   numbered tick step order; the contract
    player.ts                 movement state machine
    input.ts                  input snapshot + consumption
    rng.ts                    seeded xorshift32
    combat.ts                 (Phase 5) hit windows, damage, knockback
    progress.ts               (Phase 8) level completion, save state
    types.ts
  scenes/
    BootScene.ts              asset load + refuse-to-route gate
    GameScene.ts              production play scene
    UIScene.ts                (Phase 6) HUD, parallel scene
    PlaygroundScene.ts        DEV ONLY — movement feel tuning
    GymScene.ts               DEV ONLY — asset registration, bounds, frames
    ElementEditorScene.ts     DEV ONLY — tile collision strips
  render/
    playerView.ts             sim state → sprite; no game logic
    cameraRig.ts              follow, bounds, zoom
    hud.ts                    (Phase 6)
  debug/
    globals.ts                window.__game; dev build only, stripped from dist
tests/
  unit/                       vitest; sim only
  e2e/                        @playwright/test; one spec per phase
tools/
  gen/                        tracked fal generation + frame-pick scripts
public/assets/
  index.json                  the asset catalog
levels/                       Tiled .tmj sources
docs/                         this file and friends
```

---

# Phase 1 — Boot

### 1. Goal and scope
Vite + Phaser 4.2.1 + TypeScript + vitest + Playwright stand up. An empty scene renders. The
`window.__game` debug hook exists. The full QA apparatus is built here, once, so every later phase
inherits it.

### 2. Required skills
`game-setup-and-config` · `scenes` · `scale-and-responsive` · `v4-new-features` ·
`superpowers:executing-plans` · `e2e-playwright-testing`

### 3. Vault-in
**1.1** sim imports nothing from Phaser — provable by uninstalling Phaser · **1.2** Vite config loader
uses `.ts`, never `.js`; a quiet warning is not evidence *(A8)* · **1.3** the loader refuses to route
past boot if any expected texture is missing — 404 *and* corrupt-200 · **1.4** the loader has no
default timeout; decide consciously and record the decision · **1.5** decide pixel-art vs smooth
filtering **once** and assert it (Phaser's scale-mode constants are reversed: linear = 0 = default) ·
**1.6** decide per seam which side of the build gate it lives on — applies to `window.__game` ·
**1.7** reset scene state in `init`, not the constructor; scene starts are queued · **C12** confirm
mutations applied — this repo already emits CRLF warnings

### 4. Deliverables
`package.json` (deps exactly as Global Constraints) · `vite.config.ts` · `tsconfig.json` ·
`src/main.ts` · `src/game/config.ts` · `src/game/constants.ts` · `src/scenes/BootScene.ts` ·
`src/debug/globals.ts` · `tests/unit/sim-boundary.test.ts` · `tests/e2e/phase-01-boot.spec.ts` ·
`playwright.config.ts` · `docs/QA-LOG.md`

`window.__game` surface, fixed now because every later e2e spec depends on it:
```ts
{ sceneKey: string; tick: number; player: { x, y, vx, vy, state } | null;
  score: number; health: number; levelId: string | null }
```

### 5. QA gate
| # | Criterion | Method | Owner |
|---|---|---|---|
| 1.1 | `npm run build` succeeds; `tsc --noEmit` clean | command output | — |
| 1.2 | `vitest run` green | command output | — |
| 1.3 | **Sim suite passes with Phaser uninstalled** | uninstall, run, reinstall | qa-expert |
| 1.4 | Canvas mounts; `sceneKey === 'Boot'`; zero console errors | `phase-01-boot.spec.ts` | e2e |
| 1.5 | Missing texture blocks boot; corrupt 200 also blocks | deliberately break an asset, observe | qa-expert |
| 1.6 | Filtering mode asserted at runtime with a comment explaining the reversed constants | code review | code-reviewer |
| 1.7 | No source file > 400 lines | `wc -l` sweep | — |
| 1.8 | Diff reviewed | `voltagent-qa-sec:code-reviewer` | code-reviewer |
| 1.9 | Adversarial pass: *how could this be wrong?* | second review brief *(A7)* | code-reviewer |

**Regression set:** none — this is the baseline.

### 6. Vault-out
Whether the sim/render boundary held under a real Phaser 4.2.1 boot. Anything Phaser 4 changed that
the vault's Phaser 3-era notes got wrong. The actual Vite 8 / TS 6 config that worked.

### 7. Demo
`npm run dev` → a blank canvas at the right size, correct filtering, no console errors. In the
browser console, `window.__game` returns the object above.

---

# Phase 2 — Player controller + Character Playground

### 1. Goal and scope
Grey-box movement that feels good: run, jump, coyote time, jump buffering. Plus **PlaygroundScene**,
a dev-only scene with live-tunable movement parameters. **No art.** Primitives only.

### 2. Required skills
`physics-arcade` · `input-keyboard-mouse-touch` · `game-object-components` · `time-and-timers` ·
`superpowers:test-driven-development`

### 3. Vault-in
**2.1** integer ticks only · **2.2** numbered, authoritative `tick()` step order · **2.3** seeded
xorshift32, sampled once per tick, every roll gated on `chance > 0` · **2.4** input snapshot is a
mutable working copy the batch consumes from — reusing it replays a press, clearing on "a tick ran"
drops it · **2.5** never reconstruct an edge from frame-to-frame comparison; emit per-tick booleans ·
**2.6** every state has exactly one door · **2.7** a temporal-invariant test must span the window —
a one-tick fixture cannot distinguish "at most once" from "every time" · **2.8** derive expected
values from the live knob, with a floor **and** a ceiling · **2.10** collision boxes local, `+x`
forward, `+y` up from feet, one `toWorld` · **2.11** `scale` a required constructor arg; never scale
velocities · **2.12** pull render decisions out of scenes into engine-free modules · **2.14** compute
jump apex with the **discrete** integrator, not `v²/2g` — that error was 7.4px · **A6** sweep every
Playground knob and confirm the number moves

### 4. Deliverables
`src/sim/tick.ts` · `src/sim/player.ts` · `src/sim/input.ts` · `src/sim/rng.ts` · `src/sim/types.ts` ·
`src/render/playerView.ts` · `src/scenes/PlaygroundScene.ts` · `src/scenes/GameScene.ts` ·
`tests/unit/player-movement.test.ts` · `tests/unit/coyote-time.test.ts` · `tests/unit/input-latch.test.ts` ·
`tests/unit/rng.test.ts` · `tests/e2e/phase-02-movement.spec.ts`

### 5. QA gate
| # | Criterion | Method | Owner |
|---|---|---|---|
| 2.1 | Hold Right → x increases monotonically | e2e via `__game` | e2e |
| 2.2 | Jump apex within ±2px of the **discrete-integrator** prediction | unit | qa-expert |
| 2.3 | Coyote time fires within its window and **not** outside it — fixture spans ≥ 2× the window | unit *(2.7)* | qa-expert |
| 2.4 | Jump buffer: press before landing still jumps; press too early does not | unit | qa-expert |
| 2.5 | Deleting any latch condition turns a test **red** — verified by doing it | mutation *(C1)* | qa-expert |
| 2.6 | Every Playground knob moves an observable output | sweep *(A6)* | qa-expert |
| 2.7 | Sim suite still runs with Phaser uninstalled | command | — |
| 2.8 | Feel check in browser: weighty, responsive, no input drops | `playwright-cli` + hands-on *(C4)* | play |
| 2.9 | No file > 400 lines; diff reviewed; adversarial pass | code-reviewer ×2 | code-reviewer |

**Regression set:** Phase 1 criteria 1.1–1.7, `phase-01-boot.spec.ts`.

### 6. Vault-out
The tick step order that turned out to be load-bearing. Whether the input-snapshot rule caught a real
double-press. Coyote/buffer values that actually felt right, with the discrete-integrator apex numbers.

### 7. Demo
A grey box runs and jumps with good feel. A dev key opens the Playground; sliders change the feel live;
every slider visibly does something.

---

# Phase 3 — Tiled → Phaser tilemap pipeline + Element Editor

### 1. Goal and scope
Levels authored in Tiled, exported as `.tmj`, loaded via Phaser 4 tilemaps, with a working collision
layer. Grey-box tileset. **Publishes the exact grid cell size that Phase 4 art must hit.** Includes
**ElementEditorScene** — the reference project proved it necessary because characters floated above
platforms when art bottoms and collision bottoms disagreed.

### 2. Required skills
`tilemaps` · `cameras` · `physics-arcade` · `v4-new-features` (`TilemapGPULayer`)

### 3. Vault-in
**3.1** at least one test loads the **shipped** `.tmj` the player loads — preferably sweeps all of
them; a fixture suite and a registry suite answer different questions *(blocker)* · **3.2** derive
world width from **measured** background pixels, never an aspect label — that mistake left a
side-scroller 10px of scroll room · **3.3** derive behaviour from data, never from a name; grep the
numbers, not just the identifier · **3.4** publish the grid cell size before Phase 4 spends money ·
**A3** the vault has **zero** tilemap coverage — this phase generates new lessons, so keep notes

### 4. Deliverables
`levels/level-01.tmj` (grey-box) · `src/game/tilemap.ts` · `src/scenes/ElementEditorScene.ts` ·
`src/render/cameraRig.ts` · `tests/unit/tilemap-data.test.ts` · `tests/e2e/phase-03-tilemap.spec.ts` ·
`docs/ASSET-PIPELINE.md` updated with the published cell size

### 5. QA gate
| # | Criterion | Method | Owner |
|---|---|---|---|
| 3.1 | Player lands on the collision layer and does not fall through | e2e | e2e |
| 3.2 | Player cannot pass through a solid tile horizontally | e2e | e2e |
| 3.3 | **Every** `.tmj` in `levels/` loads and passes a schema + collision-layer check | unit over shipped data *(3.1)* | qa-expert |
| 3.4 | Camera follows within bounds; never shows outside the map | e2e | e2e |
| 3.5 | World width derived from measured pixels; a test pins the number | unit *(3.2)* | qa-expert |
| 3.6 | **Grid cell size published in ASSET-PIPELINE.md** | doc review | — |
| 3.7 | Element Editor shows and edits a collision strip; the edit persists | hands-on | play |
| 3.8 | No file > 400 lines; diff reviewed; adversarial pass | code-reviewer ×2 | code-reviewer |

**Regression set:** Phases 1–2, specs 01–02.

### 6. Vault-out
**High value — the vault has nothing here.** Tiled→Phaser 4 gotchas, object-layer conventions,
whether `TilemapGPULayer` was usable, and how art bottoms vs collision bottoms actually behaved.

### 7. Demo
A grey-box level loaded from a Tiled file. The player runs, jumps between platforms, camera follows.
The Element Editor opens and a collision strip can be nudged.

---

# Phase 4 — fal art production + Character Gym

### 1. Goal and scope
Produce the real art from the STYLE.md recipe and make it **game-ready**. Split deliberately:
**4a** one hero asset regenerated and checked at true sprite size before any batch spend; **4b** the
full run, estimate presented first. Includes **GymScene** — asset registration: catalog entry, bounds,
anchor, active frames, saved config.

> *"Art is not an asset yet. It becomes an asset when the game can trust its catalog entry, bounds,
> anchor, active frames, and saved config."* — adopted verbatim as this phase's acceptance test.

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

### 4. Deliverables
`tools/gen/generate.ts` · `tools/gen/frames.ts` (tracked frame picks) · `tools/gen/chroma.ts` (shared
keying thresholds) · `tools/gen/gates.ts` + fixtures · `public/assets/index.json` ·
`public/assets/config/character-bounds.json` · `src/scenes/GymScene.ts` ·
`tests/unit/asset-catalog.test.ts` · `tests/unit/chroma-gate.test.ts` · `tests/e2e/phase-04-assets.spec.ts` ·
GENERATION-LOG.md updated

### 5. QA gate
| # | Criterion | Method | Owner |
|---|---|---|---|
| 4.1 | **4a hero asset readable at true sprite size** before batch spend | downscale + look *(4.24)* | play |
| 4.2 | Batch estimate presented and approved before 4b | STOP | — |
| 4.3 | Every asset's dimensions read from the file, recorded | script | qa-expert |
| 4.4 | Alpha channel read directly; chroma keying applied where absent | script *(4.12)* | qa-expert |
| 4.5 | Chroma gate self-tests on fixtures **before** judging real art | fixtures *(4.21)* | qa-expert |
| 4.6 | Keep-largest-component **not** applied to jump/air/attack states | code review *(4.13)* | code-reviewer |
| 4.7 | Every animation's fps derived as `renderFrames × TICK_HZ / simTicks` | unit *(4.22)* | qa-expert |
| 4.8 | Contact frame lands inside the active window on **every** attack sheet | measured *(4.22)* | qa-expert |
| 4.9 | Loop flag verified per clip; held states meet a motion floor | measured *(4.23)* | qa-expert |
| 4.10 | Box-vs-art audit: frame-diff method, INDETERMINATE allowed, no guesses | *(4.18)* | qa-expert |
| 4.11 | Rebuild from a clean clone produces **byte-identical** PNGs | *(4.15)* | qa-expert |
| 4.12 | A missing declared input **fails the build**, does not substitute | deliberately remove one *(4.16)* | qa-expert |
| 4.13 | Every asset has catalog entry + bounds + anchor + active frames + saved config | `index.json` audit | qa-expert |
| 4.14 | Anatomy check by looking — metrics cannot see a third leg | eyeball *(4.20)* | play |
| 4.15 | Gym save path typechecked and inside the test include list | *(A4)* | code-reviewer |
| 4.16 | No file > 400 lines; diff reviewed; adversarial pass | code-reviewer ×2 | code-reviewer |

**Regression set:** Phases 1–3, specs 01–03.

### 6. Vault-out
Whether fal's alpha/aspect/cost behaviour matched the vault's Higgsfield-era findings *(A2)*. Whether
Grok clips held character identity across separate generations. The real invoice vs the quoted rate.
Whether 25→N frame resampling survived contact-frame alignment.

### 7. Demo
The real character animating in-engine at true size. The Gym opens, shows bounds overlays
(white/blue/green/red), per-frame toggles work, and a bounds edit saves and reloads.

---

# Phase 5 — Enemies, hazards, combat + Enemy Gym

### 1. Goal and scope
Two contrasting enemies — a **static turret** with a visible detection radius, and a **patrolling
scavenger** that chases. Hazards. Player attack, damage, knockback, i-frames. **Enemy health bars.**
Plus enemy behaviour tuning in the Gym. Grey-box behaviour first, art second.

### 2. Required skills
`physics-arcade` · `groups-and-containers` · `events-system` · `animations` · `data-manager`

### 3. Vault-in
**5.1/2.9** a per-tick probability is **not** a behaviour — commit to episodes; one counter plus one
flag, because two counters admit the unrepresentable state. Phaser restarts a looping animation on
every state change, which is how a walk cycle never left frame 0 *(blocker)* · **5.2** equal duty
cycle is not equal difficulty · **5.3** two definitions of one concept is where the bug lives — import
the predicate, never restate it · **5.4** the benchmark is half of every measurement · **5.5** a
measurement of exactly 0 or 100% means asking whether the branch ran · **5.6** pair every golden file
with branch-execution counts · **5.7** tune on one seed set, gate on another; report the spread ·
**5.8** any cross-entity comparison of an absolute stat is suspect; a symmetric fixture is not a test
of a comparison · **5.9** closing a measurement gap is a balance decision, not a repair · **5.10**
global changes as uniform deltas · **5.11** check that waste is waste before removing it · **6.4**
gate the enemy health bar on what is **drawn** — an enemy at 2/100 must not render as empty

### 4. Deliverables
`src/sim/combat.ts` · `src/sim/enemies.ts` · `src/render/enemyView.ts` · `src/render/enemyHealthBar.ts` ·
`src/scenes/GymScene.ts` extended · `tests/unit/combat.test.ts` · `tests/unit/enemy-ai.test.ts` ·
`tests/unit/enemy-health-bar.test.ts` · `tests/e2e/phase-05-combat.spec.ts`

### 5. QA gate
| # | Criterion | Method | Owner |
|---|---|---|---|
| 5.1 | Turret fires only inside its radius; radius tunable and the change is observable | unit + sweep | qa-expert |
| 5.2 | Scavenger patrols, detects, chases; each speed independently tunable | unit + sweep | qa-expert |
| 5.3 | Enemy decisions commit to **episodes**, not per-tick rolls | code review *(5.1)* | code-reviewer |
| 5.4 | Enemy walk animation advances past frame 0 during patrol | e2e/observed *(5.1)* | play |
| 5.5 | Attack registers **only** on active frames; wind-up and recovery do not | unit *(4.22)* | qa-expert |
| 5.6 | i-frames span their full window — fixture longer than the window | unit *(2.7)* | qa-expert |
| 5.7 | **Enemy health bar never renders empty above 0 HP** | unit *(6.4)* | qa-expert |
| 5.8 | Enemy health bar legible at true sprite size against a cool background | eyeball | play |
| 5.9 | Every tuning knob sweeps and the number moves | sweep *(A6)* | qa-expert |
| 5.10 | Damage comparisons use two **different** entities, not a symmetric fixture | unit *(5.8)* | qa-expert |
| 5.11 | **Frame budget** measured under worst-case enemy count | `performance-engineer` | perf |
| 5.12 | No file > 400 lines; diff reviewed; adversarial pass | code-reviewer ×2 | code-reviewer |

**Regression set:** Phases 1–4, specs 01–04.

### 6. Vault-out
Whether episode-committed AI fixed the frame-0 animation problem in practice. Enemy tuning values that
felt fair. What the frame budget actually was — **the vault has nothing on performance (§B1)**, so
this is new ground.

### 7. Demo
Fight both enemies. Watch the turret's radius, get chased by the scavenger, take and deal damage with
knockback, see enemy health bars deplete.

---

# Phase 6 — Collectibles, HUD, steampunk UI chrome

### 1. Goal and scope
Gear pickups with a counter, the player HUD from STYLE.md (portrait medallion + single horizontal
health bar), and the collect→scoreboard tween. HUD lives in a **parallel UIScene**.

### 2. Required skills
`text-and-bitmaptext` · `graphics-and-shapes` · `scenes` · `data-manager` · `ui-ux-pro-max` ·
`fal-prompting` (chroma-keyed HUD sheet)

### 3. Vault-in
**6.1** zero scroll factor pins against pan but **not** against zoom — needs a second non-zooming
camera with reciprocal, exhaustive ignore lists · **6.2** a second camera created at an explicit size
never auto-resizes; build it from the live game size · **6.3** a container's own depth sorts it
against the scene · **6.4** gate the HUD on what is **drawn** — 98/100 drew 315 of 318px and the
action then refused in silence; compress an unready fill into the first 92% · **6.5** a DOM overlay
does not block engine input; hiding an interactive object must also deactivate it · **6.6** reshape to
the device; do not centre the canvas twice · **6.7** `scale.min/max` apply to CSS size and clamp
before the parent comparison · **STYLE.md §6** constrain HUD geometry rather than negating unwanted
elements

### 4. Deliverables
`src/scenes/UIScene.ts` · `src/render/hud.ts` · `src/sim/pickups.ts` ·
`public/assets/hud/` (chroma-keyed sheet) · `tests/unit/hud-readiness.test.ts` ·
`tests/unit/pickup-count.test.ts` · `tests/e2e/phase-06-hud.spec.ts`

### 5. QA gate
| # | Criterion | Method | Owner |
|---|---|---|---|
| 6.1 | Pickup increments the counter; counter uses **tabular figures** so it does not jitter | e2e | e2e |
| 6.2 | HUD pinned under camera pan **and** under zoom | e2e *(6.1)* | qa-expert |
| 6.3 | Second camera built from live game size; resize does not crop the HUD | resize test *(6.2)* | qa-expert |
| 6.4 | Health bar never draws full while health < max | unit *(6.4)* | qa-expert |
| 6.5 | HUD legible at minimum supported resolution | screenshot | play |
| 6.6 | Text contrast ≥ 4.5:1 | measured | ui-ux-tester |
| 6.7 | Canvas not double-centred; no stray margin offset | inspect *(6.6)* | qa-expert |
| 6.8 | HUD sheet chroma-keyed cleanly; fill mask region correct | inspect | play |
| 6.9 | No file > 400 lines; diff reviewed; adversarial pass; frame budget | code-reviewer ×2 + perf | — |

**Regression set:** Phases 1–5, specs 01–05.

### 6. Vault-out
Whether the two-camera ignore-list rule bit us. Whether the drawn-vs-true gate caught a real case.
How the generated HUD sheet behaved through chroma keying.

### 7. Demo
Collect gears, watch them tween to the counter, take damage and watch the ornate brass bar deplete.
Resize the window; the HUD stays correct.

---

# Phase 7 — Audio

### 1. Goal and scope
SFX for jump, land, attack, hit, pickup, death. One music bed. Mute and volume that persist.

### 2. Required skills
`audio-and-sound` · `fal-models-catalog` (text-to-audio) · `fal-prompting`

### 3. Vault-in
**7.1** ask for the physical event, not the category — *"very short and clean"* returned literal
silence at −37.9 dBFS; trim each cue to its first event, but a cue with a wind-up needs the trim to
reach back before the loudest moment · **7.2** probe one model on one cue before a batch — the model
whose name promised audio measured −29 dBFS with no transient, at 2.5× the price · **7.3** measure hot
masters with a **32-bit float decode**; a 16-bit decode saturates at exactly the value it should
detect · **7.4** cue volume is a clipping budget measured from the shipped files — three cues on one
frame summed to +3.9 dBFS · **7.5** a WebAudio getter is not a readback; never assert on `mute` or
`volume`, keep your own flag; unsubscribe the exact unlock handler and **remove** long-running tracks ·
**2.5** emit audio cues from inside the tick that produced them

### 4. Deliverables
`src/game/audio.ts` · `src/sim/audioCues.ts` (engine-free cue selection) ·
`public/assets/audio/` · `tools/gen/audio-gate.ts` · `tests/unit/audio-cues.test.ts` ·
`tests/e2e/phase-07-audio.spec.ts`

### 5. QA gate
| # | Criterion | Method | Owner |
|---|---|---|---|
| 7.1 | Every cue plays at its event; no unloaded-sound errors | e2e | e2e |
| 7.2 | Worst-case simultaneous cue stack measured ≤ −1.0 dBFS | float decode *(7.3/7.4)* | qa-expert |
| 7.3 | No cue is silent — measured floor, not listened-to | float decode *(7.1)* | qa-expert |
| 7.4 | Mute/volume persist across reload; asserted on **our** flag, not the getter | unit *(7.5)* | qa-expert |
| 7.5 | Scene round-trip does not accumulate tracks | repeat transitions, count *(7.5)* | qa-expert |
| 7.6 | Cues emitted from the producing tick, not a state comparison | code review *(2.5)* | code-reviewer |
| 7.7 | No file > 400 lines; diff reviewed; adversarial pass; frame budget | code-reviewer ×2 + perf | — |

**Regression set:** Phases 1–6, specs 01–06.

### 6. Vault-out
Which fal audio endpoint actually produced usable transients and at what cost. The measured clipping
ceiling for our cue set.

### 7. Demo
Play with sound. Jump, land, hit an enemy, collect a gear, die. Mute, reload, still muted.

---

# Phase 8 — Level design and progression

### 1. Goal and scope
3–5 finished levels, level select, save state, difficulty ramp, and level-complete flow.

### 2. Required skills
`tilemaps` · `scenes` · `data-manager` · `curves-and-paths`

### 3. Vault-in
**8.1/3.1** at least one test loads **every shipped** `.tmj` — the defect usually lives in one entry,
not the schema · **8.2** seeded RNG, knob sweeps, and separate tune/gate seed sets · **8.3** cross-level
absolute-stat comparisons are suspect · **8.4** anchor prop scale to a human figure in background art ·
**8.5** any global difficulty change is a uniform delta — additive preserves differences,
normalisation preserves neither · **5.7** report the spread, not the headline

### 4. Deliverables
`levels/level-01..05.tmj` · `src/sim/progress.ts` · `src/scenes/LevelSelectScene.ts` ·
`src/game/save.ts` · `tests/unit/progress.test.ts` · `tests/unit/level-data.test.ts` ·
`tests/e2e/phase-08-progression.spec.ts`

### 5. QA gate
| # | Criterion | Method | Owner |
|---|---|---|---|
| 8.1 | **Every** shipped `.tmj` loads, validates, and is completable | unit + e2e *(8.1)* | qa-expert |
| 8.2 | Full playthrough start → finish without a soft-lock | e2e + hands-on *(C4)* | play |
| 8.3 | Completing a level unlocks the next; save survives reload | unit + e2e | qa-expert |
| 8.4 | Save schema tolerates a missing/corrupt file without data loss | corrupt it deliberately | qa-expert |
| 8.5 | Difficulty ramp measured, spread reported — not a single headline number | *(5.7)* | qa-expert |
| 8.6 | Level-complete flow: align, animate, fade, overlay, continue | hands-on | play |
| 8.7 | No file > 400 lines; diff reviewed; adversarial pass; frame budget | code-reviewer ×2 + perf | — |

**Regression set:** Phases 1–7, specs 01–07.

### 6. Vault-out
What level-authoring in Tiled was actually like. Where difficulty estimates were wrong. Whether the
shipped-data test caught anything a fixture test would have missed.

### 7. Demo
Play the whole game start to finish. Quit mid-way, reload, resume.

---

# Phase 9 — Polish, juice, particles

### 1. Goal and scope
Steam bursts, sparks, screen shake, hit-stop, landing dust, coin sparkle. Feel, not features.

### 2. Required skills
`particles` · `tweens` · `filters-and-postfx` · `cameras` · `render-textures` · `motion-design`

### 3. Vault-in
**9.1** hang game logic on the delta clock and keep tweens decorative — Phaser's tween manager reads
the system clock and does **not** advance under a pumped test clock; killing tweens *by target* kills
every tween on that target, which left menu cards invisible at alpha 0 with a fully green suite
*(blocker)* · **9.2** pick thresholds from what is correct, not what currently passes; fixtures on
both sides; the fixture must call the real gate; pin the threshold as a literal · **9.3** say plainly
what a gate does not cover; prefer an honest recorded number to a gate that cannot fail · **9.4**
**the vault has nothing on particle cost or frame budget** — new ground; beware summary statistics
that cannot distinguish "fast" from "not drawing anything"

### 4. Deliverables
`src/render/effects.ts` · `src/sim/hitstop.ts` · `src/render/screenShake.ts` ·
`tests/unit/hitstop.test.ts` · `tests/e2e/phase-09-polish.spec.ts`

### 5. QA gate
| # | Criterion | Method | Owner |
|---|---|---|---|
| 9.1 | Hit-stop lives in the sim as integer ticks, not a tween | code review *(9.1)* | code-reviewer |
| 9.2 | No game logic sequenced off a tween completion | code review *(9.1)* | code-reviewer |
| 9.3 | Tweens tracked individually; no kill-by-target | code review *(9.1)* | code-reviewer |
| 9.4 | A fade force-settles its end value on stop as well as complete | unit | qa-expert |
| 9.5 | **Frame budget holds under worst case**: max enemies + max particles + shake | `performance-engineer` *(9.4)* | perf |
| 9.6 | Frame-rate measurement distinguishes "fast" from "not drawing" | method review *(9.4)* | perf |
| 9.7 | Every gate's threshold pinned as a literal, with fixtures both sides | *(9.2)* | qa-expert |
| 9.8 | What the gates do **not** cover is stated in QA-LOG | *(9.3)* | — |
| 9.9 | No file > 400 lines; diff reviewed; adversarial pass | code-reviewer ×2 | code-reviewer |

**Regression set:** Phases 1–8, specs 01–08.

### 6. Vault-out
**Highest-value vault-out of the project — §B1 is empty.** Real particle costs, real frame budget,
what actually cost FPS in Phaser 4, and which effects were worth their cost.

### 7. Demo
The game with juice. Hits feel like they land.

---

# Phase 10 — Build and ship

### 1. Goal and scope
Production build, dev seams stripped, licensing split, full regression. Ship it.

### 2. Required skills
`game-setup-and-config` · `scale-and-responsive` · `superpowers:verification-before-completion`

### 3. Vault-in
**10.1** after a toolchain upgrade diff the **outputs**, not the changelog — a Vite major silently
moved the minimum browser contract · **10.2** a post-upgrade size change is a hypothesis; raw-vs-gzip
ratio is the discriminator · **10.3** typecheck the build config as its own program · **10.4** a push
to main is a production deploy; learn the rollback command **before** you need it · **10.5** CSP:
`data:` and `blob:` for images, `'self'` for connect-src, **keywords must be quoted** — bare `self`
blanks the game rather than erroring — and `style-src 'unsafe-inline'` is load-bearing because the
scale manager writes inline margins · **10.6** split licensing before the repo is public; check
`git log --all -p` for secrets, not the working tree; **hide dev-only chrome or the demo looks like a
dev build** · **10.7** anything a human will watch needs a second driver; disable window-occlusion
optimisation on Windows · **10.9** reproducible asset rebuild verified from a fresh clone

### 4. Deliverables
`ASSETS-LICENSE.md` · `LICENSE` · `README.md` · production `vite.config.ts` ·
`tests/e2e/phase-10-production.spec.ts`

### 5. QA gate
| # | Criterion | Method | Owner |
|---|---|---|---|
| 10.1 | `npm run build` clean; production bundle runs | command + browser | — |
| 10.2 | **`window.__game`, Playground, Gym and Element Editor absent from `dist/`** | grep the bundle *(1.6/10.6)* | qa-expert |
| 10.3 | Build-target and minifier defaults recorded with reversal instructions | doc *(10.1)* | — |
| 10.4 | Bundle size change explained via raw-vs-gzip ratio | *(10.2)* | qa-expert |
| 10.5 | Build config typechecked as its own program | *(10.3)* | code-reviewer |
| 10.6 | CSP verified against the **production** header config locally | *(10.5)* | qa-expert |
| 10.7 | `git log --all -p` clean of secrets | command *(10.6)* | qa-expert |
| 10.8 | Licences split: code vs generated assets | doc *(10.6)* | — |
| 10.9 | Asset rebuild from a fresh clone is byte-identical | *(10.9/4.15)* | qa-expert |
| 10.10 | **Specs 01–10 all green** | full suite | e2e |
| 10.11 | **Every prior phase's acceptance criteria re-verified** | full regression | qa-expert |
| 10.12 | Full playthrough on the production build | hands-on *(C4)* | play |

**Regression set:** everything.

### 6. Vault-out
The complete retrospective: what the 400-line ceiling cost and bought, whether the sim/render split
paid off, total real fal spend vs the $0.08/image estimate, and which vault lessons actually fired.

### 7. Demo
The finished game, production build, played start to finish.

---

## Phase dependency notes

- **Phase 3 blocks Phase 4** — the tile grid cell size must be published before art is generated
  against it.
- **Phase 2 blocks Phase 5** — combat timing is expressed in the tick contract from Phase 2.
- **Phase 4's 4a blocks 4b** — the hero-asset readability check gates the batch spend.
- **Phases 7 and 9 are independent** of each other and could swap if needed.
- **Phase 5 onward runs `performance-engineer`**; **Phase 6 onward runs `ui-ux-tester`**.
