import { palette } from '../../../constants';
import { belowHorizon, fitScale, sceneDepth, type Rect } from '../../../layout';
import { doorPath } from '../../../scenes/play/buildings';
import { disc, hash, lerpColor, Pix } from '../../../scenes/play/pix';
import { placeTreeWood, stampTreeWood, treeWoodGrid, type TreeWoodGrid } from '../../../scenes/play/treeWood';
import type { HouseMark } from '../../../types/house';

/**
 * Общая земля деревни. 1-1 и 1-2 берут одно небо и одну гряду:
 * горы 1-2 — это горы 1-1, не второй рисунок.
 */

export function fillSky(w: number, h: number): Pix {
  const pix = new Pix(w, h);
  const band = 4;
  for (let y = 0; y < h; y += 1) {
    const t = Math.floor(y / band) * band / Math.max(1, h);
    const color = lerpColor(palette.skyDeep, palette.skyLite, t);
    pix.fill(0, y, w, 1, color);
  }
  const scale = h >= 70 ? 2 : 1;
  cloud(pix, Math.round(w * 0.16), Math.round(h * 0.14), scale);
  if (w > 180) cloud(pix, Math.round(w * 0.68), Math.round(h * 0.3), scale);
  return pix;
}

export function grassTone(x: number, y: number): number {
  const n = hash(x, y);
  if (n % 37 === 0) return palette.grassDark;
  if (n % 41 === 0) return palette.grassDeep;
  if (n % 29 === 0) return palette.grassLite;
  return palette.grass;
}

export function dirtTone(x: number, y: number, edges: { left: number; right: number }): number {
  const width = Math.max(1, edges.right - edges.left);
  const u = (x - edges.left) / width;
  const n = hash(x, y);
  if (u < 0.035 || u > 0.965) return palette.dirtDark;
  if (n % 29 === 0) return palette.dirtLite;
  if (n % 43 === 0) return palette.pebble;
  return palette.dirt;
}

/**
 * Дорога 1-1 с точки на горизонте до переднего плана.
 * Дальше опорной глубины поле почти не ширится.
 * Под ногами наклон тот же, что над забором: иначе кромка встаёт вертикально.
 */
export function roadEdges(y: number, w: number, h: number, foreground = false): { left: number; right: number } {
  const depth = Math.max(1, sceneDepth({ x: 0, y: 0, width: w, height: h }));
  const t = y / depth;
  const near = t < 1 || foreground ? t : 1 + (t - 1) * 0.12;
  const fade = Math.min(1, t * 4);
  const mid = w * 0.5 + ((hash(4, y >> 3) % 7) - 3) * fade;
  const wobble = ((hash(2, y) % 5) - 2) * fade;
  const half = Math.min(w * 0.42, Math.max(1, near * 0.36 * w) + wobble);
  return { left: mid - half, right: mid + half };
}

type RoadAt = (y: number, w: number, h: number) => { left: number; right: number };

/** Крапинки газона и камни у кромки. Кромку задаёт картинка: у 1-2 дорога уже. */
export function sow(
  pix: Pix,
  dirt: Uint8Array,
  w: number,
  h: number,
  fit: number,
  edgesAt: RoadAt = roadEdges,
): void {
  const step = Math.max(7, Math.round(10 * fit));
  for (let y = step; y < h - 2; y += step) {
    for (let x = 3; x < w; x += step) {
      const jx = x + (hash(x, y) % 5) - 2;
      const jy = y + (hash(y, x) % 5) - 2;
      if (jx < 1 || jy < 1 || jx >= w - 1 || jy >= h) continue;
      if (dirt[jy * w + jx]) continue;
      dots(pix, dirt, w, jx, jy);
      if (hash(jx, jy) % 6 === 0) flower(pix, jx + 2, jy);
    }
  }
  for (let i = 0; i < Math.round(w / 28); i += 1) {
    const y = Math.round(h * (0.48 + (hash(i, 6) % 40) / 100));
    const edges = edgesAt(y, w, h);
    if (!edges) continue;
    stone(pix, Math.round(edges.left - 3 - (hash(i, 1) % 4)), y, 2 + (hash(i, 2) % 2));
    stone(pix, Math.round(edges.right + 3 + (hash(i, 3) % 4)), y, 2);
  }
}

/**
 * Каркас дерева: лист PixelLab, подошва на земле.
 * Сухое дерево рисует только его. У живого листва лежит поверх кроны, часть веток видна.
 */
export function treeWood(pix: Pix, x: number, ground: number, height: number): void {
  placeTreeWood(pix, x, ground, height);
}

