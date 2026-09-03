import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Everything `verify-dist` asserts about the SHIPPED `index.html`: the touch-gesture rules that
 * criterion 12.13 rests on, and the tab icon and link-preview card added 2026-09-03.
 *
 * ⚠️ **Split out of `verify-dist.mjs` because that file crossed 400 lines**, not because the two
 * halves wanted separating. `tests/unit/file-size.test.ts` red the moment the page-identity block
 * landed, and this project takes the split rather than the exemption — six of them in phase 12
 * alone — because raising the size ratchet off zero opens a hole that file documents at length.
 * `index.html` is a coherent seam to cut on: everything here reads one artifact.
 *
 * Returns the problems it found. It does not throw and it does not print; the caller owns both.
 */
export function verifyIndexHtml(root) {
  const problems = [];
  // 🔴 Criterion 12.13's shipped half: the gesture rules must survive the BUILD, not only exist
  // in the source. Four CSS rules and one absent viewport attribute are the whole of what stops a
  // mobile browser claiming a drag off a control, a two-finger pinch or a double-tap before the game
  // ever sees the pointer — and until 2026-09-02 nothing in the repository asserted any of them, in
  // source or in `dist/`.
  //
  // The unit half is `tests/unit/gesture-prevention.test.ts`, which reads the SOURCE `index.html`. It
  // cannot see a build that inlines, minifies or drops the `<style>` block, and a game-source gate
  // cannot see a shipped-bytes defect *(vault 3.1)* — which is the same split the `.tmj` and audio
  // rules below are built on. Neither half can see whether the BROWSER honours the rules; that is
  // `tests/e2e/phase-12-gestures.spec.ts`, and after it, the device.
  const shippedIndex = join(root, 'dist/index.html');
  if (!existsSync(shippedIndex)) {
    // \U0001f534 An absent artifact is the failure, not the empty case \u2014 the same defect the audio
    // `?? []` had. Without this the whole gesture check vanishes silently the day `dist/index.html`
    // stops being emitted, which is exactly when it matters. Codex round 21, finding 6.
    problems.push('dist/index.html does not exist \u2014 the gesture rules cannot be checked (12.13)');
  } else {
    const html = readFileSync(shippedIndex, 'utf8');
    // 🔴 **Strip CSS comments FIRST, and read the SELECTOR BLOCK, not the file.** The first
    // version of this check asked only whether the file contained `touch-action:none` anywhere, with
    // whitespace removed. It stayed GREEN under M105 — the rule deleted from `html, body, #game`,
    // the page defenceless — because `index.html`'s own explanatory comments SHIP, and one of them
    // says *"`touch-action: none` — without it the browser claims the gesture"*. The gate was
    // reading the sentence about the rule as the rule. A gate that passes for a reason unrelated to
    // its claim is the failure this file exists to prevent, and only building the mutation said so.
    const css = html.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, '');
    const SELECTOR = 'html,body,#game{';
    const at = css.indexOf(SELECTOR);
    if (at === -1) {
      problems.push(
        'dist/index.html has no `html, body, #game` rule block — every touch-gesture rule went ' +
          'with it (12.13)',
      );
    } else {
      const block = css.slice(at, css.indexOf('}', at));
      for (const rule of [
        'touch-action:none',
        'overscroll-behavior:none',
        'user-select:none',
        '-webkit-tap-highlight-color:transparent',
      ]) {
        // Vite's minifier strips the space after the colon; the source carries it. The comparison is
        // whitespace-free so the gate is about the RULE and not about the minifier's spacing.
        //
        // \U0001f534 Matched as a DECLARATION, not a substring: `user-select:none` occurs inside
        // `-webkit-user-select:none`, so `includes` went on passing with the standard declaration
        // deleted. Codex round 21, finding 2 \u2014 the same nearby-text shape as the CSS comment.
        const declared = new RegExp(`(^|[{;])${rule.replace(/[-[\]{}()*+?.,\\^$|#]/g, '\\$&')}[;}]`);
        if (!declared.test(block)) {
          problems.push(
            `dist/index.html has lost \`${rule}\` from html/body/#game — the browser will claim ` +
              'the gesture (12.13)',
          );
        }
      }
    }
    // An ABSENCE, and deliberately so: `user-scalable=no` is the accessibility anti-pattern
    // `touch-action` was chosen to avoid. `maximum-scale` is the same attribute under another name on
    // iOS. A build that adds either has taken zoom from the whole page.
    const meta = /<meta[^>]+name="viewport"[^>]*>/.exec(html);
    if (!meta) {
      problems.push('dist/index.html has no viewport meta at all');
    } else if (/user-scalable|maximum-scale/.test(meta[0])) {
      problems.push(
        'dist/index.html disables page zoom (user-scalable/maximum-scale) — the anti-pattern ' +
          'touch-action replaced (12.13)',
      );
    }

    // The tab icon and the link-preview card, in the SHIPPED page. Added 2026-09-03; the page carried
    // neither for thirteen phases.
    //
    // 🔴 **Every failure here is silent.** An icon link pointing at a file that did not ship falls
    // back to the browser's default globe with no console error; a relative `og:image` produces no
    // card at all rather than a broken one; a build that stopped copying `public/` would take the lot
    // with it. The unit half is `tests/unit/page-identity.test.ts` over the SOURCE, and it cannot see
    // any of that — a game-source gate cannot see a shipped-bytes defect *(vault 3.1)*.
    const flat = html.replace(/\s*\n\s*/g, ' ');
    for (const [what, present] of [
      ['a 32px icon link', /<link rel="icon"[^>]*sizes="32x32"[^>]*href="\/favicon-32\.png"/.test(flat)],
      ['a 48px icon link', /<link rel="icon"[^>]*sizes="48x48"[^>]*href="\/favicon-48\.png"/.test(flat)],
      ['the .ico fallback', /<link rel="icon" href="\/favicon\.ico"/.test(flat)],
      ['a description', /<meta name="description" content="[^"]{40,}"/.test(flat)],
      ['an og:title', /<meta property="og:title" content="[^"]+"/.test(flat)],
      ['an og:description', /<meta property="og:description" content="[^"]{40,}"/.test(flat)],
      ['an ABSOLUTE og:image', /<meta property="og:image" content="https:\/\/[^"]+"/.test(flat)],
      ['an ABSOLUTE og:url', /<meta property="og:url" content="https:\/\/[^"]+"/.test(flat)],
      ['a large twitter card', /<meta name="twitter:card" content="summary_large_image"/.test(flat)],
    ]) {
      if (!present) {
        problems.push(`dist/index.html has lost ${what} — the tab and every shared link go silent`);
      }
    }

    // And the files those tags name have to have SHIPPED, byte for byte. A tag naming a missing file
    // is the whole failure mode, and it is the one nothing at runtime reports.
    for (const asset of ['favicon-32.png', 'favicon-48.png', 'favicon.ico', 'og-cover.png']) {
      const shipped = join(root, 'dist', asset);
      const source = join(root, 'public', asset);
      if (!existsSync(shipped)) {
        problems.push(`dist/${asset} did not ship, and index.html points at it`);
      } else if (!readFileSync(shipped).equals(readFileSync(source))) {
        problems.push(`dist/${asset} is not byte-identical to public/${asset}`);
      }
    }

    // 🔴 **Two properties this block did NOT have when it was first written**, and only running the
    // mutations said so. The unit half red on both; this half was green, and "the source gate owns
    // correctness, the dist gate owns survival" was the excuse available for leaving it that way.
    // It does not hold: the thing a scraper reads is the SHIPPED page against the SHIPPED image, and
    // both of these are about that pair rather than about the build.
    const declared = (key) => {
      const m = new RegExp(`<meta property="og:image:${key}" content="(\\d+)"`).exec(flat);
      return m ? Number(m[1]) : null;
    };
    const coverPath = join(root, 'dist/og-cover.png');
    if (existsSync(coverPath)) {
      // PNG IHDR: width and height are big-endian uint32 at offsets 16 and 20.
      const png = readFileSync(coverPath);
      const actual = { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
      for (const key of ['width', 'height']) {
        if (declared(key) !== actual[key]) {
          // A declared size that disagrees with the file is worse than none: the scraper crops or
          // letterboxes to what it was told, so the card is silently WRONG rather than absent.
          problems.push(
            `og:image:${key} says ${declared(key)} and dist/og-cover.png is ${actual[key]}`,
          );
        }
      }
    }

    // The one sentence has to be the SAME sentence in all three places a reader can meet it, and
    // drift is the only way three copies ever go wrong. A length floor cannot see drift.
    const described = ['<meta name="description"', '<meta property="og:description"', '<meta name="twitter:description"']
      .map((tag) => {
        const m = new RegExp(`${tag} content="([^"]*)"`).exec(flat);
        return m ? m[1] : null;
      });
    if (described.some((d) => d === null)) {
      problems.push('dist/index.html is missing one of the three description tags');
    } else if (new Set(described).size !== 1) {
      problems.push(
        'the three description tags in dist/index.html have drifted apart — a reader meets a ' +
          'different sentence depending on which client renders the link',
      );
    }
  }

  return problems;
}
