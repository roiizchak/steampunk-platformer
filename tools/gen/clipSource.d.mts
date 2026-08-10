/**
 * Hand-written typings for `clipSource.mjs`.
 *
 * `tools/` sits outside the tsconfig `include`, so the unit suite can only import this module under
 * `strict` if the shape is declared here. Written by hand rather than emitted, because emitting it
 * would need `@types/node` — a dependency the Global Constraints freeze.
 */

export declare const VIDEO_DIR: string;
export declare const NAMESPACED_VIDEO_DIR: string;

export declare function videoDirFor(action: string): string;

export declare function findClip(
  action: string,
  deps?: {
    dirExists?: (dir: string) => boolean;
    listFiles?: (dir: string) => string[];
  },
): string;
