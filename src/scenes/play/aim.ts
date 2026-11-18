import Phaser from 'phaser';
import { aimMark, palette, weapons, type WeaponId } from '../../constants';
import { clampToRect, type Rect } from '../../layout';

/** Крест. Сторона квадрата зависит от ствола, и этот квадрат бьёт. */
export class Aim {
  x = 0;
  y = 0;
  private kind: WeaponId = 'rifle';
  private readonly gfx: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene) {
    this.gfx = scene.add.graphics().setDepth(5);
  }

  aimAt(x: number, y: number, field: Rect): void {
    const point = clampToRect(x, y, field);
    this.x = point.x;
    this.y = point.y;
    this.draw();
  }

  setWeapon(kind: WeaponId): void {
    this.kind = kind;
    this.draw();
  }

  private draw(): void {
    const x = this.x;
    const y = this.y;
    const { reach, gap } = weapons[this.kind];
    const { thickness } = aimMark;
    const half = Math.floor(thickness / 2);
    const bar = reach - gap;
    this.gfx.clear();
    if (bar <= 0) return;
    this.gfx.fillStyle(palette.aim, 1);
    this.gfx.fillRect(x - reach, y - half, bar, thickness);
    this.gfx.fillRect(x + gap, y - half, bar, thickness);
    this.gfx.fillRect(x - half, y - reach, thickness, bar);
    this.gfx.fillRect(x - half, y + gap, thickness, bar);
  }
}
