/**
 * **Every shipped audio cue is playable on Safari.**
 *
 * ## 🔴 The defect
 *
 * On 2026-09-02 the owner sent the production link to friends. They reported a black screen. It was
 * the `BOOT REFUSED` overlay:
 *
 * > `audio "bed-music" did not decode (assets/audio/bed-music.ogg)`
 * > `audio "bed-ambience" did not decode (assets/audio/bed-ambience.ogg)`
 *
 * **Safari decodes no Ogg container.** The two beds were `.ogg` with a single url, `verifyAudio`
 * found neither in the cache, and `refuseToRoute` did exactly what it exists to do. ⚠️ Every browser
 * on iOS is WebKit, so this was every iPhone, not a minority browser.
 *
 * ## Two gates for two different lies
 *
 * `session-webkit-boot.spec.ts` runs the shipped build in real WebKit — the strongest evidence, and
 * the one that would have caught it. It is also slow and needs a browser.
 *
 * This file is the cheap one and it asserts something the e2e cannot: that the rule holds for the
 * bytes on disk, in milliseconds, on every `npm test`. The two overlap deliberately — the e2e can
 * only fail after a build, and a rule with no fast gate is a rule nobody runs.
 */

import { describe, expect, it } from 'vitest';

import catalog from '../../public/assets/index.json';
import type { AssetCatalog } from '../../src/game/assetCatalog';
import { describeCatalogProblem, needsAlternate } from '../../src/game/assetCatalog';

/**
 * The audio files that actually exist on disk, as catalog-relative urls.
 *
 * ⚠️ `import.meta.glob`, not `node:fs`. This project has no `@types/node` and adding one is a
 * STOP-and-ask; the glob is also how `playwright-projects.test.ts` reads the repo, so this is the
 * house idiom rather than a workaround.
 */
const SHIPPED_AUDIO = new Set(
  Object.keys(import.meta.glob('../../public/assets/audio/*', { eager: false })).map((path) =>
    path.replace('../../public/', ''),
  ),
);

/** Containers Safari is known to decode. Everything else owes an alternate from this list. */
const SAFARI_PLAYS = ['.wav', '.m4a', '.mp3', '.mp4', '.aac', '.caf'];

