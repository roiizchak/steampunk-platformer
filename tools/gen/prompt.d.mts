/**
 * Hand-written typings for `prompt.mjs`. Only the shape `tests/unit/motion-framing.test.ts` reads —
 * `tools/` sits outside the tsconfig `include`, so `strict` needs a declaration to import it.
 *
 * These two are what turn STYLE.md into the RENDERING and DO-NOT-INCLUDE tails every video prompt
 * carries. They live here rather than in `motion.d.mts` because `motion.mjs` does not re-export
 * them — `write-prompts.mjs` and `submit-clips.mjs` both import them from `prompt.mjs` directly,
 * and a test that renders "exactly as production does" has to take the same route.
 */

/** Parses `docs/STYLE.md` into the template object `videoPrompt` consumes. */
export declare function styleTemplate(stylePath: string): unknown;

/** Pulls one labelled block (`RENDERING`, `DO NOT INCLUDE`) out of that template. */
export declare function templateBlock(template: unknown, label: string): string;
