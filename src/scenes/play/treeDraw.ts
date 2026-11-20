import { palette } from '../../constants';
import { hash, Pix } from './pix';
import { stampTreeWood, treeBrokenGrid, treeWoodGrid, type TreeWoodGrid } from './treeWood';

export type TreeBox = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

export type TreeSprite = {
  pix: Pix;
  /** Доля ширины кадра, где середина ствола. Подошва на нижней строке. */
  ox: number;
  /** Хитбокс стоящего дерева, пиксели кадра. Кучи в нём нет. */
  hit: TreeBox;
  /** Крона в пикселях кадра. sole — строка подошвы. */
  crown: { left: number; right: number; top: number; sole: number };
};

/**
 * Стоящее дерево или сломанный ствол.
 * Слом — один лист для живого и сухого: пень на месте ствола, крона лежит рядом.
 * dir < 0 зеркалит лист. Куча листьев — по ширине кроны, у подошвы.
 */
export function paintTree(
  height: number,
  live: boolean,
  broken: boolean,
  pile: boolean,
  dir: 1 | -1,
): TreeSprite | null {
  const grid = treeWoodGrid(height);
  if (!grid) return null;
  const trunk = trunkTop(grid.bark, grid.dw, grid.dh);
  if (broken) return paintBroken(grid, trunk, height, live, pile, dir);
  const axis = trunkAxis(grid, trunk);
  const tip = Math.ceil(height * 0.1);
  const half = Math.ceil(grid.dw / 2 + height + tip);
  const w = half * 2 + 1;
  // sole — кромка подошвы, не пиксель. Последний ряд коры на ней сидит.
  const sole = tip + grid.dh;
  const h = sole;
  const left = half - Math.round(axis.cx);
  const top = tip;
  const pix = new Pix(w, h);
  const crown = crownBox(grid, trunk);
  const crownPix = {
    left: left + crown.left,
    right: left + crown.right,
    top: top + crown.high,
    sole,
  };
  if (live && pile) leafPile(pix, crownPix.left, crownPix.right, sole);
  stampTreeWood(pix, grid, left + grid.dw / 2, top + grid.dh);
  if (live) crownLeaves(pix, grid, left, top, trunk);
  return { pix, ox: half / w, hit: bodyHit(grid, left, top, live, trunk), crown: crownPix };
}

/** Оба типа. Пень стоит там, где был ствол. Крона листа лежит в сторону dir. */
function paintBroken(
  grid: TreeWoodGrid,
  trunk: number,
  height: number,
  live: boolean,
  pile: boolean,
  dir: 1 | -1,
): TreeSprite | null {
  const sheet = treeBrokenGrid(height, dir < 0);
  if (!sheet) return null;
  const crown = crownBox(grid, trunk);
  const crownW = Math.max(1, crown.right - crown.left);
  const stump = sheet.stump;
  let minX = 0;
  let maxX = sheet.dw;
  if (live && pile) {
    minX = Math.min(minX, Math.floor(stump - crownW / 2));
    maxX = Math.max(maxX, Math.ceil(stump + crownW / 2));
  }
  const w = Math.max(1, maxX - minX);
  const h = sheet.dh;
  const pix = new Pix(w, h);
  const sole = h;
  const at = stump - minX;
  if (live && pile) leafPile(pix, at - crownW / 2, at + crownW / 2, sole);
  for (let y = 0; y < sheet.dh; y += 1) {
    for (let x = 0; x < sheet.dw; x += 1) {
      const i = y * sheet.dw + x;
      if (!sheet.bark[i]) continue;
      pix.px(x - minX, y, sheet.color[i]!);
    }
  }
  return {
    pix,
    ox: at / w,
    hit: { left: -minX, right: -minX + sheet.dw, top: 0, bottom: h },
    crown: { left: at - crownW / 2, right: at + crownW / 2, top: 0, sole },
  };
}

