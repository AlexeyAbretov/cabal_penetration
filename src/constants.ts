/** Минимальная картина: 256×224 оригинала, удвоенные. Окно шире или выше — кадр дорастает. */
export const frame = {
  width: 512,
  height: 448,
} as const;

/**
 * Палитра заглушек. Фигуры Phaser и будущие листы берут цвета отсюда.
 * Значения — 0xRRGGBB.
 */
export const palette = {
  black: 0x000000,
  sky: 0x7ea0c4,
  field: 0x6e7d45,
  track: 0x8a7352,
  hud: 0x1c1814,
  ink: 0xe7dcc4,
  soldier: 0x243044,
  aim: 0xf2e27a,
  tracer: 0xfff1c2,
  muzzle: 0xfff6d0,
  soldierRoll: 0x3d5c82,
  wall: 0xa89880,
  wallBand: 0x6f6556,
  wallHurt: 0xd06a32,
  wallCrit: 0x8e3428,
  wallGone: 0x2c261f,
  enemyBullet: 0xff3b2e,
  enemyLane: 0xff9a2e,
  grenade: 0x2f6b3a,
  grenadeArc: 0xd5e29a,
  explosion: 0xf0c14a,
  heart: 0xd24b4b,
  notch: 0xe7dcc4,
  enemy: 0x2e8f3c,
  enemyShade: 0x143d1e,
  house: 0xd8c3a2,
  houseRoof: 0x8d4632,
  barTrack: 0x3a332c,
} as const;

/**
 * Доли высоты кадра. Потолок не даёт дорожке и рамке съесть высокий экран:
 * лишняя высота достаётся полю.
 */
export const bands = {
  sky: { ratio: 0.18, min: 48, max: 140 },
  track: { ratio: 0.16, min: 64, max: 120 },
  hud: { ratio: 0.1, min: 40, max: 72 },
  fieldMin: 80,
} as const;

/** Хитбокс заглушки. Будущий лист солдата встаёт в тот же прямоугольник. */
export const soldierBox = {
  width: 32,
  height: 44,
} as const;

/**
 * Шаг и бег, пиксели в секунду на картине шириной frame.width.
 * На широком кадре скорость умножается на ширину / frame.width,
 * поэтому пересечение дорожки занимает то же время.
 */
export const motion = {
  walk: 240,
  run: 460,
} as const;

/** Интервал очереди, пока левая кнопка зажата. */
export const fireIntervalMs = 70;

/** Сколько летит один трассер от ствола до точки. */
export const tracerTravelMs = 140;

/** Длина видимого штриха. Короче промежутка между выстрелами, чтобы очередь не сливалась в луч. */
export const tracerLength = 18;

/** Вспышка у ствола на один выстрел. */
export const muzzleFlashMs = 36;

/** Прицел: плечо от точки выстрела, зазор в центре, толщина. */
export const aimMark = {
  arm: 12,
  gap: 3,
  thickness: 2,
} as const;

/** Доля роста стойки. Колено — поза, колонку попадания не меняет. */
export const kneelScale = 0.62;

/**
 * Два кувырка. Длина — в колонках текущей дорожки.
 * Окно неуязвимости равно длительности: короткий успевает сменить секцию,
 * длинный перекрывает очередь таймера, если упереться в край и стоять в той же колонке.
 */
export const rollMove = {
  short: { columns: 1.05, durationMs: 280 },
  long: { columns: 2.7, durationMs: 820 },
} as const;

/** Высота лица стены в поле. Ниже этой полосы своя очередь стену не берёт. */
export const wall = {
  hits: 8,
  stripes: 4,
  intoField: 56,
  seam: 4,
} as const;

/** Старт как у FRAG-57: десять гранат, число у ног. */
export const grenade = {
  stock: 10,
  flightMs: 800,
  arcLift: 96,
  body: 8,
  /** Попадание по телу гранаты, если прицел на ней. */
  aimRadius: 22,
  /** Попадание пулей по дуге, когда граната уже оторвалась от прямой на точку. */
  hitRadius: 14,
  armT: 0.2,
  lateT: 0.8,
  explodeMs: 280,
  /** Разрыв по земле. Пачка у точки выхода входит, вся волна — нет. */
  blastRadius: 56,
} as const;

/**
 * Очередь зелёного. Замах запирается на колонку солдата.
 * Первый удар: lead + travel. Хвост: ещё (burst - 1) * gap.
 * Длинный перекат перекрывает этот хвост, если остаться в той же колонке.
 */
export const volley = {
  leadMs: 200,
  travelMs: 180,
  burst: 4,
  gapMs: 120,
  recoverMs: 1100,
  thickness: 6,
  length: 14,
} as const;

/**
 * Зелёный. Хитбокс заглушки — тот же прямоугольник, куда встанет лист.
 * Масштаб берётся из глубины точки на поле.
 */
export const green = {
  hp: 2,
  width: 30,
  height: 40,
  /** Выбег к игроку, доля высоты поля. */
  run: 0.12,
  /** Веер пачки, доля ширины поля на шаг от середины. */
  spread: 0.07,
  runMs: 560,
  /** Стоит и ещё не целится. Вся пачка успевает выйти, пока первый не открыл огонь. */
  holdMs: 880,
  /** Пауза между зелёными одной точки. */
  gapMs: 300,
  /** Маркер точки за столько мс до первого из пачки. */
  warnMs: 1100,
  score: 210,
} as const;

/** Чем выше на поле, тем мельче фигура. Низ поля — полный хитбокс. */
export const depth = {
  far: 0.62,
  near: 1,
} as const;

/** Полоска ENEMY в рамке. Один сегмент — одно убийство волны. */
export const enemyBar = {
  width: 156,
  height: 12,
  gap: 3,
} as const;

export const hud = {
  lives: 5,
  scoreDigits: 6,
  hurtMs: 1000,
  blinkMs: 80,
} as const;

export function cssColor(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}
