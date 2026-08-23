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
import { expectedAspectRatio } from '../../tools/gen/clipAnchors.mjs';
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

  /**
   * **The rule is "no record REFRAMES its anchor", not "no record says 9:16".**
   *
   * This assertion used to ban the literal string. That was right about the evidence and wrong
   * about the rule. What the 17-clip framing report measured is that a clip is cut whenever the
   * OUTPUT ratio differs from its ANCHOR's ratio — 7 of 7, two subjects, both directions. `9:16`
   * was the defect for `brass-sentry` and `rust-scavenger`, whose anchors are square. For
   * `brass-courier` it is the reverse: that anchor is 1536 x 2752 = 0.558, so `9:16` is its MATCHED
   * ratio and `1:1` is the reframe — and every clean courier sheet the project ships (idle, walk,
   * run, jump, fall, hurt) was shot at `9:16`.
   *
   * The blanket ban therefore forbade the only correct ratio for one of three subjects. The
   * replacement is STRICTER, not looser: it catches a reframe on any subject in either direction,
   * where the string ban caught one value on one anchor shape.
   */
  it('no record reframes its anchor — the one deterministic cause of the crop', () => {
    for (const [key, job] of Object.entries(CLIP_JOBS)) {
      expect(job.aspectRatio, `${key} reframes an anchor of ratio ${job.anchorRatio}`).toBe(
        expectedAspectRatio(job.anchorRatio),
      );
    }
  });

  it('a square anchor resolves to exactly the ratio ASSET-PIPELINE.md prescribes', () => {
    // The doc's prescribed value is the SQUARE case — which is what the sentry, the scavenger and
    // every padded canvas are. It is no longer asserted over records whose anchor is not square.
    const prescribed = readPrescribedAspectRatio();
    expect(expectedAspectRatio(1)).toBe(prescribed);
    for (const [key, job] of Object.entries(CLIP_JOBS)) {
      if (job.anchorRatio === 1) {
        expect(job.aspectRatio, key).toBe(prescribed);
      }
    }
  });

  it('catches a reframe in BOTH directions, on committed failing fixtures (C2)', () => {
    // A square anchor shot at 9:16 — session 1's actual error, which cut every sentry clip.
    expect(validateClipJob('fixture/square-at-9:16', {
      ...CLIP_JOBS['brass-sentry/idle'],
      anchorRatio: 1,
      aspectRatio: '9:16',
    }).join(' ')).toContain('REFRAMES its anchor');
    // A 9:16 anchor shot at 1:1 — the mirror case, which cut jump-r2 at the top instead.
    expect(validateClipJob('fixture/tall-at-1:1', {
      ...CLIP_JOBS['brass-courier/hurt'],
      anchorRatio: 1536 / 2752,
      aspectRatio: '1:1',
    }).join(' ')).toContain('REFRAMES its anchor');
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
    it('REJECTS a SQUARE anchor submitted at "9:16" — the error session 1 actually made', () => {
      const bad = {
        endpoint: ENDPOINT_ID,
        aspectRatio: '9:16',
        anchorRatio: 1,
        resolution: RESOLUTION,
        duration: DURATION,
        anchorUrl: 'https://example.test/anchor.png',
        file: null,
      };
      const problems = validateClipJob('fixture/bad-aspect-ratio', bad);
      expect(problems.length).toBeGreaterThan(0);
      expect(problems.some((p: string) => p.includes('REFRAMES its anchor'))).toBe(true);
    });

    it('REJECTS a record carrying no anchorRatio at all — the reframe cannot be judged without it', () => {
      const problems = validateClipJob('fixture/no-ratio', {
        endpoint: ENDPOINT_ID,
        aspectRatio: ASPECT_RATIO,
        resolution: RESOLUTION,
        duration: DURATION,
        anchorUrl: 'https://example.test/anchor.png',
        file: null,
      });
      expect(problems.some((p: string) => p.includes('anchorRatio must be a positive number'))).toBe(
        true,
      );
    });

    it('accepts a well-formed record', () => {
      const good = {
        endpoint: ENDPOINT_ID,
        aspectRatio: ASPECT_RATIO,
        anchorRatio: 1,
        resolution: RESOLUTION,
        duration: DURATION,
        anchorUrl: 'https://example.test/anchor.png',
        file: null,
      };
      expect(validateClipJob('fixture/good', good)).toEqual([]);
    });
  });

  /**
   * A3a — the padded-anchor override.
   *
   * `ANCHOR_URLS` is keyed by SLUG, but padding is a property of a GENERATION. Before this there
   * was no way to say "this clip was shot from the padded canvas" and no way for `submit-clips.mjs`
   * to submit one — it reads `job.anchorUrl` and nothing else. Every planned padded re-shoot would
   * have gone out against the unpadded anchor, testing the treatment by not applying it: a 7-clip
   * batch is $8.33.
   *
   * The record was already self-contradictory when this was found. `CLIP_FILES` declares
   * `brass-sentry/fire` as `-r3` and says in prose that it came from *"the anchor padded to 3130²"*,
   * while the `anchorUrl` beside it resolved to the 2048² original. **Data is what gets submitted.**
   */
  describe('padded anchors are declared per key, not inferred', () => {
    const SENTRY_UNPADDED = 'https://v3b.fal.media/files/b/0aa5ad07/eTruVD1130OxBEzbPfi0G_anchor.png';

    it('brass-sentry/fire submits the PADDED canvas, matching the clip it declares', () => {
      const fire = CLIP_JOBS['brass-sentry/fire'];
      // Re-taken 2026-08-23: `-r6` supersedes `-r4` (inventory 3.10).
      expect(fire.file).toBe('brass-sentry-fire-r6.mp4');
      expect(fire.anchorPadded).toBe(true);
      // The decisive assertion: not merely "an anchor is set", but "not the one that was replaced".
      expect(fire.anchorUrl).not.toBe(SENTRY_UNPADDED);
      expect(fire.anchorUrl).toContain('padded');
    });

    it('carries a verifiable digest for the padded bytes', () => {
      // Anchor identity has been assumed once on this project and it cost a probe.
      expect(CLIP_JOBS['brass-sentry/fire'].anchorSha256).toMatch(/^[0-9a-f]{64}$/);
      expect(CLIP_JOBS['brass-sentry/fire'].anchorSource).toContain('anchors-padded');
    });

    it('leaves every other sentry action on the unpadded slug anchor', () => {
      // Padding is per-generation. A slug-wide override would silently re-shoot `idle`, which
      // already packs, from a canvas it was never measured against.
      expect(CLIP_JOBS['brass-sentry/idle'].anchorUrl).toBe(SENTRY_UNPADDED);
      expect(CLIP_JOBS['brass-sentry/idle'].anchorPadded).toBe(false);
      expect(CLIP_JOBS['brass-sentry/idle'].anchorSha256).toBeNull();
    });

    it('rejects a padded record whose digest is missing or malformed', () => {
      const base = {
        endpoint: ENDPOINT_ID,
        aspectRatio: ASPECT_RATIO,
        resolution: RESOLUTION,
        duration: DURATION,
        anchorUrl: 'https://example.test/padded.png',
      };
      for (const bad of [undefined, null, '', 'not-a-digest', 'ABC123']) {
        const problems = validateClipJob('fixture/padded', {
          ...base,
          anchorPadded: true,
          anchorSha256: bad,
        });
        expect(problems.some((p: string) => p.includes('64-character hex digest'))).toBe(true);
      }
    });

    it('rejects a digest on a record that does not claim padding', () => {
      // A dangling digest describes bytes that were never submitted.
      const problems = validateClipJob('fixture/dangling', {
        endpoint: ENDPOINT_ID,
        aspectRatio: ASPECT_RATIO,
        resolution: RESOLUTION,
        duration: DURATION,
        anchorUrl: 'https://example.test/anchor.png',
        anchorPadded: false,
        anchorSha256: 'a'.repeat(64),
      });
      expect(problems.some((p: string) => p.includes('without declaring anchorPadded'))).toBe(true);
    });

    it('tolerates a record that simply omits the padding fields', () => {
      // An absent digest on an unpadded record is an ordinary record, not a malformed one.
      expect(
        validateClipJob('fixture/plain', {
          endpoint: ENDPOINT_ID,
          aspectRatio: ASPECT_RATIO,
          anchorRatio: 1,
          resolution: RESOLUTION,
          duration: DURATION,
          anchorUrl: 'https://example.test/anchor.png',
        }),
      ).toEqual([]);
    });
  });
});
