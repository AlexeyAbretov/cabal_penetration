import type { DropKind } from '../constants';
import type { Ground } from './ground';
import type { BarrelMark } from '../types/barrel';
import type { FenceMark } from '../types/fence';
import type { HouseMark } from '../types/house';
import type { PropMark } from '../types/prop';
import type { RailMark } from '../types/rail';
import type { SandbagMark } from '../types/sandbag';
import type { ShortMark } from '../types/shortFence';
import type { WaveGroup } from '../wave';

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
  /** Смерть начинает картинку заново. Босса снимают за одну жизнь. */
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
  /**
   * Бонусы из кустов, ящиков, короткого кирпича, мешков, заборов у дороги и бочек.
   * Забор перед солдатом не роняет.
   * Записей не меньше, чем таких объектов: каждый забирает одну случайную,
   * лишние в этой картинке не выпадают.
   * Бонусы врагов сюда не входят — у них свой список и свои правила.
   */
  drops: readonly DropKind[];
  wave: readonly WaveGroup[];
};

/** Кусты, ящики, короткий кирпич, мешки, заборы у дороги и бочки. Забор перед солдатом не считается. */
export function breakableCount(
  picture: Pick<Picture, 'props' | 'shorts' | 'sandbags' | 'rails' | 'barrels'>,
): number {
  return (
    picture.props.length +
    picture.shorts.length +
    picture.sandbags.length +
    picture.rails.length +
    picture.barrels.length
  );
}

/** Папка уровня собирает свои картинки здесь. Четыре сцены и босс — когда они написаны. */
export type Level = {
  id: string;
  pictures: readonly Picture[];
};
