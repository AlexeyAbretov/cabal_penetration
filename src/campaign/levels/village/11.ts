import type { HouseMark, PropMark, WaveGroup } from '../../../data/wave';
import type { Picture } from '../../picture';

/**
 * Картинка 1-1. Деревня, учебная стена, зелёные, грузовик, оба танка.
 * Сначала левый выход: маркер с первого кадра, толпа до первого выстрела.
 * Потом грузовик справа от центра: высадка, уход.
 * Правая пачка, затем гусеничный слева и колёсный справа.
 * Оба танка встают, дают один залп и уезжают. На 1-1 ворот нет.
 */
const wave: readonly WaveGroup[] = [
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
 * Два куста — магазин между волнами, не на точках выхода.
 * Левый, ниже первой пачки: пачка гранат, пока едет грузовик.
 * Правый, ниже правой пачки: частый ствол до танков.
 */
const props: readonly PropMark[] = [
  { kind: 'bush', x: 0.1, y: 0.68, drop: 'grenades' },
  { kind: 'bush', x: 0.9, y: 0.62, drop: 'rapid' },
];

/** Уцелевшие прямоугольники. Падают, когда полоска пуста. Пока их не ломают. */
const houses: readonly HouseMark[] = [
  { x: 0.3, y: 0.14, w: 68, h: 44 },
  { x: 0.48, y: 0.2, w: 92, h: 58 },
  { x: 0.66, y: 0.15, w: 72, h: 48 },
];

/** false — дыра: пуля этой колонки доходит до тела. */
const wall = [true, true, true, false, true, true, true, true] as const;

export const picture: Picture = {
  id: '1-1',
  boss: false,
  wall,
  houses,
  props,
  wave,
};
