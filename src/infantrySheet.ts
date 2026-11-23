/**
 * Лист пехоты. Кадр 44×48, семь клеток в ряд.
 * 0–3 бег вправо. 4 стойка лицом. 5 выстрел, вспышка у дула. 6 труп.
 * Собирает tools/draw_infantry.py из public/assets/enemies/infantry
 * в public/assets/infantry.png. Попадание — непрозрачные пиксели клетки,
 * умноженные на ту же глубину. Пустая кромка кадра удар не берёт.
 * Рисунок встаёт на низ прежней опоры 32×36 и выше неё не обрезается.
 * Лужа под трупом — фигура игры, не клетка листа.
 */
export const infantrySheet = {
  key: 'infantry',
  url: 'assets/infantry.png',
  frameWidth: 44,
  frameHeight: 48,
  frames: 7,
  run: 4,
  aim: 4,
  fire: 5,
  dead: 6,
} as const;
