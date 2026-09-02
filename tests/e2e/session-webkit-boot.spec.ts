/**
 * **The game boots on a non-Chromium engine.**
 *
 * ## 🔴 The defect
 *
 * On 2026-09-02 the owner sent the production link to friends. They reported a black screen. It was
 * the `BOOT REFUSED` screen, dark red on `#12100e`:
 *
 * > `audio "bed-music" did not decode (assets/audio/bed-music.ogg)`
 * > `audio "bed-ambience" did not decode (assets/audio/bed-ambience.ogg)`
 *
 * **Safari decodes no Ogg container.** The two beds were `.ogg` with a single url, `verifyAudio`
 * found neither in the cache, and `refuseToRoute` did exactly what it exists to do. The gate was
 * right. What was missing was any way to notice.
 *
 * ⚠️ **Every browser on iOS is WebKit** — Chrome, Firefox and Edge on an iPhone are Safari's engine
 * with a different icon. This was every iPhone, not a minority browser.
 *
 * ## What made it invisible
 *
 * All six other Playwright projects are Chromium, which decodes Ogg. **229 e2e tests were green
 * while the game could not start on an entire platform.** No assertion was wrong; the substrate was
 * a shared unstated assumption, and a suite cannot test the thing it stands on.
 *
 * That is the shape this file exists to break, not the Ogg bug specifically. A CSS property, a Web
 * Audio call, an `Intl` format — anything an engine can differ on reaches production unexamined.
 *
 * ## 🔴 The first version of this file was DECORATION, and the mutation is what found it
 *
 * It asserted `document.body.innerText` did not contain `BOOT REFUSED`. But `refuseToRoute` draws
 * that text with `this.add.text()` — **onto the canvas**, where no DOM query can ever see it. The
 * probe returned `''` for a refused boot and `''` for a healthy one, so M136 came back *2 passed*
 * against a build that refused on every load. Two signals replaced it, both measured on this exact
 * harness (see the numbers on each), and both go red under M136.
 *
 * ⚠️ **It runs against the PRODUCTION server.** The defect was in the shipped catalog and the
 * shipped loader; a dev-server run tests a build no player fetches. So `window.__game` is absent
 * here by design — `phase-10-production.spec.ts` asserts that absence — and nothing below waits on
 * the debug surface.
 */

import { expect, test } from '@playwright/test';

/**
 * The exact string `BootScene.refuseToRoute` writes to the console, alongside the canvas text.
 *
 * This, not the DOM, is the readable signal in a production build — and it is what actually fired
 * on the owner's friends' phones.
 */
const REFUSAL_PREFIX = '[boot] refused to route';

/**
 * PNG bytes of a screenshot that means "a real frame was drawn".
 *
 * Measured on this harness, at this viewport, on 2026-09-02:
 *
 *   - healthy title screen: **1,978,349 bytes** — a detailed lit scene, incompressible
 *   - `BOOT REFUSED`:          **62,168 bytes** — near-black with two lines of text
 *
 * A **32×** gap. 400 kB sits an order of magnitude from each side, so this is not a bound tuned to
 * one run. The technique is `prodHarness.ts`'s, for its reason: a screenshot goes through the
 * compositor, so it sees WebGL output without `preserveDrawingBuffer`.
 *
 * ⚠️ It is here because the console check alone cannot tell a healthy boot from a page where
 * **nothing ran at all** — a bundle that threw before Phaser started logs no refusal either.
 */
const DRAWN_FRAME_BYTES = 400_000;

