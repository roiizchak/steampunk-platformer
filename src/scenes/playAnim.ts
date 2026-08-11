import type Phaser from 'phaser';

/**
 * Play `key` on `sprite`, in one place — the one rule stated twice was where the bug lived
 * (`enemyLayer.ts` and `GameScene.ts`'s `renderPlayer` each wrote their own copy; R10).
 *
 * Two guards, both required:
 *
 *  - **Frame-0 guard.** Phaser's `play()` stops and restarts a looping animation on every call, so
 *    calling it with the SAME key every frame never leaves frame 0. Skipped when `getName()` already
 *    matches — never `play(key, true)`, so the check is explicit and testable without a real Phaser.
 *  - **Missing-key guard (R4).** Checked HERE, at play time, not once at create time: a partial
 *    catalog means a later state can name a key nothing was ever built for (e.g. a scavenger's
 *    `death` sheet not yet packed). When the key is missing this is a no-op, so the PREVIOUS
 *    animation keeps running rather than freezing or throwing — the intended fallback while the
 *    catalog is partial, not an oversight.
 */
export function playIfChanged(sprite: Phaser.GameObjects.Sprite, key: string): void {
  if (sprite.anims.getName() === key) {
    return;
  }
  if (!sprite.scene.anims.exists(key)) {
    return;
  }
  sprite.play(key);
}
