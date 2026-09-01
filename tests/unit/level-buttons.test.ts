import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { touchMenuLayout } from '../../src/render/touchLayout';
import {
  LOCK_TEXTURE_KEY,
  LOCKED_COLOUR,
  LOCKED_STROKE,
  PLATE_INSET_PX,
  PLATE_STROKE_PX,
  SELECTED_COLOUR,
  SELECTED_STROKE,
  SELECTED_STROKE_PX,
  UNLOCKED_COLOUR,
  UNLOCKED_STROKE,
  drawLevelButton,
  paintLevelButton,
  resizeLevelButton,
} from '../../src/scenes/levelButtons';
import { makeTouchScene, type FaceFake } from './touchSceneFake';
import type { TouchFaceLike } from '../../src/scenes/touchTypes';

/**
 * **The level-select buttons, behaviourally, against a fake scene.**
 *
 * The stronger of the two draw-path shapes CLAUDE.md names, and reachable here because
 * `levelButtons.ts` imports no Phaser VALUE. Every position is derived by CALLING `touchMenuLayout`
 * rather than restated as a literal — a gate that repeats the layout's arithmetic passes when both
 * copies are wrong together.
 */

const ROW_STYLE = { fontFamily: 'monospace', fontSize: '34px' } as const;

/**
 * Read a drawn face's recorded state.
 *
 * `LevelButton` types its pieces as `TouchFaceLike` — the SETTER surface production is allowed to
 * use, deliberately carrying no data fields, which is what keeps `levelButtons.ts` free of a Phaser
 * value import. The fake's `FaceFake` is the same object with its state readable.
 */
const read = (face: TouchFaceLike): FaceFake => face as unknown as FaceFake;

/** The five-row band at the design view, which is what the menu actually asks for. */
function band(count = 5, w = 1920, h = 1080) {
  return touchMenuLayout(count, w, h);
}

describe('drawing one level button', () => {
  it('puts five buttons in five distinct, non-zero places', () => {
    // Non-vacuity. Everything below reads positions; a draw path that stacked all five at the
    // origin would satisfy most of it.
    const { scene, faces } = makeTouchScene();
    const boxes = band();
    const buttons = boxes.map((box, i) => drawLevelButton(scene, box, `row ${i}`, true, ROW_STYLE));

    expect(buttons).toHaveLength(5);
    const ys = buttons.map((b) => read(b.plate).y);
    expect(new Set(ys).size, 'the five plates share a position').toBe(5);
    for (const y of ys) expect(y).toBeGreaterThan(0);
    expect(faces.length, 'nothing was drawn at all').toBeGreaterThan(0);
  });

  it('centres the plate in its box and insets it, leaving the hit box alone', () => {
    const { scene } = makeTouchScene();
    const box = band()[2]!;
    const button = drawLevelButton(scene, box, 'row 2', true, ROW_STYLE);

    expect(read(button.plate).x).toBe(box.x + box.w / 2);
    expect(read(button.plate).y).toBe(box.y + box.h / 2);
    expect(read(button.plate).w).toBe(box.w - PLATE_INSET_PX * 2);
    expect(read(button.plate).h).toBe(box.h - PLATE_INSET_PX * 2);
    // The label sits at the same centre, so the row reads as one object.
    expect(read(button.text).x).toBe(read(button.plate).x);
    expect(read(button.text).y).toBe(read(button.plate).y);
  });

  /**
   * 🔴 **Three assertions, not one, and the third is the one that matters.**
   *
   * A `Shape` carries `fillAlpha` (the 6th `add.rectangle` argument, *"only used when `isFilled`"*,
   * `Shape.js:119`) entirely separately from the Alpha component's `alpha`. Asserting
   * `plate.alpha === 0` would pass against a fake that conflated them and be actively WRONG against
   * real Phaser: `alpha === 0` erases the STROKE too, and the stroke is the entire visual.
   *
   * The unfilled plate is a contrast decision, not a style one: `PLATE_FILL` at its resting alpha
   * over the config ground composites to about `rgb(67,48,24)`, against which `LOCKED_COLOUR`
   * measures **3.52:1** — below the 4.5:1 a 34 px row font needs, and a regression from the
   * **5.33:1** the UI/UX gate bought.
   */
  it('draws the plate UNFILLED (3.52:1 if filled) while keeping a visible keyline', () => {
    const { scene } = makeTouchScene();
    const button = drawLevelButton(scene, band()[0]!, 'row 0', true, ROW_STYLE);

    expect(read(button.plate).fillAlpha, 'a filled plate drops the locked label to 3.52:1').toBe(0);
    expect(read(button.plate).alpha, 'object alpha 0 would erase the keyline, which IS the button').toBe(1);
    expect(read(button.plate).strokeWidth).toBeGreaterThan(0);
  });
});

