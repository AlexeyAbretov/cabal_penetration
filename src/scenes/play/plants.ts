import { palette } from '../../constants';
import { hash, Pix } from './pix';

/** Куст. Стадия 0 целый, 1 половина листвы, 2 голые ветки. Вспышка — удар, силуэт тот же. */
export function paintBush(w: number, h: number, stage: number, flash: boolean): Pix {
  const pix = new Pix(w, h);
  if (stage >= 2) {
    branches(pix, w, h, flash);
    return pix;
  }
  if (stage === 1) {
    branches(pix, w, h, flash);
    leaves(pix, w, h, flash, true);
    return pix;
  }

  const stump = flash ? palette.ink : palette.bushStump;
  pix.fill(Math.round(w * 0.42), Math.round(h * 0.72), Math.max(2, Math.round(w * 0.16)), Math.round(h * 0.28), stump);
  leaves(pix, w, h, flash, false);
  return pix;
}

/** Нижняя половина кроны. Верх и правый бок остаются веткам. */
function leaves(pix: Pix, w: number, h: number, flash: boolean, half: boolean): void {
  const leaf = flash ? palette.ink : palette.leaf;
  const lite = flash ? palette.ink : palette.leafLite;
  const dark = flash ? palette.ink : palette.leafDark;
  const puffs: [number, number, number, number, number][] = half
    ? [
        [0.32, 0.68, 0.3, 0.26, leaf],
        [0.18, 0.74, 0.16, 0.16, dark],
        [0.4, 0.46, 0.2, 0.16, lite],
      ]
    : [
        [0.5, 0.62, 0.46, 0.36, leaf],
        [0.26, 0.7, 0.3, 0.26, dark],
        [0.76, 0.68, 0.32, 0.28, leaf],
        [0.38, 0.4, 0.28, 0.24, lite],
        [0.66, 0.38, 0.26, 0.22, lite],
        [0.5, 0.28, 0.2, 0.18, lite],
      ];
  for (const [fx, fy, rx, ry, color] of puffs) {
    puff(pix, w * fx, h * fy, w * rx, h * ry, color, lite, dark);
  }
  if (flash) return;
  if (half) {
    pix.px(Math.round(w * 0.28), Math.round(h * 0.52), palette.bloom);
    return;
  }
  pix.px(Math.round(w * 0.32), Math.round(h * 0.36), palette.bloom);
  pix.px(Math.round(w * 0.7), Math.round(h * 0.34), palette.flower);
  pix.px(Math.round(w * 0.48), Math.round(h * 0.24), palette.petal);
}

/** Каркас куста: короткие развилки в стороны, не ствол дерева. */
function branches(pix: Pix, w: number, h: number, flash: boolean): void {
  const wood = flash ? palette.ink : palette.bark;
  const shade = flash ? palette.ink : palette.barkDark;
  const limbs: [number, number, number, number][] = [
    [0.42, 0.92, 0.34, 0.68],
    [0.5, 0.94, 0.5, 0.58],
    [0.58, 0.92, 0.68, 0.66],
    [0.34, 0.68, 0.2, 0.48],
    [0.34, 0.68, 0.36, 0.36],
    [0.5, 0.58, 0.4, 0.3],
    [0.5, 0.58, 0.62, 0.28],
    [0.5, 0.66, 0.5, 0.2],
    [0.68, 0.66, 0.82, 0.46],
    [0.68, 0.66, 0.74, 0.34],
    [0.2, 0.48, 0.12, 0.38],
    [0.36, 0.36, 0.28, 0.24],
    [0.62, 0.28, 0.7, 0.18],
    [0.82, 0.46, 0.9, 0.36],
    [0.74, 0.34, 0.84, 0.24],
  ];
  for (const [x0, y0, x1, y1] of limbs) twig(pix, w * x0, h * y0, w * x1, h * y1, wood, shade);
}

function puff(
  pix: Pix,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  color: number,
  lite: number,
  dark: number,
): void {
  if (rx < 1 || ry < 1) return;
  const rx2 = rx * rx;
  const ry2 = ry * ry;
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y += 1) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x += 1) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const e = (dx * dx) / rx2 + (dy * dy) / ry2;
      if (e > 1) continue;
      if (hash(x, y) % 13 === 0) continue;
      let tint = color;
      if (dx < -rx * 0.15 && dy < 0 && hash(x, y) % 3 !== 0) tint = lite;
      if (e > 0.78 || dy > ry * 0.35) tint = hash(x, y) % 2 === 0 ? dark : color;
      pix.px(x, y, tint);
    }
  }
}

function twig(pix: Pix, x0: number, y0: number, x1: number, y1: number, color: number, shade: number): void {
  const steps = Math.max(1, Math.round(Math.abs(x1 - x0) + Math.abs(y1 - y0)));
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const x = Math.round(x0 + (x1 - x0) * t);
    const y = Math.round(y0 + (y1 - y0) * t);
    pix.px(x, y, color);
    pix.px(x + 1, y, shade);
  }
}