test.describe('the shipped build boots on WebKit', () => {
  test('does not refuse to route, and draws a real frame', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (m) => {
      if (m.type() === 'error') consoleErrors.push(m.text());
    });
    const pageErrors: string[] = [];
    page.on('pageerror', (e) => pageErrors.push(String(e.message).slice(0, 300)));
    const httpFailures: string[] = [];
    page.on('response', (r) => {
      if (r.status() >= 400) httpFailures.push(`${r.status()} ${r.url()}`);
    });

    await page.goto('/index.html', { waitUntil: 'load' });

    // A canvas exists for a refused boot too, so this is a precondition, not the assertion.
    await expect
      .poll(() => page.evaluate(() => Boolean(document.querySelector('canvas'))), {
        timeout: 30_000,
        message: 'no canvas was ever created — Phaser did not start on this engine',
      })
      .toBe(true);

    // 🔴 The positive one. Poll until a real frame is on screen rather than sleeping: a refused
    // boot never crosses this floor however long it is given, so the timeout IS the refusal case.
    let bytes = 0;
    await expect
      .poll(
        async () => {
          bytes = (await page.screenshot()).length;
          return bytes;
        },
        {
          timeout: 40_000,
          intervals: [1000],
          message: 'polling for a drawn frame',
        },
      )
      .toBeGreaterThan(DRAWN_FRAME_BYTES);

    // And the negative one, read AFTER the frame so a slow refusal cannot slip in behind a pass.
    const refusals = consoleErrors.filter((e) => e.startsWith(REFUSAL_PREFIX));
    expect(
      refusals,
      `the shipped build refused to route on WebKit (frame was ${bytes} bytes)`,
    ).toEqual([]);

    // ⚠️ Both of these were silent in the incident. A 404 on an alternate produces the identical
    // screen one layer down — the catalog promising Safari a file that never reached `dist/`.
    expect(httpFailures, 'the shipped build fetched something that 4xx/5xx-ed').toEqual([]);
    expect(pageErrors, 'the bundle threw on this engine').toEqual([]);
  });

  test('every catalog cue offers a container this engine can decode', async ({ page }) => {
    await page.goto('/index.html', { waitUntil: 'load' });
    await expect
      .poll(() => page.evaluate(() => Boolean(document.querySelector('canvas'))), { timeout: 30_000 })
      .toBe(true);

    /**
     * 🔴 Read the catalog the BUILD SHIPPED and ask the browser about every url in it.
     *
     * This overlaps the test above deliberately and is not redundant: that one proves the build
     * boots, this one proves *why*, and it names the offending cue instead of leaving a 62 kB
     * screenshot to be interpreted. It also catches a cue the loader has not reached yet.
     *
     * ⚠️ `canPlayType` returns `''`, `'maybe'` or `'probably'` — never a boolean. `'maybe'` is a
     * yes; only the empty string is a no. Measured on this harness: `audio/ogg` → `''`,
     * `audio/mp4` → `'probably'`, `audio/wav` → `'probably'`.
     */
    const verdicts = await page.evaluate(async () => {
      const res = await fetch('assets/index.json');
      const catalog = (await res.json()) as {
        audio: { key: string; url: string; altUrls?: string[] }[];
      };
      const probe = document.createElement('audio');
      const typeOf = (url: string): string => {
        if (url.endsWith('.ogg') || url.endsWith('.oga')) return 'audio/ogg';
        if (url.endsWith('.m4a') || url.endsWith('.mp4') || url.endsWith('.aac')) return 'audio/mp4';
        if (url.endsWith('.mp3')) return 'audio/mpeg';
        if (url.endsWith('.wav')) return 'audio/wav';
        return '';
      };
      return catalog.audio.map((cue) => {
        const urls = [cue.url, ...(cue.altUrls ?? [])];
        const playable = urls.filter((u) => {
          const t = typeOf(u);
          return t !== '' && probe.canPlayType(t) !== '';
        });
        return { key: cue.key, urls, playable };
      });
    });

    // Vacuity guards. An empty catalog satisfies the filter below without asserting anything, and
    // an engine that claimed to play everything would make the whole case meaningless.
    expect(verdicts.length, 'the shipped catalog listed no audio at all').toBeGreaterThan(5);
    expect(
      verdicts.flatMap((v) => v.urls).filter((u) => u.endsWith('.ogg')).length,
      'no shipped url is an Ogg any more — this case then proves nothing about the engine that ' +
        'cannot decode one. Give it a fixture rather than deleting it.',
    ).toBeGreaterThan(0);
    expect(
      verdicts.flatMap((v) => v.playable).filter((u) => u.endsWith('.ogg')),
      'this WebKit reports it CAN play Ogg, so it does not stand in for Safari and this whole ' +
        'project is measuring a browser no player has',
    ).toEqual([]);

    const stranded = verdicts.filter((v) => v.playable.length === 0);
    expect(
      stranded.map((v) => `${v.key} (${v.urls.join(', ')})`),
      'this engine can decode NONE of the urls these cues offer — the state that put a BOOT ' +
        'REFUSED screen on every iPhone on 2026-09-02',
    ).toEqual([]);
  });
});
