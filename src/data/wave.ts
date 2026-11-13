import type { DropKind, PropKind } from '../constants';

export type EnemyKind = 'green' | 'tank';

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

export type HouseMark = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export type PropMark = {
  kind: PropKind;
  /** Доля поля, как у точки волны. */
  x: number;
  y: number;
  drop: DropKind;
};

/**
 * Учебная волна среза 4.
 * Сначала левый выход: маркер с первого кадра, толпа до первого выстрела.
 * Правый маркер загорается до своей очереди, когда левая пачка уже читается.
 * Танк выходит слева вместе с правой пачкой: гранату есть на кого жалеть.
 */
export const drillWave: readonly WaveGroup[] = [
  {
    delayMs: 750,
    point: { x: 0.28, y: 0.5 },
    composition: ['green', 'green', 'green', 'green', 'green'],
  },
  {
    delayMs: 5400,
    point: { x: 0.76, y: 0.34 },
    composition: ['green', 'green', 'green', 'green'],
  },
  {
    delayMs: 6800,
    point: { x: 0.24, y: 0.22 },
    composition: ['tank'],
  },
];

/**
 * Магазин этой сцены. Ломается очередью, на дорожку падает один предмет.
 * Левый куст — пачка. Нижний у центра — частый ствол. Правый нижний ящик — широкий.
 * Правый верхний ящик — звезда, её номинал отдельно от очков за ящик.
 */
export const drillProps: readonly PropMark[] = [
  { kind: 'bush', x: 0.07, y: 0.48, drop: 'grenades' },
  { kind: 'bush', x: 0.52, y: 0.64, drop: 'rapid' },
  { kind: 'crate', x: 0.94, y: 0.58, drop: 'spread' },
  { kind: 'crate', x: 0.86, y: 0.18, drop: 'star' },
];

/** Уцелевшие прямоугольники. Падают, когда полоска пуста. В этой проверке их не ломают. */
export const drillHouses: readonly HouseMark[] = [
  { x: 0.3, y: 0.14, w: 68, h: 44 },
  { x: 0.48, y: 0.2, w: 92, h: 58 },
  { x: 0.66, y: 0.15, w: 72, h: 48 },
];

export function waveQuota(wave: readonly WaveGroup[]): number {
  return wave.reduce((sum, group) => sum + group.composition.length, 0);
}
