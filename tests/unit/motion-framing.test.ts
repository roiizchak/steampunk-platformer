/**
 * A1/A2 — the framing and geometry clauses every combat motion prompt must actually carry.
 *
 * **This gate exists because of an omission, not a mistake.** `rust-scavenger/walk` came back from
 * its `1:1` re-shoot clean through G6 and then failed extraction outright — *"declared cyclic but
 * no window of it closes"* — because its prompt described a walk without ever stating a distance.
 * Session 2 had already called it by eye (*"a sway, not a gait"*); W9's five prompt corrections in
 * session 2 covered the courier's prop and grip, the deaths' back-loading and `fire-elevated`, and
 * simply **did not include this one**. Nothing caught that, because nothing was looking.
 *
 * The second omission is the same shape. `FRAME_MARGIN` was appended by hand, record by record, to
 * the one-shot motions — so the two CYCLIC scavenger entries, which predated it, were the only
 * combat clips ever shot with no margin clause at all. `chase` came back with one frame holding
 * 8 px of left margin.
 *
 * So this file asserts the *presence of a clause across the whole table*, not the wording of any
 * one prompt. A new combat motion that forgets its margin clause turns this red on the run that
 * adds it, rather than after $1.19 of generation. It reads the prompt as `submit-clips.mjs` and
 * `write-prompts.mjs` render it — through `videoPrompt` with the real STYLE.md template — because
 * a clause that exists in a constant but never reaches the assembled string is not in the prompt.
 *
 * ⚠️ `motion.mjs` is imported FIRST and deliberately. Importing `motionCombat.mjs` first leaves the
 * `...COMBAT_MOTIONS` spread silently incomplete under Vite — a TDZ read that does not throw the
 * way plain Node does. `write-prompts.mjs`, `build-clips.mjs` and `clipJobs.mjs` all order it this
 * way for the same reason.
 */
import { describe, expect, it } from 'vitest';
import { videoPrompt } from '../../tools/gen/motion.mjs';
import { COMBAT_MOTIONS } from '../../tools/gen/motionCombat.mjs';
import { styleTemplate, templateBlock } from '../../tools/gen/prompt.mjs';

const template = styleTemplate('docs/STYLE.md');
const blocks = {
  rendering: templateBlock(template, 'RENDERING'),
  forbid: templateBlock(template, 'DO NOT INCLUDE'),
};

/**
 * Render exactly as production does, so a clause that never reaches the string cannot pass.
 *
 * ⚠️ The third argument is the STYLE.md `blocks`, not the motion spec — `videoPrompt` looks the
 * spec up from `VIDEO_MOTIONS` itself. Passing the spec here renders a prompt whose RENDERING and
 * DO-NOT-INCLUDE tails are wrong while the motion clause still reads correctly, so every assertion
 * below would keep passing against a prompt production would never send. `tsc` caught that; vitest
 * did not.
 */
function renderedPrompt(key: string): string {
  return String(videoPrompt(template, key, blocks));
}

const COMBAT_KEYS = Object.keys(COMBAT_MOTIONS);

/** The positive framing requirement from `FRAME_MARGIN`. */
const MARGIN_CLAUSE = 'middle 70% of the frame width';

describe('every combat motion carries the frame-margin clause', () => {
  it('has combat motions to check at all', () => {
    // Guards the whole file against passing vacuously if the table ever fails to load — the exact
    // circular-import failure the header warns about would otherwise make every case below green.
    expect(COMBAT_KEYS.length).toBeGreaterThan(5);
  });

  it.each(COMBAT_KEYS)('%s states where the subject may reach', (key) => {
    expect(renderedPrompt(key)).toContain(MARGIN_CLAUSE);
  });

  it('covers the cyclic entries, which is what was missing', () => {
    const cyclic = COMBAT_KEYS.filter(
      (k) => (COMBAT_MOTIONS as Record<string, { cyclic: boolean }>)[k].cyclic,
    );
    expect(cyclic).toContain('rust-scavenger/walk');
    expect(cyclic).toContain('rust-scavenger/chase');
    for (const key of cyclic) expect(renderedPrompt(key)).toContain(MARGIN_CLAUSE);
  });
});

describe('rust-scavenger/walk states a stride as a fraction of the body', () => {
  /**
   * The defect was not a wrong number — it was NO number. `chase` produced a real 40–50 % gait
   * because it named visual facts ("a long reaching stride", "both feet leave the ground");
   * `walk` named an intention ("swings that leg forward") and the model satisfied it with a sway.
   *
   * `poseSpan` is not available here: a cyclic record gets no span tail at all
   * (`motion.mjs:376`), so the geometry has to live in the motion clause itself.
   */
  const prompt = renderedPrompt('rust-scavenger/walk');

  it('measures the step against the creature\'s own standing height', () => {
    expect(prompt).toContain("of the creature's own standing height");
  });

  it('names a ground clearance for the lifted foot', () => {
    expect(prompt).toContain('clear of the ground');
  });

  it('forbids the double-planted pose a sway produces', () => {
    expect(prompt).toContain('never both planted');
  });

  it('still pins the cycle count and the on-the-spot constraint', () => {
    // Regression guard: the rewrite must not have dropped what already worked.
    expect(prompt).toContain('exactly TWO full strides');
    expect(prompt).toContain('walks on the spot');
  });
});

describe('both brass-sentry/fire records bound the discharge, not just the subject', () => {
  /**
   * G6 reads one byte per pixel — alpha only (`edgeGate.mjs:91`) — so it cannot tell a muzzle
   * flash from a sheared limb, the same blind spot recorded for G1 ("cannot tell a boot from a
   * hand"). The user's decision was to constrain the effect in the prompt rather than teach the
   * gate, so no threshold moved and `DEFAULT_MIN_ALPHA` stays 255.
   *
   * `FRAME_MARGIN` alone does not cover this: it binds "the subject and anything it holds", and a
   * turret does not *hold* its own muzzle flash.
   */
  const FIRE_KEYS = COMBAT_KEYS.filter((k) => k.startsWith('brass-sentry/fire'));

  it('finds both the level and the elevated record', () => {
    expect(FIRE_KEYS).toContain('brass-sentry/fire');
    expect(FIRE_KEYS).toContain('brass-sentry/fire-elevated');
  });

  it.each(FIRE_KEYS)('%s measures the flash against the barrel', (key) => {
    expect(renderedPrompt(key)).toContain('no further from the muzzle than the length of the barrel');
  });

  it.each(FIRE_KEYS)('%s requires margin on all four edges, not just left and right', (key) => {
    // FRAME_MARGIN speaks only about frame WIDTH. `fire` was cut on the top and bottom too.
    expect(renderedPrompt(key)).toContain('margin stays visible on all four edges');
  });

  it('keeps the elevated record identical in angle, which is its stated invariant', () => {
    expect(renderedPrompt('brass-sentry/fire-elevated')).toContain('35 degrees above horizontal');
    expect(renderedPrompt('brass-sentry/fire')).not.toContain('35 degrees');
  });
});
