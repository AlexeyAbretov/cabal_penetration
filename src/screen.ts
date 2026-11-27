import { frame } from './constants';
import { cssViewportSize } from './mobile-landscape';

let pixel = 1;

/** На плотном стекле кадр крупнее на 20%: один игровой пиксель — 1.2 CSS. */
const densePixel = 1.2;

/** CSS-пикселей на один игровой. На компьютере 1, на плотном стекле 1.2. */
export function screenPixel(): number {
  return pixel;
}

export function setScreenPixel(value: number): void {
  pixel = value === densePixel ? densePixel : 1;
}

/**
 * Телефон с плотным стеклом не вмещает опорные 512×448 в один CSS-пиксель:
 * EXPAND тогда рисует кадр мельче пикселя. Берём 1.2, на 20% крупнее.
 * Планшет и окно компьютера, куда картина уже влезает, остаются на 1.
 */
export function readScreenPixel(): number {
  if (typeof window === 'undefined') return 1;
  const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  const dpr = window.devicePixelRatio || 1;
  if (!coarse || dpr < 2) return 1;
  const { width: cssW, height: cssH } = cssViewportSize();
  if (cssW < 2 || cssH < 2) return 1;
  const fit = Math.min(cssW / frame.width, cssH / frame.height);
  return fit < 1 ? densePixel : 1;
}
