import { describe, expect, it } from 'vitest';
import { createWorld, tick } from '../../src/sim/tick';
import { createSnapshot } from '../../src/sim/input';
import { rollChance } from '../../src/sim/rng';
import { HITSTOP_TICKS } from '../../src/sim/hitstop';
import { AUDIO_CUES, SILENT_EDGES } from '../../src/sim/audioCues';
import catalog from '../../public/assets/index.json';
import type { Rect } from '../../src/sim/types';

/**
 * # Three Tier-5 items opened — 5.26 and `setTintFill` closed, 5.13 refuted
 *
 * These were among the **24 items never reconciled** at all: listed in the inventory, never opened
 * against merged source. Opened here first, then acted on — the A0 discipline applied late rather
 * than skipped, and it paid the same way it did the first time.
 *
 * | item | outcome |
 * |---|---|
 * | 5.26 `IMPACT_BY_FREEZE` totality | **FIXED with a gate**, watched red |
 * | `setTintFill` hazard | **FIXED with a gate** — three lines, four phases late |
 * | 5.13 `rollChance` / mutation M9 | **REFUTED** — the item asks for something that cannot be delivered, see below |
 *
 * Each is cheap, and being cheap is why each survived: none was ever the most urgent thing in any
 * session, and a gap that is never urgent is never closed.
 */

const FLOOR: Rect[] = [{ x: -2000, y: 2000, w: 20000, h: 400 }];

function world() {
  return createWorld({
    seed: 1,
    scale: 6,
    solids: FLOOR,
    bounds: { widthPx: 20000, heightPx: 4000 },
    spawn: { x: 600, y: 2000 },
  });
}

/**
 * ## 5.13 — `rollChance`'s `chance > 0` short-circuit, and why "untested" was the wrong word
 *
 * The inventory says the guard is untested and **mutation M9 survives**. Both true. But `rng.ts`
 * already explains *why*, at length, and the explanation is correct: the guard is redundant **by
 * construction**, because a roll reads `world.tickRoll` rather than pulling from the stream, so
 * `tickRoll < 0` already returns false and nothing was going to advance.
 *
 * ## 🔴 M9 STILL SURVIVES, with these tests in place — and that is the finding
 *
 * The tests below were written to kill it. **They do not, and they cannot.** Measured: deleting
 * `if (!(chance > 0)) return false;` leaves both this file and `rng.test.ts` at `PASS (21) FAIL (0)`.
 *
 * The reason is the one `rng.ts` already gives, and it is exactly right. A roll compares
 * `world.tickRoll` — a value in `[0, 1)` — against `chance`. With the guard gone, `chance = 0` still
 * yields `tickRoll < 0` → false, and `chance = NaN` yields `tickRoll < NaN` → false. **The guard
 * cannot be observed from outside the function**, so no assertion about behaviour can red on its
 * removal. The only thing that could is a mutation test asserting on source text, which would be
 * testing the line rather than the property.
 *
 * So the inventory's framing — *"untested, mutation M9 survives"*, listed as a gap — **asks for
 * something that cannot be delivered**, and the reason was already written down in the file three
 * sessions ago. Recorded as a **deliberate non-fix** *(C11)* rather than left looking open.
 *
 * The tests stay anyway. They do not kill M9, but they pin the *behaviour* the guard is a belt for,
 * including the stream-determinism property that mutation M13 does enforce — so a future change
 * that made the guard load-bearing would be caught by the assertions rather than by nothing.
 */
