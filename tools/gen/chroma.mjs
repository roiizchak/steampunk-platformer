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
 * Erase components smaller than `MIN_COMPONENT_PX`.
 *
 * **Judged by AREA, never by `alpha > 0`** *(vault 4.13)*. The self-test fixture is a four-pixel
 * speck that an `alpha > 0` check scores as a whole second figure.
 */
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
