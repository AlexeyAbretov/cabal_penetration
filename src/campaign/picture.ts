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
  wave: readonly WaveGroup[];
};

/** Папка уровня собирает свои картинки здесь. Четыре сцены и босс — когда они написаны. */
export type Level = {
  id: string;
  pictures: readonly Picture[];
};
