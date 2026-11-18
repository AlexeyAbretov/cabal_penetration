import Phaser from 'phaser';

/**
 * Разрыв гранаты. Десять кадров 96×96, прозрачный фон.
 * Круг на пике вписан в квадрат 72×72 по центру кадра:
 * от центра до края рисунка 36 пикселей. На экране этот край
 * садится на grenade.blastRadius, пустые поля кадра в радиус не входят.
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
} as const;

export function loadExplosion(scene: Phaser.Scene): void {
  if (scene.textures.exists(explosionSheet.key)) return;
  scene.load.spritesheet(explosionSheet.key, explosionSheet.url, {
    frameWidth: explosionSheet.frameWidth,
    frameHeight: explosionSheet.frameHeight,
  });
}
