/**
 * THE chroma keying module — vault **4.13** (blocker). One module, shared, never re-implemented.
 *
 * The vault's evidence, in its own terms:
 *
 *   > Key by **L1 colour distance with a tolerance, never equality**. Asked for `#FF00FF`, got
 *   > `~(252,1,252)` — only **0.004 %** of pixels were exactly pure. Working thresholds: a low/high
 *   > pair (**40** and **120**) plus despill, in **one shared module**. Judge specks by
 *   > **connected-component area (min 256 px)**, not `alpha > 0`.
 *
 * Two thresholds rather than one because a single cut produces a hard, aliased edge: below `LOW`
 * is certainly background, above `HIGH` is certainly subject, and the band between them is a ramp.
 * That band is also where the despill lives — a subject photographed against saturated green picks
 * up green in its edge pixels, and removing the key colour without removing the spill leaves a lime
 * halo that survives every metric because the pixels are opaque.
 *
 * ## The rule that is easy to get backwards
 *
 * `keepLargestComponent` is **safe for held and grounded poses and MUST NOT be applied to
 * `jump`, `fall` or `attack` states** *(vault 4.13)*. An airborne figure is legitimately more than
 * one connected component — a trailing coat, a raised arm crossing behind the torso, a weapon in
 * flight. "Keep the biggest blob" deletes those and the result still looks like a sprite, which is
 * why it passes review. `assertComponentPolicy` below makes the state name decide, so the choice
 * cannot be made per-call-site by whoever is writing the loop that day.
 *
 * Lives in `tools/gen/` as `.mjs` — see `png.mjs`'s header for why. The Gym reads the same
 * thresholds through `chromaThresholds()` so the overlay and the build agree by construction.
 */

/**
 * L1 distance thresholds, in 0–255 units summed across R, G and B.
 *
 * Frozen as a named export rather than inlined so there is exactly one place to change them and
 * one place for a test to assert them against. Changing these is an art decision.
 */
export const CHROMA = Object.freeze({
  /** At or below: certainly background. Fully transparent. */
  LOW: 40,
  /** At or above: certainly subject. Fully opaque. */
  HIGH: 120,
  /** Connected-component area below this is a speck, not a figure. Vault 4.13. */
  MIN_COMPONENT_PX: 256,
  /** The key colour the prompts ask for. Chroma green, not magenta — see STYLE.md. */
  KEY: Object.freeze([0, 255, 0]),
});

/**
 * How close a second channel may come to the key's peak before "the dominant channel" stops being
 * a meaningful idea. Magenta (255,0,255) ties exactly; green (2,253,2) does not come close.
 */
const SPILL_TIE = 32;

/** States whose art may legitimately be more than one connected component (vault 4.13). */
const MULTI_COMPONENT_STATES = Object.freeze(['jump', 'fall', 'attack', 'hurt', 'death']);

export function chromaThresholds() {
  return { ...CHROMA, KEY: [...CHROMA.KEY] };
}

/** L1 distance from a pixel to the key colour. */
export function keyDistance(r, g, b, key = CHROMA.KEY) {
  return Math.abs(r - key[0]) + Math.abs(g - key[1]) + Math.abs(b - key[2]);
}

/**
 * Does this image carry REAL transparency?
 *
 * Vault **4.12**: never test `mode == "RGBA"`. Three identical-parameter portraits came back
 * RGBA/RGBA/RGB with alpha 255 everywhere — the channel existed and meant nothing. So this reads
 * the channel's VALUES. `sourceHadAlphaChannel` from the decoder answers a different question and
 * is deliberately not consulted here.
 */
export function hasRealAlpha(image) {
  const { data } = image;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] !== 255) {
      return true;
    }
  }
  return false;
}

/**
 * Estimate the key colour from the image's own border, instead of assuming the one we asked for.
 *
 * **Measured on the first real batch, and it is why this function exists.** Three anchors were
 * generated from prompts naming "one flat uniform chroma green field, RGB 0 255 0". Two came back
 * at `~(1,252,1)` — L1 distance 4–30 from pure, comfortably inside `LOW`. The third came back at
 * **`(0,195,64)`**, distance 124–144, which is *above* `HIGH`, so it was classified as SUBJECT and
 * **0 % of the image keyed away**. The prompt was identical in that clause. The model simply
 * returned a different green.
 *
 * Widening `LOW` to 144 to cover it would start eating real subject pixels — a dark green coat is
 * a legitimate thing for this character to wear. So the key is MEASURED per image, which is the
 * same principle as vault 4.11: read it off the file, never off the label. Here the label is the
 * prompt.
 *
 * Refuses rather than guessing *(vault 4.16)*: if the border is not overwhelmingly one colour, this
 * is not a chroma-backed image and the caller must not proceed as though it were.
 */
