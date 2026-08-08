# ASSET-PIPELINE.md

How a fal.ai generation becomes something the game can trust.

> **The acceptance test, adopted verbatim from the reference project:**
> *"Art is not an asset yet. It becomes an asset when the game can trust its catalog entry, bounds,
> anchor, active frames, and saved config."*

Nothing in `public/assets/` is an asset until it satisfies that sentence. Everything before that is a
file.

---

## 0. Two kinds of art — decide first

This split resolves a genuine conflict: the reference project's lesson says *don't force every object
into a fixed cell*, while Tiled **requires** a fixed grid. Both are right about different things.

| Kind | Contents | Format | Enters Tiled as |
|---|---|---|---|
| **Tileset** | ground, ledges, platform pieces, corners, supports | **strict fixed grid**, one cell size, no padding | tile layer |
| **Object atlas** | props, pickups, lanterns, crates, signs, large set dressing | **variable frame sizes**, padded, chroma-backed, JSON metadata | object layer |
| **Sprite sheet** | character and enemy animations | fixed cell **per animation**, not globally | not in Tiled — loaded by key |

## 0a. The Phase 4 art contract — PUBLISHED by Phase 3

Every number below is **binding**. Phase 4 spends real money against them, and
`tests/unit/tilemap-data.test.ts` asserts this table matches `src/game/constants.ts`,
`src/sim/player.ts` and the shipped `.tmj` — so the doc and the code cannot drift while both look
right in isolation *(Codex plan review P8; criteria 3.6 and 3.6b)*.

| What | Value | Where it lives in code |
|---|---|---|
| **Grid cell size** | **`96 × 96` px** | `TILE_SIZE` |
| **Camera zoom** | **`1`** | `CAMERA_ZOOM` |
| **Viewport / world view** | **`1920 × 1080` px = `20 × 11.25` tiles** | `GAME_WIDTH`, `GAME_HEIGHT` |
| **World extent (level-01)** | **`8640 × 2112` px = `90 × 22` tiles** | measured off the shipped `.tmj` |
| **Camera travel** | **`6720 × 1032` px** | extent − world view |
| **Character collision box** | **`132 × 288` px = `1.375 × 3.0` tiles** | `PLAYER_BOX × RENDER_SCALE` |
| **Character render height** | **`288` px — 26.67 % of screen height** | `PLAYER_BOX.h × RENDER_SCALE` |
| **Render scale** | **`RENDER_SCALE` 6** | `RENDER_SCALE` |

At zoom 1 a 96 px tile draws at 96 px and the character draws at 288 px. **Sprite art is authored
at these exact pixel sizes** — there is no further scaling between the sheet and the screen, which
is what makes "readable at true sprite size" (Phase 4 gate 4.1) a testable claim rather than a
range.

**Character target: 288 px tall = 3 tiles**, which is STYLE.md's locked *96–128 px = 3–4 tiles*
read as the **ratio** it always was. STYLE.md §9 predicted the character would read as *"closer to
20 % of screen height"*; Phase 3 measured **8.89 %** and superseded it, and Phase 4's re-scale lands
at **26.67 %** — nearer §9's first instinct than the measurement that replaced it. §9 is outside
every hash-locked slice, so this moves no hash.

> **Why the character grew, twice.**
>
> Phase 2 shipped a 46 px collision box — 4 % of screen height, which no art can be generated
> against. The Codex plan review (P9) named it as the number Phase 4 needs and does not have.
> Growing it 46 → 96 px doubled every distance-dimensioned tuning knob and left every tick- and
> ratio-dimensioned one alone, so airtime was unchanged at 37 ticks and the jump apex exactly
> doubled to 300.6 px.
>
> **Phase 4 grew it again, 96 → 288 px, by user decision**, with `TILE_SIZE` 32 → 96 alongside so
> the character stays 3 tiles tall. The reason is resolution, not size: the generated source figure
> is **935 px tall**, and cutting it to 96 px discarded about 90 % of the linear detail. No camera
> zoom can restore that — zooming displays the 96 px that survived as 3×3 blocks. Re-cutting the
> same source at 288 px is still a **3.2× downscale**, so every pixel drawn is one the model
> actually drew. The reference art being matched carries detail 96 px cannot hold.
>
> This time the knobs did **not** simply scale. A pure ×3 preserves the feel exactly, and the feel
> was wrong in two ways that are invisible in px/tick and only appear once the character fills the
> screen: top speed was 6.5 body heights per second either way, and a 3.13-body-height jump went
> from 28 % of the screen to **84 %** of it. The re-tune is derived from perceptual targets
> instead — 2.5 heights/s and a ~1.6-height apex — with **airtime held at 37 ticks**, because
> `tick.ts`'s order is the contract Phase 5 is written against. Full reasoning in
> `src/sim/player.ts`; measured evidence in `docs/qa/phase-04-art.md`.