const playableOnSafari = (url: string): boolean =>
  SAFARI_PLAYS.some((ext) => url.toLowerCase().split(/[?#]/)[0]!.endsWith(ext));

describe('the shipped catalog can be played on Safari', () => {
  it('offers every cue in at least one container Safari decodes', () => {
    // 🔴 The assertion the incident is about, against the file that actually ships. Stated over the
    // whole catalog rather than over the two beds, because "the beds are fixed" is a fact about
    // today and "every cue is playable" is the rule.
    const stranded = catalog.audio
      .filter((cue) => ![cue.url, ...((cue as { altUrls?: string[] }).altUrls ?? [])].some(playableOnSafari))
      .map((cue) => cue.key);
    expect(
      stranded,
      'these cues offer nothing Safari can decode; every browser on iOS is WebKit, so this is a ' +
        'BOOT REFUSED screen on every iPhone',
    ).toEqual([]);
  });

  it('is not vacuous — the catalog really has cues, and one really is an Ogg', () => {
    // ⚠️ Without this the case above passes on an empty list, and passes just as well if every url
    // became a `.wav` and `needsAlternate` stopped being exercised at all.
    expect(catalog.audio.length, 'the catalog lists no audio').toBeGreaterThan(5);
    expect(
      catalog.audio.filter((c) => needsAlternate(c.url)).length,
      'no shipped cue needs an alternate any more — if the beds were re-encoded, this file still ' +
        'has to prove the RULE, so give it a fixture rather than deleting it',
    ).toBeGreaterThan(0);
  });

  it('ships the alternate FILES, not just the promise of them', () => {
    // 🔴 One layer down from the original defect and identical on screen. A catalog that names
    // `bed-music.m4a` while the file is absent makes Phaser pick it (the browser says it can play
    // `.m4a`), the fetch 404s, nothing decodes, and the iPhone gets the same refusal — while every
    // Chromium still takes the `.ogg` and looks perfectly healthy. `verify-dist.mjs` checks the
    // built copy; this checks the source, so the two failures are told apart.
    expect(SHIPPED_AUDIO.size, 'the glob found no audio files at all').toBeGreaterThan(5);
    const missing: string[] = [];
    for (const cue of catalog.audio) {
      for (const alt of (cue as { altUrls?: string[] }).altUrls ?? []) {
        if (!SHIPPED_AUDIO.has(alt)) missing.push(`${cue.key} -> ${alt}`);
      }
    }
    expect(missing, 'the catalog promises alternates that are not in public/').toEqual([]);
    // And the primaries too, or the glob could be matching a directory nobody ships from.
    expect(
      catalog.audio.filter((c) => !SHIPPED_AUDIO.has(c.url)).map((c) => c.key),
      'the catalog names primary urls that are not in public/',
    ).toEqual([]);
  });
});

/** `describeCatalogProblem` typed for fixtures: every case here feeds it a deliberately odd shape. */
const refusalFor = (c: Record<string, unknown>): string | null =>
  describeCatalogProblem(c as unknown as AssetCatalog);

describe('the catalog validator refuses an Ogg with no alternate', () => {
  /** A minimal well-formed catalog, so each case below changes exactly one thing. */
  const base = (): Record<string, unknown> => ({
    images: [{ key: 'i', url: 'assets/i.png' }],
    levels: [{ key: 'l', url: 'assets/l.tmj' }],
    sheets: [
      {
        key: 's',
        url: 'assets/s.png',
        frameWidth: 1,
        frameHeight: 1,
        frameCount: 1,
        simTicks: 1,
        fps: 1,
        loop: true,
        derivedFrom: 'sim',
      },
    ],
    audio: [{ key: 'a', url: 'assets/a.wav', gain: 1, loop: false }],
  });

  const withAudio = (cue: Record<string, unknown>): Record<string, unknown> => ({
    ...base(),
    audio: [cue],
  });

  it('accepts the baseline, so a refusal below means the CHANGE was refused', () => {
    // ⚠️ Without this, every "returns a problem" case could be passing because the fixture is
    // malformed for some unrelated reason — a refusal is only evidence if the baseline is accepted.
    expect(refusalFor(base())).toBeNull();
  });

  it('refuses an .ogg with no altUrls, and says why in terms a reader can act on', () => {
    const problem = refusalFor(
      withAudio({ key: 'bed', url: 'assets/bed.ogg', gain: 1, loop: true }),
    );
    expect(problem, 'an Ogg with no alternate was accepted').not.toBeNull();
    expect(problem).toContain('bed');
    expect(problem, 'the message does not say what is wrong with it').toMatch(/Safari|iPhone|iOS/);
  });

  it('accepts the same .ogg once it carries one', () => {
    expect(
      refusalFor(
        withAudio({ key: 'bed', url: 'assets/bed.ogg', gain: 1, loop: true, altUrls: ['assets/bed.m4a'] }),
      ),
    ).toBeNull();
  });

  it('refuses an alternate that is ITSELF undecodable — the fix that fixes nothing', () => {
    // 🔴 `.ogg` with an `.oga` alternate satisfies "has altUrls" and gains no browser whatsoever.
    // A rule stated as "must have a fallback" rather than "must gain a browser" is satisfiable by
    // a change that leaves every iPhone exactly where it was.
    const problem = refusalFor(
      withAudio({ key: 'bed', url: 'assets/bed.ogg', gain: 1, loop: true, altUrls: ['assets/bed.oga'] }),
    );
    expect(problem, 'an Ogg alternate to an Ogg was accepted as a fallback').not.toBeNull();
    expect(problem).toContain('bed');
  });

  it('refuses a malformed altUrls rather than ignoring it', () => {
    for (const altUrls of [[], '', 'assets/bed.m4a', [''], [42]]) {
      expect(
        refusalFor(
          withAudio({ key: 'bed', url: 'assets/bed.wav', gain: 1, loop: false, altUrls }),
        ),
        `altUrls ${JSON.stringify(altUrls)} was accepted`,
      ).not.toBeNull();
    }
  });

  it('leaves a cue with no altUrls at all alone — the field stays optional for .wav', () => {
    // The nine SFX are `.wav`, which Safari decodes. Requiring the field everywhere would be a rule
    // about a format rather than about a browser, and it would make the message meaningless.
    expect(refusalFor(withAudio({ key: 'sfx', url: 'assets/s.wav', gain: 1, loop: false })))
      .toBeNull();
  });
});

describe('needsAlternate', () => {
  it('names the containers no Safari decodes, and only those', () => {
    for (const url of ['a/b.ogg', 'a/b.OGG', 'a/b.oga', 'a/b.webm', 'a/b.ogg?v=2', 'a/b.ogg#x']) {
      expect(needsAlternate(url), url).toBe(true);
    }
    for (const url of ['a/b.wav', 'a/b.m4a', 'a/b.mp3', 'a/b.mp4', 'a/oggy.wav']) {
      expect(needsAlternate(url), url).toBe(false);
    }
  });
});
