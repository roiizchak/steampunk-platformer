# SOURCE-ANALYSIS.md

Gate 4 of Phase 0. Analysis of the two source materials, cross-referenced against
[LESSONS-APPLIED.md](LESSONS-APPLIED.md). **Learning material only — nothing is copied.**

| Source | What was done | Result |
|---|---|---|
| Video — [Vibe Code a Steampunk Platformer Game and Sprites With AI](https://www.youtube.com/watch?v=x_P855cmBxQ) | `firecrawl` scrape for page + full transcript; `watch` skill (yt-dlp → ffmpeg → 80 frames at ~19.6 s spacing) | full transcript + 80 frames read |
| Repo — [chongdashu/steampunk-platformer](https://github.com/chongdashu/steampunk-platformer) | GitHub API tree + raw file reads | ~70 source files, `package.json`, 11 prompt templates |

Video: **"Robin Chute"**, by Chong-U (AI Oriented Dev), 26:05, uploaded 2026-05-22, 6.4k views.
Native captions existed, so **no Whisper key was needed and no audio left this machine.**

---

## 1. The headline finding: there is no Phaser 3 to port

**Our locked premise — "tutorial code targets Phaser 3 and MUST be ported" — is void.**

The repo pins `phaser 4.0.0` (with `typescript 6.0.3`, `vite 8.0.9`, `vitest 4.0.3`), and the video
is contemporaneous with it and shows the same project. The on-screen design board (frame 43) refers
to **"Phaser TileSprites"** for parallax, a Phaser 4 API.

**Consequence for the PRD:** `v3-to-v4-migration` drops from *"the porting authority"* to a
lower-priority reference. It stays worth reading once — most Phaser material on the open web is
still v3, so we will hit v3-isms from other sources — but it is no longer a Phase 1–3 dependency.
**`v4-new-features` becomes the more important of the two**, particularly `TilemapGPULayer` and
`SpriteGPULayer` for our Phase 3 tilemap work.

We target **4.2.1**, two minors ahead of the reference. Vault **10.1** applies at Phase 10: after a
toolchain upgrade, diff the *outputs*, not the changelog.

---

## 2. The video's actual pipeline

Eleven steps, matching the repo's `share/vgd08/prompt-templates/` one-for-one. Timestamps from the
video's own chapter list.

| Time | Step | What it produces |
|---|---|---|
| 04:16 | Tooling & visual target | 4 gameplay mockups, one chosen as art-direction anchor |
| 05:50 | Parallax background | three alpha layers as Phaser TileSprites, scroll factors in asset order |
| 07:33 | Player sprite pipeline | reference → anchor → snap → side-facing → sheet |
| 08:12 | Pixel-snapped anchors | via **Sprite Fusion Pixel Snapper** (external tool) |
| 09:05 | Animating from anchors | **Grok Imagine**, 1-second clips, frames split out |
| 09:59 | **Character Gym** | bounds, anchors, per-frame active toggles, saved config |
| 12:38 | **Playground Gym** | movement feel against real level geometry |
| 13:13 | Tilemaps & atlases | atlas + JSON manifest for props/pickups/platforms |
| 15:03 | **Element Editor Gym** | collision strips, so characters don't float above platforms |
| 17:32 | **Level Editor** | levels saved to JSON |
| 22:39 | Enemy tuning | turret + scavenger, live-tunable radius/HP/cooldown/chase |
| 23:41 | HUD & splash | chroma-key HUD, poster-style splash |

**The on-screen "Step 3" board** (frames 4, 26, 40) shows the character pipeline in detail:

```
Reference          →  Anchor              →  Snap            →  Side-facing        →  Sheet
input concept,        one canonical pose,    pixel-snapped      side profile,         preserve canvas,
front-facing          chroma green bg                           gameplay direction    export to public assets
```

Every intermediate sits on **flat chroma green**, not transparency — confirming vault **4.12/4.13**
from the other direction: this author also could not get alpha out of the generator.

---

## 3. Mechanics inventory

Confirmed from frames and transcript:

- **Movement:** run, jump, attack, hurt, death. Side-scrolling, camera follows, world wider than viewport.
- **Collectibles:** gear pickups with a counter HUD (`0/6`, `5/5` seen in frames 23, 46). On pickup, the
  gear **tweens toward the scoreboard** — explicitly called out as cheap, effective polish.
- **Enemies, two kinds, deliberately contrasted:**
  - **Turret / cannon** — static, with a **visible yellow detection radius**, tunable range, HP and
    fire cooldown. Frame 74 territory; transcript at 22:45.
  - **Scavenger bot** — patrols its own platform, detects, then chases. Tunable patrol speed,
    detection distance and chase speed.
- **Combat feel:** knockback, chase speed, recovery cooldowns — all live-tunable, all persisted.
- **Goal / exit:** reach the goal to clear the level; exit animation, fade, black bars,
  "Level Cleared!" overlay.
- **HUD:** circular character portrait + horizontal health bar, both generated as one chroma-keyed
  sheet. Gear counter top-right.
- **Splash screen:** poster-styled, not in-game-styled.

---

## 4. The four dev tools, and why they matter

This is the part of the source material genuinely worth taking. All four are **scenes inside the
game**, reachable from a debug console docked on the right of the canvas.

1. **Character Gym** (frames 33, 36, 70) — one animation at a time on a crosshair grid, zoomable.
   Header reads e.g. `Robin Chute Snapped · Attack · frame 5/8 · 10fps saved`. Right panel carries
   per-frame toggles and an x/y/w/h bounds editor. Colour convention (from the prompt template):
   **white** = source frame bounds, **blue** = visual footprint, **green** = collision, **red** = attack hitbox.
2. **Playground Gym** (frames 53, 64) — the character in a real level, for movement feel.
3. **Platforming Element Editor** (frame 49) — labelled `Platform small (edge = 171×40 = collide)`,
   with the collision strip drawn over the art. Its whole reason to exist: *characters were floating
   above platforms* because the art's visual bottom and its collision bottom disagreed.
4. **Level Editor** (frame 56) — loads/saves JSON levels, object list, gizmos, `LevelEditorScene`.

**Our split stands.** We already decided Playground → Phase 2 (grey-box, feel) and Gym → Phase 4
(asset registration). The Element Editor is a **third thing** the reference proves is needed, and it
is really a *tilemap collision* concern — **Phase 3**, where Tiled gives us most of it for free.

---

## 5. What we do differently

Cross-referenced to `LESSONS-APPLIED.md`.

| # | Reference does | We do | Why |
|---|---|---|---|
| D1 | Art first, mechanics second (all 11 steps are art-led) | **Grey-box first**, art at Phase 4 | Locked rule. Never spend on art for a mechanic that isn't proven fun. |
| D2 | `appShell.ts` **147 KB**, `CharacterPlaygroundScene.ts` 74 KB, `GameScene.ts` 67 KB | **400-line file ceiling**, justified per exception in QA-LOG | Our own rule (§B4 — the vault does *not* record size as their failure mode; their recorded failure was logic trapped in scenes where no unit test reaches it, which the ceiling also addresses) |
| D3 | Hand-rolled `levelData.ts` (15 KB) + custom Level Editor | **Tiled + Phaser tilemaps** | Their own lesson: *"hardcoded scenes slowed iteration."* Tiled delivers that benefit without us building an editor. Their schema (`metadata/platforms/props/pickups/enemies/exits`) becomes our object-layer contract. |
| D4 | Tests cover `levelProgress`, `profiles`, `settings` — **not** the player controller | TDD on the controller first | Vault **C4**: seven defects across seven phases that a green suite could not see. The feel is the game. |
| D5 | External **Sprite Fusion Pixel Snapper** for anchors | Do it in our own build step | Vault **4.15**: prose is not reproducibility — put the frame picks in the tracked generator and prove it rebuilds byte-identical. An external GUI tool cannot satisfy that. |
| D6 | Bounds edited by eye in the Gym | Gym edits by eye **plus** a measuring gate | Vault **4.18**: *a box is a claim about a sprite*, and four defects were found on the first proper audit of already-shipped art. **4.24**: look to find, count to decide. |
| D7 | Chroma green background | Same — **but measure alpha first** | Vault **A2**: their chroma workflow is evidence generators don't emit alpha, but that is *their* stack. We measure on the Gate 5 probe (free) before building the keying apparatus. If fal emits real alpha, we skip it entirely. |
| D8 | Single flat 256×256 cell for everything | **Two art kinds**: strict-grid tileset (tile layer) + variable-size object atlas (object layer) | Their own stated mistake: *"it was a mistake to make all atlas objects 256×256."* Reconciled with Tiled's fixed-grid requirement. |

---

## 6. The animation pipeline — the most valuable thing in the video

The author's strongest claim, at 22:11–22:35: image-generating each animation frame gave
**"a lot of additional stuff, and it wasn't a smooth motion"**, requiring manual frame picking.
Generating a **1-second video clip** and splitting its frames gave visibly smoother motion and was
*"ready for integration... you can just split the frames and use it pretty much straight away."*

He paid **7.2¢ per clip** using Grok Imagine directly.

> **Superseded at Gate 7 (2026-08-05).** The original Gate 4 analysis chose
> `xai/grok-imagine-video/v1.5/image-to-video` at $0.01/second. **The user has since directed that we
> use Seedance 2 instead**, for its much larger input surface. The Grok analysis is preserved in
> §6c because its *method* still applies and because the comparison is what makes Seedance's
> trade-offs legible. **The economics change by one to two orders of magnitude. Read §6b.**

### 6a. Seedance 2 — the endpoints, from the schema

Read from `genmedia schema` and the fal model-API reference on 2026-08-05.

| Endpoint | Category |
|---|---|
| `bytedance/seedance-2.0/image-to-video` | animate one starting frame — **our default** |
| `bytedance/seedance-2.0/reference-to-video` | identity lock across clips |
| `bytedance/seedance-2.0/text-to-video` | not useful here — we always have an anchor |
| `…/fast/*` and `…/mini/*` | cheaper tiers of all three |

**`image-to-video` inputs:**

| Field | Type | Default | Values / notes |
|---|---|---|---|
| `prompt` | string | — | **required** — the motion description |
| `image_url` | string | — | **required** — starting frame. JPEG/PNG/WebP, max 30 MB |
| `end_image_url` | string | — | **last** frame. Video transitions start → end |
| `duration` | string | `auto` | `auto`, or **`4`–`15`**. ⚠️ **minimum is 4 seconds** |
| `resolution` | string | `720p` | schema: `480p, 720p, 1080p, 4k` — ⚠️ **docs say `480p, 720p` only** |
| `aspect_ratio` | string | `auto` | `auto, 21:9, 16:9, 4:3, 1:1, 3:4, 9:16` |
| `generate_audio` | boolean | **`true`** | ⚠️ **set `false`** — we want frames, not a soundtrack |
| `bitrate_mode` | string | `standard` | `standard, high` |
| `end_user_id` | string | — | unused |

**Output:** `{ video, seed }` — and **nothing else**.

**`reference-to-video`** replaces `image_url`/`end_image_url` with three reference arrays. Total files
across all modalities must not exceed 12:

| Field | Limit | Referenced in the prompt as |
|---|---|---|
| `image_urls` | up to **9**, ≤30 MB each | `@Image1`, `@Image2`, … |
| `video_urls` | up to **3**, combined 2–15 s, <50 MB, each ~480p–720p | `@Video1`, … |
| `audio_urls` | — | `@Audio1`, … |

### 6b. What Seedance 2 costs — and why that number is not yet knowable

**Two authoritative sources disagree by ~22×.**

| Source | Figure |
|---|---|
| fal model-API reference, Seedance 2.0 pricing table | **$0.3034 / second** (720p with audio) · **$0.2419 / second** (fast tier) |
| `genmedia pricing` on all three 2.0 endpoints | **$0.014 / "unit"** — and the CLI does not define "unit" |
| `genmedia pricing` on `…/fast/image-to-video` | $0.0112 / unit |
| `genmedia pricing` on `…/mini/image-to-video` | $0.007 / 1000 tokens — a **different billing model entirely** |

This is vault **4.9** in its purest form: *the CLI's own cost preflight under-reported by ~6× last
project.* Here the two numbers are not even in the same order of magnitude, so **neither may be used
to authorise a batch.**

At the documented rate, with the 4-second floor:

| | Grok (superseded) | Seedance 2 | Seedance 2 fast |
|---|---|---|---|
| Minimum clip | 1 s | **4 s** | **4 s** |
| Cost of that clip | **$0.01** | **$1.21** | **$0.97** |
| 7 animations | $0.07 | **$8.50** | **$6.77** |

If instead the CLI's $0.014 figure is per second, seven animations cost **$0.39**. The honest spread
for one fully-animated character is therefore:

| Step | Endpoint | Cost |
|---|---|---|
| Anchor image | `fal-ai/nano-banana-pro` @ 2K | $0.15 |
| 7 animations × 4 s (the floor) | `bytedance/seedance-2.0/image-to-video` | **$0.39 – $8.50** |
| Background removal, if alpha is absent | `fal-ai/bria/background/remove` | $0.018 × n |
| **Total per character** | | **$0.54 – $8.65** |

Against Grok's ≈$0.28. **The floor of the new range is 1.9× the old cost; the ceiling is 31×.**

🔴 **Mandatory before any animation batch: ONE 4-second `image-to-video` probe, then read the actual
fal.ai invoice line for it.** Nothing downstream may be budgeted until that line is read. Present the
reconciled number to the user and stop. *(vault 4.9, plus the standing "STOP before any batch over 5
generations" constraint.)*

### 6c. What Seedance 2 gains and loses against Grok

**Gains, all real:**

1. **`end_image_url`.** Pass the anchor as *both* first and last frame and the clip is a **true loop** —
   which is exactly what idle, walk and run cycles need. Grok had no such control, so cycle closure
   was left to luck and frame-picking. This is the single most useful new input.
2. **`aspect_ratio` on `image-to-video`.** Grok's i2v had none; aspect was inherited from the anchor.
3. **9 reference images** on `reference-to-video` (Grok: 7), plus reference **videos** and **audio** —
   and unlike Grok, its price sits in the same table as the rest, so it is not unquotable.
4. **A 4-second clip is ~97 frames** at 24 fps versus Grok's ~25. See the caveat below.

**Losses, also real:**

1. 🔴 **The 4-second minimum.** Grok's 1-second floor is why a clip cost a cent. There is no way to
   buy less than 4 seconds of Seedance.
2. 🔴 **The output schema publishes no `fps` and no `num_frames`.** Grok's did — which is how the
   frame math was answered at Gate 4 for $0. **Seedance's frame rate is now an unknown that only a
   real clip and `ffprobe` can answer.** Do not assume 24 fps; measure it, and record the measured
   value in GENERATION-LOG.md.
3. **`resolution` is contested**: the schema advertises `1080p` and `4k`; the model-API reference lists
   only `480p` and `720p`. Probe at `720p` — the value both sources agree on — and treat the higher
   tiers as unverified.
4. **Price is no longer resolution-free.** Under Grok, 1080p cost the same as 480p because billing was
   duration-metered, so "always generate at 1080p" was free headroom. That rule does **not** carry
   over and is withdrawn.
5. **`generate_audio` defaults to `true`.** The docs state cost is identical either way, so this is
   bytes and generation time, not money — but set it `false` regardless.

⚠️ **The 4× oversampling is not automatically 4× the value.** ~97 frames of a 4-second clip is
*four seconds of motion*, not four times the detail of one second. Vault **4.7** applies harder, not
less: **the sampling rate is a prompt variable — name the cycle count.** A walk cycle must be asked
for as *"the character takes exactly six full strides during the clip"*, or 97 frames buys 97 samples
of one slow stride. With a 4× longer clip, an unnamed cycle count is a 4× more expensive mistake.

### Frame math — no longer free

Under Grok this section was answered from the output schema at $0. Under Seedance 2 it **cannot be**:
the output is `{video, seed}`. So the pipeline becomes:

1. Generate one 4 s clip at `720p`, `generate_audio: false`.
2. `ffprobe` it for real `fps`, `num_frames`, `width`, `height`. **Record them.** *(4.11 — read it
   from the file, never from a label or a doc.)*
3. Resample to the frame count the sim's active window needs — `fps = renderFrames × TICK_HZ /
   simTicks` *(4.22, blocker)*.
4. Align the contact frame to the active window; budget the wind-up at `startup − 1` ticks.

Per **4.15**, that frame-pick step lives in the tracked generator and must rebuild byte-identical —
not in a notebook, and not by hand.

**Escalate to `reference-to-video` only if** character identity drifts between separately-generated
animations (open question 3). Its 9-image array is the lever. Same rule as everything else here: one
probe, one invoice check, then decide.

### The trap this introduces

A video model outputs frames at *its* frame rate over *its* duration — which has nothing to do with
our simulation. This walks straight into vault **4.22** (blocker):

> Derive the animation frame rate from the simulation, never author it:
> `fps = renderFrames × TICK_HZ / simTicks`. Every light attack had 0.43 s of art over a 0.25–0.27 s
> move, so playback was cut at ~60% and **the strike was never drawn.**

So: generate the clip, **measure its real fps**, **then** resample to the frame count the sim's active
window actually needs, then align the contact frame to the active window, then budget the wind-up
`startup − 1` ticks. And per **4.7**, the sampling rate is a prompt variable — name the cycle count
("bobs exactly TWICE during the clip") rather than hoping. Under Seedance 2's 4-second floor this
matters four times as much.

---

## 7. Where the video conflicts with a skill or the vault

Per the standing rule — skill beats tutorial, vault beats tutorial.

1. **Video uses an external GUI tool (Sprite Fusion Pixel Snapper) for pixel snapping.** → Vault
   **4.15** wins: it must be a tracked, rebuildable step. We implement snapping in our own generator.
2. **Video hand-rolls levels and an editor.** → The `tilemaps` skill wins; Tiled is the authoring tool.
3. **Video tunes enemies by feel and saves configs.** → Kept, *plus* vault **A6/C2**: sweep every knob
   once and confirm the number moves. A slider that visibly exists reads as a slider that works.
4. **Video's HUD prompt asks for `#FF00FF` chroma** (frame 74, verbatim: *"a perfectly flat solid
   #FF00FF chroma-key background for background removal"*). → Vault **4.13** wins: key by L1 colour
   distance with a tolerance, never equality — only **0.004%** of pixels came back exactly pure.
5. **Video's enemy AI is described in terms of per-frame probability/state.** → Vault **2.9** (blocker)
   wins: a per-tick probability is not a behaviour; commit to episodes, or the walk animation never
   leaves frame 0.

---

## 8. What the video gives us for Gate 5

Directly reusable as *method*, to be re-verified as *fact*:

- **Negative prompt set:** no UI text, no logos, no readable words, no photorealism, no 3D render
  style, no blur, no smooth gradients, no cluttered backgrounds.
- **Framing instruction:** mockups must read as **gameplay screenshots at gameplay scale**, not poster
  art — *"prioritize readability over spectacle."* The winning mockup was the most readable, not the busiest.
- **Visual-target vocabulary** actually used on screen (frame 17): *"forest village outflow /
  side-scrolling composition / readable platform silhouettes."*
- **Parallax spec** (frame 43): *"three alpha parallax layers / Phaser TileSprites / scroll factors in
  asset order / browser-verified movement."*
- **Splash screen:** ask for **poster-styled**, explicitly *not* in-game-styled, or the model returns a
  mockup of a game screen.
- **HUD:** portrait + bar generated as **one** sheet with a chroma-filled region to be used as a
  dynamic fill mask.

---

## 9. Open questions carried into Gate 5 / the PRD

Renumbered at Gate 7. Questions 1, 2 and 4 were answered for the *old* models and the Gate 7 model
swap **reopened all three** — that reopening is itself the most important thing on this list.

1. 🔴 **Does `nano-banana-pro` emit real alpha?** `nano-banana-2` did not. Different model, unanswered
   again. Decides whether the whole chroma apparatus is needed. (A2, STYLE.md gate 0.2)
2. 🔴 **What pixel dimensions does `nano-banana-pro` actually return** at `16:9` / `2K`?
   `nano-banana-2` returned `2752 × 1536`. Measured numbers become the contract, never the labels.
   (4.11, STYLE.md gate 0.1)
3. **Does `seedance-2.0/image-to-video` preserve character identity** across separately-generated
   clips, or is `reference-to-video` required?
4. 🔴 **What frame rate and frame count does a 4 s Seedance 2 clip yield?** This was free to answer
   for Grok because its output schema published `fps` and `num_frames`. **Seedance 2's does not** —
   its output is `{video, seed}`. Only `ffprobe` on a real clip answers it, so this now costs a
   generation. (4.22, SOURCE-ANALYSIS §6c)
5. 🔴 **What does a Seedance 2 clip actually cost?** Two sources disagree by ~22× ($0.3034/second vs
   $0.014/unit). One 4 s probe, then read the invoice line. Nothing may be batched before that. (4.9)
6. **Is `resolution` above `720p` real?** The schema advertises `1080p` and `4k`; the model-API
   reference lists only `480p` and `720p`.
7. **Tileset grid-exactness** — can post-processing reliably hit the Phase 3 cell size given only
   `aspect_ratio` + `resolution`? Unchanged by the swap; `nano-banana-pro` also exposes no
   explicit width/height.
