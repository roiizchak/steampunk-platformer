/**
 * Build a generation prompt by reading STYLE.md's §4 template — never by retyping it.
 *
 * STYLE.md §4 says the template is *"verbatim and must not be reworded casually"*, and
 * `tests/unit/style-lock.test.ts` hashes it. A prompt pasted into a script is a second copy of a
 * locked document that can drift from it while both look right in isolation — the exact failure the
 * Phase 3 doc-vs-code lock was added to prevent. So the template is EXTRACTED at call time and the
 * only thing this module contributes is slot substitution.
 *
 * **Every slot must be filled, and an unfilled one throws** *(vault 4.16 — a declared input that
 * cannot be found must fail loudly, never substitute)*. A `[SETTING]` that silently survives into
 * the prompt is a $0.15 generation of the literal word "SETTING".
 */

import { readFileSync } from 'node:fs';

const STYLE_START = '## 4. Prompt template';
const STYLE_END = '**`[SETTING]` values verified';

/** Pull the fenced template out of STYLE.md §4, exactly as written. */
export function styleTemplate(stylePath) {
  const doc = readFileSync(stylePath, 'utf8').replace(/\r\n/g, '\n');
  const from = doc.indexOf(STYLE_START);
  if (from < 0) throw new Error(`prompt: "${STYLE_START}" not found in ${stylePath} — did it move?`);
  const to = doc.indexOf(STYLE_END, from);
  if (to < 0) throw new Error(`prompt: "${STYLE_END}" not found after §4 in ${stylePath}`);

  const section = doc.slice(from, to);
  const fence = section.match(/```text\n([\s\S]*?)\n```/);
  if (!fence) throw new Error('prompt: no ```text fence found in STYLE.md §4');
  const template = fence[1].trim();
  if (template.length === 0) throw new Error('prompt: STYLE.md §4 template is empty');
  return template;
}

/** Every `[SLOT]` the template still contains. */
export function openSlots(text) {
  return [...new Set((text.match(/\[[A-Z_]+\]/g) ?? []))];
}

/**
 * Substitute slots and refuse to return a prompt that still has one open.
 *
 * Also refuses a value containing a digit followed by `%` — vault **4.4**: describe the camera, not
 * the percentage. `nano-banana-2` ignored percentages for scale twice and obeyed countable ratios.
 * `style-lock.test.ts` bans percentages in the template; this bans them in the substituted values,
 * which is the hole the lock cannot see.
 */
export function fillTemplate(template, values) {
  let out = template;
  for (const [slot, value] of Object.entries(values)) {
    if (/\d\s*(%|percent)/i.test(String(value))) {
      throw new Error(
        `prompt: a percentage reached slot [${slot}] ("${value}") — vault 4.4 says name a ` +
          `countable ratio, never a percentage. Percentages were ignored twice on nano-banana-2.`,
      );
    }
    out = out.split(`[${slot}]`).join(String(value));
  }
  const remaining = openSlots(out);
  if (remaining.length > 0) {
    throw new Error(`prompt: unfilled slot(s) ${remaining.join(', ')} — refusing to spend on them`);
  }
  return out;
}

/** The approved settings, as recorded in STYLE.md §4. Names only; the text is read from the doc. */
export const SETTINGS = Object.freeze({
  street:
    'a soot-stained Victorian factory street at dusk, seen from the iron walkways above the road, ' +
    'with gas lamps, copper pipework and chimney stacks',
  boiler:
    'the interior of a vast Victorian boiler house, with riveted pressure vessels, flywheels, ' +
    'gantries, copper pipework and hanging lamps',
});

/** The approved scale ratio, as a countable ratio. Never a percentage (vault 4.4). */
export const SCALE_RATIO = 'one and four fifths';

/**
 * Pull one labelled block out of the §4 template, e.g. `RENDERING` or `DO NOT INCLUDE`.
 *
 * The character anchor must be rendered in the SAME style as the approved scene, and the only way
 * to guarantee that is to reuse the same words rather than paraphrase them. Vault **4.3**: never
 * contradict your own prompt — a re-worded rendering block against a shared style block cost 12
 * credits and dragged the chroma background into the art.
 */
export function templateBlock(template, label) {
  const start = template.indexOf(`${label}:`);
  if (start < 0) throw new Error(`prompt: block "${label}" not found in the §4 template`);
  const rest = template.slice(start);
  // A block runs until the next ALL-CAPS label at the start of a line, or the end.
  const next = rest.slice(label.length + 1).search(/\n[A-Z][A-Z ,]{3,}[:.]/);
  return (next < 0 ? rest : rest.slice(0, label.length + 1 + next)).trim();
}

/**
 * Build a full-body character anchor prompt on chroma green.
 *
 * STYLE.md §8 asks for *"dedicated full-body character concepts on chroma green in this style"*.
 * The RENDERING and DO-NOT-INCLUDE blocks are lifted verbatim from the locked §4 template so the
 * anchor cannot drift stylistically from the approved scene; only the subject and the framing are
 * new. The background is named as a flat key colour and nothing else, because vault **4.2** is that
 * you must name what to discard element by element — "no background" is not a background.
 */
