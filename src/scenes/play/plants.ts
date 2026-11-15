import { palette } from '../../constants';
import { hash, Pix } from './pix';

/** Куст. Стадия 0 целый, 1 объеден, 2 пенёк. Вспышка — удар, силуэт тот же. */
export function paintBush(w: number, h: number, stage: number, flash: boolean): Pix {
  const pix = new Pix(w, h);
  const leaf = flash ? palette.ink : palette.leaf;
  const lite = flash ? palette.ink : palette.leafLite;
  const dark = flash ? palette.ink : palette.leafDark;
  const hurt = flash ? palette.ink : palette.bushHurt;
  const stump = flash ? palette.ink : palette.bushStump;

  pix.fill(Math.round(w * 0.42), Math.round(h * 0.72), Math.max(2, Math.round(w * 0.16)), Math.round(h * 0.28), stump);
  if (stage >= 2) {
    pix.fill(Math.round(w * 0.38), Math.round(h * 0.62), Math.max(2, Math.round(w * 0.1)), 2, palette.woodDark);
    return pix;
  }

  const puffs =
    stage === 0
      ? [
          [0.5, 0.62, 0.46, 0.36, leaf],
          [0.26, 0.7, 0.3, 0.26, dark],
          [0.76, 0.68, 0.32, 0.28, leaf],
          [0.38, 0.4, 0.28, 0.24, lite],
          [0.66, 0.38, 0.26, 0.22, lite],
          [0.5, 0.28, 0.2, 0.18, lite],
        ]
      : [
          [0.46, 0.66, 0.34, 0.28, hurt],
          [0.28, 0.74, 0.22, 0.18, dark],
          [0.68, 0.72, 0.2, 0.16, hurt],
        ];

  for (const [fx, fy, rx, ry, color] of puffs) {
    puff(pix, w * fx!, h * fy!, w * rx!, h * ry!, color!, lite, dark);
  }

  if (stage === 0 && !flash) {
    pix.px(Math.round(w * 0.32), Math.round(h * 0.36), palette.bloom);
    pix.px(Math.round(w * 0.7), Math.round(h * 0.34), palette.flower);
    pix.px(Math.round(w * 0.48), Math.round(h * 0.24), palette.petal);
  }
  return pix;
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
