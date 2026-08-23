import { describe, expect, it } from 'vitest';
import { FLYER_STAGGER_TICKS, FLYER_TWEEN_TICKS, flyerDelayTicks } from '../../src/render/hud';


/**
 * # Flyers are torn down, and two in one frame do not draw as one (3.7 + 2b.5)
 *
 * Two inventory items in one module, both found by gate owners, both invisible to the tests that
 * existed — which checked liveness and a child count.
 *
 * ## 3.7 — a scene restart left flyers on screen
 *
 * `destroy()` stopped every tween and then said, in a comment, that the flyers themselves needed no
 * sweep: *"the single caller is the scene's own SHUTDOWN, which tears the display list down
 * immediately afterwards — so there is nothing left to leak."*
 *
 * The first half of that reasoning is right and is exactly **why** a sweep is needed: neither
 * `stop()` nor Phaser's `BaseTween.destroy()` dispatches `onComplete`, so the only path that ever
 * destroyed a flyer was natural completion. The second half is an **assumption about Phaser's
 * teardown that nothing in this repository verifies**, and it was carrying the whole argument. The
 * same paragraph conceded the point — *"a `destroy()` reachable from anywhere else would need its
 * own sweep"* — and left the sweep unwritten.
 *
 * ## 2b.5 — two gears in one frame smeared into one sprite
 *
 * Same duration, same destination: eased paths converge and the two arrivals land on top of each
 * other.
 *
 * ## ⚠️ Why half of this is source text, and the false green that proved it
 *
 * The first version of this file drove `attachGearFlyers` against a fake scene — the strong shape
 * CLAUDE.md prefers. It reported **`PASS (0) FAIL (0)`**: `hudGearFlyers.ts` reaches
 * `gearLayer.ts`, which imports Phaser as a **value**, so the file throws `window is not defined`
 * at import and **contributes zero tests while the run still exits 0**. That is the exact
 * false-green shape §5 names, met head-on.
 *
 * So the split is the architecture, not a compromise: the **decision** (`flyerDelayTicks`) moved to
 * engine-free `hud.ts` and is tested behaviourally below; the **application** is checked as source
 * text, which is the weaker shape and the only one reachable. Recorded rather than glossed.
 *
 * **The mutations this file names:** delete the `flyer.destroy()` loop from `destroy()`; drop the
 * `delay` from the tween config; return a constant from `flyerDelayTicks`.
 */

describe('the flyer stagger decision (2b.5)', () => {
  it('the first flyer is not delayed', () => {
    expect(flyerDelayTicks(0)).toBe(0);
  });

  it('every later flyer waits longer than the one before it', () => {
    // The property, not the literals: a constant-returning implementation passes an equality check
    // on index 0 and fails here, which is the mutation this names.
    const delays = [0, 1, 2, 3, 4].map(flyerDelayTicks);
    for (let i = 1; i < delays.length; i += 1) {
      expect(
        delays[i]!,
        `flyer ${i} waits ${delays[i]}, not more than flyer ${i - 1}'s ${delays[i - 1]} — they land together`,
      ).toBeGreaterThan(delays[i - 1]!);
    }
  });

  it('is DETERMINISTIC — the same index always gives the same delay', () => {
    // `Math.random` here would make every screenshot gate unreproducible. Asserted rather than
    // assumed, because the fix for a smear is exactly where someone reaches for a jitter.
    for (const i of [0, 1, 2, 7]) {
      expect(flyerDelayTicks(i)).toBe(flyerDelayTicks(i));
    }
    expect(flyerDelayTicks(3)).toBe(3 * FLYER_STAGGER_TICKS);
  });

  it('stays well under the flight time — a pair is still ONE pickup moment', () => {
    // The counter-fixture for "just delay them more". A stagger comparable to the tween's own
    // duration fixes the smear and introduces a different defect: two unrelated-looking pickups.
    // Five gears in a frame is already beyond anything the shipped levels place adjacently.
    expect(flyerDelayTicks(4)).toBeLessThan(FLYER_TWEEN_TICKS);
  });

  it('never returns a negative delay', () => {
    // Not reachable from `fresh.entries()`, but a negative delay is a silent Phaser
    // misconfiguration rather than a throw — so it is closed here rather than trusted.
    expect(flyerDelayTicks(-3)).toBe(0);
  });
});

/**
 * The application half. Source text, because the module cannot be imported — see the header.
 */
describe('the flyer module applies both fixes (3.7 + 2b.5)', () => {
  // ⚠️ vitest caches `?raw` glob results — touch this file too when re-running after an edit.
  const sources = import.meta.glob('../../src/scenes/hudGearFlyers.ts', {
    eager: true,
    query: '?raw',
    import: 'default',
  }) as Record<string, string>;
  const source = Object.values(sources)[0] ?? '';

  it('the source was actually read — an empty glob would make the rest vacuous', () => {
    expect(source.length).toBeGreaterThan(1000);
  });

  it('uses the shared decision rather than a second local constant', () => {
    // Two definitions of the stagger would agree until the day they did not *(vault 5.3)*.
    expect(source).toContain('flyerDelayTicks(index)');
    expect(source, 'a local stagger constant is back beside the shared one').not.toContain(
      'const STAGGER_TICKS',
    );
  });

  it('tracks the flyer objects, not only their tweens (3.7)', () => {
    expect(source, 'nothing tracks the flyer objects, so nothing can sweep them').toContain(
      'const flyers = new Set',
    );
  });

  it('destroy() sweeps the flyer objects', () => {
    // The mutation: delete this loop. Without it a stopped tween leaves its sprite behind, because
    // `stop()` never fires `onComplete`.
    expect(source, 'destroy() no longer destroys the flyers — 3.7 is back').toContain(
      'for (const flyer of flyers)',
    );
    expect(source).toContain('flyer.destroy();');
  });

  it('and still prunes on natural completion, so the sweep is not walking corpses', () => {
    expect(source, 'onComplete no longer un-tracks the flyer').toContain('flyers.delete(flyer)');
  });
});
