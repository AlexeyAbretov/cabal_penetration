import Phaser from 'phaser';
import { palette, pickup, type DropKind } from '../../constants';
import type { FrameLayout } from '../../layout';
import type { Sparks } from './sparks';

type Item = {
  kind: DropKind;
  rx: number;
  ry: number;
  fall: number;
  landed: boolean;
  taken: boolean;
};

type Body = {
  x: number;
  y: number;
  w: number;
  h: number;
};

/** Дроп падает твином на дорожку и берётся телом. В воздухе его не подбирают. */
export class Drops {
  private items: Item[] = [];
  private frozen = false;
  private readonly gfx: Phaser.GameObjects.Graphics;
  private readonly scene: Phaser.Scene;
  private readonly sparks: Sparks;
  private readonly onTake: (kind: DropKind) => void;

  constructor(scene: Phaser.Scene, sparks: Sparks, onTake: (kind: DropKind) => void) {
    this.scene = scene;
    this.sparks = sparks;
    this.onTake = onTake;
    this.gfx = scene.add.graphics().setDepth(4.2);
  }

  spawn(kind: DropKind, rx: number, ry: number): void {
    const item: Item = { kind, rx, ry, fall: 0, landed: false, taken: false };
    this.items.push(item);
    this.scene.tweens.add({
      targets: item,
      fall: 1,
      duration: pickup.fallMs,
      ease: 'Quad.easeIn',
      onComplete: () => {
        item.landed = true;
      },
    });
  }

  /** Граница сцены: лежащее уже не берётся. Ствол к этому моменту уже сгорел. */
  freeze(): void {
    this.frozen = true;
  }

  step(view: FrameLayout, body: Body): void {
    if (this.frozen) return;
    const taken: Item[] = [];
    for (const item of this.items) {
      if (!item.landed || item.taken) continue;
      const at = this.point(view, item);
      if (!overlaps(at.x, at.y, pickup.size, pickup.size, body.x, body.y, body.w, body.h)) continue;
      item.taken = true;
      taken.push(item);
      this.sparks.add(at.x, at.y, 120, 'pop');
    }
    if (taken.length === 0) return;
    this.items = this.items.filter((item) => !item.taken);
    for (const item of taken) this.onTake(item.kind);
  }

  draw(view: FrameLayout): void {
    const gfx = this.gfx;
    gfx.clear();
    for (const item of this.items) {
      if (item.taken) continue;
      const at = this.point(view, item);
      if (!item.landed) {
        gfx.fillStyle(palette.black, 0.45);
        gfx.fillRect(Math.round(at.x - 6), Math.round(at.landY - 2), 12, 3);
      }
      paint(gfx, item.kind, at.x, at.y);
    }
  }

  private point(view: FrameLayout, item: Item): { x: number; y: number; landY: number } {
    const field = view.field;
    const x = field.x + item.rx * field.width;
    const fromY = field.y + item.ry * field.height;
    const landY = view.track.y + view.track.height / 2 + pickup.feet;
    const t = item.landed ? 1 : item.fall;
    return { x, y: fromY + (landY - fromY) * t, landY };
  }
}

function paint(gfx: Phaser.GameObjects.Graphics, kind: DropKind, x: number, y: number): void {
  const s = pickup.size;
  const left = Math.round(x - s / 2);
  const top = Math.round(y - s / 2);
  gfx.fillStyle(palette.black, 1);
  gfx.fillRect(left - 1, top - 1, s + 2, s + 2);
  if (kind === 'grenades') {
    gfx.fillStyle(palette.grenade, 1);
    gfx.fillRect(left + 2, top + 3, s - 4, s - 7);
    gfx.fillStyle(palette.grenadeArc, 1);
    gfx.fillRect(left + 4, top + 1, s - 8, 3);
    return;
  }
  if (kind === 'rapid') {
    gfx.fillStyle(palette.rapid, 1);
    gfx.fillRect(left + 3, top + 2, 2, s - 4);
    gfx.fillRect(left + 8, top + 2, 2, s - 4);
    gfx.fillRect(left + 13, top + 2, 2, s - 4);
    return;
  }
  if (kind === 'spread') {
    gfx.fillStyle(palette.spread, 1);
    gfx.fillRect(left + 2, top + Math.round(s / 2) - 3, s - 4, 6);
    return;
  }
  const r = s / 2 - 2;
  gfx.fillStyle(palette.star, 1);
  gfx.fillTriangle(x, y - r, x + r, y, x, y + r);
  gfx.fillTriangle(x, y - r, x - r, y, x, y + r);
}

function overlaps(
  ax: number,
  ay: number,
  aw: number,
  ah: number,
  bx: number,
  by: number,
  bw: number,
  bh: number,
): boolean {
  return Math.abs(ax - bx) * 2 < aw + bw && Math.abs(ay - by) * 2 < ah + bh;
}
