import { palette } from '../../constants';
import { hash, inkOutline, Pix } from './pix';

/**
 * Валун с плоскими гранями. Свет сверху слева, тень справа снизу.
 * 0 — целый, с одной трещиной. 1 — ещё трещины и скол. 2 — отбит правый гребень.
 * Низ прямой: его закрывает газон.
 */
export function paintRock(w: number, h: number, stage: number): Pix {
  const pix = new Pix(w, h);
  const body = poly(w, h, BODY);
  const left = poly(w, h, LEFT);
  const right = poly(w, h, RIGHT);
  fillStone(pix, body, 'body');
  fillStone(pix, left, 'left');
  fillStone(pix, right, 'right');
  seam(pix, poly(w, h, LEFT_SEAM));
  seam(pix, poly(w, h, RIGHT_SEAM));
  fissure(pix, poly(w, h, CRACK));
  if (stage >= 1) {
    fissure(pix, poly(w, h, CRACK_LEFT));
    bite(pix, poly(w, h, CHIP));
  }
  if (stage >= 2) {
    fissure(pix, poly(w, h, CRACK_RIGHT));
    bite(pix, poly(w, h, GOUGE));
  }
  litRim(pix);
  inkOutline(pix, palette.line);
  return pix;
}

/** Низкая куча после слома. Те же грани, уже без гребня. */
export function paintRockRuin(w: number, h: number): Pix {
  const pix = new Pix(w, h);
  fillStone(pix, poly(w, h, RUIN_LEFT), 'left');
  fillStone(pix, poly(w, h, RUIN_MID), 'body');
  fillStone(pix, poly(w, h, RUIN_RIGHT), 'right');
  fillStone(pix, poly(w, h, RUIN_CHIP), 'left');
  fissure(pix, poly(w, h, RUIN_CRACK));
  litRim(pix);
  inkOutline(pix, palette.line);
  return pix;
}

type Kind = 'body' | 'left' | 'right';

/** Гребень с седловиной, не овал. Низ сидит на последнем ряду. */
const BODY: readonly (readonly [number, number])[] = [
  [0.1, 0.62],
  [0.06, 0.4],
  [0.16, 0.22],
  [0.3, 0.1],
  [0.42, 0.24],
  [0.52, 0.08],
  [0.66, 0.16],
  [0.8, 0.08],
  [0.92, 0.24],
  [0.97, 0.46],
  [0.9, 0.7],
  [0.74, 0.86],
  [0.48, 0.98],
  [0.22, 0.94],
  [0.1, 0.78],
];

const LEFT: readonly (readonly [number, number])[] = [
  [0.02, 0.7],
  [0.08, 0.52],
  [0.2, 0.46],
  [0.32, 0.6],
  [0.26, 0.88],
  [0.06, 0.98],
];

const RIGHT: readonly (readonly [number, number])[] = [
  [0.66, 0.64],
  [0.78, 0.46],
  [0.96, 0.56],
  [0.98, 0.78],
  [0.82, 0.98],
  [0.64, 0.86],
];

const LEFT_SEAM: readonly (readonly [number, number])[] = [
  [0.18, 0.5],
  [0.28, 0.66],
  [0.22, 0.9],
];

const RIGHT_SEAM: readonly (readonly [number, number])[] = [
  [0.74, 0.5],
  [0.7, 0.7],
  [0.78, 0.94],
];

const CRACK: readonly (readonly [number, number])[] = [
  [0.44, 0.22],
  [0.4, 0.4],
  [0.46, 0.58],
  [0.4, 0.78],
];

const CRACK_LEFT: readonly (readonly [number, number])[] = [
  [0.28, 0.16],
  [0.22, 0.34],
  [0.3, 0.5],
];

const CRACK_RIGHT: readonly (readonly [number, number])[] = [
  [0.7, 0.18],
  [0.78, 0.36],
  [0.7, 0.52],
];

