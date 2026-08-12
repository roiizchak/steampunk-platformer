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

/**
 * Prompts for the non-character art: the HUD, the tileset and the parallax layers.
 *
 * All three reuse the locked §4 RENDERING and DO-NOT-INCLUDE blocks verbatim, for the same reason
 * the character anchor does — a re-worded style block against a shared one is vault **4.3**, and it
 * cost 12 credits in the vault's evidence.
 *
 * **Every one of them enumerates its ornamentation element by element.** That is not verbosity, it
 * is the single most reliable finding this project has: STYLE.md §6 established that this model
 * obeys a NAMED element and ignores an adjective, the character anchor confirmed it in the additive
 * direction, and "highly detailed" in the RENDERING block was not by itself enough to produce a
 * detailed character.
 */
export function hudPrompt(template) {
  const rendering = templateBlock(template, 'RENDERING');
  const forbid = templateBlock(template, 'DO NOT INCLUDE');
  return [
    'A game HUD element for a Victorian steampunk platformer, drawn as a single isolated interface ' +
      'assembly on a flat background. Horizontal layout, seen straight on, no perspective.',
    '',
    'THE ASSEMBLY, left to right: a circular portrait medallion, and attached directly to its right ' +
      'one single horizontal health bar.',
    '',
    'THE MEDALLION: a circular frame of polished brass, thick and heavily ornamented — a beaded ' +
      'outer rim, an engraved laurel band, four evenly spaced dome rivets at the compass points, ' +
      'and a fine inner bezel. Inside it, a shoulders-up portrait of a young man with short dark ' +
      'hair and brass goggles pushed up on his forehead, lit warmly from the left.',
    '',
    // THE FIX THE USER ASKED FOR. The gate-0 probe returned a bar divided into blocks. Segments are
    // a TEXTURE rather than a structural element, so unlike the second health bar in STYLE.md §6
    // they can be removed by naming them — but they have to be named exhaustively, because the
    // model has many words for the same subdivision.
    'THE HEALTH BAR: a long horizontal capsule with rounded polished brass end caps and a riveted ' +
      'brass frame with an engraved bevel. Inside it the fill is ONE SINGLE CONTINUOUS UNBROKEN ' +
      'SWEEP of glowing amber liquid light, running smoothly from the left cap to the right cap as ' +
      'one solid piece, with a soft gradient and a bright specular highlight along its upper edge. ' +
      'CRITICAL: the fill is NOT divided. There are NO segments, NO blocks, NO cells, NO pips, NO ' +
      'notches, NO tick marks, NO divider lines, NO separators, NO internal borders and NO gaps of ' +
      'any kind anywhere inside the bar. It is one uninterrupted bar of light, like liquid in a ' +
      'glass tube, not a row of lamps.',
    '',
    'CRITICAL GEOMETRY: the total height of the entire assembly is exactly equal to the diameter ' +
      'of the circular portrait medallion, and the health bar is vertically centred within that ' +
      'height. The assembly is one row tall. There is exactly ONE bar.',
    '',
    'BACKGROUND: one flat uniform chroma green field, RGB 0 255 0, edge to edge, with a clear ' +
      'margin of it on all four sides. No panel, no plate, no backing, no scene, no shadow.',
    '',
    rendering,
    '',
    `${forbid}, numerals, digits, text, gauges, dials, a second bar, segmented bars, background ` +
      'scenery, drop shadow.',
  ].join('\n');
}

/**
 * The tileset. Generated as a labelled sheet of separate blocks, then measured and sliced in post —
 * `nano-banana-pro` exposes no explicit `width`/`height`, so grid-exactness cannot be requested.
 */
