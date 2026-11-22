/**
 * Лист пехоты. Кадр 44×48, шесть клеток в ряд.
 * 0–3 бег вправо. 4 стойка лицом. 5 выстрел, вспышка у дула.
 * Собирает tools/draw_infantry.py из public/assets/enemies/infantry
 * в public/assets/infantry.png. Хитбокс боя остаётся 32×36:
 * рисунок встаёт на его низ и держит пропорцию кадра.
 */
export const infantrySheet = {
  key: 'infantry',
  url: 'assets/infantry.png',
  frameWidth: 44,
  frameHeight: 48,
  frames: 6,
  run: 4,
  aim: 4,
  fire: 5,
} as const;
