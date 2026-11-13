import Phaser from 'phaser';
import { aimMark, palette } from '../../constants';
import { clampToRect, type Rect } from '../../layout';

/** Прицел. Точка внутри поля и есть точка выстрела. */
export class Aim {
  x = 0;
  y = 0;
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

  private draw(): void {
    const x = this.x;
    const y = this.y;
    const { arm, gap, thickness } = aimMark;
    const half = Math.floor(thickness / 2);
    const reach = arm - gap;
    this.gfx.clear();
    this.gfx.fillStyle(palette.aim, 1);
    this.gfx.fillRect(x - arm, y - half, reach, thickness);
    this.gfx.fillRect(x + gap, y - half, reach, thickness);
    this.gfx.fillRect(x - half, y - arm, thickness, reach);
    this.gfx.fillRect(x - half, y + gap, thickness, reach);
  }
}
