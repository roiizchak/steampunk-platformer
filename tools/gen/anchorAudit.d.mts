/** Typed view of `anchorAudit.mjs` — the 4.27 wiring. See `png.d.mts` for why these are hand-written. */

/**
 * One anchor's row. `status` widens G1's verdict set by exactly one value, `ABSENT`, which is not a
 * gate verdict at all — the file was never read. Folding it into `PASS` is the thing the audit
 * exists to avoid, so it is a distinct value in the type as well as in the report.
 */
export interface AnchorAuditRow {
  path: string;
  status: 'PASS' | 'FAIL' | 'INDETERMINATE' | 'ABSENT';
  detail: string;
}

export declare function declaredAnchorSources(): string[];
export declare function auditAnchors(paths: string[]): AnchorAuditRow[];

/** Where generated art lands. Its existence is what turns ABSENT from context into a defect. */
export declare const GENERATED_ROOT: string;

/**
 * Run the audit and THROW. The entry point every anchor-reading script calls.
 *
 * Throws on any FAIL; on any ABSENT when `generatedRoot` exists (a pipeline with a missing input,
 * as opposed to a fresh clone that has no pipeline); and on an empty declaration list.
 */
export declare function auditOrThrow(opts?: {
  label?: string;
  generatedRoot?: string;
  /** Injectable so the ABSENT rule is reachable from a test. Defaults to the declared list. */
  sources?: string[];
}): AnchorAuditRow[];
