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

**That model is on fal.ai, and through `genmedia` it costs 1¢.** Verified from the pricing API:

| Endpoint | Price | Inputs | Verdict |
|---|---|---|---|
| `xai/grok-imagine-video/v1.5/image-to-video` | **$0.01 / second** | `image_url`, `prompt`, `duration` (**min 1, max 15**), `resolution` 480p/720p/1080p | **Use this.** A 1-second clip is **1¢**. |
| `xai/grok-imagine-video/v1.5/reference-to-video` | **`0.00` "compute seconds"** ⚠️ | `reference_image_urls[]` with `<IMAGE_0>` prompt tags, `aspect_ratio`, `duration` 8, 480p/720p | Better character consistency, but **cost is unquotable** |

⚠️ **`0.00` is not free.** It is the pricing API declining to quote a compute-metered endpoint —
exactly vault **4.9**: *the CLI's own cost preflight under-reported by ~6× (quoted 0.2/job, billed
~1.5)*. **Do not run `reference-to-video` without a single deliberate probe and an invoice check.**

### Frame math, from the endpoint's own output schema

The `image-to-video` output example pins the numbers, so this needed no spend to answer:

```json
{ "duration": 6.041667, "fps": 24, "num_frames": 145, "width": 1280, "height": 720 }
```

**24 fps**, `num_frames ≈ duration × 24 + 1`. Therefore **a 1-second clip yields ~25 frames for 1¢.**

Two consequences:

1. **Always generate at 1080p.** Price is metered on `duration`, not `resolution` — `$0.01/second`
   regardless. 1080p is free relative to 480p and gives far more headroom to downscale into pixel-art
   sprite dimensions.
2. **~25 frames for an 8–10 frame cycle is ~3× oversampling, and that is the point.** We get to
   *choose* which frames to keep and where the cycle phase lands, rather than accepting the model's
   spacing. This is the direct countermeasure to vault **4.7**: *"cyclic motions run too few cycles
   and 8 samples land at the same phase."* Combined with **4.22** (`fps = renderFrames × TICK_HZ /
   simTicks`), the resample step becomes: generate 25 → pick N where N is what the sim's active
   window needs → align the contact frame → budget wind-up at `startup − 1` ticks.

Per **4.15**, that frame-pick step lives in the tracked generator and must rebuild byte-identical —
not in a notebook, and not by hand.

### `image-to-video` vs `reference-to-video`, in full

| | `image-to-video` | `reference-to-video` |
|---|---|---|
| **Price** | **$0.01 / second**, quoted | **`0.00` "compute seconds"** ⚠️ unquotable |
| Image inputs | one `image_url` | up to **7** `reference_image_urls`, tagged `<IMAGE_0>`, `<IMAGE_1>`, … in the prompt |
| `resolution` | 480p / 720p / **1080p** | 480p / 720p only |
| `aspect_ratio` | ✗ — inherits from the input image | ✓ `16:9, 4:3, 3:2, 1:1, 2:3, 3:4, 9:16` |
| `duration` | 1–15 s, default 6 | 1–15 s, default 8 |
| Output | 24 fps, ~25 frames/s | **24 fps**, 192 frames @ 8 s — identical |
| Released | 2026-05-31 | **2026-07-29** (updated 2026-08-01) |

**Why the price is unquotable:** `reference-to-video` is a brand-new endpoint, so compute-metered
billing is not yet in the pricing table. That explains the `0.00` — it does not make it safe. Vault
**4.9** stands: budget from the invoice, not the estimate.

**Decision:** default to **`image-to-video` at 1080p**, where cost is known and resolution is highest.
Losing `aspect_ratio` costs nothing — inheriting aspect from a 1:1 anchor is exactly what a character
sprite wants. Losing 1080p on the reference variant also costs little at pixel-art target sizes.

**Escalate to `reference-to-video` only if** character identity drifts between separately-generated
animations (open question 3). Its 7-image reference array is the real lever for that, and nothing
else on fal offers it at this price class. **If we escalate: run exactly ONE 1-second probe, then
check the invoice before any batch.** That is vault **4.9** applied literally.

### Resulting cost model for one character

| Step | Endpoint | Cost |
|---|---|---|
| Anchor / reference image | `fal-ai/nano-banana-2` | $0.08 |
| 7 animations × 1 s clip (idle, walk, run, jump, attack, hurt, death) | `grok-imagine-video/v1.5/image-to-video` | 7 × $0.01 = **$0.07** |
| Background removal, if alpha is absent | `fal-ai/bria/background/remove` | $0.018 × n |
| **Total per character, fully animated** | | **≈ $0.15–0.30** |

This is materially cheaper than generating each frame as a still, and the source material says it
looks better. **It also stays entirely inside fal.ai via `genmedia`, so the locked "all art through
the fal CLI" constraint holds.**

### The trap this introduces

A video model outputs frames at *its* frame rate over *its* duration — which has nothing to do with
our simulation. This walks straight into vault **4.22** (blocker):

> Derive the animation frame rate from the simulation, never author it:
> `fps = renderFrames × TICK_HZ / simTicks`. Every light attack had 0.43 s of art over a 0.25–0.27 s
> move, so playback was cut at ~60% and **the strike was never drawn.**

So: generate 1 s, **then** resample to the frame count the sim's active window actually needs, then
align the contact frame to the active window, then budget the wind-up `startup − 1` ticks. And per
**4.7**, the sampling rate is a prompt variable — name the cycle count ("bobs exactly TWICE during
the clip") rather than hoping.

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

1. **Does fal.ai emit real alpha?** Measure on the probe images. Decides whether the whole chroma
   apparatus is needed. (A2)
2. **What pixel dimensions does `nano-banana-2` actually return** for `1:1`, `21:9`, `8:1` at 2K?
   Measured numbers become the contract, never the labels. (A2c, 3.2)
3. **Does `grok-imagine-video` preserve character identity** well enough across separate 1-second
   clips, or is `reference-to-video` required — and if so, what does it actually cost?
4. ~~What frame rate and frame count does a 1 s Grok clip yield?~~ **ANSWERED at Gate 4, $0** —
   24 fps, ~25 frames per second of clip, from the endpoint's own output schema. `duration` accepts
   1–15 s. Price is duration-metered so **1080p is free**. Remaining sub-question: does resampling
   25 → N survive contact-frame alignment in practice? Only a real clip answers that. (4.22)
5. **Tileset grid-exactness** — can post-processing reliably hit the Phase 3 cell size given only
   `aspect_ratio` + `resolution`? This is the one place A2c could bite.
