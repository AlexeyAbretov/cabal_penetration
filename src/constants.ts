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
} as const;
