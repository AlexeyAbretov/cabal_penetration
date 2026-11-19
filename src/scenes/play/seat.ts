import Phaser from 'phaser';
import type { GroundAt, GroundTone } from '../../campaign/ground';
import { palette } from '../../constants';
import type { Rect } from '../../layout';
import { hash } from './pix';

/** Заливка поля, когда у картинки нет своей земли. */
export const plainAt: GroundAt = (): GroundTone => ({ tone: palette.field, dirt: false });

/**
 * Подошва листа на земле. Генерация обрезает низ прямой линией,
 * и забор читается наклейкой. Кромку закрывает та же земля, что под ним,
 * а перед подошвой лежит короткая рваная тень из тёмных пикселей газона и дороги.
 * Хитбокс не двигается: закрываются только уже нарисованные пиксели листа.
 */

type Sole = {
  w: number;
  h: number;
  /** Нижний непрозрачный ряд исходника, -1 если столбец пуст. */
  y: Int16Array;
  /** Цвет кладки над контуром. -1, если взять нечего. */
  lip: Int32Array;
};

const soles = new Map<string, Sole>();
const OUTLINE = 0x1a140e;

function readSole(scene: Phaser.Scene, key: string): Sole | null {
  const cached = soles.get(key);
  if (cached) return cached;
  if (!scene.textures.exists(key)) return null;
  const image = scene.textures.get(key).getSourceImage() as CanvasImageSource & {
    width?: number;
    height?: number;
  };
  const w = image.width ?? 0;
  const h = image.height ?? 0;
  if (w < 1 || h < 1) return null;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(image, 0, 0);
  const data = ctx.getImageData(0, 0, w, h).data;
  const y = new Int16Array(w);
  const lip = new Int32Array(w);
  y.fill(-1);
  lip.fill(-1);
  let opaque = false;
  for (let x = 0; x < w; x += 1) {
    let yb = -1;
    for (let row = h - 1; row >= 0; row -= 1) {
      if (data[(row * w + x) * 4 + 3] > 16) {
        yb = row;
        break;
      }
    }
    y[x] = yb;
    if (yb < 0) continue;
    opaque = true;
    for (let up = 1; up <= 4; up += 1) {
      const row = yb - up;
      if (row < 0) break;
      const i = (row * w + x) * 4;
      if (data[i + 3] < 200) continue;
      const color = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
      if (color === OUTLINE) continue;
      lip[x] = color;
      break;
    }
  }
  if (!opaque) return null;
  const sole: Sole = { w, h, y, lip };
  soles.set(key, sole);
  return sole;
}

type Column = { x: number; cut: number; lip: number };

/**
 * `buryCap` — на сколько пикселей земля заходит на лист.
 * Крайние секции прогона получают наплыв снаружи, стык между своими — нет.
 * false — лист ещё не прочитан, кадр стоит повторить.
 */
export function paintSeat(
  gfx: Phaser.GameObjects.Graphics,
  scene: Phaser.Scene,
  sprite: Phaser.GameObjects.Sprite,
  field: Rect,
  track: Rect,
  buryCap: number,
  ends: { left: boolean; right: boolean; tuft: boolean },
  at: GroundAt,
): boolean {
  const sole = readSole(scene, sprite.texture.key);
  if (!sole || sprite.displayWidth < 1 || sprite.displayHeight < 1) return false;
  const scaleX = sprite.displayWidth / sole.w;
  const scaleY = sprite.displayHeight / sole.h;
  const left = sprite.x - sprite.displayWidth / 2;
  const top = sprite.y - sprite.displayHeight;
  const x0 = Math.floor(left);
  const x1 = Math.ceil(left + sprite.displayWidth);
  const cols: Column[] = [];
  for (let x = x0; x < x1; x += 1) {
    const sx0 = Math.floor((x - left) / scaleX);
    const sx1 = Math.floor((x + 1 - left) / scaleX);
    let best = -1;
    let lip = -1;
    for (let sx = sx0; sx <= sx1; sx += 1) {
      if (sx < 0 || sx >= sole.w) continue;
      if (sole.y[sx] > best) {
        best = sole.y[sx];
        lip = sole.lip[sx];
      }
    }
    if (best < 0) continue;
    const edge = top + (best + 1) * scaleY;
    cols.push({ x, cut: Math.floor(edge - 1e-4), lip });
  }
  cols.forEach((col, index) => {
    const end = (ends.left && index === 0) || (ends.right && index === cols.length - 1);
    cover(gfx, col, field, track, buryCap, ends.tuft, end, at);
  });
  const last = cols[cols.length - 1];
  if (ends.left && cols[0]) spill(gfx, cols[0], -1, field, track, at);
  if (ends.right && last) spill(gfx, last, 1, field, track, at);
  return true;
}

function cover(
  gfx: Phaser.GameObjects.Graphics,
  col: Column,
  field: Rect,
  track: Rect,
  buryCap: number,
  tuft: boolean,
  end: boolean,
  at: GroundAt,
): void {
  const n = hash(col.x, col.cut);
  let bury = 1 + (n % Math.max(1, buryCap));
  if (tuft && hash(col.x, col.cut + 17) % 7 === 0) bury += 2;
  if (end) bury += 1;
  for (let k = 0; k < bury; k += 1) {
    const py = col.cut - k;
    gfx.fillStyle(at(col.x, py, field, track).tone, 1);
    gfx.fillRect(col.x, py, 1, 1);
  }
  if (col.lip >= 0 && n % 6 === 0) {
    gfx.fillStyle(col.lip, 1);
    gfx.fillRect(col.x, col.cut + 1, 1, 1);
    return;
  }
  shade(gfx, col.x, col.cut, 2 + (n % 3), field, track, at);
}

function spill(
  gfx: Phaser.GameObjects.Graphics,
  col: Column,
  dir: number,
  field: Rect,
  track: Rect,
  at: GroundAt,
): void {
  for (let i = 1; i <= 2; i += 1) {
    const x = col.x + dir * i;
    if (hash(x, col.cut) % 3 === 0) continue;
    shade(gfx, x, col.cut, i === 1 ? 2 : 1, field, track, at);
  }
}

/** Тёмные крапины газона или дороги. Пустые места оставляют уже нарисованную землю. */
function shade(
  gfx: Phaser.GameObjects.Graphics,
  x: number,
  cut: number,
  reach: number,
  field: Rect,
  track: Rect,
  at: GroundAt,
): void {
  for (let dy = 0; dy < reach; dy += 1) {
    const py = cut + 1 + dy;
    const roll = hash(x, py) % 5;
    if (dy === 0 && roll > 2) continue;
    if (dy === 1 && roll > 1) continue;
    if (dy >= 2 && roll !== 0) continue;
    const sample = at(x, py, field, track);
    const deep = sample.dirt ? palette.dirtDark : roll === 0 ? palette.grassDeep : palette.grassDark;
    gfx.fillStyle(deep, 1);
    gfx.fillRect(x, py, 1, 1);
  }
}
