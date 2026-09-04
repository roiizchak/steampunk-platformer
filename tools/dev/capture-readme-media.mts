/**
 * The three files the README shows, captured from the LIVE production build.
 *
 * ```
 * node tools/dev/capture-readme-media.mts            # the deployed alias
 * node tools/dev/capture-readme-media.mts http://localhost:4173/
 * ```
 *
 * Writes `docs/media/hero.png`, `gameplay.gif` and `gameplay.mp4`. Nothing else in the repository
 * depends on it — it exists so that the README's own media is reproducible rather than three files
 * somebody once made and nobody can make again. That is the exact shortfall `ASSETS-LICENSE.md`
 * already confesses to about `_generated/`, and repeating it in the README would be a smaller
 * version of the same mistake.
 *
 * ## Why this is not a Playwright spec
 *
 * It captures marketing material against a URL on the internet. Making it a spec would put it in
 * `npm run test:e2e`, where it would share port 5173 and `test-results/` with wall-clock-bounded
 * perf specs that read a busy box as a broken game (CLAUDE.md §5). It runs its own browser, alone.
 *
 * ## Why it borrows from `tests/e2e/`
 *
 * ⚠️ **`window.__game` does not exist in `dist/`** — it is installed behind `import.meta.env.DEV`
 * and Phase 10 criterion 10.2 exists to prove its absence. So every readiness helper in
 * `tests/e2e/` that waits on `__game.ready` is useless against production, and the two that are not
 * are the ones imported below:
 *
 *  - `dismissTitleProduction` — the title -> menu -> level route, driven by pixels because pixels
 *    are the only signal production ships. Read `prodTitle.ts` before touching the route.
 *  - `playToExit`'s shape — hold RIGHT and keep hopping, position-blind and self-synchronising.
 *    Reimplemented here rather than imported because this one is bounded by *recording seconds*
 *    rather than by completion, and it presses attack for the camera.
 *
 * Run under Node's built-in type stripping (Node 24), which is why this is `.mts` and can import
 * the `.ts` helpers directly.
 */

import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { dismissTitleProduction } from '../../tests/e2e/prodTitle.ts';

/** The alias that answers 200. The immutable deployment URL sits behind Deployment Protection. */
const DEFAULT_URL = 'https://steampunk-platformer-jet.vercel.app/';

/** The Phase 8 save key. `src/game/save.ts` owns the schema; this only needs its presence. */
const SAVE_KEY = 'steampunk.progress';

/**
 * A drawn frame's PNG is at least this many bytes — the same floor `prodHarness.ts` uses, and for
 * the same reason: the save key is `GameScene.create()`'s FIRST statement, so a build that threw on
 * line 2 still satisfies "the key appeared". A blank canvas compresses to a few kB.
 */
const DRAWN_FRAME_MIN_BYTES = 100_000;

/**
 * ## The two clips, and why there are two
 *
 * ⚠️ **GIF is a terrible container for this footage, and it was measured rather than assumed.** A
 * side-scroller with a parallax backdrop changes every pixel of every frame, so GIF's inter-frame
 * compression finds nothing to keep. The first capture — 14 s, 960 px, 15 fps — came out at
 * **77 MB**. Measured against the same recording, holding quality roughly level:
 *
 * | | size |
 * |---|---|
 * | GIF 720 px · 12 fps · 8 s | 15.7 MB |
 * | GIF 640 px · 12 fps · 8 s | 12.7 MB |
 * | GIF 480 px · 12 fps · 6 s | **6.1 MB** |
 * | **MP4 1280 px · 12 s · crf 22** | **4.7 MB** |
 *
 * MP4 is smaller than the GIF at two and a half times the width and twice the length. `dither=none`
 * was tried on the theory that dither noise breaks GIF's runs and made it *larger*, so the bayer
 * dither stays.
 *
 * So: the GIF is the small inline loop, because a relative `.mp4` path in a README renders as a
 * dead link rather than a player and something has to actually appear; the MP4 sits beside it
 * carrying the quality, linked rather than embedded.
 */
const GIF_SECONDS = 5;
const GIF_WIDTH = 480;
const GIF_FPS = 10;

