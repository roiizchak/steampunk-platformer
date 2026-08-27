import type Phaser from 'phaser';

import { CRISP_IMAGE_RENDERING } from './constants';
import { canvasRendering } from '../render/canvasScaling';

/**
 * Applies `canvasScaling`'s decision to the real canvas, at boot and on every resize.
 *
 * ⚠️ **`index.html` says the ScaleManager owns `canvas.style` and that a second writer is the
 * mechanism behind vault 1.5's *"CSS silently contradicted the engine on every phone"*. This is a
 * second writer of exactly one property, deliberately, and the distinction is worth stating rather
 * than assuming a reader will infer it.**
 *
 * The vault defect was two writers *disagreeing*: Phaser centred with margins while CSS centred
 * with flex, and the two composed into a wrong result that looked almost right. Here there is one
 * writer of `image-rendering` **after** Phaser has had its say — `CanvasInterpolation.setCrisp()`
 * runs once at boot, this runs after it and after every resize, and nothing else in the project
 * touches the property. `assertFilteringPinned()` then reads the *rendered* result rather than the
 * intent, so if that ordering ever breaks the boot gate says so.
 *
 * Width and height are read from `getBoundingClientRect()` rather than from `style.width`, because
 * the style may be a percentage, may be unset before the first layout, and is a string. The rect is
 * what the compositor actually uses.
 */
export function applyCanvasFilter(game: Phaser.Game): void {
  const canvas = game.canvas;
  if (!canvas) return;

  // Whatever `setCrisp()` settled on in THIS browser — Chromium keeps `pixelated`, Firefox
  // `-moz-crisp-edges`. Reading it back rather than picking one keeps the crisp branch identical
  // to what Phaser would have left there, which is what the boot gate compares against.
  const current = canvas.style.getPropertyValue('image-rendering');
  const crisp = CRISP_IMAGE_RENDERING.includes(current as (typeof CRISP_IMAGE_RENDERING)[number])
    ? current
    : CRISP_IMAGE_RENDERING[CRISP_IMAGE_RENDERING.length - 1];

  const rect = canvas.getBoundingClientRect();
  const wanted = canvasRendering(crisp, canvas.width, canvas.height, rect.width, rect.height);
  if (wanted !== current) {
    canvas.style.setProperty('image-rendering', wanted);
  }
}

/**
 * Install it: once the canvas exists, and again whenever the ScaleManager resizes it.
 *
 * 🔴 A resize is not a rare event. Dragging a window between a 4K and a 1080p monitor, entering or
 * leaving fullscreen, opening dev tools, or rotating a tablet all change the scale — and the whole
 * point of this module is that the right answer *depends on that scale*. Deciding once at boot
 * would be correct until the first time anybody moved the window, which is the shape of bug that
 * gets reported as "it only does it sometimes".
 */
export function installCanvasFilter(game: Phaser.Game): void {
  const apply = (): void => applyCanvasFilter(game);
  apply();
  game.scale.on('resize', apply);
  // `Phaser.Scale.Events.RESIZE` fires on a scale-mode resize; `boot` covers the case where the
  // canvas is not yet laid out when this is called from `main.ts`, which is the normal path.
  game.events.once('ready', apply);
}
