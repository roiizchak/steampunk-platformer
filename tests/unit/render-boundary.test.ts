import { describe, expect, it } from 'vitest';

/**
 * `src/render/` imports nothing from Phaser — the architectural rule CLAUDE.md §2 states and
 * nothing statically enforced until now.
 *
 * ## Why this file exists
 *
 * The Task 2 review recorded it as F13: *"`tests/unit/sim-boundary.test.ts` scans the `src/sim`
 * closure only — it does not contain the string `render` at all. The grep evidence is sound, but it
 * is currently a claim, not a gate."* It was accepted as informational and closed with a hand-run
 * `grep` plus `npm run test:sim-isolated`. Both are real evidence and neither is a gate: a grep
 * happens once, and `sim-isolated` only sees a render module if some unit test happens to import it.
 *
 * The rule matters for the same reason the sim's does, one layer up. `src/render/` holds the
 * **decision** functions — which frame, which tint, where the camera goes, how far the shake throws
 * the viewport — pulled out of the scenes precisely so their edge cases are reachable from a unit
 * test *(vault 2.12)*. A Phaser import is what turns one of them back into something only a browser
 * can run, and it would arrive the way every boundary violation in this project has: as one
 * convenient type import in a file nobody was watching.
 *
 * ## What is enforced, and what deliberately is not
 *
 * **Only the Phaser rule.** `src/sim/` additionally forbids `Date`, `Math.random`, `crypto` and the
 * DOM, because a *simulation* that reads a clock is not replayable. No document states that rule for
 * `src/render/`, and inventing it here would be this test asserting a policy nobody agreed to —
 * which is how a gate acquires a false red that gets it weakened later. If the render layer is ever
 * given the determinism rule in writing, add the rules to the array below; the scanner already has
 * them.
 *
 * ⚠️ **A TYPE-ONLY import still counts.** `import type Phaser from 'phaser'` erases at compile time
 * and would pass every runtime check including `test:sim-isolated` — `gameLevelPick.ts` relies on
 * exactly that to stay unit-testable. It is still a Phaser dependency in the source, and the whole
 * point of a static scan is to see what the runtime cannot.
 *
 * The scanner, the C2 proof that it can go red, and the reasoning behind the split all live in
 * `sourceScan.ts` / `sim-boundary.test.ts`.
 */

import { ALL_SOURCES, FORBIDDEN, BAD_FIXTURES, closureFrom, scan } from './sourceScan';

const PHASER_RULE = 'Phaser import';

/**
 * The render directory plus everything it transitively imports.
 *
 * No barrel entry, because `src/render/` has none — every consumer imports the module it wants. The
 * directory half of the walk is therefore doing all the seeding, which is exactly the ORPHAN case
 * `sourceScan.ts` argues for: a render module that no scene imports yet is still under the rule.
 */
const renderClosure = (): Record<string, string> => closureFrom('/src/render/');

/** Only the Phaser rule — see the header on why the determinism rules are not applied here. */
const phaserOnly = (sources: Record<string, string>) => scan(sources).filter((v) => v.rule === PHASER_RULE);

describe('render boundary — src/render/ imports no Phaser', () => {
  it('the render closure is non-empty and reaches beyond src/render — the scan is not vacuous', () => {
    const closure = renderClosure();
    const files = Object.keys(closure);
    // A closure that silently collected nothing would satisfy the rule below perfectly.
    expect(files.filter((f) => f.includes('/src/render/')).length).toBeGreaterThan(5);
    // `effects.ts` imports `../sim/hitstop`; `screenShake.ts` imports `../sim`. If the walk stopped
    // following imports, the scan would be one directory deep and this is what notices.
    expect(files.some((f) => f.includes('/src/sim/'))).toBe(true);
    // The three Phase 9 modules by name, because they are the ones F13 was raised about and the
    // ones a future rename could quietly drop out of a path-fragment match.
    for (const name of ['effects.ts', 'screenShake.ts', 'spriteFeedback.ts']) {
      expect(files.some((f) => f.endsWith(`/src/render/${name}`)), `${name} is not in the closure`).toBe(true);
    }
  });

  it('imports nothing from Phaser, in any form — bare, subpath, lazy, require or type-only', () => {
    const violations = phaserOnly(renderClosure());
    expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
  });

  it('REJECTS the committed bad fixture — this rule can go red (vault C2)', () => {
    // The scanner's full proof is in `sim-boundary.test.ts`; this asserts the ONE rule this file
    // filters down to still fires, so a regex weakened to match nothing cannot leave this suite
    // green while it stops seeing anything.
    expect(FORBIDDEN.some((r) => r.name === PHASER_RULE), 'the rule this file filters on is gone').toBe(true);
    expect(phaserOnly(BAD_FIXTURES).length).toBeGreaterThan(0);
  });

  it('would catch a type-only import, which every runtime check misses', () => {
    // `gameLevelPick.ts` genuinely does this and is genuinely unit-testable because of it — so the
    // form is not exotic, it is the form a violation would actually arrive in. Driven against a
    // literal rather than a file so it cannot rot when that file changes.
    expect(phaserOnly({ 'x.ts': "import type Phaser from 'phaser';" }).length).toBe(1);
    expect(phaserOnly({ 'y.ts': "import { Scene } from 'phaser/src/scene';" }).length).toBe(1);
    // And a mention in prose is NOT a violation — `screenShake.ts`'s docstring names Phaser a dozen
    // times. Without this the gate would be red on arrival and get weakened rather than obeyed.
    expect(phaserOnly({ 'z.ts': "// bounded away from Phaser's 0.05 default\nconst a = 1;" })).toEqual([]);
  });

  it('import-evaluates the three Phase 9 render modules without pulling in Phaser', async () => {
    // The dynamic half, and the only one that sees a TRANSITIVE import through a specifier the
    // closure walk could not resolve. Under `npm run test:sim-isolated` this await throws if any
    // module in these graphs reaches the engine; under a normal run it is a smoke test.
    const [effects, shake, feedback] = await Promise.all([
      import('../../src/render/effects'),
      import('../../src/render/screenShake'),
      import('../../src/render/spriteFeedback'),
    ]);
    expect(typeof effects.landingDust).toBe('function');
    expect(typeof shake.shakeFor).toBe('function');
    expect(typeof feedback.hitFlashAlpha).toBe('function');
  });
});

describe('the render closure is the whole directory, not a hand-kept list', () => {
  it('every file on disk under src/render/ is scanned', () => {
    const onDisk = Object.keys(ALL_SOURCES).filter((f) => f.includes('/src/render/'));
    const scanned = Object.keys(renderClosure()).filter((f) => f.includes('/src/render/'));
    // Set equality, not containment: a file the closure silently dropped is a file under no rule.
    expect(scanned.sort()).toEqual(onDisk.sort());
    expect(onDisk.length).toBeGreaterThan(5);
  });
});