---

---

## 1. Naming convention

```
public/assets/
  characters/<slug>/
    anchor.png                 the locked reference image
    sheets/<action>.png        idle | walk | run | jump | attack | hurt | death
    sheets/<action>.json       frame metadata
  enemies/<slug>/              same shape
  tiles/<setname>.png          strict 32px grid
  objects/<setname>.png        variable frames
  objects/<setname>.json       per-frame name, role, anchor, collision
  hud/
  audio/
  config/
    character-bounds.json      bounds + active frames, per animation
  index.json                   THE CATALOG
_generated/                    raw model output + job records. NOT shipped.
```

Slugs are kebab-case and derived from the subject (`brass-courier`). **A slug never changes** — it is
the join key between the catalog, the bounds config and the loader.

---

## 2. Generate

Per [STYLE.md](STYLE.md). Always through `genmedia`, never curl.
**Full input/output schema, price, and every known gotcha for this and every other endpoint:
[FAL-MODELS.md](FAL-MODELS.md).**

🔴 **`image_url` fields take a URL, not a path.** Our anchor is a local PNG, so every animation call
is two steps: `genmedia upload ./anchor.png` → CDN URL → pass that. *(FAL-MODELS §0)*

```bash
genmedia run fal-ai/nano-banana-pro \
  --prompt "<STYLE.md template with slots filled>" \
  --seed <recorded> --aspect_ratio "1:1" --resolution "2K" \
  --output_format png --num_images 1 \
  --download "./_generated/<slug>/{request_id}.{ext}" --json
```

**$0.15 per image at 1K/2K; 4K is billed at 2×.** Unlike `nano-banana-2`, the price is **not** flat,
so "generate at 4K and downscale" is no longer free. Stay at `2K` unless a specific asset earns the
doubling. Do not set `enable_web_search` — it makes the output depend on the live web and destroys
reproducibility. See [STYLE.md](STYLE.md) §2 for the full input schema.

**Rules that cost real money to learn:**

- **Save the exact prompt and job record beside the output.** Redirect **stdout only** — merging stderr
  corrupts the JSON — and write the record only *after* the call succeeds. *(vault 4.17)*
- **Read `width`/`height` from the downloaded file, never from the aspect label.** On `nano-banana-2`,
  `16:9 @ 2K` returned `2752×1536` = `1.7917`, not `1.7778`, and the job record returned `width: null`.
  🔴 **That was a different model. `nano-banana-pro`'s returned dimensions are unmeasured** — treat no
  dimension as known until the Gate 0 probe reads one off disk. *(4.11)*
- **Never contradict your own prompt.** A self-contradicting clause cost 12 credits last time. *(4.3)*
- **When output is wrong, change the reference, not the wording.** *(4.1)* And when this model refuses
  to drop an element, **constrain its geometry** rather than negating it. *(STYLE.md §6)*
- **Probe one, then batch.** Budget from the invoice, not the estimate — the last preflight
  under-reported by ~6×. *(4.9)*

### Animation: video → frames

Smoother than generating each pose, and the source material says it looks better.
**Read [SOURCE-ANALYSIS.md](SOURCE-ANALYSIS.md) §6 before running this — the cost is contested.**

```bash
genmedia run bytedance/seedance-2.0/image-to-video \
  --image_url "<anchor url>" \
  --end_image_url "<anchor url>" \
  --prompt "<motion, naming the exact cycle count>" \
  --duration 4 --resolution 720p --aspect_ratio "1:1" \
  --generate_audio false --download "./_generated/<slug>/<action>.mp4" --json
```

Every flag above is deliberate:

- **`--duration 4`** — the minimum. Seedance 2 cannot generate a shorter clip.
- **`--end_image_url` = the same anchor** — *intended* to close the clip into a **true loop**, which is
  what idle, walk and run cycles need. **Unverified: the input exists, its loop quality does not yet.**
  Phase 4 gate 4.9 is what decides whether it works. Omit it for one-shot actions (attack, hurt,
  death), where the end pose differs.
- **`--resolution 720p`** — the only value the schema and the model-API reference agree on. Higher
  tiers are advertised by one and not the other, and **price is no longer resolution-free**, so the old
  "always generate at 1080p" rule is withdrawn.
- **`--generate_audio false`** — it defaults to `true`; we want frames.

🔴 **Two things you do NOT know here and must measure:**

1. **The real fps and frame count.** Seedance 2's output is `{video, seed}` — no `fps`, no
   `num_frames`. `ffprobe` the downloaded clip and record what it actually says. *(4.11)*
