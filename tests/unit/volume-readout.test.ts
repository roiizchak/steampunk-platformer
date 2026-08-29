import { describe, expect, it } from 'vitest';

import { helpLine } from '../../src/scenes/gameDev';
import { VOLUME_LADDER, stepVolume } from '../../src/game/audioSettings';
import { AUDIO_CHANGED } from '../../src/scenes/audioKeyMap';
import { build } from './helpBannerFake';

/**
 * # The volume readout — does the number the keys move actually reach the screen?
 *
 * ## Why this file exists
 *
 * The owner played the shipped game and reported the volume as barely audible. Two separate defects
 * were behind that sentence, and only one of them was the mix:
 *
 * 1. **The steps were even in GAIN, so uneven to the EAR** — 0.92 dB at the top of the ladder and
 *    6.02 dB at the bottom, from the same key. Gated in `audio-settings.test.ts`.
 * 2. **Nothing in play showed the level.** At the top of the ladder `]` cannot do anything, and with
 *    no readout a player has no way to tell *already at maximum* from *still broken* — which is
 *    exactly the reading that was reported, and it survived the dispatch fix untouched.
 *
 * This file gates the second. It is the shape CLAUDE.md §2 asks for: a **behavioural** draw-path
 * gate against a fake scene rather than a source-text one, everywhere the code can be driven —
 * because a gate proving the banner *calls* something is satisfied by an implementation that
 * ignores its arguments.
 *
 * ## The one thing here that IS source text, and why
 *
 * `gameInput.ts` value-imports Phaser on line 1, so its listener cannot be driven from a Node unit
 * test at all. The emit that starts the chain is therefore asserted from source. That is the weaker
 * of the two shapes, used only where the stronger one is impossible.
 */

