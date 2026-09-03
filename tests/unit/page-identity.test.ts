import { describe, expect, it } from 'vitest';

import { readBytes, readPng } from '../../tools/gen/png.mjs';

/**
 * What the page tells a browser tab and a link scraper about itself: the icon, the description and
 * the Open Graph card.
 *
 * 🔴 **The page had none of it for thirteen phases.** No `<link rel="icon">` anywhere, so every tab
 * and bookmark showed the browser's default globe; no `description` and no `og:*`, so a shared URL
 * — and this build has gone to friends more than once — arrived as a bare link with no title, no
 * art and no text. Added 2026-09-03 at the owner's request.
 *
 * ## Why a gate at all, for what looks like decoration
 *
 * Because every failure mode here is **silent**. A `<link rel="icon">` pointing at a file that does
 * not ship falls back to the default globe with no console error. An `og:image` with a relative URL
 * is dropped by every scraper — not a broken image, *no card at all*. A build that stopped copying
 * `public/` would take the lot away and nothing in this repository would notice. That is the shape
 * of the two `.ogg` beds that shipped a `BOOT REFUSED` screen to every iPhone past 229 green tests:
 * **nothing fails loudly, so something has to look.**
 *
 * So this file asserts the two things that can actually break — the tags are present and carry the
 * right content, and **every file they name exists and is not a stub** — and
 * `tools/gen/verify-dist.mjs` asserts the same against `dist/`, because a source gate cannot see a
 * shipped-bytes defect *(vault 3.1)*.
 *
 * ## What it cannot see
 *
 * Whether the icon reads at 16 px, and whether a scraper likes the card. The first is why the icon
 * is a downscale of art that was already shipped and looked at; the second is the owner sending
 * themselves the link.
 */
const INDEX = Object.values(
  import.meta.glob('../../index.html', { query: '?raw', import: 'default', eager: true }),
)[0] as string;

/**
 * The head with its newlines collapsed. Prettier wraps a long `<meta>` across three lines, so every
 * pattern below would have to carry `[\s\S]` without this — and a pattern that spans anything is a
 * pattern that matches the wrong tag eventually.
 */
const FLAT = INDEX.replace(/\s*\n\s*/g, ' ');

/** The one sentence, and it has to be the SAME one in all three places a reader can meet it. */
const DESCRIPTION =
  'A short Victorian steampunk platformer. Five levels of brass, steam and gears — playable in the browser, on desktop or phone.';

const ORIGIN = 'https://steampunk-platformer-jet.vercel.app';

/** Every asset the head points at, and the floor below which it is a stub rather than an image. */
export const REFERENCED_FILES = [
  ['public/favicon-32.png', 1024],
  ['public/favicon-48.png', 1024],
  ['public/favicon.ico', 4096],
  ['public/og-cover.png', 65536],
] as const;

/** Read one `<meta>`'s content, with the two attributes in either order. */
function meta(attr: 'name' | 'property', key: string): string | null {
  const k = key.replace(':', '\\:');
  const re = new RegExp(
    `<meta (?:${attr}="${k}" content="([^"]*)"|content="([^"]*)" ${attr}="${k}") ?/?>`,
  );
  const m = re.exec(FLAT);
  return m ? (m[1] ?? m[2] ?? null) : null;
}

