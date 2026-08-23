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

/**
 * The animation name a sheet key refers to, relative to the character the config declares.
 *
 * `brass-courier-run` + slug `brass-courier` -> `run`. It throws on a key belonging to a different
 * character rather than guessing.
 *
 * **The naive version was `key.split('-').pop()`, and it is a silent cross-character corruption
 * waiting for Phase 5.** The moment a second character exists, `boiler-brute-run` also reduces to
 * `run` — a name `character-bounds.json` DOES declare — so nudging the enemy's foot offset would
 * write the courier's, and `serialiseBounds` would accept it because the animation exists. Every
 * gate stays green. The catalog is one asset away from that today.
 *
 * Raised by the `voltagent-qa-sec:code-reviewer` gate owner, brief 2.
 */
export function actionFromKey(sheetKey: string, slug: string): string {
  const prefix = `${slug}-`;
  if (!sheetKey.startsWith(prefix) || sheetKey.length === prefix.length) {
    throw new Error(
      `actionFromKey: sheet "${sheetKey}" does not belong to character "${slug}". Editing it ` +
        `against this character's bounds would write one character's config from another's sheet.`,
    );
  }
  return sheetKey.slice(prefix.length);
}

/** The character a bounds config is for. `null` when the config is unreadable or declares none. */
export function slugOf(raw: unknown): string | null {
  const slug = (raw as { slug?: unknown } | null)?.slug;
  return typeof slug === 'string' && slug.length > 0 ? slug : null;
}

/**
 * The action words the pipeline declares across every slug — courier `idle walk run jump fall
 * attack hurt death`, sentry `idle fire death`, scavenger `walk chase death` (HANDOFF §4 step 6a).
 * None contain a hyphen, which is what makes stripping a sheet key's trailing `-<action>` a safe
 * way to recover its SLUG with no config loaded yet to check it against — the bootstrap
 * `actionFromKey` itself cannot do, because that needs the slug first.
 */
const KNOWN_ACTIONS = [
  'idle', 'walk', 'run', 'jump', 'fall', 'attack', 'hurt', 'death', 'fire', 'chase',
] as const;

/**
 * The character slug a sheet key implies, guessed from its trailing `-<action>` word. `null` on a
 * key ending in no known action, so a caller can fall back rather than fetch a config for a wrong
 * guess. This is a GUESS used only to pick which config to fetch next — the actual edit still goes
 * through `slugOf`/`actionFromKey` against the config that comes back, so a wrong guess here
 * produces a failed fetch or a refusal, never a silent cross-character write.
 */
export function slugFromSheetKey(key: string): string | null {
  for (const action of KNOWN_ACTIONS) {
    const suffix = `-${action}`;
    if (key.endsWith(suffix) && key.length > suffix.length) {
      return key.slice(0, key.length - suffix.length);
    }
  }
  return null;
}

/**
 * Where a slug's bounds config lives. Filenames here MUST match `tools/gen/slugConfig.mjs`'s
 * `config` field basename exactly — that build script is the producer (it WRITES the file), this
 * function is the consumer (it fetches and names the save download). Two conventions for one file
 * is vault 5.3; `tests/unit/gym-bounds-config-path.test.ts` pins the two equal per slug.
 *
 * `brass-courier`'s predates per-slug naming and is not renamed — renaming is deletion, a standing
 * STOP-and-ask. Every other slug follows the producer's `character-bounds-<slug>.json` pattern.
 */
const LEGACY_CONFIG_PATHS: Readonly<Record<string, string>> = {
  'brass-courier': 'assets/config/character-bounds.json',
};

/** The fetch path for a slug's bounds config. */
export function configPathFor(slug: string): string {
  return LEGACY_CONFIG_PATHS[slug] ?? `assets/config/character-bounds-${slug}.json`;
}

/** The filename a save should download as — `configPathFor`'s own basename, so load and save
 *  always agree on which file a slug's edits round-trip through. */
export function configFilenameFor(slug: string): string {
  const path = configPathFor(slug);
  return path.slice(path.lastIndexOf('/') + 1);
}

