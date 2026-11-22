import { truck } from './constants';
import { isInfantry, type WaveOrder } from './wave';

/**
 * Сложность захода.
 * Новый уровень — объект в `difficulties`, кнопка на старте появится сама.
 * Удалить уровень — убрать объект. Поменять уже существующий — править его числа.
 * Порядок в списке — порядок кнопок.
 *
 * enemies — число врагов относительно картинки. 1.5 — на 50% больше, 2 — на 100% больше.
 * hp — жизни врагов относительно констант. 2 — вдвое, то есть +100%. 3 — +200%.
 * damage — сколько жизней снимает одно попадание. 1 — как сейчас, 2 — +100% урона.
 */
export type Difficulty = {
  /** Ключ, который заход помнит между картинками. */
  id: string;
  /** Подпись кнопки. */
  label: string;
  enemies: number;
  hp: number;
  damage: number;
};

export const difficulties: readonly Difficulty[] = [
  { id: 'easy', label: 'Лёгкий', enemies: 1, hp: 1, damage: 1 },
  { id: 'normal', label: 'Обычный', enemies: 1.5, hp: 2, damage: 2 },
  { id: 'hard', label: 'Сложный', enemies: 2, hp: 3, damage: 3 },
];

export function difficultyById(id: string | null | undefined): Difficulty | null {
  if (!id) return null;
  return difficulties.find((row) => row.id === id) ?? null;
}

/**
 * Сколько единиц выйдет из записанного числа.
 * Ноль так и остаётся нулём. Дробь округляется до целого.
 * Если в картинке кто-то был и множитель больше нуля, выйдет хотя бы один.
 */
export function scaleCount(count: number, multiplier: number): number {
  if (count <= 0 || !(multiplier > 0)) return 0;
  return Math.max(1, Math.round(count * multiplier));
}

/** Жизни одной фигуры. Множитель 1 оставляет число из констант. */
export function scaleHp(base: number, multiplier: number): number {
  return base * multiplier;
}

/**
 * Жизни солдата за одно попадание.
 * Множитель 1 — одна жизнь. Ноль и меньше — попадание не ранит.
 * Дробь округляется, но если урон есть, снимается хотя бы одна жизнь.
 */
export function scaleHurt(multiplier: number): number {
  if (!(multiplier > 0)) return 0;
  return Math.max(1, Math.round(multiplier));
}

/** Десант одного грузовика с учётом множителя числа врагов. */
export function riderCount(enemies: number): number {
  return scaleCount(truck.riders, enemies);
}

/**
 * Волна с новым числом бойцов. Записи картинки не меняет.
 * Группа пехоты растит свой счёт. Пачка повторяет состав по кругу, пока не наберёт новую длину.
 */
export function scaleWave(wave: readonly WaveOrder[], enemies: number): readonly WaveOrder[] {
  if (enemies === 1) return wave;
  return wave.map((group) => {
    if (isInfantry(group)) return { ...group, count: scaleCount(group.count, enemies) };
    const total = scaleCount(group.composition.length, enemies);
    return { ...group, composition: repeat(group.composition, total) };
  });
}

function repeat<T>(items: readonly T[], total: number): T[] {
  if (items.length === 0 || total <= 0) return [];
  const out: T[] = [];
  for (let i = 0; i < total; i += 1) {
    const item = items[i % items.length];
    if (item !== undefined) out.push(item);
  }
  return out;
}
