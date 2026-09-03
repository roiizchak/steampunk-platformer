import { describe, expect, it } from 'vitest';

/**
 * The audition template ships as three parts, and this is the only thing that keeps them one page.
 *
 * 🔴 **It was one 442-line file and no gate could see it.** `tests/unit/file-size.test.ts` globbed
 * `src/**` TypeScript, `tools/**` `.mjs`, `tests/**` TypeScript and the root configs — no HTML at
 * all — so criterion 12.21's *"no source, test, tool or config file over 400 lines"* read **PASS**
 * over a live 442-line tool input that `build-audition.mjs` reads on every run. Codex round 21,
 * finding 7. The glob covers tool HTML now (`tools` + `/**` + `/*.html`), and the file is split at
 * its own seams (`</style>`, `<script>`) rather than exempted: raising the size ratchet off zero
 * opens a hole `file-size.test.ts` documents at length, and an HTML document has real seams.
 *
 * ⚠️ **The split had to be invisible in the output, and that was a ONE-TIME byte claim.** The three
 * parts concatenate with NOTHING between them and reproduced the pre-split blob exactly —
 * **17 843 UTF-8 bytes**, verified at the split and recorded in the commit. This file does **not**
 * re-assert that number, and saying it “pins the original bytes” would be false: a hard byte count
 * would red on every legitimate future edit to the template, which is not a property worth having.
 * Codex round 22, finding 3, on both counts — and the figure it corrected was **17 839**, which is
 * the JavaScript CHARACTER count. Two em dashes make the UTF-8 byte count four higher, and a
 * “byte” claim measured in `String.length` is the quiet unit error this project keeps paying for.
 *
 * What this file pins are the properties the concatenation actually depends on, none of which is a
 * line count: the three parts exist and are the ones the builder names, they join in a fixed order
 * into one well-formed document, each boundary is exactly at its seam, no part carries a stray
 * trailing newline — and the builder really reads them.
 */