export function estimateKeyColour(image, { minAgreement = 0.9, tolerance = CHROMA.HIGH } = {}) {
  const { width, height, data } = image;
  const samples = [];
  const push = (x, y) => {
    const i = (y * width + x) * 4;
    samples.push([data[i], data[i + 1], data[i + 2]]);
  };
  // The whole border, one pixel deep. A vignette makes corners drift, so sample all of it.
  for (let x = 0; x < width; x += 1) {
    push(x, 0);
    push(x, height - 1);
  }
  for (let y = 1; y < height - 1; y += 1) {
    push(0, y);
    push(width - 1, y);
  }
  if (samples.length === 0) {
    throw new Error('estimateKeyColour: image has no border to sample');
  }

  // Median per channel: robust to a subject that touches an edge, unlike a mean.
  const median = (channel) => {
    const sorted = samples.map((s) => s[channel]).sort((a, b) => a - b);
    return sorted[sorted.length >> 1];
  };
  const key = [median(0), median(1), median(2)];

  const agreeing = samples.filter((s) => keyDistance(s[0], s[1], s[2], key) <= tolerance).length;
  const agreement = agreeing / samples.length;
  if (agreement < minAgreement) {
    throw new Error(
      `estimateKeyColour: only ${(agreement * 100).toFixed(1)}% of border pixels are within ` +
        `${tolerance} of the median (${key.join(',')}). This image does not have a uniform ` +
        `chroma background — keying it would cut into the subject. Regenerate it instead.`,
    );
  }
  return { key, agreement };
}

/**
 * The border median, unconditionally — bypasses `estimateKeyColour`'s 90% agreement floor.
 *
 * A crop that leaves the subject occupying part of the border (measured 78.4% agreement on a real
 * cropped frame) is exactly what G6 exists to catch. Refusing to even MEASURE the key in that case
 * would make G6 throw for the wrong reason — border disagreement is signal for the CALLER to act on
 * (crop tighter, or fail the edge gate), not a reason for the key estimate itself to give up first.
 * A uniform background still agrees at 1.0000 regardless of its colour, so the median remains the
 * right key in both the clean and the border-crowded case; only the floor needed to go.
 */
export function borderKey(image) {
  return estimateKeyColour(image, { minAgreement: 0 }).key;
}

/**
 * Estimate the key colour from the chroma FIELD itself, wherever it happens to sit in the frame.
 *
 * `estimateKeyColour` samples the one-pixel border, which is exactly right for a sprite isolated
 * on a field and exactly wrong for a scene layer. A parallax mid-layer has factory facades standing
 * along its bottom edge by design — the chroma is in the upper part of the frame, not around it —
 * so the border median is a mixture and the function refuses on art that is perfectly good.
 * Measured on the regenerated layers: border agreement 43 % for `mid` and 64 % for `near`, both
 * well below the 90 % floor, while 26 % and 49 % of those images respectively were flat chroma.
 *
 * So this one finds the field by colour rather than by position: take every pixel within
 * `tolerance` of the chroma we asked for, and return the MEDIAN of that population. The median is
 * what keeps it honest — anti-aliased edge pixels sit inside the tolerance and would drag a mean,
 * and the point of measuring at all is that the model does not return the green it was told to
 * *(vault 4.11: read it off the file, never off the label — and here the label is the prompt)*.
 *
 * Refuses rather than guessing *(vault 4.16)* when the field never arrived: below `minShare` of the
 * image, there is nothing to key, and a caller that proceeded would ship an opaque layer that
 * silently hides everything behind it. That is the exact defect this replaces.
 */