export function anchorPrompt(template, concept) {
  const rendering = templateBlock(template, 'RENDERING');
  const forbid = templateBlock(template, 'DO NOT INCLUDE');
  return [
    'A single full-body character sprite reference for a 2D side-scrolling platformer, standing ' +
      'alone against a flat background.',
    '',
    'FRAMING: the whole character from the top of the head to the soles of both boots, with empty ' +
      'space above and below. Three-quarter view facing to the right. A neutral standing pose, ' +
      'weight on both feet, arms clear of the torso so the silhouette reads. Nothing is cropped.',
    '',
    `CHARACTER: ${concept}`,
    '',
    'SILHOUETTE: unmistakable and asymmetric, readable as a solid black shape at three tiles tall. ' +
      'No two characters in this game share an outline.',
    '',
    'BACKGROUND: one flat uniform chroma green field, RGB 0 255 0, edge to edge. No floor, no ' +
      'shadow cast onto the background, no gradient, no vignette, no scenery, no props, no ground ' +
      'line, no platform beneath the feet. The character touches nothing.',
    '',
    rendering,
    '',
    `${forbid}, background scenery, ground shadow, drop shadow, floor, interface, health bar, ` +
      'portrait medallion, multiple characters, cropped limbs.',
  ].join('\n');
}

/**
 * Probe B's prompt: an N-frame animation sheet produced by `nano-banana-pro/edit` from the anchor.
 *
 * The competing path to Seedance. Its advantage is that the frame count is whatever you ask for,
 * so `fps = renderFrames * TICK_HZ / simTicks` needs no resampling step at all; its risk is the one
 * SOURCE-ANALYSIS §6 records from the reference project — per-frame image generation produced
 * *"a lot of additional stuff, and it wasn't a smooth motion"*.
 *
 * Two clauses are load-bearing and neither is decoration:
 *  - **The baseline.** Frames whose feet sit at different heights cannot be packed into a sheet
 *    without the character bobbing, and the bob is indistinguishable from animation.
 *  - **The chroma field, repeated per cell.** The background is what gets keyed; asking once at the
 *    top of the prompt is not enough when the model is drawing four sub-images.
 */
export function sheetPrompt(template, { action, frames, cycles, phases }) {
  const rendering = templateBlock(template, 'RENDERING');
  const forbid = templateBlock(template, 'DO NOT INCLUDE');
  // A `1 by N` row is the wrong ask above four frames: the sheet is generated at a fixed 1:1
  // aspect, so eight cells in a single row give each figure an eighth of the width and the
  // character comes back too small to carry the detail this scale exists for. Two rows keeps the
  // cells roughly square. `detectFrames` reads the real grid off the pixels either way — this only
  // decides how much resolution each figure gets *(the idle sheet came back 4 x 2 unasked)*.
  const GRIDS = { 4: 'a 2 by 2 grid', 6: 'a 3 by 2 grid', 8: 'a 4 by 2 grid', 12: 'a 4 by 3 grid' };
  const grid = GRIDS[frames] ?? `a 1 by ${frames} row`;
  return [
    `A ${frames}-frame ${action} animation sprite sheet of THIS EXACT CHARACTER, arranged as ` +
      `${grid}. Read left to right, top to bottom.`,
    '',
    `MOTION: the character performs exactly ${cycles} full ${action} cycle across the ` +
      `${frames} frames, seen in strict side profile facing RIGHT.`,
    ...phases.map((p, i) => `  Frame ${i + 1}: ${p}`),
    '',
    'IDENTITY: every frame is the same character as the reference image — same face, same hair, ' +
      'same brass pauldron, same goggles, same bandolier, same satchel, same forearm brace, same ' +
      'palette. Only the pose changes between frames.',
    '',
    // BASELINE is a request the model half-honours; per-cell drift is corrected in the packer
    // instead, by trimming each cell to its own figure and aligning on the FEET. Asking is still
    // worth one sentence — it costs nothing and reduces how much the packer has to move.
    'BASELINE: every frame draws the character at the same scale, upright, with the soles of the ' +
      'feet at an identical height from the bottom of that frame.',
    '',
    // THE GROUND LINE. Probe B drew one under every cell despite "no ground line" in the forbid
    // list. STYLE.md §6's finding is that negation does not remove a structural element from this
    // model — it weakens it and leaves a hole the model refills. The fix that worked for the second
    // health bar was to CONSTRAIN THE GEOMETRY so the element has nowhere to exist. Here that means
    // giving the feet somewhere to be that is not a surface: an explicit margin of background
    // beneath the boots, and the character named as a cut-out rather than as a figure in a scene.
    'THE CHARACTER IS A CUT-OUT, NOT A SCENE. He is isolated on the background like a sticker. ' +
      'Beneath the soles of the boots there is a clear margin of plain background at least as tall ' +
      'as his head, all the way to the bottom edge of the frame. He does not stand on anything. ' +
      'There is no surface, no floor, no platform, no line, no strip and no band anywhere below ' +
      'him — the background simply continues.',
    '',
    'BACKGROUND: every frame sits on the same flat uniform chroma green field, RGB 0 255 0, edge ' +
      'to edge. No shadow, no scenery, no border, no gridlines, no gutter of any other colour ' +
      'between frames, no frame numbers, no labels.',
    '',
    rendering,
    '',
    `${forbid}, frame numbers, labels, gridlines, borders, background scenery, ground shadow, ` +
      'interface, health bar, multiple characters, cropped limbs.',
  ].join('\n');
}

export { SHEET_PHASES, ANCHOR_CONCEPTS } from './promptData.mjs';
