import Phaser from 'phaser';
import { palette } from '../../constants';
import type { FrameLayout, Rect } from '../../layout';
import { blit, ensureCanvas } from './blit';
import type { Pix } from './pix';
import { paintField, paintSky, paintTrack } from './village';

/** Полосы кадра снизу вверх по глубине: небо, поле, дорожка, рамка. */
export class Stage {
  readonly sky: Phaser.GameObjects.Container;
  readonly field: Phaser.GameObjects.Container;
  readonly track: Phaser.GameObjects.Container;
  readonly hud: Phaser.GameObjects.Container;
  private readonly scene: Phaser.Scene;
  private readonly skyImage: Phaser.GameObjects.Image;
  private readonly fieldImage: Phaser.GameObjects.Image;
  private readonly trackImage: Phaser.GameObjects.Image;
  private readonly hudFill: Phaser.GameObjects.Graphics;
  private readonly flat: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.sky = layer(scene, 'sky', 0);
    this.field = layer(scene, 'field', 1);
    this.track = layer(scene, 'track', 2);
    this.hud = layer(scene, 'hud', 6);
    this.skyImage = scene.add.image(0, 0, ensureCanvas(scene, 'band-sky')).setOrigin(0, 0);
    this.fieldImage = scene.add.image(0, 0, ensureCanvas(scene, 'band-field')).setOrigin(0, 0);
    this.trackImage = scene.add.image(0, 0, ensureCanvas(scene, 'band-track')).setOrigin(0, 0);
    this.sky.add(this.skyImage);
    this.field.add(this.fieldImage);
    this.track.add(this.trackImage);
    this.flat = scene.add.graphics();
    this.hudFill = scene.add.graphics();
    this.hud.add(this.hudFill);
  }

  paint(view: FrameLayout, pictureId: string): void {
    if (pictureId === '1-1') this.paintVillage(view);
    else this.paintFlat(view);
    paint(this.hudFill, view.hud, palette.hud);
  }

  private paintVillage(view: FrameLayout): void {
    this.flat.clear();
    put(this.scene, this.skyImage, 'band-sky', paintSky(view.sky.width, view.sky.height), view.sky);
    put(this.scene, this.fieldImage, 'band-field', paintField(view.field.width, view.field.height), view.field);
    put(this.scene, this.trackImage, 'band-track', paintTrack(view.track.width, view.track.height), view.track);
  }

  /** Чужая картинка, пока у неё нет своей земли. */
  private paintFlat(view: FrameLayout): void {
    this.skyImage.setVisible(false);
    this.fieldImage.setVisible(false);
    this.trackImage.setVisible(false);
    this.flat.clear();
    fill(this.flat, view.sky, palette.sky);
    fill(this.flat, view.field, palette.field);
    fill(this.flat, view.track, palette.track);
  }
}

function put(
  scene: Phaser.Scene,
  image: Phaser.GameObjects.Image,
  key: string,
  pix: Pix,
  rect: Rect,
): void {
  if (pix.w < 1 || pix.h < 1) return;
  blit(scene, key, pix);
  image.setTexture(key);
  image.setDisplaySize(pix.w, pix.h);
  image.setPosition(rect.x, rect.y);
  image.setVisible(true);
}

function paint(graphics: Phaser.GameObjects.Graphics, rect: Rect, color: number): void {
  graphics.clear();
  fill(graphics, rect, color);
}

function fill(graphics: Phaser.GameObjects.Graphics, rect: Rect, color: number): void {
  graphics.fillStyle(color, 1);
  graphics.fillRect(rect.x, rect.y, rect.width, rect.height);
}

function layer(scene: Phaser.Scene, name: string, depth: number): Phaser.GameObjects.Container {
  const band = scene.add.container(0, 0);
  band.name = name;
  band.setDepth(depth);
  return band;
}