function bodyHit(grid: TreeWoodGrid, left: number, top: number, live: boolean, trunk: number): TreeBox {
  const { dw, dh, bark } = grid;
  let minX = dw;
  let maxX = -1;
  let minY = dh;
  let maxY = -1;
  for (let y = 0; y < dh; y += 1) {
    const row = y * dw;
    for (let x = 0; x < dw; x += 1) {
      if (!bark[row + x]) continue;
      const r = live && y < trunk ? clumpRadius(bark, dw, dh, x, y) : 0;
      if (x - r < minX) minX = x - r;
      if (x + r > maxX) maxX = x + r;
      if (y - r < minY) minY = y - r;
      if (y + r > maxY) maxY = y + r;
    }
  }
  if (maxX < minX) return { left, right: left + 1, top: top + dh - 1, bottom: top + dh };
  return { left: left + minX, right: left + maxX + 1, top: top + minY, bottom: top + maxY + 1 };
}

function crownBox(grid: TreeWoodGrid, trunk: number): { left: number; right: number; high: number } {
  const { dw, bark, dh } = grid;
  let left = dw;
  let right = -1;
  let high = trunk;
  for (let y = 0; y < trunk; y += 1) {
    const row = y * dw;
    for (let x = 0; x < dw; x += 1) {
      if (!bark[row + x]) continue;
      const r = clumpRadius(bark, dw, dh, x, y);
      if (x - r < left) left = x - r;
      if (x + r > right) right = x + r;
      if (y - r < high) high = y - r;
    }
  }
  if (right < left) return { left: 0, right: dw - 1, high: 0 };
  return { left, right, high };
}

/**
 * Крона — всё выше узкого ствола. Тонкая ветка получает ком листьев,
 * кончик ещё шире, иначе листва читается обводкой.
 * Ком закрывает кору почти сплошь, поэтому треть пикселей ветки кладётся обратно.
 */
function crownLeaves(pix: Pix, grid: TreeWoodGrid, left: number, top: number, trunk: number): void {
  const { dw, bark, color } = grid;
  for (let y = 0; y < trunk; y += 1) {
    const row = y * dw;
    for (let x = 0; x < dw; x += 1) {
      if (!bark[row + x]) continue;
      leafClump(pix, left + x, top + y, clumpRadius(bark, dw, grid.dh, x, y));
    }
  }
  for (let y = 0; y < trunk; y += 1) {
    const row = y * dw;
    for (let x = 0; x < dw; x += 1) {
      if (!bark[row + x]) continue;
      const px = left + x;
      const py = top + y;
      if (hash(px >> 1, py) % 3 !== 0) continue;
      pix.px(px, py, color[row + x]!);
    }
  }
}

function clumpRadius(bark: Uint8Array, dw: number, dh: number, x: number, y: number): number {
  const reach = Math.max(2, Math.round(dh * 0.048));
  const tip = Math.max(reach + 1, Math.round(dh * 0.075));
  return woodNeighbors(bark, dw, dh, x, y) <= 2 ? tip : reach;
}

/** Первая строка, где несколько рядов подряд остаётся один узкий ствол. */
function trunkTop(bark: Uint8Array, dw: number, dh: number): number {
  let maxSpan = 1;
  const span: number[] = [];
  const runs: number[] = [];
  for (let y = 0; y < dh; y += 1) {
    let count = 0;
    let width = 0;
    let run = 0;
    let on = false;
    const row = y * dw;
    for (let x = 0; x <= dw; x += 1) {
      const bit = x < dw && bark[row + x] !== 0;
      if (bit) {
        if (!on) {
          on = true;
          count += 1;
          run = 1;
        } else {
          run += 1;
        }
      } else if (on) {
        if (run > width) width = run;
        on = false;
      }
    }
    if (width > maxSpan) maxSpan = width;
    span.push(width);
    runs.push(count);
  }
  const limit = maxSpan * 0.42;
  let streak = 0;
  let start = Math.floor(dh * 0.72);
  for (let y = Math.floor(dh * 0.45); y < dh; y += 1) {
    const narrow = runs[y] === 1 && span[y]! > 0 && span[y]! <= limit;
    if (narrow) {
      if (streak === 0) start = y;
      streak += 1;
      if (streak >= 4) return start;
    } else {
      streak = 0;
    }
  }
  return Math.floor(dh * 0.72);
}

