import Phaser from 'phaser';
import { circleHitsRect, rectsOverlap, type HitBox } from '../../combat';
import { grenade, palette, sandbag } from '../../constants';
import type { GroundAt } from '../../campaign/ground';
import type { SandbagMark } from '../../types/sandbag';
import { ruinVariants, sandbagBreakKey, sandbagIdleKey, sandbagRuinKey } from '../../fenceSheet';
import { fieldScale, fitScale, type FrameLayout } from '../../layout';
import { Debris, onFace } from './debris';
import { paintSeat } from './seat';

type InkRect = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

type Pile = {
  mark: SandbagMark;
  hp: number;
  flash: number;
  alive: boolean;
  breaking: boolean;
  gone: boolean;
  hit: InkRect | null;
  variant: number;
  sprite: Phaser.GameObjects.Sprite;
  seat: Phaser.GameObjects.Graphics;
  seatSig: string;
};

/**
 * Мешки на дороге. Стену у ног не закрывают.
 * Секции одного блокпоста стоят рядом и ломаются по одной.
 * После ролика на ширине секции остаётся куча песка. Она пулю не держит.
 * Удар поднимает песчаную пыль. Разрушение берёт один бонус из списка картинки.
 */
export class Sandbags {
  private readonly piles: Pile[];
  private view: FrameLayout | null = null;
  private readonly scene: Phaser.Scene;
  private readonly onBreak: (score: number, rx: number, ry: number) => void;
  private readonly at: GroundAt;

  constructor(
    scene: Phaser.Scene,
    marks: readonly SandbagMark[],
    private readonly debris: Debris,
    onBreak: (score: number, rx: number, ry: number) => void,
    at: GroundAt,
  ) {
    this.scene = scene;
    this.onBreak = onBreak;
    this.at = at;
    this.piles = marks.map((mark, index) => ({
      mark,
      hp: sandbag.hp,
      flash: 0,
      alive: true,
      breaking: false,
      gone: false,
      hit: null,
      variant: index % ruinVariants,
      sprite: scene.add.sprite(0, 0, sandbagIdleKey()).setOrigin(0.5, 1).setDepth(2.5).setVisible(false),
      seat: scene.add.graphics().setDepth(2.51),
      seatSig: '',
    }));
  }

  bind(view: FrameLayout): void {
    this.view = view;
    this.place();
  }

  step(delta: number): void {
    for (const pile of this.piles) pile.flash = Math.max(0, pile.flash - delta);
    this.place();
  }

  /** Квадрат креста бьёт мешки, чья кладка в него попала. */
  hit(box: HitBox, amount: number): void {
    const at = { x: (box.left + box.right) / 2, y: (box.top + box.bottom) / 2 };
    for (const pile of this.piles) {
      const hit = pile.hit;
      if (!pile.alive || !hit || !rectsOverlap(box, hit)) continue;
      this.wound(pile, amount, at);
    }
  }

  /** Разрыв снимает кучу, чья кладка входит в круг. */
  blast(x: number, y: number): void {
    for (const pile of this.piles) {
      const hit = pile.hit;
      if (!pile.alive || !hit || !circleHitsRect(x, y, grenade.blastRadius, hit)) continue;
      this.wound(pile, pile.hp, { x, y });
    }
  }

  private place(): void {
    const view = this.view;
    if (!view) return;
    const field = view.field;
    const fit = fitScale(field);
    for (const pile of this.piles) {
      const sprite = pile.sprite;
      const anchor = field.y + pile.mark.y * field.height;
      const scale = fieldScale(anchor, field) * fit;
      const displayW = Math.max(1, Math.round(sandbag.width * scale));
      const displayH = Math.max(1, Math.round(sandbag.height * scale));
      const scaleY = displayH / sandbag.height;
      const lift = sandbag.height - sandbag.ink.y - sandbag.ink.h / 2;
      const ground = Math.round(anchor + lift * scaleY);
      const x = Math.round(field.x + pile.mark.x * field.width + (pile.mark.dx ?? 0) * scale);
      sprite.setPosition(x, ground);
      sprite.setDisplaySize(displayW, displayH);
      sprite.setDepth(2.5 + ground / 10000);
      sprite.setVisible(true);
      if (pile.gone && sprite.texture.key !== sandbagRuinKey(pile.variant)) {
        sprite.setTexture(sandbagRuinKey(pile.variant));
      }
      if (pile.flash > 0 && pile.alive) sprite.setTint(palette.ink);
      else sprite.clearTint();
      pile.hit = pile.alive ? inkRect(x, ground, displayW, displayH) : null;
      this.seatPile(pile, displayW, displayH);
    }
  }

  /** Ровный низ закрывает дорога. На ролике посадка пропадает, на куче возвращается. */
  private seatPile(pile: Pile, displayW: number, displayH: number): void {
    const view = this.view;
    if (!view) return;
    const sprite = pile.sprite;
    const bursting = pile.breaking && !pile.gone;
    const sig = bursting ? '' : `${sprite.x},${sprite.y},${displayW},${displayH}`;
    if (sig === pile.seatSig) return;
    pile.seat.clear();
    if (!sig) {
      pile.seatSig = sig;
      return;
    }
    pile.seat.setDepth(sprite.depth + 0.002);
    const ready = paintSeat(pile.seat, this.scene, sprite, view.field, view.track, 2, {
      left: true,
      right: true,
      tuft: true,
    }, this.at);
    if (ready) pile.seatSig = sig;
  }

  private wound(pile: Pile, amount: number, at: { x: number; y: number }): void {
    if (!pile.alive || amount <= 0) return;
    pile.hp -= amount;
    pile.flash = 70;
    const spot = onFace(pile.hit, at.x, at.y);
    if (pile.hp > 0) {
      this.debris.burst(spot.x, spot.y, 'sand', false, 'field');
      return;
    }
    pile.alive = false;
    pile.hit = null;
    pile.breaking = true;
    this.debris.burst(spot.x, spot.y, 'sand', true, 'field');
    const view = this.view;
    const field = view?.field;
    const rx = field ? (spot.x - field.x) / Math.max(1, field.width) : pile.mark.x;
    const ry = field ? (spot.y - field.y) / Math.max(1, field.height) : pile.mark.y;
    this.onBreak(sandbag.score, rx, ry);
    pile.sprite.play(sandbagBreakKey());
    pile.sprite.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
      pile.gone = true;
      pile.sprite.anims.stop();
      pile.sprite.setTexture(sandbagRuinKey(pile.variant));
      pile.sprite.setVisible(true);
    });
  }
}

function inkRect(center: number, ground: number, displayW: number, displayH: number): InkRect {
  const box = sandbag.ink;
  const scaleX = displayW / sandbag.width;
  const scaleY = displayH / sandbag.height;
  return {
    left: center + (box.x - sandbag.width / 2) * scaleX,
    right: center + (box.x + box.w - sandbag.width / 2) * scaleX,
    top: ground - (sandbag.height - box.y) * scaleY,
    bottom: ground - (sandbag.height - box.y - box.h) * scaleY,
  };
}
