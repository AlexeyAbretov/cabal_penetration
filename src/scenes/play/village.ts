import { palette } from '../../constants';
import { picture } from '../../campaign/levels/village/11';
import { fitScale } from '../../layout';
import { paintBush } from './plants';
import { disc, hash, lerpColor, Pix, stamp } from './pix';

/**
 * Своя картинка 1-1, не рип.
 * Дорога уходит вдаль, дома стоят на траве по бокам,
 * заборы и растения заполняют двор. Врагов на этом слое нет.
 */

const roadTop = 0.36;

export function paintSky(w: number, h: number): Pix {
  const pix = new Pix(w, h);
  const band = 4;
  for (let y = 0; y < h; y += 1) {
    const t = Math.floor(y / band) * band / Math.max(1, h);
    const color = lerpColor(palette.skyDeep, palette.skyLite, t);
    pix.fill(0, y, w, 1, color);
  }
  const scale = h >= 70 ? 2 : 1;
  cloud(pix, Math.round(w * 0.16), Math.round(h * 0.16), scale);
  if (w > 180) cloud(pix, Math.round(w * 0.62), Math.round(h * 0.28), scale);
  ridge(pix, palette.hillFar, 0.42);
  ridge(pix, palette.hill, 0.7);
  treeline(pix);
  return pix;
}

export function paintTrack(w: number, h: number): Pix {
  const pix = new Pix(w, h);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const n = hash(x, y);
      let color: number = palette.dirtDark;
      if (n % 8 === 0) color = palette.dirt;
      if (n % 15 === 0) color = palette.dirtRut;
      if (y % 6 === 2 && n % 4 !== 0) color = palette.dirtRut;
      if (n % 47 === 0) color = palette.pebble;
      if (n % 53 === 0) color = palette.dirtLite;
      pix.px(x, y, color);
    }
  }
  pix.fill(0, 0, w, 3, palette.dirtRut);
  return pix;
}

export function paintField(w: number, h: number): Pix {
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

  const fit = fitScale({ x: 0, y: 0, width: w, height: h });
  sow(pix, dirt, w, h, fit);
  for (const house of picture.houses) {
    const pad = house.kind === 'shed' ? 10 : 16;
    yard(pix, house.x * w, house.y * h + 2, pad * fit, 7 * fit);
  }
  roadside(pix, w, h, fit);
  const aboveWall = h - 60;
  lowBrick(pix, Math.round(w * 0.78), aboveWall - Math.round(18 * fit), Math.round(78 * fit), Math.round(16 * fit));
  pickets(pix, Math.round(w * 0.02), Math.round(w * 0.3), aboveWall, Math.round(28 * fit));
  tree(pix, Math.round(w * 0.34), Math.round(h * 0.46), Math.round(118 * fit));
  deadTree(pix, Math.round(w * 0.28), Math.round(h * 0.4), Math.round(86 * fit));
  hayPile(pix, Math.round(w * 0.5), Math.round(h * 0.52), fit);
  barrel(pix, Math.round(w * 0.3), Math.round(h * 0.56), fit);
  kiln(pix, Math.round(w * 0.95), Math.round(h * 0.5), Math.round(30 * fit));
  crops(pix, Math.round(w * 0.03), Math.round(h * 0.58), fit);
  scenicBush(pix, Math.round(w * 0.05), Math.round(h * 0.42), Math.round(40 * fit), Math.round(32 * fit));
  scenicBush(pix, Math.round(w * 0.9), Math.round(h * 0.44), Math.round(36 * fit), Math.round(30 * fit));
  return pix;
}

function grassTone(x: number, y: number): number {
  const patch = hash(x >> 4, y >> 4) % 8;
  if (patch === 0) return palette.grassDark;
  if (patch === 1) return palette.grassDeep;
  if (hash(x, y) % 31 === 0) return palette.grassLite;
  return palette.grass;
}

function dirtTone(x: number, y: number, edges: { left: number; right: number }): number {
  const width = Math.max(1, edges.right - edges.left);
  const u = (x - edges.left) / width;
  const n = hash(x, y);
  const edge = u < 0.035 || u > 0.965;
  const rut = (Math.abs(u - 0.3) < 0.018 || Math.abs(u - 0.7) < 0.018) && n % 4 !== 0;
  if (edge) return palette.dirtDark;
  if (rut) return n % 7 === 0 ? palette.dirt : palette.dirtRut;
  const patch = hash(x >> 3, y >> 2) % 7;
  if (patch === 0) return palette.dirtDark;
  if (n % 29 === 0) return palette.dirtLite;
  if (n % 43 === 0) return palette.pebble;
  return palette.dirt;
}

