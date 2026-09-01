/**
 * 🔴 The four Phaser constants this project transcribes as literals, pinned against the engine.
 *
 * ## Why this is in the UNIT suite and not only in e2e
 *
 * QA log entry 34: `TINT_MODE_ADD` was pinned in `tests/e2e/phase-09-draw.spec.ts` against the
 * vendored `TintModes.js`. That is a real check — and it runs only under Playwright, so **a Phaser
 * upgrade landed without an e2e run would not be caught by `npm test`**. The e2e pin stays; this is
 * the one that runs on every commit, and it covers all three literals rather than one.
 *
 * ## ⚠️ The skip, and why it is not decoration
 *
 * `npm run test:sim-isolated` **uninstalls Phaser** and runs this suite — that is the whole point of
 * criterion 1.3. So the vendored source is genuinely absent there, and a test that threw would break
 * a QA criterion, while a test that quietly passed would be worse than nothing: it would report
 * green on exactly the run that could not check anything.
 *
 * So the absence is detected explicitly, reported by name on stderr, and the case is marked
 * **skipped** — vitest prints a `↓` line for it, which is the visible difference between "checked"
 * and "could not check". The engine's presence is never assumed; it is looked for, and `vendored()`
 * below carries the one non-obvious rule about WHERE, which cost this file a false green.
 *
 * ⚠️ **If a pin reds, change the literal in `src/scenes/engineLiterals.ts`. Never the assertion.**
 */

import { describe, expect, it } from 'vitest';

import {
  BLEND_MODE_NORMAL,
  GAMEOBJECT_POINTER_DOWN,
  GAME_BLUR,
  GAME_HIDDEN,
  INPUT_GAME_OUT,
  INPUT_POINTER_UP,
  INPUT_POINTER_UP_OUTSIDE,
  SCENE_DESTROY,
  SCENE_PAUSE,
  SCENE_SHUTDOWN,
  SCENE_SLEEP,
  SCENE_UPDATE,
  TINT_MODE_ADD,
} from '../../src/scenes/engineLiterals';

/**
 * One vendored Phaser source file, or `null` when THIS project has no Phaser installed.
 *
 * 🔴 **A path relative to the project root, deliberately, and NOT `require.resolve`.** The first
 * version of this file used `createRequire(import.meta.url).resolve('phaser/package.json')`, which
 * is how the e2e pin does it and looks obviously more correct. It is not, and the way it failed is
 * the exact failure this file exists to prevent: **Node resolution walks UP the directory tree**, so
 * when the checkout sits inside a parent that has its own install — a git worktree, a monorepo
 * package, an `npm link` — it happily found a Phaser that `npm run test:sim-isolated` had just
 * removed. The isolated run reported **2150/2150 green with nothing skipped**, having pinned a copy
 * of the engine the run under test was not using.
 *
 * Relative to `process.cwd()` (vitest's own root, where `vite.config.ts` lives) the answer is the
 * install this suite would actually import, which is the only one worth pinning.
 */
async function vendored(...parts: string[]): Promise<string | null> {
  const { existsSync, readFileSync } = await import('node:fs');
  const path = ['node_modules', 'phaser', ...parts].join('/');
  return existsSync(path) ? readFileSync(path, 'utf8') : null;
}

/**
 * One literal, one vendored file, one `NAME: value` line.
 *
 * `guard` is a second declaration from the SAME file that must also still be there. Without it a
 * regex that matched some unrelated `ADD:` in some other table would pass vacuously — the file has
 * to still be the table it is claimed to be.
 */
function pin(
  label: string,
  file: string[],
  declaration: RegExp,
  expected: number | string,
  guard: RegExp,
): void {
  it(`${label} matches the vendored engine`, async (ctx) => {
    const src = await vendored(...file);
    if (src === null) {
      // Visible on stderr AND as a skipped case in the report. `test:sim-isolated` is the only run
      // that should ever reach this branch; anywhere else it means a broken install.
      console.warn(
        `SKIPPED: ${label} is unpinned — phaser is not installed, so ${file.join('/')} cannot be read.`,
      );
      ctx.skip();
      return;
    }
    expect(guard.test(src), `${file.join('/')} is no longer the table this pin reads`).toBe(true);
    const match = declaration.exec(src);
    expect(match, `${file.join('/')} no longer declares ${label}`).not.toBeNull();
    const raw = match![1]!;
    expect(typeof expected === 'number' ? Number(raw) : raw).toBe(expected);
  });
}

