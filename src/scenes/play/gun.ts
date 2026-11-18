import Phaser from 'phaser';
import { muzzleFlashMs, palette, weapons, type WeaponId } from '../../constants';

export type ShotMark = {
  damage: number;
  reach: number;
  reachY: number;
};

type ShotFrame = {
  rolling: boolean;
  triggerDown: boolean;
  aimX: number;
  aimY: number;
  muzzlePoint: () => { x: number; y: number };
  onShot: (from: { x: number; y: number }, at: { x: number; y: number }, mark: ShotMark) => void;
};

/** Очередь. Кувырок её обрывает. Временный ствол живёт до границы сцены, автомат — всегда. */
export class Gun {
  /** Очередь не переживает кувырок: кнопку надо отпустить и нажать снова. */
  private blockFire = false;
  private fireCooldown = 0;
  private muzzleLife = 0;
  private weapon: WeaponId = 'rifle';
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

  /** Зажатая после кувырка кнопка очередь не продолжает. Вспышка листа ждёт нового нажатия. */
  acceptsTrigger(): boolean {
    return !this.blockFire;
  }

  step(delta: number, frame: ShotFrame): void {
    this.stepFire(delta, frame);
    this.stepMuzzle(delta, frame);
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
    const muzzle = frame.muzzlePoint();
    frame.onShot(muzzle, { x: frame.aimX, y: frame.aimY }, {
      damage: spec.damage,
      reach: spec.reach,
      reachY: spec.reachY,
    });
    this.muzzleLife = muzzleFlashMs;
  }

  private stepMuzzle(delta: number, frame: ShotFrame): void {
    this.muzzleLife = Math.max(0, this.muzzleLife - delta);
    this.gfx.clear();
    if (this.muzzleLife <= 0 || frame.rolling) return;
    const muzzle = frame.muzzlePoint();
    this.gfx.fillStyle(palette.muzzle, 1);
    this.gfx.fillRect(muzzle.x - 2, muzzle.y - 2, 4, 4);
  }
}