const PARTS = import.meta.glob('../../tools/gen/audition-template.*.html', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

/** The order `build-audition.mjs` concatenates them in. Not alphabetical — document order. */
const ORDER = ['style', 'body', 'script'] as const;

function part(name: string): string {
  const key = Object.keys(PARTS).find((k) => k.endsWith(`audition-template.${name}.html`));
  expect(key, `no audition-template.${name}.html — build-audition.mjs reads it by name`).toBeDefined();
  return PARTS[key!]!;
}

describe('the audition template is three files and one document', () => {
  it('has exactly the three parts the builder names, and nothing else', () => {
    const names = Object.keys(PARTS)
      .map((k) => /audition-template\.([a-z]+)\.html$/.exec(k)?.[1])
      .filter((n): n is string => Boolean(n))
      .sort();
    // 🔴 An exact set. A fourth part that the builder does not read would be silently dropped from
    // the page, and a `toContain` for the three would never say so.
    expect(names, 'the parts on disk are not the three the builder concatenates').toEqual(
      [...ORDER].sort(),
    );
  });

  it('joins into ONE well-formed document, with the seams where they belong', () => {
    const joined = ORDER.map((n) => part(n)).join('');
    // The seams, in document order. If a part were reordered or a boundary moved, these would not
    // hold — and unlike a byte hash, they say WHICH property broke.
    const style = joined.indexOf('<style>');
    const styleEnd = joined.indexOf('</style>');
    const script = joined.indexOf('<script>');
    const scriptEnd = joined.indexOf('</script>');
    expect(style, 'no <style> block').toBeGreaterThanOrEqual(0);
    expect(styleEnd, '<style> is never closed').toBeGreaterThan(style);
    expect(script, 'no <script> block').toBeGreaterThan(styleEnd);
    expect(scriptEnd, '<script> is never closed').toBeGreaterThan(script);
    // Each placeholder the builder substitutes must survive the split, in exactly one place.
    for (const token of ['__CUE_ROWS__', '__BED_ROWS__', '__SRC_MAP__', '__GAIN_MAP__', '__STACK__']) {
      expect(joined.split(token).length - 1, `${token} does not appear exactly once`).toBe(1);
    }
  });

  it('leaves no seam INSIDE a part, so the boundaries are where the builder assumes', () => {
    // `style` ends the stylesheet and opens nothing; `script` opens the script and closes it.
    expect(part('style').trimEnd().endsWith('</style>'), 'the style part does not end at </style>').toBe(true);
    expect(part('body').includes('<script>'), 'the body part carries a <script> that belongs to the script part').toBe(false);
    expect(part('body').includes('</style>'), 'the body part carries the style seam').toBe(false);
    expect(part('script').trimStart().startsWith('<script>'), 'the script part does not open at <script>').toBe(true);
  });

  it('concatenates with NOTHING between the parts', () => {
    // 🔴 The property a `.join('\n')` would break invisibly. `body` starts on the line after
    // `</style>`, so every part except the last ends with its own newline and the join adds none.
    for (const name of ['style', 'body'] as const) {
      expect(part(name).endsWith('\n'), `the ${name} part must end with its own newline`).toBe(true);
    }
    expect(part('script').endsWith('\n\n'), 'the script part has grown a trailing blank line').toBe(false);
  });
});

/**
 * 🔴 **And the BUILDER's half, because the four cases above could not see it.**
 *
 * M115 changed `build-audition.mjs`'s `.join('')` to `.join('\n')` — three newlines injected into
 * the generated page, one at each seam — and all four cases stayed green. They assert properties of
 * the parts on disk; nothing read the code that puts them together. That is the same defect as a
 * decision function with no consumer, one layer over: a split whose only gate describes the pieces
 * says nothing about the document.
 *
 * A source-text gate, deliberately, and the weaker of the two shapes this project uses. The
 * behavioural one would have to run `build-audition.mjs`, which reads every audio file in the
 * catalog and writes a 20 MB artifact — too heavy for the unit suite, and the reason is worth
 * stating rather than leaving the choice looking arbitrary.
 */
const BUILDER = Object.values(
  import.meta.glob('../../tools/gen/build-audition.mjs', {
    query: '?raw',
    import: 'default',
    eager: true,
  }),
)[0] as string;

describe('the builder actually concatenates them, in order, with nothing between', () => {
  it('reads the three parts by the names this file pins', () => {
    const listed = /\[([^\]]*)\]\s*\n?\s*\.map\(\(part\)/.exec(BUILDER)?.[1];
    expect(listed, 'build-audition.mjs no longer maps over a literal list of parts').toBeDefined();
    const names = [...listed!.matchAll(/'([a-z]+)'/g)].map((m) => m[1]);
    expect(names, 'the builder concatenates a different set or order of parts').toEqual([...ORDER]);
  });

  it('joins with the EMPTY string, not a newline', () => {
    expect(
      /\.join\(''\)/.test(BUILDER),
      "build-audition.mjs no longer joins with '' — a separator changes the generated page silently",
    ).toBe(true);
    expect(
      /\.join\('\n'\)/.test(BUILDER),
      'build-audition.mjs joins the template parts with a newline',
    ).toBe(false);
  });
  it('actually READS each part, and the result becomes the page', () => {
    // 🔴 **Every other case here passes with the callback returning `''`.** The array is still
    // a literal list of three, `.join('')` is still there, the parts on disk are still correct — and
    // the generated document is empty. Codex round 22, finding 3: a gate over the SHAPE of a
    // pipeline that never checks the pipeline moves anything is the same defect as a decision
    // function with no consumer, which is the thing this whole file exists to be an instance of.
    const callback = /\.map\(\(part\) => (.*)\)/.exec(BUILDER)?.[1];
    expect(callback, 'the builder no longer maps the parts through a callback').toBeDefined();
    expect(
      callback!,
      'the map callback does not read the part file — the page would be built from nothing',
    ).toContain('readFileSync');
    expect(callback!, 'the map callback does not read the part by name').toContain(
      'audition-template.',
    );
    // And the joined result has to be what is written, not a variable that goes nowhere.
    expect(/const html = \[/.test(BUILDER), 'the concatenation no longer builds `html`').toBe(true);
    expect(/writeFileSync\([\s\S]{0,80}html\)/.test(BUILDER), 'the built `html` is never written').toBe(true);
  });
});
