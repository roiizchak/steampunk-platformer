/**
 * Key-colour estimation and removal — the "keying" half of chroma.mjs, split out to keep that
 * file under the 400-line limit. See `chroma.mjs` for the module-level vault 4.13 context; this
 * file holds the threshold constants, the per-image key estimators and `keyOut` itself.
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
