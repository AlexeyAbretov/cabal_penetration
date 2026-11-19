import { palette } from '../../constants';
import type { BuildingKind } from '../../types/house';
import { belowHorizon, fieldScale, fitScale, type Rect } from '../../layout';
import { hash, inkOutline, Pix } from './pix';

/** Размер фасада на этом поле: глубина мельчит дальний дом, узкое окно сжимает все. */
export function buildingBox(baseW: number, baseH: number, feet: number, field: Rect): { w: number; h: number } {
  const y = field.y + belowHorizon(feet, field);
  const scale = fieldScale(y, field) * fitScale(field);
  return {
    w: Math.max(20, Math.round(baseW * scale)),
    h: Math.max(20, Math.round(baseH * scale)),
  };
}

export function drawBuilding(kind: BuildingKind, w: number, h: number): Pix {
  const pix = new Pix(w, h);
  if (kind === 'cottage') cottage(pix);
  else if (kind === 'manor') manor(pix);
  else if (kind === 'hut') hut(pix);
  else if (kind === 'ruin') ruin(pix);
  else if (kind === 'gate') gate(pix);
  else shed(pix);
  inkOutline(pix, palette.line);
  return pix;
}

function cottage(pix: Pix): void {
  const w = pix.w;
  const h = pix.h;
  const roofTop = 2;
  const roofBot = Math.round(h * 0.4);
  const found = foundation('cottage', h);
  gable(pix, roofTop, roofBot, true);
  const wallX = Math.round(w * 0.06);
  const wallW = w - wallX * 2;
  plaster(pix, wallX, roofBot - 2, wallW, found - (roofBot - 2), palette.cream, palette.creamDark, palette.creamLite);
  brickCourses(pix, wallX - 1, found, wallW + 2, h - found - 2);
  chimney(pix, Math.round(w * 0.68), 2, Math.round((roofBot - roofTop) * 0.7), Math.max(6, Math.round(w * 0.1)));
  const winW = Math.round(w * 0.24);
  const winH = Math.round(h * 0.2);
  windowFrame(pix, wallX + Math.round(wallW * 0.1), roofBot + Math.round(h * 0.06), winW, winH);
  flowerBox(pix, wallX + Math.round(wallW * 0.08), roofBot + Math.round(h * 0.06) + winH + 2, winW + 4);
  const laid = planDoor('cottage', w, h);
  if (laid) entrance(pix, laid);
}

function manor(pix: Pix): void {
  const w = pix.w;
  const h = pix.h;
  const roofTop = 2;
  const roofBot = Math.round(h * 0.3);
  const floorY = Math.round(h * 0.56);
  const found = foundation('manor', h);
  gable(pix, roofTop, roofBot, false);
  const wallX = Math.round(w * 0.05);
  const wallW = w - wallX * 2;
  plaster(pix, wallX, roofBot - 2, wallW, found - (roofBot - 2), palette.manor, palette.manorDark, palette.manorLite);
  pix.fill(wallX, floorY, wallW, 2, palette.woodDark);
  pix.fill(wallX, floorY, wallW, 1, palette.woodLite);
  brickCourses(pix, wallX - 1, found, wallW + 2, h - found - 2);
  chimney(pix, Math.round(w * 0.16), 2, Math.round((roofBot - roofTop) * 0.85), Math.max(6, Math.round(w * 0.1)));
  const winW = Math.max(8, Math.round(w * 0.16));
  const winH = Math.max(8, Math.round((floorY - roofBot) * 0.55));
  const upperY = roofBot + Math.round((floorY - roofBot) * 0.18);
  windowFrame(pix, wallX + Math.round(wallW * 0.12), upperY, winW, winH);
  windowFrame(pix, wallX + Math.round(wallW * 0.58), upperY, winW, winH);
  const lowerH = Math.max(8, Math.round((found - floorY) * 0.5));
  const lowerY = floorY + Math.round((found - floorY) * 0.16);
  windowFrame(pix, wallX + Math.round(wallW * 0.12), lowerY, winW, lowerH);
  const laid = planDoor('manor', w, h);
  if (laid) entrance(pix, laid);
}

function shed(pix: Pix): void {
  const w = pix.w;
  const h = pix.h;
  const roofBot = Math.round(h * 0.38);
  const found = foundation('shed', h);
  shedRoof(pix, 3, Math.round(h * 0.16), roofBot);
  const wallX = Math.round(w * 0.08);
  const wallW = w - wallX * 2;
  plaster(pix, wallX, roofBot - 1, wallW, found - (roofBot - 1), palette.cream, palette.creamDark, palette.creamLite);
  brickCourses(pix, wallX, found, wallW, h - found - 2);
  const winW = Math.max(6, Math.round(w * 0.22));
  const winH = Math.max(6, Math.round(h * 0.16));
  windowFrame(pix, wallX + Math.round(wallW * 0.12), roofBot + 3, winW, winH);
  const laid = planDoor('shed', w, h);
  if (laid) entrance(pix, laid);
}

