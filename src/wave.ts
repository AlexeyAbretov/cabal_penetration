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

/** Случайная пауза, миллисекунды от и до. */
export type Wait = {
  min: number;
  max: number;
};

/**
 * Группа пехоты. Входит с края поля и бегает по своей полосе глубины.
 * far ближе к горизонту, near ближе к камере. Обе доли поля: 0 у горизонта, 1 у дорожки.
 */
export type InfantryGroup = {
  kind: 'infantry';
  count: number;
  from: 'left' | 'right';
  band: { far: number; near: number };
  /** Пауза между бойцами этой группы. */
  step: Wait;
  /** Пауза перед группой, после предыдущей. У первой — до первого бойца. */
  gap: Wait;
};

/** Описание волны картинки: пачка из точки или группа пехоты. */
export type WaveOrder = WaveGroup | InfantryGroup;

export function isInfantry(group: WaveOrder): group is InfantryGroup {
  return 'kind' in group && group.kind === 'infantry';
}

export function isPack(group: WaveOrder): group is WaveGroup {
  return !isInfantry(group);
}

/** Грузовик держит на полоске ещё и тех, кого высадит. Пехота — по числу в группе. */
export function waveQuota(wave: readonly WaveOrder[]): number {
  return wave.reduce((sum, group) => {
    if (isInfantry(group)) return sum + group.count;
    return (
      sum +
      group.composition.reduce((n, kind) => n + (kind === 'truck' ? 1 + truck.riders : 1), 0)
    );
  }, 0);
}
