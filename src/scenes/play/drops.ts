import Phaser from 'phaser';
import { grenadeDrop, palette, pickup, plaqueDrop, rapidDrop, soldierBox, spreadDrop, starDrop, type DropKind } from '../../constants';
import { readNum, readRecord, type DropRow } from '../../keep';
import { soldierFeetY, type FrameLayout } from '../../layout';
import type { Sparks } from './sparks';

type Item = {
  kind: DropKind;
  rx: number;
  ry: number;
  fall: number;
  landed: boolean;
  taken: boolean;
  icon: Phaser.GameObjects.Image | null;
};

type Body = {
  x: number;
  y: number;
  w: number;
  h: number;
};

/**
 * Мешок бонусов картинки. Ломается объект — берётся один случайный, без возврата.
 * Лишние записи остаются в мешке и на дорожку не падают.
 */
export class DropBag {
  private left: DropKind[];

  constructor(kinds: readonly DropKind[], need: number, id: string) {
    if (kinds.length < need) {
      throw new Error(`картинка ${id}: бонусов ${kinds.length}, разрушаемых объектов ${need}`);
    }
    this.left = shuffle([...kinds]);
  }

  take(): DropKind {
    const kind = this.left.pop();
    if (kind === undefined) throw new Error('бонусы кончились раньше разрушаемых объектов');
    return kind;
  }

  note(): DropKind[] {
    return [...this.left];
  }

  /** Тот же остаток мешка. Иначе сломанное после обновления выпало бы второй раз другим бонусом. */
  recall(data: unknown): void {
    if (!Array.isArray(data)) return;
    const next: DropKind[] = [];
    for (const item of data) {
      if (isDrop(item)) next.push(item);
    }
    this.left = next;
  }
}

const dropKinds: readonly DropKind[] = [
  'grenades',
  'rapid',
  'spread',
  'star',
  'bonus',
  'medal',
  'ton',
  'fivek',
  'tenk',
];

function isDrop(value: unknown): value is DropKind {
  return dropKinds.includes(value as DropKind);
}

function shuffle<T>(items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const swap = items[i];
    items[i] = items[j];
    items[j] = swap;
  }
  return items;
}

/** Дроп падает твином на дорожку и берётся телом. В воздухе его не подбирают. */
export class Drops {
  private items: Item[] = [];
  private frozen = false;
  private readonly gfx: Phaser.GameObjects.Graphics;
  /** Цифры таблички. Выше плашки, иначе их закрывает картинка. */
  private readonly marks: Phaser.GameObjects.Graphics;
  private readonly scene: Phaser.Scene;
  private readonly sparks: Sparks;
  private readonly onTake: (kind: DropKind) => void;

  constructor(scene: Phaser.Scene, sparks: Sparks, onTake: (kind: DropKind) => void) {
    this.scene = scene;
    this.sparks = sparks;
    this.onTake = onTake;
    this.gfx = scene.add.graphics().setDepth(4.2);
    this.marks = scene.add.graphics().setDepth(4.3);
  }

  note(): DropRow[] {
    return this.items.filter((item) => !item.taken).map((item) => ({ kind: item.kind, rx: item.rx, ry: item.ry }));
  }

  /** Лежащее на дорожке. То, что ещё падало, кладётся сразу: в воздухе после обновления его нет. */
  recall(data: unknown): void {
    if (!Array.isArray(data)) return;
    for (const item of data) {
      const row = readRecord(item);
      if (!row || !isDrop(row.kind)) continue;
      const rx = readNum(row.rx);
      const ry = readNum(row.ry);
      if (rx === null || ry === null) continue;
      this.items.push({
        kind: row.kind,
        rx,
        ry,
        fall: 1,
        landed: true,
        taken: false,
        icon: this.dropIcon(row.kind),
      });
    }
  }

