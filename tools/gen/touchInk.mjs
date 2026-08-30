/**
 * **The two-ink pass: what makes a generated engraving readable over a level.**
 *
 * Split out of `buildTouchAtlas.mjs` at the 400-line ceiling, and the seam is real: everything here
 * is a pure pixel transform on one decoded face, with no filesystem, no grid geometry and no
 * catalog. `touch-atlas-ink.test.ts` drives it on a synthetic face for exactly that reason.
 */

/**
 * 🔴 **The translucency is baked per pixel, because one flat alpha cannot carry both jobs.**
 *
 * The plate has to be see-through: 175 of 878 standing positions (19.9 %) across the five shipped
 * levels have a hazard, an enemy or the goal drawn under a control, which is why `PLATE_ALPHA` is
 * 0.55 and why raising it to 0.86 was reverted. The MARK has to be readable: WCAG 1.4.11's 3:1.
 *
 * Fading both together satisfies the first and fails the second — measured on the shipped six over
 * every possible background luminance, the best ink reached only **2.43-2.47:1**. Found by the
 * Codex round-7 review and confirmed locally before anything was changed.
 *
 * So the MARK keeps its alpha and everything else is faded. The mark is what `keylineMarks` wrote
 * — a dark engraving found at `INK_DARK_MAX`, thickened, and haloed in the pale half of the pair —
 * which is `hud.ts`'s two-ink method, the one `contrast-floor.test.ts` measures: a reader takes
 * whichever ink contrasts with what is behind it.
 *
 * ⚠️ **It used to be every extreme-luminance pixel anywhere, and that exempted 2 657-2 976
 * pixels a face that are not the mark at all** — the disc's own dark bezel shading, shipping fully
 * opaque, occluding the level for no readability gain, and classified by no gate as either ink or
 * plate. Codex round-11. Keyed on the mask, the invariant is exact in both directions: a mark pixel
 * draws at `ART_ALPHA`, everything else at `PLATE_ALPHA`, and `shipped-touch.test.ts` checks that
 * per pixel against the two alphas the SCENE draws with.
 *
 * Splitting the alpha was necessary and not sufficient — see `BOLD_PX` for the half that measured
 * the marks at the size a player is actually shown them. With both repairs in place, all six marks
 * measure **3.32:1** at rest and **3.85:1** pressed, at 48 CSS px over every background, with the
 * mark 10.4-20.5 % of the face and the translucent disc 59.8-68.4 %.
 */
export const INK_DARK_MAX = 32;

/**
 * How far the pale keyline is grown around the dark engraving, in shipped pixels.
 *
 * 3 px of a 160 px face is 0.9 CSS px at the worst in-scope scale, which is the point: paired with
 * `BOLD_PX` it is the leanest width at which every mark reaches the 3.32:1 plateau AFTER the
 * downscale. Re-measured through the mark mask with `BOLD_PX` at 2: a 2 px keyline leaves `walk`
 * at 2.92:1 and a 1 px one at 1.93:1, against 3.32:1 for all six at 3 px. (⚠️ The 2.10-2.88 and
 * 1.63 this line used to quote were taken before the mask and the bezel fade changed what is being
 * measured — two experiments reported as one. Codex round-11.) The colour is
 * `MARK_INK` from `touchMarks.ts`, the pale half of the pair `contrast-floor.test.ts` measures.
 */
const KEYLINE_PX = 3;
const KEYLINE_RGB = [0xf7, 0xe3, 0xb8];