function gable(pix: Pix, top: number, bot: number, worn: boolean): void {
  const w = pix.w;
  const tileH = Math.max(3, Math.round((bot - top) / 5));
  const tileW = Math.max(4, Math.round(w / 12));
  const mid = Math.floor(w / 2);
  for (let y = top; y < bot; y += 1) {
    const t = (y - top) / Math.max(1, bot - top - 1);
    const half = Math.round(2 + (w / 2 - 3) * t);
    const left = mid - half;
    const right = mid + half;
    const row = Math.floor((y - top) / tileH);
    const rowEdge = (y - top) % tileH === 0;
    for (let x = left; x <= right; x += 1) {
      const col = Math.floor((x - left) / tileW);
      const colEdge = (x - left) % tileW === 0;
      let color: number = (col + row) % 2 === 0 ? palette.roof : palette.roofDark;
      if (hash(x, y) % 9 === 0) color = palette.roofLite;
      if (x < mid && (y - top) % tileH === 1) color = palette.roofLite;
      if (rowEdge || colEdge || x === left || x === right) color = palette.roofDark;
      if (worn && x < left + tileW + 1 && y > bot - tileH * 2) color = palette.roofWood;
      pix.px(x, y, color);
    }
  }
}

function shedRoof(pix: Pix, topL: number, topR: number, bot: number): void {
  const w = pix.w;
  const tileH = Math.max(3, Math.round((bot - topL) / 3));
  for (let x = 2; x < w - 2; x += 1) {
    const t = x / Math.max(1, w - 1);
    const top = Math.round(topL + (topR - topL) * t);
    for (let y = top; y < bot; y += 1) {
      const rowEdge = (y - top) % tileH === 0;
      const colEdge = x % 5 === 2;
      let color: number = (Math.floor(x / 5) + Math.floor((y - top) / tileH)) % 2 === 0 ? palette.roof : palette.roofDark;
      if (hash(x, y) % 8 === 0) color = palette.roofLite;
      if (rowEdge || colEdge || y === top) color = palette.roofDark;
      pix.px(x, y, color);
    }
  }
}

function plaster(
  pix: Pix,
  x: number,
  y: number,
  w: number,
  h: number,
  base: number,
  dark: number,
  lite: number,
): void {
  pix.fill(x, y, w, h, base);
  const x1 = x + w;
  const y1 = y + h;
  for (let yy = y; yy < y1; yy += 1) {
    for (let xx = x; xx < x1; xx += 1) {
      const n = hash(xx, yy);
      if (n % 19 === 0) pix.px(xx, yy, dark);
      else if (n % 29 === 0) pix.px(xx, yy, lite);
    }
  }
  pix.fill(x, y, 1, h, lite);
  pix.fill(x + w - 2, y, 2, h, dark);
  pix.fill(x, y, w, 2, dark);
}

function brickCourses(pix: Pix, x: number, y: number, w: number, h: number): void {
  if (w < 4 || h < 3) return;
  const course = Math.max(3, Math.round(h / 3));
  const brickW = Math.max(5, Math.round(w / 5));
  let row = 0;
  for (let yy = y; yy < y + h; yy += course, row += 1) {
    const ch = Math.min(course, y + h - yy);
    const shift = row % 2 === 0 ? 0 : Math.floor(brickW / 2);
    for (let xx = x - shift; xx < x + w; xx += brickW) {
      const bx = Math.max(x, xx + 1);
      const ex = Math.min(x + w, xx + brickW);
      if (ex - bx < 2) continue;
      const n = hash(bx, yy);
      const color = n % 6 === 0 ? palette.brickDark : n % 5 === 0 ? palette.brickLite : palette.brick;
      pix.fill(bx, yy, ex - bx - 1, Math.max(1, ch - 1), color);
      pix.fill(bx, yy, ex - bx - 1, 1, palette.brickLite);
    }
  }
}

function chimney(pix: Pix, x: number, y: number, h: number, w: number): void {
  brickCourses(pix, x, y + 3, w, h);
  pix.fill(x - 1, y, w + 2, 3, palette.brickDark);
  pix.fill(x + 1, y, w - 2, 1, palette.brickLite);
  const hole = Math.max(2, w - 4);
  pix.fill(x + 2, y + 1, hole, 2, palette.line);
}

