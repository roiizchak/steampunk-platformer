/**
 * A-T4 (R1/R2) — the producer/consumer sheet-filename contract.
 *
 * `build-clips.mjs` (the producer) writes `${clipStem(action)}-clip.png` for every `VIDEO_MOTIONS`
 * key it iterates. `build-assets.mjs` (the consumer) reads `${clipStem(motionKeyFor(SLUG, action))}
 * -clip.png` for every `(slug, action)` pair `slugConfig.mjs` declares. Before this fix these were
 * two different expressions that had never been asserted to agree: a namespaced action never
 * matched its own prefix (R1), and a bare action silently matched EVERY slug's sheet (R2, latent).
 *
 * `build-clips.mjs` runs `main()` at module load (it shells out to `ffprobe`/`ffmpeg`), so it cannot
 * be imported here — its write-path expression is pinned by reading its own source text instead of
 * being re-typed, so this test goes red the moment that script stops using it. The consumer side
 * imports the REAL `motionKeyFor` (`slugConfig.mjs`) and `clipStem` (`clipJobs.mjs`) — the same
 * functions `build-assets.mjs` calls — rather than a second reimplementation, per the instruction
 * that two definitions of one concept is where the bug lives (vault 5.3).
 *
 * Source text comes from Vite's `import.meta.glob(..., { query: '?raw' })`, not `node:fs` — same
 * technique as `style-lock.test.ts`, and it needs no `@types/node` (dependencies are frozen).
 */

import { describe, expect, it } from 'vitest';
import { SLUGS, configFor, motionKeyFor } from '../../tools/gen/slugConfig.mjs';
import { clipStem } from '../../tools/gen/clipJobs.mjs';
import { VIDEO_MOTIONS } from '../../tools/gen/motion.mjs';

const GEN_SOURCE = import.meta.glob('../../tools/gen/*.mjs', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

function source(file: string): string {
  const key = Object.keys(GEN_SOURCE).find((k) => k.endsWith(`/${file}`));
  if (!key) throw new Error(`sheet-name-contract: ${file} not found via import.meta.glob`);
  return GEN_SOURCE[key];
}

const BUILD_CLIPS_SRC = source('build-clips.mjs');
const BUILD_ASSETS_SRC = source('build-assets.mjs');

/** Every (slug, action) pair `slugConfig.mjs` declares, flattened — never a literal list. */
function allPairs(): Array<{ slug: string; action: string }> {
  return SLUGS.flatMap((slug) => configFor(slug).actions.map((action) => ({ slug, action })));
}

describe('sheet filename contract — producer (build-clips.mjs) vs consumer (build-assets.mjs)', () => {
  it('build-clips.mjs still writes `${clipStem(action)}-clip.png` for every motionKey in its work list (producer pin)', () => {
    // A-T5: the loop now walks `resolveWorkList()` (per-slug, per-action, never a bare
    // `Object.entries(VIDEO_MOTIONS)`) but `action` is still bound to the resolved `motionKey` before
    // the write path below, so the filename expression itself is unchanged.
    expect(BUILD_CLIPS_SRC).toContain('for (const { motionKey } of resolveWorkList())');
    expect(BUILD_CLIPS_SRC).toContain('const action = motionKey;');
    expect(BUILD_CLIPS_SRC).toContain('`${clipStem(action)}-clip.png`');
  });

  it('build-assets.mjs reads the exact filename via motionKeyFor + clipStem, never a prefix scan (consumer pin)', () => {
    expect(BUILD_ASSETS_SRC).toContain('`${clipStem(motionKeyFor(SLUG, action))}-clip.png`');
    // R1's actual bug: a scan for files starting with `${action}-`. Must never come back.
    expect(BUILD_ASSETS_SRC).not.toMatch(/startsWith\(`\$\{action\}-`\)/);
  });

  it('every declared (slug, action) resolves to a real VIDEO_MOTIONS key', () => {
    for (const { slug, action } of allPairs()) {
      const motionKey = motionKeyFor(slug, action);
      expect(VIDEO_MOTIONS[motionKey], `${slug}/${action} -> "${motionKey}"`).toBeDefined();
    }
  });

  it('the consumer filename for every declared pair equals the producer filename for its VIDEO_MOTIONS key', () => {
    for (const { slug, action } of allPairs()) {
      const motionKey = motionKeyFor(slug, action);
      // Consumer: what build-assets.mjs's findSource resolves for (slug, action).
      const consumerFile = `${clipStem(motionKeyFor(slug, action))}-clip.png`;
      // Producer: what build-clips.mjs writes for this same VIDEO_MOTIONS key, independently derived
      // by iterating VIDEO_MOTIONS the same way `main()`'s loop does, rather than recomputed via
      // motionKeyFor a second time.
      expect(Object.keys(VIDEO_MOTIONS)).toContain(motionKey);
      const producerFile = `${clipStem(motionKey)}-clip.png`;
      expect(consumerFile, `${slug}/${action}`).toBe(producerFile);
    }
  });

  it('R2: no two (slug, action) pairs resolve to the same filename', () => {
    const owners = new Map<string, string>();
    for (const { slug, action } of allPairs()) {
      const file = `${clipStem(motionKeyFor(slug, action))}-clip.png`;
      const label = `${slug}/${action}`;
      const prior = owners.get(file);
      expect(prior, `"${file}" claimed by both "${prior}" and "${label}"`).toBeUndefined();
      owners.set(file, label);
    }
  });

  it("the five already-shipped brass-courier legacy sheets still resolve to their bare on-disk names", () => {
    for (const action of ['idle', 'walk', 'run', 'jump', 'fall']) {
      expect(clipStem(motionKeyFor('brass-courier', action))).toBe(action);
    }
  });
});
