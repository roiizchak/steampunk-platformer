/**
 * Which cues one tick should play — pure, engine-free, no clock, no DOM.
 *
 * Criterion 7.6 and vault 2.5: cues come from the edges the tick that produced them emitted, never
 * from comparing state between frames. This file is the one definition of "what should be audible
 * right now", read by `src/game/audio.ts`, by the unit suite and by the e2e specs — so a criterion is
 * asserted against one statement of the rule rather than two that agree on the happy path.
 *
 * It lives in `src/sim/` and therefore runs with Phaser uninstalled. That is not ceremony: it is what
 * lets cue selection be tested in milliseconds without a browser, an audio context or a user gesture.
 *
 * ## What is NOT here
 *
 * **Volume, gain and mixing.** Those are a clipping budget measured from the shipped files
 * *(vault 7.4)*, and they belong to the manager and the gate, not to a pure selector.
 *
 * **The two beds.** Music and ambience are continuous; nothing in the simulation starts or stops
 * them. They are the manager's business, which is also why criterion 7.2's stack has to add them
 * underneath whatever this function returns rather than expecting to find them in it.
 */

import type { TickEvents } from './types';

/** The nine one-shot cues. One per shipped SFX file; the two beds are not cues. */
export type AudioCue =
  | 'jump'
  | 'land'
  | 'attack'
  | 'hit'
  | 'kill'
  | 'pickup'
  | 'hurt'
  | 'death'
  | 'footstep';

/**
 * Edge → cue. **Declaration order is the emission order**, so a given tick always produces the same
 * sequence and a recorded mix is reproducible.
 *
 * Ordered loudest-consequence first. Nothing ducks anything today — the clipping budget is met by
 * fixed per-cue gains, not by a priority rule — but if a tick ever has to drop a cue, this is the
 * order it should drop from the bottom of, and having it already be the emission order means that
 * change is a truncation rather than a re-think.
 *
 * ⚠️ `hit` and `kill` are **both** listed and both fire on a finishing blow. `strike()` counts the
 * killing blow like any other, so `hitLanded` is necessarily true whenever `enemyKilled` is
 * (`playerAttack.ts`). Criterion 7.2's worst-case stack depends on that pair; the plan's first draft
 * omitted the hit and the Codex plan review (F1) caught it.
 */
export const AUDIO_CUES = {
  playerDied: 'death',
  enemyKilled: 'kill',
  playerHurt: 'hurt',
  hitLanded: 'hit',
  gearCollected: 'pickup',
  attackStarted: 'attack',
  jumped: 'jump',
  landed: 'land',
  footstep: 'footstep',
} as const satisfies Partial<Record<keyof TickEvents, AudioCue>>;

/**
 * Edges that deliberately make no sound.
 *
 * Listed rather than merely absent, and `audio-cues.test.ts` asserts that every `TickEvents` field is
 * in one list or the other. A tenth edge added to the record then fails that test until somebody
 * decides which it is — instead of being inaudible by accident, which is precisely how
 * `attackStarted` stayed dropped from `advance()` for a whole phase.
 *
 *   - `leftGround` — the jump cue already covers a deliberate takeoff, and walking off a ledge is not
 *     an event the player did anything to cause. A sound here fires on every step off a kerb.
 *   - `hitActive` — a per-tick fact, not an edge: it is true for the whole active window, so a cue on
 *     it would machine-gun. `attackStarted` is the audible moment.
 *   - `respawned` — the death cue already sounded. A second cue `DEATH_TICKS` later marks a moment
 *     the player is not acting in.
 */
export const SILENT_EDGES = ['leftGround', 'hitActive', 'respawned'] as const satisfies readonly (
  keyof TickEvents
)[];

/**
 * The cues this batch should play, in `AUDIO_CUES` declaration order.
 *
 * Returns a new array every call and reads nothing but its argument — so it is safe to call from a
 * render frame, a test, or a replay, and two callers on the same events cannot disagree.
 *
 * 🔴 **Takes a BATCH, not a tick, and that distinction is load-bearing.** `GameScene.update()`
 * passes `mergeEvents`' OR across up to `MAX_TICKS_PER_FRAME` ticks. So a pair of edges that
 * `src/sim/` guarantees are mutually exclusive *per tick* can still both be set here — a hazard hit
 * on tick T and a kill plane on T+1 arrive together — and the guarantee, which is real, stops being
 * enough one layer up. The suppression below is therefore in the cue layer rather than in
 * `worldDamage.ts`: it is the only layer that sees the batch.
 */
export function audioCues(events: TickEvents): AudioCue[] {
  const cues: AudioCue[] = [];
  for (const [edge, cue] of Object.entries(AUDIO_CUES) as [keyof TickEvents, AudioCue][]) {
    if (!events[edge]) {
      continue;
    }
    // Death wins. `worldDamage.ts` already decides this per tick, for the reason its own comment
    // gives — "the hurt sound plays over the death sound" — and a multi-tick frame is the one place
    // that decision can be undone. Hurt is dropped rather than death because the player's death is
    // the louder consequence and the one the scene is about to act on.
    if (edge === 'playerHurt' && events.playerDied) {
      continue;
    }
    cues.push(cue);
  }
  return cues;
}
