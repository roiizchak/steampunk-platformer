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

**Grid cell size: `32 × 32` px.** Published by Phase 3; Phase 4 art must hit it. Character target is
**96–128 px tall = 3–4 tiles.**

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

```bash
genmedia run fal-ai/nano-banana-2 \
  --prompt "<STYLE.md template with slots filled>" \
  --seed <recorded> --aspect_ratio "1:1" --resolution "2K" \
  --output_format png \
  --download "./_generated/<slug>/{request_id}.{ext}" --json
```

**Rules that cost real money to learn:**

- **Save the exact prompt and job record beside the output.** Redirect **stdout only** — merging stderr
  corrupts the JSON — and write the record only *after* the call succeeds. *(vault 4.17)*
- **Read `width`/`height` from the downloaded file, never from the aspect label.** `16:9 @ 2K` returns
  `2752×1536` = `1.7917`, not `1.7778`. The job record returns `width: null`. *(4.11)*
- **Never contradict your own prompt.** A self-contradicting clause cost 12 credits last time. *(4.3)*
- **When output is wrong, change the reference, not the wording.** *(4.1)* And when this model refuses
  to drop an element, **constrain its geometry** rather than negating it. *(STYLE.md §6)*
- **Probe one, then batch.** Budget from the invoice, not the estimate — the last preflight
  under-reported by ~6×. *(4.9)*

### Animation: video → frames

Cheaper and smoother than generating each pose. *(SOURCE-ANALYSIS §6)*

```bash
genmedia run xai/grok-imagine-video/v1.5/image-to-video \
  --image_url "<anchor url>" --prompt "<motion, naming the cycle count>" \
  --duration 1 --resolution 1080p --download "./_generated/<slug>/<action>.mp4" --json
```

`$0.01/second` · **24 fps** · ~**25 frames** per 1 s clip · **1080p costs the same as 480p** because
price is metered on duration. 25 frames for an 8–10 frame cycle is ~3× oversampling — that headroom is
the point: **we choose the frames and the phase**, rather than accepting the model's spacing. *(4.7)*

⚠️ `reference-to-video` accepts 7 reference images and is the lever for cross-clip identity, but its
price is **unquotable** (`0.00 compute seconds`). One probe, then check the invoice, before any batch.

---

## 3. Background removal

**Measured fact: nano-banana-2 returns `mode=RGB` with no alpha channel at all.** Not "RGBA with alpha
255" — genuinely absent. Chroma keying is **mandatory**, not optional.

- **Never test `mode == "RGBA"`. Read the alpha channel.** *(4.12)*
- **Key by L1 colour distance with a tolerance, never equality.** Ask for `#FF00FF` and you get
  `~(252,1,252)`; only **0.004%** of pixels come back exactly pure. Working thresholds are a low/high
  pair (40 / 120) plus a despill step, kept in **one shared module** so every gate uses the same
  numbers. *(4.13)*
- **Judge specks by connected-component area (min 256 px)**, not `alpha > 0` — twelve dither specks
  will drag a bounding box to the whole canvas.
- 🔴 **Keep-largest-component is safe for held and idle poses and MUST NOT be applied to jump, air or
  attack states**, where the key's anti-aliasing gap legitimately splits off a fist or a foot. *(4.13)*

`fal-ai/bria/background/remove` ($0.018) is the fallback where chroma keying fails.

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
