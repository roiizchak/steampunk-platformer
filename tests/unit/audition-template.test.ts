import { describe, expect, it } from 'vitest';

import { TEMPLATE_PARTS, buildBaseDocument } from '../../tools/gen/auditionDocument.mjs';

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
 * 🔴 **And the BUILDER's half, because the four cases above could not see it — twice over.**
 *
 * M115 changed `.join('')` to a newline separator and all four stayed green: they assert properties of
 * the parts ON DISK, and nothing read the code that puts them together. A source-text gate was
 * added. **M117 then blanked the map callback to `''` and six cases stayed green**, so a seventh
 * required `readFileSync`, the part name and the write of `html` to appear in it (Codex round 22,
 * finding 3). **Round 23, finding 2, defeated that one too**: appending `.slice(0, 0)` to the real
 * read keeps every token the regex looks for and still builds an empty page.
 *
 * That is where a source-text gate runs out. A regex cannot tell a read from a discarded read, so
 * the concatenation moved into `tools/gen/auditionDocument.mjs` and these cases RUN it. The reason
 * the weaker shape was chosen first — `build-audition.mjs` reads every audio file in the catalog and
 * writes a 20 MB artifact — does not apply to three small HTML files.
 */
const BUILDER = Object.values(
  import.meta.glob('../../tools/gen/build-audition.mjs', {
    query: '?raw',
    import: 'default',
    eager: true,
  }),
)[0] as string;

describe('the builder actually concatenates them, in order, with nothing between', () => {
  it('returns the three real parts, in document order, joined with nothing', () => {
    expect(TEMPLATE_PARTS, 'the builder concatenates a different set or order of parts').toEqual([
      ...ORDER,
    ]);
    // 🔴 The whole point of running it: this is the string the page is built from, not a claim
    // about the code that produces it. a newline separator, a reorder, a dropped part and a discarded
    // read all change it.
    expect(buildBaseDocument(), 'the built document is not the three parts concatenated').toBe(
      ORDER.map((n) => part(n)).join(''),
    );
  });

  it('returns every byte of every part — a discarded read is not a read', () => {
    const doc = buildBaseDocument();
    for (const name of ORDER) {
      expect(doc.includes(part(name)), `the ${name} part is missing from the built document`).toBe(
        true,
      );
    }
    expect(doc.length, 'the built document is shorter than the sum of its parts').toBe(
      ORDER.reduce((n, name) => n + part(name).length, 0),
    );
  });

  it('is the document build-audition.mjs actually writes', () => {
    // The one source-text assertion left, and it is the SEAM: a gated module with an ungated caller
    // is the same defect one layer up. `auditionDocument.mjs` is only worth running if the builder
    // still calls it and still writes what it returns.
    expect(
      /buildBaseDocument\(\)/.test(BUILDER),
      'build-audition.mjs no longer builds the page from buildBaseDocument()',
    ).toBe(true);
    expect(
      /writeFileSync\([\s\S]{0,80}html\)/.test(BUILDER),
      'the built `html` is never written',
    ).toBe(true);
  });
});