describe('5.13 — a zero or negative chance never rolls, and never touches the stream', () => {
  it('the premise: a certain roll DOES fire, so the assertions below are not vacuous', () => {
    const w = world();
    expect(rollChance(w, 1)).toBe(true);
  });

  for (const chance of [0, -0, -0.5, Number.NaN]) {
    it(`chance ${String(chance)} returns false`, () => {
      // ⚠️ This does NOT red on M9 — see the header. It pins the behaviour, not the branch. `NaN`
      // is included because `!(NaN > 0)` is the only reason the guard is a negation and not `<= 0`.
      expect(rollChance(world(), chance)).toBe(false);
    });
  }

  it('and leaves the RNG stream exactly where it found it', () => {
    // The property the guard exists for *(vault 2.3)*: a refused roll must not perturb the shared
    // stream, or two runs that differ only in a zero-probability event diverge. Asserted by driving
    // the real tick and comparing a downstream value, not by reading a counter — a counter would be
    // testing the bookkeeping rather than the determinism.
    const a = world();
    const b = world();
    for (let i = 0; i < 40; i += 1) {
      rollChance(b, 0);
      tick(a, createSnapshot());
      tick(b, createSnapshot());
    }
    expect(b.tickRoll).toBe(a.tickRoll);
    expect(b.player.x).toBe(a.player.x);
  });
});

/**
 * ## 5.26 — `IMPACT_BY_FREEZE` is a reverse lookup with no injectivity check
 *
 * `spriteFeedback.ts` builds `Map<freezeLength, ImpactClass>` from `HITSTOP_TICKS`. That is only a
 * function if the three freeze lengths are **distinct** — and nothing said so.
 *
 * The failure is quiet and specific, which is why it is worth a gate rather than a comment: give
 * `light` and `playerHurt` the same length in a retune and the Map silently collapses to two
 * entries, the later key wins, and **a light hit fires a `hurtVent`**. No throw, no log, and a
 * screenshot of the wrong particle burst looks like a particle burst.
 *
 * The inventory called this *"totality depends on three freeze lengths being distinct with no
 * `size === 3` assertion"*. Asserting `3` would be its own stale literal the day a fourth impact
 * class is added, so this asserts the **relationship**: one entry per impact class.
 */
describe('5.26 — every impact class has its own freeze length', () => {
  const lengths = Object.values(HITSTOP_TICKS);

  it('the premise: there is more than one impact class', () => {
    expect(lengths.length).toBeGreaterThan(1);
  });

  it('no two impact classes share a freeze length', () => {
    expect(
      new Set(lengths).size,
      `HITSTOP_TICKS has ${lengths.length} classes but only ${new Set(lengths).size} distinct ` +
        `lengths (${JSON.stringify(HITSTOP_TICKS)}). \`IMPACT_BY_FREEZE\` is a reverse lookup keyed ` +
        `on that number — a collision makes one class unreachable and fires the WRONG effect, ` +
        `silently. Re-tune so they differ, or stop keying the map on the length.`,
    ).toBe(lengths.length);
  });

  it('and they are all positive integers — the tick contract', () => {
    // A zero-length freeze would map to the same key as "no freeze", which is the same collision
    // wearing different clothes.
    for (const [impact, ticks] of Object.entries(HITSTOP_TICKS)) {
      expect(Number.isInteger(ticks), `${impact} freeze is ${ticks}, not an integer tick count`).toBe(
        true,
      );
      expect(ticks).toBeGreaterThan(0);
    }
  });
});

/**
 * ## The `setTintFill` engine hazard — ENGINE-NOTES `:142-148`
 *
 * *"`setTintFill` is removed in Phaser 4 and does not throw — it logs, returns `undefined`,
 * typechecks at arity 0, draws nothing. **Nothing greps the tree.**"*
 *
 * The inventory's own note says a source-text gate *"is exactly right here and it is three lines"*,
 * and it stayed unwritten for four phases anyway. It is the cheapest gate in the entire inventory
 * and it guards a call that fails **silently** — the worst combination there is.
 */