2. **The real price.** `genmedia pricing` says `$0.014/unit`; the model-API reference says
   `$0.3034/second`. **One 4 s probe, then read the invoice line, then present the number and stop.**
   *(4.9)*

⚠️ A 4-second clip is *four seconds of motion*, not four times the detail. **Name the cycle count in
the prompt** — "takes exactly six full strides during the clip" — or the oversampling buys nothing.
*(4.7, and it now costs 4× more to get wrong than under a 1-second clip.)*

**Do not compute a frame count from an assumed frame rate here.** Grok published 24 fps in its output
schema; Seedance 2 publishes nothing. Until step 1 below has `ffprobe`d a real clip, the frame count
of a 4-second Seedance clip is **unknown**, and any number written down before then is a label, not a
measurement. *(4.11)*

`reference-to-video` accepts up to **9** `image_urls` (referenced as `@Image1`, `@Image2`, …), plus up
to 3 `video_urls` and `audio_urls`, total files ≤ 12. It is the lever for cross-clip character
identity. Same rule: one probe, one invoice check, then decide.

---

## 3. Background removal

**Chroma keying is mandatory until proven otherwise, and that is a deliberate default.**

The measurement behind it — `mode=RGB`, alpha genuinely absent, not "RGBA with alpha 255" — was taken
on **`nano-banana-2`**, which is no longer our model. `nano-banana-pro` is unmeasured (STYLE.md gate
0.2). We keep the apparatus mandatory because the two failure directions are not symmetric: keying an
image that already has alpha wastes a step, while assuming alpha that is not there ships every sprite
on an opaque rectangle. **Re-measure at gate 0; drop this step only on evidence, never on hope.**

- **Never test `mode == "RGBA"`. Read the alpha channel.** *(4.12)*
- **Key by L1 colour distance with a tolerance, never equality.** Ask for `#FF00FF` and you get
  `~(252,1,252)`; only **0.004%** of pixels come back exactly pure. Working thresholds are a low/high
  pair (40 / 120) plus a despill step, kept in **one shared module** so every gate uses the same
  numbers. *(4.13)*
- **Judge specks by connected-component area (min 256 px)**, not `alpha > 0` — twelve dither specks
  will drag a bounding box to the whole canvas.
- 🔴 **Keep-largest-component is safe for held and idle poses and MUST NOT be applied to jump, air or
  attack states**, where the key's anti-aliasing gap legitimately splits off a fist or a foot. *(4.13)*

`fal-ai/bria/background/remove` is the fallback where chroma keying fails. **$0.018 per generation**
— source: `genmedia pricing fal-ai/bria/background/remove` → `0.018 / generations / USD`, read
2026-08-05. Quoted rate, not an invoice. Full schema: [FAL-MODELS.md](FAL-MODELS.md) §5.

---

## 4. Trim, pack, and the ordering trap

🔴 **The blocker in this whole document:** a build step that derives a **global** constant from **one**
asset creates an invisible dependency on every other asset. Last project derived one scale per
character from idle frame 0 and applied it to every sheet — so regenerating the idle silently rescaled
everything and moved measured contact frames by a pixel. *(4.14 / A5)*

**Therefore:**
- Derive shared constants from something that **does not get regenerated** — the published 32px grid,
  not a frame.
- Write the rebuild order down beside the commands.
- **Never rescale one state's frames to fix framing.** Shift the figure, area preserved, to the pixel.

**Frame picks live in the tracked generator** (`tools/gen/frames.ts`) and must rebuild **byte-identical**.
Prose is not reproducibility: hand-picked frames documented in a doc meant the documented command would
have rebuilt the known-bad sheet while the docs said in good faith it reproduced the good one. *(4.15)*

**A declared input that cannot be found fails the build.** It does not substitute. Substituting is
allowed in the editor; in the build it is the bug — the silent fallback to a standing idle produced the
worst art defect in the reference project, and it is the *default* on a fresh clone because
`_generated/` is gitignored. *(4.16)*

---

## 5. Animation timing — derive it, never author it

```
fps = renderFrames × TICK_HZ / simTicks
```

🔴 Authoring a flat fps is how *every light attack ended up with 0.43 s of art over a 0.25 s move, so
playback was cut at ~60% and the strike was never drawn.* *(4.22, blocker)*

Then, in order:
1. **Align the contact frame with the active window.** The strike landed on a wind-up pose on 10 of 18
   sheets last time.
2. **Budget the wind-up at `startup − 1` ticks** — the animation starts one tick behind the sim,
   because `play()` runs in the render pass after the entering tick.
3. **Sweep the whole class.** Attacks got the derivation and everything else kept a flat rate for two
   more phases, which gave a knockdown 750 ms of art for a 300 ms state.