function windowFrame(pix: Pix, x: number, y: number, w: number, h: number): void {
  if (w < 6 || h < 5) return;
  const shutter = Math.max(2, Math.round(w * 0.22));
  pix.fill(x, y, shutter, h, palette.shutter);
  pix.fill(x + w - shutter, y, shutter, h, palette.shutter);
  for (let i = 1; i <= 3; i += 1) {
    const sy = y + Math.round((h * i) / 4);
    pix.fill(x, sy, shutter, 1, palette.shutterDark);
    pix.fill(x + w - shutter, sy, shutter, 1, palette.shutterDark);
  }
  const gx = x + shutter;
  const gw = w - shutter * 2;
  pix.fill(gx, y, gw, h, palette.glass);
  pix.fill(gx + Math.floor(gw / 2), y, 1, h, palette.wood);
  pix.fill(gx, y + Math.floor(h / 2), gw, 1, palette.wood);
  pix.fill(gx, y, gw, 1, palette.woodDark);
  pix.fill(gx, y + h - 1, gw, 1, palette.woodDark);
  pix.px(gx + 1, y + 1, palette.glassLite);
  pix.px(gx + 2, y + 2, palette.glassLite);
  pix.fill(x - 1, y + h, w + 2, 2, palette.woodDark);
  pix.fill(x - 1, y + h, w + 2, 1, palette.woodLite);
}

type DoorPlan = { x: number; y: number; w: number; h: number; foot: number };

/** Верх кирпичного цоколя. Порог двери садится сюда, не над ним. */
function foundation(kind: BuildingKind, h: number): number {
  if (kind === 'manor') return Math.round(h * 0.84);
  if (kind === 'hut') return Math.round(h * 0.82);
  if (kind === 'shed') return Math.round(h * 0.8);
  return Math.round(h * 0.78);
}

/**
 * Дверь выше, чем шире, и стоит на крыльце.
 * Низкий фасад мельчит ширину вместе с высотой: щель под окном не плющит её в полоску.
 */
function planDoor(kind: BuildingKind, w: number, h: number): DoorPlan | null {
  const spec = doorSpec(kind, w, h);
  if (!spec) return null;
  const foot = h - 2;
  const porchTop = Math.min(spec.found, foot - 4);
  const avail = porchTop - spec.top;
  if (avail < 4 || spec.wallW < 6) return null;
  const ratio = 1.8;
  let doorW = Math.max(4, Math.min(spec.wantW, spec.wallW - 2));
  let doorH = Math.min(avail, Math.round(doorW * ratio));
  if (doorH < doorW * 1.45) {
    doorW = Math.max(4, Math.floor(avail / ratio));
    doorH = Math.min(avail, Math.round(doorW * ratio));
  }
  if (doorH <= doorW) doorW = Math.max(3, Math.floor(doorH / 1.6));
  const maxX = spec.wallX + spec.wallW - doorW;
  const x = Math.max(spec.wallX, Math.min(maxX, spec.wallX + Math.round(spec.wallW * spec.along)));
  return { x, y: porchTop - doorH, w: doorW, h: doorH, foot };
}

function doorSpec(
  kind: BuildingKind,
  w: number,
  h: number,
): { wallX: number; wallW: number; along: number; wantW: number; top: number; found: number } | null {
  if (kind === 'cottage') {
    const wallX = Math.round(w * 0.06);
    return { wallX, wallW: w - wallX * 2, along: 0.62, wantW: Math.round(w * 0.16), top: Math.round(h * 0.4) + 2, found: foundation(kind, h) };
  }
  if (kind === 'manor') {
    const wallX = Math.round(w * 0.05);
    return { wallX, wallW: w - wallX * 2, along: 0.58, wantW: Math.round(w * 0.15), top: Math.round(h * 0.56) + 3, found: foundation(kind, h) };
  }
  if (kind === 'shed') {
    const wallX = Math.round(w * 0.08);
    return { wallX, wallW: w - wallX * 2, along: 0.52, wantW: Math.round(w * 0.22), top: Math.round(h * 0.38) + 2, found: foundation(kind, h) };
  }
  if (kind === 'hut') {
    const wallX = Math.round(w * 0.08);
    return { wallX, wallW: w - wallX * 2, along: 0.18, wantW: Math.round(w * 0.22), top: Math.round(h * 0.4) + 2, found: foundation(kind, h) };
  }
  return null;
}

/**
 * Вытоптанная земля перед дверью, в пикселях поля.
 * Середина пятна — середина двери, не середина фасада.
 */
