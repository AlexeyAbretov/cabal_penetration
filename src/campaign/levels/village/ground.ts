import { palette } from '../../../constants';
import type { Ground } from '../../ground';
import { belowHorizon, fitScale, type Rect } from '../../../layout';
import type { HouseMark } from '../../../types/house';
import type { RailLayout, RailPost } from '../../../types/rail';
import { hash, Pix, stamp } from '../../../scenes/play/pix';
import {
  dirtTone,
  fillSky,
  grassTone,
  houseYards,
  paintMountains,
  roadEdges,
  sow,
  yard,
  yardTone,
  type YardSpec,
} from './earth';

/**
 * Земля деревни, картинка 1-1. Не рип.
 * Дорога сходится в точку на горизонте. Крыши и кроны заходят на небо,
 * растения заполняют двор. Штакетник, жерди, бочки, печь, деревья и камень ставит бой.
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

/** Небо и поле одним листом. Кроны деревьев рисует бой, не этот лист. */
function paintBackdrop(houses: readonly HouseMark[], w: number, skyH: number, fieldH: number): Pix {
  const pix = new Pix(w, Math.max(1, skyH + fieldH));
  if (skyH > 0) stamp(pix, paintSky(w, skyH), 0, 0);
  if (fieldH > 0) stamp(pix, paintField(houses, w, fieldH), 0, skyH);
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
  doorYards = houseYards(houses, field);
  for (const spec of doorYards) yard(pix, spec);
  crops(pix, Math.round(w * 0.03), Math.round(h * 0.58), fit);
  return pix;
}

/** Пятна у дверей. Посадка дома берёт их цвет, а не газон поверх жёлтого. */
let doorYards: YardSpec[] = [];

function wornTone(x: number, y: number): number | null {
  for (const spec of doorYards) {
    const tone = yardTone(x, y, spec);
    if (tone !== null) return tone;
  }
  return null;
}

/**
 * Цвет уже нарисованной земли в точке кадра.
 * Тот же газон и та же дорога, что в листе картинки: посадка забора
 * перекрывает кромку спрайта этими пикселями, а не своим пятном.
 */
function groundAt(x: number, y: number, field: Rect, track: Rect): { tone: number; dirt: boolean } {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  if (yi < track.y) {
    const worn = wornTone(xi - field.x, yi - field.y);
    if (worn !== null) return { tone: worn, dirt: true };
  }
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
