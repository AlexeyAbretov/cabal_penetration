import { crossHitsSolid, rectsOverlap, type HitBox } from './combat';

/** Объект сцены, который закрывает того, кто дальше от камеры. sole — ближний низ на экране. */
export type Cover = {
  box: HitBox;
  sole: number;
  /** Плотный пиксель внутри box. Пустая клетка пехоту не закрывает. */
  opaque?: (x: number, y: number) => boolean;
  /** Низ именно этой точки. 0 — пустая клетка. Дальний пиксель ближнего бойца не режет. */
  soleAt?: (x: number, y: number) => number;
};

/** Точка на теле дальше этого низа закрыта ближним объектом. */
export function pointHidden(x: number, y: number, foot: number, covers: readonly Cover[]): boolean {
  for (const cover of covers) {
    if (cover.sole <= foot + 2) continue;
    const box = cover.box;
    if (x < box.left || x > box.right || y < box.top || y > box.bottom) continue;
    if (cover.soleAt && cover.soleAt(x, y) <= foot + 2) continue;
    if (cover.opaque && !cover.opaque(x, y)) continue;
    return true;
  }
  return false;
}

/**
 * Крест достаёт до бойца, если в пересечении тела и креста
 * есть точка, которую ближний объект не закрывает.
 */
export function shotReaches(enemy: HitBox, shot: HitBox, foot: number, covers: readonly Cover[]): boolean {
  if (!rectsOverlap(enemy, shot)) return false;
  return crossHitsSolid(shot, enemy, (x, y) => !pointHidden(x, y, foot, covers));
}
