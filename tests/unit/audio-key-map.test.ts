/**
 * The audio key map — Phase 11, criterion 11.3's unit half.
 *
 * ## What this file can and cannot prove
 *
 * It proves the MAPPING: that `BracketLeft` means volume-down whatever the layout, and that the
 * action names mean what they say. It **cannot** prove that the listener is registered or that
 * Phaser delivers the event to it — a mapper with no consumer satisfies every assertion here and
 * draws nothing, which is the defect `CLAUDE.md` names for `src/render/` and which applies just as
 * well to an input map.
 *
 * That half is `tests/e2e/phase-11-audio-keys.spec.ts`, which dispatches a real `KeyboardEvent` at
 * the running game and asserts the persisted volume moved. **Both are required.** Codex plan review
 * round 1, finding 2, is exactly this point: testing a newly invented mapping helper proves neither
 * listener registration nor engine dispatch.
 */

import { describe, expect, it } from 'vitest';
import { applyAudioAction, audioActionForCode } from '../../src/scenes/audioKeyMap';
import type { AudioAction } from '../../src/scenes/audioKeyMap';

describe('audioActionForCode', () => {
  it('maps the three audio key positions', () => {
    expect(audioActionForCode('KeyM')).toBe('mute');
    expect(audioActionForCode('BracketLeft')).toBe('volumeDown');
    expect(audioActionForCode('BracketRight')).toBe('volumeUp');
  });

  it('returns null for everything else', () => {
    // Movement, attack and the level key must not be audio actions — a fallthrough here would make
    // walking left change the volume.
    for (const code of ['KeyA', 'KeyD', 'KeyW', 'KeyL', 'KeyF', 'Space', 'Escape', 'Enter', '']) {
      expect(audioActionForCode(code), `${code} must not be an audio key`).toBeNull();
    }
  });

  /**
   * 🔴 The regression this whole phase exists for.
   *
   * `Backslash` is the key that carries `keyCode` 219 on some layouts — the number the old
   * `addKey(OPEN_BRACKET)` binding matched on. Measured on 2026-08-28: before the fix, a press
   * carrying `code: 'Backslash'` and `keyCode: 219` DID change the volume, while `code:
   * 'BracketLeft'` with a foreign keyCode did not. The map must key on the position, so the
   * physical bracket key wins and the impostor loses.
   */
  it('is keyed on the physical position, not on a legacy keyCode carrier', () => {
    expect(audioActionForCode('BracketLeft')).toBe('volumeDown');
    expect(audioActionForCode('Backslash')).toBeNull();
    expect(audioActionForCode('Semicolon')).toBeNull();
  });
});

describe('applyAudioAction', () => {
  function fakeManager() {
    const calls: string[] = [];
    return {
      calls,
      manager: {
        playCues: () => {},
        toggleMute: () => {
          calls.push('toggleMute');
          return true;
        },
        nudgeVolume: (direction: 1 | -1) => {
          calls.push(`nudgeVolume(${direction})`);
          return 0.5;
        },
        destroy: () => {},
      },
    };
  }

  it('routes each action to the manager call it names', () => {
    const cases: ReadonlyArray<readonly [AudioAction, string]> = [
      ['mute', 'toggleMute'],
      ['volumeDown', 'nudgeVolume(-1)'],
      ['volumeUp', 'nudgeVolume(1)'],
    ];
    for (const [action, expected] of cases) {
      const { calls, manager } = fakeManager();
      applyAudioAction(manager, action);
      expect(calls, `${action} must call ${expected}`).toEqual([expected]);
    }
  });

  /**
   * The direction is the half a typo silences. `volumeDown` calling `nudgeVolume(1)` would still
   * "work" — the volume would change on every press — and the bug would only show as the controls
   * being inverted, which no other assertion here would catch.
   */
  it('does not invert the two volume directions', () => {
    const down = fakeManager();
    applyAudioAction(down.manager, 'volumeDown');
    const up = fakeManager();
    applyAudioAction(up.manager, 'volumeUp');
    expect(down.calls).toEqual(['nudgeVolume(-1)']);
    expect(up.calls).toEqual(['nudgeVolume(1)']);
    expect(down.calls).not.toEqual(up.calls);
  });

  /**
   * 🔴 The RETURN, which used to be thrown away.
   *
   * `toggleMute()` and `nudgeVolume()` both already reported their new value and every caller
   * discarded it — which is why nothing in the game showed the current volume. That is a curiosity
   * during play, where the sound is its own feedback, and a real defect on the welcome screen, which
   * advertises the keys: at the shipped default of `volume: 1`, `stepVolume(1, +1)` clamps, so a
   * first-time player's first press of the key the screen just taught them is a silent no-op.
   * `TitleScene` renders this result, so a return that stopped reporting would show a stale number.
   */
  it('reports what the action became, so a caller can show it', () => {
    const muted = fakeManager();
    expect(applyAudioAction(muted.manager, 'mute')).toEqual({ kind: 'mute', muted: true });

    const louder = fakeManager();
    expect(applyAudioAction(louder.manager, 'volumeUp')).toEqual({ kind: 'volume', volume: 0.5 });
  });

  it('the result is discriminated, so a caller cannot read a volume off a mute', () => {
    // The failure this forbids is a single flat shape where an unchanged field reads as a real
    // value — a mute press appearing to set the volume to whatever the field defaulted to.
    const result = applyAudioAction(fakeManager().manager, 'mute');
    expect(result.kind).toBe('mute');
    expect(Object.keys(result).sort()).toEqual(['kind', 'muted']);
  });
});
