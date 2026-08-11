/**
 * Hand-written typings for `clipJobs.mjs`. `tools/` sits outside the tsconfig `include`, so
 * `strict` needs a declaration to import it.
 */

export interface ClipJob {
  endpoint: string;
  aspectRatio: string;
  resolution: string;
  duration: string;
  /** The canvas actually submitted — the PADDED one where `anchorPadded` is true (A3a). */
  anchorUrl: string;
  /** True where a per-key padded canvas overrides the slug's default anchor. */
  anchorPadded: boolean;
  /** sha256 of the local padded PNG, so an upload can be proven rather than assumed. */
  anchorSha256: string | null;
  /** Repo-relative path of the padded PNG under gitignored `_generated/anchors-padded/`. */
  anchorSource: string | null;
  file: string | null;
}

/**
 * What `validateClipJob` accepts. Deliberately looser than `ClipJob`: it exists to be pointed at
 * hand-built fixtures (vault C2 — a gate that cannot go red is decoration), including ones that
 * omit the optional padding fields entirely, and including malformed values that must be REJECTED.
 * Typing the parameter as `ClipJob` would make the failing fixtures un-writable in TypeScript,
 * which would quietly delete the negative half of the gate.
 */
export interface ClipJobCandidate {
  endpoint?: unknown;
  aspectRatio?: unknown;
  resolution?: unknown;
  duration?: unknown;
  anchorUrl?: unknown;
  anchorPadded?: unknown;
  anchorSha256?: unknown;
  anchorSource?: unknown;
  file?: unknown;
}

export declare const ENDPOINT_ID: string;
export declare const RESOLUTION: string;
export declare const DURATION: string;
export declare const ASPECT_RATIO: string;
export declare const PROMPT_OUT_DIR: string;
export declare const PARAMS_OUT_DIR: string;

export declare function readPrescribedAspectRatio(docText?: string): string;
export declare function clipStem(key: string): string;
export declare function validateClipJob(key: string, job: ClipJobCandidate): string[];
export declare function videoDirExists(): boolean;
export declare function missingClipFiles(): string[];

export declare const CLIP_JOBS: Record<string, ClipJob>;
