/**
 * **The padlock icon for a locked level-select row.**
 *
 * One image, one generation. It is a UI ICON, not a touch control — `levelButtons.ts` draws it in a
 * square gutter beside a menu label, on the config ground, with nothing scrolling behind it. That
 * is why it is single-ink rather than `touchMarks`' two-ink pair, and why it is keyed `ui-padlock`
 * rather than `touch-*`: `catalogTouchKeys()` in `buildTouchAtlas.mjs` matches that prefix and
 * cross-checks the produced set against the catalog, so a seventh `touch-*` row would make
 * `npm run assets:touch` throw before it wrote anything.
 *
 * ## Why it composes STYLE.md rather than restating it
 *
 * `RENDERING` and `DO NOT INCLUDE` are read out of the locked §4 template VERBATIM through
 * `templateBlock`, exactly as `touchButtonPrompt` does. STYLE.md §2/§4/§5 are hashed by
 * `style-lock.test.ts`; a prompt that paraphrased them would drift out from under that hash without
 * reddening it.
 *
 * ## The geometry is stated as a fact, not as a label
 *
 * The touch-plate work paid for this twice: *"a 3 by 2 grid" is a label, not a geometry, and the
 * model was free to decide what a cell was*. So the margin, the silhouette and the chroma field are
 * each stated as what IS in the image rather than as what it should look like.
 */

import { styleTemplate, templateBlock } from './prompt.mjs';
import { TOUCH_PLATE_CHROMA } from './promptTouch.mjs';

/**
 * Build the padlock prompt from the locked template.
 *
 * @param {string} template STYLE.md's §4 prompt template, read through `styleTemplate`.
 * @returns {string} the full prompt text, ready to send unchanged.
 */
export function padlockPrompt(template) {
  const rendering = templateBlock(template, 'RENDERING');
  const forbid = templateBlock(template, 'DO NOT INCLUDE');

  return [
    'A single closed brass padlock for a video game interface icon, laid out flat on a plain ' +
      'coloured backing sheet, viewed straight on from directly in front.',
    '',
    'LAYOUT, STATED AS EXACT GEOMETRY. The image contains one padlock and nothing else. Its centre ' +
      'is the centre of the image, and its total height including the shackle is one half of the ' +
      'height of the image, so it is surrounded on all sides by a wide clear margin of backing ' +
      'sheet. Every part of the image outside that one padlock is backing sheet.',
    '',
    `BACKING SHEET: ${TOUCH_PLATE_CHROMA}, perfectly flat and evenly lit, filling every part of ` +
      'the image that is not the padlock.',
    '',
    'THE PADLOCK: a small Victorian industrial padlock in aged brass, its body a rounded ' +
      'rectangle with a single keyhole cut into the lower centre of its face, and a thick closed ' +
      'shackle of the same metal arching up out of its shoulders. Riveted edges, faint patina in ' +
      'the recesses, no chain and no key.',
    '',
    'It must read as ONE solid silhouette at a glance: the padlock is drawn at one even weight ' +
      'with an unbroken outline, and it is shown SHUT, with the shackle seated into both ' +
      'shoulders and no gap between them.',
    '',
    rendering,
    '',
    `${forbid.replace(/[.]$/, '')}, drop shadows cast onto the backing sheet, gradients or ` +
      'vignetting in the backing sheet, a second padlock, a chain, a key, a keyring, a door or a ' +
      'hasp, a frame or border around the image, labels or numbers beside the padlock, a hand or ' +
      'finger.',
  ].join('\n');
}

// Print the prompt when run directly, so the exact bytes sent can be pasted into the generation log.
if (process.argv[1] && process.argv[1].endsWith('promptPadlock.mjs')) {
  process.stdout.write(padlockPrompt(styleTemplate('docs/STYLE.md')) + '\n');
}
