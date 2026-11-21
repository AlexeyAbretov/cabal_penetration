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

/** Прямоугольник вокруг центра. reach — половина ширины креста, reachY — половина высоты. */
export function hitBox(x: number, y: number, reach: number, reachY = reach): HitBox {
  return centerBox(x, y, reach * 2, reachY * 2);
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

/** Кладка, которая ловит чужую пулю на пути к колонке. */
export type FlightBlock = {
  column: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
};

/** Куда дошла пуля за кадр. fence — секция, которую отрезок пересёк раньше цели. */
export type FlightPose = {
  x: number;
  y: number;
  fence: number | null;
  arrived: boolean;
};

/** Пуля долетела. column — колонка, в которую целились. */
export type FlightArrival = FlightPose & {
  column: number;
};

/**
 * Первая кладка на отрезке.
 * Прямой выстрел в дыру её не касается. Наклонный к колонке у ног
 * пересекает соседнюю секцию и должен остановиться на ней.
 */
export function flightSample(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  elapsed: number,
  travelMs: number,
  blocks: readonly FlightBlock[],
): FlightPose {
  const u = Math.min(1, elapsed / Math.max(travelMs, 1));
  const hit = firstBlock(fromX, fromY, toX, toY, blocks);
  if (hit && u >= hit.t) {
    return { x: hit.x, y: hit.y, fence: hit.column, arrived: true };
  }
  return {
    x: fromX + (toX - fromX) * u,
    y: fromY + (toY - fromY) * u,
    fence: null,
    arrived: u >= 1,
  };
}

function firstBlock(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  blocks: readonly FlightBlock[],
): { t: number; x: number; y: number; column: number } | null {
  let best: { t: number; x: number; y: number; column: number } | null = null;
  for (const block of blocks) {
    const t = segmentEnter(x0, y0, x1, y1, block);
    if (t === null || (best && t >= best.t)) continue;
    best = { t, column: block.column, x: x0 + (x1 - x0) * t, y: y0 + (y1 - y0) * t };
  }
  return best;
}

/** Доля пути до входа в прямоугольник. 0 — старт уже внутри. null — мимо. */
function segmentEnter(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  rect: { left: number; right: number; top: number; bottom: number },
): number | null {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const p = [-dx, dx, -dy, dy];
  const q = [x0 - rect.left, rect.right - x0, y0 - rect.top, rect.bottom - y0];
  let t0 = 0;
  let t1 = 1;
  for (let i = 0; i < 4; i += 1) {
    const pi = p[i] ?? 0;
    const qi = q[i] ?? 0;
    if (pi === 0) {
      if (qi < 0) return null;
      continue;
    }
    const t = qi / pi;
    if (pi < 0) {
      if (t > t1) return null;
      if (t > t0) t0 = t;
    } else {
      if (t < t0) return null;
      if (t < t1) t1 = t;
    }
  }
  if (t0 > t1 || t1 < 0 || t0 > 1) return null;
  return Math.max(0, t0);
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
