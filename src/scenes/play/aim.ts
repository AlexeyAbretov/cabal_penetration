import Phaser from 'phaser';
import { aimMark, hitFlashMs, palette, weapons, type WeaponId } from '../../constants';
import { clampToRect, type Rect } from '../../layout';

/**
 * Огненный ком с кадра попадания. Точка пустая.
 * W — яркое жёлтое, Y — жёлтое, O — оранжевое, R — тёмный край.
 * Второй кадр короче: ком сгорает и гаснет, без полупрозрачности.
 */
const fireBurst = [
  '....YY...',
  '..OOYYY..',
  '.YYOOYOO.',
  '.OYYYYYY.',
  'OOYWWYYO.',
  '.OYYYYOO.',
  '..OYYYR..',
  '...ORR...',
  '....R....',
] as const;

const fireEmber = [
  '.........',
  '....Y....',
  '...YYY...',
  '..OYWYO..',
  '...OOO...',
  '....R....',
  '.........',
  '.........',
  '.........',
] as const;

const fireColor: Record<string, number> = {
  W: palette.explosion,
  Y: palette.star,
  O: palette.enemyLane,
  R: palette.wallHurt,
};

/** Прерывистый крест. Ширина и высота зависят от ствола, и этот прямоугольник бьёт. */
export class Aim {
  x = 0;
  y = 0;
  private kind: WeaponId = 'rifle';
  private flashLeft = 0;
  private flashHalf = 0;
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

  /** Попадание в дырке креста. Размер снят со ствола, который выстрелил. */
  flash(): void {
    const spec = weapons[this.kind];
    const span = Math.min(spec.reach, spec.reachY);
    this.flashHalf = Math.max(2, Math.round(span * spec.flash));
    this.flashLeft = hitFlashMs;
    this.draw();
  }

  step(delta: number): void {
    if (this.flashLeft <= 0) return;
    this.flashLeft = Math.max(0, this.flashLeft - delta);
    this.draw();
  }

  private draw(): void {
    const x = Math.round(this.x);
    const y = Math.round(this.y);
    const { reach, reachY, gap, mark } = weapons[this.kind];
    const { thickness } = aimMark;
    this.gfx.clear();
    this.drawSquare(x, y, reach, reachY, gap, thickness);
    this.drawTriangles(x, y, reach, reachY, gap, thickness, mark);
    this.drawFlash(x, y);
  }

  /** Сторона из двух штрихов: разрыв посередине, углы целые. */
  private drawSquare(
    x: number,
    y: number,
    reachX: number,
    reachY: number,
    gap: number,
    thick: number,
  ): void {
    const width = reachX * 2;
    const height = reachY * 2;
    const hole = Math.max(thick * 2, gap * 2);
    const dashX = Math.floor((width - Math.min(width - thick * 4, hole)) / 2);
    const dashY = Math.floor((height - Math.min(height - thick * 4, hole)) / 2);
    if (dashX <= 0 || dashY <= 0) return;
    const left = x - reachX;
    const top = y - reachY;
    const right = left + width;
    const bottom = top + height;
    this.gfx.fillStyle(palette.aim, 1);
    this.gfx.fillRect(left, top, dashX, thick);
    this.gfx.fillRect(right - dashX, top, dashX, thick);
    this.gfx.fillRect(left, bottom - thick, dashX, thick);
    this.gfx.fillRect(right - dashX, bottom - thick, dashX, thick);
    this.gfx.fillRect(left, top, thick, dashY);
    this.gfx.fillRect(left, bottom - dashY, thick, dashY);
    this.gfx.fillRect(right - thick, top, thick, dashY);
    this.gfx.fillRect(right - thick, bottom - dashY, thick, dashY);
  }

  /** Четыре треугольника внутрь, по одному на сторону. Цвет — у ствола. */
  private drawTriangles(
    x: number,
    y: number,
    reachX: number,
    reachY: number,
    gap: number,
    thick: number,
    color: number,
  ): void {
    const rows = Math.max(2, gap);
    this.gfx.fillStyle(color, 1);
    this.triangle(x, y - reachY + thick, rows, 0, 1);
    this.triangle(x, y + reachY - thick, rows, 0, -1);
    this.triangle(x - reachX + thick, y, rows, 1, 0);
    this.triangle(x + reachX - thick, y, rows, -1, 0);
  }

  /** Основание в (x, y), остриё на dx/dy. Каждый ряд на пиксель короче с обеих сторон. */
  private triangle(x: number, y: number, rows: number, dx: number, dy: number): void {
    for (let i = 0; i < rows; i += 1) {
      const span = (rows - i) * 2 - 1;
      const half = Math.floor(span / 2);
      if (dy !== 0) this.gfx.fillRect(x - half, y + dy * i, span, 1);
      else this.gfx.fillRect(x + dx * i, y - half, 1, span);
    }
  }

  /**
   * Тот же ком, что на кадре: жёлтая середина, оранжевая кромка, рваный край.
   * Пиксель кома растёт вместе со стороной креста.
   */
  private drawFlash(x: number, y: number): void {
    if (this.flashLeft <= 0) return;
    const rows = this.flashLeft > hitFlashMs * 0.45 ? fireBurst : fireEmber;
    const cell = Math.max(1, Math.round(this.flashHalf / 4));
    const cols = rows[0].length;
    const originX = Math.round(x - (cols * cell) / 2);
    const originY = Math.round(y - (rows.length * cell) / 2);
    for (let row = 0; row < rows.length; row += 1) {
      const line = rows[row];
      for (let col = 0; col < line.length; col += 1) {
        const color = fireColor[line[col]];
        if (color === undefined) continue;
        this.gfx.fillStyle(color, 1);
        this.gfx.fillRect(originX + col * cell, originY + row * cell, cell, cell);
      }
    }
  }
}
