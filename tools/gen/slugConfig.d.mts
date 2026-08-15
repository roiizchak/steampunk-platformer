/**
 * Hand-written typings for `slugConfig.mjs`. `tools/` sits outside the tsconfig `include`, so
 * `strict` needs a declaration to import it.
 */

export interface SlugConfig {
  generated: string;
  outDir: string;
  config: string;
  liftProfile: string;
  reportPath: string;
  actions: string[];
  looping: Set<string>;
}

export declare const SLUGS: string[];

export declare function configFor(slug: string): SlugConfig;

export declare function motionKeyFor(slug: string, action: string): string;

export interface WorkItem {
  slug: string;
  action: string;
  motionKey: string;
}

export declare function workListFor(slug: string, actions?: string[]): WorkItem[];

export declare function resolveActionScale(
  config: {
    scale?: number;
    // An animation record carries verticalAnchor/footOffsetPx/activeFrames too; only `scale` is
    // read here, and `null` means "not measured yet" rather than an override.
    animations?: Record<string, { scale?: number | null } & Record<string, unknown>>;
  },
  action: string,
): { scale: number | undefined; scaleSource: 'action' | 'slug' };
