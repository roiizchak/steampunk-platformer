/**
 * Hand-written typings for `clipJobs.mjs`. `tools/` sits outside the tsconfig `include`, so
 * `strict` needs a declaration to import it.
 */

export interface ClipJob {
  endpoint: string;
  aspectRatio: string;
  resolution: string;
  duration: string;
  anchorUrl: string;
  file: string | null;
}

export declare const ENDPOINT_ID: string;
export declare const RESOLUTION: string;
export declare const DURATION: string;
export declare const ASPECT_RATIO: string;
export declare const PROMPT_OUT_DIR: string;
export declare const PARAMS_OUT_DIR: string;

export declare function readPrescribedAspectRatio(docText?: string): string;
export declare function clipStem(key: string): string;
export declare function validateClipJob(key: string, job: ClipJob): string[];
export declare function videoDirExists(): boolean;
export declare function missingClipFiles(): string[];

export declare const CLIP_JOBS: Record<string, ClipJob>;
