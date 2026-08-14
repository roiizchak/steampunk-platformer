/** Typed view of `edgeExceptions.mjs`. See `png.d.mts` for why these declarations are hand-written. */

/** The margins `gateEdgeBleed` reports, in px from each edge of the un-padded cell. */
export interface EdgeMargins {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/** The `value` half of a `gateEdgeBleed` verdict — `null`/partial when no mask survived keying. */
export interface EdgeBleedValue {
  margins?: EdgeMargins;
  marginPx?: number;
  [key: string]: unknown;
}

/** One accepted edge-bleed exception, pinned to a filename AND a set of edges. */
export interface EdgeException {
  /** The exact clip that was examined. A different round does not inherit the waiver. */
  file: string;
  /** Only these edges may bleed; uses `gateEdgeBleed`'s own margin names. */
  edges: readonly ('left' | 'right' | 'top' | 'bottom')[];
  /** Why this bleed is an effect rather than a cropped subject, with the measurement. */
  reason: string;
}

export declare const ACCEPTED_EDGE_BLEED: Readonly<Record<string, EdgeException>>;

export declare function failedEdgesOf(value: EdgeBleedValue | null | undefined): string[];

export declare function acceptedEdgeBleed(
  key: string,
  declaredFile: string | null,
  value: EdgeBleedValue | null | undefined,
): string | null;
