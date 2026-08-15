import { expect, test } from '@playwright/test';
import { DEFAULT_TUNING } from '../../src/sim/player';
import { BOOT_TIMEOUT, bootToGame, readPlayer, waitTicks } from './gameHarness';

/**
 * Phase 2 — the Character Playground, in a real browser.
 *
 * Split out of `phase-02-movement.spec.ts` when that file crossed the project's 400-line limit.
 * The seam is natural: everything here is about the dev-only tuning scene rather than about
 * movement itself.
 *
 * This spec exists because of **Codex plan review F2c**: criterion 2.6 was to be satisfied by a
 * unit sweep over the knob object, which proves every knob moves an output but says nothing about
 * whether `PlaygroundScene` exists, opens, or is wired to those knobs at all. The scene could be
 * completely inert and the sweep would still pass.
 */

test.describe('Phase 2 — Character Playground', () => {
  test('2.6 a knob adjusted in the Playground changes observed movement (Codex F2c)', async ({
    page,
  }) => {
    await bootToGame(page);

    await page.keyboard.press('KeyP');
    await page.waitForFunction(() => window.__game?.sceneKey === 'Playground', undefined, {
      timeout: BOOT_TIMEOUT,
    });
    // The scene really switched — a unit sweep over the knob object cannot tell whether this
    // scene exists, let alone whether its keys are wired to anything.
    expect((await page.evaluate(() => window.__game))?.sceneKey).toBe('Playground');
    await page.locator('canvas').click();
    await waitTicks(page, 10);

    /**
     * Top speed, not distance travelled.
     *
     * Distance was the obvious measure and it was wrong: each run carries the player ~250px to the
     * right, so by the third sample it has walked off the ledge and is measuring air control over
     * a different stretch of world. That produced a real intermittent failure — the knob had been
     * turned down and the numbers still matched. Saturated `vx` is the knob itself and does not
     * care where the player is standing.
     */
    async function measureTopSpeed(): Promise<number> {
      await page.keyboard.down('ArrowRight');
      await waitTicks(page, 40);
      const sample = await readPlayer(page);
      await page.keyboard.up('ArrowRight');
      await waitTicks(page, 30); // coast back to rest before the next sample
      return Math.abs(sample.vx);
    }

    const before = await measureTopSpeed();
    // The baseline is the live knob itself, not a magic number (vault 2.8).
    expect(before).toBeCloseTo(DEFAULT_TUNING.runMax, 1);

    // Select `runMax` (third knob in DEFAULT_TUNING's declaration order) and wind it down.
    //
    // Each press gets its own frame. Fired back to back they intermittently collapsed — several
    // arrived in one frame's event queue and the selection advanced fewer rows than presses sent,
    // so the adjust key was tuning `runAccel` instead. That reads as "the knob did nothing", which is
    // indistinguishable from the defect this test exists to catch, so it had to be removed rather
    // than retried away. The wait is on the simulation's own tick count, never a sleep.
    const pressKnobKey = async (key: string) => {
      await page.keyboard.press(key);
      await waitTicks(page, 2);
    };

    const runMaxIndex = Object.keys(DEFAULT_TUNING).indexOf('runMax');
    expect(runMaxIndex).toBeGreaterThanOrEqual(0);
    for (let i = 0; i < runMaxIndex; i += 1) {
      await pressKnobKey('KeyE');
    }
    // `Comma`, not `KeyZ`. Phase 5 bound `Z` to attack, so one press both swung the sword and
    // decremented the knob — the Playground moved its adjust keys to `,`/`.` for the same reason
    // they were never on the arrows: the keys you tune WITH must not be keys you play with.
    for (let i = 0; i < 6; i += 1) {
      await pressKnobKey('Comma');
    }

    const after = await measureTopSpeed();
    // The number moved, and moved in the direction the knob was turned (vault A6). Six presses at
    // one tenth of the default each — so both the floor and the ceiling come from the live knob.
    expect(after).toBeLessThan(before * 0.85);
    expect(after).toBeGreaterThan(0);
    expect(after).toBeCloseTo(DEFAULT_TUNING.runMax * 0.4, 1);

    // R restores the defaults, so the change was a real edit to the live tuning rather than a
    // one-way ratchet on a copy.
    await page.keyboard.press('KeyR');
    const restored = await measureTopSpeed();
    expect(restored).toBeCloseTo(DEFAULT_TUNING.runMax, 1);
  });});