const MP4_SECONDS = 12;
const MP4_WIDTH = 1280;
/** Constant-quality, not bitrate. 25 is visually clean on flat pixel art without paying for grain. */
const MP4_CRF = 25;

/**
 * The still is quantised to a 256-colour palette before it is written. Straight out of the
 * compositor it is 2.4 MB; scaled to 1600 px and quantised it is **675 kB**, and on this art the
 * difference is invisible — it is already a limited-palette pixel style, so the palette is not being
 * imposed on it so much as recovered. A README image is never displayed above ~900 px anyway.
 */
const HERO_WIDTH = 1600;
const HERO_COLORS = 256;

/**
 * The video is recorded through a HEADED browser on the real GPU. Headless Chromium falls back to
 * SwiftShader, which this project has already measured at ~21x slower than the real frame rate
 * (CLAUDE.md §5) — a recording made there is slow motion, not gameplay.
 *
 * A headed window has to fit on the machine's actual screen, which is why the recording view is
 * 1280 x 720 and not the 1920 x 1080 design view. The still, which needs no frame rate at all, is
 * taken from a second headless context at full size.
 */
const VIEW = { width: 1280, height: 720 };
const HERO_VIEW = { width: 1920, height: 1080 };
const OUT = resolve(import.meta.dirname, '../../docs/media');

const args = process.argv.slice(2);
const reuse = takeFlag('--from');
const url = args.find((a) => !a.startsWith('--')) ?? DEFAULT_URL;
const work = mkdtempSync(join(tmpdir(), 'readme-media-'));
mkdirSync(OUT, { recursive: true });

if (reuse === undefined) await captureHero();
const { webm, offsetSec } =
  reuse === undefined
    ? await captureVideo()
    : { webm: reuse, offsetSec: Number(takeFlag('--offset') ?? 0) };

toGif(webm, offsetSec);
toMp4(webm, offsetSec);
if (args.includes('--keep')) console.log(`kept ${webm} (offset ${offsetSec.toFixed(2)}s)`);
else rmSync(work, { recursive: true, force: true });

for (const name of ['hero.png', 'gameplay.gif', 'gameplay.mp4']) {
  const kb = (statSync(join(OUT, name)).size / 1024).toFixed(0);
  console.log(`docs/media/${name}  ${kb} kB`);
}

/**
 * The still, at the full 1920 x 1080 design view, taken before a single key is pressed: the courier
 * idle at the spawn, the parallax skyline behind, the HUD and the controls banner as a player
 * genuinely sees them. It is the one composition this script does not have to fight the physics for.
 *
 * Headless is fine HERE and only here — a screenshot has no frame rate to lose to SwiftShader.
 */
async function captureHero(): Promise<void> {
  const browser = await chromium.launch();
  const page = await openGame(await browser.newContext({ viewport: HERO_VIEW }));
  await page.waitForTimeout(900);
  const raw = join(work, 'hero-raw.png');
  await page.screenshot({ path: raw });
  await browser.close();

  const palette = join(work, 'hero-palette.png');
  const scale = `scale=${HERO_WIDTH}:-1:flags=lanczos`;
  ffmpeg(['-i', raw, '-vf', `${scale},palettegen=max_colors=${HERO_COLORS}:stats_mode=single`,
          '-y', palette]);
  ffmpeg(['-i', raw, '-i', palette,
          '-lavfi', `${scale}[x];[x][1:v]paletteuse=dither=sierra2_4a`,
          '-y', join(OUT, 'hero.png')]);
}

/**
 * The gameplay recording. Returns the raw webm and how far into it the play starts — Playwright
 * records a whole CONTEXT, so the boot, the title screen and the level menu are all in the file
 * ahead of the first frame anybody wants to see.
 */
