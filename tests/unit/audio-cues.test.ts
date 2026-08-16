/**
 * Cue selection — `src/sim/audioCues.ts`, criterion 7.6.
 *
 * A pure function from one tick's edges to the cues that tick should play. It lives in `src/sim/`
 * so it is engine-free and runs with Phaser uninstalled, and so the answer to "what should be
 * audible right now" has exactly one definition that the manager, the unit suite and the e2e specs
 * all read. Two definitions that agree on the happy path is the shape vault C1 warns about.
 *
 * ## The two assertions that are not obvious
 *
 * **A kill emits BOTH `hit` and `kill`.** `strike()` counts the killing blow like any other, so
 * `hitLanded` is necessarily true whenever `enemyKilled` is (`playerAttack.ts`). That is not a bug to
 * be de-duplicated away — it is what a finishing blow should sound like, and it is a load-bearing
 * premise of criterion 7.2's clipping stack. Codex plan review F1 caught a worst case that had
 * omitted the hit.
 *
 * **Every `TickEvents` field is either mapped or explicitly listed as silent.** Three edges exist for
 * the renderer and deliberately make no sound. Naming them here means a tenth field added to
 * `TickEvents` fails this file until someone decides which it is — rather than being silently
 * inaudible, which is exactly how `attackStarted` went missing from `advance()` for a whole phase.
 */

import { describe, expect, it } from 'vitest';

import { AUDIO_CUES, SILENT_EDGES, audioCues } from '../../src/sim/audioCues';
import { noEvents } from '../../src/sim/tick';
import type { AudioCue } from '../../src/sim/audioCues';
import type { TickEvents } from '../../src/sim/types';

/** One tick's events with only the named edges raised. */
function eventsWith(...raised: (keyof TickEvents)[]): TickEvents {
  const events = noEvents();
  for (const key of raised) events[key] = true;
  return events;
}

describe('audioCues maps edges to cues', () => {
  it('a tick with nothing on it is silent', () => {
    expect(audioCues(noEvents())).toEqual([]);
  });

  it.each<[keyof TickEvents, AudioCue]>([
    ['jumped', 'jump'],
    ['landed', 'land'],
    ['attackStarted', 'attack'],
    ['hitLanded', 'hit'],
    ['enemyKilled', 'kill'],
    ['gearCollected', 'pickup'],
    ['playerHurt', 'hurt'],
    ['playerDied', 'death'],
    ['footstep', 'footstep'],
  ])('%s alone produces exactly [%s]', (edge, cue) => {
    expect(audioCues(eventsWith(edge))).toEqual([cue]);
  });

  it.each(SILENT_EDGES)('%s is deliberately silent', (edge) => {
    expect(audioCues(eventsWith(edge))).toEqual([]);
  });
});

describe('the cases that stack', () => {
  it('a finishing blow emits both hit and kill — criterion 7.2 sums both', () => {
    // Not a redundancy to collapse: `strike()` increments the hit count on the killing blow, so
    // these two edges are not independent and the clipping budget must assume both.
    const cues = audioCues(eventsWith('hitLanded', 'enemyKilled'));
    expect(cues).toContain('hit');
    expect(cues).toContain('kill');
    expect(cues).toHaveLength(2);
  });

  it('returns the worst-case stack criterion 7.2 measures, in full', () => {
    // Every simultaneously-possible cue on one tick: the player lands on a hazard while a footfall
    // plants, finishing an enemy with the same swing and crossing a gear. Contrived, and every pair
    // in it is individually reachable — which is what a worst case has to be.
    const cues = audioCues(
      eventsWith('landed', 'footstep', 'playerHurt', 'hitLanded', 'enemyKilled', 'gearCollected'),
    );
    expect(cues).toHaveLength(6);
    expect(new Set(cues)).toEqual(new Set(['land', 'footstep', 'hurt', 'hit', 'kill', 'pickup']));
  });

  it('orders cues deterministically, so a mix is reproducible', () => {
    const raised = ['gearCollected', 'jumped', 'hitLanded'] as const;
    const forwards = audioCues(eventsWith(...raised));
    const backwards = audioCues(eventsWith(...[...raised].reverse()));
    expect(forwards).toEqual(backwards);
  });
});

describe('no edge is left unaccounted for', () => {
  /**
   * The completeness gate. Adding a tenth field to `TickEvents` and forgetting to decide whether it
   * makes a sound is exactly how `attackStarted` stayed dropped from `advance()` for a phase — it
   * compiled, it passed, and nothing named it.
   */
  it('every TickEvents field is either mapped to a cue or listed as silent', () => {
    const declared = Object.keys(noEvents()) as (keyof TickEvents)[];
    const accounted = new Set<string>([...Object.keys(AUDIO_CUES), ...SILENT_EDGES]);

    const unaccounted = declared.filter((field) => !accounted.has(field));
    expect(
      unaccounted,
      'a TickEvents field that is neither mapped nor declared silent is inaudible by accident',
    ).toEqual([]);
  });

  it('nothing is both mapped and silent', () => {
    const mapped = new Set(Object.keys(AUDIO_CUES));
    expect(SILENT_EDGES.filter((edge) => mapped.has(edge))).toEqual([]);
  });

  it('every cue name in the union is reachable from some edge', () => {
    const reachable = new Set(Object.values(AUDIO_CUES));
    // Nine SFX. The two beds are not cues — nothing in the sim starts or stops them.
    expect(reachable.size).toBe(9);
  });
});
