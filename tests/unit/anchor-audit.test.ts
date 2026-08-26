import { describe, expect, it } from 'vitest';

import { auditAnchors, declaredAnchorSources } from '../../tools/gen/anchorAudit.mjs';

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
      'PADDED_ANCHORS declares no local anchor sources — `npm run assets:build` would run the ' +
        'audit over nothing and exit 0. That is the shape criterion 4.27 was open on.',
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
