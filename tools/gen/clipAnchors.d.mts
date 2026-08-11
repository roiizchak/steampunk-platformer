/**
 * Hand-written typings for `clipAnchors.mjs`.
 *
 * `tools/` sits outside the tsconfig `include`, so the unit suite can only import this module under
 * `strict` if the shape is declared here. Written by hand rather than emitted, because emitting it
 * would need `@types/node` — a dependency the Global Constraints freeze.
 */

/** One anchor URL per slug, uploaded once and reused for every action that slug performs. */
export declare const ANCHOR_URLS: Readonly<Record<string, string>>;

export interface PaddedAnchor {
  /** The uploaded padded canvas — what actually goes into `--image_url`. */
  url: string;
  /** sha256 of the local padded PNG, so an upload can be proven rather than assumed. */
  sha256: string;
  /** Where the padded PNG lives locally. Under gitignored `_generated/`, so it may be absent. */
  source: string;
}

/**
 * Per-KEY padded-anchor overrides. Padding is a property of a GENERATION, not of a subject, which
 * is why this is keyed by `slug/action` and `ANCHOR_URLS` is keyed by slug.
 */
export declare const PADDED_ANCHORS: Readonly<Record<string, Readonly<PaddedAnchor>>>;

/** Each anchor's measured width/height, declared rather than re-measured at runtime. */
export declare const ANCHOR_RATIOS: Readonly<Record<string, number>>;

/**
 * The `aspect_ratio` string that does NOT reframe an anchor of this ratio — the nearest legal
 * value. Reframing is the one deterministic cause of the crop (7 of 7 measured clips).
 */
export declare function expectedAspectRatio(ratio: number): string;
