import type { DropKind } from '../../../constants';
import type { FenceMark, HouseMark, PropMark, SandbagMark, ShortMark, WaveGroup } from '../../../data/wave';
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
 * Кусты на траве, ниже домов и не на дороге.
 * Большой левый выше штакетника: голые ветки на досках не читаются.
 * Маленькие по краям газона сами очков не дают. Бонус берётся из списка картинки.
 */
const props: readonly PropMark[] = [
  { kind: 'bush', x: 0.2, y: 0.42 },
  { kind: 'bush', x: 0.74, y: 0.62 },
  { kind: 'bush', x: 0.05, y: 0.42, w: 40, h: 32, score: 0 },
  { kind: 'bush', x: 0.9, y: 0.44, w: 36, h: 30, score: 0 },
];

/**
 * Короткий кирпич справа на газоне.
 * Правый край на 20 пикселей правее прежней кладки: от 0.78 на 78 пикселей,
 * низ на 60 пикселей от низа поля. Две секции встык — минимум вдвое длиннее одного листа,
 * лишняя длина уходит влево, к кусту.
 */
const shorts: readonly ShortMark[] = [{ x: 0.78, span: 78, sections: 2 }];

/** Мешки посреди дороги, на месте прежней кучи. */
const sandbags: readonly SandbagMark[] = [{ x: 0.5, y: 0.52 }];

/**
 * Изба слева, сарай справа от дороги, розовый дом ближе справа.
 * y — доля опорного поля вниз от горизонта. Крыша выше неё на небе.
 */
const houses: readonly HouseMark[] = [
  { kind: 'cottage', x: 0.16, y: 0.19, w: 176, h: 124 },
  { kind: 'shed', x: 0.65, y: 0.07, w: 92, h: 74 },
  { kind: 'manor', x: 0.78, y: 0.23, w: 164, h: 140 },
];

/**
 * Бонусы кустов, короткого кирпича и мешков. Забор перед солдатом не роняет.
 * Записей не меньше, чем этих объектов: шесть. Каждый забирает одну случайную.
 * Пачка, частый ствол, две таблички по 500, широкий ствол, звезда 2000.
 * Бонусы врагов сюда не писать.
 */
const drops: readonly DropKind[] = ['grenades', 'rapid', 'bonus', 'bonus', 'spread', 'star'];

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
  shorts,
  sandbags,
  drops,
  wave: [],
};
