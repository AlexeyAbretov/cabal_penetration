export type BuildingKind = 'cottage' | 'shed' | 'manor' | 'hut' | 'ruin' | 'gate';

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
