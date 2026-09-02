/**
 * **How the finished canvas should be scaled to the screen — the SECOND resample.**
 *
 * Engine-free *(vault 2.12)*, so its edge cases are reachable from a unit test rather than only
 * from a browser at one particular window size.
 *
 * ## The defect this exists for
 *
 * `pixelArt: true` decides how *textures* are sampled onto the canvas. It says nothing about how
 * the finished **canvas** is scaled onto the screen, and that is a second, independent resample.
 *
 * `Phaser.Scale.FIT` — read in `ScaleManager.updateScale`, the "all other scale modes" branch —
 * leaves the canvas **backing store at the GAME SIZE** and changes only its CSS width and height.
 * That size was a fixed 1920x1080 when this was measured; since 2026-09-01 `src/game/viewSize.ts`
 * derives it from the viewport, so it is 1920 at 16:9 and up to `MAX_GAME_WIDTH` on a wide one.
 * Either way the browser rescales a buffer into however many CSS pixels the window allows, and
 * `image-rendering: pixelated` makes that nearest-neighbour.
 *
 * **Nearest-neighbour at a fractional scale drops and duplicates whole pixel columns.** At scale
 * 0.889 some columns survive and some vanish; at `RENDER_SCALE` 6 an art pixel is 6 buffer pixels,
 * so it lands 5 screen pixels wide in some places and 6 in others. That alone is a still image
 * artifact. The part that matters is that **which columns are dropped shifts as the camera
 * scrolls** — so the whole image reorganises itself every frame. Sharp when still, mush in motion.
 *
 * The owner reported it by playing the shipped production build on a 60 Hz screen: *"the scavenger
 * run and the spikes when I jump are still a bit blurry"* — after a genuine camera fix had already
 * landed and helped. Two defects wearing one symptom.
 *
 * ## The rule, and why it is not a compromise
 *
 * ⚠️ **This is a Phase 1 decision reopened, and the owner unlocked it on 2026-08-27** — vault 1.5,
 * *"the single filtering decision for this project, made once"*. It is worth being precise about
 * what changed and what did not:
 *
 *   - **Texture sampling is untouched.** `pixelArt: true`, `antialias: false`, NEAREST on every
 *     loaded texture, `roundPixels: true`. Sprites are still drawn with hard texels.
 *   - **Only the canvas -> screen step is conditional**, and only when that step is already lossy.
 *
 * At an **integer** scale nearest-neighbour is exact: every art pixel becomes the same whole number
 * of screen pixels, every frame. That is the case Phase 1's decision was actually about, and it is
 * preserved unchanged.
 *
 * At a **fractional** scale nearest-neighbour cannot be exact — the only question is whether the
 * error is *stable* or *churning*. Smooth scaling spreads it evenly and holds still; nearest
 * concentrates it into dropped columns that move. **A consistently slightly-soft image reads far
 * better in motion than a crisp one that reorganises every frame**, which is why this is a rule
 * about which artifact to accept rather than a relaxation of the standard.
 *
 * The honest cost, stated rather than discovered later: at a fractional scale the image is softer
 * than it was. There is no setting that makes a fractional downscale of pixel art lossless. The
 * ways to avoid the fractional scale entirely — an integer-only letterbox, or rendering at the
 * device's native resolution — were both offered and both cost more than they buy here.
 */

/**
 * The `image-rendering` values Phaser's `CanvasInterpolation.setCrisp()` assigns, and the smooth
 * counterpart. `auto` is the browser default and means "filter it" — the CSS keyword `smooth`
 * exists but has far worse support, and `auto` is what `?breakFilter=1` has always used.
 */
export const SMOOTH_IMAGE_RENDERING = 'auto';

/**
 * Is the canvas being presented at a whole-number multiple (or division) of its backing store?
 *
 * Both axes must agree. `FIT` preserves aspect ratio, so in practice they do — but a mismatch
 * means something else is writing `canvas.style`, and the safe answer to "I do not understand this
 * geometry" is to treat it as fractional and scale smoothly.
 *
 * The tolerance is one part in ten thousand, not exact equality: `getBoundingClientRect()` returns
 * sub-pixel floats and `autoRound` floors the style size, so a scale that is 1.0 in intent arrives
 * as 0.9999999999. An exact test would report every integer scale as fractional and turn this into
 * an unconditional smoothing switch — which is the failure that would look like it worked.
 */
export function isIntegerScale(
  bufferWidth: number,
  bufferHeight: number,
  cssWidth: number,
  cssHeight: number,
): boolean {
  const whole = (buffer: number, css: number): boolean => {
    if (!Number.isFinite(buffer) || !Number.isFinite(css) || buffer <= 0 || css <= 0) return false;
    // Either direction: 2 buffer px per screen px is as exact as 2 screen px per buffer px.
    const up = css / buffer;
    const down = buffer / css;
    const near = (value: number): boolean => Math.abs(value - Math.round(value)) < 1e-4;
    return (up >= 1 && near(up)) || (down >= 1 && near(down));
  };
  return whole(bufferWidth, cssWidth) && whole(bufferHeight, cssHeight);
}

/**
 * The `image-rendering` value the canvas should carry, given its geometry.
 *
 * `crisp` is the value Phaser already chose — passed in rather than imported, so this module stays
 * free of the constant's ordering rules and the caller keeps using whatever
 * `CanvasInterpolation.setCrisp()` actually settled on in that browser.
 */
export function canvasRendering(
  crisp: string,
  bufferWidth: number,
  bufferHeight: number,
  cssWidth: number,
  cssHeight: number,
): string {
  return isIntegerScale(bufferWidth, bufferHeight, cssWidth, cssHeight)
    ? crisp
    : SMOOTH_IMAGE_RENDERING;
}
