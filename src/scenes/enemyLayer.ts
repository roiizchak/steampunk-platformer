import type Phaser from 'phaser';

import { healthBarDesc, type BarSubject } from '../render/enemyHealthBar';
import { scavengerRenderDesc, sentryRenderDesc, type EnemyRenderDesc } from '../render/enemyView';
import type { EnemySlug } from '../sim/enemies';
import type { World } from '../sim/types';
import { playIfChanged } from './playAnim';

/**
 * Draws the enemies, their health bars and the shots in flight.
 *
 * ## Why this is not in `GameScene`
 *
 * `GameScene.ts` is already one of the ten files permitted over the 400-line rule, and adding three
 * more display kinds to it would make the scene the place you go to understand enemies — which is
 * the opposite of where the decisions live. Every decision here has already been made in
 * `src/render/`: what colour, which animation key, how wide the fill. This file is the hand that
 * applies them, and it holds no rule of its own worth testing.
 *
 * ## Sprite when the art exists, Rectangle otherwise
 *
 * `enemyView` already decides an `animKey` for every state and `enemy-view.test.ts` pins them, but
 * playing a key whose texture has not been generated throws at `create()` — which lands as a hang
 * with `ready:false` and `bootError:null`, the one outcome the refuse-to-route design exists to
 * prevent *(vault 1.4)*. So `addBody` asks `scene.anims.exists(desc.animKey)`: true draws a
 * `Sprite` and plays it, false falls back to the `Rectangle` grey box. The fallback is a dated
 * temporary — `tests/unit/enemy-layer-catalog.test.ts` asserts today's shipped catalog has no enemy
 * sheets (making it legitimately reachable now) and fails once all six `enemyAnimKeys()` are
 * registered but a `Rectangle` is still drawn.
 *
 * `isSprite` runs parallel to `bodies` rather than an `instanceof` check in `sync()`, because the
 * unit test drives `EnemyLayer` against a plain mock scene, not a real `Phaser.GameObjects.Sprite`.
 *
 * `sync()`'s state-change play (criterion 5.4) routes through `playAnim.ts`'s `playIfChanged`, which
 * `GameScene.ts`'s player render also uses — ONE implementation of the frame-0 guard AND the R4
 * missing-key guard, rather than the two copies that used to drift here (R10).
 */
export class EnemyLayer {
  private readonly bodies: (Phaser.GameObjects.Rectangle | Phaser.GameObjects.Sprite)[] = [];
  private readonly isSprite: boolean[] = [];
  private bars!: Phaser.GameObjects.Graphics;
  private shots!: Phaser.GameObjects.Graphics;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly world: World,
  ) {}

  /** Build one drawable per enemy, in the same order `sync` will walk them. */
  create(): void {
    for (const sentry of this.world.enemies.sentries) {
      this.addBody(sentryRenderDesc(sentry, this.world.scale));
    }
    for (const scavenger of this.world.enemies.scavengers) {
      this.addBody(scavengerRenderDesc(scavenger, this.world.scale));
    }

    // Above the bodies so a bar is never hidden behind the enemy it describes — the mirror of the
    // 6.4 failure, arriving through depth instead of through width.
    this.bars = this.scene.add.graphics().setDepth(12);
    this.shots = this.scene.add.graphics().setDepth(11);
  }

  private addBody(desc: EnemyRenderDesc): void {
    if (this.scene.anims.exists(desc.animKey)) {
      const sprite = this.scene.add.sprite(desc.x, desc.y, desc.animKey);
      sprite.setOrigin(desc.originX, desc.originY);
      sprite.setDepth(9);
      sprite.setFlipX(desc.flipX);
      sprite.play(desc.animKey);
      this.bodies.push(sprite);
      this.isSprite.push(true);
      return;
    }
    this.bodies.push(
      this.scene.add
        .rectangle(desc.x, desc.y, desc.w, desc.h, desc.colour)
        .setOrigin(desc.originX, desc.originY)
        .setDepth(9),
    );
    this.isSprite.push(false);
  }

  /**
   * Push this tick's sim state onto the drawables.
   *
   * Bars and shots are cleared and redrawn wholesale rather than diffed. At a handful of objects
   * that is cheaper than tracking which changed, and it removes the class of bug where a killed
   * enemy's bar outlives it.
   */
  sync(): void {
    const { scale } = this.world;
    // Same order `create` used. Sentries then scavengers, in both places, so index `i` is the same
    // enemy in `bodies` as it is here — the alternative is an id on every enemy for a list that is
    // built once and never reordered.
    const subjects: [BarSubject, EnemyRenderDesc, EnemySlug][] = [];
    for (const sentry of this.world.enemies.sentries) {
      subjects.push([sentry, sentryRenderDesc(sentry, scale), 'brass-sentry']);
    }
    for (const scavenger of this.world.enemies.scavengers) {
      subjects.push([scavenger, scavengerRenderDesc(scavenger, scale), 'rust-scavenger']);
    }

    this.bars.clear();
    for (const [i, [subject, desc, slug]] of subjects.entries()) {
      const body = this.bodies[i];
      if (body === undefined) {
        continue;
      }
      body.setPosition(desc.x, desc.y);
      if (this.isSprite[i]) {
        const sprite = body as Phaser.GameObjects.Sprite;
        sprite.setFlipX(desc.flipX);
        playIfChanged(sprite, desc.animKey);
      } else {
        (body as Phaser.GameObjects.Rectangle).setFillStyle(desc.colour);
      }
      // A dead enemy stops being drawn as a threat, but its body stays: a corpse that vanishes on
      // the frame it dies gives no feedback that the kill landed.
      body.setAlpha(subject.hp > 0 ? 1 : 0.35);

      const bar = healthBarDesc(subject, slug, scale);
      this.bars.fillStyle(0x1a1512, 1).fillRect(bar.x, bar.y, bar.w, bar.h);
      if (bar.fillW > 0) {
        this.bars.fillStyle(0xc4463f, 1).fillRect(bar.x, bar.y, bar.fillW, bar.h);
      }
    }

    this.shots.clear().fillStyle(0xf2c14e, 1);
    for (const shot of this.world.projectiles) {
      this.shots.fillCircle(shot.x, shot.y, 8);
    }
  }
}
