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
 * It reads `playwright.config.ts` as **raw source** and extracts each project's patterns from its own
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
 * `testIgnore` does not. With `P` = the shared GPU pattern, `D` = the DPR-2 pattern and `R` = the
 * production pattern:
 *
 * | project | selects when |
 * |---|---|
 * | `chromium` | `!P && !R` |
 * | `chromium-gpu` | `P && !D` |
 * | `chromium-dpr2` | `D` |
 * | `chromium-prod` | `R` |
 *
 * Summing those over the possible combinations gives 1 — except `!P && D`, which gives **2**, and
 * `P && R`, which gives **2**. So "exactly one project selects every spec" is a real assertion with
 * a reachable failure, not a tautology.
 *
 * ## 🔴 Phase 10: the patterns are NAMED CONSTANTS now, and this gate reads through the name
 *
 * `chromium`'s `testIgnore` used to be a regex literal that had to stay byte-identical to
 * `chromium-gpu`'s `testMatch`, and the paragraph above predicted what would happen: *"a refactor of
 * the config's shape (a pattern hoisted to a `const`) reds this file rather than passing"*. It did,
 * exactly, the first time a fourth project was added — because a third selection rule meant
 * `chromium`'s ignore had to become a LIST, and a list can no longer be byte-equal to one literal.
 *
 * So the config hoists both patterns to `const GPU_SPECS` / `const PROD_SPECS` and the projects
 * reference them by name, which makes the "same pattern" invariant structural rather than a promise
 * — and this gate resolves an identifier back to the literal it was declared with. The vacuity guard
 * is what keeps that resolution honest: a name it cannot resolve yields `null`, and `PATTERNS_FOUND`
 * counts only what resolved, so a rename cannot quietly turn an assertion into `null === null`.
 */

/**
 * 🔴 Phase 12: the touch patterns are declared in `tests/e2e/specRouting.ts`, not in the config.
 *
 * They have to be, because `tests/unit/spec-routing.test.ts` drives them against filenames that
 * do not exist yet, and importing the config to reach them would pull `@playwright/test` into a
 * suite that runs with Phaser uninstalled. So the resolver below follows the import: it scans
 * both files for `const NAME = /regex/`. An unresolvable name still yields `null` and still
 * counts against the vacuity guard — the rule that keeps this gate honest is unchanged.
 */
