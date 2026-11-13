import Phaser from 'phaser';
import { muzzleFlashMs, palette, tracerLength, tracerTravelMs, weapons, type WeaponId } from '../../constants';

type Shot = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  life: number;
  color: number;
  thick: number;
};

type ShotFrame = {
  rolling: boolean;
  triggerDown: boolean;
  aimX: number;
  aimY: number;
  muzzlePoint: () => { x: number; y: number };
  onShot: (from: { x: number; y: number }, at: { x: number; y: number }) => void;
};

/** Очередь. Кувырок её обрывает. Временный ствол живёт до границы сцены, автомат — всегда. */
export class Gun {
  /** Очередь не переживает кувырок: кнопку надо отпустить и нажать снова. */
  private blockFire = false;
  private fireCooldown = 0;
  private muzzleLife = 0;
  private weapon: WeaponId = 'rifle';
  private flashColor: number = palette.muzzle;
  private shots: Shot[] = [];
  private readonly gfx: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene) {
    this.gfx = scene.add.graphics().setDepth(4.6);
  }

  /** Частый или широкий. Автомат на это время уступает, патроны не кончаются. */
  equip(kind: Exclude<WeaponId, 'rifle'>): void {
    this.weapon = kind;
    this.fireCooldown = 0;
  }

  /** Граница сцены. Оба временных ствола сгорают. */
  burn(): void {
    this.weapon = 'rifle';
    this.fireCooldown = 0;
  }

  /** Сброс очереди в кадр, когда кувырок только начался. */
  interrupt(triggerHeld: boolean): void {
    this.fireCooldown = 0;
    if (triggerHeld) this.blockFire = true;
  }

  step(delta: number, frame: ShotFrame): void {
    this.stepFire(delta, frame);
    this.stepShots(delta, frame);
  }

  private stepFire(delta: number, frame: ShotFrame): void {
    const down = frame.triggerDown;
    if (frame.rolling) {
      if (down) this.blockFire = true;
      return;
    }
    if (this.blockFire) {
      if (!down) {
        this.blockFire = false;
        this.fireCooldown = 0;
      }
      return;
    }
    if (!down) {
      this.fireCooldown = 0;
      return;
    }

    this.fireCooldown -= delta;
    if (this.fireCooldown > 0) return;
    this.shoot(frame);
    this.fireCooldown = weapons[this.weapon].intervalMs;
  }

  private shoot(frame: ShotFrame): void {
    const spec = weapons[this.weapon];
    this.flashColor = this.weapon === 'rifle' ? palette.muzzle : spec.tracer;
    const muzzle = frame.muzzlePoint();
    for (const at of pattern(this.weapon, frame.aimX, frame.aimY)) {
      frame.onShot(muzzle, at);
      this.shots.push({
        x1: muzzle.x,
        y1: muzzle.y,
        x2: at.x,
        y2: at.y,
        life: tracerTravelMs,
        color: spec.tracer,
        thick: spec.thick,
      });
    }
    this.muzzleLife = muzzleFlashMs;
  }

  private stepShots(delta: number, frame: ShotFrame): void {
    this.muzzleLife = Math.max(0, this.muzzleLife - delta);

    let any = false;
    for (const shot of this.shots) {
      shot.life -= delta;
      if (shot.life > 0) any = true;
    }
    if (!any) this.shots.length = 0;
    else this.shots = this.shots.filter((shot) => shot.life > 0);

    this.gfx.clear();
    if (this.muzzleLife > 0 && !frame.rolling) {
      const muzzle = frame.muzzlePoint();
      this.gfx.fillStyle(this.flashColor, 1);
      this.gfx.fillRect(muzzle.x - 5, muzzle.y - 4, 10, 4);
    }
    for (const shot of this.shots) this.drawShot(shot);
  }

  /** Короткий штрих летит к точке и гаснет. Целая линия от ствола читалась как лазер. */
  private drawShot(shot: Shot): void {
    const dx = shot.x2 - shot.x1;
    const dy = shot.y2 - shot.y1;
    const len = Math.hypot(dx, dy);
    if (len < 1) return;

    const head = Math.min(len, (1 - shot.life / tracerTravelMs) * len);
    const tail = Math.max(0, head - tracerLength);
    if (head - tail < 1) return;

    const ux = dx / len;
    const uy = dy / len;
    const nx = -uy * shot.thick;
    const ny = ux * shot.thick;
    const x1 = shot.x1 + ux * tail;
    const y1 = shot.y1 + uy * tail;
    const x2 = shot.x1 + ux * head;
    const y2 = shot.y1 + uy * head;

    this.gfx.fillStyle(shot.color, 1);
    this.gfx.fillTriangle(x1 + nx, y1 + ny, x1 - nx, y1 - ny, x2 - nx, y2 - ny);
    this.gfx.fillTriangle(x1 + nx, y1 + ny, x2 - nx, y2 - ny, x2 + nx, y2 + ny);
  }
}

/** Узкий ствол — одна точка. Широкий — пятно вокруг прицела, крайние дробины чуть ниже. */
function pattern(kind: WeaponId, aimX: number, aimY: number): { x: number; y: number }[] {
  const spec = weapons[kind];
  if (spec.pellets <= 1 || spec.fan <= 0) return [{ x: aimX, y: aimY }];
  const mid = (spec.pellets - 1) / 2;
  const points: { x: number; y: number }[] = [];
  for (let i = 0; i < spec.pellets; i += 1) {
    const t = (i - mid) / mid;
    points.push({
      x: aimX + t * spec.fan,
      y: aimY + Math.abs(t) * spec.fan * 0.28,
    });
  }
  return points;
}
