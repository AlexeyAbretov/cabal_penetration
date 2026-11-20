/** Буфер своего пикселя. Края за кадром молча отбрасываются. */

export class Pix {
  readonly data: Uint8ClampedArray;

  constructor(
    readonly w: number,
    readonly h: number,
  ) {
    this.data = new Uint8ClampedArray(Math.max(0, w) * Math.max(0, h) * 4);
  }

  /** Снимает пиксель. Сквозь дыру виден слой под спрайтом. */
  erase(x: number, y: number): void {
    const xi = x | 0;
    const yi = y | 0;
    if (xi < 0 || yi < 0 || xi >= this.w || yi >= this.h) return;
    this.data[(yi * this.w + xi) * 4 + 3] = 0;
  }

  px(x: number, y: number, color: number): void {
    const xi = x | 0;
    const yi = y | 0;
    if (xi < 0 || yi < 0 || xi >= this.w || yi >= this.h) return;
    const i = (yi * this.w + xi) * 4;
    this.data[i] = (color >> 16) & 255;
    this.data[i + 1] = (color >> 8) & 255;
    this.data[i + 2] = color & 255;
    this.data[i + 3] = 255;
  }

  fill(x: number, y: number, w: number, h: number, color: number): void {
    if (w <= 0 || h <= 0) return;
    const x0 = Math.max(0, Math.floor(x));
    const y0 = Math.max(0, Math.floor(y));
    const x1 = Math.min(this.w, Math.floor(x + w));
    const y1 = Math.min(this.h, Math.floor(y + h));
    const r = (color >> 16) & 255;
    const g = (color >> 8) & 255;
    const b = color & 255;
    const data = this.data;
    const width = this.w;
    for (let yy = y0; yy < y1; yy += 1) {
      let i = (yy * width + x0) * 4;
      for (let xx = x0; xx < x1; xx += 1) {
        data[i] = r;
        data[i + 1] = g;
        data[i + 2] = b;
        data[i + 3] = 255;
        i += 4;
      }
    }
  }
}

export function hash(x: number, y: number): number {
  let n = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return (n ^ (n >>> 16)) >>> 0;
}

export function lerpColor(a: number, b: number, t: number): number {
  const u = Math.min(1, Math.max(0, t));
  const ar = (a >> 16) & 255;
  const ag = (a >> 8) & 255;
  const ab = a & 255;
  const br = (b >> 16) & 255;
  const bg = (b >> 8) & 255;
  const bb = b & 255;
  const r = Math.round(ar + (br - ar) * u);
  const g = Math.round(ag + (bg - ag) * u);
  const bl = Math.round(ab + (bb - ab) * u);
  return (r << 16) | (g << 8) | bl;
}

export function disc(
  pix: Pix,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  color: number,
): void {
  if (rx <= 0 || ry <= 0) return;
  const rx2 = rx * rx;
  const ry2 = ry * ry;
  const x0 = Math.floor(cx - rx);
  const x1 = Math.ceil(cx + rx);
  const y0 = Math.floor(cy - ry);
  const y1 = Math.ceil(cy + ry);
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      if ((dx * dx) / rx2 + (dy * dy) / ry2 <= 1) pix.px(x, y, color);
    }
  }
}

/** Силуэт в один пиксель. Угол крыши тоже берётся: сосед по диагонали считается. */
export function inkOutline(pix: Pix, color: number): void {
  const { w, h, data } = pix;
  const alpha = new Uint8Array(w * h);
  for (let i = 0; i < alpha.length; i += 1) alpha[i] = data[i * 4 + 3]!;
  const r = (color >> 16) & 255;
  const g = (color >> 8) & 255;
  const b = color & 255;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = y * w + x;
      if (alpha[i] !== 0) continue;
      let touch = false;
      for (let dy = -1; dy <= 1 && !touch; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (dx === 0 && dy === 0) continue;
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
          if (alpha[yy * w + xx] !== 0) touch = true;
        }
      }
      if (!touch) continue;
      const o = i * 4;
      data[o] = r;
      data[o + 1] = g;
      data[o + 2] = b;
      data[o + 3] = 255;
    }
  }
}

/** Непрозрачный прямоугольник. Пустой буфер — null. Координаты — угол исходного листа. */
export function cropOpaque(src: Pix): { pix: Pix; x: number; y: number } | null {
  const { w, h, data } = src;
  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < h; y += 1) {
    const row = y * w;
    for (let x = 0; x < w; x += 1) {
      if (data[(row + x) * 4 + 3]! === 0) continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < minX || maxY < minY) return null;
  const pw = maxX - minX + 1;
  const ph = maxY - minY + 1;
  const pix = new Pix(pw, ph);
  for (let y = 0; y < ph; y += 1) {
    const from = ((y + minY) * w + minX) * 4;
    pix.data.set(data.subarray(from, from + pw * 4), y * pw * 4);
  }
  return { pix, x: minX, y: minY };
}

export function stamp(dst: Pix, src: Pix, dx: number, dy: number): void {
  for (let y = 0; y < src.h; y += 1) {
    for (let x = 0; x < src.w; x += 1) {
      const si = (y * src.w + x) * 4;
      if (src.data[si + 3]! < 128) continue;
      const color = (src.data[si]! << 16) | (src.data[si + 1]! << 8) | src.data[si + 2]!;
      dst.px(dx + x, dy + y, color);
    }
  }
}
