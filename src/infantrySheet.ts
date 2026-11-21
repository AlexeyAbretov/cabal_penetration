/**
 * Лист пехоты. Кадр 32×36, шесть клеток в ряд.
 * 0–3 бег вправо, три четверти. 4 стойка, ствол вниз в игрока. 5 выстрел, вспышка у дула.
 * Рисует tools/draw_infantry.py в public/assets/infantry.png.
 */
export const infantrySheet = {
  key: 'infantry',
  url: 'assets/infantry.png',
  frameWidth: 32,
  frameHeight: 36,
  frames: 6,
  run: 4,
  aim: 4,
  fire: 5,
} as const;