export function estimateFieldColour(
  image,
  { expect = CHROMA.KEY, tolerance = CHROMA.HIGH, minShare = 0.1 } = {},
) {
  const { data } = image;
  const total = data.length / 4;
  // Per-channel histograms over the in-tolerance population, so the median costs no sort.
  const hist = [new Uint32Array(256), new Uint32Array(256), new Uint32Array(256)];
  let n = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (keyDistance(data[i], data[i + 1], data[i + 2], expect) > tolerance) continue;
    hist[0][data[i]] += 1;
    hist[1][data[i + 1]] += 1;
    hist[2][data[i + 2]] += 1;
    n += 1;
  }
  const share = n / total;
  if (share < minShare) {
    throw new Error(
      `estimateFieldColour: only ${(share * 100).toFixed(2)}% of the image is within ${tolerance} ` +
        `of (${[...expect].join(',')}), below the ${minShare * 100}% floor. There is no chroma ` +
        `field here to key, so this layer would be fully opaque and hide everything behind it.`,
    );
  }
  const median = (channel) => {
    const half = n >> 1;
    let seen = 0;
    for (let v = 0; v < 256; v += 1) {
      seen += hist[channel][v];
      if (seen > half) return v;
    }
    return 255;
  };
  return { key: [median(0), median(1), median(2)], share };
}

/**
 * Key out the background, in place on a copy. Returns a new image.
 *
 * Pixels at or below `LOW` become fully transparent; at or above `HIGH` are untouched; between,
 * alpha ramps linearly and the pixel is despilled toward its own non-key channels.
 */
export function keyOut(image, options = {}) {
  const low = options.low ?? CHROMA.LOW;
  const high = options.high ?? CHROMA.HIGH;
  const key = options.key ?? CHROMA.KEY;
  if (!(high > low)) {
    throw new Error(`keyOut: high (${high}) must exceed low (${low})`);
  }

  const out = new Uint8ClampedArray(image.data);
  for (let p = 0; p < out.length; p += 4) {
    const r = out[p];
    const g = out[p + 1];
    const b = out[p + 2];
    const d = keyDistance(r, g, b, key);

    if (d <= low) {
      out[p] = 0; out[p + 1] = 0; out[p + 2] = 0; out[p + 3] = 0;
      continue;
    }
    if (d >= high) {
      continue;
    }

    // Ramp band: partial alpha, and despill so the edge does not keep a green rim.
    const t = (d - low) / (high - low);
    out[p + 3] = Math.round(out[p + 3] * t);
    // Despill: pull the dominant key channel down to the average of the other two.
    const dominant = key.indexOf(Math.max(...key));
    const others = [0, 1, 2].filter((c) => c !== dominant);
    const average = (out[p + others[0]] + out[p + others[1]]) / 2;
    if (out[p + dominant] > average) {
      out[p + dominant] = Math.round(average + (out[p + dominant] - average) * t);
    }
  }

  /**
   * Second pass: despill everything the ramp never reached.
   *
   * The band despill above only runs for `low < d < high`. A blend of chroma green and a dark
   * blue-grey wall lands at an L1 distance well ABOVE `high` — it is correctly classified as
   * subject, so its alpha is right — while still being visibly green. Those pixels form a bright
   * green outline around every keyed element, and raising `high` does not reach them: measured on
   * the parallax near layer, taking `high` from 120 to 320 moved the green-dominant share of
   * opaque pixels only from 3.69 % to 3.21 %, and keyed exactly the same 48.1 % either way.
   *
   * The pass is safe because it is **measured** to be, not assumed: the far parallax layer carries
   * no chroma field at all, so every pixel in it is legitimate art, and **0.00 %** of it is
   * green-dominant at any threshold. This palette — cold blue-grey, brick, iron, brass — never
   * goes green-dominant on purpose. Clamping to the MAX of the other two channels rather than
   * their average is the conservative choice: it removes the dominance and nothing more.
   *
   * It lives inside `keyOut` rather than at the two call sites because every keyed asset has the
   * defect. The tileset measured 8.3 % green-dominant pixels before this existed, and nobody had
   * noticed.
   */
  if (options.despill !== false) {
    const peak = Math.max(...key);
    const dominant = key.indexOf(peak);
    // **Only when ONE channel is unambiguously the key's own.** A magenta key is (255,0,255): two
    // channels tie for the maximum, `indexOf` picks red arbitrarily, and clamping red to the
    // brightest of the others turns a legitimate warm subject pixel (180,140,60) into (140,140,60).
    // The unit suite caught exactly that, and it was right to — "the dominant channel" is not a
    // defined quantity for a two-channel key, so there is nothing here to safely pull down.
    const ambiguous = key.filter((c) => peak - c <= SPILL_TIE).length !== 1;
    if (!ambiguous) {
      const [c0, c1] = [0, 1, 2].filter((c) => c !== dominant);
      for (let p = 0; p < out.length; p += 4) {
        if (out[p + 3] === 0) continue;
        const ceiling = Math.max(out[p + c0], out[p + c1]);
        if (out[p + dominant] > ceiling) {
          out[p + dominant] = ceiling;
        }
      }
    }
  }

  return { width: image.width, height: image.height, data: out };
}

