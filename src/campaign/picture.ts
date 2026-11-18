import type { FenceMark, HouseMark, PropMark, ShortMark, WaveGroup } from '../data/wave';

/**
 * Одна картинка маршрута. Фон рисует сцена: дорожка под солдатом — низ той же земли.
 * Здесь дома, кусты и волна. Забор перед солдатом — свой список колонок.
 * Короткий кирпич на траве — отдельный список, он стену не закрывает.
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
  wave: readonly WaveGroup[];
};

/** Папка уровня собирает свои картинки здесь. Четыре сцены и босс — когда они написаны. */
export type Level = {
  id: string;
  pictures: readonly Picture[];
};
