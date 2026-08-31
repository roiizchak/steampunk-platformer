/**
 * **`touchButtonPrompt` assembles what it claims to assemble.**
 *
 * 🔴 `style-lock.test.ts` hashes STYLE.md's §2 table, §4 template and §5 rules. That makes the
 * SOURCE blocks an approval checkpoint and proves nothing whatever about what a builder does with
 * them: a `touchButtonPrompt` that dropped the RENDERING block, or pasted every control's subject
 * into one image, would leave the lock green. Named by the Codex plan review, round 1.
 *
 * 🔴 **And the clause it must NOT inherit is asserted by name.** The plate prompt asks for a glyph
 * *"deeply cut and filled with dark shadow"*, and that sentence is where 12.14's shortfall comes
 * from — splitting `attack`'s mark by its pre-halo seeds isolates four fragments of the wrench's
 * shading, the smallest measuring 2.86:1 at 48 CSS px. Re-shooting with the same clause is paying
 * $0.15 for another coin flip, so the single-button prompt composes its own glyph sentence and this
 * file is what stops the old one drifting back in. Codex plan review, round 2.
 */

import { describe, expect, it } from 'vitest';

import { styleTemplate, templateBlock } from '../../tools/gen/prompt.mjs';
import { TOUCH_PLATE_CELLS, touchButtonPrompt, touchPlatePrompt } from '../../tools/gen/promptTouch.mjs';

const template = styleTemplate('docs/STYLE.md');

/** The sentence the plate prompt uses and the single-button prompt must not. */
const SHADING_CLAUSE = 'deeply cut and filled with dark shadow';

function occurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

describe('touchButtonPrompt carries the locked blocks, once each', () => {
  const attack = TOUCH_PLATE_CELLS.find((cell) => cell.key === 'touch-attack')!;

  it.each(['RENDERING', 'DO NOT INCLUDE'])('includes the locked %s block exactly once', (name) => {
    const block = templateBlock(template, name);
    // `templateBlock` returns the block's own text; the DO NOT INCLUDE one is extended with this
    // prompt's extra exclusions, so the assertion is on the locked text being present and unique,
    // not on the paragraph ending where the template does.
    const prompt = touchButtonPrompt(template, attack);
    expect(occurrences(prompt, block.replace(/[.]$/, '')), `${name} is missing or duplicated`).toBe(1);
  });

  it('states the single-button geometry positively, and never as a negation', () => {
    const prompt = touchButtonPrompt(template, attack);
    // STYLE.md §6: constrain the geometry rather than negating what you do not want. Take 1 drew
    // six buttons in a 3/2/1 stack because "a 3 by 2 grid" is a label, and "a sixth button" under
    // DO NOT INCLUDE did nothing — as §6 predicts negations do.
    expect(prompt).toContain('The image contains one button and nothing else');
    expect(prompt).toContain('a circle whose diameter is one half of the width of the image');
    expect(prompt).toContain('Every part of the image outside that one circle is backing sheet');
  });
});

describe('touchButtonPrompt asks for ONE control, and not for shading', () => {
  it.each(TOUCH_PLATE_CELLS.map((cell) => [cell.key, cell] as const))(
    '%s names its own subject and no other',
    (_key, cell) => {
      const prompt = touchButtonPrompt(template, cell);
      expect(prompt, 'the requested subject is missing').toContain(cell.subject);
      for (const other of TOUCH_PLATE_CELLS) {
        if (other.key === cell.key) continue;
        // 🔴 A prompt that pasted every subject would still contain the right one. Six subjects in
        // one image is take 1's failure with a different cause, and it costs $0.15 to discover.
        expect(
          prompt.includes(other.subject),
          `${cell.key}'s prompt also asks for ${other.key}'s glyph`,
        ).toBe(false);
      }
    },
  );

  it('does NOT inherit the plate prompt’s deep-shadow clause', () => {
    // The whole point of the re-shoot. Watched failing: putting SHADING_CLAUSE back into
    // FLAT_GLYPH reds this and nothing else in the suite, which is why it is asserted here rather
    // than left to a reader of the diff.
    const prompt = touchButtonPrompt(template, TOUCH_PLATE_CELLS[3]!);
    expect(
      prompt.includes(SHADING_CLAUSE),
      'the single-button prompt asks for the interior shading that put attack stroke 2 at 2.86:1',
    ).toBe(false);
    // And it asks for the flat inlay instead, positively.
    expect(prompt).toContain('one flat uniform tone at one even depth');
  });

  it('the PLATE prompt still carries that clause, so this is a difference and not a sweep', () => {
    // Without this the assertion above passes on a repository where the clause was simply deleted
    // everywhere — which would be a silent change to the adopted plate's own record.
    expect(touchPlatePrompt(template)).toContain(SHADING_CLAUSE);
  });
});
