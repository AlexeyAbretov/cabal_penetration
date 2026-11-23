import type { DropKind } from '../../../constants';
import type { Picture } from '../../picture';
import type { HouseMark } from '../../../types/house';
import type { RockMark } from '../../../types/rock';
import type { TreeMark } from '../../../types/tree';
import type { InfantryGroup } from '../../../wave';
import { approachGround } from './approach';

/**
 * 1-2. Дорога к аэродрому. Волна — сорок два пехотинца.
 * Изба, синяя дверь и руина — отдельные дома. Четыре гранаты роняют их так же, как на 1-1,
 * и каждая берёт один бонус из списка картинки.
 * Пустая полоска их не роняет и не валит.
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

/**
 * Пехота 1-2. Сорок два бойца, семь групп по шесть.
 * На сцене не больше шести. Левый и правый край выпускают бойцов одновременно.
 * Пауза step — между бойцами группы, gap — перед группой своего края.
 * from — край, с которого входят. band — полоса дальней половины опорного поля, как у домов:
 * 0 у горизонта, 1 у ближнего края картинки. Лишняя высота окна впереди.
 * Вторая половина от камеры к горизонту — 0…0.5.
 * Число полосы — центр бойца. Первые группы обоих краёв доходят до горизонта.
 * Дальше полосы спускаются к середине поля.
 * Каждый пробегает часть ширины, стреляет одной пулей и снова выбирает сторону.
 */
const infantryWave: readonly InfantryGroup[] = [
  {
    kind: 'infantry',
    count: 6,
    from: 'left',
    band: { far: 0, near: 0.12 },
    step: { min: 380, max: 980 },
    gap: { min: 700, max: 1200 },
  },
  {
    kind: 'infantry',
    count: 6,
    from: 'right',
    band: { far: 0, near: 0.12 },
    step: { min: 420, max: 1100 },
    gap: { min: 700, max: 1200 },
  },
  {
    kind: 'infantry',
    count: 6,
    from: 'left',
    band: { far: 0.14, near: 0.26 },
    step: { min: 360, max: 920 },
    gap: { min: 1500, max: 2600 },
  },
  {
    kind: 'infantry',
    count: 6,
    from: 'right',
    band: { far: 0.12, near: 0.28 },
    step: { min: 400, max: 1000 },
    gap: { min: 1700, max: 2900 },
  },
  {
    kind: 'infantry',
    count: 6,
    from: 'left',
    band: { far: 0.26, near: 0.38 },
    step: { min: 340, max: 880 },
    gap: { min: 1400, max: 2400 },
  },
  {
    kind: 'infantry',
    count: 6,
    from: 'right',
    band: { far: 0.24, near: 0.4 },
    step: { min: 380, max: 960 },
    gap: { min: 1600, max: 2700 },
  },
  {
    kind: 'infantry',
    count: 6,
    from: 'left',
    band: { far: 0.36, near: 0.48 },
    step: { min: 340, max: 860 },
    gap: { min: 1400, max: 2400 },
  },
];

/** Картинка 1-2. Волна — сорок два пехотинца. Победа, когда убиты все. */
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
  wave: infantryWave,
};
