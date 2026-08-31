/**
 * Typed view of `promptTouch.mjs` — the touch-plate prompt and the cell descriptors that decide
 * which cell of the generated grid becomes which control.
 *
 * The descriptors are typed so `shipped-touch.test.ts` can pin them against `TOUCH_IDS`: they were
 * referenced by no test at all, and the builder's own count guard compared them against themselves.
 */

/** One cell of the plate, and the control it becomes. `key` is the full texture key, `touch-left`. */
export interface TouchPlateCell {
  key: string;
  row: number;
  col: number;
  /** What the prompt asks the model to draw in this cell. */
  subject: string;
}

export const TOUCH_PLATE_CELLS: readonly TouchPlateCell[];
export const TOUCH_PLATE_EMPTY: null;
export const TOUCH_PLATE_COLS: number;
export const TOUCH_PLATE_ROWS: number;
export const TOUCH_PLATE_CHROMA: string;
/**
 * `template` is `styleTemplate()`'s opaque parsed STYLE.md, which `prompt.d.mts` types as
 * `unknown` — it was declared `string` here, which no caller could satisfy.
 */
export function touchPlatePrompt(template: unknown): string;

/**
 * The single-button variant, for a one-cell re-shoot through `nano-banana-pro/edit`.
 *
 * Takes the cell rather than a key so `touch-prompt.test.ts` can drive it over every descriptor
 * and assert that only the requested subject appears.
 */
export function touchButtonPrompt(template: unknown, cell: TouchPlateCell): string;
