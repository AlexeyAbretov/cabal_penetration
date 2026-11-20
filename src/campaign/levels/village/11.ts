import type { DropKind } from '../../../constants';
import type { BarrelMark } from '../../../types/barrel';
import type { KilnMark } from '../../../types/kiln';
import type { FenceMark } from '../../../types/fence';
import type { HouseMark } from '../../../types/house';
import type { PicketMark } from '../../../types/picket';
import type { PropMark } from '../../../types/prop';
import type { RailMark } from '../../../types/rail';
import type { SandbagMark } from '../../../types/sandbag';
import type { ShortMark } from '../../../types/shortFence';
import type { WaveGroup } from '../../../wave';
import type { Picture } from '../../picture';
import { villageGround } from './ground';

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

/**
 * Блокпост на дороге.
 * Впереди две секции встык. Слева и справа по две, дальше от центра и от камеры:
 * между крыльями просвет, ближняя пара стоит в нём.
 * Каждая ломается сама. Бонус берётся из списка картинки.
 */
const sandbags: readonly SandbagMark[] = [
  { x: 0.40, y: 0.38, dx: -24 },
  { x: 0.40, y: 0.38, dx: 24 },
  { x: 0.5, y: 0.52, dx: -24 },
  { x: 0.5, y: 0.52, dx: 24 },
  { x: 0.58, y: 0.38, dx: -2 },
  { x: 0.60, y: 0.38, dx: 24 },
];

/**
 * Изба слева, сарай справа от дороги, розовый дом ближе справа.
 * y — доля опорного поля вниз от горизонта. Крыша выше неё на небе.
 * Четыре гранаты роняют дом и бонус из списка картинки: тряска, уход в землю, пыль у цоколя лома. Лом остаётся.
 */
const houses: readonly HouseMark[] = [
  { kind: 'cottage', x: 0.16, y: 0.19, w: 176, h: 124 },
  { kind: 'shed', x: 0.65, y: 0.07, w: 92, h: 74 },
  { kind: 'manor', x: 0.78, y: 0.23, w: 164, h: 140 },
];

/**
 * Жерди слева и справа от дороги.
 * Каждый забор ломается целиком, остаётся сломанным и берёт один бонус из списка.
 */
const rails: readonly RailMark[] = [{ side: 'left' }, { side: 'right' }];

/**
 * Штакетник слева на газоне, у стены. Край и длина — прежний рисунок на земле.
 * Подошва на 60 пикселей выше низа поля.
 * Толстый столб начинает секцию. Секция ломается сама, остаётся сломанной и берёт бонус.
 * Пачку на каждую секцию добавляет сцена: столбов столько, сколько влезает в это окно.
 */
const pickets: readonly PicketMark[] = [{ x: 0.02, y: 60, span: 0.28, floor: true }];

/**
 * Бочка слева у дороги, перед жердями. То же место, где она была на земле.
 * Справа от большого дома, у подошвы. В опорный кадр влезают три:
 * четвёртая уже за правым краем. Каждая берёт один бонус из списка.
 */
const barrels: readonly BarrelMark[] = [
  { x: 0.3, y: 0.56 },
  { x: 0.78, y: 0.23, dx: 100, horizon: true },
  { x: 0.78, y: 0.23, dx: 123, horizon: true },
  { x: 0.78, y: 0.23, dx: 146, horizon: true },
];

/**
 * Кирпичная печь справа на газоне. То же место, где она была врисована в землю:
 * середина на 0.95 ширины, экватор на половине высоты поля.
 * Очередь колет, четыре гранаты роняют, как дом. Бонус из списка картинки.
 * Прямой низ закрывает газон.
 */
const kilns: readonly KilnMark[] = [{ x: 0.95, y: 0.5 }];

/**
 * Бонусы домов, кустов, короткого кирпича, секций блокпоста, двух заборов у дороги, бочек и печи.
 * Забор перед солдатом не роняет. Секции штакетника сюда не вписаны:
 * на каждую сцена добавляет пачку, сколько толстых пролётов на этом окне.
 * Записей не меньше, чем этих объектов без штакетника: двадцать один. Каждый забирает одну случайную.
 * Две пачки, частый ствол, две таблички 500, широкий ствол, звезда,
 * десять табличек 100 и четыре таблички 1000.
 * Бонусы врагов сюда не писать.
 */
const drops: readonly DropKind[] = [
  'grenades',
  'rapid',
  'bonus',
  'spread',
  'star',
  'grenades',
  'ton',
  'ton',
  'ton',
  'ton',
  'ton',
  'ton',
  'ton',
  'bonus',
  'ton',
  'ton',
  'medal',
  'medal',
  'medal',
  'medal',
  'ton',
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
  ground: villageGround(houses),
  wall,
  houses,
  props,
  fences,
  shorts,
  sandbags,
  rails,
  barrels,
  kilns,
  pickets,
  drops,
  wave: [],
};
