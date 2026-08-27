import { describe, expect, it } from 'vitest';

import { auditAnchors, auditOrThrow, declaredAnchorSources } from '../../tools/gen/anchorAudit.mjs';

/**
 * The WIRING half of criterion 4.27 — `tools/gen/anchorAudit.mjs`.
 *
 * `anchor-gate.test.ts` covers what G1 measures. This covers the thing that was actually open for
 * two phases: **whether anything runs it.** `anchorGate.mjs` existed, worked, and caught a real
 * defect, and PRD.md still listed 4.27 as open — because it was a standalone CLI no `assets:*`
 * script invoked, so a regenerated anchor could reach fal ungated and nobody would know.
 *
 * Three properties, and each is a way the wiring could be present and useless:
 *
 *  1. **The declaration list is not empty.** An audit over zero anchors exits 0 having measured
 *     nothing, which is the vacuous green this project has been bitten by repeatedly. The CLI
 *     refuses that case outright; this asserts the list it refuses on is really populated.
 *  2. **Every verdict class survives the audit wrapper.** A wrapper that collapsed INDETERMINATE
 *     into PASS, or lost FAIL, would report a clean pipeline over broken art — and vault 4.18 is
 *     explicit that INDETERMINATE is a real verdict and not a rounding error.
 *  3. **A missing file is ABSENT, not a pass.** `_generated/` is gitignored, so absence is the
 *     DEFAULT state on a fresh clone. A wrapper that skipped missing files silently would let a
 *     build claim its anchors were gated when it read none of them.
 */
describe('anchor audit — the 4.27 wiring', () => {
  it('declares at least one anchor, so the audit is not vacuous', () => {
    const sources = declaredAnchorSources();
    expect(
      sources.length,
      'PADDED_ANCHORS declares no local anchor sources — the audit would run over nothing and ' +
        'pass. That is the shape criterion 4.27 was open on.',
    ).toBeGreaterThan(0);
    expect(sources.every((s) => s.endsWith('.png'))).toBe(true);
    expect(new Set(sources).size, 'the source list is not deduped').toBe(sources.length);
  });

  it('carries every verdict class through unchanged, and reports absence as ABSENT', () => {
    const F = 'tests/fixtures/anchors';
    const rows = auditAnchors([
      `${F}/level-soles.png`,
      `${F}/floating-foot.png`,
      `${F}/merged-legs.png`,
      `${F}/no-such-anchor.png`,
    ]);
    expect(rows.map((r) => r.status)).toEqual(['PASS', 'FAIL', 'INDETERMINATE', 'ABSENT']);
    // Not just the status: the reason has to survive too, or a red build says nothing useful.
    expect(rows[1]!.detail).toContain('one foot is drawn off the floor');
  });
});

/**
 * 🔴 **The half this file CLAIMED to cover and did not.**
 *
 * Its own header said *"this covers the thing that was actually open for two phases: whether
 * anything runs it"* — and neither test opened `package.json` or any consumer. Revert the wiring
 * entirely and both tests above stay green: the gate returns to its pre-Phase-10 state with the
 * whole suite passing over it. Found by the criterion 10.11 gate owner (brief B, finding 6).
 *
 * These read SOURCE TEXT, which is weaker than executing the consumer — but executing
 * `build-assets.mjs` means packing sheets from `_generated/`, which is gitignored, so on CI there is
 * nothing to pack. Source text is what is available, and it is stated as such rather than dressed up.
 *
 * ⚠️ **Comments are stripped first**, because a raw `.toContain('auditOrThrow(')` is satisfied by
 * commenting the call out — the wiring goes away and the wiring test stays green. Found by the Codex
 * implementation review, and it is the same defect the sentinel census had two commits earlier: a
 * text gate that cannot tell code from prose. Fixing it in one place and not the other is how a
 * lesson stays local.
 */
const withoutComments = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
const SOURCES = import.meta.glob('../../tools/gen/*.mjs', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>;

const sourceOf = (name: string): string => {
  const hit = Object.entries(SOURCES).find(([k]) => k.endsWith(`/${name}`));
  if (hit === undefined) throw new Error(`${name} is not under tools/gen/ any more`);
  return withoutComments(hit[1]);
};

describe('the 4.27 wiring reaches the modules that READ an anchor', () => {
  // Not the npm script. `build-assets-all.mjs` spawns `build-assets.mjs` directly, so a gate on
  // `assets:build` left the multi-slug path — the one that exists because nobody runs the other —
  // running zero anchors.
  it.each([
    ['build-assets.mjs', 'the sheet-packing entry point every assets:build* path goes through'],
    ['submit-clips.mjs', 'the SPEND point: it renders the command a human pays for'],
  ])('%s calls auditOrThrow', (file, why) => {
    expect(sourceOf(file), `${file} no longer runs the anchor audit — ${why}`).toMatch(
      /auditOrThrow\(/,
    );
  });

  it('is fatal on a missing anchor once the pipeline directory exists', () => {
    // The vacuity that made the audit exit 0 on any fresh clone: 4 declared, 4 ABSENT, 0 measured,
    // "gated" printed. Both inputs are injected so the RULE is asserted, not this machine's disk.
    const missing = ['tests/fixtures/anchors/no-such-anchor.png'];

    expect(
      () => auditOrThrow({ sources: missing, generatedRoot: 'tests/fixtures/anchors' }),
      'a declared anchor is absent while the pipeline directory exists, and the audit passed. ' +
        'That is the vacuous exit 0 criterion 4.27 was open on, reproduced.',
    ).toThrow(/not on disk/);

    // ...and NOT fatal without one, or a fresh clone could not run `npm test`.
    expect(() =>
      auditOrThrow({ sources: missing, generatedRoot: 'no/such/pipeline/root' }),
    ).not.toThrow();

    // A FAIL is fatal either way — absence is contextual, bad geometry never is.
    expect(() =>
      auditOrThrow({
        sources: ['tests/fixtures/anchors/floating-foot.png'],
        generatedRoot: 'no/such/pipeline/root',
      }),
    ).toThrow(/FAILED G1/);
  });
});
