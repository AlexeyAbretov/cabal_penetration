import Phaser from 'phaser';
import { cssColor, enemyBar, hud, palette, type WeaponId } from '../../constants';
import type { FrameLayout, Rect } from '../../layout';

const fontFamily = 'Consolas, "Courier New", monospace';

/** Рамка: сердце, жизни, счёт, полоска ENEMY и пауза. */
export class Hud {
  private lives: number = hud.lives;
  private score = 0;
  private quota = 0;
  private slain = 0;
  private hurtTimer = 0;
  private frameWidth = 0;
  private band: Rect | null = null;
  private readonly heartGfx: Phaser.GameObjects.Graphics;
  private readonly livesText: Phaser.GameObjects.Text;
  private readonly scoreText: Phaser.GameObjects.Text;
  private readonly enemyLabel: Phaser.GameObjects.Text;
  private readonly barGfx: Phaser.GameObjects.Graphics;
  private readonly weaponGfx: Phaser.GameObjects.Graphics;
  private weapon: WeaponId = 'rifle';
  private readonly pauseVeil: Phaser.GameObjects.Graphics;
  private readonly pauseLabel: Phaser.GameObjects.Text;
  private readonly edge: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene, layer: Phaser.GameObjects.Container) {
    const font = inkFont('22px');
    this.heartGfx = scene.add.graphics();
    this.livesText = scene.add.text(0, 0, '', font).setOrigin(0, 0.5);
    this.scoreText = scene.add.text(0, 0, '', font).setOrigin(0, 0.5);
    this.enemyLabel = scene.add.text(0, 0, 'ENEMY', inkFont('18px')).setOrigin(0, 0.5);
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
    layer.add(this.heartGfx);
    layer.add(this.livesText);
    layer.add(this.scoreText);
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

  hurtSoldier(): void {
    this.lives = Math.max(0, this.lives - 1);
    this.hurtTimer = hud.hurtMs;
    this.livesText.setText(String(this.lives));
  }

  setQuota(quota: number): void {
    this.quota = quota;
    this.paintBar();
  }

  addScore(points: number): void {
    this.score += points;
    this.scoreText.setText(String(this.score).padStart(hud.scoreDigits, '0'));
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

  /** Доля непрозрачности тела: мигание, пока держится окно после ранения. */
  stepHurt(delta: number): number {
    this.hurtTimer = Math.max(0, this.hurtTimer - delta);
    const blink = this.hurtTimer > 0 && Math.floor(this.hurtTimer / hud.blinkMs) % 2 === 0;
    return blink ? 0.3 : 1;
  }

  setPaused(paused: boolean): void {
    this.pauseVeil.setVisible(paused);
    this.pauseLabel.setVisible(paused);
  }

  draw(view: FrameLayout, width: number, height: number): void {
    const band = view.hud;
    this.band = band;
    this.frameWidth = width;
    const mid = band.y + Math.round(band.height / 2);
    this.heartGfx.clear();
    this.drawHeart(16, mid - 9);
    this.livesText.setPosition(16 + 7 * 3 + 10, mid);
    this.livesText.setText(String(this.lives));
    this.scoreText.setPosition(this.livesText.x + 36, mid);
    this.scoreText.setText(String(this.score).padStart(hud.scoreDigits, '0'));
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
    if (!band || this.frameWidth <= 0 || this.quota <= 0) return;
    const labelW = this.enemyLabel.width;
    const groupW = labelW + 8 + enemyBar.width;
    let x = Math.round((this.frameWidth - groupW) / 2);
    const scoreRight = this.scoreText.x + this.scoreText.width + 16;
    if (x < scoreRight) x = Math.round(scoreRight);
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

  private drawHeart(x: number, y: number): void {
    const rows = ['0110110', '1111111', '1111111', '0111110', '0011100', '0001000'];
    const step = 3;
    this.heartGfx.fillStyle(palette.heart, 1);
    rows.forEach((row, iy) => {
      [...row].forEach((cell, ix) => {
        if (cell === '1') this.heartGfx.fillRect(x + ix * step, y + iy * step, step, step);
      });
    });
  }
}

function inkFont(size: string): Phaser.Types.GameObjects.Text.TextStyle {
  return {
    fontFamily,
    fontSize: size,
    color: cssColor(palette.ink),
  };
}
