/**
 * Prompts for the NON-CHARACTER art: the HUD, the gear pickup, the tileset and the parallax layers.
 *
 * Split out of `prompt.mjs` in Phase 6. Not a tidying — adding `gearPrompt` took that file to 444
 * lines against a hard 400-line ceiling which currently permits exactly one offender, and that slot
 * is spent by `src/scenes/GameScene.ts`. The world prompts are the coherent half: they share the
 * isolated-object-on-chroma framing and none of them take a `[SETTING]` or a `[SCALE_RATIO]`.
 *
 * All of them reuse the locked STYLE.md §4 RENDERING and DO-NOT-INCLUDE blocks verbatim, for the
 * same reason the character anchor does — a re-worded style block against a shared one is vault
 * **4.3**, and it cost 12 credits in the vault's evidence.
 *
 * **Every one of them enumerates its ornamentation element by element.** That is not verbosity, it
 * is the single most reliable finding this project has: STYLE.md §6 established that this model
 * obeys a NAMED element and ignores an adjective, the character anchor confirmed it in the additive
 * direction, and "highly detailed" in the RENDERING block was not by itself enough to produce a
 * detailed character.
 */

import { templateBlock } from './prompt.mjs';

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
 * The gear pickup — Phase 6's one new asset.
 *
 * Drawn as a **single isolated object on chroma**, like the HUD, because it is composited by the
 * game rather than photographed in a scene. It is the only asset in the project that appears at two
 * sizes: 96 px as a world pickup and 56 px as the HUD counter's icon. That is why the silhouette is
 * specified so hard — a gear that reads by its surface detail turns to mush at 56 px, and STYLE.md
 * §7 gate 5 ("readability at true sprite size") is the gate it would fail.
 *
 * Element by element, for the reason stated above `hudPrompt`: this model obeys a NAMED element and
 * ignores an adjective.
 *
 * **`[SETTING]` and `[SCALE_RATIO]` are deliberately absent.** §4 states both are for SCENE and
 * BACKGROUND prompts; an isolated object on a chroma field has no setting to place it in and no
 * character to scale it against. Said out loud rather than left as a silent omission *(vault C10)*.
 */
