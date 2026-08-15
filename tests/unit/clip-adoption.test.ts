/**
 * The producer/consumer filename contract for paid clips.
 *
 * ## What this gate is for
 *
 * `submit-clips.mjs` picks a re-shoot's download filename from what is already on disk
 * (`nextFreeDownloadPath` — the next free `-rN`, so a paid round-1 clip is never clobbered).
 * `findClip` resolves the clip to EXTRACT from `CLIP_JOBS[key].file`. **Nothing connected the two.**
 *
 * The session-6 Codex plan review measured the consequence against the tree the moment before an
 * $8.33 batch was to be submitted: **six of seven keys** would have downloaded a new `-rN` and then
 * gone on extracting the PREVIOUS round — silently, and looking exactly like success — while the
 * seventh (`brass-courier/death`, declared `null`) would have thrown on an ambiguous glob. The money
 * would have been spent and the pipeline would have consumed the very clips it was replacing.
 *
 * So: every `.mp4` on disk for a key must be either the declared winner or listed in
 * `SUPERSEDED_CLIPS` as knowingly rejected. A newly landed round is neither, and this goes red until
 * a human says which it is.
 *
 * ## Why not "newest wins"
 *
 * Because newest does not always win here, and the counter-example is already on disk: `jump-r2.mp4`
 * fixed a horizontal crop and introduced a vertical one, so it is kept as evidence and deliberately
 * NOT adopted. A rule preferring the later round would silently adopt a clip a human had rejected.
 */

import { describe, expect, it } from 'vitest';
import { CLIP_JOBS } from '../../tools/gen/clipJobs.mjs';
import { SUPERSEDED_CLIPS, adoptionProblems } from '../../tools/gen/clipAdoption.mjs';
import { clipCandidates } from '../../tools/gen/clipSource.mjs';

/**
 * The exact shape of the defect, as committed failing fixtures *(vault C2 — a gate that cannot go
 * red is decoration, and assertions about assertions are not evidence)*. Each of these is a real
 * state the tree can reach; the first is the one that was about to cost $8.33.
 */
describe('adoptionProblems — the negative half, on committed failing fixtures', () => {
  it('CATCHES a newly landed re-shoot that nothing has adopted — the $8.33 defect', () => {
    const problems = adoptionProblems('brass-sentry/fire', {
      declaredFile: 'brass-sentry-fire-r3.mp4',
      superseded: ['brass-sentry-fire.mp4', 'brass-sentry-fire-r2.mp4'],
      // -r4 has just been downloaded by a paid submission and declared nowhere.
      candidates: [
        'brass-sentry-fire.mp4',
        'brass-sentry-fire-r2.mp4',
        'brass-sentry-fire-r3.mp4',
        'brass-sentry-fire-r4.mp4',
      ],
    });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('brass-sentry-fire-r4.mp4');
    // The message must say which clip is actually being extracted, not merely that something is off.
    expect(problems[0]).toContain('ignoring the newer round');
  });

  it('CATCHES an undeclared key that has become ambiguous — the brass-courier/death case', () => {
    const problems = adoptionProblems('brass-courier/death', {
      declaredFile: null,
      superseded: [],
      candidates: ['brass-courier-death.mp4', 'brass-courier-death-r2.mp4'],
    });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('no declared file');
  });

  it('CATCHES a declared file that is not on disk', () => {
    const problems = adoptionProblems('rust-scavenger/walk', {
      declaredFile: 'rust-scavenger-walk-r9.mp4',
      superseded: [],
      candidates: ['rust-scavenger-walk.mp4'],
    });
    expect(problems.some((p) => p.includes('is not on disk'))).toBe(true);
  });

  it('CATCHES a stale SUPERSEDED_CLIPS entry, which would hide a real unaccounted clip', () => {
    const problems = adoptionProblems('brass-sentry/death', {
      declaredFile: 'brass-sentry-death-r2.mp4',
      superseded: ['brass-sentry-death-r7.mp4'],
      candidates: ['brass-sentry-death.mp4', 'brass-sentry-death-r2.mp4'],
    });
    // Two distinct complaints: the unaccounted round-1 file AND the stale entry that masked it.
    expect(problems).toHaveLength(2);
    expect(problems.join('\n')).toContain('brass-sentry-death.mp4');
    expect(problems.join('\n')).toContain('hides a real');
  });
});

describe('adoptionProblems — the positive half', () => {
  it('is quiet when every clip on disk is either declared or knowingly superseded', () => {
    expect(
      adoptionProblems('brass-sentry/fire', {
        declaredFile: 'brass-sentry-fire-r3.mp4',
        superseded: ['brass-sentry-fire.mp4', 'brass-sentry-fire-r2.mp4'],
        candidates: [
          'brass-sentry-fire.mp4',
          'brass-sentry-fire-r2.mp4',
          'brass-sentry-fire-r3.mp4',
        ],
      }),
    ).toEqual([]);
  });

  it('is quiet on an empty tree — `_generated/` is gitignored and absent on a fresh clone', () => {
    // Finding R7 recorded a test that went red merely because a directory was absent. A gate written
    // to prevent false greens must not become a false-red generator.
    expect(
      adoptionProblems('brass-sentry/fire', { declaredFile: 'x-r3.mp4', candidates: [] }),
    ).toEqual([]);
  });

  it('accepts a single undeclared candidate — one clip cannot be ambiguous', () => {
    expect(
      adoptionProblems('idle', { declaredFile: null, candidates: ['idle.mp4'] }),
    ).toEqual([]);
  });
});

/**
 * The live half, over the real `_generated/` tree.
 *
 * `clipCandidates` with no injected deps reads real disk inside the `.mjs` module, which is how this
 * test inspects the filesystem without importing `node:fs` — `tests/` is tsconfig-strict and
 * `@types/node` is a frozen-out dependency.
 *
 * **This is the assertion that goes red the moment a paid re-shoot lands and is not adopted.**
 */
describe('every clip on disk is accounted for', () => {
  it('has no unaccounted, ambiguous or missing clip for any CLIP_JOBS key', () => {
    const problems: string[] = [];
    for (const key of Object.keys(CLIP_JOBS)) {
      problems.push(
        ...adoptionProblems(key, {
          declaredFile: CLIP_JOBS[key].file,
          superseded: SUPERSEDED_CLIPS[key] ?? [],
          candidates: clipCandidates(key),
        }),
      );
    }
    expect(problems, problems.join('\n')).toEqual([]);
  });

  it('lists no superseded clip for a key that has no record at all', () => {
    const orphans = Object.keys(SUPERSEDED_CLIPS).filter((k) => CLIP_JOBS[k] === undefined);
    expect(orphans, `SUPERSEDED_CLIPS keys with no CLIP_JOBS record: ${orphans.join(', ')}`).toEqual(
      [],
    );
  });
});