4. **Verify the loop flag per clip.** A held state must not loop if any frame leaves the pose, and
   needs its own motion floor — two held sheets shipped reading as frozen stills with every gate green.
   *(4.23)*

---

## 6. Bounds and anchors — the Gym's job

**A box is a claim about a sprite, and no test comparing code to code can check it.** *(4.18, blocker)*

Method that worked: **difference each frame against frame 0, take the y band of the furthest-forward
moved pixels.** Three traps inside it:
- Furthest opaque **column** is the wrong metric — a planted leg is the widest thing in frame.
- A sheet the metric cannot call must report **INDETERMINATE**, never a guess.
- The number that matters is the **visible gap** — a hitbox must reach the defender's hurt box, not
  their skin.

Overlay colours, fixed: **white** = source frame bounds · **blue** = visual footprint ·
**green** = collision · **red** = attack hitbox.

Bounds are saved **per animation**, with an "apply to all" action for shared collision.
**Attack hitboxes need per-frame active toggles** — wind-up and recovery frames must not register hits.

⚠️ The Gym writes `config/character-bounds.json`, which makes its save path an **authorization
decision**: it must sit inside a typecheck program and the test include list. And an e2e spec that
writes shipped configuration is **using live ammunition** — atomic write plus a restore that survives a
Windows file-lock error, or the real registry ships a mutated entity into every later spec. *(A4)*

---

## 7. Gates, and what they cannot see

**Every gate self-tests on synthetic fixtures before it judges real art**, and must be runnable with
the source art absent. *(4.21)*

Known blind spots — state them rather than shipping a number that means nothing *(vault 9.3)*:

| Blind spot | Why | Cover it by |
|---|---|---|
| Anatomy | silhouette metrics score an extra limb **favourably** — a crouching heavy shipped with a literal third leg, passing every gate *(4.20)* | looking |
| Direction | every art metric last time was vertical, so a purely-upward attack measured beautifully while nothing crossed the gap *(4.19)* | enumerate the axes first |
| Brass-cap rule | it is a **local edge cue**; no whole-region metric can see it *(STYLE.md §5)* | looking |
| Readability at true size | a 2752px image says nothing about a 128px sprite | downscale and look |

**Look to find, count to decide.** An eyeball pass over ten sampled frames once put a defect boundary
ten frames off and produced a confident, impossible remediation plan. The inverse also happened: a slot
passed every metric and still left a black band above every head. *(4.24)*

---

## 8. The catalog — `public/assets/index.json`

The single source of truth. **An entry here is what makes a file an asset.**

```json
{
  "characters": {
    "brass-courier": {
      "animations": {
        "walk": {
          "key": "brass-courier-walk",
          "path": "characters/brass-courier/sheets/walk.png",
          "frameWidth": 128, "frameHeight": 128,
          "frameCount": 8,
          "fps": 12,
          "loop": true,
          "simTicks": 40,
          "activeFrames": []
        }
      }
    }
  }
}
```

`fps` is **derived** (§5) and `simTicks` records what it was derived from, so the gate can recompute it.

---

## 9. Phaser 4 loading

```ts
// BootScene.preload
this.load.json('catalog', 'assets/index.json');

// after catalog load, for each animation entry
this.load.spritesheet(entry.key, entry.path, {
  frameWidth: entry.frameWidth,
  frameHeight: entry.frameHeight,
});
```

- **The loader must refuse to route past boot if any expected texture is missing** — blocking a 404
  *and* a corrupt 200. *(1.3)*
- **The loader has no default timeout.** A request that never resolves hangs boot forever. The last
  project measured this and deliberately did **not** fix it, because the failure direction is safe.
  Decide consciously and record the decision. *(1.4)*
- **Decide pixel-art vs smooth filtering once and assert it.** Phaser's scale-mode constants are
  reversed from intuition (linear = 0 = default), so the assertion needs a comment. A CSS
  pixel-snapping property once silently contradicted the engine-side decision on every phone. *(1.5)*
- ⚠️ **Re-verify the power-of-two mipmap constraint on Phaser 4** before acting on it — the vault
  flags it as a WebGL 1 / older-GPU limitation that WebGL 2 largely relaxes. *(4.25)*

---

## 10. The rebuild contract

From a fresh clone with `_generated/` absent:

1. `npm run assets:fetch` — re-fetch job records by request id. **Completed job records are free to
   re-fetch; failed jobs cost nothing.** *(4.9)*
2. `npm run assets:build` — key, trim, pack, derive fps, emit `index.json`.
3. `npm run assets:verify` — gates self-test on fixtures, then judge.

**Success is byte-identical PNGs.** Anything less is not reproducibility. *(4.15)*