export function gearPrompt(template) {
  const rendering = templateBlock(template, 'RENDERING');
  const forbid = templateBlock(template, 'DO NOT INCLUDE');
  return [
    'A single Victorian steampunk brass gear, drawn as one isolated game pickup object on a flat ' +
      'background. Seen straight on, face to the viewer, no perspective, no tilt.',
    '',
    'THE GEAR: a thick cog wheel of warm polished brass with TWELVE evenly spaced square-topped ' +
      'teeth around its rim. A raised outer ring inside the teeth, then four curved cut-out spokes ' +
      'radiating from a central hub, then a round hub with a dome rivet at its centre. The metal is ' +
      'warm copper-gold, with a bright specular highlight along the upper-left edges of the teeth ' +
      'and a darker patina in the recesses.',
    '',
    // The silhouette clause. At 56 px the teeth and the spoke cut-outs are the only things still
    // resolvable, so they are what has to survive — the same reasoning that put "readability at
    // true sprite size" in STYLE.md §7 as a gate rather than a hope.
    'CRITICAL SILHOUETTE: the gear must read instantly as a gear from its OUTLINE alone at very ' +
      'small size. The teeth are large, square and widely separated, and the four spoke cut-outs ' +
      'are large open holes that go all the way through to the background. High contrast between ' +
      'the metal and the holes. It is ONE gear, complete and centred, not overlapping any other.',
    '',
    'BACKGROUND: one flat uniform chroma green field, RGB 0 255 0, edge to edge, with a clear ' +
      'margin of it on all four sides. The chroma green shows THROUGH the four spoke cut-outs. No ' +
      'panel, no plate, no backing, no scene, no shadow.',
    '',
    rendering,
    '',
    `${forbid}, a second gear, a stack of gears, overlapping gears, a machine, a clock face, ` +
      'numerals, digits, text, background scenery, drop shadow.',
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


/**
 * The level EXIT — the gate-entry session's one generation.
 *
 * `2:3` and downscaled to exactly `192 x 288`, because that is the goal rect in all five shipped
 * `.tmj` files. Authored at the size it draws at, like every other sprite here: at `CAMERA_ZOOM` 1
 * nothing scales between the file and the screen, which is what makes "readable at true sprite
 * size" testable rather than a range.
 *
 * ## 🔴 THE OPENING IS LOAD-BEARING, NOT DECORATION
 *
 * The player fades to alpha 0 *inside* this doorway. If the model renders the opening as a real
 * hole onto the chroma field, `keyOut` punches straight through it and the character fades into a
 * transparent gap showing the parallax behind — the exact opposite of vanishing into a dark
 * passage. So the interior is named as SOLID NEAR-BLACK, exhaustively, in the same style
 * `hudPrompt`'s anti-segmentation clause uses and for the same reason: this model obeys a named
 * element and ignores an adjective, and it has many words for "opening".
 *
 * `tests/unit/shipped-gate.test.ts` measures the finished file's interior opacity, because the
 * one-component check in `buildGate` cannot see this: a doorway whose interior keyed away comes
 * back as a FRAME — a ring, still exactly one connected component, still 192 x 288.
 *
 * ## Why no brass-cap separation rule
 *
 * STYLE.md §5 rule ONE is about standable surfaces. A doorway is not standable and the player walks
 * THROUGH it, so capping it in brass would make it read as a platform — the one thing the rule
 * exists to prevent. Rule TWO (temperature) does apply and is carried by the warm brass frame
 * against the near-black void. Named here rather than silently skipped *(vault 9.3)*.
 */
export function gatePrompt(template) {
  const rendering = templateBlock(template, 'RENDERING');
  const forbid = templateBlock(template, 'DO NOT INCLUDE');
  return [
    'A single ornate Victorian steampunk doorway, drawn as one isolated game object on a flat ' +
      'background. Seen straight on, face to the viewer, no perspective, no tilt. It stands ' +
      'upright and is TALLER THAN IT IS WIDE, filling the frame vertically.',
    '',
    'THE DOORWAY FRAME: a heavy riveted wrought-iron portal with a polished brass arch across the ' +
      'top and brass edging down both jambs. Named element by element: a row of dome rivets down ' +
      'each jamb, two round pressure gauges with white dials set into the left jamb, a brass lever ' +
      'and a valve wheel on the right jamb, copper pipework running up both sides and over the ' +
      'lintel, and one hanging lamp with a warm amber glow above the arch. Engraved filigree on ' +
      'the brass, patina and soot in the recesses.',
    '',
    // The clause the whole feature depends on. Exhaustive, because the model has many words for
    // "opening" and only one of them has to land for the void to key away.
    'CRITICAL — THE OPENING: the interior of the doorway is filled with SOLID NEAR-BLACK DARKNESS, ' +
      'an unlit passage receding into shadow. It is COMPLETELY OPAQUE and covers every pixel ' +
      'inside the frame. Nothing behind the doorway is visible through it. It is NOT an open hole, ' +
      'NOT a gap, NOT a window, NOT a cut-out, NOT transparent, NOT see-through, NOT the ' +
      'background colour and NOT green. There is no scenery, no sky, no room and no floor visible ' +
      'inside it — only darkness, with the faintest cool rim-light picking out the inner edge of ' +
      'the frame.',
    '',
    'CRITICAL SILHOUETTE: it must read instantly as a DOORWAY from its outline alone at small ' +
      'size — an upright rectangular portal with a dark interior, one continuous frame all the way ' +
      'around, standing on its own. It is ONE doorway, complete and centred, not part of a wall ' +
      'and not overlapping anything.',
    '',
    // 🔴 The margin clause is a GATE requirement, not framing taste. `estimateKeyColour` measures
    // the key from the image's own border and REFUSES an image whose border is not uniform — and
    // take 1 put the doorway flush against the bottom edge, so that row came back **5.5 % green**
    // against 97.8 / 100 / 96.1 on the other three and the build stopped. The refusal was correct
    // and was not worked around: this clause is the fix, and it names the bottom explicitly
    // because that is the edge a doorway naturally runs off.
    'BACKGROUND AND MARGIN: one flat uniform chroma green field, RGB 0 255 0, edge to edge behind ' +
      'everything. CRITICAL: the doorway and EVERYTHING attached to it — the lamp, its chain, the ' +
      'pipework, the gauges, the lever and the valve wheel — must sit COMPLETELY INSIDE the image ' +
      'with a clear band of chroma green all the way around: above the lamp, BELOW THE BASE OF ' +
      'THE DOORWAY, and outside the pipework on both the left and the right. Nothing touches or ' +
      'runs off any edge of the image. Every one of the four outermost rows and columns of pixels ' +
      'is pure chroma green. The chroma green does NOT show through the doorway opening itself. ' +
      'No wall, no panel, no plate, no backing, no scene, no shadow, no floor.',
    '',
    rendering,
    '',
    `${forbid}, a second doorway, a door leaf, an open door, a doorknob, a person, a figure in ` +
      'the doorway, a staircase, a room behind it, a wall around it, background scenery, ' +
      'drop shadow, a brass-capped platform, a floor slab under the frame.',
  ].join('\n');
}
