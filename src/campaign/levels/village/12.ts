import type { DropKind } from '../../../constants';
import type { Picture } from '../../picture';
import type { HouseMark } from '../../../types/house';
import { approachGround } from './approach';

/**
 * 1-2, пока без волны. Дорога к аэродрому.
 * Изба, синяя дверь и руина — отдельные дома. Четыре гранаты роняют их так же, как на 1-1,
 * и каждая берёт один бонус из списка картинки.
 * Пустая полоска роняет тех, кто ещё стоит.
 * Дерево, лестница, камень и кирпич по бокам врисованы в землю.
 * Оранжевый крест на референсе — прицел аркады, сюда не переносится.
 * Заглушка передней стены выключена: иначе она закроет кирпич.
 */
const houses: readonly HouseMark[] = [
  { kind: 'hut', x: 0.12, y: 0.3, w: 150, h: 112 },
  { kind: 'gate', x: 0.2, y: 0.54, w: 58, h: 96 },
  { kind: 'ruin', x: 0.88, y: 0.48, w: 148, h: 156 },
];

const wall = [false, false, false, false, false, false, false, false] as const;

/** Три дома, три записи. Каждый забирает одну случайную. */
const drops: readonly DropKind[] = ['grenades', 'bonus', 'medal'];

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
  pickets: [],
  drops,
  wave: [],
};
