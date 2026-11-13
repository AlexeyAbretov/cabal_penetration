import Phaser from 'phaser';
import { arcPoint, distanceToSegment } from '../../combat';
import { cssColor, grenade, palette, soldierBox } from '../../constants';
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

/** Одна граната за нажатие. Дуга видна, пока она в воздухе, число лежит у ног. */
export class Grenades {
  private stock = grenade.stock;
  private grenades: Grenade[] = [];
  private view: FrameLayout | null = null;
  private readonly label: Phaser.GameObjects.Text;
  private readonly scene: Phaser.Scene;
  private readonly sparks: Sparks;

  constructor(scene: Phaser.Scene, sparks: Sparks) {
    this.scene = scene;
    this.sparks = sparks;
    this.label = scene.add
      .text(0, 0, '', {
        fontFamily: 'Consolas, "Courier New", monospace',
        fontSize: '20px',
        color: cssColor(palette.ink),
      })
      .setOrigin(0.5, 0)
      .setDepth(5);
  }

  bind(view: FrameLayout): void {
    this.view = view;
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

  sync(soldierX: number): void {
    const view = this.view;
    if (!view) return;
    const feet = Math.round(view.track.y + view.track.height / 2 + soldierBox.height / 2 + 2);
    this.label.setPosition(Math.round(soldierX), feet);
    this.label.setText(String(this.stock));
    this.label.setColor(cssColor(this.stock > 0 ? palette.ink : palette.wallCrit));
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
    this.sparks.add(item.toX, item.toY, grenade.explodeMs, 'land');
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
