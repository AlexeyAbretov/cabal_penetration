import type { FenceMark, HouseMark, PropMark, WaveGroup } from '../../../data/wave';
import type { Picture } from '../../picture';

/**
 * Бой 1-1. Сейчас картинка без врагов: сначала окружение.
 * Слева выход, потом грузовик, правая пачка, оба танка.
 */
export const combatWave: readonly WaveGroup[] = [
  {
    delayMs: 750,
    point: { x: 0.28, y: 0.5 },
    composition: ['green', 'green', 'green', 'green', 'green'],
  },
  {
    delayMs: 4200,
    point: { x: 0.64, y: 0.38 },
    composition: ['truck'],
  },
  {
    delayMs: 9800,
    point: { x: 0.76, y: 0.34 },
    composition: ['green', 'green', 'green', 'green'],
  },
  {
    delayMs: 12800,
    point: { x: 0.36, y: 0.24 },
    composition: ['tank'],
  },
  {
    delayMs: 19200,
    point: { x: 0.64, y: 0.24 },
    composition: ['wheel'],
  },
];

/**
 * Два куста на траве, ниже домов и не на дороге.
 * Левый выше штакетника: голые ветки на досках не читаются.
 * Левый роняет пачку, правый — частый ствол.
 */
const props: readonly PropMark[] = [
  { kind: 'bush', x: 0.2, y: 0.42, drop: 'grenades' },
  { kind: 'bush', x: 0.74, y: 0.62, drop: 'rapid' },
];

/**
 * Изба слева, сарай справа от дороги, розовый дом ближе справа.
 * y — доля опорного поля вниз от горизонта. Крыша выше неё на небе.
 */
const houses: readonly HouseMark[] = [
  { kind: 'cottage', x: 0.16, y: 0.19, w: 176, h: 124 },
  { kind: 'shed', x: 0.65, y: 0.07, w: 92, h: 74 },
  { kind: 'manor', x: 0.78, y: 0.23, w: 164, h: 140 },
];

/** false — дыра: пуля этой колонки доходит до тела. */
const wall = [true, true, true, false, true, true, true, true] as const;

/**
 * Забор перед солдатом, по колонкам дорожки. Дыра в маске стены остаётся дырой.
 * Слева камень, справа ржавые плиты. Другая картинка пишет свой список.
 */
const fences: readonly FenceMark[] = [
  { kind: 'stone', from: 0, to: 2 },
  { kind: 'rust', from: 4, to: 7 },
];

export const picture: Picture = {
  id: '1-1',
  boss: false,
  wall,
  houses,
  props,
  fences,
  wave: [],
};
