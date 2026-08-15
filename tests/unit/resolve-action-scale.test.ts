/**
 * `resolveActionScale` — which number a `(slug, action)` pair packs at, and where it came from.
 *
 * This exists because of a hole the Codex implementation review found in session 7. The resolution
 * was written inline in `build-assets.mjs` as:
 *
 *     const resolvedScale = actionScale ?? scale;
 *     const scaleSource   = actionScale !== undefined ? 'action' : 'slug';
 *
 * `??` treats `null` as absent, but `!== undefined` treats it as present. So `"scale": null` in a
 * bounds file resolved to the SLUG's number while being labelled `'action'` — and `catalogWrite.mjs`'s
 * guard exempts action-sourced entries from the one-scale rule (vault A5). A half-written override
 * therefore bought itself an exemption it had not earned, silently.
 *
 * `null` is this project's "not measured yet" convention — `stridePxPerCycle` uses it the same way —
 * so it must fall back to the slug default AND stay labelled `'slug'`, which keeps it bound by the
 * rule. That is the asymmetry these tests pin.
 *
 * The logic was moved out of the build script into `slugConfig.mjs` for exactly this reason: it was
 * previously unreachable from a test, which is why the hole survived a red-run that watched the guard
 * itself throw three different ways.
 */

import { describe, expect, it } from 'vitest';
import { resolveActionScale } from '../../tools/gen/slugConfig.mjs';

const SLUG_DEFAULT = 0.23723229;
const OVERRIDE = 0.6;

const config = {
  scale: SLUG_DEFAULT,
  animations: {
    hurt: { anchor: 'feet' },
    attack: { anchor: 'feet', scale: OVERRIDE },
    death: { anchor: 'feet', scale: null },
  },
};

describe('resolveActionScale — the declaration is the record', () => {
  it('a real override is used, and is labelled as one', () => {
    expect(resolveActionScale(config, 'attack')).toEqual({
      scale: OVERRIDE,
      scaleSource: 'action',
    });
  });

  it('no override falls back to the slug default, labelled slug', () => {
    expect(resolveActionScale(config, 'hurt')).toEqual({
      scale: SLUG_DEFAULT,
      scaleSource: 'slug',
    });
  });

  it('an action absent from the config entirely also falls back', () => {
    expect(resolveActionScale(config, 'walk')).toEqual({
      scale: SLUG_DEFAULT,
      scaleSource: 'slug',
    });
  });

  /**
   * The regression. Both halves matter and they fail independently: the old code got the VALUE
   * right by accident (`??` skips null) and the LABEL wrong, and it is the label that decides
   * whether the one-scale rule still binds the entry.
   */
  it('an explicit null is NOT an override — it is "not measured yet"', () => {
    const r = resolveActionScale(config, 'death');
    expect(r.scale, 'a null must resolve to the slug default').toBe(SLUG_DEFAULT);
    expect(r.scaleSource, 'and must stay bound by the one-scale rule').toBe('slug');
  });

  it('a null never buys the exemption an override buys', () => {
    // Stated as the property rather than the mechanism, so a future rewrite that keeps the values
    // but reintroduces the mislabel still fails here.
    const nulled = resolveActionScale(config, 'death');
    const real = resolveActionScale(config, 'attack');
    expect(nulled.scaleSource).not.toBe(real.scaleSource);
  });
});
