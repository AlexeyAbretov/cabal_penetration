import { truck, type PropKind } from '../constants';

export type EnemyKind = 'green' | 'tank' | 'wheel' | 'truck';

export type FieldPoint = {
  /** Доля поля: 0 слева, 1 справа. */
  x: number;
  /** Доля поля: 0 дальний край, 1 у дорожки. */
  y: number;
};

/** Одна пачка из фиксированной точки. Волна — массив таких пачек, не генератор. */
export type WaveGroup = {
  delayMs: number;
  point: FieldPoint;
  composition: readonly EnemyKind[];
};

export type BuildingKind = 'cottage' | 'shed' | 'manor';

export type HouseMark = {
  kind: BuildingKind;
  /** Доля поля: 0 слева, 1 справа. Середина фасада. */
  x: number;
  /**
   * Доля опорного поля вниз от горизонта: низ стены.
   * Крыша выше этой доли заходит на небо. Лишняя высота кадра остаётся впереди.
   */
  y: number;
  /** Пиксели у ближнего края, до масштаба глубины. */
  w: number;
  h: number;
};

export type PropMark = {
  kind: PropKind;
  /** Доля поля, как у точки волны. */
  x: number;
  y: number;
  /** Пиксели до масштаба глубины. Нет — размер вида. */
  w?: number;
  h?: number;
  /** Очки в момент разрушения. Нет — номинал вида. Бонус берётся из списка картинки. */
  score?: number;
};

/** Какой лист секции. Новая картинка выбирает свои. */
export type FenceKind = 'stone' | 'rust';

export type FenceMark = {
  kind: FenceKind;
  /** Первая колонка дорожки перед солдатом. */
  from: number;
  /** Последняя колонка, включительно. Дыра маски стены секцию не получает. */
  to: number;
};

/**
 * Короткий кирпич на траве. Ниже стены у ног и её не заменяет.
 * Правый край — конец прежней кладки. Лишние секции растут влево, к кусту.
 */
export type ShortMark = {
  /** Левый край прежней кладки, доля ширины поля. */
  x: number;
  /** Ширина прежней кладки, пиксели опорного кадра. */
  span: number;
  /** Секций листа встык. Две — минимум вдвое длиннее одной. */
  sections: number;
};

/**
 * Секция мешков на дороге. Стену у ног не закрывает.
 * Несколько секций с одной точкой и разным dx — один блокпост.
 * Разрушение берёт один бонус из списка картинки.
 */
export type SandbagMark = {
  /** Середина блокпоста, доля поля. */
  x: number;
  /** 0 дальний край, 1 у дорожки. Подошва секции. */
  y: number;
  /** Сдвиг середины от точки, пиксели листа, до масштаба глубины. */
  dx?: number;
};

/** Грузовик держит на полоске ещё и тех, кого высадит. */
export function waveQuota(wave: readonly WaveGroup[]): number {
  return wave.reduce((sum, group) => {
    return (
      sum +
      group.composition.reduce((n, kind) => n + (kind === 'truck' ? 1 + truck.riders : 1), 0)
    );
  }, 0);
}