export function tilesetPrompt(template) {
  const rendering = templateBlock(template, 'RENDERING');
  const forbid = templateBlock(template, 'DO NOT INCLUDE');
  return [
    'A tileset sheet for a Victorian steampunk platformer: a 4 by 4 grid of SIXTEEN separate ' +
      'square terrain tiles, evenly spaced with a clear gap of flat background between every tile ' +
      'and its neighbours. Each tile is drawn straight on, flat, with no perspective and no ' +
      'lighting that implies a light source outside the tile.',
    '',
    'EVERY WALKABLE TILE IS CAPPED ALONG ITS TOP EDGE WITH A BRIGHT POLISHED BRASS LEADING EDGE ' +
      'that catches the light, AND THAT BRASS CAP CARRIES REPEATING DIAGONAL AMBER-AND-DARK ' +
      'HAZARD STRIPES running along it like painted industrial safety marking. The stripes sit ' +
      'ONLY on the top cap, never on the body of the tile below it. This is the rule a player ' +
      'reads a platform by, and it is not optional on any surface tile.',
    '',
    'THE SIXTEEN TILES, all richly ornamented:',
    '  Row 1 — walkway surfaces, each with the diagonally striped brass cap along its top: a ' +
      'riveted wrought-iron walkway plate; the same with a drainage slot and bolt heads; the same ' +
      'with a raised tread pattern and wear scuffs; the same with a seam joint and two hex bolts.',
    '  Row 2 — walkway ends and undersides, all with the striped brass cap on top: a left end cap ' +
      'with an ornate scrolled iron corner bracket beneath it; a right end cap with the mirrored ' +
      'bracket; a narrow single-width ledge carried on a filigree gusset; a platform underside of ' +
      'ornamental cast-iron scrollwork and a row of small arched corbels.',
    '  Row 3 — masonry beneath: soot-stained Victorian brick with cracked mortar and a weep hole; ' +
      'the same brick with a course of engraved stone banding; rough cut stone blocks with chisel ' +
      'marks and moss in the joints; brick with a riveted iron tie-plate bolted across it.',
    '  Row 4 — hazards and fill: a row of upward-pointing polished steel SPIKES with dark red ' +
      'rusted bases, sharp and clearly dangerous; a section of tall gothic wrought-iron RAILING ' +
      'with pointed finials and a quatrefoil pattern; a bank of vertical copper pipes with collars ' +
      'and patina; a cast-iron grate with square apertures and a brass frame.',
    '',
    'CONSISTENCY: every tile is the same square size, drawn at the same scale, in the same palette ' +
      'and the same lighting, so any two can sit side by side. Tiles do not overlap and nothing ' +
      'crosses the gaps between them.',
    '',
    'BACKGROUND: one flat uniform chroma green field, RGB 0 255 0, filling every gap between tiles ' +
      'and all four margins. No labels, no numbers, no grid lines, no frames around the tiles.',
    '',
    rendering,
    '',
    `${forbid}, labels, numbers, grid lines, tile borders, characters, creatures, sky.`,
  ].join('\n');
}

/**
 * One parallax layer. `depth` selects how far back it sits.
 *
 * STYLE.md §5 RULE TWO is the whole brief for a background: **entirely cool blue-grey, desaturated,
 * with no warm colour anywhere.** Warmth is what tells the player a thing is reachable, so a warm
 * background is not a style slip, it is a gameplay bug.
 */
