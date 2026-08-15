/**
 * Pure reporting half of `framingReport.mjs`, split out to keep both files under the 400-line
 * ceiling. No fs, no child_process — takes the measured data structures and prints tables. Also
 * carries the two published self-check facts, so a disagreement is visible in the printed output
 * rather than requiring a diff against this file's prose.
 */

const pad = (s, n) => String(s).padEnd(n);

export function printAnchorTable(anchors) {
  console.log('\n-- anchors --');
  console.log(
    pad('slug', 16) + pad('canvas', 12) + pad('ratio', 8) + pad('fig w%', 9) +
      pad('fig h%', 9) + 'margins L/R/T/B (%)',
  );
  for (const a of Object.values(anchors)) {
    console.log(
      pad(a.slug, 16) + pad(`${a.width}x${a.height}`, 12) + pad(a.ratio.toFixed(3), 8) +
        pad(`${a.figure.wFrac}`, 9) + pad(`${a.figure.hFrac}`, 9) +
        `${a.marginsPct.left}/${a.marginsPct.right}/${a.marginsPct.top}/${a.marginsPct.bottom}`,
    );
  }
}

export function printClipTable(results) {
  console.log('\n-- clips --');
  console.log(
    pad('name', 24) + pad('slug', 16) + pad('output', 12) + pad('out ratio', 10) +
      pad('anchor ratio', 13) + pad('reframed', 9) + 'zero-margin edges',
  );
  for (const r of results) {
    console.log(
      pad(r.name, 24) + pad(r.slug, 16) + pad(`${r.outputWidth}x${r.outputHeight}`, 12) +
        pad(r.outputRatio.toFixed(3), 10) + pad(r.anchorRatio.toFixed(3), 13) +
        pad(r.reframed ? 'yes' : 'no', 9) + (r.zeroEdges.join(',') || '(none)'),
    );
  }
}

/** Two results already known by hand-measurement, used only to flag a disagreement — never to
 * adjust the measured numbers. */
const SELF_CHECK = [
  { name: 'jump', edge: 'right' },
  { name: 'jump-r2', edge: 'top' },
];

export function printAnswer(results) {
  console.log('\n-- self-check --');
  for (const check of SELF_CHECK) {
    const r = results.find((x) => x.name === check.name);
    if (!r) {
      console.log(`${check.name}: NOT FOUND among discovered clips — cannot self-check`);
      continue;
    }
    const agrees = r.zeroEdges.includes(check.edge);
    console.log(
      `${check.name}: expected a cut on "${check.edge}" — measured zero-margin edges ` +
        `[${r.zeroEdges.join(',') || 'none'}] — ${agrees ? 'AGREES' : 'DISAGREES'}`,
    );
  }

  console.log('\n-- edges cut against a generous anchor margin --');
  let any = false;
  for (const r of results) {
    for (const edge of r.zeroEdges) {
      // "Generous" is a judgement call made visible, not hidden: an anchor margin comfortably
      // above the mid-teens on that same edge, with the clip still hitting zero on it.
      const anchorPct = anchorPctFor(r, edge);
      if (anchorPct !== null && anchorPct >= 15) {
        any = true;
        console.log(
          `  ${r.name} (${r.slug}) cut on ${edge}, where its anchor's ${edge} margin was ` +
            `${anchorPct}% of canvas`,
        );
      }
    }
  }
  if (!any) console.log('  none — every zero-margin cut lands on an edge whose anchor margin was already tight');
}

function anchorPctFor(result, edge) {
  return result.anchorMarginsPct ? result.anchorMarginsPct[edge] : null;
}