const CHIP: readonly (readonly [number, number])[] = [
  [0.26, 0.1],
  [0.38, 0.08],
  [0.34, 0.22],
  [0.24, 0.2],
];

const GOUGE: readonly (readonly [number, number])[] = [
  [0.6, 0.08],
  [0.82, 0.06],
  [0.9, 0.22],
  [0.74, 0.34],
  [0.58, 0.22],
];

const RUIN_LEFT: readonly (readonly [number, number])[] = [
  [0.04, 0.55],
  [0.14, 0.28],
  [0.3, 0.42],
  [0.24, 0.98],
  [0.04, 0.98],
];

const RUIN_MID: readonly (readonly [number, number])[] = [
  [0.28, 0.62],
  [0.4, 0.18],
  [0.58, 0.3],
  [0.66, 0.58],
  [0.58, 0.98],
  [0.32, 0.98],
];

const RUIN_RIGHT: readonly (readonly [number, number])[] = [
  [0.64, 0.7],
  [0.76, 0.4],
  [0.94, 0.52],
  [0.96, 0.98],
  [0.68, 0.98],
];

const RUIN_CHIP: readonly (readonly [number, number])[] = [
  [0.7, 0.78],
  [0.82, 0.62],
  [0.9, 0.8],
  [0.78, 0.98],
];

const RUIN_CRACK: readonly (readonly [number, number])[] = [
  [0.46, 0.28],
  [0.42, 0.55],
  [0.5, 0.82],
];

function poly(w: number, h: number, norm: readonly (readonly [number, number])[]): readonly [number, number][] {
  const x1 = Math.max(1, w - 1);
  const y1 = Math.max(1, h - 1);
  return norm.map(([u, v]) => [u * x1, v * y1]);
}

function fillStone(pix: Pix, pts: readonly [number, number][], kind: Kind): void {
  const box = bounds(pts);
  for (let y = box.top; y <= box.bottom; y += 1) {
    for (let x = box.left; x <= box.right; x += 1) {
      if (!inside(x + 0.5, y + 0.5, pts)) continue;
      pix.px(x, y, shade(x, y, pix.w, pix.h, kind));
    }
  }
}

/** Стык двух камней. Тёмная щель, не шов из овала. */
function seam(pix: Pix, pts: readonly [number, number][]): void {
  walk(pts, (x, y) => {
    if (!stoneAt(pix, x, y)) return;
    pix.px(x, y, palette.line);
    if (stoneAt(pix, x + 1, y)) pix.px(x + 1, y, palette.wallBand);
  });
}

function fissure(pix: Pix, pts: readonly [number, number][]): void {
  walk(pts, (x, y) => {
    if (!stoneAt(pix, x, y)) return;
    const jag = (hash(x, y) % 3) - 1;
    const xx = x + jag;
    if (!stoneAt(pix, xx, y)) return;
    pix.px(xx, y, palette.line);
    if (stoneAt(pix, xx, y + 1) && hash(y, x) % 2 === 0) pix.px(xx, y + 1, palette.joint);
  });
}

/** Скол: дыра и тёмный край свежего излома. */
function bite(pix: Pix, pts: readonly [number, number][]): void {
  const box = bounds(pts);
  for (let y = box.top; y <= box.bottom; y += 1) {
    for (let x = box.left; x <= box.right; x += 1) {
      if (!inside(x + 0.5, y + 0.5, pts) || !stoneAt(pix, x, y)) continue;
      pix.erase(x, y);
    }
  }
  for (let y = box.top - 1; y <= box.bottom + 1; y += 1) {
    for (let x = box.left - 1; x <= box.right + 1; x += 1) {
      if (!stoneAt(pix, x, y) || !besideHole(pix, x, y)) continue;
      pix.px(x, y, hash(x, y) % 3 === 0 ? palette.line : palette.wallBand);
    }
  }
}

