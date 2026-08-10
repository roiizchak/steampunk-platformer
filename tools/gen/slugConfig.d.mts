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
