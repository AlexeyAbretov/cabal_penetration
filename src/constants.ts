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