/** Блик на верхнем левом крае грани. */
function litRim(pix: Pix): void {
  for (let y = 1; y < pix.h - 1; y += 1) {
    for (let x = 1; x < pix.w - 1; x += 1) {
      if (!stoneAt(pix, x, y)) continue;
      const openUp = !stoneAt(pix, x, y - 1) || !stoneAt(pix, x - 1, y - 1);
      if (!openUp) continue;
      if (hash(x, y) % 4 === 0) continue;
      pix.px(x, y, palette.creamLite);
    }
  }
}

function shade(x: number, y: number, w: number, h: number, kind: Kind): number {
  const u = x / Math.max(1, w - 1);
  const v = y / Math.max(1, h - 1);
  const plane = kind === 'body' ? bodyPlane(u, v) : chunkPlane(u, v, kind);
  const speck = hash(x, y) % 6 === 0;
  if (plane === 0) {
    if (v < 0.34) return speck ? palette.cream : palette.creamLite;
    return speck ? palette.wall : palette.wallLite;
  }
  if (plane === 2) {
    if (v > 0.72) return speck ? palette.joint : palette.wallBand;
    return speck ? palette.mount : palette.pebble;
  }
  if (speck) return hash(y, x) % 2 === 0 ? palette.wallLite : palette.wallBand;
  return v < 0.45 ? palette.pebble : palette.wall;
}

/** 0 — светлая грань, 1 — лоб, 2 — тень. Границы прямые, не по радиусу. */
function bodyPlane(u: number, v: number): 0 | 1 | 2 {
  const lit = 0.34 + (v - 0.15) * 0.06;
  const shade = 0.58 + (v - 0.1) * 0.22;
  if (u < lit) return 0;
  if (u > shade) return 2;
  return 1;
}

function chunkPlane(u: number, v: number, kind: Kind): 0 | 1 | 2 {
  const split = kind === 'left' ? 0.14 + v * 0.12 : 0.78 + (v - 0.5) * 0.1;
  if (kind === 'left') return u < split ? 0 : 1;
  return u > split ? 2 : 1;
}

function besideHole(pix: Pix, x: number, y: number): boolean {
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      const xx = x + dx;
      const yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= pix.w || yy >= pix.h) return true;
      if (pix.data[(yy * pix.w + xx) * 4 + 3]! < 16) return true;
    }
  }
  return false;
}

function stoneAt(pix: Pix, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= pix.w || y >= pix.h) return false;
  return pix.data[(y * pix.w + x) * 4 + 3]! > 16;
}

function walk(pts: readonly [number, number][], plot: (x: number, y: number) => void): void {
  for (let i = 0; i < pts.length - 1; i += 1) {
    const [x0, y0] = pts[i]!;
    const [x1, y1] = pts[i + 1]!;
    const steps = Math.max(1, Math.abs(x1 - x0), Math.abs(y1 - y0));
    for (let s = 0; s <= steps; s += 1) {
      const t = s / steps;
      plot(Math.round(x0 + (x1 - x0) * t), Math.round(y0 + (y1 - y0) * t));
    }
  }
}

function bounds(pts: readonly [number, number][]): { left: number; right: number; top: number; bottom: number } {
  let left = Infinity;
  let right = -Infinity;
  let top = Infinity;
  let bottom = -Infinity;
  for (const [x, y] of pts) {
    left = Math.min(left, x);
    right = Math.max(right, x);
    top = Math.min(top, y);
    bottom = Math.max(bottom, y);
  }
  return {
    left: Math.max(0, Math.floor(left)),
    right: Math.ceil(right),
    top: Math.max(0, Math.floor(top)),
    bottom: Math.ceil(bottom),
  };
}

function inside(x: number, y: number, pts: readonly [number, number][]): boolean {
  let hit = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i, i += 1) {
    const [xi, yi] = pts[i]!;
    const [xj, yj] = pts[j]!;
    if (yi > y === yj > y) continue;
    const at = ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (x < at) hit = !hit;
  }
  return hit;
}
