import Phaser from 'phaser';
import { aimFan, frame, kneelScale, motion, palette, rollMove, soldierBox } from '../../constants';
import { soldierFeetY, type FrameLayout } from '../../layout';
import { aimSideFrame, soldierAnimKey, soldierSheet, type SoldierClipName } from '../../soldierSheet';
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
 * Ноги на дорожке: шаг, бег, колено, короткий перекат.
 * Очередь сюда не входит. Пока зажат огонь, шаг из этого класса не вызывают.
 * Ступни на дорожке под забором, сразу над рамкой. Макушка забора чуть выше шлема.
 */
export class Soldier {
  private readonly scene: Phaser.Scene;
  private readonly gfx: Phaser.GameObjects.Graphics;
  private sprite: Phaser.GameObjects.Sprite | null = null;
  /** 0 — левый край хитбокса, 1 — правый. На ресайзе солдат остаётся на той же доле. */
  private soldierRatio = 0.5;
  private soldierX = 0;
  private cx = 0;
  private cy = 0;
  private feetY = 0;
  private bodyW: number = soldierBox.width;
  private bodyH: number = soldierBox.height;
  private angle = 0;
  private fill: number = palette.soldier;
  private alpha = 1;
  /** Непрозрачные пиксели текущего кадра. Ствол по ним не рисуется. */
  private inkName = '';
  private ink: Uint8Array | null = null;
  /** Бег держится, пока Shift в связке с направлением. Огонь и перекат связку рвут. */
  private runLatched = false;
  private kneeling = false;
  private firing = false;
  /** 0–2 низко влево/прямо/вправо, 3–5 то же выше. Пока очередь не идёт, не читается. */
  private aimColumn = 4;
  /** Куда смотрел крест в последний выстрел. Язык отсчитывается от этой точки. */
  private aimX = 0;
  private aimY = 0;
  private gait: 'stand' | 'walk' | 'run' = 'stand';
  /** 1 — ряд листа как нарисован, вправо. -1 — зеркало того же ряда. */
  private face: -1 | 1 = 1;
  private clip = '';
  private pose: Pose = 'stand';
  private roll: Roll | null = null;
  /** leave ведёт бег за правый край. Пустая полоска leave не зовёт: кадр замирает на месте. */
  private leaving = false;
  private view: FrameLayout | null = null;
  private columns: FrontWall | null = null;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.gfx = scene.add.graphics().setDepth(4.5);
  }

  /** Лист уже проверен по размеру. Анимации регистрирует сцена. */
  useSheet(): void {
    if (this.sprite) return;
    this.sprite = this.scene.add
      .sprite(this.cx, this.feetY, soldierSheet.key, 0)
      .setOrigin(0.5, 1)
      .setDepth(4.5);
    this.gfx.clear();
    this.gfx.setVisible(false);
    this.clip = '';
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
    if (input.ctrlPressed || (input.dirPressed && input.ctrl)) return this.startRoll(dir);
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

  /**
   * Смена картинки. Бег за правый край дорожки, ноги больше не упираются в её конец.
   * true — тело уже ушло с дорожки, сцену можно сменить.
   */
  leave(delta: number): boolean {
    const view = this.view;
    if (!view) return false;
    if (!this.leaving) {
      this.leaving = true;
      this.roll = null;
      this.kneeling = false;
      this.firing = false;
      this.gait = 'run';
      this.face = 1;
      this.clip = '';
    }
    const span = view.width / frame.width;
    this.soldierX += motion.run * span * (delta / 1000);
    this.feetY = soldierFeetY(view.track);
    this.cx = Math.round(this.soldierX);
    this.applyPose();
    this.cy = Math.round(this.feetY - this.bodyH / 2);
    return this.cx - this.bodyW / 2 > view.track.x + view.track.width;
  }

  step(delta: number, input: MoveInput, showFire: boolean, aimX: number, aimY: number): void {
    const view = this.view;
    if (!view) return;

    if (input.firing) {
      this.runLatched = false;
      this.firing = showFire;
      this.gait = 'stand';
      this.kneeling = input.kneel;
      this.place();
      if (showFire) this.look(aimX, aimY);
      return;
    }

    this.firing = false;
    const oneWay = input.left !== input.right;
    if (!input.shift) {
      this.runLatched = false;
    } else if (oneWay && (input.dirPressed || input.shiftPressed)) {
      this.runLatched = true;
    }

    if (input.kneel && !oneWay) {
      this.kneeling = true;
      this.gait = 'stand';
      this.place();
      return;
    }

    this.kneeling = false;
    if (!oneWay) {
      this.gait = 'stand';
      this.place();
      return;
    }
    this.gait = this.runLatched ? 'run' : 'walk';
    this.faceInput(input);

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
    if (this.leaving) {
      this.applyPose();
      this.feetY = soldierFeetY(view.track);
      this.cx = Math.round(this.soldierX);
      this.cy = Math.round(this.feetY - this.bodyH / 2);
      return;
    }
    this.applyPose();
    const { min, max } = this.walkSpan(view);
    this.soldierX = min + (max - min) * this.soldierRatio;
    this.feetY = soldierFeetY(view.track);
    this.cx = Math.round(this.soldierX);
    this.cy = Math.round(this.feetY - this.bodyH / 2);
  }

  /** Свой буфер, глубже стены по списку. Так тело закрывает кладку. Лист стоит на тех же ногах. */
  draw(): void {
    const sprite = this.sprite;
    if (sprite) {
      sprite.setPosition(this.cx, this.feetY);
      sprite.setAlpha(this.alpha);
      if (this.firing) {
        this.showAim(sprite);
        return;
      }
      const key = soldierAnimKey(this.clipName());
      sprite.setFlipX(this.face < 0 && this.turns());
      if (this.clip !== key) {
        this.clip = key;
        sprite.play(key);
      }
      return;
    }
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

  /**
   * Пиксель кадра непрозрачный. Мигание после ранения альфу спрайта роняет,
   * но дырки в текстуре от этого не появляются: ствол под телом не кладётся.
   */
  covers(x: number, y: number): boolean {
    const sprite = this.sprite;
    if (!sprite) {
      const left = this.cx - this.bodyW / 2;
      const top = this.cy - this.bodyH / 2;
      return x >= left && x < left + this.bodyW && y >= top && y < top + this.bodyH;
    }
    const ink = this.frameInk(sprite);
    if (!ink) return false;
    const { frameWidth, frameHeight } = soldierSheet;
    let lx = Math.round(x) - (this.cx - frameWidth / 2);
    const ly = Math.round(y) - (this.feetY - frameHeight);
    if (sprite.flipX) lx = frameWidth - 1 - lx;
    if (lx < 0 || ly < 0 || lx >= frameWidth || ly >= frameHeight) return false;
    return ink[ly * frameWidth + lx] === 1;
  }

  private frameInk(sprite: Phaser.GameObjects.Sprite): Uint8Array | null {
    const name = sprite.frame.name;
    if (this.ink && this.inkName === name) return this.ink;
    const image = sprite.frame.source.image;
    if (!image) return null;
    const { frameWidth, frameHeight } = soldierSheet;
    const canvas = document.createElement('canvas');
    canvas.width = frameWidth;
    canvas.height = frameHeight;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(
      image,
      sprite.frame.cutX,
      sprite.frame.cutY,
      frameWidth,
      frameHeight,
      0,
      0,
      frameWidth,
      frameHeight,
    );
    const data = ctx.getImageData(0, 0, frameWidth, frameHeight).data;
    const ink = new Uint8Array(frameWidth * frameHeight);
    for (let i = 0; i < ink.length; i += 1) ink[i] = (data[i * 4 + 3] ?? 0) >= 128 ? 1 : 0;
    this.ink = ink;
    this.inkName = name;
    return ink;
  }

  /** Центр и размер хитбокса. Подбор смотрит на тело, не на кнопку. */
  body(): { x: number; y: number; w: number; h: number } {
    return { x: this.cx, y: this.cy, w: this.bodyW, h: this.bodyH };
  }

  /** Стойка у текущих ступней. Колено прямоугольник не сжимает: это поза, не укрытие. */
  hurtBox(): { left: number; right: number; top: number; bottom: number } {
    return {
      left: this.cx - soldierBox.width / 2,
      right: this.cx + soldierBox.width / 2,
      top: this.feetY - soldierBox.height,
      bottom: this.feetY,
    };
  }

  /** Верх прямоугольника. Граната вылетает отсюда, стена точку не подменяет. */
  muzzlePoint(): { x: number; y: number } {
    return { x: this.cx, y: this.cy - this.bodyH / 2 };
  }

  /** Плечо или грудь. Отсюда чёрное дуло идёт к вспышке. */
  gripPoint(): { x: number; y: number } {
    if (!this.sprite) return this.muzzlePoint();
    const side = this.aimSide();
    const { frameHeight } = soldierSheet;
    const grip = this.kneeling
      ? { x: side * 4, y: 22 }
      : side === 0
        ? { x: 0, y: 18 }
        : { x: side * 2, y: 18 };
    return {
      x: Math.round(this.cx + grip.x),
      y: Math.round(this.feetY - frameHeight + grip.y),
    };
  }

  /**
   * Передний край, не спина. Прямо — макушка в поле.
   * Вбок — грудь кадра, который смотрит в сторону выстрела.
   * Точка ещё сдвигается к кресту, чтобы язык не лежал на теле.
   */
  barrelPoint(): { x: number; y: number } {
    if (!this.sprite) return this.muzzlePoint();
    const side = this.aimSide();
    const { frameHeight } = soldierSheet;
    const front = this.kneeling && side !== 0
      ? { x: side * 14, y: 16 }
      : side === 0
        ? { x: 0, y: this.kneeling ? 6 : 4 }
        : { x: side * 8, y: 12 };
    const raw = {
      x: this.cx + front.x,
      y: this.feetY - frameHeight + front.y,
    };
    const dx = this.aimX - raw.x;
    const dy = this.aimY - raw.y;
    const dist = Math.hypot(dx, dy) || 1;
    const nudge = Math.min(6, dist / 2);
    return {
      x: Math.round(raw.x + (dx / dist) * nudge),
      y: Math.round(raw.y + (dy / dist) * nudge),
    };
  }

  private startRoll(dir: -1 | 1): boolean {
    const view = this.view;
    const columns = this.columns;
    if (!view || !columns) return false;
    this.roll = {
      dir,
      duration: rollMove.short.durationMs,
      elapsed: 0,
      distance: rollMove.short.columns * columns.columnWidth(view),
      originX: this.soldierX,
    };
    this.kneeling = false;
    this.firing = false;
    this.gait = 'stand';
    this.face = dir;
    this.runLatched = false;
    this.clip = '';
    this.place();
    return true;
  }

  private faceInput(input: MoveInput): void {
    if (input.right) this.face = 1;
    else if (input.left) this.face = -1;
  }

  /** Три клетки от ног, две по высоте поля. Вбок корпус зеркалится, как шаг. */
  private look(aimX: number, aimY: number): void {
    const view = this.view;
    if (!view) return;
    this.aimX = aimX;
    this.aimY = aimY;
    const field = view.field;
    const band = Math.max(36, view.width * aimFan.across);
    const dx = aimX - this.cx;
    const across = dx < -band ? 0 : dx > band ? 2 : 1;
    const high = aimY < field.y + field.height * aimFan.lowFromTop;
    this.aimColumn = across + (high ? 3 : 0);
  }

  /** -1 влево, 1 вправо, 0 прямо в поле. */
  private aimSide(): -1 | 0 | 1 {
    const across = this.aimColumn % 3;
    if (across === 0) return -1;
    if (across === 2) return 1;
    return 0;
  }

  /**
   * Прямо — стойка или колено, спиной в поле.
   * Вбок — один кадр шага. Он нарисован вправо, влево зеркало, как у хода.
   * Колено своего бокового кадра не имеет: зеркало переносит ствол, он нарисован влево.
   */
  private showAim(sprite: Phaser.GameObjects.Sprite): void {
    const side = this.aimSide();
    if (this.kneeling || side === 0) {
      sprite.setFlipX(this.kneeling && side > 0);
      const key = soldierAnimKey(this.kneeling ? 'kneel' : 'stand');
      if (this.clip !== key) {
        this.clip = key;
        sprite.play(key);
      }
      return;
    }
    sprite.setFlipX(side < 0);
    const key = 'aim-side';
    if (this.clip === key) return;
    this.clip = key;
    sprite.anims.stop();
    sprite.setFrame(aimSideFrame);
  }

  /** Стойка смотрит в поле. Зеркало только у хода: шаг, бег, перекат. */
  private turns(): boolean {
    const name = this.clipName();
    return name === 'walk' || name === 'run' || name === 'rollShort';
  }

  private clipName(): SoldierClipName {
    if (this.roll) return 'rollShort';
    if (this.kneeling) return 'kneel';
    if (this.gait === 'run') return 'run';
    if (this.gait === 'walk') return 'walk';
    return 'stand';
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
