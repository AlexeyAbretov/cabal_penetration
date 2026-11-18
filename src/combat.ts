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

/** Квадрат креста. Кромка входит в удар. */
export type HitBox = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

/** Прямоугольник вокруг центра. reach — половина стороны креста. */
export function hitBox(x: number, y: number, reach: number): HitBox {
  return centerBox(x, y, reach * 2, reach * 2);
}

/** Хитбокс фигуры, центр в (x, y). */
export function centerBox(x: number, y: number, w: number, h: number): HitBox {
  return { left: x - w / 2, right: x + w / 2, top: y - h / 2, bottom: y + h / 2 };
}

/** Два прямоугольника делят хотя бы точку, включая кромку. */
export function rectsOverlap(a: HitBox, b: HitBox): boolean {
  return a.left <= b.right && b.left <= a.right && a.top <= b.bottom && b.top <= a.bottom;
}

/** Круг касается прямоугольника, включая кромку. */
export function circleHitsRect(
  x: number,
  y: number,
  radius: number,
  rect: { left: number; right: number; top: number; bottom: number },
): boolean {
  const nearestX = Math.min(rect.right, Math.max(rect.left, x));
  const nearestY = Math.min(rect.bottom, Math.max(rect.top, y));
  return Math.hypot(x - nearestX, y - nearestY) <= radius;
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
