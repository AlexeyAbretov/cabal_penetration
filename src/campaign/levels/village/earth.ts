import { palette } from '../../../constants';
import { sceneDepth } from '../../../layout';
import { disc, hash, lerpColor, Pix } from '../../../scenes/play/pix';

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

export function deadTree(pix: Pix, x: number, ground: number, height: number): void {
  if (height < 20) return;
  const trunkW = Math.max(3, Math.round(height * 0.07));
  pix.fill(x, ground - height, trunkW, height, palette.barkDark);
  pix.fill(x, ground - height, 1, height, palette.bark);
  branch(pix, x + 1, ground - Math.round(height * 0.78), x - Math.round(height * 0.28), ground - height);
  branch(pix, x + 1, ground - Math.round(height * 0.62), x + Math.round(height * 0.32), ground - Math.round(height * 0.9));
  branch(pix, x + 1, ground - Math.round(height * 0.48), x + Math.round(height * 0.18), ground - Math.round(height * 0.7));
  branch(pix, x - Math.round(height * 0.12), ground - Math.round(height * 0.92), x - Math.round(height * 0.22), ground - Math.round(height * 0.8));
}

export function branch(pix: Pix, x0: number, y0: number, x1: number, y1: number): void {
  const steps = Math.max(1, Math.abs(x1 - x0) + Math.abs(y1 - y0));
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const x = Math.round(x0 + (x1 - x0) * t);
    const y = Math.round(y0 + (y1 - y0) * t);
    pix.px(x, y, palette.bark);
    pix.px(x + 1, y, palette.barkDark);
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

function greenSpeck(n: number): number {
  const k = n % 5;
  if (k === 0) return palette.grassDark;
  if (k === 1) return palette.field;
  if (k === 2) return palette.grassLite;
  return palette.grass;
}