/**
 * How far the dark engraving itself is thickened, in shipped pixels.
 *
 * 🔴 **A hairline is not a contrast mechanism, and this project already wrote that down.**
 * `contrast-floor.test.ts` refuses a 1 px stroke on a 44 px glyph as *"an anti-aliasing artefact"* —
 * and the first keyline was exactly that. Measured at the size a player actually sees, the marks
 * fell to 1.63-2.85:1: a face is 160 game px but the smallest in-scope viewport presents it at
 * **48 CSS px**, a 3.3x downscale that a fractional canvas scale deliberately SMOOTHS
 * (`canvasScaling.ts`). A 1 px feature simply averages away. Codex round-9.
 *
 * So the dark engraving is thickened before it is keylined, both inside the mark region only.
 *
 * ⚠️ **The contrast figure no longer chooses this number, and saying that it did was wrong.**
 * Swept at true size through the mark mask, `BOLD_PX` 1, 2, 3 and 4 all measure **3.32:1** — the
 * keyline is what carries the ratio (`KEYLINE_PX`: 1 px is 1.93, 2 px is 2.92, 3 px is 3.32).
 * Re-measured for Codex round-11, after the mask became the measurement window. What the thickening
 * buys is that the engraving still reads as a SHAPE at 48 CSS px rather than as a pale outline
 * around nothing, which is a judgement — 12.14's `ui-ux-tester` call and the owner's under 12.24 —
 * and is recorded here as one instead of borrowed from a number that does not order it.
 */
const BOLD_PX = 2;

/** The dark half of `hud.ts`'s ink pair. `SHADOW_INK` in `touchMarks.ts`. */
const SHADOW_RGB = [0x1a, 0x14, 0x10];

/** The share of the face the engraving occupies; nothing outside it is touched. */
const MARK_FRACTION = 0.5;

/**
 * Dilate a boolean mask by `radius`, never outside the region `allowed` admits.
 *
 * @param {Uint8Array} mask
 * @param {number} width
 * @param {number} height
 * @param {number} radius
 * @param {(x: number, y: number) => boolean} allowed
 * @returns {Uint8Array}
 */
function grow(mask, width, height, radius, allowed) {
  if (radius <= 0) return mask;
  const out = new Uint8Array(mask);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (mask[y * width + x] || !allowed(x, y)) continue;
      let near = false;
      for (let dy = -radius; dy <= radius && !near; dy += 1) {
        for (let dx = -radius; dx <= radius; dx += 1) {
          const yy = y + dy;
          const xx = x + dx;
          if (yy < 0 || xx < 0 || yy >= height || xx >= width) continue;
          if (mask[yy * width + xx]) {
            near = true;
            break;
          }
        }
      }
      if (near) out[y * width + x] = 1;
    }
  }
  return out;
}

/**
 * What the plate's alpha is multiplied by, so that the DRAWN alpha times this is `PLATE_ALPHA`.
 *
 * `0.55 / 0.85` — the face rests at 0.85 and presses to 1.0, which keeps alpha as the press
 * signal (the drawn grey box's mechanism) while leaving the ink enough of it to be read.
 * `touchMarks.ts` owns the two drawn alphas and states the same arithmetic.
 */
export const PLATE_ALPHA_BAKED = 0.55 / 0.85;

/**
 * 🔴 **The engraving is ONE ink, and one ink cannot pass a swept background.**
 *
 * Baking the alpha split was necessary and not sufficient. Measured over the mark itself — the
 * central opaque pixels, not the whole face — the shipped `walk` bars bottomed out at **1.12:1**:
 * every one of their 725 ink pixels is near-black, so on a dark background they simply vanish. The
 * other five scraped 3.38-3.47:1 on as few as **four** pale pixels, which is a contrast claim
 * resting on an accident of the model's shading.
 *
 * Found by the Codex round-8 review, which measured the whole-face statistic passing at 3.57-3.70
 * on a decorative brass highlight OUTSIDE the mark while the mark was unreadable — a statistic
 * that cannot order its own mutation, which is the failure this project has a rule about.
 *
 * The repair is `hud.ts`'s method, applied to pixels instead of to shapes: every dark mark gets a
 * pale keyline, so a reader takes whichever ink contrasts with what is behind it. That is the same
 * `MARK_INK` / `SHADOW_INK` pair `contrast-floor.test.ts` measures at 3.80:1, and it is what the
 * grey-box marks always had.
 *
 * ⚠️ **Returns the MASK as well as the picture, and that is not a convenience.** Every gate over
 * the shipped bytes used to decide for itself which pixels were the mark — by luminance, or by
 * opacity — reading its own oracle off the very file under test. A mutation that erased the
 * engraving and left two ink cells standing therefore moved the mask with it and scored 3.09:1.
 * Codex round-11. This mask is the pipeline's own statement of where the mark is, computed from
 * the CUT face, and `tests/fixtures/touch-cut/` commits that input so a test can recompute it.
 *
 * @param {import('./png.d.mts').RgbaImage} face
 * @returns {{ image: import('./png.d.mts').RgbaImage, mark: Uint8Array, seeds: Uint8Array }}
 */
