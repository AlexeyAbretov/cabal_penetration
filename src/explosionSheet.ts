import Phaser from 'phaser';
import { grenadeBlast } from './constants';

/**
 * Старый разрыв: десять кадров 96×96, прозрачный фон.
 * Круг на пике вписан в квадрат 72×72 по центру кадра,
 * от центра до края рисунка 36 пикселей. Пустые поля кадра в радиус не входят.
 * Два пустых кадра в конце ролика не кладём.
 */
export const explosionSheet = {
  key: 'explosion',
  url: 'assets/explosion.png',
  frameWidth: 96,
  frameHeight: 96,
  frames: 10,
  frameMs: 70,
  inkRadius: 36,
  originX: 0.5,
  originY: 0.5,
  scale: 1,
} as const;

/**
 * Вспышка с земли. 32 кадра 224×216, сетка 8×4, прозрачный фон.
 * Точка падения — центр ударного кольца (112, 172), не центр кадра: дым уходит вверх.
 * inkRadius — половина ширины этого кольца. На экране край садится
 * на тот же радиус, что у старого круга.
 */
export const groundBlastSheet = {
  key: 'explosion-ground',
  url: 'assets/ground-blast.png',
  frameWidth: 224,
  frameHeight: 216,
  frames: 32,
  frameMs: 25,
  inkRadius: 82,
  originX: 112 / 224,
  originY: 172 / 216,
  scale: explosionSheet.inkRadius / 82,
} as const;

export type BlastSheet = typeof explosionSheet | typeof groundBlastSheet;

/** Лист, который играет разрыв. Какой — решает grenadeBlast. */
export function blastSheet(): BlastSheet {
  return grenadeBlast === 'ground' ? groundBlastSheet : explosionSheet;
}

export function loadExplosion(scene: Phaser.Scene): void {
  for (const sheet of [explosionSheet, groundBlastSheet]) {
    if (scene.textures.exists(sheet.key)) continue;
    scene.load.spritesheet(sheet.key, sheet.url, {
      frameWidth: sheet.frameWidth,
      frameHeight: sheet.frameHeight,
    });
  }
}
