import type { Level, Picture } from './picture';
import { level as village } from './levels/village';

/** Порядок кампании. Новый уровень — папка и одна строка здесь. */
export const route: readonly Level[] = [village];

export function pictureAt(levelIndex: number, pictureIndex: number): Picture {
  const picture = route[levelIndex]?.pictures[pictureIndex];
  if (!picture) throw new Error('В маршруте нет этой картинки.');
  return picture;
}
