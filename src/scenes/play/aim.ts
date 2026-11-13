import Phaser from 'phaser';
import { aimMark, palette, weaponMark, weapons, type WeaponId } from '../../constants';
import { clampToRect, type Rect } from '../../layout';

/** Прицел. Точка внутри поля и есть точка выстрела. Ствол меняет размер креста, не точку. */
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
    const { arm, gap } = weaponMark[this.kind];
    const { thickness } = aimMark;
    const half = Math.floor(thickness / 2);
    const reach = arm - gap;
    this.gfx.clear();
    this.gfx.fillStyle(palette.aim, 1);
    this.gfx.fillRect(x - arm, y - half, reach, thickness);
    this.gfx.fillRect(x + gap, y - half, reach, thickness);
    this.gfx.fillRect(x - half, y - arm, thickness, reach);
    this.gfx.fillRect(x - half, y + gap, thickness, reach);
    if (this.kind !== 'spread') return;
    const fan = weapons.spread.fan;
    this.gfx.fillStyle(palette.spread, 1);
    this.gfx.fillRect(x - fan - 1, y - 7, 2, 14);
    this.gfx.fillRect(x + fan - 1, y - 7, 2, 14);
  }
}
