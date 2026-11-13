import Phaser from 'phaser';
import { columnIndex } from '../../combat';
import { palette, wall } from '../../constants';
import { rangeWall } from '../../data/range';
import type { FrameLayout } from '../../layout';
import type { Sparks } from './sparks';

export type WallGeom = {
  top: number;
  height: number;
  trackX: number;
  trackY: number;
  trackH: number;
  colW: number;
};

/** Передняя стена по колонкам дорожки. Целая секция закрывает тело. */
export class FrontWall {
  private readonly hp: number[];

  constructor() {
    this.hp = rangeWall.map((up) => (up ? wall.hits : 0));
  }

  up(column: number): boolean {
    return (this.hp[column] ?? 0) > 0;
  }

  columnWidth(view: FrameLayout): number {
    return view.track.width / this.hp.length;
  }

  columnAt(view: FrameLayout, x: number): number {
    const track = view.track;
    return columnIndex(x, track.x, track.width, this.hp.length);
  }

  columnCenter(view: FrameLayout, column: number): number {
    const geom = this.geom(view);
    return geom.trackX + (column + 0.5) * geom.colW;
  }

  /** Колонка прицела, если точка лежит на лице живой секции. Иначе выстрел стену не берёт. */
  aimColumn(view: FrameLayout, aimX: number, aimY: number): number | null {
    const track = view.track;
    const top = track.y - wall.intoField;
    if (aimY < top || aimY >= track.y) return null;
    const index = this.columnAt(view, aimX);
    return this.hp[index] > 0 ? index : null;
  }

  /** Точка, куда прилетает пуля таймера: лицо секции или середина дорожки, если секции нет. */
  impact(view: FrameLayout, column: number): { x: number; y: number } {
    const geom = this.geom(view);
    const y = this.up(column) ? geom.top : Math.round(view.track.y + view.track.height / 2);
    return { x: this.columnCenter(view, column), y };
  }

  chip(column: number, x: number, y: number, sparks: Sparks): void {
    const hp = this.hp[column] ?? 0;
    if (hp <= 0) return;
    this.hp[column] = hp - 1;
    sparks.add(x, y, 90, 'chip');
  }

  geom(view: FrameLayout): WallGeom {
    const track = view.track;
    const bottom = Math.round(track.y + track.height / 2);
    const top = Math.round(track.y - wall.intoField);
    return {
      top,
      height: Math.max(1, bottom - top),
      trackX: track.x,
      trackY: track.y,
      trackH: track.height,
      colW: track.width / this.hp.length,
    };
  }

  draw(gfx: Phaser.GameObjects.Graphics, view: FrameLayout): void {
    const geom = this.geom(view);
    const gap = 3;
    const stripeH = (geom.height - gap * (wall.stripes - 1)) / wall.stripes;
    for (let i = 0; i < this.hp.length; i += 1) {
      const hp = this.hp[i] ?? 0;
      const x = Math.round(geom.trackX + i * geom.colW + wall.seam / 2);
      const width = Math.round(geom.colW - wall.seam);
      if (hp <= 0 || width <= 0) {
        gfx.fillStyle(palette.wallGone, 1);
        gfx.fillRect(x, geom.trackY, Math.max(0, width), 5);
        continue;
      }
      const lost = wall.hits - hp;
      const wounded = Math.ceil(lost / (wall.hits / wall.stripes));
      for (let stripe = 0; stripe < wall.stripes; stripe += 1) {
        const color =
          hp <= wall.hits / wall.stripes
            ? palette.wallCrit
            : stripe < wounded
              ? palette.wallHurt
              : stripe % 2 === 0
                ? palette.wall
                : palette.wallBand;
        const y = Math.round(geom.top + stripe * (stripeH + gap));
        gfx.fillStyle(color, 1);
        gfx.fillRect(x, y, width, Math.max(1, Math.round(stripeH)));
      }
    }
  }

  drawNotch(gfx: Phaser.GameObjects.Graphics, view: FrameLayout, soldierColumn: number): void {
    const geom = this.geom(view);
    const x = Math.round(geom.trackX + soldierColumn * geom.colW + wall.seam / 2);
    const width = Math.round(geom.colW - wall.seam);
    const y = Math.round(geom.trackY + geom.trackH - 5);
    gfx.fillStyle(palette.notch, 1);
    gfx.fillRect(x, y, Math.max(1, width), 3);
  }
}