export function doorPath(
  kind: BuildingKind,
  markX: number,
  markW: number,
  markH: number,
  feet: number,
  field: Rect,
): { cx: number; cy: number; rx: number; ry: number } | null {
  const box = buildingBox(markW, markH, feet, field);
  const laid = planDoor(kind, box.w, box.h);
  if (!laid) return null;
  const cx = markX * field.width + (laid.x + laid.w / 2 - box.w / 2);
  const foot = belowHorizon(feet, field);
  const rx = Math.max(4, Math.round(laid.w * 0.9));
  const ry = Math.max(4, Math.round(laid.w * 1.05));
  return { cx, cy: foot + ry * 0.55, rx, ry };
}

/** Полотно, столбики крыльца и лестница сквозь цоколь до подошвы. */
function entrance(pix: Pix, plan: DoorPlan): void {
  const { x, y, w, h, foot } = plan;
  pix.fill(x, y, w, h, palette.door);
  pix.fill(x, y, 1, h, palette.doorLite);
  if (w > 2) pix.fill(x + w - 1, y, 1, h, palette.woodDark);
  if (w >= 8 && h >= 14) {
    const panelW = w - 4;
    const upper = Math.max(2, Math.round(h * 0.34));
    pix.fill(x + 2, y + 2, panelW, upper, palette.doorLite);
    pix.fill(x + 3, y + 3, Math.max(1, panelW - 2), Math.max(1, upper - 2), palette.door);
    const lowerY = y + upper + 3;
    const lowerH = y + h - lowerY - 2;
    if (lowerH >= 3 && panelW >= 3) {
      pix.fill(x + 2, lowerY, panelW, lowerH, palette.doorLite);
      pix.fill(x + 3, lowerY + 1, Math.max(1, panelW - 2), lowerH - 2, palette.door);
    }
  }
  if (w >= 5 && h >= 6) pix.px(x + w - 2, y + Math.round(h * 0.55), palette.brass);
  if (w >= 8 && h >= 16) {
    const postW = Math.max(1, Math.round(w * 0.12));
    const postH = Math.max(4, Math.round(h * 0.22));
    const py = y + h - postH;
    const lx = Math.max(1, x - postW);
    const rx = Math.min(pix.w - postW - 1, x + w);
    pix.fill(lx, py, postW, postH, palette.woodDark);
    pix.fill(lx, py, postW, 1, palette.woodLite);
    pix.fill(rx, py, postW, postH, palette.woodDark);
    pix.fill(rx, py, postW, 1, palette.woodLite);
  }
  stoop(pix, x, w, y + h, foot);
}

/** Крыльцо у порога и ступени до земли. Каждая нижняя шире верхней. */
function stoop(pix: Pix, x: number, doorW: number, top: number, foot: number): void {
  const span = foot - top;
  if (span < 2 || doorW < 3) return;
  const count = span >= 10 ? 3 : 2;
  const unit = doorW >= 8 ? 2 : 1;
  for (let i = 0; i < count; i += 1) {
    const grow = (i + 1) * unit;
    const sx = Math.max(1, x - grow);
    const ex = Math.min(pix.w - 1, x + doorW + grow);
    const sy = top + Math.floor((span * i) / count);
    const ey = i === count - 1 ? foot : top + Math.floor((span * (i + 1)) / count);
    const sh = ey - sy;
    const sw = ex - sx;
    if (sw < 2 || sh < 1) continue;
    const wood = i === 0;
    pix.fill(sx, sy, sw, sh, wood ? palette.wood : i === 1 ? palette.pebble : palette.wallLite);
    pix.fill(sx, sy, sw, 1, wood ? palette.woodLite : palette.creamLite);
    if (sh > 2) pix.fill(sx, sy + sh - 1, sw, 1, wood ? palette.woodDark : palette.brickDark);
  }
}

/** Изба 1-2: низкая черепица, штукатурка, дверь на нас. */
function hut(pix: Pix): void {
  const w = pix.w;
  const h = pix.h;
  const roofTop = 2;
  const roofBot = Math.round(h * 0.4);
  const found = foundation('hut', h);
  hip(pix, roofTop, roofBot);
  const wallX = Math.round(w * 0.08);
  const wallW = w - wallX * 2;
  plaster(pix, wallX, roofBot - 2, wallW, found - (roofBot - 2), palette.cream, palette.creamDark, palette.creamLite);
  brickCourses(pix, wallX - 1, found, wallW + 2, h - found - 2);
  const laid = planDoor('hut', w, h);
  if (laid) entrance(pix, laid);
}