describe('the transcribed Phaser constants', () => {
  pin(
    'TINT_MODE_ADD',
    ['src', 'renderer', 'TintModes.js'],
    /\bADD:\s*(\d+)/,
    TINT_MODE_ADD,
    // FILL is the mode `spriteFlash.ts` deliberately avoids; MULTIPLY is the neutral `clearTint`
    // restores. Both must still be in the same table, or the ADD above came from somewhere else.
    /\bFILL:\s*\d+[\s\S]*\bMULTIPLY:\s*0|\bMULTIPLY:\s*0[\s\S]*\bFILL:\s*\d+/,
  );

  pin(
    'BLEND_MODE_NORMAL',
    ['src', 'renderer', 'BlendModes.js'],
    /\bNORMAL:\s*(\d+)/,
    BLEND_MODE_NORMAL,
    // ADD is the mode `createEmitter`'s comment costs a batch flush a frame; if this table has no
    // ADD it is not the blend-mode table.
    /\bADD:\s*\d+/,
  );

  pin(
    'SCENE_SHUTDOWN',
    ['src', 'scene', 'events', 'SHUTDOWN_EVENT.js'],
    /module\.exports\s*=\s*'([a-z]+)'/,
    SCENE_SHUTDOWN,
    /@event\s+Phaser\.Scenes\.Events#SHUTDOWN/,
  );

  pin(
    'SCENE_UPDATE',
    ['src', 'scene', 'events', 'UPDATE_EVENT.js'],
    /module\.exports\s*=\s*'([a-z]+)'/,
    SCENE_UPDATE,
    /@event\s+Phaser\.Scenes\.Events#UPDATE/,
  );

  /**
   * Phase 12's nine, all event-name strings, all read the same way: the file's single
   * `module.exports` line, guarded by the `@event` tag that names the event. The guard is what stops
   * a pin being satisfied by whichever event file the path happened to land on.
   */
  for (const [label, dir, file, value, tag] of [
    ['SCENE_PAUSE', 'scene', 'PAUSE_EVENT.js', SCENE_PAUSE, 'Scenes.Events#PAUSE'],
    ['SCENE_SLEEP', 'scene', 'SLEEP_EVENT.js', SCENE_SLEEP, 'Scenes.Events#SLEEP'],
    ['SCENE_DESTROY', 'scene', 'DESTROY_EVENT.js', SCENE_DESTROY, 'Scenes.Events#DESTROY'],
    ['GAME_BLUR', 'core', 'BLUR_EVENT.js', GAME_BLUR, 'Core.Events#BLUR'],
    ['GAME_HIDDEN', 'core', 'HIDDEN_EVENT.js', GAME_HIDDEN, 'Core.Events#HIDDEN'],
    ['INPUT_GAME_OUT', 'input', 'GAME_OUT_EVENT.js', INPUT_GAME_OUT, 'Input.Events#GAME_OUT'],
    ['INPUT_POINTER_UP', 'input', 'POINTER_UP_EVENT.js', INPUT_POINTER_UP, 'Input.Events#POINTER_UP'],
    [
      'INPUT_POINTER_UP_OUTSIDE',
      'input',
      'POINTER_UP_OUTSIDE_EVENT.js',
      INPUT_POINTER_UP_OUTSIDE,
      'Input.Events#POINTER_UP_OUTSIDE',
    ],
    [
      'GAMEOBJECT_POINTER_DOWN',
      'input',
      'GAMEOBJECT_POINTER_DOWN_EVENT.js',
      GAMEOBJECT_POINTER_DOWN,
      'Input.Events#GAMEOBJECT_POINTER_DOWN',
    ],
  ] as const) {
    pin(
      label,
      ['src', dir, 'events', file],
      /module\.exports\s*=\s*'([a-z]+)'/,
      value,
      new RegExp('@event\\s+Phaser\\.' + tag.replace(/\./g, '\\.') + '(?![A-Z_])'),
    );
  }
});

describe('the literals are what the modules that use them actually hold', () => {
  it('are the exact values transcribed, so a pin cannot be satisfied by a moved constant', () => {
    // The pins above compare the engine to these four names. If a name were repointed at some
    // other value the pin would simply follow it, and nothing would be red. This is the anchor.
    expect(TINT_MODE_ADD).toBe(2);
    expect(BLEND_MODE_NORMAL).toBe(0);
    expect(SCENE_SHUTDOWN).toBe('shutdown');
    expect(SCENE_UPDATE).toBe('update');
    expect(SCENE_PAUSE).toBe('pause');
    expect(SCENE_SLEEP).toBe('sleep');
    expect(SCENE_DESTROY).toBe('destroy');
    expect(GAME_BLUR).toBe('blur');
    expect(GAME_HIDDEN).toBe('hidden');
    expect(INPUT_GAME_OUT).toBe('gameout');
    expect(INPUT_POINTER_UP).toBe('pointerup');
    expect(INPUT_POINTER_UP_OUTSIDE).toBe('pointerupoutside');
    expect(GAMEOBJECT_POINTER_DOWN).toBe('pointerdown');
  });

  it('gives POINTER_UP and GAMEOBJECT_POINTER_DOWN distinct names from each other', () => {
    // 🔴 `pointerup` and `pointerdown` are the SAME strings at scene level and at object level —
    // Phaser distinguishes them by which emitter you subscribe on, not by the name. That is a real
    // hazard for `touchControlsLayer.ts`, whose whole release story is "the object's event is not
    // enough". This case exists so a reader meets the collision here rather than in a debugger.
    expect(new Set([INPUT_POINTER_UP, GAMEOBJECT_POINTER_DOWN]).size).toBe(2);
    expect(INPUT_POINTER_UP_OUTSIDE).not.toBe(INPUT_POINTER_UP);
  });
});
