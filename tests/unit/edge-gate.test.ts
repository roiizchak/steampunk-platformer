/**
 * **G6 — edge bleed.** Criterion the phase-05 art batch needed and never had.
 *
 * Every clip in the batch came back with the subject sheared off at the frame's own left and/or
 * right edge — see `tools/gen/edgeGate.mjs`'s header for the full defect. The regression lock at the
 * bottom of this file proves the gate would have caught it: it runs against the REAL
 * `brass-sentry-fire` material, not a synthetic stand-in, the same pattern `anchor-gate.test.ts`
 * uses for the Phase 4 floating-foot defect.
 */

import { describe, expect, it } from 'vitest';

import { keyOut } from '../../tools/gen/chroma.mjs';
import { DEFAULT_MARGIN_PX, gateEdgeBleed } from '../../tools/gen/edgeGate.mjs';
import type { EdgeBleed } from '../../tools/gen/edgeGate.d.mts';
import { decodePng, readBytes } from '../../tools/gen/png.mjs';

const FIXTURES = 'tests/fixtures/edges';

/**
 * `value` is `null` only when nothing survives keying, which none of these fixtures does. Asserted
 * once here and narrowed for every caller, the same shape `anchor-gate.test.ts`'s `measure` uses.
 */
function measure(name: string): EdgeBleed {
  const result = gateEdgeBleed(decodePng(readBytes(`${FIXTURES}/${name}.png`)));
  expect(result.value, `${name} keyed out to nothing`).not.toBeNull();
  return result.value as EdgeBleed;
}

describe('G6 sees a subject bleeding off the frame edge', () => {
  it('fails a mask touching column 0, and names the left edge', () => {
    const result = gateEdgeBleed(decodePng(readBytes(`${FIXTURES}/touching-left.png`)));
    expect(result.status).toBe('FAIL');
    expect(result.reason).toMatch(/left/);
    expect(measure('touching-left').margins.left).toBe(0);
  });

  it('fails a mask touching column W-1, and names the right edge', () => {
    const result = gateEdgeBleed(decodePng(readBytes(`${FIXTURES}/touching-right.png`)));
    expect(result.status).toBe('FAIL');
    expect(result.reason).toMatch(/right/);
    expect(measure('touching-right').margins.right).toBe(0);
  });

  it('passes a mask 4px clear of every edge', () => {
    const result = gateEdgeBleed(decodePng(readBytes(`${FIXTURES}/clear.png`)));
    expect(result.status).toBe('PASS');
    const value = measure('clear');
    expect(value.margins).toEqual({ left: 4, right: 4, top: 4, bottom: 4 });
  });

  /**
   * BOTH sides of the `marginPx` boundary, pinned deliberately — the same pattern
   * `anchor-gate.test.ts` uses for `MAX_SOLE_SPREAD` and `coyote-time.test.ts` uses for its windows.
   * A gate tested only where it fires is a gate whose threshold could be any number at all.
   *
   * The decision, stated once: a margin EQUAL to `marginPx` is not "closer than" it, so it lands on
   * the PASS side. One pixel tighter fails.
   */
  it('is exactly at the marginPx boundary passes, one px tighter fails', () => {
    const atBoundary = gateEdgeBleed(decodePng(readBytes(`${FIXTURES}/at-margin-pass.png`)));
    const oneTighter = gateEdgeBleed(decodePng(readBytes(`${FIXTURES}/at-margin-fail.png`)));

    const boundaryValue = measure('at-margin-pass');
    expect(boundaryValue.marginPx).toBe(DEFAULT_MARGIN_PX);
    expect(boundaryValue.margins.left).toBe(DEFAULT_MARGIN_PX);
    expect(atBoundary.status).toBe('PASS');

    const tighterValue = measure('at-margin-fail');
    expect(tighterValue.margins.left).toBe(DEFAULT_MARGIN_PX - 1);
    expect(oneTighter.status).toBe('FAIL');
  });

  it('reports FAIL, not a silent guess, when nothing survives keying', () => {
    const empty = { width: 8, height: 8, data: new Uint8ClampedArray(8 * 8 * 4) };
    const result = gateEdgeBleed(empty);
    expect(result.status).toBe('FAIL');
    expect(result.value).toBeNull();
  });

  it('a custom marginPx is honoured, not just the default', () => {
    // "clear" has a 4px margin on every side. Asking for 5px must now fail it; asking for 4px must
    // still pass it — margin == marginPx is the pass side, pinned again at this different value.
    const image = decodePng(readBytes(`${FIXTURES}/clear.png`));
    expect(gateEdgeBleed(image, { marginPx: 5 }).status).toBe('FAIL');
    expect(gateEdgeBleed(image, { marginPx: 4 }).status).toBe('PASS');
  });
});

