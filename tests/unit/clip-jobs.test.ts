/**
 * W2 — fal submission parameters, checked into version control.
 *
 * Every generated Phase 5 clip came back cropped left and right because one submitted parameter,
 * `aspect_ratio`, was typed by a human into a `genmedia` command line and recorded nowhere:
 * `docs/ASSET-PIPELINE.md` prescribes `"1:1"` for `bytedance/seedance-2.0/image-to-video`, and the
 * session that shot these clips submitted `"9:16"` instead. `tools/gen/clipJobs.mjs` is the fix —
 * `CLIP_JOBS` carries the submission parameters as data, one record per generated clip, and this
 * file is the gate that keeps them honest.
 *
 * `CLIP_JOBS` is built directly from `VIDEO_MOTIONS`'s own keys — every combat motion AND the five
 * legacy Phase 4 bare keys (`idle`, `walk`, `run`, `jump`, `fall`) — (see `clipJobs.mjs`), so it is
 * automatically exact — never one entry ahead or behind — regardless of when the concurrently
 * developed `brass-sentry/fire-elevated` motion lands. The last `it` below asserts that
 * relationship instead of a fixed count.
 */

import { describe, expect, it } from 'vitest';
import {
  ASPECT_RATIO,
  CLIP_JOBS,
  DURATION,
  ENDPOINT_ID,
  RESOLUTION,
  clipStem,
  missingClipFiles,
  readPrescribedAspectRatio,
  validateClipJob,
  videoDirExists,
} from '../../tools/gen/clipJobs.mjs';
import { COMBAT_MOTIONS } from '../../tools/gen/motionCombat.mjs';
import { VIDEO_MOTIONS } from '../../tools/gen/motion.mjs';

describe('CLIP_JOBS — fal submission parameters checked into version control', () => {
  it('the prescribed aspect_ratio is READ from ASSET-PIPELINE.md, not retyped, and is "1:1"', () => {
    const prescribed = readPrescribedAspectRatio();
    // Assert the type before the value (C5) — a parser that silently returns undefined must not
    // pass by accident.
    expect(typeof prescribed).toBe('string');
    expect(prescribed.length).toBeGreaterThan(0);
    expect(prescribed).toBe('1:1');
    expect(ASPECT_RATIO).toBe(prescribed);
  });

  it('never submits aspect_ratio "9:16" — the specific defect that cropped every sentry clip left and right', () => {
    for (const [key, job] of Object.entries(CLIP_JOBS)) {
      expect(job.aspectRatio, `${key}: aspect_ratio must never be "9:16" (the sentry-cropping defect)`).not.toBe(
        '9:16',
      );
    }
  });

  it("every record's aspect_ratio matches ASSET-PIPELINE.md's prescribed value", () => {
    const prescribed = readPrescribedAspectRatio();
    for (const [key, job] of Object.entries(CLIP_JOBS)) {
      expect(job.aspectRatio, key).toBe(prescribed);
    }
  });

  it('every record matches the recorded known-good resolution, duration and endpoint', () => {
    for (const [key, job] of Object.entries(CLIP_JOBS)) {
      expect(job.resolution, key).toBe(RESOLUTION);
      expect(job.duration, key).toBe(DURATION);
      expect(job.endpoint, key).toBe(ENDPOINT_ID);
    }
    expect(RESOLUTION).toBe('720p');
    expect(DURATION).toBe('4');
    expect(ENDPOINT_ID).toBe('bytedance/seedance-2.0/image-to-video');
  });

  it('every record key corresponds to a real declared motion entry', () => {
    for (const key of Object.keys(CLIP_JOBS)) {
      expect(VIDEO_MOTIONS[key], `"${key}" has a job record but no motion entry in VIDEO_MOTIONS`).toBeDefined();
    }
  });

  it('every non-cyclic combat motion has a job record', () => {
    for (const [key, spec] of Object.entries(COMBAT_MOTIONS)) {
      if (!spec.cyclic) {
        expect(CLIP_JOBS[key], `non-cyclic combat motion "${key}" has no CLIP_JOBS record`).toBeDefined();
      }
    }
  });

  it('has exactly one job record per VIDEO_MOTIONS key — every generated clip, combat AND the five legacy bare ones', () => {
    // Was: CLIP_JOBS keys equal COMBAT_MOTIONS keys exactly. That undercounted by design — the five
    // legacy Phase 4 bare keys (idle, walk, run, jump, fall) had NO CLIP_JOBS record at all, which is
    // exactly how `jump` got submitted at "9:16" with nothing in version control to catch it. The
    // intended contract is broader: every key VIDEO_MOTIONS can generate a clip for has a reviewable
    // record, whether or not it happens to carry a `slug/` namespace.
    expect(Object.keys(CLIP_JOBS).sort()).toEqual(Object.keys(VIDEO_MOTIONS).sort());
    // The nine combat clips already shot plus the five legacy bare ones are a floor, whether or not
    // fire-elevated has landed.
    expect(Object.keys(CLIP_JOBS).length).toBeGreaterThanOrEqual(14);
  });

  it("every record's file is null or an .mp4 whose stem starts with clipStem(key) (W2b: the declared winner of an ambiguous glob)", () => {
    for (const [key, job] of Object.entries(CLIP_JOBS)) {
      if (job.file === null) continue;
      expect(job.file.endsWith('.mp4'), `${key}: file "${job.file}" must end .mp4`).toBe(true);
      expect(
        job.file.startsWith(clipStem(key)),
        `${key}: file "${job.file}" does not start with stem "${clipStem(key)}"`,
      ).toBe(true);
    }
  });

  describe('missingClipFiles — declared files that are not actually on disk', () => {
    it('is empty when the video directory exists', () => {
      // `_generated/` is gitignored by design (vault 4.16) and absent on a fresh clone — an
      // unconditional assertion here would go red on a clean checkout, not on a real defect.
      if (!videoDirExists()) return;
      expect(missingClipFiles()).toEqual([]);
    });
  });

  describe('validateClipJob — a committed failing fixture (vault C2: a gate that cannot go red is decoration)', () => {
    it('REJECTS a record submitting aspect_ratio "9:16"', () => {
      const bad = {
        endpoint: ENDPOINT_ID,
        aspectRatio: '9:16',
        resolution: RESOLUTION,
        duration: DURATION,
        anchorUrl: 'https://example.test/anchor.png',
        file: null,
      };
      const problems = validateClipJob('fixture/bad-aspect-ratio', bad);
      expect(problems.length).toBeGreaterThan(0);
      expect(problems.some((p: string) => p.includes('9:16'))).toBe(true);
    });

    it('accepts a well-formed record', () => {
      const good = {
        endpoint: ENDPOINT_ID,
        aspectRatio: ASPECT_RATIO,
        resolution: RESOLUTION,
        duration: DURATION,
        anchorUrl: 'https://example.test/anchor.png',
        file: null,
      };
      expect(validateClipJob('fixture/good', good)).toEqual([]);
    });
  });
});
