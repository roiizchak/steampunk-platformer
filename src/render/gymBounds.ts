/**
 * The Gym's measurements and its save payload. **Engine-free** (vault 2.12).
 *
 * Imports no Phaser and touches no Game Object: it takes raw RGBA bytes and plain objects, and
 * returns plain data. That is what puts `tests/unit/gym-bounds.test.ts` on the same footing as the
 * packer's own gate — the alpha metric and the save serialisation are reachable from a unit test
 * rather than only from a screenshot.
 *
 * **`serialiseBounds` is the Gym's save path, and vault A4 makes that an authorization decision.**
 * It lives here rather than in the scene for exactly that reason: `src/` is inside the typecheck
 * program and this file is inside the unit suite's include list, which is criterion 4.15. The
 * scene does the download; every byte it writes is decided here.
 */

/** Inclusive pixel indices, in CELL-LOCAL coordinates. `null` from a measurement means INDETERMINATE. */
export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface Cell {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Where each frame sits in the sheet. Row-major, wrapping at the sheet width — the same traversal
 * `generateFrameNumbers` uses, so frame N here is the frame Phaser plays as N.
 *
 * The shipped strips are all one row, and `assertSingleRowLayout` in the build keeps them that way.
 * This still wraps, because a metric that silently mis-indexes on a two-row sheet is worse than one
 * that handles it.
 */
export function frameCells(
  sheetWidth: number,
  frameWidth: number,
  frameHeight: number,
  frameCount: number,
): Cell[] {
  const columns = Math.floor(sheetWidth / frameWidth);
  if (columns < 1) {
    throw new Error(
      `frameCells: a ${sheetWidth}px sheet cannot hold a ${frameWidth}px frame. A sheet that ` +
        `disagrees with its catalog entry must fail here, not be measured anyway (vault 4.16).`,
    );
  }
  return Array.from({ length: frameCount }, (_unused, index) => ({
    x: (index % columns) * frameWidth,
    y: Math.floor(index / columns) * frameHeight,
    w: frameWidth,
    h: frameHeight,
  }));
}

/**
 * The visual footprint of one frame: the bounding box of its opaque pixels.
 *
 * Returns `null` — **INDETERMINATE, never a guess** *(vault 4.18)* — when the cell holds no pixel
 * at or above `alphaMin`. An empty cell is a real thing that happens to a mis-specified frame
 * count, and reporting `0,0,0,0` for it would draw a plausible box in the corner and read as a
 * measurement.
 *
 * `alphaMin` is 8 rather than 1 because chroma keying leaves a rim of near-zero alpha at the
 * silhouette edge; counting it would widen every box by the width of the halo rather than of the
 * character.
 */
export function measureCellBounds(
  rgba: Uint8ClampedArray | Uint8Array,
  sheetWidth: number,
  cell: Cell,
  alphaMin = 8,
): Bounds | null {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (let row = 0; row < cell.h; row += 1) {
    const base = ((cell.y + row) * sheetWidth + cell.x) * 4;
    for (let col = 0; col < cell.w; col += 1) {
      if (rgba[base + col * 4 + 3] < alphaMin) {
        continue;
      }
      if (col < minX) minX = col;
      if (col > maxX) maxX = col;
      if (row < minY) minY = row;
      if (row > maxY) maxY = row;
    }
  }

  if (maxX < minX) {
    return null;
  }
  return { minX, minY, maxX, maxY };
}

/** Inclusive bounds -> a drawable rect. `maxX - minX` alone is one pixel short of the real width. */
export function boundsRect(bounds: Bounds): Cell {
  return {
    x: bounds.minX,
    y: bounds.minY,
    w: bounds.maxX - bounds.minX + 1,
    h: bounds.maxY - bounds.minY + 1,
  };
}

/**
 * How far a frame's lowest drawn pixel sits above the cell's last row.
 *
 * This is the packer's per-frame lift as it can be read back off the SHIPPED sheet, and it is the
 * number the Gym exists to show against a ground line: the deepest frame of a grounded animation
 * must read 0 here, and on a levelled anchor every idle frame does.
 */
export function liftAboveCellFloor(bounds: Bounds, cellHeight: number): number {
  return cellHeight - 1 - bounds.maxY;
}

/** The per-animation fields `character-bounds.json` actually owns, and the only ones the Gym writes. */
export interface BoundsEdits {
  /** Vertical nudge per animation, in game px. The field ASSET-PIPELINE §6 names as the Gym's own. */
  footOffsetPx: Record<string, number>;
  /** Attack-hitbox active frames per animation. Phase 5 fills these; the mechanism ships now. */
  activeFrames: Record<string, number[]>;
}

export function emptyEdits(): BoundsEdits {
  return { footOffsetPx: {}, activeFrames: {} };
}

/**
 * The edits implied by a config file — i.e. the values already in it for the fields the Gym owns.
 *
 * The Gym must START from these, not from each type's zero, because `serialiseBounds` ASSIGNS what
 * it is handed. Seeded from zero, nudging `footOffsetPx` on one animation and saving would silently
 * discard every other value the file already held: a config declaring
 * `run: { footOffsetPx: -3, activeFrames: [3, 4] }` would be written back as
 * `footOffsetPx: -1, activeFrames: []`, with the Gym's readout showing the edit rather than the
 * effective value, so nothing warned you.
 *
 * Latent while every animation reads 0 and `[]`, and live the moment Phase 5 fills `activeFrames`,
 * which is the field's entire purpose. Raised by the `voltagent-qa-sec:code-reviewer` gate owner,
 * brief 1, finding F3 — the vault-A4 "a dev scene writing shipped configuration is using live
 * ammunition" class exactly.
 *
 * Lives here rather than in the scene so it is reachable from a unit test, which is the same reason
 * `serialiseBounds` does. An unreadable config yields empty edits rather than throwing: the Gym's
 * other jobs — measuring and looking — do not need it, and `serialiseBounds` refuses the save
 * separately *(vault 4.16)*.
 */
export function editsFromConfig(raw: unknown): BoundsEdits {
  const edits = emptyEdits();
  if (!hasAnimations(raw)) {
    return edits;
  }
  for (const [name, entry] of Object.entries(raw.animations)) {
    if (typeof entry?.footOffsetPx === 'number') {
      edits.footOffsetPx[name] = entry.footOffsetPx;
    }
    if (Array.isArray(entry?.activeFrames)) {
      edits.activeFrames[name] = [...entry.activeFrames];
    }
  }
  return edits;
}

interface BoundsFile {
  animations: Record<string, { footOffsetPx?: number; activeFrames?: number[] }>;
}

function hasAnimations(raw: unknown): raw is BoundsFile {
  if (typeof raw !== 'object' || raw === null) {
    return false;
  }
  const animations = (raw as { animations?: unknown }).animations;
  return typeof animations === 'object' && animations !== null && !Array.isArray(animations);
}

/**
 * Serialise `character-bounds.json` with the Gym's edits applied, and **nothing else touched**.
 *
 * Every other byte round-trips through `JSON.stringify(raw, null, 2)` — the same contract
 * `ElementEditorScene.saveLevel` keeps with the `.tmj`, and for the same reason: this file carries
 * the derived `scale` and a long provenance record that vault A5 says a human pastes deliberately.
 * A save that rewrote those from a running scene would be the A5 defect with extra steps.
 *
 * An animation named in `edits` that the file does not declare **throws**. It is a slug typo or a
 * stale scene, and silently creating the entry writes a config nothing generated *(vault 4.16)*.
 */
export function serialiseBounds(raw: unknown, edits: BoundsEdits): string {
  if (!hasAnimations(raw)) {
    throw new Error(
      'serialiseBounds: character-bounds.json has no `animations` object. Saving a config the Gym ' +
        'could not read would overwrite the real one with a guess (vault 4.16).',
    );
  }

  const out = JSON.parse(JSON.stringify(raw)) as BoundsFile;
  const declared = new Set(Object.keys(out.animations));

  for (const name of new Set([...Object.keys(edits.footOffsetPx), ...Object.keys(edits.activeFrames)])) {
    if (!declared.has(name)) {
      throw new Error(
        `serialiseBounds: edit for "${name}", which character-bounds.json does not declare. ` +
          `Declared: ${[...declared].join(', ')}.`,
      );
    }
  }

  for (const [name, offset] of Object.entries(edits.footOffsetPx)) {
    if (!Number.isInteger(offset)) {
      throw new Error(
        `serialiseBounds: footOffsetPx for "${name}" is ${offset}. It is a whole number of game ` +
          `pixels — a fractional nudge cannot be drawn and would land differently on every zoom.`,
      );
    }
    out.animations[name].footOffsetPx = offset;
  }

  for (const [name, frames] of Object.entries(edits.activeFrames)) {
    // Sorted and de-duplicated, so an identical set of toggles always produces identical bytes —
    // otherwise the byte-identical rebuild gate (vault 4.15) fails on toggle ORDER.
    out.animations[name].activeFrames = [...new Set(frames)].sort((a, b) => a - b);
  }

  return `${JSON.stringify(out, null, 2)}\n`;
}
