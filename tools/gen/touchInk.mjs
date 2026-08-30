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
 * So the ink keeps its alpha and only the brass is faded. Ink is the two ENDS of the luminance
 * range — the engraved dark line and the pale highlight — which is the same two-ink method
 * `hud.ts` uses and `contrast-floor.test.ts` measures: a reader takes whichever contrasts. The
 * thresholds are the widest pair that still clears the floor with margin; at 16/224 the worst case
 * falls off a cliff to 2.88:1, so 32/208 sits two steps clear of it.
 *
 * Splitting the alpha was necessary and not sufficient — see `BOLD_PX` for the half that measured
 * the marks at the size a player is actually shown them. With both repairs in place, all six marks
 * measure **3.31:1** at 48 CSS px over every background, with 20-31 % of the face opaque and the
 * translucent disc 49-59 %.
 */
const INK_DARK_MAX = 32;
const INK_LIGHT_MIN = 208;

/**
 * How far the pale keyline is grown around the dark engraving, in shipped pixels.
 *
 * 3 px of a 160 px face is 0.9 CSS px at the worst in-scope scale, which is the point: paired with
 * `BOLD_PX` it is the leanest width at which every mark reaches the 3.31:1 plateau AFTER the
 * downscale. At a 2 px keyline `walk` is 2.10-2.88:1 and at 1 px it is 1.63:1. The colour is
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
 * Swept at the true size over every background: `BOLD_PX` 2 with `KEYLINE_PX` 3 puts all six marks
 * on **3.31:1**, which is the plateau this ink pair can reach — 3 and 4 do not raise it, and 1 or a
 * 2 px keyline leave `walk` at 2.72-2.91. Leanest pair that reaches the plateau; 20 % of the face
 * ends up opaque and the translucent disc stays 59 %.
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
const PLATE_ALPHA_BAKED = 0.55 / 0.85;

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
 * @param {import('./png.d.mts').RgbaImage} face
 * @returns {import('./png.d.mts').RgbaImage}
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
  dark = grow(dark, width, height, BOLD_PX, inMark);
  for (let p = 0; p < dark.length; p += 1) {
    if (!dark[p]) continue;
    const i = p * 4;
    if (data[i + 3] === 0) continue;
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
      data[i] = KEYLINE_RGB[0];
      data[i + 1] = KEYLINE_RGB[1];
      data[i + 2] = KEYLINE_RGB[2];
      data[i + 3] = 255;
    }
  }
  return { width, height, data };
}

/**
 * Fade the brass and leave the ink alone.
 *
 * @param {import('./png.d.mts').RgbaImage} face
 * @returns {import('./png.d.mts').RgbaImage}
 */
export function bakePlateAlpha(face) {
  const data = new Uint8Array(face.data);
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3];
    if (a === 0) continue;
    const luma = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
    if (luma < INK_DARK_MAX || luma > INK_LIGHT_MIN) continue;
    data[i + 3] = Math.round(a * PLATE_ALPHA_BAKED);
  }
  return { width: face.width, height: face.height, data };
}
