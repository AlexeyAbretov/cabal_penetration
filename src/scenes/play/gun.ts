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
  gripPoint: () => { x: number; y: number };
  bodyCovers: (x: number, y: number) => boolean;
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
  /** Под солдатом и только по прозрачным пикселям кадра. */
  private readonly barrel: Phaser.GameObjects.Graphics;
  private readonly scene: Phaser.Scene;
  /** Крутится, пока зажат спуск. Узел Web Audio, чтобы стык был в том же сэмпле. */
  private stream: AudioBufferSourceNode | null = null;
  private streamGain: GainNode | null = null;
  /** Запасной путь, если браузер без Web Audio. */
  private fallback: Phaser.Sound.BaseSound | null = null;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.gfx = scene.add.graphics().setDepth(4.6);
    this.barrel = scene.add.graphics().setDepth(4.4);
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

  note(): { weapon: WeaponId; holdLeft: number } {
    return { weapon: this.weapon, holdLeft: Math.max(0, this.holdLeft) };
  }

  /** Тот же ствол и остаток десяти секунд. На границе картинки сцена его не зовёт. */
  recall(weapon: WeaponId, holdLeft: number): void {
    if (weapon === 'rifle' || holdLeft <= 0) {
      this.weapon = 'rifle';
      this.holdLeft = 0;
      return;
    }
    this.weapon = weapon;
    this.holdLeft = holdLeft;
  }

  /** Граница сцены. Оба временных ствола сгорают, даже если десять секунд не вышли. */
  burn(): void {
    this.weapon = 'rifle';
    this.fireCooldown = 0;
    this.holdLeft = 0;
  }

  /** Сброс очереди в кадр, когда кувырок только начался. Язык гаснет вместе с ней. */
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
    this.muzzleLife = 0;
    this.gfx.clear();
    this.barrel.clear();
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

  /** Вспышка держится всю очередь. На сам выстрел она чуть длиннее, без паузы между пулями. */
  private stepMuzzle(delta: number, frame: ShotFrame): void {
    this.muzzleLife = Math.max(0, this.muzzleLife - delta);
    this.gfx.clear();
    this.barrel.clear();
    if (frame.rolling || !frame.triggerDown || this.blockFire) return;
    const muzzle = frame.muzzlePoint();
    this.drawBarrel(frame.gripPoint(), muzzle, frame.bodyCovers);
    this.drawTongue(muzzle, frame.aimX, frame.aimY, this.muzzleLife > 0);
  }

  /** Чёрное дуло от тела до белого ядра. По непрозрачным пикселям кадра не кладётся. */
  private drawBarrel(
    from: { x: number; y: number },
    to: { x: number; y: number },
    covered: (x: number, y: number) => boolean,
  ): void {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 1) return;
    const steps = Math.max(1, Math.round(dist));
    this.barrel.fillStyle(palette.black, 1);
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      const x = Math.round(from.x + dx * t);
      const y = Math.round(from.y + dy * t);
      if (covered(x, y) || covered(x + 1, y) || covered(x, y + 1) || covered(x + 1, y + 1)) continue;
      this.barrel.fillRect(x, y, 2, 2);
    }
  }

  /** Четыре кадра вспышки. Белое ядро у дула, луч смотрит вправо на рисунке. */
  private drawTongue(from: { x: number; y: number }, aimX: number, aimY: number, hot: boolean): void {
    const dx = aimX - from.x;
    const dy = aimY - from.y;
    const dist = Math.hypot(dx, dy) || 1;
    const ux = dx / dist;
    const uy = dy / dist;
    const px = -uy;
    const py = ux;
    const rate = hot ? 40 : 70;
    const frame = flashFrames[Math.floor(this.scene.time.now / rate) % flashFrames.length];
    const gfx = this.gfx;
    for (const dot of frame.pixels) {
      gfx.fillStyle(dot.color, 1);
      gfx.fillRect(
        Math.round(from.x + dot.x * ux + dot.y * px),
        Math.round(from.y + dot.x * uy + dot.y * py),
        1,
        1,
      );
    }
  }
}

/** Цвета кадров вспышки, от тёмного к белому. Белое рисуется последним. */
const flashInk: Record<string, number> = {
  D: 0xc9281f,
  R: 0xf2561d,
  O: 0xff8a2a,
  Y: 0xffe26b,
  A: 0xfff3a6,
  W: 0xffffff,
};

const flashOrder = 'DROAYW';

/** Ядро — левый край белых пикселей. Плюс по x смотрит в выстрел. */
const flashSheets: { anchorX: number; anchorY: number; rows: string[] }[] = [
  {
    anchorX: 2,
    anchorY: 5.5,
    rows: [
      '.........RRR...........',
      '........RYYR...........',
      'RR....RRYYR............',
      'RYRRRRYAAR.............',
      'RAAAAAWWWYRRR..........',
      'RAWWWWWWWWAAYRRRRRRRRRR',
      'RAWWWWWWAAAAYRRRRRRRRRR',
      'RAAAAWWYRRRRR..........',
      'RYRRRYAR...............',
      'RR...RYYR..............',
      '......RRYR.............',
      '........R..............',
    ],
  },
  {
    anchorX: 2,
    anchorY: 6.5,
    rows: [
      '.........R..................',
      '.......RRR..................',
      '......RYYR..................',
      '.R...RYYR...................',
      'RYRRRYAR....................',
      'RAAAAWWYRRRRRRRR............',
      'RAWWWWWWAAAAAAAYRRRRRRRRRRRR',
      'RAWWWWWWWWAAAAAYRRRRRRRRRRRR',
      'RAAAAAWWWYRRRRRR............',
      'RYRRRRYAAR..................',
      'RR....RRYYR.................',
      '........RR..................',
    ],
  },
  {
    anchorX: 2,
    anchorY: 5.5,
    rows: [
      '........RR...............',
      '.......RYR...............',
      '.R...RRYYR...............',
      'RYRRRYAAR................',
      'RAAAAWWWYRRRRRR..........',
      'RAWWWWWWWAAAAAYRRRRRRRRRR',
      'RAWWWWWWWAAAAAYRRRRRRRRRR',
      'RAAAAAWWYRRRRRR..........',
      'RRRRRRYAR................',
      '......RYYR...............',
      '.......RRYR..............',
      '.........R...............',
    ],
  },
  {
    anchorX: 2,
    anchorY: 4.5,
    rows: [
      '........RR............',
      '.R....RRYR............',
      'RYRRRRYAR.............',
      'RAAAAAWWYRRRR.........',
      'RAWWWWWWWAAAYRRRRRRRRR',
      'RAWWWWWWWAAAYRRRRRRRRR',
      'RAAAAWWWYRRRR.........',
      'RYRRRYWAR.............',
      '.R...RYAR.............',
      '......RRYR............',
      '........RR............',
    ],
  },
];

const flashFrames = flashSheets.map((sheet) => {
  const pixels: { x: number; y: number; color: number; rank: number }[] = [];
  sheet.rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x += 1) {
      const ink = flashInk[row[x]];
      if (ink === undefined) continue;
      pixels.push({
        x: x - sheet.anchorX,
        y: y - sheet.anchorY,
        color: ink,
        rank: flashOrder.indexOf(row[x]),
      });
    }
  });
  pixels.sort((a, b) => a.rank - b.rank);
  return { pixels };
});
