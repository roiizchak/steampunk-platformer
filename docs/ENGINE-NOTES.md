# Engine notes — Phaser 4.2.1

Behaviour measured against `phaser@4.2.1` on this machine, in the phase named. Every item cost a
debugging session; none of them is in the Phaser docs in the form written here. **Read the section
for the subsystem you are about to touch.**

Fuller detail and the evidence for each is in [QA-LOG.md](QA-LOG.md), under the phase tagged.

---

## Renderer and configuration *(Phase 1)*

- **`Phaser.AUTO`, never `Phaser.WEBGL`.** The latter has no Canvas fallback and fails silently.
- **`pixelArt: true` does not pin filtering on the Canvas renderer.** `TextureSource.scaleMode` is
  hardcoded to `DEFAULT` (= LINEAR = 0) and never derived from config; Canvas draws with
  `imageSmoothingEnabled = !scaleMode`. Call `setFilter(NEAREST)` explicitly per texture.
- **Two unrelated things are named "scale mode":** `Phaser.ScaleModes` (texture filtering) and
  `Phaser.Scale.ScaleModes` (canvas fitting). They are not interchangeable.
- **Default `scale.mode` is `NONE`**, not `FIT`. Set it explicitly.
- **The ScaleManager owns `canvas.style`.** Never write project CSS targeting the canvas element.
- **Arcade Physics is not used and must not be.** `Body.velocity` is px/**second**, integrated with a
  delta inside `World.step` — the exact multiply *(vault 2.1)* forbids — and it lives in `phaser`,
  which *(vault 1.1)* forbids `src/sim/` importing. There is deliberately no `physics` block in
  `gameConfig`, and `tests/unit/docs-contract.test.ts` fails if a phase document asks for the
  `physics-arcade` skill.

## Loading and caches *(Phase 1)*

- **Phaser's caches are game-global and survive a scene restart**, and `LoaderPlugin.addFile`
  silently skips any already-cached key. Any load-and-verify gate becomes a **no-op on the second
  entry to the scene** unless the key is dropped first. Applies to textures *and* the JSON catalog.
  This is the most dangerous item on this page: it turns a working gate decorative without anyone
  touching the gate.
- **An undecodable image is dropped silently.** `File.onProcessError()` emits **no event** (there is
  no `FILE_PROCESS_ERROR`) and does not move `totalFailed`. Verify the *outcome* — is the texture in
  the cache — never a completion signal.
- **`loader.maxRetries` defaults to 2**, so a failing file is attempted three times. Size test
  timeouts for that, or a correct refusal reads as a hang.
- **Vite's dev server never returns 404** — a missing file gets 200 plus SPA-fallback HTML. To test a
  real 404, force it with Playwright route interception.

## Scenes *(Phase 1)*

- **Reset scene state in `init()`, not the constructor.** Scene starts are queued; the constructor
  runs once, `init()` runs per start.

## Game objects *(Phase 2)*

- **Game Objects default to origin `0.5, 0.5`.** A feet-anchored convention must call
  `setOrigin(0.5, 1)` explicitly, or the sprite floats half its height above the ground.
- **`Rectangle` has no `setFlipX`.** The Flip component is mixed into Sprite and Image but **not**
  into Shape. The typechecker catches this; no test would.
- **Tint is WebGL-only.** The game runs `Phaser.AUTO` with a live Canvas fallback, so a tinted
  texture is not usable as a grey-box primitive — it renders plain white. Use a filled `Rectangle`.
  Also, `setTintFill` no longer exists in v4: `setTint(c).setTintMode(Phaser.TintModes.FILL)`.

## Input *(Phase 2)*

- **`JustDown()` is a consuming read** that resets when checked, so two readers in one frame lose the
  edge; polling `isDown` misses a press-and-release inside one frame. Latch edges from the keyboard
  **event**, and register keys with **`emitOnRepeat: false`** — the OS repeats a held key ~30×/s and
  every repeat would otherwise latch a fresh press.
- **Phaser dedupes keyboard events** on `(code, timeStamp, type)`. Synthetic `KeyboardEvent`s built
  in one tight loop share a `timeStamp` and get collapsed. Chromium also ignores `keyCode` in the
  constructor, so attach it with `Object.defineProperty` or the event reaches nothing.

## Time *(Phase 2)*

- **`TimerEvent` / `Clock` are wall-clock and honour `timeScale`**, and `addEvent` is deferred to the
  next frame. Keep them away from anything the simulation depends on — the sim's only clock is
  [`src/game/frameClock.ts`](../src/game/frameClock.ts).

## Tilemaps *(Phase 3)*

The vault had **zero** tilemap coverage before this phase *(vault A3)*, so all of this is new.

- **`TilemapGPULayer` is unusable in this project, and it is not a close call.** It is WebGL-only
  and `TilemapGPULayerRender.js:7-20` installs a **no-op Canvas renderer** — where the ordinary
  `TilemapLayer` installs both. The game runs `Phaser.AUTO` with a live Canvas fallback, so a GPU
  layer would draw *nothing at all* on that fallback while every collision test stayed green. Same
  shape as the tint restriction above. Use `map.createLayer(...)` and leave the `gpu` argument off.
- **`createLayer` is typed `TilemapLayer | TilemapGPULayer` regardless of the `gpu` argument.**
  Narrow it with `instanceof Phaser.Tilemaps.TilemapLayer` rather than casting, so a later edit
  that passes `gpu: true` fails loudly instead of silently rendering nothing.
- **`this.cache.tilemap.get(key)` returns `{ format, data }`, and `data` is the RAW Tiled JSON** —
  `TilemapJSONFile.js:52-57`. That is what makes it possible for the unit suite and the running
  game to share one parser: the object in the cache is the object `JSON.parse` would have produced.
- **`addTilesetImage(tilesetName, textureKey)` returns `null` with only a console warning** when
  the tileset name does not match the `.tmj`. Silently drawing nothing is the default; throw.
- **`createLayer(layerID, ...)` likewise returns `null`** for an unknown layer name, and a layer can
  only be created **once** per map.
- **The `.tmj`'s `tilesets[].image` path is never fetched at runtime.** Phaser binds the texture by
  the key handed to `addTilesetImage`. The path exists for Tiled's benefit, so it is relative to the
  `.tmj`, not to the served root — those are different directories and only one of them is real.
- **Levels must live under `public/`.** Vite copies `public/` verbatim into `dist/` and copies
  nothing else. A root-level `levels/` is served in dev and absent from the build, which makes a
  "shipped data" test green against a file the player never receives *(vault 3.1)*. `npm run build`
  now runs `tools/gen/verify-dist.mjs`, which asserts each `.tmj` reached `dist/` byte for byte.
- **Object layers are a better collision source than the tile grid when anything will edit them.**
  A tile grid cannot express a sub-tile offset, so it cannot round-trip one; rectangles can. Read
  solidity from a per-object **property**, never a layer or object name *(vault 3.3)* — and note
  that a rename test cannot catch a name fallback in the *missing-property* path, because every
  authored object has properties. Test the absent case explicitly.
- **Tiled object `y` is the TOP edge** for rectangles on an orthogonal map, which matches a
  top-left `Rect` directly. Point objects carry `width`/`height` of `0`, so any "solids must be
  positive-sized" rule will also reject a point that was mistakenly marked solid — useful, but it
  means a rejection reason mentioning "solid" is not proof the *solid property* rule fired.

## Cameras *(Phase 3)*

- **`setBounds` clamps scrolling and nothing else.** It does not stop objects leaving the world and
  it cannot help when the view is larger than the map — at that point the camera necessarily shows
  outside it. Validate that the level exceeds the viewport at load; it is invisible otherwise.
- **`camera.worldView` is the honest oracle** for "what is on screen": a `Rectangle` recomputed
  each frame from scroll, zoom and bounds. Assert against it rather than against `scrollX`, which
  says what was requested rather than what was shown.
- **`startFollow(target, roundPixels, lerpX, lerpY)` cannot be asserted by "the camera moved".**
  Near a map edge the clamp legitimately holds the player far off centre, so a centring assertion
  fails on a correct camera. Assert instead that the target stays inside `worldView` inset by a
  margin — that fails for a camera which stopped following without failing at the boundaries.
