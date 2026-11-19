import { palette } from '../../../constants';
import type { Ground } from '../../ground';
import { belowHorizon, fitScale, sceneDepth, type Rect } from '../../../layout';
import type { HouseMark } from '../../../types/house';
import type { RailLayout, RailPost } from '../../../types/rail';
import { disc, hash, lerpColor, Pix, stamp } from '../../../scenes/play/pix';

/**
 * Земля деревни, картинка 1-1. Не рип.
 * Дорога сходится в точку на горизонте. Крыши и кроны заходят на небо,
 * штакетник и растения заполняют двор. Жерди и бочки ставит бой.
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
  horizon(pix, h);
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
  const aboveWall = h - 60;
  pickets(pix, Math.round(w * 0.02), Math.round(w * 0.3), aboveWall, Math.round(28 * fit));
  kiln(pix, Math.round(w * 0.95), Math.round(h * 0.5), Math.round(30 * fit));
  crops(pix, Math.round(w * 0.03), Math.round(h * 0.58), fit);
  return pix;
}

function grassTone(x: number, y: number): number {
  const n = hash(x, y);
  if (n % 37 === 0) return palette.grassDark;
  if (n % 41 === 0) return palette.grassDeep;
  if (n % 29 === 0) return palette.grassLite;
  return palette.grass;
}

function dirtTone(x: number, y: number, edges: { left: number; right: number }): number {
  const width = Math.max(1, edges.right - edges.left);
  const u = (x - edges.left) / width;
  const n = hash(x, y);
  if (u < 0.035 || u > 0.965) return palette.dirtDark;
  if (n % 29 === 0) return palette.dirtLite;
  if (n % 43 === 0) return palette.pebble;
  return palette.dirt;
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

/**
 * Дорога с точки на горизонте (y = 0) до переднего плана.
 * Дальше опорной глубины поле почти не ширится.
 * Под ногами наклон тот же, что над забором: иначе кромка встаёт вертикально.
 */
function roadEdges(y: number, w: number, h: number, foreground = false): { left: number; right: number } {
  const depth = Math.max(1, sceneDepth({ x: 0, y: 0, width: w, height: h }));
  const t = y / depth;
  const near = t < 1 || foreground ? t : 1 + (t - 1) * 0.12;
  const fade = Math.min(1, t * 4);
  const mid = w * 0.5 + ((hash(4, y >> 3) % 7) - 3) * fade;
  const wobble = ((hash(2, y) % 5) - 2) * fade;
  const half = Math.min(w * 0.42, Math.max(1, near * 0.36 * w) + wobble);
  return { left: mid - half, right: mid + half };
}

function sow(pix: Pix, dirt: Uint8Array, w: number, h: number, fit: number): void {
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
    const edges = roadEdges(y, w, h);
    if (!edges) continue;
    stone(pix, Math.round(edges.left - 3 - (hash(i, 1) % 4)), y, 2 + (hash(i, 2) % 2));
    stone(pix, Math.round(edges.right + 3 + (hash(i, 3) % 4)), y, 2);
  }
}

const grassDots = [palette.grassDark, palette.grassDeep, palette.grassLite] as const;

/** Крапинки газона: один пиксель, без стебля. На дорогу не садятся. */
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

function pickets(pix: Pix, x0: number, x1: number, ground: number, height: number): void {
  if (x1 <= x0 || height < 6) return;
  const gap = Math.max(4, Math.round(height / 3.2));
  const slat = Math.max(2, Math.round(height / 10));
  for (let x = x0; x < x1; x += gap) {
    const tall = height - (hash(x, ground) % 3);
    const wood = hash(x, 8) % 3 === 0 ? palette.woodDark : palette.wood;
    pix.fill(x, ground - tall, slat, tall, wood);
    pix.fill(x, ground - tall, 1, tall, palette.woodLite);
    pix.px(x, ground - tall - 1, palette.woodLite);
    pix.px(x + slat - 1, ground - tall - 1, palette.wood);
    if ((x - x0) % (gap * 4) < gap) {
      pix.fill(x - 1, ground - tall - 3, slat + 2, tall + 4, palette.woodDark);
      pix.fill(x, ground - tall - 2, 1, tall + 2, palette.woodLite);
    }
  }
  const y1 = ground - Math.round(height * 0.68);
  const y2 = ground - Math.round(height * 0.36);
  pix.fill(x0, y1, x1 - x0, 2, palette.woodDark);
  pix.fill(x0, y1, x1 - x0, 1, palette.woodLite);
  pix.fill(x0, y2, x1 - x0, 2, palette.woodDark);
  pix.fill(x0, y2, x1 - x0, 1, palette.woodLite);
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

function deadTree(pix: Pix, x: number, ground: number, height: number): void {
  if (height < 20) return;
  const trunkW = Math.max(3, Math.round(height * 0.07));
  pix.fill(x, ground - height, trunkW, height, palette.barkDark);
  pix.fill(x, ground - height, 1, height, palette.bark);
  branch(pix, x + 1, ground - Math.round(height * 0.78), x - Math.round(height * 0.28), ground - height);
  branch(pix, x + 1, ground - Math.round(height * 0.62), x + Math.round(height * 0.32), ground - Math.round(height * 0.9));
  branch(pix, x + 1, ground - Math.round(height * 0.48), x + Math.round(height * 0.18), ground - Math.round(height * 0.7));
  branch(pix, x - Math.round(height * 0.12), ground - Math.round(height * 0.92), x - Math.round(height * 0.22), ground - Math.round(height * 0.8));
}

function branch(pix: Pix, x0: number, y0: number, x1: number, y1: number): void {
  const steps = Math.max(1, Math.abs(x1 - x0) + Math.abs(y1 - y0));
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const x = Math.round(x0 + (x1 - x0) * t);
    const y = Math.round(y0 + (y1 - y0) * t);
    pix.px(x, y, palette.bark);
    pix.px(x + 1, y, palette.barkDark);
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

/**
 * Горы у горизонта. Общий контур — гряда, кромка идёт уступами, не прямой гранью.
 * В нижней половине ближних склонов — пятна травы.
 */
function horizon(pix: Pix, skyH: number): void {
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

function greenSpeck(n: number): number {
  const k = n % 5;
  if (k === 0) return palette.grassDark;
  if (k === 1) return palette.field;
  if (k === 2) return palette.grassLite;
  return palette.grass;
}
