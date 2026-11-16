import Phaser from 'phaser';
import { columnIndex } from '../../combat';
import { palette, wall } from '../../constants';
import { soldierBodyY, wallBottomY, wallTopY, type FrameLayout } from '../../layout';
import { hash } from './pix';
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

  constructor(mask: readonly boolean[]) {
    this.hp = mask.map((up) => (up ? wall.hits : 0));
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
    const top = wallTopY(track);
    const bottom = wallBottomY(track);
    if (aimY < top || aimY >= bottom) return null;
    const index = this.columnAt(view, aimX);
    return this.hp[index] > 0 ? index : null;
  }

  /** Точка, куда прилетает пуля: макушка секции или середина тела, если секции нет. */
  impact(view: FrameLayout, column: number): { x: number; y: number } {
    const geom = this.geom(view);
    const y = this.up(column) ? geom.top : soldierBodyY(view.track);
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
    const bottom = wallBottomY(track);
    const top = wallTopY(track);
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
    const courses = wall.stripes;
    const per = wall.hits / courses;
    const gap = 2;
    const courseH = (geom.height - gap * (courses - 1)) / courses;
    for (let i = 0; i < this.hp.length; i += 1) {
      const hp = this.hp[i] ?? 0;
      const x = Math.round(geom.trackX + i * geom.colW + wall.seam / 2);
      const width = Math.round(geom.colW - wall.seam);
      if (width <= 0) continue;
      if (hp <= 0) {
        rubble(gfx, x, geom.trackY, width, i);
        continue;
      }
      const gone = Math.min(courses - 1, Math.floor((wall.hits - hp) / per));
      const chipped = (wall.hits - hp) % per !== 0;
      const y0 = Math.round(geom.top + gone * (courseH + gap));
      const bottom = geom.top + geom.height;
      gfx.fillStyle(palette.mortar, 1);
      gfx.fillRect(x, y0, width, Math.max(1, bottom - y0));
      gfx.fillStyle(palette.joint, 1);
      gfx.fillRect(Math.round(geom.trackX + i * geom.colW), y0, Math.max(1, wall.seam - 1), Math.max(1, bottom - y0));
      for (let course = gone; course < courses; course += 1) {
        const y = Math.round(geom.top + course * (courseH + gap));
        const ch = Math.max(3, Math.round(courseH));
        const hurt = course === gone && (chipped || hp <= per);
        stones(gfx, x, y, width, ch, i, course, hurt, hp <= per);
      }
    }
  }
}

function rubble(gfx: Phaser.GameObjects.Graphics, x: number, y: number, width: number, column: number): void {
  for (let k = 0; k < 4; k += 1) {
    const n = hash(column * 9 + k, 4);
    const rw = 4 + (n % 6);
    const rh = 3 + (n % 3);
    const span = Math.max(1, width - rw);
    gfx.fillStyle(k % 2 === 0 ? palette.wall : palette.brickDark, 1);
    gfx.fillRect(x + (n % span), y + (n % 7), rw, rh);
  }
}

/** Песчаник вперевязку. Сбитый верхний ряд теряет камни, колонка при этом ещё стоит. */
function stones(
  gfx: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  width: number,
  height: number,
  column: number,
  course: number,
  hurt: boolean,
  crit: boolean,
): void {
  const count = Math.max(1, Math.floor(width / 14));
  const sw = width / count;
  const bond = course % 2 === 1 ? sw / 2 : 0;
  gfx.fillStyle(palette.wallLite, 1);
  gfx.fillRect(x, y, width, 2);
  const missing = hurt ? hash(column, course) % count : -1;
  for (let s = 0; s < count; s += 1) {
    if (s === missing) continue;
    const raw = x + s * sw + bond;
    const bx = Math.max(x + 1, Math.round(raw));
    const ex = Math.min(x + width - 1, Math.round(raw + sw - 1));
    if (ex - bx < 2) continue;
    const tone = crit ? palette.wallCrit : hurt ? palette.wallHurt : (s + course) % 2 === 0 ? palette.wall : palette.wallBand;
    gfx.fillStyle(tone, 1);
    gfx.fillRect(bx, y + 2, ex - bx, Math.max(1, height - 4));
    gfx.fillStyle(palette.wallLite, 1);
    gfx.fillRect(bx, y + 2, ex - bx, 1);
    gfx.fillStyle(palette.joint, 1);
    gfx.fillRect(bx, y + height - 2, ex - bx, 1);
  }
}
