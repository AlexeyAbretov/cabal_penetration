import { truck } from './constants';

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

/** Грузовик держит на полоске ещё и тех, кого высадит. */
export function waveQuota(wave: readonly WaveGroup[]): number {
  return wave.reduce((sum, group) => {
    return (
      sum +
      group.composition.reduce((n, kind) => n + (kind === 'truck' ? 1 + truck.riders : 1), 0)
    );
  }, 0);
}