  spawn(kind: DropKind, rx: number, ry: number): void {
    const item: Item = {
      kind,
      rx,
      ry,
      fall: 0,
      landed: false,
      taken: false,
      icon: this.dropIcon(kind),
    };
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
      const box = item.icon ? iconBox(item.kind) : null;
      const span = pickupSpan(item.kind);
      const width = box?.width ?? span;
      const height = box?.height ?? span;
      if (!overlaps(at.x, at.y, width, height, body.x, body.y, body.w, body.h)) continue;
      item.taken = true;
      taken.push(item);
      this.sparks.add(at.x, at.y, 120, 'pop');
    }
    if (taken.length === 0) return;
    this.items = this.items.filter((item) => !item.taken);
    for (const item of taken) {
      item.icon?.destroy();
      this.onTake(item.kind);
    }
  }

  draw(view: FrameLayout): void {
    const gfx = this.gfx;
    gfx.clear();
    this.marks.clear();
    for (const item of this.items) {
      if (item.taken) continue;
      const at = this.point(view, item);
      if (!item.landed) {
        gfx.fillStyle(palette.black, 0.45);
        gfx.fillRect(Math.round(at.x - 6), Math.round(at.landY - 2), 12, 3);
      }
      if (item.icon) {
        item.icon.setPosition(Math.round(at.x), Math.round(at.y));
        const glyphs = plaqueGlyphs(item.kind);
        if (glyphs) paintDigits(this.marks, at.x, at.y, glyphs);
        continue;
      }
      paint(gfx, item.kind, at.x, at.y);
    }
  }

  /** Картинка бонуса. Нет файла — в draw остаётся фигура кода. */
  private dropIcon(kind: DropKind): Phaser.GameObjects.Image | null {
    const box = iconBox(kind);
    if (!box || !this.scene.textures.exists(box.key)) return null;
    return this.scene.add.image(0, 0, box.key).setOrigin(0.5, 0.5).setDepth(4.25);
  }

  private point(view: FrameLayout, item: Item): { x: number; y: number; landY: number } {
    const field = view.field;
    const x = field.x + item.rx * field.width;
    const fromY = field.y + item.ry * field.height;
    const landY = soldierFeetY(view.track) - Math.round(soldierBox.height / 2 - pickup.feet);
    const t = item.landed ? 1 : item.fall;
    return { x, y: fromY + (landY - fromY) * t, landY };
  }
}

function iconBox(kind: DropKind): { key: string; width: number; height: number } | null {
  if (kind === 'grenades') return grenadeDrop;
  if (kind === 'rapid') return rapidDrop;
  if (kind === 'spread') return spreadDrop;
  if (kind === 'star') return starDrop;
  if (plaqueGlyphs(kind)) return plaqueDrop;
  return null;
}

function paint(gfx: Phaser.GameObjects.Graphics, kind: DropKind, x: number, y: number): void {
  const glyphs = plaqueGlyphs(kind);
  if (glyphs) {
    paintPlaque(gfx, x, y, glyphs);
    return;
  }
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

/** «0», «1» и «5». Клетка 3×5. */
const digitGlyph = {
  '0': '###,# #,# #,# #,###',
  '1': '#  ,## , # , # ,###',
  '5': '###,#  ,###,  #,###',
} as const;

function plaqueGlyphs(kind: DropKind): readonly string[] | null {
  const text =
    kind === 'ton'
      ? '100'
      : kind === 'bonus'
        ? '500'
        : kind === 'medal'
          ? '1000'
          : kind === 'fivek'
            ? '5000'
            : kind === 'tenk'
              ? '10000'
              : null;
  if (!text) return null;
  return [...text].map((char) => digitGlyph[char as keyof typeof digitGlyph]);
}

function pickupSpan(kind: DropKind): number {
  if (kind === 'tenk') return 44;
  if (kind === 'medal' || kind === 'fivek') return 36;
  if (kind === 'bonus') return 28;
  return pickup.size;
}

/** Только цифры, по центру плашки. Точка 2 пикселя. */
function paintDigits(
  gfx: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  glyphs: readonly string[],
): void {
  const dot = 2;
  const gap = 2;
  const digitW = 3 * dot;
  const digitH = 5 * dot;
  const width = glyphs.length * digitW + (glyphs.length - 1) * gap;
  const left = Math.round(x - width / 2);
  const top = Math.round(y - digitH / 2);
  gfx.fillStyle(palette.black, 1);
  glyphs.forEach((glyph, index) => {
    const ox = left + index * (digitW + gap);
    glyph.split(',').forEach((row, ry) => {
      for (let rx = 0; rx < row.length; rx += 1) {
        if (row[rx] === '#') gfx.fillRect(ox + rx * dot, top + ry * dot, dot, dot);
      }
    });
  });
}

function paintPlaque(gfx: Phaser.GameObjects.Graphics, x: number, y: number, glyphs: readonly string[]): void {
  const dot = 2;
  const gap = 2;
  const digitW = 3 * dot;
  const digitH = 5 * dot;
  const width = glyphs.length * digitW + (glyphs.length - 1) * gap;
  const left = Math.round(x - width / 2);
  const top = Math.round(y - digitH / 2);
  gfx.fillStyle(palette.black, 1);
  gfx.fillRect(left - 3, top - 3, width + 6, digitH + 6);
  gfx.fillStyle(palette.star, 1);
  gfx.fillRect(left - 2, top - 2, width + 4, digitH + 4);
  paintDigits(gfx, x, y, glyphs);
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
