import Phaser from 'phaser';
import { arcPoint, centerBox, distanceToSegment, rectsOverlap, type HitBox } from '../../combat';
import { grenade, palette } from '../../constants';
import { explosionSheet } from '../../explosionSheet';
import type { FrameLayout } from '../../layout';
import type { Sparks } from './sparks';

type Grenade = {
  t: number;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  ctrlX: number;
  ctrlY: number;
  alive: boolean;
  tween: Phaser.Tweens.Tween | null;
};

type Throw = {
  paused: boolean;
  rolling: boolean;
  from: { x: number; y: number };
  aimX: number;
  aimY: number;
};

type Blast = {
  sprite: Phaser.GameObjects.Sprite;
  life: number;
};

/** Одна граната за нажатие. Дуга видна, пока она в воздухе. Число запаса рисует рамка. */
export class Grenades {
  private stock: number = grenade.stock;
  private grenades: Grenade[] = [];
  private blasts: Blast[] = [];
  private view: FrameLayout | null = null;
  private readonly scene: Phaser.Scene;
  private readonly sparks: Sparks;
  private boom: ((x: number, y: number) => void) | null = null;

  constructor(scene: Phaser.Scene, sparks: Sparks) {
    this.scene = scene;
    this.sparks = sparks;
  }

  bind(view: FrameLayout): void {
    this.view = view;
  }

  count(): number {
    return this.stock;
  }

  /** Заход приносит запас с прошлой картинки. Между сценами гранаты не сбрасываются. */
  setStock(stock: number): void {
    this.stock = Math.max(0, Math.floor(stock));
  }

  /** Пачка с дороги прибавляется к запасу. Потолка нет. */
  add(count: number): void {
    if (count <= 0) return;
    this.stock += count;
  }

  /** Разрыв в точке падения. Сбитая в воздухе граната землю не бьёт. */
  onLand(boom: (x: number, y: number) => void): void {
    this.boom = boom;
  }

  /** Кадры разрыва. На паузе и на экране смерти сцена этот шаг не зовёт. */
  step(delta: number): void {
    const frameMs = explosionSheet.frameMs;
    const frames = explosionSheet.frames;
    this.blasts = this.blasts.filter((blast) => {
      blast.life += delta;
      const frame = Math.floor(blast.life / frameMs);
      if (frame >= frames) {
        blast.sprite.destroy();
        return false;
      }
      blast.sprite.setFrame(frame);
      return true;
    });
  }

  throw(args: Throw): void {
    const view = this.view;
    if (args.paused || args.rolling || this.stock <= 0 || !view) return;
    this.stock -= 1;

    const from = args.from;
    const lift = Math.min(grenade.arcLift, Math.max(48, view.field.height * 0.45));
    const item: Grenade = {
      t: 0,
      fromX: from.x,
      fromY: from.y,
      toX: args.aimX,
      toY: args.aimY,
      ctrlX: (from.x + args.aimX) / 2,
      ctrlY: Math.max(view.sky.y + 8, Math.min(from.y, args.aimY) - lift),
      alive: true,
      tween: null,
    };
    item.tween = this.scene.tweens.add({
      targets: item,
      t: 1,
      duration: grenade.flightMs,
      onComplete: () => this.land(item),
    });
    this.grenades.push(item);
  }

  /** Гранаты, чьё тело попало в квадрат креста. Широкий крест снимает пачку. */
  sweep(box: HitBox): boolean {
    let hit = false;
    for (const item of [...this.grenades]) {
      if (!item.alive) continue;
      if (item.t < grenade.armT || item.t > grenade.lateT) continue;
      const point = this.point(item);
      if (!rectsOverlap(box, centerBox(point.x, point.y, grenade.body, grenade.body))) continue;
      this.pop(item);
      hit = true;
    }
    return hit;
  }

  /**
   * Прямая на точку прицела сбивает гранату в середине дуги.
   * У ствола и у самой точки своя очередь её не съедает: дуга там совпадает с лучом.
   */
  intercept(fromX: number, fromY: number, aimX: number, aimY: number): boolean {
    let hit: Grenade | null = null;
    let nearest = Infinity;
    for (const item of this.grenades) {
      if (!item.alive) continue;
      if (item.t < grenade.armT || item.t > grenade.lateT) continue;
      const point = this.point(item);
      const aimed = Math.hypot(aimX - point.x, aimY - point.y) <= grenade.aimRadius;
      const along = distanceToSegment(point.x, point.y, fromX, fromY, aimX, aimY);
      if ((!aimed && along.distance > grenade.hitRadius) || along.t >= nearest) continue;
      nearest = along.t;
      hit = item;
    }
    if (!hit) return false;
    this.pop(hit);
    return true;
  }

  draw(gfx: Phaser.GameObjects.Graphics): void {
    for (const item of this.grenades) {
      if (!item.alive) continue;
      gfx.fillStyle(palette.grenadeArc, 1);
      for (let step = 0; step <= 16; step += 1) {
        const point = arcPoint(step / 16, item.fromX, item.fromY, item.ctrlX, item.ctrlY, item.toX, item.toY);
        gfx.fillRect(Math.round(point.x) - 1, Math.round(point.y) - 1, 3, 3);
      }
      const body = this.point(item);
      const size = grenade.body;
      gfx.fillStyle(palette.grenade, 1);
      gfx.fillRect(Math.round(body.x - size / 2), Math.round(body.y - size / 2), size, size);
      gfx.fillStyle(palette.grenadeArc, 1);
      gfx.fillRect(Math.round(body.x - 1), Math.round(body.y - size / 2), 2, 2);
    }
  }

  private land(item: Grenade): void {
    if (!item.alive) return;
    item.alive = false;
    this.drop(item);
    this.blast(item.toX, item.toY);
    this.boom?.(item.toX, item.toY);
  }

  /** Край круглого кадра — это радиус урона. Осколки после пика чуть выходят за круг. */
  private blast(x: number, y: number): void {
    const sprite = this.scene.add.sprite(x, y, explosionSheet.key, 0).setOrigin(0.5, 0.5).setDepth(4.4);
    this.blasts.push({ sprite, life: 0 });
  }

  private pop(item: Grenade): void {
    if (!item.alive) return;
    const point = this.point(item);
    item.alive = false;
    item.tween?.stop();
    this.drop(item);
    this.sparks.add(point.x, point.y, grenade.explodeMs * 0.7, 'pop');
  }

  private drop(item: Grenade): void {
    this.grenades = this.grenades.filter((other) => other !== item);
  }

  private point(item: Grenade): { x: number; y: number } {
    return arcPoint(item.t, item.fromX, item.fromY, item.ctrlX, item.ctrlY, item.toX, item.toY);
  }
}