/**
 * Label connected components of opaque pixels, 4-connected, iteratively.
 *
 * Iterative on purpose: a recursive flood fill blows the stack on a 2752 px image, and the failure
 * mode is a crash halfway through a build rather than a wrong number, which is at least honest but
 * still stops the pipeline.
 */
export function components(image, minAlpha = 1) {
  const { width, height, data } = image;
  const labels = new Int32Array(width * height).fill(-1);
  const sizes = [];
  const stack = [];

  for (let start = 0; start < width * height; start += 1) {
    if (labels[start] !== -1 || data[start * 4 + 3] < minAlpha) {
      continue;
    }
    const label = sizes.length;
    let size = 0;
    stack.push(start);
    labels[start] = label;

    while (stack.length > 0) {
      const p = stack.pop();
      size += 1;
      const x = p % width;
      const y = (p - x) / width;
      const neighbours = [
        x > 0 ? p - 1 : -1,
        x < width - 1 ? p + 1 : -1,
        y > 0 ? p - width : -1,
        y < height - 1 ? p + width : -1,
      ];
      for (const n of neighbours) {
        if (n >= 0 && labels[n] === -1 && data[n * 4 + 3] >= minAlpha) {
          labels[n] = label;
          stack.push(n);
        }
      }
    }
    sizes.push(size);
  }

  return { labels, sizes };
}

/**
 * Erase the soft HALO a video codec leaves around a figure on a saturated chroma field.
 *
 * ## The defect, measured
 *
 * The Seedance clips come back with a broad soft glow around the courier — chroma bleed at a
 * high-contrast edge against saturated green, which the LOW/HIGH tolerance ramp resolves into a wide
 * band of partial alpha rather than removing. Rendered as brightness it is unmistakable: an
 * elliptical haze reaching 20–40 px past the silhouette on every side.
 *
 * It broke two things at once, and neither was obvious from the sheet:
 *
 * ```
 *          lowest row with alpha>=8   lowest row with alpha>=128   gap
 *   idle          335                        335                     0
 *   walk          335                        327 - 331             4 - 8
 *   run           335                        315 - 330             5 - 20
 * ```
 *
 * `packStrip` aligns on the figure's lowest opaque row, because `playerView` draws at origin
 * `(0.5, 1)` on the player's feet *(vault 2.10)*. With the halo counted as figure, it aligned the
 * HALO to the ground — so the visible boots hung 4–20 px above the tiles, and because the halo's
 * depth varies per frame, the character also bobbed vertically by up to 15 px while running.
 * "Doesn't look like they stand on the tiles" and "still not smooth" were one defect.
 *
 * **The measurement above is per-FRAME because that is what the packer did when it was taken.** It
 * now takes one baseline per SHEET — the deepest frame reaches the cell's last row and every other
 * frame keeps its measured lift *(see `sheets.mjs`)* — which changes nothing about why the halo had
 * to go: whichever frame is deepest, a halo under it defines a contact line it has no business
 * defining, and it moves the whole sheet rather than one cell.
 *
 * ## Why the test is geometric and not chromatic
 *
 * The obvious guess — residual green — is wrong, and measuring said so: **0 %** of the halo is
 * green-dominant, because `keyOut`'s despill has already neutralised its colour. It is not a colour
 * that needs keying, it is an alpha that should never have survived.
 *
 * An alpha floor alone cannot separate it either: the halo runs up to alpha 127, well into the range
 * a genuine anti-aliased edge occupies, so any floor high enough to erase it would harden every
 * silhouette. What actually distinguishes them is DISTANCE. Real edge anti-aliasing is 1–2 px from
 * solid ink. Halo is 5–40 px from anything solid. So a partial-alpha pixel is kept only if it is
 * within `maxDistance` of a genuinely solid one, and dropped otherwise — which preserves edge quality
 * exactly while removing a haze that is nowhere near the figure.
 *
 * **What this would eat, stated rather than discovered:** a feature that is thin AND entirely
 * semi-transparent everywhere — a wisp of smoke, a single-pixel cable — has no solid core to be near,
 * so it goes. At this source resolution (the courier stands 1209 px) every real feature has one. If a
 * later asset does not, that asset needs a different cleanup, not a looser distance.
 */