async function captureVideo(): Promise<{ webm: string; offsetSec: number }> {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    viewport: VIEW,
    recordVideo: { dir: work, size: VIEW },
  });
  const started = Date.now();
  const page = await openGame(context);
  const playStarted = Date.now();

  /**
   * Hold RIGHT and keep hopping, the same shape as `prodHarness.playToExit` — position-blind on
   * purpose, because `dist/` exposes no position to steer by. The `waitForTimeout`s are input
   * DURATIONS (how long the jump button is held), not state waits; `prodHarness.ts` records why
   * that deviation from CLAUDE.md §5 is the honest one for a variable-height jump.
   *
   * The attack presses are the only addition: a courier that never swings reads as a walking demo.
   */
  await page.keyboard.down('ArrowRight');
  try {
    let hops = 0;
    // Drive for the LONGER of the two clips; the GIF takes the first `GIF_SECONDS` of the same run.
    while (Date.now() - playStarted < MP4_SECONDS * 1000) {
      await page.keyboard.down('Space');
      await page.waitForTimeout(500);
      await page.keyboard.up('Space');
      await page.waitForTimeout(60);
      hops += 1;
      if (hops % 3 === 0) {
        await page.keyboard.press('f');
        await page.waitForTimeout(140);
      }
    }
  } finally {
    await page.keyboard.up('ArrowRight');
  }

  const video = page.video();
  await context.close();
  await browser.close();
  const path = video === null ? findWebm(work) : await video.path();
  return { webm: path, offsetSec: (playStarted - started) / 1000 };
}

/** Boot the production build in a fresh context and drive it as far as a running level. */
async function openGame(context: import('@playwright/test').BrowserContext) {
  const page = await context.newPage();

  // Before any page script: a clean save, so "the key exists" means THIS boot reached a level.
  await page.addInitScript((key: string) => {
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* a storage-less context is not this script's business */
    }
  }, SAVE_KEY);

  await page.goto(url, { waitUntil: 'commit' });
  await page.waitForFunction((k) => window.localStorage.getItem(k) !== null, SAVE_KEY, {
    timeout: 60_000,
  });

  const frame = await page.screenshot();
  if (frame.length < DRAWN_FRAME_MIN_BYTES) {
    throw new Error(
      `the save key appeared but the canvas is blank (${frame.length} B < ` +
        `${DRAWN_FRAME_MIN_BYTES} B) — create() wrote the save on its first line and then died.`,
    );
  }

  await dismissTitleProduction(page);
  return page;
}

/**
 * webm -> GIF, two passes. A single-pass GIF gets the 216-colour web palette and turns a sooty
 * Victorian skyline into banding; `palettegen` reads the actual footage first.
 */
function toGif(source: string, offsetSec: number): void {
  const palette = join(work, 'palette.png');
  const scale = `fps=${GIF_FPS},scale=${GIF_WIDTH}:-1:flags=lanczos`;
  const window_ = ['-ss', offsetSec.toFixed(2), '-t', String(GIF_SECONDS), '-i', source];

  ffmpeg([...window_, '-vf', `${scale},palettegen=stats_mode=diff`, '-y', palette]);
  ffmpeg([
    ...window_,
    '-i', palette,
    '-lavfi', `${scale}[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=3`,
    '-loop', '0', '-y', join(OUT, 'gameplay.gif'),
  ]);
}

/**
 * webm -> MP4. `yuv420p` because anything else fails to decode in Safari and on most phones, and
 * `+faststart` puts the index at the front so it can start playing before it has finished
 * downloading. No audio track: the recording has none.
 */
function toMp4(source: string, offsetSec: number): void {
  ffmpeg([
    '-ss', offsetSec.toFixed(2), '-t', String(MP4_SECONDS), '-i', source,
    '-c:v', 'libx264', '-preset', 'slow', '-crf', String(MP4_CRF),
    '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
    '-vf', `scale=${MP4_WIDTH}:-2`, '-an', '-y', join(OUT, 'gameplay.mp4'),
  ]);
}

function ffmpeg(argv: string[]): void {
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', ...argv], { stdio: 'inherit' });
}

/** `--from <path>` reuses an already-recorded webm, so the GIF settings can be tuned without replaying. */
function takeFlag(name: string): string | undefined {
  const i = args.indexOf(name);
  return i === -1 ? undefined : args[i + 1];
}

/** Playwright normally hands back the path; this is the fallback when `page.video()` is null. */
function findWebm(dir: string): string {
  const hit = readdirSync(dir).find((f) => f.endsWith('.webm'));
  if (hit === undefined) throw new Error(`no video was recorded into ${dir}`);
  return join(dir, hit);
}
