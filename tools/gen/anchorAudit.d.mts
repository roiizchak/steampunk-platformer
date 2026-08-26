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
