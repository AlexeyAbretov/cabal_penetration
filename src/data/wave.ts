export type EnemyKind = 'green';

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

/**
 * Учебная волна среза 3.
 * Сначала левый выход: маркер с первого кадра, толпа до первого выстрела.
 * Правый маркер загорается до своей очереди, когда левая пачка уже читается.
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