/** Руина 1-2: рваный верх, два зелёных проёма, крыши нет. */
function ruin(pix: Pix): void {
  const w = pix.w;
  const h = pix.h;
  const course = Math.max(3, Math.round(h / 16));
  const brickW = Math.max(5, Math.round(w / 8));
  for (let x = 2; x < w - 2; x += 1) {
    const jag = (hash(x, 4) % 5) * Math.max(1, Math.round(h * 0.012));
    const top = Math.round(h * 0.06) + jag;
    for (let y = top; y < h - 2; y += 1) {
      const row = Math.floor((y - top) / course);
      const shift = row % 2 === 0 ? 0 : Math.floor(brickW / 2);
      const seam = (x + shift) % brickW === 0 || (y - top) % course === 0;
      if (seam) {
        pix.px(x, y, palette.mortar);
        continue;
      }
      const n = hash(x, row);
      pix.px(x, y, n % 6 === 0 ? palette.brickDark : n % 5 === 0 ? palette.brickLite : palette.brick);
    }
  }
  opening(pix, Math.round(w * 0.16), Math.round(h * 0.34), Math.round(w * 0.24), Math.round(h * 0.16));
  opening(pix, Math.round(w * 0.56), Math.round(h * 0.42), Math.round(w * 0.22), Math.round(h * 0.15));
}

/** Синяя дверь перед избой. Стоит ближе и рисуется поверх. */
function gate(pix: Pix): void {
  const w = pix.w;
  const h = pix.h;
  pix.fill(2, 2, w - 4, h - 4, palette.steel);
  pix.fill(2, 2, Math.max(2, Math.round(w * 0.08)), h - 4, palette.steelLite);
  pix.fill(w - 2 - Math.max(2, Math.round(w * 0.08)), 2, Math.max(2, Math.round(w * 0.08)), h - 4, palette.steelDark);
  for (let i = 1; i <= 3; i += 1) {
    const y = Math.round((h * i) / 4);
    pix.fill(4, y, w - 8, 1, palette.steelDark);
  }
  const signW = Math.max(6, Math.round(w * 0.46));
  const signH = Math.max(3, Math.round(h * 0.07));
  const sx = Math.round(w * 0.27);
  const sy = Math.round(h * 0.1);
  pix.fill(sx, sy, signW, signH, palette.petal);
  pix.fill(sx, sy, Math.max(2, Math.round(signW * 0.34)), signH, palette.bloom);
}

function hip(pix: Pix, top: number, bot: number): void {
  const w = pix.w;
  const tileH = Math.max(3, Math.round((bot - top) / 4));
  const tileW = Math.max(4, Math.round(w / 10));
  for (let y = top; y < bot; y += 1) {
    const t = (y - top) / Math.max(1, bot - top - 1);
    const inset = Math.round((1 - t) * w * 0.16);
    const left = 2 + inset;
    const right = w - 3 - inset;
    const row = Math.floor((y - top) / tileH);
    const rowEdge = (y - top) % tileH === 0;
    for (let x = left; x <= right; x += 1) {
      const col = Math.floor((x - left) / tileW);
      const colEdge = (x - left) % tileW === 0;
      let color: number = (col + row) % 2 === 0 ? palette.roof : palette.roofDark;
      if (hash(x, y) % 9 === 0) color = palette.roofLite;
      if (y === top || rowEdge || colEdge || x === left || x === right) color = palette.roofDark;
      pix.px(x, y, color);
    }
  }
}

function opening(pix: Pix, x: number, y: number, w: number, h: number): void {
  if (w < 6 || h < 5) return;
  pix.fill(x, y, w, h, palette.line);
  pix.fill(x + 2, y + 2, w - 4, h - 4, palette.leaf);
  pix.fill(x + 3, y + 3, Math.max(1, w - 6), Math.max(1, Math.round((h - 6) * 0.45)), palette.leafLite);
}

function flowerBox(pix: Pix, x: number, y: number, w: number): void {
  pix.fill(x, y, w, 4, palette.woodDark);
  pix.fill(x, y, w, 1, palette.woodLite);
  const blooms = [palette.bloom, palette.flower, palette.petal, palette.leafLite, palette.bloom];
  for (let i = 0; i < blooms.length; i += 1) {
    const bx = x + 2 + i * Math.max(2, Math.floor((w - 4) / blooms.length));
    pix.px(bx, y - 1, blooms[i]!);
    pix.px(bx, y - 2, i % 2 === 0 ? palette.leaf : palette.leafLite);
    pix.px(bx + 1, y - 1, palette.leafDark);
  }
}
