/**
 * The volume keys reach the game whatever the keyboard layout — Phase 11, criterion 11.3 / 11.5.
 *
 * ## The defect this reproduces
 *
 * The owner reported `M` (mute) working while `[` and `]` did nothing at all, on a Hebrew/English
 * keyboard. Phaser indexes registered keys by the **legacy `event.keyCode`**
 * (`KeyboardPlugin.js:747` — `var code = event.keyCode; var key = keys[code];`), and `keyCode` is
 * layout-dependent for punctuation while letters keep a stable value. So a layout that reassigns the
 * bracket virtual-key silently removes the volume controls and leaves mute alone.
 *
 * Measured against the running game on 2026-08-28, before the fix:
 *
 * | `code` | `keyCode` | volume changed? |
 * |---|---|---|
 * | `BracketLeft` ✓ | `0` | **no** |
 * | `BracketLeft` ✓ | `186` | **no** |
 * | `Backslash` ✗ | `219` | **yes** |
 *
 * ## Why this is a browser test and not only a unit test
 *
 * `tests/unit/audio-key-map.test.ts` proves the map. It cannot prove the listener is registered or
 * that Phaser delivers to it — a perfect map with no consumer passes every unit assertion and does
 * nothing on screen. Codex plan review round 1 finding 2. **This file is the half that goes red on
 * the un-fixed code**: revert `gameInput.ts` to `addKey(OPEN_BRACKET)` and the foreign-keyCode test
 * below fails, because the browser never routes that press anywhere.
 *
 * ## 🔴 Dispatch keydown AND keyup, always
 *
 * A synthetic keydown with no matching keyup leaves Phaser's `Key.isDown` true forever, and
 * `emitOnRepeat: false` then suppresses every later press of that keycode — including real ones.
 * That contaminated the first run of this experiment and made a working build look broken. Any test
 * that fires raw keyboard events must release them.
 *
 * ## 🔴 Seed the volume BEFORE navigating
 *
 * `createAudio()` copies storage into a private `settings` object at boot, and `nudgeVolume` mutates
 * that in-memory copy without ever re-reading `localStorage` (`audio.ts:261-264`). Writing a
 * baseline *after* boot establishes nothing. Codex plan review round 3, finding 3.
 */

import { expect, test } from '@playwright/test';
import { bootToGame } from './gameHarness';
import { storedSettings } from './audioHelpers';
import './debugView';

const KEY = 'steampunk.audio';

/** Seed the persisted settings before any page script runs, so `createAudio` reads this at boot. */
async function seedVolume(page: import('@playwright/test').Page, volume: number): Promise<void> {
  await page.addInitScript(
    ([key, value]) => window.localStorage.setItem(key as string, value as string),
    [KEY, JSON.stringify({ muted: false, volume })] as const,
  );
}

/**
 * Fire a matched keydown/keyup pair carrying an explicit `code` and `keyCode`.
 *
 * This is how a non-US layout is modelled without needing one installed: the physical key is the
 * same, the legacy number attached to it is not.
 */
async function fireKey(
  page: import('@playwright/test').Page,
  code: string,
  keyCode: number,
  repeat = false,
): Promise<void> {
  await page.evaluate(
    ([c, k, rp]) => {
      const make = (type: string): KeyboardEvent =>
        new KeyboardEvent(type, {
          code: c as string,
          keyCode: k as number,
          which: k as number,
          repeat: rp as boolean,
          bubbles: true,
          cancelable: true,
        });
      window.dispatchEvent(make('keydown'));
      // Release it. See this file's header — an unreleased key poisons every later press.
      window.dispatchEvent(make('keyup'));
    },
    [code, keyCode, repeat] as const,
  );
  // One animation frame is not enough: Phaser drains its key queue in the scene's update, so give
  // the loop a few frames to actually process the event before reading the result.
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      }),
  );
}

test.describe('Phase 11 — 11.3 the volume keys are layout-independent', () => {
  /**
   * 🔴 **The reproduction.** Red on the un-fixed build, green on the fixed one.
   *
   * `186` stands for "whatever number this layout puts on the bracket key". The point is only that
   * it is not 219, which is the single number the old binding could see.
   */
  test('the physical bracket key works when its legacy keyCode is not 219', async ({ page }) => {
    await seedVolume(page, 0.5);
    await bootToGame(page);

    await fireKey(page, 'BracketLeft', 186);

    expect(
      (await storedSettings(page))?.volume,
      'the bracket key must be read by POSITION, not by a layout-assigned keyCode',
    ).toBe(0.4);
  });

  test('a keyCode of zero is no obstacle either', async ({ page }) => {
    await seedVolume(page, 0.5);
    await bootToGame(page);

    await fireKey(page, 'BracketRight', 0);

    expect((await storedSettings(page))?.volume).toBe(0.6);
  });

  /**
   * The complement, and the half that proves the fix did not simply widen the net. Before the fix a
   * press carrying `code: 'Backslash'` with keyCode 219 DID change the volume — the binding was
   * matching a number, so any key that carried it won. It must not any more.
   */
  test('a different physical key carrying keyCode 219 no longer changes the volume', async ({ page }) => {
    await seedVolume(page, 0.5);
    await bootToGame(page);

    await fireKey(page, 'Backslash', 219);

    expect(
      (await storedSettings(page))?.volume,
      'only the bracket POSITION may change the volume',
    ).toBe(0.5);
  });

  test('mute still works, and by position', async ({ page }) => {
    await seedVolume(page, 0.5);
    await bootToGame(page);

    await fireKey(page, 'KeyM', 0);

    expect((await storedSettings(page))?.muted).toBe(true);
  });
});

test.describe('Phase 11 — 11.5 a held key is one press', () => {
  /**
   * The `Key` objects this binding used to be got `emitOnRepeat: false` for free. A raw `keydown`
   * listener inherits nothing, and the OS repeats a held key ~30 times a second — so without the
   * `event.repeat` guard, resting a finger on `[` would race the volume to zero and write
   * `localStorage` thirty times a second. Codex plan review round 1, finding 1.
   */
  test('an auto-repeat event does not move the volume', async ({ page }) => {
    await seedVolume(page, 0.5);
    await bootToGame(page);

    await fireKey(page, 'BracketLeft', 219, true);

    expect(
      (await storedSettings(page))?.volume,
      'a repeat event is the OS talking, not the player pressing again',
    ).toBe(0.5);
  });

  test('one real press is exactly one step', async ({ page }) => {
    await seedVolume(page, 0.5);
    await bootToGame(page);

    await page.keyboard.press('BracketLeft');
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
        }),
    );

    expect((await storedSettings(page))?.volume).toBe(0.4);
  });
});
