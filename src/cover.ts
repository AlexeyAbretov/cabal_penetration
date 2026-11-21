import type { HitBox } from './combat';

/** Объект сцены, который закрывает того, кто дальше от камеры. sole — низ на экране. */
export type Cover = {
  box: HitBox;
  sole: number;
};

/** Точка на теле дальше этого низа закрыта ближним объектом. */
export function pointHidden(x: number, y: number, foot: number, covers: readonly Cover[]): boolean {
  for (const cover of covers) {
    if (cover.sole <= foot + 2) continue;
    const box = cover.box;
    if (x >= box.left && x <= box.right && y >= box.top && y <= box.bottom) return true;
  }
  return false;
}

/**
 * Крест достаёт до бойца, если хотя бы одна точка пересечения не лежит в ближнем объекте.
 * Целиком за домом, деревом или бочкой выстрел его не берёт.
 */
export function shotReaches(enemy: HitBox, shot: HitBox, foot: number, covers: readonly Cover[]): boolean {
  const left = Math.max(enemy.left, shot.left);
  const right = Math.min(enemy.right, shot.right);
  const top = Math.max(enemy.top, shot.top);
  const bottom = Math.min(enemy.bottom, shot.bottom);
  if (left > right || top > bottom) return false;
  const samples: readonly [number, number][] = [
    [(left + right) / 2, (top + bottom) / 2],
    [left, top],
    [right, top],
    [left, bottom],
    [right, bottom],
  ];
  for (const [x, y] of samples) {
    if (!pointHidden(x, y, foot, covers)) return true;
  }
  return false;
}
