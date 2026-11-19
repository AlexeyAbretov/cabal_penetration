import { palette } from '../../../constants';
import type { Ground } from '../../ground';
import { belowHorizon, fitScale, type Rect } from '../../../layout';
import type { HouseMark } from '../../../types/house';
import type { RailLayout, RailPost } from '../../../types/rail';
import { hash, Pix, stamp } from '../../../scenes/play/pix';
import { branch, deadTree, dirtTone, fillSky, grassTone, paintMountains, roadEdges, sow } from './earth';

/**
 * Земля деревни, картинка 1-1. Не рип.
 * Дорога сходится в точку на горизонте. Крыши и кроны заходят на небо,
 * растения заполняют двор. Штакетник, жерди и бочки ставит бой.
 * Врагов на этом слое нет.
 */
export function villageGround(houses: readonly HouseMark[]): Ground {
  return {
    backdrop: (width, skyH, fieldH) => paintBackdrop(houses, width, skyH, fieldH),
    track: paintTrack,
    at: groundAt,
    rails: railLayout,
  };
}

/** Небо и поле одним листом: крона выше горизонта остаётся на небе, а не обрезается. */
function paintBackdrop(houses: readonly HouseMark[], w: number, skyH: number, fieldH: number): Pix {
  const pix = new Pix(w, Math.max(1, skyH + fieldH));
  if (skyH > 0) stamp(pix, paintSky(w, skyH), 0, 0);
  if (fieldH > 0) stamp(pix, paintField(houses, w, fieldH), 0, skyH);
  const field: Rect = { x: 0, y: 0, width: w, height: fieldH };
  const fit = fitScale(field);
  const ground = (fraction: number) => skyH + Math.round(belowHorizon(fraction, field));
  tree(pix, Math.round(w * 0.32), ground(0.29), Math.round(118 * fit));
  deadTree(pix, Math.round(w * 0.44), ground(0.13), Math.round(96 * fit));
  return pix;
}

function paintSky(w: number, h: number): Pix {
  const pix = fillSky(w, h);
  paintMountains(pix, h);
  return pix;
}

/** Земля под ногами — нижние ряды той же дороги и того же газона, без своей кромки. */
function paintTrack(w: number, h: number, fieldH: number): Pix {
  const pix = new Pix(w, h);
  const groundH = Math.max(1, fieldH);
  for (let y = 0; y < h; y += 1) {
    const gy = fieldH + y;
    const edges = roadEdges(gy, w, groundH, true);
    for (let x = 0; x < w; x += 1) {
      if (x >= edges.left && x <= edges.right) pix.px(x, y, dirtTone(x, gy, edges));
      else pix.px(x, y, grassTone(x, gy));
    }
  }
  return pix;
}

function paintField(houses: readonly HouseMark[], w: number, h: number): Pix {
  const pix = new Pix(w, h);
  const dirt = new Uint8Array(w * h);
  for (let y = 0; y < h; y += 1) {
    const edges = roadEdges(y, w, h);
    for (let x = 0; x < w; x += 1) {
      if (edges && x >= edges.left && x <= edges.right) {
        dirt[y * w + x] = 1;
        pix.px(x, y, dirtTone(x, y, edges));
      } else {
        pix.px(x, y, grassTone(x, y));
      }
    }
  }

  const field: Rect = { x: 0, y: 0, width: w, height: h };
  const fit = fitScale(field);
  sow(pix, dirt, w, h, fit);
  for (const house of houses) {
    const pad = house.kind === 'shed' ? 10 : 16;
    yard(pix, house.x * w, belowHorizon(house.y, field) + 2, pad * fit, 7 * fit);
  }
  kiln(pix, Math.round(w * 0.95), Math.round(h * 0.5), Math.round(30 * fit));
  crops(pix, Math.round(w * 0.03), Math.round(h * 0.58), fit);
  return pix;
}

/**
 * Цвет уже нарисованной земли в точке кадра.
 * Тот же газон и та же дорога, что в листе картинки: посадка забора
 * перекрывает кромку спрайта этими пикселями, а не своим пятном.
 */
function groundAt(x: number, y: number, field: Rect, track: Rect): { tone: number; dirt: boolean } {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  if (yi >= track.y) {
    const gy = field.height + (yi - track.y);
    const tx = xi - track.x;
    const edges = roadEdges(gy, track.width, field.height, true);
    const dirt = tx >= edges.left && tx <= edges.right;
    return { tone: dirt ? dirtTone(tx, gy, edges) : grassTone(tx, gy), dirt };
  }
  const gy = yi - field.y;
  const tx = xi - field.x;
  if (gy < 0) return { tone: palette.grass, dirt: false };
  const edges = roadEdges(gy, field.width, field.height);
  const dirt = tx >= edges.left && tx <= edges.right;
  return { tone: dirt ? dirtTone(tx, gy, edges) : grassTone(tx, gy), dirt };
}

function yard(pix: Pix, cx: number, cy: number, rx: number, ry: number): void {
  if (rx < 2) return;
  const rx2 = rx * rx;
  const ry2 = ry * ry;
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y += 1) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x += 1) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      if ((dx * dx) / rx2 + (dy * dy) / ry2 > 1) continue;
      const n = hash(x, y);
      pix.px(x, y, n % 5 === 0 ? palette.dirtLite : n % 4 === 0 ? palette.dirtDark : palette.dirt);
    }
  }
}

