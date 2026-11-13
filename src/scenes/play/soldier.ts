import Phaser from 'phaser';
import { frame, kneelScale, motion, palette, rollMove, soldierBox } from '../../constants';
import type { FrameLayout } from '../../layout';
import type { MoveInput } from './input';
import type { FrontWall } from './wall';

type Roll = {
  dir: -1 | 1;
  duration: number;
  elapsed: number;
  distance: number;
  originX: number;
};

type Pose = 'stand' | 'kneel' | 'roll';

/**
 * Ноги на дорожке: шаг, бег, колено, короткий и длинный перекат.
 * Очередь сюда не входит. Пока зажат огонь, шаг из этого класса не вызывают.
 * Тело — свой Graphics выше стены. Rectangle и фигуры внутри буфера стены остаются под кладкой.
 */
export class Soldier {
  private readonly gfx: Phaser.GameObjects.Graphics;
  /** 0 — левый край хитбокса, 1 — правый. На ресайзе солдат остаётся на той же доле. */
  private soldierRatio = 0.5;
  private soldierX = 0;
  private cx = 0;
  private cy = 0;
  private bodyW: number = soldierBox.width;
  private bodyH: number = soldierBox.height;
  private angle = 0;
  private fill: number = palette.soldier;
  private alpha = 1;
  /** Бег держится, пока Shift в связке с направлением. Огонь и перекат связку рвут. */
  private runLatched = false;
  private kneeling = false;
  private pose: Pose = 'stand';
  private roll: Roll | null = null;
  private view: FrameLayout | null = null;
  private columns: FrontWall | null = null;

  constructor(scene: Phaser.Scene) {
    this.gfx = scene.add.graphics().setDepth(4.5);
  }

  get x(): number {
    return this.soldierX;
  }

  get rolling(): boolean {
    return this.roll !== null;
  }

  bind(view: FrameLayout, columns: FrontWall): void {
    this.view = view;
    this.columns = columns;
  }

  column(): number {
    if (!this.view || !this.columns) return 0;
    return this.columns.columnAt(this.view, this.cx);
  }

  /** Доля дорожки, на которой центр солдата совпадает с центром колонки. */
  standInColumn(index: number): void {
    if (!this.view || !this.columns) return;
    const { min, max } = this.walkSpan(this.view);
    const x = Math.min(max, Math.max(min, this.columns.columnCenter(this.view, index)));
    this.soldierX = x;
    this.soldierRatio = max > min ? (x - min) / (max - min) : 0.5;
  }

  /** true — кувырок начался в этом кадре. Очередь после этого обрывает сцена. */
  tryRoll(input: MoveInput): boolean {
    if (this.roll) return false;
    if (input.left === input.right) return false;
    const dir: -1 | 1 = input.right ? 1 : -1;
    const long = input.spacePressed || (input.dirPressed && input.space);
    const short = input.ctrlPressed || (input.dirPressed && input.ctrl);
    if (long) return this.startRoll('long', dir);
    if (short) return this.startRoll('short', dir);
    return false;
  }

  advanceRoll(delta: number): void {
    const roll = this.roll;
    const view = this.view;
    if (!roll || !view) return;
    roll.elapsed += delta;
    const t = Math.min(1, roll.elapsed / roll.duration);
    const eased = 1 - (1 - t) * (1 - t);
    const { min, max } = this.walkSpan(view);
    this.soldierX = Math.min(max, Math.max(min, roll.originX + roll.dir * roll.distance * eased));
    this.soldierRatio = max > min ? (this.soldierX - min) / (max - min) : 0.5;
    if (t >= 1) this.roll = null;
    this.place();
  }

