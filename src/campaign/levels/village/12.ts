import type { DropKind } from '../../../constants';
import type { Picture } from '../../picture';
import type { HouseMark } from '../../../types/house';
import type { RockMark } from '../../../types/rock';
import type { TreeMark } from '../../../types/tree';
import { approachGround } from './approach';

/**
 * 1-2, пока без волны. Дорога к аэродрому.
 * Изба, синяя дверь и руина — отдельные дома. Четыре гранаты роняют их так же, как на 1-1,
 * и каждая берёт один бонус из списка картинки.
 * Пустая полоска роняет тех, кто ещё стоит.
 * Сухое дерево ломается как на 1-1 и роняет бонус.
 * Камень справа от дороги ломается как на 1-1: крошка, куча, бонус из списка.
 * Лестница и кирпич по бокам врисованы в землю.
 * Оранжевый крест на референсе — прицел аркады, сюда не переносится.
 * Заглушка передней стены выключена: иначе она закроет кирпич.
 */
const houses: readonly HouseMark[] = [
  { kind: 'hut', x: 0.12, y: 0.3, w: 150, h: 112 },
  { kind: 'gate', x: 0.2, y: 0.54, w: 58, h: 96 },
  { kind: 'ruin', x: 0.88, y: 0.48, w: 148, h: 156 },
];

const wall = [false, false, false, false, false, false, false, false] as const;

/**
 * Сухое дерево слева от дороги. То же место, где оно было врисовано в землю.
 * Ствол не пропадает: пень на месте ствола, крона лежит рядом, сторона падения зеркалится.
 * Один бонус из списка картинки.
 */
const trees: readonly TreeMark[] = [{ x: 0.28, y: 0.26, h: 124, live: false }];

/**
 * Камень справа от дороги. То же место, где он был врисован тремя овалами.
 * Подошва чуть ниже прежней середины, чтобы гребень остался на той высоте.
 */
const rocks: readonly RockMark[] = [{ x: 0.7, y: 0.47 }];

/** Три дома, сухое дерево и камень, пять записей. Каждый забирает одну случайную. */
const drops: readonly DropKind[] = ['grenades', 'bonus', 'medal', 'grenades', 'grenades'];

export const picture: Picture = {
  id: '1-2',
  boss: false,
  ground: approachGround(houses),
  wall,
  houses,
  props: [],
  fences: [],
  shorts: [],
  sandbags: [],
  rails: [],
  barrels: [],
  kilns: [],
  rocks,
  trees,
  pickets: [],
  drops,
  wave: [],
};
