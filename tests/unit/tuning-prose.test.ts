import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TUNING,
  FOOT_PX_PER_FRAME,
  LOCOMOTION_TICKS_PER_FRAME,
} from '../../src/sim/playerTuning';

/**
 * # The prose in `playerTuning.ts` must agree with the constants under it
 *
 * Session inventory **Tier 4**, items 4.1 and 4.2.
 *
 * ## Why an existing gate could not catch this
 *
 * `tests/unit/foot-plant.test.ts` asserts the **relation** — `ticksPerFrame × topSpeed ===
 * footPxPerFrame` — and it passed throughout, correctly, because the relation held the whole time.
 * What drifted was the **prose**, and the prose was entirely unguarded:
 *
 * | said | was |
 * |---|---|
 * | *"Ticks each drawn locomotion frame is held. **Three**"* (`:78`) | `LOCOMOTION_TICKS_PER_FRAME = 2` nine lines below it |
 * | a table headed as current: `run 22.5 px / 3 ticks / speed 7.5` | `FOOT_PX_PER_FRAME.run = 18.0`, `ticksPerFrame = 2`, `runMax = 9.0` — the table is the **pre-re-shoot** 12-frame reading |
 *
 * This project has already been bitten by exactly this. Phase 7's plan reached for
 * `stridePxPerCycle`, and the Codex plan review (F8) caught that **the number still written down was
 * not the number still read**. Item 4.2 is the same failure in the same file, surviving three more
 * phases because a comment is not executable.
 *
 * ## What this gate does, and the honest limit of it
 *
 * It parses the numbers back out of the docstrings and asserts them against the constants. That
 * makes the **specific** figures that have already rotted executable.
 *
 * ⚠️ It does **not** make prose in general safe, and no test can. A sentence can be wrong in ways no
 * parser will see — a stale rationale, a superseded ruling, a citation to a file that moved. What it
 * buys is that these four numbers cannot drift again silently, and that anyone retuning the speeds
 * is told, at the moment they do it, that a paragraph needs re-reading too.
 *
 * A red here is fixed by **correcting the prose to match the constant** — never by loosening the
 * pattern. If the constant is what is wrong, the fix is a retune, and `foot-plant.test.ts` will have
 * something to say about it.
 */

/**
 * `playerTuning.ts` as raw text.
 *
 * `?raw` through the bundler rather than `node:fs`: `@types/node` is not a dependency, and CLAUDE.md
 * records that Phase 1 needed it twice and solved it without adding it.
 *
 * ⚠️ vitest caches `?raw` glob results. When re-running after an edit to `playerTuning.ts`, touch
 * this file too — a landed change has reported green that way in this project before.
 */
const SOURCES = import.meta.glob('../../src/sim/playerTuning.ts', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>;

const source = Object.values(SOURCES)[0] ?? '';

/** The English number words this file's prose uses for small tick counts. */
const WORDS: Readonly<Record<number, string>> = {
  1: 'One',
  2: 'Two',
  3: 'Three',
  4: 'Four',
};

describe('playerTuning.ts prose agrees with playerTuning.ts constants (inventory 4.1, 4.2)', () => {
  it('the source was actually read — an empty glob would make every assertion below vacuous', () => {
    expect(source.length).toBeGreaterThan(2000);
  });

  it('the frame-dwell sentence names the live LOCOMOTION_TICKS_PER_FRAME', () => {
    // 4.1 verbatim: the sentence read "**Three**" while the constant nine lines below said 2.
    const word = WORDS[LOCOMOTION_TICKS_PER_FRAME];
    expect(word, `no English word for a dwell of ${LOCOMOTION_TICKS_PER_FRAME}`).toBeTypeOf(
      'string',
    );
    expect(
      source,
      `the frame-dwell sentence does not say "**${word}**", but LOCOMOTION_TICKS_PER_FRAME is ` +
        `${LOCOMOTION_TICKS_PER_FRAME}. Correct the prose, not this test.`,
    ).toContain(`Ticks each drawn locomotion frame is held. **${word}**`);
  });

  it('the live-figures paragraph states the actual foot travel and dwell', () => {
    // 4.2: a superseded reading was presented as current for three phases. It is kept as evidence
    // and explicitly labelled; these are the numbers that must track the constants.
    // ⚠️ `toFixed(1)` throughout, not template interpolation: the constants are declared `18.0` and
    // `9.0`, and JS renders those as `18` and `9`. The first version of this assertion looked for
    // "{run: 18, walk: 9}" and failed against correct prose — the trailing zero is a real difference
    // between how the file reads and how the number prints.
    expect(source).toContain(
      `\`{run: ${FOOT_PX_PER_FRAME.run.toFixed(1)}, walk: ${FOOT_PX_PER_FRAME.walk.toFixed(1)}}\``,
    );
    expect(source).toContain(`\`LOCOMOTION_TICKS_PER_FRAME\` is **${LOCOMOTION_TICKS_PER_FRAME}**`);
  });

  it('the derived speeds it quotes are the speeds the file actually exports', () => {
    // The arithmetic spelled out in the prose, checked against `DEFAULT_TUNING` rather than against
    // a repeat of the same division — otherwise this would assert a formula against itself.
    expect(DEFAULT_TUNING.runMax).toBe(FOOT_PX_PER_FRAME.run / LOCOMOTION_TICKS_PER_FRAME);
    expect(DEFAULT_TUNING.walkMax).toBe(FOOT_PX_PER_FRAME.walk / LOCOMOTION_TICKS_PER_FRAME);
    expect(source).toContain(
      `${FOOT_PX_PER_FRAME.run.toFixed(1)} / ${LOCOMOTION_TICKS_PER_FRAME} = ` +
        `${DEFAULT_TUNING.runMax.toFixed(1)}`,
    );
    expect(source).toContain(
      `${FOOT_PX_PER_FRAME.walk.toFixed(1)} / ${LOCOMOTION_TICKS_PER_FRAME} = ` +
        `${DEFAULT_TUNING.walkMax.toFixed(1)}`,
    );
  });

  it('the superseded table is LABELLED, so it cannot read as current again', () => {
    // The actual defect was not that the old reading existed — it is evidence for the paragraph
    // above it — but that nothing said it was old.
    expect(
      source,
      'the pre-re-shoot reading lost its label and reads as the shipped figures again',
    ).toContain('NOT the shipped figures');
  });
});