describe('the setTintFill hazard is gated (ENGINE-NOTES :142-148)', () => {
  // ⚠️ vitest caches `?raw` glob results — touch this file too when re-running after a src/ edit.
  const SOURCES = import.meta.glob('../../src/**/*.ts', {
    eager: true,
    query: '?raw',
    import: 'default',
  }) as Record<string, string>;

  it('the glob resolved — an empty one would make the scan below vacuous', () => {
    expect(Object.keys(SOURCES).length).toBeGreaterThan(20);
  });

  it('nothing CALLS setTintFill', () => {
    // Comments are allowed and there are three: the removal is documented in `spriteFlash.ts`,
    // `engineLiterals.ts` and `gamePlayerDraw.ts`. A call site is `.setTintFill(` — the leading dot
    // is what separates the call from the prose explaining why there is no call.
    const offenders = Object.entries(SOURCES)
      .filter(([, source]) => /\.setTintFill\s*\(/.test(source))
      .map(([path]) => path.replace(/^\.\.\/\.\.\//, ''));
    expect(
      offenders,
      `these files call setTintFill: ${offenders.join(', ')}. It was REMOVED in Phaser 4 and does ` +
        `not throw — it logs, returns undefined, typechecks at arity 0 and draws nothing. Use ` +
        `setTint(c).setTintMode(Phaser.TintModes.FILL).`,
    ).toEqual([]);
  });

  it('and the replacement is present, so this is not a ban on a thing nobody wanted', () => {
    // Non-vacuity of a different kind: a codebase that never tints at all would satisfy the check
    // above forever while the hazard's real subject went missing.
    const all = Object.values(SOURCES).join('\n');
    expect(all, 'nothing sets a tint mode — the flash path may have been removed').toContain(
      'setTintMode',
    );
  });
});

/**
 * ## 3.6 — the level-complete sting exists, and fires on ARRIVAL
 *
 * `levelCompleted` sat in `SILENT_EDGES` with an honest reason: a sting *"needs a generated cue,
 * which costs fal spend against a ceiling declared before generating, and `audio-cue-edges.test.ts`
 * sits at exactly 400 lines so a tenth cue would need that file split first."* Owner authorised the
 * spend on 2026-08-23; the cue was generated for **$0.02** against the audio ceiling's remaining
 * $4.77.
 *
 * 🔴 **It fires on `goalReached`, not `levelCompleted`** — the same decision C6 made about the
 * visual flourish, for the same reason. `goalReached` is the tick the courier arrives at the door;
 * `levelCompleted` is twenty ticks later, after the fade, over an empty doorway. Sound and flourish
 * now land together, which is one moment instead of two.
 *
 * `levelCompleted` therefore **stays silent**, and its entry says so rather than being deleted: a
 * second cue there would mark a moment the player is not acting in, the same objection `respawned`
 * already carries.
 *
 * **The mutation this names:** move `complete` back to `levelCompleted`.
 */
describe('3.6 — the completion sting', () => {
  it('the arrival edge plays it', () => {
    expect(AUDIO_CUES.goalReached).toBe('complete');
  });

  it('and the completion edge stays silent — one moment, not two', () => {
    expect(SILENT_EDGES).toContain('levelCompleted');
    expect(Object.keys(AUDIO_CUES)).not.toContain('levelCompleted');
  });

  it('the cue actually ships', () => {
    // A cue mapped to a key the catalog does not carry is silence with extra steps — and the boot
    // gate would refuse the level rather than say so quietly.
    const keys = (catalog.audio as { key: string }[]).map((row) => row.key);
    expect(keys).toContain('sfx-complete');
  });

  it('it is mixed as a reward, not as a footnote', () => {
    // The intent is "loudest after the three at 0". Asserted against the shipped gain rather than
    // the design table, because the pipeline CLAMPS gain at 1 and the master came back quiet — so
    // the achieved level is what matters, not the weight that was asked for.
    const row = (catalog.audio as { key: string; gain?: number }[]).find(
      (r) => r.key === 'sfx-complete',
    );
    expect(row, 'sfx-complete is not in the catalog').toBeDefined();
    expect(row!.gain, 'the sting was mixed below a footstep').toBeGreaterThan(0.29);
  });
});
