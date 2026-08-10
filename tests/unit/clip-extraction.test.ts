/**
 * `build-clips.mjs`'s two bugs that blocked every Phase 5 combat clip:
 *
 * **Bug 1.** The one-shot (non-cyclic) branch unconditionally treated a clip as airborne and threw
 * when the feet never left the ground. `attack`, `hurt` and all three `death`s are grounded one-shots
 * — they never leave the ground by design — so every one of them hit that throw. `oneShotOnset`
 * (`sampler.mjs`) is the fix: it reads `spec.airborne`, a property of the motion spec, and resolves a
 * grounded one-shot's window via `motionOnset` instead.
 *
 * **Bug 2.** `findClip` only ever looked in `_generated/video/`, but Phase 5's namespaced clips live
 * in `_generated/phase05/video/`. `clipSource.mjs`'s `findClip` picks the directory from whether the
 * action is namespaced (`slug/action`), the same signal `videoPrompt` already uses for identity.
 *
 * Every fixture here is synthetic — no clip, no ffmpeg, no `_generated/` from the real pipeline, and
 * (per the sibling `clip-sampler.test.ts` and `png.d.mts`'s own note) no `node:fs` import in this
 * file: `findClip`'s directory reads are injectable, so this runs on a fresh clone and under
 * `test:sim-isolated`.
 */

import { describe, expect, it } from 'vitest';
import { motionOnset, oneShotOnset, windowIndices } from '../../tools/gen/sampler.mjs';
import { NAMESPACED_VIDEO_DIR, VIDEO_DIR, findClip } from '../../tools/gen/clipSource.mjs';

/** `diff(0, t)`, obeying the one contract every real `differ()` output honours: `diff(i, i) === 0`. */
const from0 =
  (values: number[]) =>
  (i: number, j: number) => {
    if (i === j) return 0;
    const t = i === 0 ? j : i;
    return values[t] ?? 0;
  };