describe('painting the selection', () => {
  it('changes the keyline hue AND width, and does not touch the label text', () => {
    const { scene } = makeTouchScene();
    const button = drawLevelButton(scene, band()[1]!, 'level-02', true, ROW_STYLE);

    const restingWidth = read(button.plate).strokeWidth;
    const restingColour = read(button.plate).strokeColor;
    const label = read(button.text).text;

    paintLevelButton(button, true, true);
    expect(read(button.plate).strokeWidth).toBe(SELECTED_STROKE_PX);
    expect(read(button.plate).strokeColor).toBe(SELECTED_STROKE);
    expect(read(button.text).colour).toBe(SELECTED_COLOUR);
    // 🔴 The whole point of the rework: selection is not a `"> "` prefix any more. A re-introduced
    // prefix reds here, and this is the only assertion that would notice — but ONLY because
    // `TouchFaceLike` and the fake both carry `setText` now. Until 2026-09-01 neither did, so the
    // prefix mutation called a method that was not there and this case passed through the exact
    // change it names. A gate that cannot go red is decoration *(C2)*.
    expect(read(button.text).text, 'the label changed — selection is back to a text prefix').toBe(label);

    paintLevelButton(button, false, true);
    expect(read(button.plate).strokeWidth).toBe(restingWidth);
    expect(read(button.plate).strokeWidth).toBe(PLATE_STROKE_PX);
    expect(read(button.plate).strokeColor).toBe(restingColour);
    expect(read(button.plate).strokeColor).toBe(UNLOCKED_STROKE);
    expect(read(button.text).colour).toBe(UNLOCKED_COLOUR);
    expect(read(button.text).text).toBe(label);
  });

  it('paints a locked row in the locked ink, on the keyline and the label alike', () => {
    const { scene } = makeTouchScene();
    const button = drawLevelButton(scene, band()[3]!, 'level-04', false, ROW_STYLE);

    expect(read(button.plate).strokeColor).toBe(LOCKED_STROKE);
    expect(read(button.text).colour).toBe(LOCKED_COLOUR);
  });

  it('paints a SELECTED LOCKED row as selected — the cursor is still on it', () => {
    // The cursor can sit on a locked row: `move()` walks every row and `play()` refuses at the end.
    // A row that stopped showing the cursor there would make the refusal look like a dead menu.
    const { scene } = makeTouchScene();
    const button = drawLevelButton(scene, band()[4]!, 'level-05', false, ROW_STYLE);

    paintLevelButton(button, true, false);
    expect(read(button.plate).strokeColor).toBe(SELECTED_STROKE);
    expect(read(button.plate).strokeWidth).toBe(SELECTED_STROKE_PX);
    expect(read(button.text).colour).toBe(SELECTED_COLOUR);
  });
});

describe('the lock icon', () => {
  it('draws nothing on an unlocked row', () => {
    const { scene } = makeTouchScene();
    expect(drawLevelButton(scene, band()[0]!, 'level-01', true, ROW_STYLE).lock).toEqual([]);
  });

  it('uses the generated padlock when it reached the texture manager', () => {
    const { scene } = makeTouchScene({ art: true });
    const box = band()[2]!;
    const button = drawLevelButton(scene, box, 'level-03', false, ROW_STYLE);

    expect(button.lockIsArt).toBe(true);
    expect(button.lock).toHaveLength(1);
    expect(read(button.lock[0]!).textureKey).toBe(LOCK_TEXTURE_KEY);
    // Sized into the box rather than left at the source PNG's pixel size, and placed in the
    // left-hand gutter rather than over the centred label.
    expect(read(button.lock[0]!).w).toBeCloseTo(box.h * 0.42, 6);
    expect(read(button.lock[0]!).x).toBe(box.x + box.h / 2);
    expect(read(button.lock[0]!).x).toBeLessThan(read(button.text).x);
  });

  it('draws a padlock when the art is absent — a locked row must never read as unlocked', () => {
    // The art arm cannot cover this: `textures.exists` is true for every key in that fake, so the
    // fallback branch is unreachable there. Two cases, because one mutation must not mask the other.
    const { scene } = makeTouchScene();
    const box = band()[2]!;
    const button = drawLevelButton(scene, box, 'level-03', false, ROW_STYLE);

    expect(button.lockIsArt).toBe(false);
    expect(button.lock, 'shackle, body and keyhole').toHaveLength(3);
    for (const piece of button.lock) {
      expect(read(piece).w).toBeGreaterThan(0);
      expect(read(piece).x).toBe(box.x + box.h / 2);
    }
  });

  /**
   * 🔴 The texture key against the SHIPPED catalog, which the art arm cannot check.
   *
   * `makeTouchScene({art:true})`'s `textures.exists` answers true for any key, so a
   * `LOCK_TEXTURE_KEY` of `'lock'` still "finds" a texture there while missing the real catalog
   * entry entirely — the paid asset would load and never be drawn, on every device. The plan for
   * this feature genuinely did name two different keys in two sections.
   */
  it('names a texture the shipped catalog actually loads', () => {
    const catalog = JSON.parse(readFileSync('public/assets/index.json', 'utf8')) as {
      images?: { key?: string }[];
    };
    const keys = (catalog.images ?? []).map((image) => image.key);
    expect(keys, `no images[] entry with key "${LOCK_TEXTURE_KEY}" — the padlock never loads`).toContain(
      LOCK_TEXTURE_KEY,
    );
    // ⚠️ `catalogTouchKeys()` in `tools/gen/buildTouchAtlas.mjs` matches `touch-` and cross-checks
    // the produced set against the catalog, so a seventh `touch-*` row makes `npm run assets:touch`
    // throw before it writes anything.
    expect(LOCK_TEXTURE_KEY.startsWith('touch-')).toBe(false);
  });
});

describe('resizing a button', () => {
  it('moves the plate, the label and the lock onto the new box', () => {
    const { scene } = makeTouchScene();
    const narrow = band(5, 1920, 1080)[2]!;
    const button = drawLevelButton(scene, narrow, 'level-03', false, ROW_STYLE);
    const wide = band(5, 2560, 1080)[2]!;
    expect(wide.w, 'the two bands are the same width — this case would prove nothing').not.toBe(
      narrow.w,
    );

    resizeLevelButton(button, wide);

    expect(read(button.plate).x).toBe(wide.x + wide.w / 2);
    expect(read(button.plate).w).toBe(wide.w - PLATE_INSET_PX * 2);
    expect(read(button.text).x).toBe(wide.x + wide.w / 2);
    for (const piece of button.lock) expect(read(piece).x).toBe(wide.x + wide.h / 2);
  });
});
