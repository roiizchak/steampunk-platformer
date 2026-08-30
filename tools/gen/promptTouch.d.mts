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
export function touchPlatePrompt(template: string): string;
