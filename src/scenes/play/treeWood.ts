import Phaser from 'phaser';
import { Pix } from './pix';

/**
 * Каркас дерева с листа PixelLab. Фон уже прозрачный.
 * Файл лежит в public/assets/tree-wood.png.
 */
export const treeWoodAsset = {
  key: 'tree-wood',
  url: 'assets/tree-wood.png',
} as const;

type Wood = {
  pix: Pix;
  x: number;
  y: number;
  w: number;
  h: number;
};

let wood: Wood | null = null;

/** Снимает пиксели после загрузки. Повторный вызов ничего не делает. */
export function captureTreeWood(scene: Phaser.Scene): void {
  if (wood) return;
  if (!scene.textures.exists(treeWoodAsset.key)) return;
  const source = scene.textures.get(treeWoodAsset.key).getSourceImage();
  if (!(source instanceof HTMLImageElement) && !(source instanceof HTMLCanvasElement)) return;
  const w = source instanceof HTMLImageElement ? source.naturalWidth : source.width;
  const h = source instanceof HTMLImageElement ? source.naturalHeight : source.height;
  if (w < 1 || h < 1) return;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(source, 0, 0);
  const pix = new Pix(w, h);
  pix.data.set(ctx.getImageData(0, 0, w, h).data);
  const box = opaqueBox(pix);
  if (!box) return;
  wood = { pix, ...box };
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
