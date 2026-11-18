import Phaser from 'phaser';
import { gunFire, muzzleFlashMs, palette, weaponHoldMs, weapons, type WeaponId } from '../../constants';

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

/** Очередь. Кувырок её обрывает. Временный ствол держит десять секунд, автомат — всегда. */
export class Gun {
  /** Очередь не переживает кувырок: кнопку надо отпустить и нажать снова. */
  private blockFire = false;
  private fireCooldown = 0;
  private muzzleLife = 0;
  private holdLeft = 0;
  private weapon: WeaponId = 'rifle';
  private readonly gfx: Phaser.GameObjects.Graphics;
  private readonly scene: Phaser.Scene;
  /** Крутится, пока зажат спуск. Узел Web Audio, чтобы стык был в том же сэмпле. */
  private stream: AudioBufferSourceNode | null = null;
  private streamGain: GainNode | null = null;
  /** Запасной путь, если браузер без Web Audio. */
  private fallback: Phaser.Sound.BaseSound | null = null;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.gfx = scene.add.graphics().setDepth(4.6);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.quiet();
      this.fallback?.destroy();
    });
  }

  /** Частый или широкий на десять секунд. Повторный подбор начинает срок заново. */
  equip(kind: Exclude<WeaponId, 'rifle'>): void {
    this.weapon = kind;
    this.fireCooldown = 0;
    this.holdLeft = weaponHoldMs;
  }

  /** Граница сцены. Оба временных ствола сгорают, даже если десять секунд не вышли. */
  burn(): void {
    this.weapon = 'rifle';
    this.fireCooldown = 0;
    this.holdLeft = 0;
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

  /** true — десять секунд вышли в этом кадре, в руках снова автомат. */
  step(delta: number, frame: ShotFrame): boolean {
    const expired = this.stepHold(delta);
    this.stepFire(delta, frame);
    this.stepMuzzle(delta, frame);
    return expired;
  }

  private stepHold(delta: number): boolean {
    if (this.weapon === 'rifle') return false;
    this.holdLeft -= delta;
    if (this.holdLeft > 0) return false;
    this.weapon = 'rifle';
    this.fireCooldown = 0;
    this.holdLeft = 0;
    return true;
  }

  /** Спуск отпущен, кувырок, пауза, смена картинки. Хвост гасится коротко, без щелчка. */
  quiet(): void {
    const source = this.stream;
    const gain = this.streamGain;
    this.stream = null;
    this.streamGain = null;
    if (source && gain && 'context' in this.scene.sound) {
      const now = this.scene.sound.context.currentTime;
      const release = 0.012;
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(gain.gain.value, now);
      gain.gain.linearRampToValueAtTime(0, now + release);
      source.stop(now + release);
    }
    if (this.fallback?.isPlaying) this.fallback.stop();
  }

  private stepFire(delta: number, frame: ShotFrame): void {
    const down = frame.triggerDown;
    if (frame.rolling) {
      if (down) this.blockFire = true;
      this.quiet();
      return;
    }
    if (this.blockFire) {
      if (!down) {
        this.blockFire = false;
        this.fireCooldown = 0;
      }
      this.quiet();
      return;
    }
    if (!down) {
      this.fireCooldown = 0;
      this.quiet();
      return;
    }

    this.roar();
    this.fireCooldown -= delta;
    if (this.fireCooldown > 0) return;
    this.shoot(frame);
    this.fireCooldown = weapons[this.weapon].intervalMs;
  }

  /** Один и тот же круг на автомат, частый и широкий, пока кнопка зажата. */
  private roar(): void {
    if (this.stream || this.fallback?.isPlaying) return;
    const cached = this.scene.cache.audio.get(gunFire.key);
    const sound = this.scene.sound;
    if (cached instanceof AudioBuffer && 'context' in sound) {
      const source = sound.context.createBufferSource();
      source.buffer = cached;
      source.loop = true;
      const gain = sound.context.createGain();
      source.connect(gain);
      gain.connect(sound.destination);
      source.onended = () => {
        source.disconnect();
        gain.disconnect();
      };
      source.start();
      this.stream = source;
      this.streamGain = gain;
      return;
    }
    if (!this.scene.cache.audio.exists(gunFire.key)) return;
    if (!this.fallback) this.fallback = sound.add(gunFire.key, { loop: true });
    this.fallback.play();
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