export function trimHalo(image, { solidAlpha = 192, maxDistance = 2 } = {}) {
  const { width, height, data } = image;
  const out = new Uint8ClampedArray(data);
  const solid = new Uint8Array(width * height);
  for (let p = 0; p < width * height; p += 1) solid[p] = data[p * 4 + 3] >= solidAlpha ? 1 : 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const p = y * width + x;
      const alpha = data[p * 4 + 3];
      if (alpha === 0 || solid[p]) continue;
      let near = false;
      for (let dy = -maxDistance; dy <= maxDistance && !near; dy += 1) {
        const yy = y + dy;
        if (yy < 0 || yy >= height) continue;
        for (let dx = -maxDistance; dx <= maxDistance; dx += 1) {
          const xx = x + dx;
          if (xx < 0 || xx >= width) continue;
          if (solid[yy * width + xx]) { near = true; break; }
        }
      }
      if (!near) {
        out[p * 4] = 0; out[p * 4 + 1] = 0; out[p * 4 + 2] = 0; out[p * 4 + 3] = 0;
      }
    }
  }
  return { width, height, data: out };
}

/**
 * Erase components smaller than `MIN_COMPONENT_PX`.
 *
 * **Judged by AREA, never by `alpha > 0`** *(vault 4.13)*. The self-test fixture is a four-pixel
 * speck that an `alpha > 0` check scores as a whole second figure.
 */
/**
 * Drop a cast SHADOW: a detached blob lying wholly below the figure, far wider than it is tall.
 *
 * The airborne prompts say *"nothing casts a shadow"* and name the reason — a figure implied to be
 * above something grows a surface for it. The model mostly obeys and then draws one anyway on the
 * odd frame: the shipped `fall` has one on frame 5, a 108 x 10 ellipse 695 px in area, sitting 7 px
 * under the boots.
 *
 * It is not cosmetic. It is the lowest opaque thing in the cell, so it captures the foot line, drags
 * the centroid down, and renders as a dark disc floating under an airborne character — the same
 * class of defect as the chroma halo, which also defined a contact line it had no business defining.
 * Under per-SHEET anchoring it is worse, not better: if the shadowed frame is the deepest one it
 * sets the baseline for **every** frame in the sheet, so one stray ellipse lifts all twelve.
 *
 * **An area threshold cannot do this job**, which is why `removeSpecks` is not simply turned up. At
 * this scale a boot is roughly 600 px and this shadow is 695, and vault **4.13** forbids
 * keep-largest-component on exactly these two animations because an airborne pose legitimately
 * splits when a chroma-key gap severs a trailing boot. Raising `minPx` past 695 would therefore eat
 * the very thing 4.13 exists to protect.
 *
 * The discriminating axes are SHAPE and POSITION, and a shadow is unambiguous on both: it lies
 * entirely below the main mass and it is a flat smear. A detached boot is neither — it sits within
 * or beside the figure's vertical span, and it is not 10:1 wide. Both conditions must hold.
 */
