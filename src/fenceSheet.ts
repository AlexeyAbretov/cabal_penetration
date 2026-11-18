import Phaser from 'phaser';
import { fence, shortFence } from './constants';
import type { FenceKind } from './data/wave';

/**
 * Секция заграждения. Целый блок и ролик разрушения лежат отдельно:
 * у камня кадры в animate, у ржавчины в animation.
 * Кадр 96×48, прозрачный фон. Ролик играется один раз и кончается вместе с секцией.
 */
const sheets = {
  stone: {
    idle: 'assets/fence/stone/fence-stone.png',
    frame: (index: number) => `assets/fence/stone/animate/frame_${pad(index)}.png`,
  },
  rust: {
    idle: 'assets/fence/rust/fence-rust.png',
    frame: (index: number) => `assets/fence/rust/animation/frame_${pad(index)}.png`,
  },
} as const;

function pad(index: number): string {
  return index.toString().padStart(3, '0');
}

/**
 * Непрозрачная кладка внутри кадра 96×48.
 * Поля кадра в стык не входят: секция на экране от этого не растёт.
 */
const ink = {
  stone: { x: 22, y: 12, w: 53, h: 26 },
  rust: { x: 14, y: 11, w: 68, h: 34 },
} as const;

export function fenceInk(kind: FenceKind): { x: number; y: number; w: number; h: number } {
  return ink[kind];
}

export function fenceIdleKey(kind: FenceKind): string {
  return `fence-${kind}`;
}

export function fenceFrameKey(kind: FenceKind, index: number): string {
  return `fence-${kind}-${index}`;
}

export function fenceBreakKey(kind: FenceKind): string {
  return `fence-${kind}-break`;
}

/** Грузит виды, которые стоят на этой картинке. Повторный заход файлы не качает. */
export function loadFenceSheets(scene: Phaser.Scene, kinds: readonly FenceKind[]): void {
  for (const kind of kinds) {
    const sheet = sheets[kind];
    const idle = fenceIdleKey(kind);
    if (!scene.textures.exists(idle)) scene.load.image(idle, sheet.idle);
    for (let index = 0; index < fence.frames; index += 1) {
      const key = fenceFrameKey(kind, index);
      if (!scene.textures.exists(key)) scene.load.image(key, sheet.frame(index));
    }
  }
}

export function registerFenceAnims(scene: Phaser.Scene, kinds: readonly FenceKind[]): void {
  for (const kind of kinds) {
    const key = fenceBreakKey(kind);
    if (scene.anims.exists(key)) continue;
    scene.anims.create({
      key,
      frames: Array.from({ length: fence.frames }, (_, index) => ({ key: fenceFrameKey(kind, index) })),
      frameRate: fence.frameRate,
      repeat: 0,
    });
  }
}

/** Короткий кирпич. Кадр 96×32, ролик в animation. На переднюю стену не ставится. */
const shortSheet = {
  idle: 'assets/fence/short/fence-short.png',
  frame: (index: number) => `assets/fence/short/animation/frame_${pad(index)}.png`,
} as const;

export function shortFenceIdleKey(): string {
  return 'fence-short';
}

export function shortFenceFrameKey(index: number): string {
  return `fence-short-${index}`;
}

export function shortFenceBreakKey(): string {
  return 'fence-short-break';
}

export function loadShortFence(scene: Phaser.Scene): void {
  const idle = shortFenceIdleKey();
  if (!scene.textures.exists(idle)) scene.load.image(idle, shortSheet.idle);
  for (let index = 0; index < shortFence.frames; index += 1) {
    const key = shortFenceFrameKey(index);
    if (!scene.textures.exists(key)) scene.load.image(key, shortSheet.frame(index));
  }
}

export function registerShortFenceAnim(scene: Phaser.Scene): void {
  const key = shortFenceBreakKey();
  if (scene.anims.exists(key)) return;
  scene.anims.create({
    key,
    frames: Array.from({ length: shortFence.frames }, (_, index) => ({ key: shortFenceFrameKey(index) })),
    frameRate: shortFence.frameRate,
    repeat: 0,
  });
}