/** Сухое дерево. Тот же каркас, без листвы. */
export function deadTree(pix: Pix, x: number, ground: number, height: number): void {
  if (height < 20) return;
  treeWood(pix, x, ground, height);
}

/** Живое дерево. Каркас целиком, листва поверх кроны. Часть веток остаётся видна. */
export function liveTree(pix: Pix, x: number, ground: number, height: number): void {
  if (height < 20) return;
  const grid = treeWoodGrid(height);
  if (!grid) return;
  stampTreeWood(pix, grid, x, ground);
  crownLeaves(pix, x, ground, grid, trunkTop(grid.bark, grid.dw, grid.dh));
}

/**
 * Крона — всё выше узкого ствола. Тонкая ветка получает ком листьев,
 * кончик ещё шире, иначе листва читается обводкой.
 * Ком закрывает кору почти сплошь, поэтому треть пикселей ветки кладётся обратно.
 */
function crownLeaves(pix: Pix, x: number, ground: number, grid: TreeWoodGrid, top: number): void {
  const { dw, dh, bark, color } = grid;
  const left = Math.round(x - dw / 2);
  const y0 = Math.round(ground - dh);
  const reach = Math.max(2, Math.round(dh * 0.048));
  const tip = Math.max(reach + 1, Math.round(dh * 0.075));
  for (let y = 0; y < top; y += 1) {
    const row = y * dw;
    for (let x0 = 0; x0 < dw; x0 += 1) {
      if (!bark[row + x0]) continue;
      const r = woodNeighbors(bark, dw, dh, x0, y) <= 2 ? tip : reach;
      leafClump(pix, left + x0, y0 + y, r);
    }
  }
  for (let y = 0; y < top; y += 1) {
    const row = y * dw;
    for (let x0 = 0; x0 < dw; x0 += 1) {
      if (!bark[row + x0]) continue;
      const px = left + x0;
      const py = y0 + y;
      if (hash(px >> 1, py) % 3 !== 0) continue;
      pix.px(px, py, color[row + x0]!);
    }
  }
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

/**
 * Горы у горизонта. Общий контур — гряда, кромка идёт уступами, не прямой гранью.
 * В нижней половине ближних склонов — пятна травы.
 * skyH — строка горизонта на этом листе, не обязательно его низ.
 */
export function paintMountains(pix: Pix, skyH: number): void {
  const tall = Math.max(28, Math.min(72, Math.round(skyH * 0.32)));
  const step = Math.max(84, Math.min(136, Math.round(pix.w / 7)));
  const near = layPeaks(pix.w, tall, step, 2);
  const far = layPeaks(pix.w, Math.round(tall * 0.58), Math.round(step * 1.4), 6);
  const front = silhouette(pix.w, near, 4);
  const back = silhouette(pix.w, far, 11);
  for (let x = 0; x < pix.w; x += 1) {
    const h = front[x] ?? 0;
    const bh = back[x] ?? 0;
    if (bh > h) paintFar(pix, x, skyH, h, bh);
    if (h > 0) paintNear(pix, x, skyH, h);
  }
}

const grassDots = [palette.grassDark, palette.grassDeep, palette.grassLite] as const;

function dots(pix: Pix, dirt: Uint8Array, w: number, x: number, y: number): void {
  for (let i = 0; i < 4; i += 1) {
    const px = x + (hash(x + i, y) % 5) - 2;
    const py = y + (hash(y, x + i) % 3) - 1;
    if (px < 0 || py < 0 || px >= w || py >= pix.h) continue;
    if (dirt[py * w + px]) continue;
    pix.px(px, py, grassDots[hash(px, py) % grassDots.length]!);
  }
}

function flower(pix: Pix, x: number, y: number): void {
  const petal = hash(x, y) % 2 === 0 ? palette.flower : palette.bloom;
  pix.px(x, y - 4, petal);
  pix.px(x - 1, y - 3, petal);
  pix.px(x + 1, y - 3, petal);
  pix.px(x, y - 3, palette.petal);
  pix.px(x, y - 2, palette.leafDark);
  pix.px(x, y - 1, palette.leaf);
  pix.px(x, y, palette.grassDeep);
}

function stone(pix: Pix, x: number, y: number, r: number): void {
  disc(pix, x, y, r, Math.max(1, r - 1), palette.pebble);
  pix.px(x - 1, y - 1, palette.dirtLite);
  pix.px(x + r - 1, y, palette.dirtDark);
}

function cloud(pix: Pix, x: number, y: number, s: number): void {
  const blocks = [
    [0, 2, 11, 4],
    [2, 0, 8, 3],
    [4, 5, 9, 3],
    [-2, 3, 4, 3],
    [9, 2, 4, 3],
  ];
  for (const [dx, dy, bw, bh] of blocks) {
    pix.fill(x + dx! * s, y + dy! * s, bw! * s, bh! * s, palette.cloud);
  }
  pix.fill(x, y + 5 * s, 11 * s, s, palette.cloudShade);
}

type Peak = { x: number; left: number; right: number; h: number };

function layPeaks(w: number, tall: number, step: number, salt: number): Peak[] {
  const peaks: Peak[] = [];
  let x = -Math.round(step * 0.35);
  let i = 0;
  while (x < w + step) {
    const h = Math.round(tall * (0.55 + (hash(i, salt) % 46) / 100));
    const left = Math.round(step * (0.42 + (hash(i, salt + 1) % 55) / 100));
    const right = Math.round(step * (0.36 + (hash(salt, i) % 70) / 100));
    peaks.push({ x, left, right, h });
    if (hash(i, salt + 5) % 3 !== 0) {
      const side = hash(i, salt + 6) % 2 === 0 ? 1 : -1;
      const shift = Math.round(side * step * (0.16 + (hash(i, salt + 7) % 22) / 100));
      peaks.push({
        x: x + shift,
        left: Math.round(left * 0.4),
        right: Math.round(right * 0.46),
        h: Math.round(h * (0.52 + (hash(i, salt + 8) % 28) / 100)),
      });
    }
    x += Math.round(step * (0.7 + (hash(i + 3, salt) % 45) / 100));
    i += 1;
  }
  return peaks;
}

/** Кромка держится площадкой в несколько пикселей, потом срывается на 1–3. */
function silhouette(w: number, peaks: readonly Peak[], salt: number): number[] {
  const out: number[] = [];
  let y = Math.round(peakHeight(0, peaks));
  let run = 0;
  for (let x = 0; x < w; x += 1) {
    if (run <= 0) {
      const delta = peakHeight(x, peaks) - y;
      const n = hash(x, salt);
      let step = 0;
      if (delta !== 0) {
        const lag = Math.abs(delta);
        const mag = lag > 12 ? 3 + (n % 3) : lag > 5 ? 1 + (n % 3) : 1;
        step = Math.sign(delta) * Math.min(lag, mag);
        if (n % 8 === 0) step = 0;
        else if (n % 15 === 0) step = -Math.sign(delta);
      } else if (n % 10 === 0) {
        step = n % 2 === 0 ? 1 : -1;
      }
      y = Math.max(4, y + step);
      run = 2 + (hash(x, salt + 4) % 4);
    }
    run -= 1;
    out.push(y);
  }
  return out;
}

function peakHeight(x: number, peaks: readonly Peak[]): number {
  let h = 0;
  for (const peak of peaks) {
    const dx = x - peak.x;
    const span = dx < 0 ? peak.left : peak.right;
    if (span <= 0) continue;
    const dist = Math.abs(dx);
    if (dist >= span) continue;
    const rise = peak.h * (1 - dist / span);
    if (rise > h) h = rise;
  }
  return h;
}

function paintFar(pix: Pix, x: number, skyH: number, nearH: number, h: number): void {
  const top = skyH - h;
  const stop = skyH - nearH;
  for (let y = top; y < stop; y += 1) {
    pix.px(x, y, hash(x, y) % 8 === 0 ? palette.mountLite : palette.mountFar);
  }
}

/** Ближний склон: сиреневое тело, к низу всё гуще пятна травы. */
function paintNear(pix: Pix, x: number, skyH: number, h: number): void {
  const top = skyH - h;
  for (let i = 0; i < h; i += 1) {
    const y = top + i;
    const depth = (i + 1) / h;
    const n = hash(x, y);
    const patch = hash(x >> 2, y >> 1);
    const low = depth > 0.4 && (patch % 6 === 0 || n % 100 < depth * 46);
    const speck = depth > 0.58 && patch % 14 === 0;
    const base = depth > 0.84 && n % 4 !== 0;
    if (low || speck || base) {
      pix.px(x, y, greenSpeck(n));
      continue;
    }
    const lite = i < h * 0.2 ? n % 3 !== 0 : n % 7 === 0;
    pix.px(x, y, lite ? palette.mountLite : palette.mount);
  }
}

/**
 * Вытоптанное пятно у двери. Не овал: сектора разной длины,
 * у края разрыв, несколько выемок и торчащих клочьев.
 * Семя — метка дома. Контур в долях пятна, не в пикселях экрана:
 * смена окна его масштабирует, а не перекраивает.
 */
export type YardSpec = {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  seed: number;
};

export function houseYards(houses: readonly HouseMark[], field: Rect): YardSpec[] {
  const fit = fitScale(field);
  const specs: YardSpec[] = [];
  for (const house of houses) {
    const seed = yardSeed(house.kind, house.x, house.y);
    const path = doorPath(house.kind, house.x, house.w, house.h, house.y, field);
    if (path) {
      specs.push({ cx: path.cx, cy: path.cy, rx: path.rx, ry: path.ry, seed });
      continue;
    }
    if (house.kind !== 'gate' && house.kind !== 'ruin') continue;
    const pad = house.kind === 'gate' ? 6 : 14;
    specs.push({
      cx: house.x * field.width,
      cy: belowHorizon(house.y, field) + 2,
      rx: pad * fit,
      ry: Math.max(2, 6 * fit),
      seed,
    });
  }
  return specs;
}

function yardSeed(kind: string, x: number, y: number): number {
  return hash(hash(Math.round(x * 10000), Math.round(y * 10000)), kind.charCodeAt(0) + kind.length * 17);
}

type Bite = { x: number; y: number; r2: number };

const biteCache = new Map<string, Bite[]>();

function yardBites(seed: number, rx: number, ry: number): Bite[] {
  const key = `${seed}:${rx}:${ry}`;
  const cached = biteCache.get(key);
  if (cached) return cached;
  const biteCount = 2 + (hash(seed, 9) % 3);
  const bites: Bite[] = [];
  const span = Math.min(rx, ry);
  for (let i = 0; i < biteCount; i += 1) {
    const n = hash(seed, 40 + i);
    const ang = ((n % 360) * Math.PI) / 180;
    const along = 0.62 + ((n >>> 9) % 30) / 100;
    const rad = span * (0.16 + ((n >>> 18) % 16) / 100);
    bites.push({ x: Math.cos(ang) * rx * along, y: Math.sin(ang) * ry * along, r2: rad * rad });
  }
  biteCache.set(key, bites);
  return bites;
}

/** Цвет пятна в пикселе поля. null — здесь остаётся газон или дорога. */
export function yardTone(x: number, y: number, spec: YardSpec): number | null {
  const { cx, cy, rx, ry, seed } = spec;
  if (rx < 2 || ry < 1) return null;
  const dx = x + 0.5 - cx;
  const dy = y + 0.5 - cy;
  const dist = Math.hypot(dx / rx, dy / ry);
  if (dist > 1.6) return null;
  const ang = Math.atan2(dy / ry, dx / rx);
  const sectors = 9;
  let sector = Math.floor((((ang + Math.PI) / (Math.PI * 2)) * sectors) % sectors);
  if (sector < 0) sector += sectors;
  const edge = 0.48 + (hash(seed, sector + 1) % 80) / 100;
  const step = Math.round(ang * 16);
  const tear = ((hash(seed, 200 + step) % 11) - 5) * 0.08;
  const speck = dist > edge + tear && dist < edge + 0.42 && hash(seed, 300 + step) % 5 === 0;
  if (dist > edge + tear && !speck) return null;
  for (const bite of yardBites(seed, rx, ry)) {
    const bx = dx - bite.x;
    const by = dy - bite.y;
    if (bx * bx + by * by < bite.r2) return null;
  }
  const qx = Math.round((dx / rx) * 8);
  const qy = Math.round((dy / ry) * 8);
  if (dist > 0.4 && hash(seed + qx * 5, qy + 11) % 19 === 0) return null;
  const n = hash(seed + qx, qy + 4);
  if (n % 5 === 0) return palette.dirtLite;
  if (n % 4 === 0) return palette.dirtDark;
  return palette.dirt;
}

export function yard(pix: Pix, spec: YardSpec): void {
  if (spec.rx < 2 || spec.ry < 1) return;
  const pad = Math.ceil(Math.max(spec.rx, spec.ry) * 0.7);
  for (let y = Math.floor(spec.cy - spec.ry - pad); y <= Math.ceil(spec.cy + spec.ry + pad); y += 1) {
    for (let x = Math.floor(spec.cx - spec.rx - pad); x <= Math.ceil(spec.cx + spec.rx + pad); x += 1) {
      const tone = yardTone(x, y, spec);
      if (tone !== null) pix.px(x, y, tone);
    }
  }
}

function greenSpeck(n: number): number {
  const k = n % 5;
  if (k === 0) return palette.grassDark;
  if (k === 1) return palette.field;
  if (k === 2) return palette.grassLite;
  return palette.grass;
}
