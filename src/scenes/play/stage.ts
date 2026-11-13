import Phaser from 'phaser';
import { palette } from '../../constants';
import type { FrameLayout, Rect } from '../../layout';

/** Полосы кадра снизу вверх по глубине: небо, поле, дорожка, рамка. */
export class Stage {
  readonly sky: Phaser.GameObjects.Container;
  readonly field: Phaser.GameObjects.Container;
  readonly track: Phaser.GameObjects.Container;
  readonly hud: Phaser.GameObjects.Container;
  private readonly skyFill: Phaser.GameObjects.Graphics;
  private readonly fieldFill: Phaser.GameObjects.Graphics;
  private readonly trackFill: Phaser.GameObjects.Graphics;
  private readonly hudFill: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene) {
    this.sky = layer(scene, 'sky', 0);
    this.field = layer(scene, 'field', 1);
    this.track = layer(scene, 'track', 2);
    this.hud = layer(scene, 'hud', 6);
    this.skyFill = bandFill(scene, this.sky);
    this.fieldFill = bandFill(scene, this.field);
    this.trackFill = bandFill(scene, this.track);
    this.hudFill = bandFill(scene, this.hud);
  }

  paint(view: FrameLayout): void {
    paint(this.skyFill, view.sky, palette.sky);
    paint(this.fieldFill, view.field, palette.field);
    paint(this.trackFill, view.track, palette.track);
    paint(this.hudFill, view.hud, palette.hud);
  }
}

function paint(graphics: Phaser.GameObjects.Graphics, rect: Rect, color: number): void {
  graphics.clear();
  graphics.fillStyle(color, 1);
  graphics.fillRect(rect.x, rect.y, rect.width, rect.height);
}

function bandFill(scene: Phaser.Scene, parent: Phaser.GameObjects.Container): Phaser.GameObjects.Graphics {
  const graphics = scene.add.graphics();
  parent.add(graphics);
  return graphics;
}

function layer(scene: Phaser.Scene, name: string, depth: number): Phaser.GameObjects.Container {
  const band = scene.add.container(0, 0);
  band.name = name;
  band.setDepth(depth);
  return band;
}