/**
 * Столбы жердей слева и справа от кромки этой дороги.
 * Те же места, что раньше были впечатаны в землю. Бой рисует их сам.
 */
function railLayout(w: number, h: number): RailLayout {
  const field: Rect = { x: 0, y: 0, width: w, height: h };
  const fit = fitScale(field);
  const top = Math.round(belowHorizon(0.52, field));
  const step = Math.max(16, Math.round(28 * fit));
  const left: RailPost[] = [];
  const right: RailPost[] = [];
  for (let y = top; y < h - 64; y += step) {
    const edges = roadEdges(y, w, h);
    const ph = Math.round((12 + 16 * (y / h)) * fit);
    const postW = Math.max(2, Math.round(3 * fit));
    left.push({ x: Math.round(edges.left - postW - 2), y, ph, w: postW });
    right.push({ x: Math.round(edges.right + 2), y, ph, w: postW });
  }
  return { left, right, fit };
}

function tree(pix: Pix, x: number, ground: number, height: number): void {
  if (height < 24) return;
  const trunkH = Math.round(height * 0.46);
  const trunkW = Math.max(4, Math.round(height * 0.09));
  const top = ground - trunkH;
  pix.fill(x - Math.floor(trunkW / 2), top, trunkW, trunkH, palette.bark);
  for (let i = 0; i < trunkH; i += 3) {
    pix.px(x - Math.floor(trunkW / 2) + (i % 2), top + i, palette.barkDark);
    pix.px(x + Math.floor(trunkW / 2) - 1, top + i + 1, palette.barkLite);
  }
  pix.fill(x - trunkW, ground - 3, Math.round(trunkW * 0.8), 3, palette.barkDark);
  pix.fill(x + 1, ground - 2, Math.round(trunkW * 0.9), 2, palette.barkDark);
  const crown = ground - Math.round(height * 0.78);
  branch(pix, x, top + 4, x - Math.round(height * 0.22), crown + Math.round(height * 0.18));
  branch(pix, x, top + 2, x + Math.round(height * 0.24), crown + Math.round(height * 0.12));
  branch(pix, x, top + 8, x + Math.round(height * 0.04), crown);
  const clusters: [number, number, number][] = [
    [0, -0.9, 0.2],
    [-0.22, -0.78, 0.24],
    [0.24, -0.74, 0.22],
    [-0.34, -0.58, 0.2],
    [0.36, -0.54, 0.26],
    [0, -0.6, 0.28],
    [-0.12, -0.42, 0.18],
    [0.16, -0.4, 0.16],
  ];
  for (const [fx, fy, r] of clusters) {
    const cx = x + Math.round(fx * height);
    const cy = ground + Math.round(fy * height);
    const radius = Math.round(r * height);
    canopy(pix, cx, cy, radius, radius * 0.85, fy < -0.7);
  }
}

function canopy(pix: Pix, cx: number, cy: number, rx: number, ry: number, high: boolean): void {
  if (rx < 2 || ry < 2) return;
  const rx2 = rx * rx;
  const ry2 = ry * ry;
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y += 1) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x += 1) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const e = (dx * dx) / rx2 + (dy * dy) / ry2;
      if (e > 1) continue;
      if (hash(x, y) % 6 === 0) continue;
      let color: number = palette.leaf;
      if (high && dx < 0 && dy < 0) color = palette.leafLite;
      else if (e > 0.75 || dy > 0) color = hash(x, y) % 2 === 0 ? palette.leafDark : palette.leaf;
      else if (hash(x, y) % 4 === 0) color = palette.leafLite;
      pix.px(x, y, color);
    }
  }
}

function kiln(pix: Pix, cx: number, ground: number, r: number): void {
  if (r < 8) return;
  for (let y = -r; y <= 2; y += 1) {
    const span = y < 0 ? Math.sqrt(Math.max(0, r * r - y * y)) : r * 0.92;
    const row = Math.floor((y + r) / 4);
    for (let x = Math.round(-span); x <= Math.round(span); x += 1) {
      const edge = Math.abs(x) >= span - 1.2;
      const gap = (x + row * 3) % 6 === 0;
      let color: number = row % 2 === 0 ? palette.brick : palette.brickLite;
      if (edge || gap || y >= 0) color = palette.brickDark;
      if (y === -r + row * 4) color = palette.mortar;
      pix.px(cx + x, ground + y, color);
    }
  }
  const mouthW = Math.round(r * 0.34);
  const mouthH = Math.round(r * 0.42);
  for (let y = -mouthH; y <= 0; y += 1) {
    const span = mouthW * Math.sqrt(Math.max(0, 1 - (y / mouthH) ** 2));
    for (let x = Math.round(-span); x <= Math.round(span); x += 1) {
      pix.px(cx + x, ground - Math.round(r * 0.08) + y, y < -mouthH + 2 ? palette.brickDark : palette.line);
    }
  }
}

function crops(pix: Pix, x: number, ground: number, fit: number): void {
  const n = 7;
  const gap = Math.max(4, Math.round(6 * fit));
  for (let i = 0; i < n; i += 1) {
    const px0 = x + i * gap;
    const h = 4 + (hash(px0, ground) % 3);
    for (let k = 0; k < h; k += 1) pix.px(px0, ground - k, k < 2 ? palette.leafDark : palette.leaf);
    pix.px(px0 - 1, ground - h, palette.leafLite);
    pix.px(px0 + 1, ground - h, palette.leafLite);
    pix.px(px0, ground - h - 1, palette.leafLite);
  }
}