export function parallaxPrompt(template, depth) {
  const rendering = templateBlock(template, 'RENDERING');
  const forbid = templateBlock(template, 'DO NOT INCLUDE');
  const layers = {
    far:
      // "smog-yellowED DUSK sky" used to sit here, and it is why this layer came back 24.8% warm
      // while the COLOUR block below forbade warmth in the same prompt. STYLE.md §6: the model
      // obeys a NAMED ELEMENT and ignores a generic adjective, so a named warm noun beats "no warm
      // colour anywhere" every time. The cure is to name a COLD element, not to forbid the warm one
      // harder — the same lesson that killed the ground line under the character sheets.
      'THE FURTHEST LAYER — sky and distant city. A high cold slate-blue dusk sky, the colour of ' +
      'wet steel, graded to near-black blue-grey overhead, with layered banks of grey-blue soot ' +
      'cloud. Along the horizon, the silhouetted skyline of a vast Victorian industrial city: ' +
      'dozens of chimney stacks of different heights trailing smoke, gasometer drums, the ribs of ' +
      'a distant railway shed, church spires, cranes, and a great cog-toothed clock tower. ' +
      'Everything at this depth is flat silhouette with almost no internal detail, heavily hazed. ' +
      'This layer fills the whole frame edge to edge — it is the backdrop everything else sits ' +
      'in front of, so it has no empty margin and no cut-out area.',
    mid:
      'THE MIDDLE LAYER — the near city, standing along the BOTTOM of the frame. Whole facades of ' +
      'soot-stained brick warehouses and factories rise from the bottom edge: tall arched windows ' +
      'with small panes and iron glazing bars, some lit dimly and some dark, projecting gantries ' +
      'and hoists, external iron staircases and fire escapes, riveted pipework running up the ' +
      'walls, water tanks on frames, hanging chains, ventilation cowls, downpipes, and ' +
      'painted-out signage worn back to the brick. Moderate internal detail and a little haze. ' +
      'The rooflines are uneven, at different heights across the strip, and the TALLEST of them ' +
      'reaches only about two thirds of the way up the frame.',
    near:
      'THE NEAREST BACKGROUND LAYER — the alley furniture immediately behind the player, but ' +
      'still BEHIND everything walkable. SEPARATE PIECES OF IRONWORK STANDING ALONG THE BOTTOM ' +
      'EDGE AND THE TWO SIDE MARGINS, not a continuous wall: bundled copper pipes with valve ' +
      'wheels, a pressure vessel, a bank of gauges on a bracket, bolted flanges, a hanging loop ' +
      'of cable, a riveted ladder, a grate, a downpipe with dripping stains and heavy patina. ' +
      'High internal detail, crisp, no haze. The pieces are different heights, none of them ' +
      'taller than half the frame, and there are wide clear gaps between them.',
  };

  /**
   * Where the layer must NOT be, said as geometry rather than as a negation.
   *
   * Phase 4 first briefed all three of these as complete full-frame scenes, and got exactly that:
   * three opaque images, of which only the front one is ever visible. A parallax needs the back
   * layers to show THROUGH the front ones, and this model produces transparency the only way it
   * can — by painting a flat chroma field that post-processing keys out.
   *
   * Constraining the geometry is what works on this model. It is what got 16 separated tiles and a
   * single HUD assembly, and what removed the ground line from under the character; asking for
   * "a transparent background" or forbidding a wall does not.
   */
  const chroma = {
    far: '',
    mid:
      'BACKGROUND: everything above the rooflines — the entire upper third of the frame and every ' +
      'gap in the skyline — is one flat uniform chroma green field, RGB 0 255 0. There is no sky, ' +
      'no cloud and no haze in that area, only flat chroma green. At least a third of the whole ' +
      'image is chroma green.',
    near:
      'BACKGROUND: everything that is not one of the pieces of ironwork is one flat uniform ' +
      'chroma green field, RGB 0 255 0 — the whole upper half of the frame, and every gap between ' +
      'the pieces, top to bottom. There is no wall, no brick and no sky behind them, only flat ' +
      'chroma green. MOST of the image is chroma green.',
  };
  return [
    'A horizontally scrolling parallax background layer for a 2D side-scrolling Victorian ' +
      'steampunk platformer, drawn as a wide panoramic strip seen straight on with no perspective ' +
      'convergence.',
    '',
    layers[depth],
    '',
    // RULE TWO, quoted in its own terms rather than paraphrased.
    'COLOUR, STRICTLY ENFORCED: this entire image sits in cool blue-grey shadow, desaturated and ' +
      'cold. There is NO warm colour anywhere in it — no amber, no brass highlight, no copper ' +
      'glow, no orange lamplight, no firelight. Any lit window is a pale cold blue-white. Warmth ' +
      'is reserved entirely for the foreground the player can stand on, and this layer is not it.',
    '',
    'The strip is uniformly busy from left to right, with no single dominant focal object and no ' +
      'empty stretch, so it reads the same wherever the camera stops. Nothing is cropped in a way ' +
      'that demands a specific alignment.',
    ...(chroma[depth] ? ['', chroma[depth]] : []),
    '',
    rendering,
    '',
    `${forbid}, characters, creatures, player, interface, health bar, walkable platforms, brass ` +
      'leading edges, warm light, amber, orange, fire.',
  ].join('\n');
}

