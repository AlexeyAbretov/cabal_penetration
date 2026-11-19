import Phaser from 'phaser';
import { circleHitsRect, rectsOverlap, type HitBox } from '../../combat';
import { grenade, palette, sandbag } from '../../constants';
import type { SandbagMark } from '../../data/wave';
import { sandbagBreakKey, sandbagIdleKey } from '../../fenceSheet';
import { fieldScale, fitScale, type FrameLayout } from '../../layout';
import { paintSeat } from './seat';
import type { Sparks } from './sparks';

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
  sprite: Phaser.GameObjects.Sprite;
  seat: Phaser.GameObjects.Graphics;
  seatSig: string;
};

/**
 * Мешки на дороге. Стену у ног не закрывают.
 * Секции одного блокпоста стоят рядом и ломаются по одной.
 * Разрушение берёт один бонус из списка картинки.
 */
export class Sandbags {
  private readonly piles: Pile[];
  private view: FrameLayout | null = null;
  private readonly scene: Phaser.Scene;
  private readonly onBreak: (score: number, rx: number, ry: number) => void;

  constructor(
    scene: Phaser.Scene,
    marks: readonly SandbagMark[],
    private readonly sparks: Sparks,
    onBreak: (score: number, rx: number, ry: number) => void,
  ) {
    this.scene = scene;
    this.onBreak = onBreak;
    this.piles = marks.map((mark) => ({
      mark,
      hp: sandbag.hp,
      flash: 0,
      alive: true,
      breaking: false,
      gone: false,
      hit: null,
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
    for (const pile of this.piles) {
      const hit = pile.hit;
      if (!pile.alive || !hit || !rectsOverlap(box, hit)) continue;
      this.wound(pile, amount);
    }
  }

  /** Разрыв снимает кучу, чья кладка входит в круг. */
  blast(x: number, y: number): void {
    for (const pile of this.piles) {
      const hit = pile.hit;
      if (!pile.alive || !hit || !circleHitsRect(x, y, grenade.blastRadius, hit)) continue;
      this.wound(pile, pile.hp);
    }
  }

  private place(): void {
    const view = this.view;
    if (!view) return;
    const field = view.field;
    const fit = fitScale(field);
    for (const pile of this.piles) {
      const sprite = pile.sprite;
      if (pile.gone) {
        pile.hit = null;
        sprite.setVisible(false);
        this.seatPile(pile, 0, 0);
        continue;
      }
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
      if (pile.flash > 0 && pile.alive) sprite.setTint(palette.ink);
      else sprite.clearTint();
      pile.hit = pile.alive ? inkRect(x, ground, displayW, displayH) : null;
      this.seatPile(pile, displayW, displayH);
    }
  }

  /** Ровный низ мешков закрывает дорога. На сломе посадка пропадает. */
  private seatPile(pile: Pile, displayW: number, displayH: number): void {
    const view = this.view;
    if (!view) return;
    const sprite = pile.sprite;
    const sig = pile.gone || pile.breaking ? '' : `${sprite.x},${sprite.y},${displayW},${displayH}`;
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
    });
    if (ready) pile.seatSig = sig;
  }

  private wound(pile: Pile, amount: number): void {
    if (!pile.alive || amount <= 0) return;
    pile.hp -= amount;
    pile.flash = 70;
    const hit = pile.hit;
    const sx = hit ? (hit.left + hit.right) / 2 : 0;
    const sy = hit ? (hit.top + hit.bottom) / 2 : 0;
    if (pile.hp > 0) {
      this.sparks.add(sx, sy, 80, 'chip');
      return;
    }
    pile.alive = false;
    pile.hit = null;
    pile.breaking = true;
    this.sparks.add(sx, sy, 160, 'land');
    const view = this.view;
    const field = view?.field;
    const rx = field ? (sx - field.x) / Math.max(1, field.width) : pile.mark.x;
    const ry = field ? (sy - field.y) / Math.max(1, field.height) : pile.mark.y;
    this.onBreak(sandbag.score, rx, ry);
    pile.sprite.play(sandbagBreakKey());
    pile.sprite.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
      pile.gone = true;
      pile.sprite.setVisible(false);
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
