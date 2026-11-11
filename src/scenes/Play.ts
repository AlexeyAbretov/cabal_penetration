import Phaser from 'phaser';
import { palette } from '../constants';

/**
 * Пустая сцена. Глубина сзади вперёд: небо, поле, дорожка, рамка HUD.
 * Слои покрывают всё окно. Светлая кромка в один пиксель — край кадра.
 */
export class Play extends Phaser.Scene {
  sky!: Phaser.GameObjects.Container;
  field!: Phaser.GameObjects.Container;
  track!: Phaser.GameObjects.Container;
  hud!: Phaser.GameObjects.Container;
  private edge!: Phaser.GameObjects.Graphics;

  constructor() {
    super('Play');
  }

  create(): void {
    this.cameras.main.setBackgroundColor(palette.black);

    this.sky = this.layer('sky');
    this.field = this.layer('field');
    this.track = this.layer('track');
    this.hud = this.layer('hud');

    this.edge = this.add.graphics();
    this.hud.add(this.edge);

    this.scale.on(Phaser.Scale.Events.RESIZE, this.layout, this);
    this.layout();
  }

  private layout(): void {
    const width = Math.floor(this.scale.gameSize.width);
    const height = Math.floor(this.scale.gameSize.height);

    this.cameras.resize(width, height);
    this.sky.setSize(width, height);
    this.field.setSize(width, height);
    this.track.setSize(width, height);
    this.hud.setSize(width, height);

    this.edge.clear();
    this.edge.fillStyle(palette.ink, 1);
    this.edge.fillRect(0, 0, width, 1);
    this.edge.fillRect(0, height - 1, width, 1);
    this.edge.fillRect(0, 0, 1, height);
    this.edge.fillRect(width - 1, 0, 1, height);
  }

  private layer(name: string): Phaser.GameObjects.Container {
    const layer = this.add.container(0, 0);
    layer.name = name;
    return layer;
  }
}
