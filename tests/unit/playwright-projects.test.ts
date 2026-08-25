import { describe, expect, it } from 'vitest';

/**
 * # The Playwright project-selection invariant, which was comment-enforced only
 *
 * `playwright.config.ts` states this rule **twice, in prose**, and nothing executed it:
 *
 * > *"This regex and the `chromium-gpu` `testMatch` below are the SAME pattern and must stay
 * > identical — a file that matches neither runs nowhere, and a file that matches both runs twice,
 * > once on the rasteriser its assertions are meaningless on."*
 *
 * ## Why a comment is not enough here, specifically
 *
 * A spec that matches **neither** project is not selected by any project, so Playwright reports
 * `expected: 0, unexpected: 0` **and exits 0**. That is indistinguishable from a clean pass unless
 * someone reads the count — which is this project's own §5 rule, and the failure it has been bitten
 * by three times. The config's own comments record the near-miss twice more: `6-hud|6-chrome` was
 * once an exact list, and *"every split of those files — this phase alone produced three — silently
 * opted the new file back into SwiftShader"*.
 *
 * The other direction is worse than noisy: a spec matching **both** runs twice, once on SwiftShader,
 * where a timing or pixel assertion is a measurement of the wrong substrate wearing a green tick.
 *
 * ## What this gate reads, and why it is source text rather than the imported config
 *
 * It reads `playwright.config.ts` as **raw source** and extracts the three patterns by their project
 * block. Importing the real config would pull in `@playwright/test` and `devices`, which the unit
 * suite deliberately does not depend on — `npm run test:sim-isolated` runs this same suite with
 * Phaser uninstalled, and adding an e2e-runner import here would be a new coupling for no gain.
 *
 * The cost of source text is that a *refactor* of the config's shape (a pattern hoisted to a
 * `const`, a project renamed) reds this file rather than passing. That is the correct direction:
 * the extraction failing loudly beats it silently matching nothing, and `PATTERNS_FOUND` below is
 * the vacuity guard that makes the difference detectable.
 *
 * ## The selection algebra it asserts
 *
 * Playwright selects a file for a project when `testMatch` matches (default: everything) **and**
 * `testIgnore` does not. With `P` = the shared GPU pattern and `D` = the DPR-2 pattern:
 *
 * | project | selects when |
 * |---|---|
 * | `chromium` | `!P` |
 * | `chromium-gpu` | `P && !D` |
 * | `chromium-dpr2` | `D` |
 *
 * Summing those over the four possible `(P, D)` combinations gives 1, 1, 1 — except `!P && D`,
 * which gives **2**. So "exactly one project selects every spec" is a real assertion with a
 * reachable failure, not a tautology.
 */

