import type { PropKind } from '../constants';

export type PropMark = {
  kind: PropKind;
  /** Доля поля: 0 слева, 1 справа; 0 дальний край, 1 у дорожки. */
  x: number;
  y: number;
  /** Пиксели до масштаба глубины. Нет — размер вида. */
  w?: number;
  h?: number;
  /** Очки в момент разрушения. Нет — номинал вида. Бонус берётся из списка картинки. */
  score?: number;
};
