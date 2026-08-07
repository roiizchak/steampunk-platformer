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
