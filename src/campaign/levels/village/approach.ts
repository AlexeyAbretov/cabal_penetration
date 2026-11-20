import { palette } from '../../../constants';
import type { Ground } from '../../ground';
import { belowHorizon, fitScale, sceneDepth, type Rect } from '../../../layout';
import type { HouseMark } from '../../../types/house';
import { disc, hash, Pix, stamp } from '../../../scenes/play/pix';
import {
  dirtTone,
  fillSky,
  grassTone,
  houseYards,
  paintMountains,
  sow,
  yard,
  yardTone,
  type YardSpec,
} from './earth';

/**
 * Земля 1-2. Дорога уже, чем в деревне: по бокам кирпич.
 * Горы те же, что на 1-1. Перед ними дальний аэродром:
 * в 1-3 он подойдёт близко, в 1-4 это уже площадка под ногами.
 * Врагов на этом слое нет.
 */
export function approachGround(houses: readonly HouseMark[]): Ground {
  return {
    backdrop: (width, skyH, fieldH) => paintBackdrop(houses, width, skyH, fieldH),
    track: paintTrack,
    at: groundAt,
    rails: () => ({ left: [], right: [], fit: 1 }),
  };
}

function paintBackdrop(houses: readonly HouseMark[], w: number, skyH: number, fieldH: number): Pix {
  const pix = new Pix(w, Math.max(1, skyH + fieldH));
  if (skyH > 0) {
    const sky = fillSky(w, skyH);
    paintMountains(sky, skyH);
    stamp(pix, sky, 0, 0);
  }
  if (fieldH > 0) stamp(pix, paintField(houses, w, fieldH), 0, skyH);
  if (skyH > 0) paintAirport(pix, skyH);
  return pix;
}

function paintTrack(w: number, h: number, fieldH: number): Pix {
  const pix = new Pix(w, h);
  for (let y = 0; y < h; y += 1) {
    const gy = fieldH + y;
    const edges = approachEdges(gy, w, fieldH, true);
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
    const edges = approachEdges(y, w, h);
    for (let x = 0; x < w; x += 1) {
      if (x >= edges.left && x <= edges.right) {
        dirt[y * w + x] = 1;
        pix.px(x, y, dirtTone(x, y, edges));
      } else {
        pix.px(x, y, grassTone(x, y));
      }
    }
  }

  const field: Rect = { x: 0, y: 0, width: w, height: h };
  const fit = fitScale(field);
  sow(pix, dirt, w, h, fit, (y, width, height) => approachEdges(y, width, height));
  doorYards = houseYards(houses, field);
  for (const spec of doorYards) yard(pix, spec);
  stairs(pix, w, h, field, fit);
  cairn(pix, Math.round(w * 0.7), Math.round(belowHorizon(0.4, field)), Math.round(16 * fit));
  farRocks(pix, w, h);
  const mouth = approachEdges(h - 1, w, h);
  const gap = Math.round(6 * fit);
  brickBank(pix, 0, Math.round(mouth.left) - gap, h, Math.round(58 * fit));
  brickBank(pix, Math.round(mouth.right) + gap, w, h, Math.round(64 * fit));
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
    const edges = approachEdges(gy, track.width, field.height, true);
    const dirt = tx >= edges.left && tx <= edges.right;
    return { tone: dirt ? dirtTone(tx, gy, edges) : grassTone(tx, gy), dirt };
  }
  const gy = yi - field.y;
  const tx = xi - field.x;
  if (gy < 0) return { tone: palette.grass, dirt: false };
  const edges = approachEdges(gy, field.width, field.height);
  const dirt = tx >= edges.left && tx <= edges.right;
  return { tone: dirt ? dirtTone(tx, gy, edges) : grassTone(tx, gy), dirt };
}

/** Дорога 1-2 сходится в ту же точку, у ног она уже: место кирпичу. */
function approachEdges(y: number, w: number, h: number, foreground = false): { left: number; right: number } {
  const depth = Math.max(1, sceneDepth({ x: 0, y: 0, width: w, height: h }));
  const t = y / depth;
  const near = t < 1 || foreground ? t : 1 + (t - 1) * 0.12;
  const fade = Math.min(1, t * 4);
  const mid = w * 0.5;
  const wobble = ((hash(8, y) % 3) - 1) * fade;
  const half = Math.min(w * 0.26, Math.max(2, near * 0.22 * w) + wobble);
  return { left: mid - half, right: mid + half };
}

/**
 * Дальний аэродром на линии горизонта, поверх гор.
 * Просвет по центру — дорога к воротам 1-3. Вышка и ангары сидят в этом просвете,
 * не за избой и не за руиной.
 */
function paintAirport(pix: Pix, skyH: number): void {
  const w = pix.w;
  const s = Math.max(1, Math.round(skyH / 170));
  const ground = skyH + s;
  const wallH = 5 * s;
  const gap = 16 * s;
  const mid = Math.round(w * 0.5);
  const x0 = Math.round(w * 0.2);
  const x1 = Math.round(w * 0.8);
  for (let x = x0; x < x1; x += 1) {
    if (Math.abs(x - mid) < gap) continue;
    const post = (x - x0) % (16 * s) < s;
    const height = wallH + (post ? 4 * s : 0);
    for (let i = 0; i < height; i += 1) {
      const y = ground - height + i;
      const seam = i === 0 || (x - x0) % (6 * s) === 0;
      const color = post ? palette.pebble : seam ? palette.mortar : palette.cream;
      pix.px(x, y, color);
    }
  }
  hangar(pix, Math.round(w * 0.36), ground, 22 * s, 9 * s);
  hangar(pix, Math.round(w * 0.43), ground, 32 * s, 12 * s);
  hangar(pix, Math.round(w * 0.66), ground, 48 * s, 13 * s);
  const right = Math.round(w * 0.66);
  disc(pix, right + 8 * s, ground - 13 * s, 4 * s, 3 * s, palette.steelLite);
  tower(pix, Math.round(w * 0.55), ground, s);
}

