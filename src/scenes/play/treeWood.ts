import Phaser from 'phaser';
import { Pix } from './pix';

/**
 * Каркас дерева и сломанный лист с PixelLab. Фон уже прозрачный.
 * Файлы лежат в public/assets/tree-wood.png и public/assets/tree-broken.png.
 */
export const treeWoodAsset = {
  key: 'tree-wood',
  url: 'assets/tree-wood.png',
} as const;

export const treeBrokenAsset = {
  key: 'tree-broken',
  url: 'assets/tree-broken.png',
} as const;

type Wood = {
  pix: Pix;
  x: number;
  y: number;
  w: number;
  h: number;
};

type Broken = Wood & {
  /** Середина пня, пиксель полного листа. */
  stump: number;
};

let wood: Wood | null = null;
let broken: Broken | null = null;

/** Снимает пиксели после загрузки. Повторный вызов добирает только то, чего ещё нет. */
export function captureTreeWood(scene: Phaser.Scene): void {
  if (!wood) wood = readSheet(scene, treeWoodAsset.key);
  if (!broken) {
    const sheet = readSheet(scene, treeBrokenAsset.key);
    if (sheet) broken = { ...sheet, stump: stumpCenter(sheet) };
  }
}

export type TreeWoodGrid = {
  dw: number;
  dh: number;
  /** 1 — кора. Индекс y * dw + x, от левого верхнего угла каркаса. */
  bark: Uint8Array;
  /** Цвет коры, 0xRRGGBB. */
  color: Uint32Array;
};

/**
 * Тот же масштаб, что у постановки: ближайший пиксель, без сглаживания.
 * height — высота непрозрачной части.
 */
export function treeWoodGrid(height: number): TreeWoodGrid | null {
  if (!wood || height < 8) return null;
  const dh = Math.max(1, Math.round(height));
  const dw = Math.max(1, Math.round((wood.w * dh) / wood.h));
  const bark = new Uint8Array(dw * dh);
  const color = new Uint32Array(dw * dh);
  const src = wood.pix;
  for (let y = 0; y < dh; y += 1) {
    const sy = wood.y + Math.min(wood.h - 1, Math.floor(((y + 0.5) * wood.h) / dh));
    for (let x0 = 0; x0 < dw; x0 += 1) {
      const sx = wood.x + Math.min(wood.w - 1, Math.floor(((x0 + 0.5) * wood.w) / dw));
      const si = (sy * src.w + sx) * 4;
      if (src.data[si + 3]! < 128) continue;
      const i = y * dw + x0;
      bark[i] = 1;
      color[i] = (src.data[si]! << 16) | (src.data[si + 1]! << 8) | src.data[si + 2]!;
    }
  }
  return { dw, dh, bark, color };
}

export type TreeBrokenGrid = TreeWoodGrid & {
  /** Середина пня от левого края сетки. Дробная: якорь между пикселями. */
  stump: number;
};

/**
 * Тот же масштаб, что у стоящего дерева: пиксель листа к пикселю листа.
 * height — высота непрозрачной части стоящего дерева, не этого кадра.
 * Пустая полоса сверху не растягивает сломанный рисунок до высоты кроны.
 * mirror кладёт крону в другую сторону, пень остаётся якорем.
 */
export function treeBrokenGrid(height: number, mirror: boolean): TreeBrokenGrid | null {
  if (!broken || !wood || height < 8) return null;
  const dh = Math.max(1, Math.round((broken.h * height) / wood.h));
  const dw = Math.max(1, Math.round((broken.w * dh) / broken.h));
  const bark = new Uint8Array(dw * dh);
  const color = new Uint32Array(dw * dh);
  const src = broken.pix;
  for (let y = 0; y < dh; y += 1) {
    const sy = broken.y + Math.min(broken.h - 1, Math.floor(((y + 0.5) * broken.h) / dh));
    for (let x0 = 0; x0 < dw; x0 += 1) {
      const u = Math.min(broken.w - 1, Math.floor(((x0 + 0.5) * broken.w) / dw));
      const sx = broken.x + (mirror ? broken.w - 1 - u : u);
      const si = (sy * src.w + sx) * 4;
      if (src.data[si + 3]! < 128) continue;
      const i = y * dw + x0;
      bark[i] = 1;
      color[i] = (src.data[si]! << 16) | (src.data[si + 1]! << 8) | src.data[si + 2]!;
    }
  }
  const frac = (broken.stump - broken.x) / broken.w;
  return { dw, dh, bark, color, stump: (mirror ? 1 - frac : frac) * dw };
}

