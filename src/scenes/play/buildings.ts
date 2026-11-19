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
  else shed(pix);
  inkOutline(pix, palette.line);
  return pix;
}

function cottage(pix: Pix): void {
  const w = pix.w;
  const h = pix.h;
  const roofTop = 2;
  const roofBot = Math.round(h * 0.4);
  const found = Math.round(h * 0.78);
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
  const doorW = Math.max(8, Math.round(w * 0.16));
  const doorH = Math.max(12, found - (roofBot + Math.round(h * 0.08)));
  door(pix, wallX + Math.round(wallW * 0.62), found - doorH, doorW, doorH);
}

function manor(pix: Pix): void {
  const w = pix.w;
  const h = pix.h;
  const roofTop = 2;
  const roofBot = Math.round(h * 0.3);
  const floorY = Math.round(h * 0.56);
  const found = Math.round(h * 0.84);
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
  const doorW = Math.max(8, Math.round(w * 0.15));
  const doorH = Math.max(12, found - (floorY + 4));
  door(pix, wallX + Math.round(wallW * 0.58), found - doorH, doorW, doorH);
}

function shed(pix: Pix): void {
  const w = pix.w;
  const h = pix.h;
  const roofBot = Math.round(h * 0.38);
  const found = Math.round(h * 0.8);
  shedRoof(pix, 3, Math.round(h * 0.16), roofBot);
  const wallX = Math.round(w * 0.08);
  const wallW = w - wallX * 2;
  plaster(pix, wallX, roofBot - 1, wallW, found - (roofBot - 1), palette.cream, palette.creamDark, palette.creamLite);
  brickCourses(pix, wallX, found, wallW, h - found - 2);
  const winW = Math.max(6, Math.round(w * 0.22));
  const winH = Math.max(6, Math.round(h * 0.16));
  windowFrame(pix, wallX + Math.round(wallW * 0.12), roofBot + 3, winW, winH);
  const doorW = Math.max(6, Math.round(w * 0.28));
  const doorH = Math.max(8, found - (roofBot + winH + 4));
  door(pix, wallX + Math.round(wallW * 0.52), found - doorH, doorW, doorH);
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

function door(pix: Pix, x: number, y: number, w: number, h: number): void {
  pix.fill(x, y, w, h, palette.door);
  pix.fill(x, y, 1, h, palette.doorLite);
  const panelW = Math.max(2, w - 4);
  const upper = Math.max(2, Math.round(h * 0.36));
  pix.fill(x + 2, y + 2, panelW, upper, palette.doorLite);
  pix.fill(x + 3, y + 3, Math.max(1, panelW - 2), Math.max(1, upper - 2), palette.door);
  const lowerY = y + upper + 4;
  const lowerH = Math.max(2, y + h - lowerY - 2);
  pix.fill(x + 2, lowerY, panelW, lowerH, palette.doorLite);
  pix.fill(x + 3, lowerY + 1, Math.max(1, panelW - 2), Math.max(1, lowerH - 2), palette.door);
  pix.px(x + w - 3, y + Math.round(h * 0.55), palette.brass);
  pix.fill(x - 2, y + h, w + 4, 2, palette.mortar);
  pix.fill(x - 2, y + h, w + 4, 1, palette.creamLite);
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
