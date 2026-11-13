import Phaser from 'phaser';
import { fireIntervalMs, muzzleFlashMs, palette, tracerLength, tracerTravelMs } from '../../constants';

type Shot = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  life: number;
};

type ShotFrame = {
  rolling: boolean;
  triggerDown: boolean;
  aimX: number;
  aimY: number;
  muzzle: Phaser.GameObjects.Rectangle;
  muzzlePoint: () => { x: number; y: number };
  onShot: (from: { x: number; y: number }) => void;
};

/** Очередь автомата. Кувырок её обрывает: сквозь перекат огонь не держится. */
export class Gun {
  /** Очередь не переживает кувырок: кнопку надо отпустить и нажать снова. */
  private blockFire = false;
  private fireCooldown = 0;
  private muzzleLife = 0;
  private shots: Shot[] = [];
  private readonly gfx: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene) {
    this.gfx = scene.add.graphics().setDepth(4);
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
    this.fireCooldown = fireIntervalMs;
  }

  private shoot(frame: ShotFrame): void {
    const muzzle = frame.muzzlePoint();
    frame.onShot(muzzle);
    this.shots.push({
      x1: muzzle.x,
      y1: muzzle.y,
      x2: frame.aimX,
      y2: frame.aimY,
      life: tracerTravelMs,
    });
    this.muzzleLife = muzzleFlashMs;
    frame.muzzle.setPosition(muzzle.x, muzzle.y);
    frame.muzzle.setVisible(true);
  }

  private stepShots(delta: number, frame: ShotFrame): void {
    this.muzzleLife = Math.max(0, this.muzzleLife - delta);
    frame.muzzle.setVisible(this.muzzleLife > 0 && !frame.rolling);

    let any = false;
    for (const shot of this.shots) {
      shot.life -= delta;
      if (shot.life > 0) any = true;
    }
    if (!any) {
      this.shots.length = 0;
      this.gfx.clear();
      return;
    }

    this.shots = this.shots.filter((shot) => shot.life > 0);
    this.gfx.clear();
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
    const nx = -uy * 1.5;
    const ny = ux * 1.5;
    const x1 = shot.x1 + ux * tail;
    const y1 = shot.y1 + uy * tail;
    const x2 = shot.x1 + ux * head;
    const y2 = shot.y1 + uy * head;

    this.gfx.fillStyle(palette.tracer, 1);
    this.gfx.fillTriangle(x1 + nx, y1 + ny, x1 - nx, y1 - ny, x2 - nx, y2 - ny);
    this.gfx.fillTriangle(x1 + nx, y1 + ny, x2 - nx, y2 - ny, x2 + nx, y2 + ny);
  }
}