function hangar(pix: Pix, cx: number, ground: number, width: number, height: number): void {
  if (width < 6 || height < 5) return;
  const left = cx - Math.floor(width / 2);
  const roofH = Math.max(2, Math.round(height * 0.3));
  const top = ground - height;
  pix.fill(left, top, width, roofH, palette.steelDark);
  pix.fill(left, top, width, 1, palette.steelLite);
  pix.fill(left, top + roofH, width, height - roofH, palette.steel);
  const doorW = Math.max(3, Math.round(width * 0.3));
  const doorH = Math.max(2, height - roofH - 1);
  pix.fill(cx - Math.floor(doorW / 2), ground - doorH, doorW, doorH, palette.steelDark);
}

function tower(pix: Pix, cx: number, ground: number, s: number): void {
  const baseW = 9 * s;
  const baseH = 3 * s;
  const shaftW = 5 * s;
  const shaftH = 20 * s;
  const cabinW = 13 * s;
  const cabinH = 7 * s;
  pix.fill(cx - Math.floor(baseW / 2), ground - baseH, baseW, baseH, palette.creamDark);
  const shaftTop = ground - baseH - shaftH;
  pix.fill(cx - Math.floor(shaftW / 2), shaftTop, shaftW, shaftH, palette.cream);
  pix.fill(cx - Math.floor(shaftW / 2), shaftTop, s, shaftH, palette.creamLite);
  const cabinTop = shaftTop - cabinH;
  pix.fill(cx - Math.floor(cabinW / 2), cabinTop, cabinW, cabinH, palette.steel);
  pix.fill(cx - Math.floor(cabinW / 2), cabinTop, cabinW, s, palette.steelDark);
  pix.fill(cx - Math.floor(cabinW / 2) + s, cabinTop + 2 * s, cabinW - 2 * s, 2 * s, palette.glassLite);
  pix.fill(cx, cabinTop - 7 * s, s, 7 * s, palette.ironLite);
  pix.fill(cx - 2 * s, cabinTop - 5 * s, 5 * s, s, palette.iron);
}

function stairs(pix: Pix, w: number, h: number, field: Rect, fit: number): void {
  const count = 6;
  const far = Math.round(belowHorizon(0.16, field));
  const near = Math.round(belowHorizon(0.5, field));
  if (near <= far) return;
  for (let i = 0; i < count; i += 1) {
    const t = i / (count - 1);
    const y = Math.round(far + (near - far) * t);
    if (y < 2 || y >= h) continue;
    const edges = approachEdges(y, w, h);
    const stepW = Math.max(8, Math.round((12 + t * 18) * fit));
    const stepH = Math.max(3, Math.round((3 + t * 2) * fit));
    const x = Math.round(edges.left - stepW - 2);
    pix.fill(x, y - stepH, stepW, stepH, i % 2 === 0 ? palette.pebble : palette.wallLite);
    pix.fill(x, y - stepH, stepW, 1, palette.creamLite);
    pix.fill(x, y - 1, stepW, 1, palette.dirtDark);
  }
}

function cairn(pix: Pix, x: number, y: number, r: number): void {
  if (r < 4) return;
  disc(pix, x - Math.round(r * 0.35), y + 1, Math.round(r * 0.7), Math.round(r * 0.45), palette.pebble);
  disc(pix, x + Math.round(r * 0.4), y, Math.round(r * 0.55), Math.round(r * 0.4), palette.cream);
  disc(pix, x, y - Math.round(r * 0.35), Math.round(r * 0.5), Math.round(r * 0.4), palette.wallLite);
  pix.px(x - 2, y - r, palette.creamLite);
  pix.px(x + 1, y - Math.round(r * 0.6), palette.dirtLite);
}

function farRocks(pix: Pix, w: number, h: number): void {
  const spots = [0.24, 0.74, 0.8];
  for (const fx of spots) {
    const y = Math.max(2, Math.round(h * 0.05));
    const edges = approachEdges(y, w, h);
    const x = Math.round(fx * w);
    if (x > edges.left - 4 && x < edges.right + 4) continue;
    disc(pix, x, y, 4, 3, palette.pebble);
    pix.px(x - 1, y - 2, palette.creamLite);
  }
}

function brickBank(pix: Pix, x0: number, x1: number, ground: number, height: number): void {
  if (x1 - x0 < 8 || height < 8) return;
  const course = 5;
  const brickW = 8;
  for (let x = x0; x < x1; x += 1) {
    const jag = hash(x, 3) % 4;
    const top = ground - height + jag;
    for (let y = top; y < ground; y += 1) {
      const row = Math.floor((y - top) / course);
      const shift = row % 2 === 0 ? 0 : Math.floor(brickW / 2);
      const seam = (x + shift) % brickW === 0 || (y - top) % course === 0;
      if (seam) {
        pix.px(x, y, palette.mortar);
        continue;
      }
      const n = hash(x, row + 2);
      pix.px(x, y, n % 6 === 0 ? palette.brickDark : n % 5 === 0 ? palette.brickLite : palette.brick);
    }
  }
}