const ROUTING = import.meta.glob('../e2e/specRouting.ts', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

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
const routingSource = Object.values(ROUTING)[0] ?? '';

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

/** A regex literal as SOURCE TEXT — `/.../flags`, escaped slashes allowed. */
const LITERAL = '/(?:[^/\\\\\\n]|\\\\.)+/[a-z]*';

/**
 * Every top-level `const NAME = /regex/;` in the config, as name -> literal source text.
 *
 * This is what lets a project say `testMatch: GPU_SPECS` and still be checked. Resolution either
 * succeeds or yields nothing — there is deliberately no fallback, because an unresolved name
 * treated as an empty pattern would match every spec and quietly select everything.
 */
const CONSTANTS: Record<string, string> = Object.fromEntries(
  [
    ...source.matchAll(new RegExp(`^const ([A-Z][A-Z0-9_]*) = (${LITERAL});`, 'gm')),
    ...routingSource.matchAll(new RegExp(`^export const ([A-Z][A-Z0-9_]*) = (${LITERAL});`, 'gm')),
  ].map((m) => [m[1]!, m[2]!]),
);

/**
 * The pattern literals a project attributes to `key`, in order — resolving identifiers through
 * `CONSTANTS` and accepting either a bare value or an array of them.
 *
 * Source text rather than constructed `RegExp`s: two patterns are "identical" only if they are
 * byte-identical, and comparing `RegExp` objects by `.source` after construction would hide a flags
 * difference. An entry that is neither a literal nor a resolvable name yields `null`, which the
 * vacuity guard counts.
 */
function patternTexts(block: string, key: 'testMatch' | 'testIgnore'): (string | null)[] {
  const m = new RegExp(`${key}:\\s*(\\[[^\\]]*\\]|${LITERAL}|[A-Z][A-Z0-9_]*)`).exec(block);
  if (!m) return [];
  const raw = m[1]!;
  const entries = raw.startsWith('[')
    ? raw
        .slice(1, -1)
        .split(',')
        .map((e) => e.trim())
        .filter((e) => e.length > 0)
    : [raw];
  return entries.map((e) => (e.startsWith('/') ? e : (CONSTANTS[e] ?? null)));
}

/** The single pattern a project attributes to `key`, or `null` if it declares none or several. */
function patternText(block: string, key: 'testMatch' | 'testIgnore'): string | null {
  const all = patternTexts(block, key);
  return all.length === 1 ? all[0]! : null;
}

const chromium = projectBlock('chromium');
const gpu = projectBlock('chromium-gpu');
const dpr2 = projectBlock('chromium-dpr2');
const prod = projectBlock('chromium-prod');
const touch = projectBlock('chromium-touch');
const touchGpu = projectBlock('chromium-touch-gpu');

const chromiumIgnores = patternTexts(chromium, 'testIgnore');
const gpuMatch = patternText(gpu, 'testMatch');
const gpuIgnore = patternText(gpu, 'testIgnore');
const dpr2Match = patternText(dpr2, 'testMatch');
const prodMatch = patternText(prod, 'testMatch');
const touchMatch = patternText(touch, 'testMatch');
const touchIgnore = patternText(touch, 'testIgnore');
const touchGpuMatch = patternText(touchGpu, 'testMatch');

/** Vacuity guard. If the config is refactored so the extraction finds nothing, every equality below
 *  would compare `null` to `null` and pass while measuring absolutely nothing. */
const PATTERNS_FOUND = [
  ...chromiumIgnores,
  gpuMatch,
  gpuIgnore,
  dpr2Match,
  prodMatch,
  touchMatch,
  touchIgnore,
  touchGpuMatch,
].filter((p) => p !== null).length;

/** Build a live RegExp from the extracted literal so selection can actually be evaluated. */
function toRegExp(literal: string): RegExp {
  const end = literal.lastIndexOf('/');
  return new RegExp(literal.slice(1, end), literal.slice(end + 1));
}

describe('playwright project selection', () => {
  it('extracted all ten patterns — the config shape has not drifted out from under this gate', () => {
    expect(
      PATTERNS_FOUND,
      'could not extract the project patterns from playwright.config.ts — the config was refactored ' +
        'and every assertion in this file is now vacuous. Fix the extraction, do not delete the test.',
    ).toBe(10);
    expect(specNames.length, 'no e2e spec files were globbed at all').toBeGreaterThan(20);
  });

  it("chromium's testIgnore is EXACTLY the other projects' testMatch patterns", () => {
    // The config asserts this in prose in several places. This is the executable copy.
    //
    // `chromium` is the catch-all: it runs everything no other project claims. So its ignore list
    // must be precisely the set of patterns the specialised projects match — no more (a spec running
    // NOWHERE reports `0 passed` and exits 0) and no fewer (a spec running twice, once on
    // SwiftShader, where a timing or pixel assertion measures the wrong substrate under a green
    // tick). `chromium-dpr2` is absent on purpose: its pattern is a SUBSET of `GPU_SPECS`, already
    // covered by that entry.
    expect(
      [...chromiumIgnores].sort(),
      "chromium's testIgnore has drifted from what the other projects claim.",
    ).toEqual([gpuMatch, prodMatch, touchMatch].sort());
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
    const chromiumSkips = chromiumIgnores.map((p) => toRegExp(p!));
    const gpuTake = toRegExp(gpuMatch!);
    const gpuSkip = toRegExp(gpuIgnore!);
    const dpr2Take = toRegExp(dpr2Match!);
    const prodTake = toRegExp(prodMatch!);
    const touchTake = toRegExp(touchMatch!);
    const touchSkip = toRegExp(touchIgnore!);
    const touchGpuTake = toRegExp(touchGpuMatch!);

    const wrong: string[] = [];
    for (const name of specNames) {
      const projects: string[] = [];
      if (!chromiumSkips.some((r) => r.test(name))) projects.push('chromium');
      if (prodTake.test(name)) projects.push('chromium-prod');
      if (gpuTake.test(name) && !gpuSkip.test(name)) projects.push('chromium-gpu');
      if (dpr2Take.test(name)) projects.push('chromium-dpr2');
      // Phase 12. Behaviour is *everything minus perf* and perf matches by PREFIX, so the two are a
      // total partition of `phase-12-*` by construction — see `tests/e2e/specRouting.ts`.
      if (touchTake.test(name) && !touchSkip.test(name)) projects.push('chromium-touch');
      if (touchGpuTake.test(name)) projects.push('chromium-touch-gpu');
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
