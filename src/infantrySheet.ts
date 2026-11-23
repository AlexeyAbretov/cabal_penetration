/**
 * Два листа пехоты. В каждом кадре семь клеток в ряд.
 * 0–3 бег вправо. 4 стойка лицом. 5 выстрел, вспышка у дула. 6 труп.
 * Собирает tools/draw_infantry.py.
 * Новый — public/assets/enemies/infantry, кадр 32×30, файл infantry.png.
 * Прежний — public/assets/enemies/infantry2, кадр 30×33, файл infantry2.png.
 * Клетка рисуется своими пикселями, без ужатия в игре.
 * Попадание — непрозрачные пиксели этой клетки.
 * Пустая кромка кадра удар не берёт. Низ тела на нижней строке.
 * Лужа под трупом — фигура игры, не клетка листа.
 */
export const infantrySheet = {
  key: 'infantry',
  url: 'assets/infantry.png',
  frameWidth: 32,
  frameHeight: 30,
  frames: 7,
  run: 4,
  aim: 4,
  fire: 5,
  dead: 6,
} as const;

export const infantryOldSheet = {
  key: 'infantry2',
  url: 'assets/infantry2.png',
  frameWidth: 30,
  frameHeight: 33,
  frames: 7,
  run: 4,
  aim: 4,
  fire: 5,
  dead: 6,
} as const;

export const infantryLooks = [infantrySheet, infantryOldSheet] as const;

export type InfantryLook = (typeof infantryLooks)[number];
