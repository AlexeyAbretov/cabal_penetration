export type BulletVerdict = 'wall' | 'whiff' | 'hurt' | 'miss';

/** Колонка дорожки. Граница принадлежит правой секции, край кадра зажимается. */
export function columnIndex(x: number, origin: number, width: number, count: number): number {
  if (width <= 0 || count <= 0) return 0;
  const raw = ((x - origin) / width) * count;
  return Math.min(count - 1, Math.max(0, Math.floor(raw)));
}

/**
 * Пуля уже выбрала колонку.
 * Целая секция ловит её. Иначе тело в этой колонке теряет жизнь,
 * если сейчас не кувырок и не мигание после ранения.
 */
export function resolveColumnHit(args: {
  column: number;
  soldierColumn: number;
  wallUp: boolean;
  invulnerable: boolean;
}): BulletVerdict {
  if (args.wallUp) return 'wall';
  if (args.column !== args.soldierColumn) return 'miss';
  if (args.invulnerable) return 'whiff';
  return 'hurt';
}

export function arcPoint(
  t: number,
  fromX: number,
  fromY: number,
  ctrlX: number,
  ctrlY: number,
  toX: number,
  toY: number,
): { x: number; y: number } {
  const u = 1 - t;
  return {
    x: u * u * fromX + 2 * u * t * ctrlX + t * t * toX,
    y: u * u * fromY + 2 * u * t * ctrlY + t * t * toY,
  };
}

/** Дистанция от точки до отрезка и доля вдоль отрезка от начала к концу. */
export function distanceToSegment(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): { distance: number; t: number } {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1) {
    return { distance: Math.hypot(px - x1, py - y1), t: 0 };
  }
  const t = Math.min(1, Math.max(0, ((px - x1) * dx + (py - y1) * dy) / len2));
  return {
    distance: Math.hypot(px - (x1 + dx * t), py - (y1 + dy * t)),
    t,
  };
}