/**
 * **The regression lock, against real shipped bytes.**
 *
 * `brass-sentry-fire-frame.png` is frame 0 of the real, cropped `brass-sentry-fire` contact strip at
 * `_generated/phase05/contact/brass-sentry-fire.png` (gitignored — 128MB of sibling mp4s live beside
 * it, which is why this is a small derived PNG rather than a dependency on that directory existing).
 * It is raw chroma footage, not yet keyed, so this test keys it with the pipeline's OWN `keyOut` —
 * exactly what `build-clips.mjs`'s wiring does — rather than assuming an alpha channel that is not
 * there yet.
 */
describe('G6 against the REAL Phase 5 defect', () => {
  it('fails the historical brass-sentry-fire frame at both cropped edges', () => {
    const raw = decodePng(readBytes(`${FIXTURES}/brass-sentry-fire-frame.png`));
    const keyed = keyOut(raw);
    const result = gateEdgeBleed(keyed);

    expect(result.status).toBe('FAIL');
    expect(result.reason).toMatch(/left/);
    expect(result.reason).toMatch(/right/);
    const value = result.value as EdgeBleed;
    expect(value.margins.left).toBe(0);
    expect(value.margins.right).toBe(0);
  });
});

/**
 * **The false-positive lock, against real shipped bytes.**
 *
 * `idle-clean-frame.png` is the un-padded, un-keyed frame 0 of the real, shipped, clean Phase 4
 * `idle` sheet (`_generated/sheets/idle-clip.png`, gitignored, hence this small derived PNG —
 * downscaled 4x from the extracted frame, same "small derived PNG beside a gitignored source"
 * pattern `brass-sentry-fire-frame.png` uses above). At the OLD `minAlpha` of 8 this frame FAILED —
 * the false positive `edgeGate.mjs`'s header documents. It must now PASS, by a solid margin on every
 * edge, which is the change this whole gate revision exists to prove.
 */
describe('G6 no longer fails the clean Phase 4 idle clip', () => {
  it('passes the historical false-positive frame with margin to spare on every edge', () => {
    const raw = decodePng(readBytes(`${FIXTURES}/idle-clean-frame.png`));
    const keyed = keyOut(raw);
    const result = gateEdgeBleed(keyed);

    expect(result.status).toBe('PASS');
    const value = result.value as EdgeBleed;
    expect(value.margins.left).toBeGreaterThan(DEFAULT_MARGIN_PX);
    expect(value.margins.right).toBeGreaterThan(DEFAULT_MARGIN_PX);
    expect(value.margins.top).toBeGreaterThan(DEFAULT_MARGIN_PX);
    expect(value.margins.bottom).toBeGreaterThan(DEFAULT_MARGIN_PX);
  });

  it('would have failed this same frame at the old, spill-counting minAlpha of 8', () => {
    const raw = decodePng(readBytes(`${FIXTURES}/idle-clean-frame.png`));
    const keyed = keyOut(raw);
    const result = gateEdgeBleed(keyed, { minAlpha: 8 });

    expect(result.status).toBe('FAIL');
  });
});