/** Ставит уже посчитанный каркас подошвой на землю, серединой на x. */
export function stampTreeWood(dst: Pix, grid: TreeWoodGrid, x: number, ground: number): void {
  const left = Math.round(x - grid.dw / 2);
  const top = Math.round(ground - grid.dh);
  for (let y = 0; y < grid.dh; y += 1) {
    for (let x0 = 0; x0 < grid.dw; x0 += 1) {
      const i = y * grid.dw + x0;
      if (!grid.bark[i]) continue;
      dst.px(left + x0, top + y, grid.color[i]!);
    }
  }
}

/**
 * Ставит каркас подошвой на землю, серединой кроны на x.
 * height — высота непрозрачной части, ближайший пиксель без сглаживания.
 */
export function placeTreeWood(dst: Pix, x: number, ground: number, height: number): void {
  const grid = treeWoodGrid(height);
  if (!grid) return;
  stampTreeWood(dst, grid, x, ground);
}

function readSheet(scene: Phaser.Scene, key: string): Wood | null {
  if (!scene.textures.exists(key)) return null;
  const source = scene.textures.get(key).getSourceImage();
  if (!(source instanceof HTMLImageElement) && !(source instanceof HTMLCanvasElement)) return null;
  const w = source instanceof HTMLImageElement ? source.naturalWidth : source.width;
  const h = source instanceof HTMLImageElement ? source.naturalHeight : source.height;
  if (w < 1 || h < 1) return null;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(source, 0, 0);
  const pix = new Pix(w, h);
  pix.data.set(ctx.getImageData(0, 0, w, h).data);
  const box = opaqueBox(pix);
  if (!box) return null;
  return { pix, ...box };
}

/**
 * Середина пня: левый сплошной столб, который стоит на земле.
 * Лежащая крона бывает выше, но редкая, поэтому одной высотой её не отсечь.
 * Короткая дырка внутри пня столб не рвёт. Корень и тонкая ветка не считаются.
 */
function stumpCenter(sheet: Wood): number {
  const { pix } = sheet;
  const y0 = sheet.y;
  const y1 = sheet.y + sheet.h - 1;
  const ground = Math.max(2, Math.round(sheet.h * 0.04));
  const minSpan = sheet.h * 0.28;
  const solid: boolean[] = [];
  for (let x = sheet.x; x < sheet.x + sheet.w; x += 1) {
    let top = -1;
    let bot = -1;
    let n = 0;
    for (let y = y0; y <= y1; y += 1) {
      if (pix.data[(y * pix.w + x) * 4 + 3]! < 128) continue;
      if (top < 0) top = y;
      bot = y;
      n += 1;
    }
    const span = top < 0 ? 0 : bot - top + 1;
    solid.push(span >= minSpan && bot >= y1 - ground && n >= span * 0.55);
  }
  const bridge = Math.max(2, Math.round(sheet.w * 0.08));
  const start = solid.indexOf(true);
  if (start < 0) return sheet.x + sheet.w / 2;
  let end = start;
  let gap = 0;
  for (let i = start + 1; i < solid.length; i += 1) {
    if (solid[i]) {
      end = i;
      gap = 0;
      continue;
    }
    gap += 1;
    if (gap > bridge) break;
  }
  return sheet.x + (start + end + 1) / 2;
}

function opaqueBox(pix: Pix): { x: number; y: number; w: number; h: number } | null {
  let minX = pix.w;
  let minY = pix.h;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < pix.h; y += 1) {
    for (let x = 0; x < pix.w; x += 1) {
      if (pix.data[(y * pix.w + x) * 4 + 3]! < 128) continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < minX || maxY < minY) return null;
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}
