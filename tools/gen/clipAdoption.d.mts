/**
 * Hand-written typings for `clipAdoption.mjs`.
 *
 * `tools/` sits outside the tsconfig `include`, so the unit suite can only import this module under
 * `strict` if the shape is declared here. Written by hand rather than emitted, because emitting it
 * would need `@types/node` — a dependency the Global Constraints freeze.
 */

/** Clips on disk that are deliberately not adopted, keyed exactly as `CLIP_JOBS` is. */
export declare const SUPERSEDED_CLIPS: Readonly<Record<string, readonly string[]>>;

/**
 * Problems with one key's adoption state. Empty means every clip on disk for that key is either the
 * declared winner or knowingly superseded.
 *
 * `candidates` is supplied by the caller so the negative half of the gate can be exercised on
 * synthetic listings *(vault C2)*.
 */
export declare function adoptionProblems(
  key: string,
  args: {
    declaredFile: string | null;
    superseded?: readonly string[];
    candidates: readonly string[];
  },
): string[];
