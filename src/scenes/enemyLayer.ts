import type Phaser from 'phaser';

import { flinchOffset, hitFlashAlpha, impactOf, ticksSinceHit } from '../render/effects';
import { healthBarDesc, type BarSubject } from '../render/enemyHealthBar';
import { scavengerRenderDesc, sentryRenderDesc, type EnemyRenderDesc } from '../render/enemyView';
import { interpolatedPosition, type Point } from '../render/interpolate';
import type { EnemySlug } from '../sim/enemies';
import type { Freezable } from '../sim/hitstop';
import type { World } from '../sim/types';
import { playIfChanged } from './playAnim';
import { applyHitFlash } from './spriteFlash';

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
 * temporary. ⚠️ **It said "today's shipped catalog has no enemy sheets" until 2026-08-14, and that
 * has been false since session 7** — all six `enemyAnimKeys()` are registered now (`index.json`
 * carries both scavenger loops, both death sheets, sentry `idle` and sentry `fire`), so the
 * `Rectangle` path is no longer legitimately reachable in production and exists for the grey-box
 * fixtures and the unit suite's mock scene. `tests/unit/enemy-layer-catalog.test.ts` is what says
 * so, and it fails if a `Rectangle` is drawn for a key the catalog registers.
 *
 * `isSprite` runs parallel to `bodies` rather than an `instanceof` check in `sync()`, because the
 * unit test drives `EnemyLayer` against a plain mock scene, not a real `Phaser.GameObjects.Sprite`.
 *
 * `sync()`'s state-change play (criterion 5.4) routes through `playAnim.ts`'s `playIfChanged`, which
 * `GameScene.ts`'s player render also uses — ONE implementation of the frame-0 guard AND the R4
 * missing-key guard, rather than the two copies that used to drift here (R10).
 *
 * ## 🔴 Enemies are drawn BETWEEN ticks, and until 2026-08-14 only the player was
 *
 * Session 9 fixed the player's "ghost" by blending its drawn position across the leftover
 * accumulator (`src/render/interpolate.ts`). **The enemies were never given the same treatment**, so
 * they kept being drawn at raw tick positions: on a 240 Hz display that is three identical frames
 * followed by a jump, which is the exact defect the player no longer has.
 *
 * That is why re-timing the scavenger's chase to plant its feet did not fix the complaint. Foot
 * slide and tick-stepping are two different defects that look alike at a glance, and the second one
 * had become *more* visible once the first was gone from the character standing next to it — the
 * user's words were *"not smooth like my character"*, which names the comparison exactly.
 *
 * `snapshot()` is the other half and `GameScene` must call it in the same place it captures
 * `prevPlayer`: immediately before the LAST tick of a batch. Both halves live here rather than in
 * the scene so the sentries-then-scavengers ordering has ONE definition *(vault 5.3)* — a snapshot
 * walked in a different order than the sync would blend each enemy toward another enemy's position.
 */