describe('oneShotOnset — grounded vs airborne comes from spec.airborne, not the action name', () => {
  it('a grounded clip whose feet never leave the ground resolves via motionOnset, and does not throw', () => {
    // Silhouette ramps up steadily and never returns — a typical one-shot. Nothing here ever looks
    // "airborne"; the spec alone says this is a grounded motion.
    const diff = from0(Array.from({ length: 20 }, (_, t) => t / 19));
    const onset = oneShotOnset(
      'brass-courier/attack',
      { cyclic: false },
      { diff, sourceFrames: 20, footRows: [], headRows: [] },
    );
    expect(onset).toBe(motionOnset(diff, 20));
    expect(onset).toBeGreaterThan(0);
  });

  it('an airborne one-shot with no foot lift still throws, with the existing message intact', () => {
    const footRows = [100, 100, 100, 100];
    const headRows = [50, 50, 50, 50];
    expect(() =>
      oneShotOnset(
        'jump',
        { cyclic: false, airborne: true },
        { diff: () => 0, sourceFrames: 4, footRows, headRows },
      ),
    ).toThrow(
      /jump" is an airborne one-shot but its feet never leave the ground .* INDETERMINATE, not a licence to sample from frame 0 \(vault 4\.18\)/s,
    );
  });

  it('a grounded one-shot whose motionOnset finds nothing still throws — INDETERMINATE, not frame 0', () => {
    // A silhouette that never differs from its own first frame: no motion anywhere in the clip.
    const diff = () => 0;
    expect(() =>
      oneShotOnset(
        'brass-courier/hurt',
        { cyclic: false },
        { diff, sourceFrames: 10, footRows: [], headRows: [] },
      ),
    ).toThrow(/hurt" is a grounded one-shot .* INDETERMINATE, not a licence to sample from frame 0 \(vault 4\.18\)/s);
  });

  it('the resolved window never starts at frame 0 (vault 4.18) — even when motion starts at once', () => {
    // Silhouette departs from frame 0 as early as physically possible (t = 1 is the first frame that
    // can differ from frame 0 at all). Even so, the resolved onset must not be frame 0 itself.
    const diff = from0([0, 1, 1, 1, 1, 1, 1, 1, 1, 1]);
    const onset = oneShotOnset(
      'brass-courier/death',
      { cyclic: false },
      { diff, sourceFrames: 10, footRows: [], headRows: [] },
    );
    expect(onset).not.toBe(0);
    expect(windowIndices(onset, 10 - 1 - onset, 6)[0]).not.toBe(0);
  });
});

describe('findClip resolves the source directory from the action, not one hardcoded path', () => {
  it("finds a namespaced action's clip under _generated/phase05/video/", () => {
    const dirExists = (dir: string) => dir === NAMESPACED_VIDEO_DIR;
    const listFiles = (dir: string) =>
      dir === NAMESPACED_VIDEO_DIR ? ['brass-courier-attack.mp4'] : [];

    expect(findClip('brass-courier/attack', { dirExists, listFiles })).toBe(
      `${NAMESPACED_VIDEO_DIR}/brass-courier-attack.mp4`,
    );
  });

  it('still finds a legacy bare-key action under _generated/video/', () => {
    const dirExists = (dir: string) => dir === VIDEO_DIR;
    const listFiles = (dir: string) => (dir === VIDEO_DIR ? ['idle.mp4'] : []);

    expect(findClip('idle', { dirExists, listFiles })).toBe(`${VIDEO_DIR}/idle.mp4`);
  });

  it('does not find a namespaced clip sitting only in the legacy directory', () => {
    const dirExists = (dir: string) => dir === VIDEO_DIR;
    const listFiles = (dir: string) => (dir === VIDEO_DIR ? ['brass-courier-attack.mp4'] : []);

    expect(() => findClip('brass-courier/attack', { dirExists, listFiles })).toThrow(
      /does not exist/,
    );
  });
});

describe('findClip declaredFile — CLIP_JOBS data replaces the glob, so a re-shoot cannot reintroduce the ambiguity', () => {
  it('declaredFile set: returns it directly and never calls listFiles', () => {
    const dirExists = (path: string) =>
      path === NAMESPACED_VIDEO_DIR || path === `${NAMESPACED_VIDEO_DIR}/brass-courier-attack-r2.mp4`;
    const listFiles = (): string[] => {
      throw new Error('listFiles must not be called when declaredFile is set');
    };

    expect(
      findClip('brass-courier/attack', {
        dirExists,
        listFiles,
        declaredFile: 'brass-courier-attack-r2.mp4',
      }),
    ).toBe(`${NAMESPACED_VIDEO_DIR}/brass-courier-attack-r2.mp4`);
  });

  it('declaredFile set but absent from the directory: throws, naming the file', () => {
    const dirExists = (path: string) => path === NAMESPACED_VIDEO_DIR;
    const listFiles = (): string[] => {
      throw new Error('listFiles must not be called when declaredFile is set');
    };

    expect(() =>
      findClip('brass-courier/attack', {
        dirExists,
        listFiles,
        declaredFile: 'brass-courier-attack-r3.mp4',
      }),
    ).toThrow(/brass-courier-attack-r3\.mp4/);
  });

  it('declaredFile null + ambiguous listing: throws the "declare the winner" message', () => {
    const dirExists = (dir: string) => dir === NAMESPACED_VIDEO_DIR;
    const listFiles = () => ['brass-courier-attack.mp4', 'brass-courier-attack-r2.mp4'];

    expect(() => findClip('brass-courier/attack', { dirExists, listFiles })).toThrow(
      /declare the winner/i,
    );
  });

  it('declaredFile null + single match: unchanged', () => {
    const dirExists = (dir: string) => dir === NAMESPACED_VIDEO_DIR;
    const listFiles = () => ['brass-sentry-idle.mp4'];

    expect(findClip('brass-sentry/idle', { dirExists, listFiles })).toBe(
      `${NAMESPACED_VIDEO_DIR}/brass-sentry-idle.mp4`,
    );
  });

  it('legacy bare key with no CLIP_JOBS record: unchanged glob behaviour', () => {
    const dirExists = (dir: string) => dir === VIDEO_DIR;
    const listFiles = (dir: string) => (dir === VIDEO_DIR ? ['walk.mp4'] : []);

    expect(findClip('walk', { dirExists, listFiles })).toBe(`${VIDEO_DIR}/walk.mp4`);
  });
});