const SOURCES = import.meta.glob(
  ['../../src/scenes/gameInput.ts', '../../src/scenes/GameScene.ts'],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>;

function source(name: string): string {
  const found = Object.entries(SOURCES).find(([path]) => path.endsWith(name));
  if (!found) throw new Error(`${name} is not globbed — this gate scans nothing`);
  return (
    found[1]
      .replace(/\/\*[\s\S]*?\*\//g, '')
      // Trailing `//` too: `scene.events.emit(AUDIO_CHANGED); // note` is code, while
      // `// scene.events.emit(AUDIO_CHANGED)` is not, and a whole-line strip cannot tell them apart.
      .replace(/(^|[^:])\/\/.*$/gm, '$1')
  );
}

describe('helpLine prints the level beside the keys that move it', () => {
  it('says nothing about volume when there is no manager to ask', () => {
    // `ElementEditorScene` overrides `helpText()` with its own line and passes no settings. A
    // readout of `NaN%` would be worse than none.
    expect(helpLine()).not.toMatch(/\d+%/);
  });

  it('prints the percentage, and it MOVES with the value', () => {
    // 🔴 Two different volumes, not one. A `helpLine` that ignored its argument and returned a fixed
    // `100%` satisfies any single-value assertion — the exact defect the Codex review found in the
    // title screen's own hint, one layer up.
    expect(helpLine({ muted: false, volume: 1 })).toContain('100%');
    expect(helpLine({ muted: false, volume: 0.35 })).toContain('35%');
  });

  it('says muted rather than a number when the player muted it', () => {
    const line = helpLine({ muted: true, volume: 0.5 });
    expect(line).toContain('muted');
    expect(line, 'a percentage beside "muted" says the sound is on').not.toMatch(/\d+%/);
  });

  it('keeps the level joined to its keys so a wrap cannot separate them', () => {
    // The banner wraps on word boundaries inside a band two thirds of the view wide. A level that
    // wrapped away from `volume` is a number adrift from the thing it measures — the defect the
    // accessibility brief found between `[ ]` and `volume`, which the non-breaking spaces fixed.
    expect(helpLine({ muted: false, volume: 0.5 })).toContain('volume 50%');
  });

  it('prints every stop on the ladder distinctly', () => {
    const printed = VOLUME_LADDER.map(
      (volume) => helpLine({ muted: false, volume }).match(/(\d+)%/)?.[1] ?? '',
    );
    expect(new Set(printed).size, `two stops print the same number: ${printed.join(', ')}`).toBe(
      VOLUME_LADDER.length,
    );
  });
});

describe('the banner re-reads its text when the volume moves', () => {
  it('shows the new level, not the one captured at create()', () => {
    let volume = 0.5;
    const harness = build(() => helpLine({ muted: false, volume }));
    harness.emitUpdate();
    expect(harness.banner.content).toContain('50%');

    volume = stepVolume(volume, 1);
    harness.emitAudioChanged();
    harness.emitUpdate();

    // 🔴 The assertion is on the DRAWN object's text, not on the provider. A layer that subscribed
    // to the event and only re-positioned itself re-wraps the old string forever, and the number
    // moves everywhere except on screen.
    expect(harness.banner.content).toContain('71%');
  });

  it('the event is what makes it re-read — an update alone does not', () => {
    // 🔴 The layout is the expensive half and runs only when `dirty`. Without the subscription the
    // banner would still be correct after any RESIZE, which is enough to make a careless gate pass
    // while a press changes nothing on screen.
    let text = 'ARROWS move';
    const harness = build(() => text);
    harness.emitUpdate();

    text = 'ARROWS move  ·  volume 71%';
    harness.emitUpdate();
    expect(harness.banner.content, 'nothing marked it dirty, so nothing re-read it').toBe(
      'ARROWS move',
    );

    harness.emitAudioChanged();
    harness.emitUpdate();
    expect(harness.banner.content).toBe('ARROWS move  ·  volume 71%');
  });

  it('reads the provider on the FIRST layout, after the scene has finished building', () => {
    // 🔴 The defect this ordering exists for, and it shipped in the first attempt at this fix:
    // `attachHud` runs BEFORE `createAudio` in `GameScene.create()`, so a layer that only re-read
    // its provider on the audio event drew a banner with no level in it until the player pressed a
    // key. Caught by the e2e test in `phase-11-audio-keys.spec.ts` and not by this file — which is
    // why the case is here now.
    let audio: { muted: boolean; volume: number } | undefined;
    const harness = build(() => helpLine(audio));
    expect(harness.banner.content, 'built before the manager exists').not.toMatch(/\d+%/);

    audio = { muted: false, volume: 0.25 };
    harness.emitUpdate();

    expect(harness.banner.content, 'the first layout must ask again').toContain('25%');
  });

  it('drops the listener with the scene', () => {
    const harness = build();
    expect(harness.audioListeners, 'subscribed at create()').toBe(1);

    harness.emitShutdown();

    // A restarted `GameScene` builds a new layer. Without the `off`, every restart leaves a dead
    // listener holding a destroyed Text — the trap `destroy()`'s own comment names for the other two.
    expect(harness.audioListeners, 'a restart must not accumulate one per entry').toBe(0);
  });
});

describe('the chain that carries a press to the banner', () => {
  it('the audio listener announces the change after applying it', () => {
    const code = source('gameInput.ts');
    const applied = code.indexOf('applyAudioAction(manager, action);');
    const emitted = code.indexOf('scene.events.emit(AUDIO_CHANGED)');

    expect(applied, 'the action must still be applied').toBeGreaterThan(-1);
    expect(emitted, 'nothing announces the change, so nothing can redraw').toBeGreaterThan(-1);
    // Order matters: an emit before the apply publishes the value the player just left.
    expect(emitted).toBeGreaterThan(applied);
    // And the constant both sides import is a real event name rather than an empty string, which
    // Phaser would accept and never deliver.
    expect(AUDIO_CHANGED.length).toBeGreaterThan(0);
  });

  it('the scene hands the banner a PROVIDER and reads the live settings', () => {
    const code = source('GameScene.ts');
    expect(code, 'a captured string freezes the readout at create()').toContain(
      'attachHud(this, this.world, () => this.helpText())',
    );
    expect(code, 'helpText must ask the manager, not print a constant').toContain(
      'helpLine(this.audio?.settings())',
    );
  });
});
