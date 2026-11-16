import Phaser from 'phaser';
import { cssColor, enemyBar, hud, palette, type WeaponId } from '../../constants';
import type { FrameLayout, Rect } from '../../layout';

const fontFamily = 'Consolas, "Courier New", monospace';

/**
 * Значки PixelLab 48×48, в рамке пиксель в пиксель.
 * right и bottom — край непрозрачных пикселей, не включая его.
 */
export const hudIcons = {
  heart: 'hud-heart',
  grenade: 'hud-grenade',
  heartUrl: 'assets/hud-heart.png',
  grenadeUrl: 'assets/hud-grenade.png',
  heartTrim: { left: 9, top: 12, right: 39, bottom: 38 },
  grenadeTrim: { left: 14, top: 7, right: 37, bottom: 41 },
} as const;

type IconTrim = { left: number; top: number; right: number; bottom: number };

/** Рамка снизу: сердце, жизни, счёт, запас гранат, полоска ENEMY и пауза. */
export class Hud {
  private lives: number = hud.lives;
  private score = 0;
  private grenades = 0;
  private quota = 0;
  private slain = 0;
  private hurtTimer = 0;
  private frameWidth = 0;
  private band: Rect | null = null;
  private readonly heart: Phaser.GameObjects.Image;
  private readonly livesText: Phaser.GameObjects.Text;
  private readonly scoreText: Phaser.GameObjects.Text;
  private readonly grenade: Phaser.GameObjects.Image;
  private readonly grenadeText: Phaser.GameObjects.Text;
  private readonly enemyLabel: Phaser.GameObjects.Text;
  private readonly barGfx: Phaser.GameObjects.Graphics;
  private readonly weaponGfx: Phaser.GameObjects.Graphics;
  private weapon: WeaponId = 'rifle';
  private readonly pauseVeil: Phaser.GameObjects.Graphics;
  private readonly pauseLabel: Phaser.GameObjects.Text;
  private readonly edge: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene, layer: Phaser.GameObjects.Container) {
    const font = inkFont('22px');
    this.heart = hudIcon(scene, hudIcons.heart);
    this.livesText = scene.add.text(0, 0, '', font).setOrigin(0, 0.5);
    this.scoreText = scene.add.text(0, 0, '', font).setOrigin(0, 0.5);
    this.grenade = hudIcon(scene, hudIcons.grenade);
    this.grenadeText = scene.add.text(0, 0, '', font).setOrigin(0, 0.5);
    this.enemyLabel = scene.add.text(0, 0, 'ENEMY', inkFont('18px')).setOrigin(0, 0.5).setVisible(false);
    this.barGfx = scene.add.graphics();
    this.weaponGfx = scene.add.graphics();
    this.pauseVeil = scene.add.graphics().setVisible(false);
    this.pauseLabel = scene.add
      .text(0, 0, 'ПАУЗА', {
        fontFamily,
        fontSize: '32px',
        color: cssColor(palette.ink),
      })
      .setOrigin(0.5)
      .setVisible(false);
    this.edge = scene.add.graphics();
    layer.add(this.heart);
    layer.add(this.livesText);
    layer.add(this.scoreText);
    layer.add(this.grenade);
    layer.add(this.grenadeText);
    layer.add(this.enemyLabel);
    layer.add(this.barGfx);
    layer.add(this.weaponGfx);
    layer.add(this.pauseVeil);
    layer.add(this.pauseLabel);
    layer.add(this.edge);
  }

  get hurt(): boolean {
    return this.hurtTimer > 0;
  }

  get livesLeft(): number {
    return this.lives;
  }

  get points(): number {
    return this.score;
  }

  /** Заход или континуэ. Полоска сцены при этом не трогается. */
  carry(score: number, lives: number): void {
    this.score = Math.max(0, score);
    this.lives = Math.max(0, lives);
    this.livesText.setText(String(this.lives));
    this.scoreText.setText(String(this.score).padStart(hud.scoreDigits, '0'));
  }

  /** true — жизней не осталось. */
  hurtSoldier(): boolean {
    this.lives = Math.max(0, this.lives - 1);
    this.hurtTimer = hud.hurtMs;
    this.livesText.setText(String(this.lives));
    return this.lives === 0;
  }

  setQuota(quota: number): void {
    this.quota = quota;
    this.paintBar();
  }

  addScore(points: number): void {
    this.score += points;
    this.scoreText.setText(String(this.score).padStart(hud.scoreDigits, '0'));
  }

  /** Запас в нижней рамке, сразу после счёта. */
  setGrenades(count: number): void {
    this.grenades = Math.max(0, Math.floor(count));
    if (!this.band) return;
    this.paintGrenades();
    this.paintBar();
  }

  /** Автомат в рамке не рисуется: он и есть отсутствие ствола. Временный виден, пока сцена не кончилась. */
  setWeapon(kind: WeaponId): void {
    this.weapon = kind;
    this.paintWeapon();
  }

  /** Сегмент снят. true — полоска пуста, кадр кончается. */
  eat(): boolean {
    if (this.quota <= 0 || this.slain >= this.quota) return this.slain >= this.quota && this.quota > 0;
    this.slain += 1;
    this.paintBar();
    return this.slain >= this.quota;
  }

  /** Уехали, не убиты. Сегменты сходят без очков. true — полоска от этого пуста. */
  release(count: number): boolean {
    if (count <= 0 || this.quota <= 0) return false;
    this.quota = Math.max(this.slain, this.quota - count);
    this.paintBar();
    return this.slain >= this.quota && this.quota > 0;
  }

  /** Доля непрозрачности тела: мигание, пока держится окно после ранения. */
  stepHurt(delta: number): number {
    this.hurtTimer = Math.max(0, this.hurtTimer - delta);
    const blink = this.hurtTimer > 0 && Math.floor(this.hurtTimer / hud.blinkMs) % 2 === 0;
    return blink ? 0.3 : 1;
  }

  setHold(hold: 'pause' | 'continue' | 'over' | null, continuesLeft = 0): void {
    const visible = hold !== null;
    this.pauseVeil.setVisible(visible);
    this.pauseLabel.setVisible(visible);
    if (hold === 'pause') this.pauseLabel.setText('ПАУЗА');
    if (hold === 'continue') this.pauseLabel.setText(`ENTER  ${continuesLeft}`);
    if (hold === 'over') this.pauseLabel.setText('КОНЕЦ');
  }

  draw(view: FrameLayout, width: number, height: number): void {
    const band = view.hud;
    this.band = band;
    this.frameWidth = width;
    const mid = band.y + Math.round(band.height / 2);
    const heartRight = this.placeIcon(this.heart, 10, mid, hudIcons.heartTrim);
    this.livesText.setPosition(heartRight + 8, mid);
    this.livesText.setText(String(this.lives));
    this.scoreText.setPosition(this.livesText.x + 36, mid);
    this.scoreText.setText(String(this.score).padStart(hud.scoreDigits, '0'));
    this.paintGrenades();
    this.paintBar();
    this.paintWeapon();

    this.pauseVeil.clear();
    this.pauseVeil.fillStyle(palette.black, 0.55);
    this.pauseVeil.fillRect(0, 0, width, height);
    this.pauseLabel.setPosition(width / 2, height / 2);

    this.edge.clear();
    this.edge.fillStyle(palette.ink, 1);
    this.edge.fillRect(0, 0, width, 1);
    this.edge.fillRect(0, height - 1, width, 1);
    this.edge.fillRect(0, 0, 1, height);
    this.edge.fillRect(width - 1, 0, 1, height);
  }

  private paintBar(): void {
    const band = this.band;
    this.enemyLabel.setVisible(this.quota > 0);
    if (!band || this.frameWidth <= 0 || this.quota <= 0) return;
    const labelW = this.enemyLabel.width;
    const groupW = labelW + 8 + enemyBar.width;
    let x = Math.round((this.frameWidth - groupW) / 2);
    const grenadeRight = this.grenadeText.x + this.grenadeText.width + 16;
    if (x < grenadeRight) x = Math.round(grenadeRight);
    const mid = band.y + Math.round(band.height / 2);
    this.enemyLabel.setPosition(x, mid);
    const barX = x + labelW + 8;
    const barY = mid - enemyBar.height / 2;
    const segGap = enemyBar.gap;
    const segW = (enemyBar.width - segGap * (this.quota - 1)) / this.quota;
    const remaining = this.quota - this.slain;
    this.barGfx.clear();
    for (let i = 0; i < this.quota; i += 1) {
      this.barGfx.fillStyle(i < remaining ? palette.enemy : palette.barTrack, 1);
      this.barGfx.fillRect(
        Math.round(barX + i * (segW + segGap)),
        Math.round(barY),
        Math.max(1, Math.floor(segW)),
        enemyBar.height,
      );
    }
  }

  private paintWeapon(): void {
    const band = this.band;
    this.weaponGfx.clear();
    if (!band || this.weapon === 'rifle' || this.frameWidth <= 0) return;
    const mid = band.y + Math.round(band.height / 2);
    const x = this.frameWidth - 36;
    if (this.weapon === 'rapid') {
      this.weaponGfx.fillStyle(palette.rapid, 1);
      for (let i = 0; i < 3; i += 1) this.weaponGfx.fillRect(x + i * 5, mid - 8, 3, 16);
      return;
    }
    this.weaponGfx.fillStyle(palette.spread, 1);
    this.weaponGfx.fillRect(x - 2, mid - 4, 22, 8);
  }

  private paintGrenades(): void {
    const band = this.band;
    if (!band) return;
    const mid = band.y + Math.round(band.height / 2);
    const left = Math.round(this.scoreText.x + this.scoreText.width + 12);
    const grenadeRight = this.placeIcon(this.grenade, left, mid, hudIcons.grenadeTrim);
    this.grenadeText.setText(String(this.grenades));
    this.grenadeText.setColor(cssColor(this.grenades > 0 ? palette.ink : palette.wallCrit));
    this.grenadeText.setPosition(grenadeRight + 6, mid);
  }

  /**
   * Левый край непрозрачных пикселей встаёт в visualLeft, середина рисунка — на mid.
   * Возвращает правый край рисунка.
   */
  private placeIcon(image: Phaser.GameObjects.Image, visualLeft: number, mid: number, trim: IconTrim): number {
    const contentMid = (trim.top + trim.bottom) / 2;
    image.setScale(1);
    image.setPosition(Math.round(visualLeft - trim.left), Math.round(mid - contentMid));
    return Math.round(image.x + trim.right);
  }
}

function hudIcon(scene: Phaser.Scene, key: string): Phaser.GameObjects.Image {
  scene.textures.get(key).setFilter(Phaser.Textures.FilterMode.NEAREST);
  return scene.add.image(0, 0, key).setOrigin(0, 0);
}

function inkFont(size: string): Phaser.Types.GameObjects.Text.TextStyle {
  return {
    fontFamily,
    fontSize: size,
    color: cssColor(palette.ink),
  };
}