function roadEdges(y: number, w: number, h: number): { left: number; right: number } | null {
  const top = Math.round(h * roadTop);
  const mid = w * 0.5 + ((hash(4, y >> 3) % 7) - 3);
  if (y < top) {
    const dy = top - y;
    const cap = w * 0.035;
    if (dy > cap) return null;
    const room = Math.sqrt(Math.max(0, 1 - (dy / cap) ** 2)) * (w * 0.045);
    return { left: mid - room, right: mid + room };
  }
  const t = (y - top) / Math.max(1, h - top);
  const wobble = (hash(2, y) % 5) - 2;
  const half = (0.045 + t * 0.3) * w + wobble;
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
      const tall = Math.round((6 + (hash(jx, jy) % 5)) * Math.max(1, fit));
      if (hash(jx, jy) % 3 === 0) clump(pix, jx, jy, tall + 3);
      else blades(pix, jx, jy, tall);
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

function blades(pix: Pix, x: number, y: number, height: number): void {
  for (const dx of [-1, 0, 1]) {
    const tall = height - (hash(x + dx, y) % 3);
    for (let i = 0; i < tall; i += 1) {
      pix.px(x + dx, y - i, i > tall - 2 ? palette.grassLite : palette.grass);
    }
  }
}

function clump(pix: Pix, x: number, y: number, height: number): void {
  for (const dx of [-2, 0, 1, 3]) {
    const tall = height - (hash(x + dx, y) % 4);
    for (let i = 0; i < tall; i += 1) {
      const color = i < 2 ? palette.grassDeep : i > tall - 3 ? palette.grassLite : palette.grass;
      pix.px(x + dx, y - i, color);
    }
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

function roadside(pix: Pix, w: number, h: number, fit: number): void {
  const top = Math.round(h * roadTop) + Math.round(18 * fit);
  const step = Math.max(16, Math.round(28 * fit));
  const left: { x: number; y: number; ph: number }[] = [];
  const right: { x: number; y: number; ph: number }[] = [];
  for (let y = top; y < h - 64; y += step) {
    const edges = roadEdges(y, w, h);
    if (!edges) continue;
    const ph = Math.round((12 + 16 * (y / h)) * fit);
    const postW = Math.max(2, Math.round(3 * fit));
    const lx = Math.round(edges.left - postW - 2);
    const rx = Math.round(edges.right + 2);
    post(pix, lx, y, ph, postW);
    post(pix, rx, y, ph, postW);
    left.push({ x: lx, y, ph });
    right.push({ x: rx, y, ph });
  }
  rails(pix, left, fit);
  rails(pix, right, fit);
}

function post(pix: Pix, x: number, ground: number, height: number, width: number): void {
  pix.fill(x, ground - height, width, height, palette.woodDark);
  pix.fill(x, ground - height, 1, height, palette.woodLite);
  pix.fill(x - 1, ground - height - 1, width + 2, 2, palette.wood);
}

function rails(pix: Pix, posts: { x: number; y: number; ph: number }[], fit: number): void {
  const thick = Math.max(1, Math.round(2 * fit));
  for (let i = 1; i < posts.length; i += 1) {
    const a = posts[i - 1]!;
    const b = posts[i]!;
    rail(pix, a.x, a.y - Math.round(a.ph * 0.72), b.x, b.y - Math.round(b.ph * 0.72), thick);
    rail(pix, a.x, a.y - Math.round(a.ph * 0.38), b.x, b.y - Math.round(b.ph * 0.38), thick);
  }
}

function rail(pix: Pix, x0: number, y0: number, x1: number, y1: number, thick: number): void {
  const steps = Math.max(1, Math.abs(x1 - x0) + Math.abs(y1 - y0));
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const x = Math.round(x0 + (x1 - x0) * t);
    const y = Math.round(y0 + (y1 - y0) * t);
    pix.fill(x, y, Math.max(2, thick + 1), thick, palette.wood);
    pix.px(x, y, palette.woodLite);
  }
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

function lowBrick(pix: Pix, x: number, y: number, w: number, h: number): void {
  if (w < 8 || h < 6) return;
  const course = Math.max(3, Math.round(h / 3));
  const brickW = Math.max(6, Math.round(w / 8));
  pix.fill(x, y, w, 2, palette.mortar);
  let row = 0;
  for (let yy = y + 2; yy < y + h; yy += course, row += 1) {
    const shift = row % 2 === 0 ? 0 : Math.floor(brickW / 2);
    const ch = Math.min(course, y + h - yy);
    for (let xx = x - shift; xx < x + w; xx += brickW) {
      const bx = Math.max(x, xx + 1);
      const ex = Math.min(x + w - 1, xx + brickW);
      if (ex - bx < 2) continue;
      if (row === 1 && xx > x + w * 0.55 && xx < x + w * 0.72) continue;
      const n = hash(bx, yy);
      pix.fill(bx, yy, ex - bx - 1, Math.max(1, ch - 1), n % 4 === 0 ? palette.brickDark : palette.brick);
      pix.fill(bx, yy, ex - bx - 1, 1, palette.brickLite);
    }
  }
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

function hayPile(pix: Pix, x: number, y: number, fit: number): void {
  const spots = [
    [0, 2, 11, 8],
    [-16, 4, 10, 7],
    [14, 5, 10, 7],
    [-8, -6, 9, 7],
    [8, -5, 9, 7],
  ];
  for (const [dx, dy, rw, rh] of spots) {
    bale(pix, x + Math.round(dx! * fit), y + Math.round(dy! * fit), Math.max(4, rw! * fit), Math.max(3, rh! * fit));
  }
}

function bale(pix: Pix, cx: number, cy: number, rx: number, ry: number): void {
  const rx2 = rx * rx;
  const ry2 = ry * ry;
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y += 1) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x += 1) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const e = (dx * dx) / rx2 + (dy * dy) / ry2;
      if (e > 1) continue;
      let color: number = palette.hay;
      if (dy < -ry * 0.25) color = palette.hayLite;
      if (e > 0.82) color = palette.hayBand;
      if (Math.abs(dy) < 1.2) color = palette.hayBand;
      pix.px(x, y, color);
    }
  }
}