export class EnemyLayer {
  private readonly bodies: (Phaser.GameObjects.Rectangle | Phaser.GameObjects.Sprite)[] = [];
  private readonly isSprite: boolean[] = [];
  /**
   * Each enemy's position immediately before the most recent tick, in subject order.
   *
   * `null` until the first `snapshot()`, which is the honest answer on the first frame — the same
   * contract `prevPlayer` has, and `interpolatedPosition` returns `cur` for it rather than guessing.
   * Plain copies, not references: the sim mutates enemies in place, so a reference would make
   * `prev` and `cur` the same object and the blend a silent no-op.
   */
  private prevPositions: Point[] | null = null;
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
    // FIX 1: `desc.animKey` is transient (an enemy's current action), so a chasing scavenger
    // created while `chase` is uncatalogued must not become a Rectangle forever. Try the slug's
    // always-shipped `fallbackAnimKey` before giving up — a body is a Sprite whenever the slug has
    // ANY catalogued sheet. `playIfChanged` (sync) still no-ops on the missing key, so the sprite
    // just keeps playing whichever key it was actually created on.
    const key = this.scene.anims.exists(desc.animKey) ? desc.animKey : desc.fallbackAnimKey;
    if (this.scene.anims.exists(key)) {
      const sprite = this.scene.add.sprite(desc.x, desc.y, key);
      sprite.setOrigin(desc.originX, desc.originY);
      sprite.setDepth(9);
      sprite.setFlipX(desc.flipX);
      sprite.play(key);
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
   * Every enemy this frame, in the ONE order `create`, `snapshot` and `sync` all walk.
   *
   * Sentries then scavengers, decided in a single place, so index `i` is the same enemy in
   * `bodies`, in `prevPositions` and here — the alternative is an id on every enemy for a list that
   * is built once and never reordered.
   */
  private subjects(): [BarSubject & Freezable, EnemyRenderDesc, EnemySlug][] {
    const { scale } = this.world;
    const out: [BarSubject & Freezable, EnemyRenderDesc, EnemySlug][] = [];
    for (const sentry of this.world.enemies.sentries) {
      out.push([sentry, sentryRenderDesc(sentry, scale), 'brass-sentry']);
    }
    for (const scavenger of this.world.enemies.scavengers) {
      out.push([scavenger, scavengerRenderDesc(scavenger, scale), 'rust-scavenger']);
    }
    return out;
  }

  /**
   * Record where every enemy is RIGHT NOW, to be blended from on the frames that follow.
   *
   * Called by `GameScene` immediately before the last tick of a batch — the same seam and the same
   * reasoning as `prevPlayer`. Snapshotting before the whole batch would blend across every tick it
   * drained and add a frame of lag on any healthy 30 Hz frame (Codex plan review, finding 1).
   */
  snapshot(): void {
    this.prevPositions = this.subjects().map(([, desc]) => ({ x: desc.x, y: desc.y }));
  }

  /**
   * Push this tick's sim state onto the drawables, drawn `alpha` of the way from the last tick.
   *
   * `alpha` comes from `renderAlpha(accumulatorMs)` — the same blend factor the player uses, from
   * the same accumulator, so the two never disagree about what "now" means on screen.
   *
   * Bars and shots are cleared and redrawn wholesale rather than diffed. At a handful of objects
   * that is cheaper than tracking which changed, and it removes the class of bug where a killed
   * enemy's bar outlives it.
   */
  sync(alpha: number): void {
    const { scale } = this.world;
    const tick = this.world.tickCount;
    const facing = this.world.player.facing;
    const subjects = this.subjects();

    // Growth path: a dev spawn (or anything else that appends after `create()`) has no body yet.
    // Building it here — rather than leaving the `continue` below to skip it forever — is what
    // stops a late-appended enemy from silently missing both its body and its health bar.
    for (let i = this.bodies.length; i < subjects.length; i++) {
      this.addBody(subjects[i]![1]);
    }

    this.bars.clear();
    for (const [i, [subject, desc, slug]] of subjects.entries()) {
      const body = this.bodies[i];
      if (body === undefined) {
        continue;
      }
      // 🔴 Between the last two ticks, not at the current one — see this class's header. `prev` is
      // read per index from the snapshot taken before the last tick; a body appended since then
      // (the dev fleet) has no entry, and `interpolatedPosition` draws it at `cur`, which is right:
      // a spawn is a teleport, and there is nothing to blend from.
      const drawn = interpolatedPosition(this.prevPositions?.[i] ?? null, desc, alpha);
      // 🔴 Phase 9's per-sprite feedback, the enemy half. `spriteFeedback.ts` decides, this applies.
      //
      // Thrown along the PLAYER's facing, not its own: the blow comes from the player, which is the
      // same argument `impactSparks(body.x, body.y, w.player.facing, impact)` already makes one file
      // over. And `playerHurt` is excluded because a scavenger's own claw calls
      // `freezePair(player, scavenger, 'playerHurt', …)` — that freeze makes the scavenger the
      // ATTACKER, and flinching the thing that just hit you reads as it being hit.
      const hit = this.hitClass(subject);
      const off = hit === null ? null : flinchOffset(ticksSinceHit(subject, tick), hit, facing);
      const bodyX = drawn.x + (off?.dx ?? 0);
      const bodyY = drawn.y + (off?.dy ?? 0);
      body.setPosition(bodyX, bodyY);
      if (this.isSprite[i]) {
        const sprite = body as Phaser.GameObjects.Sprite;
        sprite.setFlipX(desc.flipX);
        playIfChanged(sprite, desc.animKey);
        // The same `applyHitFlash` the player is drawn with — one definition of "what a hit flash
        // looks like", never two that agree on the happy path. A `Rectangle` fallback has no Tint
        // component at all (Phase 2's `setFlipX` lesson), which is why this is inside the sprite
        // branch rather than guarded by a second `in` check.
        applyHitFlash(sprite, hit === null ? 0 : hitFlashAlpha(ticksSinceHit(subject, tick), hit));
      } else {
        (body as Phaser.GameObjects.Rectangle).setFillStyle(desc.colour);
      }
      // A dead enemy stops being drawn as a threat, but its body stays: a corpse that vanishes on
      // the frame it dies gives no feedback that the kill landed.
      //
      // 🔴 The fade must not start until the death animation has FINISHED. It used to key on `hp`
      // alone, which meant the fade began on the exact frame the death clip started — so the whole
      // ten-frame KO played at 35 % opacity and was very nearly invisible against `level-01`'s
      // background. Found by watching it, not by a test: the frame sampler happily reported 10 of
      // 10 poses painted, because they WERE painted, just barely visible. Vault 9.4 one layer over
      // — "drawn" and "seen" are not the same measurement.
      //
      // Keyed on the death animation still running, NOT merely on something running. ⚠️ The reason
      // given here was "a dead sentry has no `death` sheet in the catalog" — true when written and
      // **false since session 7**, which packed `brass-sentry-death`. The check is still right, and
      // for a better reason: `death` is a ONE-SHOT, so once it finishes `isPlaying` goes false while
      // the corpse stays on screen. Testing `isPlaying` alone would hold it at full alpha forever,
      // and testing "any animation" would do the same for a body that fell back to a looping key.
      body.setAlpha(subject.hp > 0 || this.playingDeath(i, desc) ? 1 : 0.35);

      // The bar rides the DRAWN body, not the sim one. `healthBarDesc` is positioned from the
      // enemy's tick position, so without this shift the bar would sit still while the body it
      // describes slides under it — the interpolation defect reintroduced one layer up, and more
      // obvious than the original because the two are inches apart on screen.
      // The FLINCH is included: the offset displaces the whole enemy for a few ticks, and a bar that
      // stayed on the sim position while the body it describes stepped out from under it is the
      // interpolation defect above reintroduced by a different route.
      const bar = healthBarDesc(subject, slug, scale);
      const barX = bar.x + (bodyX - desc.x);
      const barY = bar.y + (bodyY - desc.y);
      this.bars.fillStyle(0x1a1512, 1).fillRect(barX, barY, bar.w, bar.h);
      if (bar.fillW > 0) {
        this.bars.fillStyle(0xc4463f, 1).fillRect(barX, barY, bar.fillW, bar.h);
      }
    }

    // 🔴 Shots are deliberately NOT interpolated, and it is a decision rather than an omission.
    // A projectile is created and destroyed by the sim, so `world.projectiles[i]` is not the same
    // shot from tick to tick — index-matched blending would slide a NEW bolt out of the position a
    // DIFFERENT one occupied, which is worse than the stepping it would remove. Doing it properly
    // needs an id per shot, which is `projectileView.ts` (W16), still unbuilt. At
    // `projectileSpeed` 9 px/tick the step is under a tenth of the 96 px grid, against the 18 px a
    // chasing scavenger covers, so this is the smallest of the three by some distance.
    this.shots.clear().fillStyle(0xf2c14e, 1);
    for (const shot of this.world.projectiles) {
      this.shots.fillCircle(shot.x, shot.y, 8);
    }
  }

  /**
   * Is body `i` currently playing its own death clip?
   *
   * Both halves are load-bearing. `getName() === desc.animKey` pins it to the DEATH key rather
   * than to "an animation is running" — a dead enemy whose death sheet is not in the catalog keeps
   * its previous looping animation, and that must still fade. `isPlaying` goes false when a
   * one-shot completes (`loop: false` packs as `repeat: 0`), which is what ends the window.
   *
   * A Rectangle fallback has no `anims` at all and reports false, so it fades immediately — the
   * behaviour before this existed, which is right: there is no death animation to wait for.
   */
  /**
   * The impact class this enemy should REACT to, or `null`.
   *
   * `light` and `lethal` are hits it took from the player. `playerHurt` is deliberately excluded:
   * `freezePair` freezes both bodies, so a scavenger that claws the player carries a `playerHurt`
   * freeze of its own — it is the attacker in that exchange, and flinching it would draw the blow
   * backwards. `undefined` (no class resolves) is the never-hit and zero-length-freeze cases.
   */
  private hitClass(subject: Readonly<Freezable>): 'light' | 'lethal' | null {
    const impact = impactOf(subject, this.world.hitstopScale);
    return impact === 'light' || impact === 'lethal' ? impact : null;
  }

  private playingDeath(i: number, desc: EnemyRenderDesc): boolean {
    if (!this.isSprite[i]) {
      return false;
    }
    const anims = (this.bodies[i] as Phaser.GameObjects.Sprite).anims;
    return anims.getName() === desc.animKey && anims.isPlaying;
  }
}
