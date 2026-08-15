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
import { SLUGS, configFor, workListFor } from '../../tools/gen/slugConfig.mjs';
import { VIDEO_MOTIONS } from '../../tools/gen/motion.mjs';
import { resolveWorkList } from '../../tools/gen/build-clips.mjs';

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

/**
 * `workListFor` / `resolveWorkList` — action-level scoping (work item A-T5), so `assets:clips`
 * never attempts `jump` (fails G6) or `brass-sentry/fire-elevated` (no clip file, no slugConfig
 * entry) just because a slug's OTHER actions were wanted.
 *
 * The `resolveWorkList` block is the critical one: a prior review flagged that a pure `workListFor`
 * test passes even while `main()` still walks `Object.entries(VIDEO_MOTIONS)` unchanged.
 * `resolveWorkList` is the exact function `build-clips.mjs`'s `main()` calls to get its loop's work
 * list, so asserting against it is asserting against production, not a parallel reimplementation.
 */
describe('workListFor — per-slug, per-action scoping', () => {
  it('with no explicit actions, matches configFor(slug).actions exactly, for all three slugs', () => {
    for (const slug of SLUGS) {
      const actions = workListFor(slug).map((w) => w.action);
      expect(actions, slug).toEqual(configFor(slug).actions);
    }
  });

  it('the three slugs\' work lists are disjoint by resolved motionKey', () => {
    const seen = new Set<string>();
    for (const slug of SLUGS) {
      for (const { motionKey } of workListFor(slug)) {
        expect(seen.has(motionKey), motionKey).toBe(false);
        seen.add(motionKey);
      }
    }
  });

  it('fire-elevated is a real VIDEO_MOTIONS key but is in NO slug\'s work list', () => {
    expect(Object.keys(VIDEO_MOTIONS)).toContain('brass-sentry/fire-elevated');
    for (const slug of SLUGS) {
      const keys = workListFor(slug).map((w) => w.motionKey);
      expect(keys, slug).not.toContain('brass-sentry/fire-elevated');
    }
  });

  it('throws on an action not declared for the slug', () => {
    expect(() => workListFor('brass-courier', ['fly'])).toThrow(/no action "fly"/);
    expect(() => workListFor('brass-sentry', ['jump'])).toThrow(/no action "jump"/);
  });

  it('an explicit action filter returns exactly those actions, in the order given', () => {
    const list = workListFor('brass-courier', ['attack', 'hurt', 'death']);
    expect(list.map((w) => w.action)).toEqual(['attack', 'hurt', 'death']);
    expect(list.map((w) => w.motionKey)).toEqual([
      'brass-courier/attack',
      'brass-courier/hurt',
      'brass-courier/death',
    ]);
    expect(list.every((w) => w.slug === 'brass-courier')).toBe(true);
  });
});

/**
 * `resolveWorkList` above is a correct, independently-testable function — and that alone is NOT
 * proof `main()` calls it. A prior review flagged exactly this: a pure `workListFor`/`resolveWorkList`
 * test stays green even if `main()`'s loop reverts to `Object.entries(VIDEO_MOTIONS)`, because that
 * mutation never touches the exported function itself, only main()'s own loop header. `main()` runs
 * `ffprobe`/`ffmpeg` so it cannot be invoked from a synthetic-fixture unit test; its source text is
 * pinned instead, the same technique `sheet-name-contract.test.ts` already uses for this exact file.
 */
const BUILD_CLIPS_SRC = (
  import.meta.glob('../../tools/gen/build-clips.mjs', {
    query: '?raw',
    import: 'default',
    eager: true,
  }) as Record<string, string>
)['../../tools/gen/build-clips.mjs'];

describe('main() actually walks resolveWorkList() — not a re-test of the function in isolation', () => {
  it('main()\'s loop header reads `for (const { motionKey } of resolveWorkList())`', () => {
    expect(BUILD_CLIPS_SRC).toContain('for (const { motionKey } of resolveWorkList())');
  });

  it('main() no longer walks `Object.entries(VIDEO_MOTIONS)` directly', () => {
    expect(BUILD_CLIPS_SRC).not.toContain('for (const [action, spec] of Object.entries(VIDEO_MOTIONS))');
  });
});

describe('resolveWorkList — asserted against build-clips.mjs\'s actual main() work list, not a copy', () => {
  it('no argv: the union of every slug\'s own actions — never Object.keys(VIDEO_MOTIONS)', () => {
    const list = resolveWorkList([]);
    const expectedCount = SLUGS.reduce((n, slug) => n + configFor(slug).actions.length, 0);
    expect(list.length).toBe(expectedCount);
    expect(list.length).toBeLessThan(Object.keys(VIDEO_MOTIONS).length);
    expect(list.map((w) => w.motionKey)).not.toContain('brass-sentry/fire-elevated');
  });

  it('a bare slug argv resolves that slug\'s full action list, excluding jump for brass-courier is NOT assumed — but explicit filters are honoured', () => {
    const list = resolveWorkList(['brass-courier', 'attack', 'hurt', 'death']);
    expect(list.map((w) => w.motionKey)).toEqual([
      'brass-courier/attack',
      'brass-courier/hurt',
      'brass-courier/death',
    ]);
    expect(list.map((w) => w.motionKey)).not.toContain('jump');
  });

  it('brass-sentry with no action filter never includes fire-elevated', () => {
    const list = resolveWorkList(['brass-sentry']);
    expect(list.map((w) => w.motionKey)).toEqual([
      'brass-sentry/idle',
      'brass-sentry/fire',
      'brass-sentry/death',
    ]);
  });
});