  step(delta: number, input: MoveInput): void {
    const view = this.view;
    if (!view) return;

    if (input.firing) {
      this.runLatched = false;
      this.kneeling = input.kneel;
      this.place();
      return;
    }

    const oneWay = input.left !== input.right;
    if (!input.shift) {
      this.runLatched = false;
    } else if (oneWay && (input.dirPressed || input.shiftPressed)) {
      this.runLatched = true;
    }

    if (input.kneel && !oneWay) {
      this.kneeling = true;
      this.place();
      return;
    }

    this.kneeling = false;
    if (!oneWay) {
      this.place();
      return;
    }

    const span = view.width / frame.width;
    const speed = (this.runLatched ? motion.run : motion.walk) * span;
    const distance = (input.right ? 1 : -1) * speed * (delta / 1000);
    const { min, max } = this.walkSpan(view);
    this.soldierX = Math.min(max, Math.max(min, this.soldierX + distance));
    this.soldierRatio = max > min ? (this.soldierX - min) / (max - min) : 0.5;
    this.place();
  }

  place(): void {
    const view = this.view;
    if (!view) return;
    this.applyPose();
    const { min, max } = this.walkSpan(view);
    this.soldierX = min + (max - min) * this.soldierRatio;
    const bottom = Math.round(view.track.y + view.track.height / 2 + soldierBox.height / 2);
    this.cx = Math.round(this.soldierX);
    this.cy = Math.round(bottom - this.bodyH / 2);
  }

  /** Свой буфер, глубже стены по списку. Так тело закрывает кладку. */
  draw(): void {
    const gfx = this.gfx;
    gfx.clear();
    gfx.setPosition(0, 0);
    gfx.setAngle(0);
    gfx.fillStyle(this.fill, this.alpha);
    if (this.angle === 0) {
      gfx.fillRect(this.cx - this.bodyW / 2, this.cy - this.bodyH / 2, this.bodyW, this.bodyH);
      return;
    }
    gfx.save();
    gfx.translateCanvas(this.cx, this.cy);
    gfx.rotateCanvas(Phaser.Math.DegToRad(this.angle));
    gfx.fillRect(-this.bodyW / 2, -this.bodyH / 2, this.bodyW, this.bodyH);
    gfx.restore();
  }

  setAlpha(alpha: number): void {
    this.alpha = alpha;
  }

  /** Центр и размер хитбокса. Подбор смотрит на тело, не на кнопку. */
  body(): { x: number; y: number; w: number; h: number } {
    return { x: this.cx, y: this.cy, w: this.bodyW, h: this.bodyH };
  }

  /** Верх прямоугольника. Стена точку вылета не подменяет. */
  muzzlePoint(): { x: number; y: number } {
    return { x: this.cx, y: this.cy - this.bodyH / 2 };
  }

  private startRoll(kind: 'short' | 'long', dir: -1 | 1): boolean {
    const view = this.view;
    const columns = this.columns;
    if (!view || !columns) return false;
    const spec = rollMove[kind];
    this.roll = {
      dir,
      duration: spec.durationMs,
      elapsed: 0,
      distance: spec.columns * columns.columnWidth(view),
      originX: this.soldierX,
    };
    this.kneeling = false;
    this.runLatched = false;
    this.place();
    return true;
  }

  private applyPose(): void {
    const next: Pose = this.roll ? 'roll' : this.kneeling ? 'kneel' : 'stand';
    if (next !== this.pose) {
      this.pose = next;
      this.bodyH =
        next === 'stand' ? soldierBox.height : next === 'kneel' ? soldierBox.height * kneelScale : soldierBox.height * 0.42;
      this.bodyW = next === 'roll' ? soldierBox.width * 1.35 : soldierBox.width;
      this.fill = next === 'roll' ? palette.soldierRoll : palette.soldier;
    }
    const t = this.roll ? Math.min(1, this.roll.elapsed / this.roll.duration) : 0;
    this.angle = this.roll ? this.roll.dir * t * 360 : 0;
  }

  private walkSpan(view: FrameLayout): { min: number; max: number } {
    const half = soldierBox.width / 2;
    const track = view.track;
    return { min: track.x + half, max: track.x + track.width - half };
  }
}