export function dropCastShadow(image, { minAspect = 4, minPx = 40, maxHeightFraction = 0.04 } = {}) {
  const { labels, sizes } = components(image);
  if (sizes.length < 2) return image;

  const box = sizes.map(() => ({ minX: Infinity, maxX: -1, minY: Infinity, maxY: -1 }));
  for (let p = 0; p < labels.length; p += 1) {
    const label = labels[p];
    if (label < 0) continue;
    const b = box[label];
    const x = p % image.width;
    const y = (p - x) / image.width;
    if (x < b.minX) b.minX = x;
    if (x > b.maxX) b.maxX = x;
    if (y < b.minY) b.minY = y;
    if (y > b.maxY) b.maxY = y;
  }

  let main = 0;
  for (let i = 1; i < sizes.length; i += 1) if (sizes[i] > sizes[main]) main = i;

  const doomed = new Set();
  for (let i = 0; i < sizes.length; i += 1) {
    if (i === main || sizes[i] < minPx) continue;
    const b = box[i];
    const w = b.maxX - b.minX + 1;
    const h = b.maxY - b.minY + 1;
    // THREE conditions, and the third was added after the code-reviewer gate owner's adversarial
    // brief pointed out that this function is the unguarded twin of `keepLargestComponent`.
    //
    // 4.6 forbids keep-largest-component on airborne states because a chroma-key gap legitimately
    // severs a trailing boot, and this function deletes a non-largest component on every airborne
    // cell without ever calling `assertComponentPolicy`. It passed 4.6 on the letter while being
    // able to commit exactly the deletion 4.6 exists to prevent — two boots severed together, or
    // one raked back, is a wide flat blob below the torso and clears both original tests.
    //
    // A shadow is a SMEAR; a boot has real vertical extent. Measured against the MAIN MASS rather
    // than the image, so it is scale-invariant: the courier stands ~1200 source px, a boot is
    // ~100 px (8% of him), and the shipped cast shadow was 10 px (0.8%). 4% sits an order of
    // magnitude clear of both, and unlike the aspect ratio it does not depend on how many boots
    // were severed at once — two boots side by side is a wide flat blob and clears 4:1 easily.
    const mainHeight = box[main].maxY - box[main].minY + 1;
    const tooTallToBeAShadow = h > mainHeight * maxHeightFraction;
    if (b.minY > box[main].maxY && w >= h * minAspect && !tooTallToBeAShadow) doomed.add(i);
  }
  if (doomed.size === 0) return image;

  const out = new Uint8ClampedArray(image.data);
  for (let p = 0; p < labels.length; p += 1) {
    if (doomed.has(labels[p])) {
      out[p * 4] = 0; out[p * 4 + 1] = 0; out[p * 4 + 2] = 0; out[p * 4 + 3] = 0;
    }
  }
  return { width: image.width, height: image.height, data: out };
}

export function removeSpecks(image, minPx = CHROMA.MIN_COMPONENT_PX) {
  const { labels, sizes } = components(image);
  const out = new Uint8ClampedArray(image.data);
  for (let p = 0; p < labels.length; p += 1) {
    const label = labels[p];
    if (label >= 0 && sizes[label] < minPx) {
      out[p * 4] = 0; out[p * 4 + 1] = 0; out[p * 4 + 2] = 0; out[p * 4 + 3] = 0;
    }
  }
  return { width: image.width, height: image.height, data: out };
}

/**
 * THE policy gate for `keepLargestComponent` — criterion 4.6.
 *
 * Throws for any state whose art may legitimately be multi-component. A comment asking callers to
 * remember this is not enforcement; a function they cannot bypass is, which is the same reasoning
 * `enterState()` is built on.
 */
export function assertComponentPolicy(state) {
  if (MULTI_COMPONENT_STATES.includes(state)) {
    throw new Error(
      `keepLargestComponent must not be applied to "${state}" (vault 4.13): an airborne or ` +
        `attacking figure is legitimately more than one connected component, and keeping only ` +
        `the largest silently deletes a trailing coat, a raised arm or a weapon in flight.`,
    );
  }
}

/** Keep only the largest component. Refuses the states vault 4.13 forbids it for. */
export function keepLargestComponent(image, state) {
  assertComponentPolicy(state);
  const { labels, sizes } = components(image);
  if (sizes.length === 0) {
    return { width: image.width, height: image.height, data: new Uint8ClampedArray(image.data) };
  }
  let biggest = 0;
  for (let i = 1; i < sizes.length; i += 1) {
    if (sizes[i] > sizes[biggest]) biggest = i;
  }
  const out = new Uint8ClampedArray(image.data);
  for (let p = 0; p < labels.length; p += 1) {
    if (labels[p] !== biggest) {
      out[p * 4] = 0; out[p * 4 + 1] = 0; out[p * 4 + 2] = 0; out[p * 4 + 3] = 0;
    }
  }
  return { width: image.width, height: image.height, data: out };
}

/** States this module refuses `keepLargestComponent` for. Exported so the test asserts the list. */
export function multiComponentStates() {
  return [...MULTI_COMPONENT_STATES];
}