describe('the page identifies itself to a tab', () => {
  it('links an icon at every size it declares, and a legacy .ico', () => {
    for (const [size, href] of [
      ['32x32', '/favicon-32.png'],
      ['48x48', '/favicon-48.png'],
    ] as const) {
      expect(
        new RegExp(`<link rel="icon"[^>]*sizes="${size}"[^>]*href="${href}"`).test(FLAT),
        `no <link rel="icon"> at ${size} — the tab falls back to the default globe, silently`,
      ).toBe(true);
    }
    expect(
      /<link rel="icon" href="\/favicon\.ico"/.test(FLAT),
      'no .ico fallback — Windows shortcuts and older bookmark bars ask for it by name',
    ).toBe(true);
  });

  it('carries the description, and the SAME one everywhere a reader meets it', () => {
    // 🔴 Three copies is not redundancy to collapse. `description` is what a search engine and the
    // browser's own UI read, `og:description` is what a chat app renders, `twitter:description` is
    // what the clients that never adopted Open Graph read. A gate that checked one would let the
    // other two drift, and drift is the only way they ever go wrong.
    for (const [attr, key] of [
      ['name', 'description'],
      ['property', 'og:description'],
      ['name', 'twitter:description'],
    ] as const) {
      expect(meta(attr, key), `${key} is missing or has drifted`).toBe(DESCRIPTION);
    }
  });

  it('gives a scraper an ABSOLUTE image url and its real dimensions', () => {
    const image = meta('property', 'og:image');
    expect(image, 'og:image is missing').toBeTruthy();
    // 🔴 The silent one. A scraper resolves nothing relative to a page it has not parsed, so a
    // relative `og:image` produces no card whatsoever — and nothing anywhere says so.
    expect(
      image!.startsWith('https://'),
      'og:image is not absolute — every scraper drops a relative one',
    ).toBe(true);
    expect(meta('property', 'og:url'), 'og:url is missing or not absolute').toBe(`${ORIGIN}/`);
    expect(meta('name', 'twitter:image'), 'twitter:image is missing').toBe(image);
    expect(meta('property', 'og:image:width'), 'og:image:width').toBe('1200');
    expect(meta('property', 'og:image:height'), 'og:image:height').toBe('630');
    expect(meta('name', 'twitter:card'), 'twitter:card must be the large form').toBe(
      'summary_large_image',
    );
    expect(meta('property', 'og:image:alt'), 'og:image:alt is missing').toBeTruthy();
    expect(meta('property', 'og:title'), 'og:title is missing').toBe('Steampunk Platformer');
  });

  it('points every one of those at a file that EXISTS and is not a stub', () => {
    // 🔴 The assertion the others are worthless without. Every tag above can be perfect while the
    // files are absent: a missing icon is the default globe, a missing og:image is a blank card.
    // `readBytes` throws on a missing path, which IS the assertion — the size floor is the second
    // half, because a zero-byte or one-pixel placeholder satisfies "exists" and renders nothing.
    for (const [file, floor] of REFERENCED_FILES) {
      const bytes = readBytes(file);
      expect(bytes.length, `${file} is smaller than ${floor}B — a stub, not an image`).toBeGreaterThan(
        floor,
      );
    }
  });

  it('declares og:image at the size the file actually is', () => {
    const cover = readPng('public/og-cover.png');
    // 🔴 A declared size that disagrees with the file is worse than no size: a scraper crops or
    // letterboxes to what it was told, so the card is silently WRONG rather than silently absent.
    // The capture came out 1199 px wide because `FIT` rounds, and was padded to 1200 for this.
    expect(cover.width, 'og-cover.png is not the width og:image:width declares').toBe(1200);
    expect(cover.height, 'og-cover.png is not the height og:image:height declares').toBe(630);
  });

  it('cuts the icon from a size the source can actually supply', () => {
    // 🔴 Both icons are DOWNSCALES of `public/assets/objects/gear.png`, which is 72x72. An icon
    // larger than its source is an upscale, and an upscaled 72 px sprite at 180 px is mush — which
    // is exactly why there is no `apple-touch-icon` here rather than a bad one.
    const source = readPng('public/assets/objects/gear.png');
    for (const [file] of REFERENCED_FILES.filter(([f]) => f.endsWith('.png') && f.includes('favicon'))) {
      const icon = readPng(file);
      expect(icon.width, `${file} is wider than the 72px sprite it is cut from`).toBeLessThanOrEqual(
        source.width,
      );
      expect(icon.width, `${file} is not square`).toBe(icon.height);
    }
  });
});