const CONFIG = import.meta.glob('../../playwright.config.ts', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const SPEC_FILES = import.meta.glob('../e2e/*.spec.ts', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const source = Object.values(CONFIG)[0] ?? '';

const specNames = Object.keys(SPEC_FILES)
  .map((p) => p.split('/').pop() ?? '')
  .sort();

/**
 * Slice the config at a project's `name:` line and take everything up to the next one, so a
 * `testMatch`/`testIgnore` is attributed to the project that actually declares it. Searching the
 * whole file would find the first of four and silently compare the wrong pair.
 */
function projectBlock(name: string): string {
  const start = source.indexOf(`name: '${name}'`);
  if (start < 0) return '';
  const rest = source.slice(start + 1);
  const next = rest.indexOf("name: 'chromium");
  return next < 0 ? rest : rest.slice(0, next);
}

/** The regex literal's SOURCE TEXT, not a constructed RegExp — two patterns are "identical" only if
 *  they are byte-identical, and comparing `RegExp` objects by `.source` after construction would
 *  hide a flags difference. */
function patternText(block: string, key: 'testMatch' | 'testIgnore'): string | null {
  const m = new RegExp(`${key}:\\s*(/(?:[^/\\\\\\n]|\\\\.)+/[a-z]*)`).exec(block);
  return m ? m[1]! : null;
}

const chromium = projectBlock('chromium');
const gpu = projectBlock('chromium-gpu');
const dpr2 = projectBlock('chromium-dpr2');

const chromiumIgnore = patternText(chromium, 'testIgnore');
const gpuMatch = patternText(gpu, 'testMatch');
const gpuIgnore = patternText(gpu, 'testIgnore');
const dpr2Match = patternText(dpr2, 'testMatch');

/** Vacuity guard. If the config is refactored so the extraction finds nothing, every equality below
 *  would compare `null` to `null` and pass while measuring absolutely nothing. */
const PATTERNS_FOUND = [chromiumIgnore, gpuMatch, gpuIgnore, dpr2Match].filter(
  (p) => p !== null,
).length;

/** Build a live RegExp from the extracted literal so selection can actually be evaluated. */
function toRegExp(literal: string): RegExp {
  const end = literal.lastIndexOf('/');
  return new RegExp(literal.slice(1, end), literal.slice(end + 1));
}

describe('playwright project selection', () => {
  it('extracted all four patterns — the config shape has not drifted out from under this gate', () => {
    expect(
      PATTERNS_FOUND,
      'could not extract the project patterns from playwright.config.ts — the config was refactored ' +
        'and every assertion in this file is now vacuous. Fix the extraction, do not delete the test.',
    ).toBe(4);
    expect(specNames.length, 'no e2e spec files were globbed at all').toBeGreaterThan(20);
  });

  it("chromium's testIgnore and chromium-gpu's testMatch are the SAME pattern", () => {
    // The config asserts this in prose at two separate places. This is the executable copy.
    expect(
      chromiumIgnore,
      "chromium's testIgnore has drifted from chromium-gpu's testMatch. A spec matching neither now " +
        'runs NOWHERE and reports `0 passed` with exit 0 — the false green this config warns about ' +
        'twice. A spec matching both runs twice, once on SwiftShader.',
    ).toBe(gpuMatch);
  });

  it("chromium-gpu's testIgnore and chromium-dpr2's testMatch are mirrors", () => {
    // `phase-06-dpr2` matches the shared prefix pattern, so it must be excluded from `chromium-gpu`
    // and claimed by `chromium-dpr2`. If these two drift, the DPR-2 spec either runs at DPR 1
    // (passing while measuring the exact case inventory 2b.6 says is untested) or runs twice.
    expect(
      gpuIgnore,
      "chromium-gpu's testIgnore has drifted from chromium-dpr2's testMatch — the DPR-2 spec now " +
        'runs at DPR 1, or runs in both projects.',
    ).toBe(dpr2Match);
  });

  it('every e2e spec is selected by EXACTLY ONE project', () => {
    // 🔴 Each project is modelled from ITS OWN extracted patterns — four values, not two.
    // The first draft used `dpr2Match` for chromium-gpu's exclusion because the two are supposed to
    // be mirrors, which made this assertion blind to a drift in `chromium-gpu`'s `testIgnore`: the
    // mirror mutation reddened only the test above while this one stayed green. Modelling a project
    // by the value it is SUPPOSED to have rather than the one it HAS is how a gate ends up asserting
    // its own assumption. Caught by running the mutation this file names.
    const chromiumSkip = toRegExp(chromiumIgnore!);
    const gpuTake = toRegExp(gpuMatch!);
    const gpuSkip = toRegExp(gpuIgnore!);
    const dpr2Take = toRegExp(dpr2Match!);

    const wrong: string[] = [];
    for (const name of specNames) {
      const projects: string[] = [];
      if (!chromiumSkip.test(name)) projects.push('chromium');
      if (gpuTake.test(name) && !gpuSkip.test(name)) projects.push('chromium-gpu');
      if (dpr2Take.test(name)) projects.push('chromium-dpr2');
      if (projects.length !== 1) {
        wrong.push(`${name} -> ${projects.length === 0 ? 'NOWHERE' : projects.join(' + ')}`);
      }
    }

    expect(
      wrong,
      'these specs are not selected by exactly one project. "NOWHERE" reports `0 passed` and exits 0; ' +
        'two projects means the spec runs twice, once on a rasteriser its assertions may be ' +
        `meaningless on:\n  ${wrong.join('\n  ')}`,
    ).toEqual([]);
  });
});