/** Everything the Gym's readout needs. Plain data, so the panel is testable without a scene. */
export interface ReadoutState {
  /** Named to match `SheetEntry`, so a caller can spread its catalog row straight in. */
  key: string;
  frame: number;
  frameCount: number;
  fps: number;
  simTicks: number;
  derivedFrom: string;
  frameWidth: number;
  frameHeight: number;
  zoom: number;
  playing: boolean;
  bounds: Bounds | null;
  collisionW: number;
  collisionH: number;
  offsetPx: number;
  activeFrames: readonly number[];
}

/**
 * The Gym's readout, as lines of text.
 *
 * Pure, and here rather than in the scene for the reason everything else in this file is: it states
 * measurements a human then acts on, and a panel that quietly disagrees with the boxes drawn beside
 * it is worse than no panel. Extracting it also kept `GymScene.ts` under the 400-line limit by
 * moving logic out rather than by deleting the comments that explain it — which is what the rule
 * asks for and what shaving docstrings to hit a number is not.
 *
 * **Frame numbers are 1-based HERE and 0-based everywhere else.** The readout is for a human;
 * `activeFrames` in the config is indexed the way `generateFrameNumbers` indexes, from 0. Phase 5
 * reads those against animation frames, so the two bases must not be reconciled in the wrong
 * direction — raised by the code-reviewer gate owner, brief 2, as an unpinned off-by-one.
 */
export function readoutLines(state: ReadoutState): string[] {
  const rect = state.bounds ? boundsRect(state.bounds) : null;
  return [
    `SHEET      ${state.key}   [ ]`,
    `FRAME      ${state.frame + 1} / ${state.frameCount}   , .   ${state.playing ? 'playing' : 'PAUSED'}  SPACE`,
    `TIMING     ${state.fps.toFixed(2)} fps · ${state.simTicks} simTicks · ${state.derivedFrom}`,
    `CELL       ${state.frameWidth} x ${state.frameHeight}   zoom ${state.zoom}x  M`,
    '',
    state.bounds && rect
      ? `FOOTPRINT  ${rect.w} x ${rect.h} px   lift above cell floor ${liftAboveCellFloor(state.bounds, state.frameHeight)} px`
      : 'FOOTPRINT  INDETERMINATE — no opaque pixel in this cell (vault 4.18)',
    `COLLISION  ${state.collisionW} x ${state.collisionH} px — read-only, PLAYER_BOX x RENDER_SCALE`,
    `OFFSET     ${state.offsetPx} px   Z X`,
    `ACTIVE     ${state.activeFrames.length ? state.activeFrames.map((f) => f + 1).join(' ') : '(none)'}   A toggles this frame  (shown 1-based, stored 0-based)`,
    '',
    'white cell · blue footprint · green collision · red active frame',
    'S save · R revert · G back to game',
  ];
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
 * Fold edits made **while a config fetch was in flight** onto the values that fetch returned.
 *
 * ## Why this exists — inventory 4.6, `phase-04-impl.md:29`
 *
 * `GymScene.create()` starts `loadConfig()` and returns; the scene is interactive immediately. Any
 * nudge or active-frame toggle made before that promise settles landed in `this.edits`, and
 * `loadConfig` then did `this.edits = result.edits` — **replacing the object outright**. The work was
 * gone, and `refresh()` redrew from the file's values, so the readout showed a plausible number
 * rather than an error. Silent, and on the one screen whose whole job is measuring by eye.
 *
 * The recorded fix was to make the loss *loud*. This makes it **impossible** instead, which is
 * cheaper than a warning and leaves nothing for the user to react to.
 *
 * ## The precedence, and why it is this way round
 *
 * `pending` wins. A keystroke happened **after** the fetch was issued, so it is the newer statement
 * of intent — and it is the only one the person can see on screen. Silently reverting it to the
 * file's value is precisely the defect.
 *
 * Per action, not per object: an in-flight nudge to `walk` must not discard the file's `run` offset.
 * That is what makes this a merge rather than a pick.
 *
 * ⚠️ **Not for a slug change.** `stepSheet` clears the edits before re-loading on purpose — carrying
 * one character's offsets onto another would edit the wrong file. Merging against `emptyEdits()`
 * there is a no-op, which is why that path stays correct without a special case.
 */
export function mergeEdits(loaded: BoundsEdits, pending: BoundsEdits): BoundsEdits {
  return {
    footOffsetPx: { ...loaded.footOffsetPx, ...pending.footOffsetPx },
    activeFrames: { ...loaded.activeFrames, ...pending.activeFrames },
  };
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