export function keylineMarks(face) {
  const { width, height } = face;
  const data = new Uint8Array(face.data);
  const inset = Math.round((width * (1 - MARK_FRACTION)) / 2);
  const inMark = (x, y) => x >= inset && x < width - inset && y >= inset && y < height - inset;
  let dark = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const p = y * width + x;
      const i = p * 4;
      if (data[i + 3] === 0 || !inMark(x, y)) continue;
      const luma = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
      if (luma < INK_DARK_MAX) dark[p] = 1;
    }
  }
  // The engraving BEFORE either dilation — the semantic strokes, which the halo then merges.
  // `shipped-touch-contrast.test.ts` measures per stroke and needs a topology the halo did not
  // invent: `walk`'s two bars are two components here and one after the keyline. Codex round-13.
  const seeds = new Uint8Array(dark);
  dark = grow(dark, width, height, BOLD_PX, inMark);
  for (let p = 0; p < dark.length; p += 1) {
    if (!dark[p]) continue;
    const i = p * 4;
    // ⚠️ Clear the bit, do not just skip the paint. `grow` sets bits outside the disc, and a
    // returned mask that claims 44 transparent pixels are mark is a coverage claim the picture does
    // not support — the contrast gate counts exactly these bits as the engraving. Codex round-12.
    if (data[i + 3] === 0) {
      dark[p] = 0;
      continue;
    }
    data[i] = SHADOW_RGB[0];
    data[i + 1] = SHADOW_RGB[1];
    data[i + 2] = SHADOW_RGB[2];
    data[i + 3] = 255;
  }
  const halo = grow(dark, width, height, KEYLINE_PX, inMark);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const p = y * width + x;
      if (dark[p] || !halo[p]) continue;
      const i = p * 4;
      // ⚠️ The alpha guard is load-bearing and the region guard is not. `halo` is grown from a
      // mask that was only ever set inside the mark, through a `grow` that refuses to leave it, so
      // a second `inMark` test here can never fire — measured, M55 stayed green through it, and a
      // condition no mutation can reach is the same defect as a decision function with no consumer.
      // A transparent pixel CAN be in the halo, though, whenever the mark region reaches the edge
      // of the disc: without this the keyline fills the corners and the button stops being round.
      if (data[i + 3] === 0) continue;
      dark[p] = 1;
      data[i] = KEYLINE_RGB[0];
      data[i + 1] = KEYLINE_RGB[1];
      data[i + 2] = KEYLINE_RGB[2];
      data[i + 3] = 255;
    }
  }
  return { image: { width, height, data }, mark: dark, seeds };
}

/**
 * Fade the plate and leave the mark alone.
 *
 * 🔴 **Keyed on the MARK MASK, not on luminance, and the difference is 2 657-2 976 pixels a
 * face.** Exempting every extreme-luminance pixel exempted the disc's own dark bezel shading too —
 * thousands of pixels outside the engraving that shipped fully opaque, occluding the level for no
 * readability gain, and that no shipped-bytes gate classified as anything at all. Codex round-11.
 * The exemption exists so the ENGRAVING survives the fade; nothing else needs it.
 *
 * @param {import('./png.d.mts').RgbaImage} face
 * @param {Uint8Array} mark
 * @returns {import('./png.d.mts').RgbaImage}
 */
export function bakePlateAlpha(face, mark) {
  const data = new Uint8Array(face.data);
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3];
    if (a === 0 || mark[i / 4]) continue;
    data[i + 3] = Math.round(a * PLATE_ALPHA_BAKED);
  }
  return { width: face.width, height: face.height, data };
}
