import Phaser from 'phaser';
import { rollMove, soldierBox } from './constants';

/**
 * Контракт листа. Кадр 32×48, хитбокс боя остаётся 32×44:
 * четыре верхних пикселя торчат над прямоугольником.
 * Ряд — это анимация, пустые клетки ряда прозрачные.
 * Файл кладётся в public/assets/soldier.png и грузится как assets/soldier.png.
 * Пока файла нет или размер другой, на дорожке остаётся прямоугольник.
 */
export const soldierSheet = {
  key: 'soldier',
  url: 'assets/soldier.png',
  frameWidth: soldierBox.width,
  frameHeight: 48,
  columns: 8,
  rows: 8,
} as const;

/** Длина ролика равна окну переката: кувырок на листе кончается вместе с неуязвимостью. */
function rollRate(frames: number, durationMs: number): number {
  return (frames * 1000) / durationMs;
}

/**
 * Слева направо с нулевой колонки. Влево игра зеркалит шаг, бег и перекат.
 * repeat -1 крутится, 0 играется один раз с начала кувырка.
 */
export const soldierClips = {
  stand: { anim: 'stand', row: 0, frames: 4, frameRate: 5, repeat: -1 },
  kneel: { anim: 'kneel', row: 1, frames: 4, frameRate: 4, repeat: -1 },
  walk: { anim: 'walk', row: 2, frames: 8, frameRate: 12, repeat: -1 },
  run: { anim: 'run', row: 3, frames: 8, frameRate: 18, repeat: -1 },
  rollShort: {
    anim: 'roll-short',
    row: 4,
    frames: 4,
    frameRate: rollRate(4, rollMove.short.durationMs),
    repeat: 0,
  },
  rollLong: {
    anim: 'roll-long',
    row: 5,
    frames: 8,
    frameRate: rollRate(8, rollMove.long.durationMs),
    repeat: 0,
  },
} as const;

/** Веер не крутится: клетка 0–2 низко, 3–5 выше, слева направо. Ряд 6 стоя, ряд 7 с колена. */
export const aimRows = { stand: 6, kneel: 7 } as const;

/** Центр вспышки у дула, пиксель кадра 32×48. Порядок тот же, что у колонок веера. */
export const aimMuzzle = {
  stand: [
    { x: 2, y: 16 },
    { x: 19, y: 12 },
    { x: 31, y: 16 },
    { x: 4, y: 7 },
    { x: 18, y: 4 },
    { x: 30, y: 7 },
  ],
  kneel: [
    { x: 2, y: 24 },
    { x: 19, y: 20 },
    { x: 31, y: 24 },
    { x: 4, y: 15 },
    { x: 18, y: 12 },
    { x: 30, y: 15 },
  ],
} as const;

export function aimFrame(kneeling: boolean, column: number): number {
  const row = kneeling ? aimRows.kneel : aimRows.stand;
  return row * soldierSheet.columns + column;
}

export type SoldierClipName = keyof typeof soldierClips;

export function soldierAnimKey(name: SoldierClipName): string {
  return `${soldierSheet.key}-${soldierClips[name].anim}`;
}

export function registerSoldierAnims(scene: Phaser.Scene): void {
  for (const name of Object.keys(soldierClips) as SoldierClipName[]) {
    const clip = soldierClips[name];
    const key = soldierAnimKey(name);
    if (scene.anims.exists(key)) continue;
    const start = clip.row * soldierSheet.columns;
    scene.anims.create({
      key,
      frames: scene.anims.generateFrameNumbers(soldierSheet.key, {
        start,
        end: start + clip.frames - 1,
      }),
      frameRate: clip.frameRate,
      repeat: clip.repeat,
    });
  }
}

/** Лист целиком: 8×8 кадров. Обрезанный или другой размер подмену не включает. */
export function soldierSheetReady(scene: Phaser.Scene): boolean {
  if (!scene.textures.exists(soldierSheet.key)) return false;
  const source = scene.textures.get(soldierSheet.key).getSourceImage();
  return (
    source.width === soldierSheet.frameWidth * soldierSheet.columns &&
    source.height === soldierSheet.frameHeight * soldierSheet.rows
  );
}
