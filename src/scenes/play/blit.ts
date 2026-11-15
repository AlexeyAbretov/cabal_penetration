import Phaser from 'phaser';
import type { Pix } from './pix';

export function ensureCanvas(scene: Phaser.Scene, key: string): string {
  if (!scene.textures.exists(key)) {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    scene.textures.addCanvas(key, canvas)?.setFilter(Phaser.Textures.FilterMode.NEAREST);
  }
  return key;
}

/** Кладёт буфер в канву. Кадр текстуры после смены размера обновляет setSize. */
export function blit(scene: Phaser.Scene, key: string, pix: Pix): void {
  if (pix.w < 1 || pix.h < 1) return;
  const tex = scene.textures.get(key) as Phaser.Textures.CanvasTexture;
  if (tex.width !== pix.w || tex.height !== pix.h) tex.setSize(pix.w, pix.h);
  tex.context.imageSmoothingEnabled = false;
  const pixels = new Uint8ClampedArray(pix.data);
  tex.putData(new ImageData(pixels, pix.w, pix.h), 0, 0);
  tex.refresh();
  tex.setFilter(Phaser.Textures.FilterMode.NEAREST);
}
