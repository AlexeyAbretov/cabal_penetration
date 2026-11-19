import type { DropKind } from '../constants';
import type { FenceMark, HouseMark, PropMark, SandbagMark, ShortMark, WaveGroup } from '../data/wave';

/**
 * Одна картинка маршрута. Фон рисует сцена: дорожка под солдатом — низ той же земли.
 * Здесь дома, кусты и волна. Забор перед солдатом — свой список колонок.
 * Короткий кирпич на траве и мешки на дороге стену не закрывают.
 */
export type Picture = {
  id: string;
  /** Смерть начинает картинку заново. Босса снимают за одну жизнь. */
  boss: boolean;
  wall: readonly boolean[];
  houses: readonly HouseMark[];
  props: readonly PropMark[];
  fences: readonly FenceMark[];
  shorts: readonly ShortMark[];
  sandbags: readonly SandbagMark[];
  /**
   * Бонусы из кустов, ящиков, короткого кирпича и мешков.
   * Забор перед солдатом не роняет.
   * Записей не меньше, чем таких объектов: каждый забирает одну случайную,
   * лишние в этой картинке не выпадают.
   * Бонусы врагов сюда не входят — у них свой список и свои правила.
   */
  drops: readonly DropKind[];
  wave: readonly WaveGroup[];
};

/** Кусты, ящики, короткий кирпич и мешки. Забор перед солдатом не считается. */
export function breakableCount(picture: Pick<Picture, 'props' | 'shorts' | 'sandbags'>): number {
  return picture.props.length + picture.shorts.length + picture.sandbags.length;
}

/** Папка уровня собирает свои картинки здесь. Четыре сцены и босс — когда они написаны. */
export type Level = {
  id: string;
  pictures: readonly Picture[];
};
