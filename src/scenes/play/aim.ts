import Phaser from 'phaser';
import { aimMark, hitFlash, palette, weapons, type WeaponId } from '../../constants';
import { clampToRect, type Rect } from '../../layout';

/** Прерывистый крест. Ширина и высота зависят от ствола, и этот прямоугольник бьёт. */
export class Aim {
  x = 0;
  y = 0;
  private kind: WeaponId = 'rifle';
  private burst: Phaser.GameObjects.Sprite | null = null;
  private burstLife = 0;
  private readonly scene: Phaser.Scene;
  private readonly gfx: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.gfx = scene.add.graphics().setDepth(5);
  }

  aimAt(x: number, y: number, field: Rect): void {
    const point = clampToRect(x, y, field);
    this.x = point.x;
    this.y = point.y;
    this.placeBurst();
    this.draw();
  }

  setWeapon(kind: WeaponId): void {
    this.kind = kind;
    this.placeBurst();
    this.draw();
  }

  /** Попадание в дырке креста. Ролик облака, пока предыдущий не догорел. */
  flash(): void {
    if (this.burst || !this.scene.textures.exists(hitFlash.key)) return;
    this.burst = this.scene.add.sprite(this.x, this.y, hitFlash.key, 0).setOrigin(0.5, 0.5).setDepth(4.95);
    this.burstLife = 0;
    this.placeBurst();
  }

  step(delta: number): void {
    const burst = this.burst;
    if (!burst) return;
    this.burstLife += delta;
    const frame = Math.floor(this.burstLife / hitFlash.frameMs);
    if (frame >= hitFlash.frames) {
      burst.destroy();
      this.burst = null;
      return;
    }
    burst.setFrame(frame);
    this.placeBurst();
  }

  /** Кадр ролика вписан в прямоугольник креста этого ствола. */
  private placeBurst(): void {
    const burst = this.burst;
    if (!burst) return;
    const { reach, reachY } = weapons[this.kind];
    const scale = Math.min((reach * 2) / hitFlash.frameWidth, (reachY * 2) / hitFlash.frameHeight);
    burst.setPosition(Math.round(this.x), Math.round(this.y)).setDisplaySize(
      Math.max(1, Math.round(hitFlash.frameWidth * scale)),
      Math.max(1, Math.round(hitFlash.frameHeight * scale)),
    );
  }

  private draw(): void {
    const x = Math.round(this.x);
    const y = Math.round(this.y);
    const { reach, reachY, gap, mark } = weapons[this.kind];
    const { thickness } = aimMark;
    this.gfx.clear();
    this.drawSquare(x, y, reach, reachY, gap, thickness);
    this.drawTriangles(x, y, reach, reachY, gap, thickness, mark);
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
}
