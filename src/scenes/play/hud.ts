import Phaser from 'phaser';
import { cssColor, hud, palette } from '../../constants';
import type { FrameLayout } from '../../layout';

const fontFamily = 'Consolas, "Courier New", monospace';

/** Рамка: сердце, жизни, счёт и пауза. */
export class Hud {
  private lives: number = hud.lives;
  private score = 0;
  private hurtTimer = 0;
  private readonly heartGfx: Phaser.GameObjects.Graphics;
  private readonly livesText: Phaser.GameObjects.Text;
  private readonly scoreText: Phaser.GameObjects.Text;
  private readonly pauseVeil: Phaser.GameObjects.Graphics;
  private readonly pauseLabel: Phaser.GameObjects.Text;
  private readonly edge: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene, layer: Phaser.GameObjects.Container) {
    const font = inkFont('22px');
    this.heartGfx = scene.add.graphics();
    this.livesText = scene.add.text(0, 0, '', font).setOrigin(0, 0.5);
    this.scoreText = scene.add.text(0, 0, '', font).setOrigin(0, 0.5);
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
    const mid = band.y + Math.round(band.height / 2);
    this.heartGfx.clear();
    this.drawHeart(16, mid - 9);
    this.livesText.setPosition(16 + 7 * 3 + 10, mid);
    this.livesText.setText(String(this.lives));
    this.scoreText.setPosition(this.livesText.x + 36, mid);
    this.scoreText.setText(String(this.score).padStart(hud.scoreDigits, '0'));

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