function barrel(pix: Pix, cx: number, cy: number, fit: number): void {
  const rx = Math.max(5, 8 * fit);
  const ry = Math.max(6, 11 * fit);
  const rx2 = rx * rx;
  const ry2 = ry * ry;
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y += 1) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x += 1) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      if ((dx * dx) / rx2 + (dy * dy) / ry2 > 1) continue;
      const stave = Math.floor((x - (cx - rx)) / 3) % 2 === 0;
      let color: number = stave ? palette.wood : palette.woodDark;
      if (Math.abs(dy + ry * 0.35) < 1.2 || Math.abs(dy - ry * 0.15) < 1.2) color = palette.iron;
      if (dx < -rx * 0.6) color = palette.woodLite;
      pix.px(x, y, color);
    }
  }
  disc(pix, cx, cy - ry * 0.72, rx * 0.72, ry * 0.28, palette.woodDark);
  disc(pix, cx, cy - ry * 0.78, rx * 0.4, ry * 0.12, palette.line);
  pix.px(Math.round(cx - rx * 0.2), Math.round(cy - ry * 0.86), palette.ironLite);
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

function scenicBush(pix: Pix, x: number, y: number, w: number, h: number): void {
  if (w < 8 || h < 8) return;
  stamp(pix, paintBush(w, h, 0, false), Math.round(x - w / 2), Math.round(y - h / 2));
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

function ridge(pix: Pix, color: number, reach: number): void {
  const { w, h } = pix;
  const base = Math.round(h * reach);
  for (let x = 0; x < w; x += 2) {
    const wave = (hash(x >> 2, color & 31) % 10) + (hash(x >> 4, 3) % 8);
    const top = Math.min(h - 1, base - wave);
    pix.fill(x, top, 2, h - top, color);
    pix.fill(x, top, 2, 1, palette.grassDeep);
  }
}

/** Дальний лес: шапки торчат из гребня, сам холм остаётся сплошным. */
function treeline(pix: Pix): void {
  const { w, h } = pix;
  const base = Math.round(h * 0.7);
  for (let x = 6; x < w - 6; x += 12 + (hash(x, 11) % 14)) {
    const wave = (hash(x >> 2, palette.hill & 31) % 10) + (hash(x >> 4, 3) % 8);
    const ground = Math.min(h - 2, base - wave);
    const height = 7 + (hash(x, 5) % 9);
    if (hash(x, 8) % 2 === 0) cone(pix, x, ground, height);
    else mound(pix, x, ground, height);
  }
}

function cone(pix: Pix, x: number, ground: number, height: number): void {
  for (let i = 0; i < height; i += 1) {
    const half = Math.max(0, Math.round((height - i) * 0.42));
    pix.fill(x - half, ground - height + i, half * 2 + 1, 1, palette.hill);
  }
}

function mound(pix: Pix, x: number, ground: number, height: number): void {
  const rx = Math.max(3, Math.round(height * 0.7));
  const ry = Math.max(3, height);
  disc(pix, x, ground - ry * 0.45, rx, ry * 0.7, palette.hill);
}
