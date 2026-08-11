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

export declare function clipStemOf(action: string): string;

/**
 * Every `.mp4` on disk that could be this action's clip, sorted. With no `deps` it reads the real
 * `_generated/` tree — which is how a test under `tests/` inspects disk without importing
 * `node:fs`, since this file is `strict`-typed and `@types/node` is a frozen-out dependency.
 */
export declare function clipCandidates(
  action: string,
  deps?: {
    dirExists?: (dir: string) => boolean;
    listFiles?: (dir: string) => string[];
  },
): string[];

export declare function nextFreeDownloadPath(
  dir: string,
  stem: string,
  deps?: { fileExists?: (path: string) => boolean },
): string;

export declare function findClip(
  action: string,
  deps?: {
    dirExists?: (dir: string) => boolean;
    listFiles?: (dir: string) => string[];
    declaredFile?: string | null;
  },
): string;
