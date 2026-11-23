import type { DropKind } from '../constants';
import type { Rect } from '../layout';
import type { Ground } from './ground';
import type { BarrelMark } from '../types/barrel';
import type { FenceMark } from '../types/fence';
import type { HouseMark } from '../types/house';
import type { KilnMark } from '../types/kiln';
import type { RockMark } from '../types/rock';
import { picketTotal, type PicketMark } from '../types/picket';
import type { PropMark } from '../types/prop';
import type { RailMark } from '../types/rail';
import type { SandbagMark } from '../types/sandbag';
import type { ShortMark } from '../types/shortFence';
import type { TreeMark } from '../types/tree';
import type { WaveOrder } from '../wave';

/**
 * Одна картинка маршрута. Фон рисует сцена из земли картинки.
 * Дорожка под солдатом — низ той же земли. Нет земли — поле и дорожка одной заливкой.
 * Здесь дома, кусты и волна. Забор перед солдатом — свой список колонок.
 * Короткий кирпич на траве и мешки на дороге стену не закрывают.
 */
export type Picture = {
  id: string;
  /** Своя земля. Нет — сцена заливает поле и дорожку одним цветом. */
  ground?: Ground;
  /** Пока сердца есть, попадание картинку не начинает заново. */
  boss: boolean;
  wall: readonly boolean[];
  houses: readonly HouseMark[];
  props: readonly PropMark[];
  fences: readonly FenceMark[];
  shorts: readonly ShortMark[];
  sandbags: readonly SandbagMark[];
  /** Жерди вдоль дороги. Пустой список — забора на картинке нет. */
  rails: readonly RailMark[];
  /** Бочки на поле. Пустой список — бочек нет. */
  barrels: readonly BarrelMark[];
  /** Печи на поле. Пустой список — печи нет. */
  kilns: readonly KilnMark[];
  /**
   * Камни на газоне. Пустой список — камня нет.
   * Очередь колет, граната разбивает сразу. Остаётся куча.
   */
  rocks: readonly RockMark[];
  /**
   * Деревья. Пустой список — деревьев нет.
   * Сухое и живое ставят один лист: пень на месте ствола, крона лежит рядом, сторона зеркалится.
   */
  trees: readonly TreeMark[];
  /** Штакетник. Пустой список — его на картинке нет. Секции считает кадр. */
  pickets: readonly PicketMark[];
  /**
   * Бонусы из домов, кустов, ящиков, короткого кирпича, мешков, заборов у дороги, бочек, печей, камней, деревьев и секций штакетника.
   * Забор перед солдатом не роняет. Уцелевший дом, печь и прочее по пустой полоске не роняют и не падают: кадр замирает как есть.
   * Записей не меньше, чем таких объектов без штакетника: каждый забирает одну случайную,
   * лишние в этой картинке не выпадают.
   * На каждую секцию штакетника сцена добавляет пачку: пролётов столько, сколько толстых столбов на этом окне.
   * Бонусы врагов сюда не входят — у них свой список и свои правила.
   */
  drops: readonly DropKind[];
  wave: readonly WaveOrder[];
};

/** Дома, кусты, ящики, короткий кирпич, мешки, заборы у дороги, бочки, печи, камни, деревья и секции штакетника. Забор перед солдатом не считается. */
export function breakableCount(
  picture: Pick<Picture, 'houses' | 'props' | 'shorts' | 'sandbags' | 'rails' | 'barrels' | 'kilns' | 'rocks' | 'trees' | 'pickets'>,
  field: Rect,
): number {
  return (
    picture.houses.length +
    picture.props.length +
    picture.shorts.length +
    picture.sandbags.length +
    picture.rails.length +
    picture.barrels.length +
    picture.kilns.length +
    picture.rocks.length +
    picture.trees.length +
    picketTotal(picture.pickets, field)
  );
}

/**
 * Список картинки и пачка на каждую секцию штакетника.
 * Пачки добираются здесь, а не в файле картинки: число столбов зависит от ширины окна.
 */
export function bonusList(picture: Picture, field: Rect): readonly DropKind[] {
  const extra = picketTotal(picture.pickets, field);
  if (extra === 0) return picture.drops;
  return [...picture.drops, ...Array.from({ length: extra }, (): DropKind => 'grenades')];
}

/** Папка уровня собирает свои картинки здесь. Четыре сцены и босс — когда они написаны. */
export type Level = {
  id: string;
  pictures: readonly Picture[];
};