function trunkAxis(grid: TreeWoodGrid, trunk: number): { cx: number; half: number } {
  const { dw, dh, bark } = grid;
  let x0 = dw;
  let x1 = -1;
  const y1 = Math.min(dh - 1, trunk + 6);
  for (let y = trunk; y <= y1; y += 1) {
    const row = y * dw;
    for (let x = 0; x < dw; x += 1) {
      if (!bark[row + x]) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
    }
  }
  if (x1 < x0) return { cx: dw / 2, half: 2 };
  return { cx: (x0 + x1) / 2, half: Math.max(1, (x1 - x0 + 1) / 2) };
}

function woodNeighbors(bark: Uint8Array, dw: number, dh: number, x: number, y: number): number {
  let n = 0;
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      const xx = x + dx;
      const yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= dw || yy >= dh) continue;
      if (bark[yy * dw + xx]) n += 1;
    }
  }
  return n;
}

/** Ком как у куста: свет сверху слева, тень снизу, редкие дырки. */
function leafClump(pix: Pix, cx: number, cy: number, r: number): void {
  const r2 = r * r;
  for (let dy = -r; dy <= r; dy += 1) {
    for (let dx = -r; dx <= r; dx += 1) {
      if (dx * dx + dy * dy > r2) continue;
      const x = cx + dx;
      const y = cy + dy;
      if (hash(x, y) % 11 === 0) continue;
      const e = (dx * dx + dy * dy) / r2;
      let color: number = palette.leaf;
      if (dx < -r * 0.2 && dy < 0 && hash(x, y) % 3 !== 0) color = palette.leafLite;
      else if (e > 0.7 || dy > r * 0.3) color = hash(x, y) % 2 === 0 ? palette.leafDark : palette.leaf;
      pix.px(x, y, color);
    }
  }
}

/** Куча у подошвы на всю ширину кроны. Середина выше краёв. */
function leafPile(pix: Pix, x0: number, x1: number, sole: number): void {
  const width = x1 - x0;
  if (width < 4) return;
  const mid = (x0 + x1) / 2;
  const hump = Math.max(4, Math.round(width * 0.08));
  const half = width / 2;
  for (let x = Math.floor(x0); x <= Math.ceil(x1); x += 1) {
    const u = (x - mid) / half;
    const lift = Math.max(0, Math.round(hump * (1 - u * u)));
    for (let k = 0; k <= lift; k += 1) {
      const y = sole - 1 - k;
      if (hash(x, y) % 5 === 0) continue;
      let color: number = palette.leaf;
      if (k === lift || hash(x, k) % 6 === 0) color = palette.leafLite;
      else if (k < 2 || hash(x, k) % 4 === 0) color = palette.leafDark;
      pix.px(x, y, color);
    }
  }
  const step = Math.max(4, Math.round(width / 14));
  for (let x = Math.floor(x0); x <= Math.ceil(x1); x += step) {
    const u = (x - mid) / half;
    const y = sole - 1 - Math.max(0, Math.round(hump * (1 - u * u)));
    leafBit(pix, x, y, hash(x, sole) % 3);
  }
}

function leafBit(pix: Pix, x: number, y: number, kind: number): void {
  if (kind === 0) {
    pix.px(x, y, palette.leaf);
    pix.px(x + 1, y, palette.leafDark);
    pix.px(x, y - 1, palette.leafLite);
    return;
  }
  if (kind === 1) {
    pix.px(x, y, palette.leafDark);
    pix.px(x + 1, y - 1, palette.leaf);
    pix.px(x + 2, y - 2, palette.leafLite);
    return;
  }
  pix.px(x, y, palette.leaf);
  pix.px(x, y - 1, palette.leafDark);
  pix.px(x + 1, y - 2, palette.leafLite);
}
