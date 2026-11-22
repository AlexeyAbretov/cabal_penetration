import Phaser from 'phaser';
import { fence, sandbag, shortFence } from './constants';
import type { FenceKind } from './types/fence';

/**
 * Секция заграждения. Целый блок и ролик разрушения лежат отдельно:
 * у камня кадры в animate, у ржавчины в animation.
 * Кадр 96×48, прозрачный фон. Ролик играется один раз.
 * После него на той же ширине остаётся куча: два рисунка, соседние секции чередуют их.
 */
/**
 * Пути буквальные: сборка одного HTML ищет строку в кавычках и подменяет её на data:.
 * Длина frames — fence.frames, длина ruins — ruinVariants.
 */
const sheets = {
  stone: {
    idle: 'assets/fence/stone/fence-stone.png',
    frames: [
      'assets/fence/stone/animate/frame_000.png',
      'assets/fence/stone/animate/frame_001.png',
      'assets/fence/stone/animate/frame_002.png',
      'assets/fence/stone/animate/frame_003.png',
      'assets/fence/stone/animate/frame_004.png',
      'assets/fence/stone/animate/frame_005.png',
      'assets/fence/stone/animate/frame_006.png',
      'assets/fence/stone/animate/frame_007.png',
      'assets/fence/stone/animate/frame_008.png',
    ],
    ruins: ['assets/fence/stone/ruin_000.png', 'assets/fence/stone/ruin_001.png'],
  },
  rust: {
    idle: 'assets/fence/rust/fence-rust.png',
    frames: [
      'assets/fence/rust/animation/frame_000.png',
      'assets/fence/rust/animation/frame_001.png',
      'assets/fence/rust/animation/frame_002.png',
      'assets/fence/rust/animation/frame_003.png',
      'assets/fence/rust/animation/frame_004.png',
      'assets/fence/rust/animation/frame_005.png',
      'assets/fence/rust/animation/frame_006.png',
      'assets/fence/rust/animation/frame_007.png',
      'assets/fence/rust/animation/frame_008.png',
    ],
    ruins: ['assets/fence/rust/ruin_000.png', 'assets/fence/rust/ruin_001.png'],
  },
} as const;

/** Две раскладки кучи, чтобы длинный забор не повторял один штамп. */
export const ruinVariants = 2;

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

export function fenceRuinKey(kind: FenceKind, variant: number): string {
  return `fence-${kind}-ruin-${variant}`;
}

/** Грузит виды, которые стоят на этой картинке. Повторный заход файлы не качает. */
export function loadFenceSheets(scene: Phaser.Scene, kinds: readonly FenceKind[]): void {
  for (const kind of kinds) {
    const sheet = sheets[kind];
    const idle = fenceIdleKey(kind);
    if (!scene.textures.exists(idle)) scene.load.image(idle, sheet.idle);
    for (let index = 0; index < fence.frames; index += 1) {
      const key = fenceFrameKey(kind, index);
      if (!scene.textures.exists(key)) scene.load.image(key, sheet.frames[index]);
    }
    for (let index = 0; index < ruinVariants; index += 1) {
      const key = fenceRuinKey(kind, index);
      if (!scene.textures.exists(key)) scene.load.image(key, sheet.ruins[index]);
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
  frames: [
    'assets/fence/short/animation/frame_000.png',
    'assets/fence/short/animation/frame_001.png',
    'assets/fence/short/animation/frame_002.png',
    'assets/fence/short/animation/frame_003.png',
    'assets/fence/short/animation/frame_004.png',
    'assets/fence/short/animation/frame_005.png',
    'assets/fence/short/animation/frame_006.png',
    'assets/fence/short/animation/frame_007.png',
    'assets/fence/short/animation/frame_008.png',
  ],
  ruins: ['assets/fence/short/ruin_000.png', 'assets/fence/short/ruin_001.png'],
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

export function shortFenceRuinKey(variant: number): string {
  return `fence-short-ruin-${variant}`;
}

export function loadShortFence(scene: Phaser.Scene): void {
  const idle = shortFenceIdleKey();
  if (!scene.textures.exists(idle)) scene.load.image(idle, shortSheet.idle);
  for (let index = 0; index < shortFence.frames; index += 1) {
    const key = shortFenceFrameKey(index);
    if (!scene.textures.exists(key)) scene.load.image(key, shortSheet.frames[index]);
  }
  for (let index = 0; index < ruinVariants; index += 1) {
    const key = shortFenceRuinKey(index);
    if (!scene.textures.exists(key)) scene.load.image(key, shortSheet.ruins[index]);
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

/** Мешки. Кадр 96×32, ролик в animation. На переднюю стену не ставится. */
const sandbagSheet = {
  idle: 'assets/fence/sandbag/fence-sandbag.png',
  frames: [
    'assets/fence/sandbag/animation/frame_000.png',
    'assets/fence/sandbag/animation/frame_001.png',
    'assets/fence/sandbag/animation/frame_002.png',
    'assets/fence/sandbag/animation/frame_003.png',
    'assets/fence/sandbag/animation/frame_004.png',
    'assets/fence/sandbag/animation/frame_005.png',
    'assets/fence/sandbag/animation/frame_006.png',
    'assets/fence/sandbag/animation/frame_007.png',
    'assets/fence/sandbag/animation/frame_008.png',
  ],
  ruins: ['assets/fence/sandbag/ruin_000.png', 'assets/fence/sandbag/ruin_001.png'],
} as const;

export function sandbagIdleKey(): string {
  return 'fence-sandbag';
}

export function sandbagFrameKey(index: number): string {
  return `fence-sandbag-${index}`;
}

export function sandbagBreakKey(): string {
  return 'fence-sandbag-break';
}

export function sandbagRuinKey(variant: number): string {
  return `fence-sandbag-ruin-${variant}`;
}

export function loadSandbag(scene: Phaser.Scene): void {
  const idle = sandbagIdleKey();
  if (!scene.textures.exists(idle)) scene.load.image(idle, sandbagSheet.idle);
  for (let index = 0; index < sandbag.frames; index += 1) {
    const key = sandbagFrameKey(index);
    if (!scene.textures.exists(key)) scene.load.image(key, sandbagSheet.frames[index]);
  }
  for (let index = 0; index < ruinVariants; index += 1) {
    const key = sandbagRuinKey(index);
    if (!scene.textures.exists(key)) scene.load.image(key, sandbagSheet.ruins[index]);
  }
}

export function registerSandbagAnim(scene: Phaser.Scene): void {
  const key = sandbagBreakKey();
  if (scene.anims.exists(key)) return;
  scene.anims.create({
    key,
    frames: Array.from({ length: sandbag.frames }, (_, index) => ({ key: sandbagFrameKey(index) })),
    frameRate: sandbag.frameRate,
    repeat: 0,
  });
}
