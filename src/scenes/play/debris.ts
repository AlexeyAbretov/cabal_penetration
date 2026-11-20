import Phaser from 'phaser';
import { palette } from '../../constants';

export type DebrisKind = 'sand' | 'stone' | 'brick' | 'spark';

type DebrisLayer = 'field' | 'wall';

type Chip = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  w: number;
  h: number;
  color: number;
  rim: number;
  life: number;
  max: number;
  spin: boolean;
  layer: DebrisLayer;
};

/** Темнее мешка: жёлтая крошка на жёлтом песке не читается. Светлая точка отделяет зерно. */
const sands = [palette.barkDark, palette.woodDark, palette.line, palette.joint] as const;
const stones = [palette.wall, palette.wallLite, palette.wallBand, palette.pebble, palette.mortar] as const;
const bricks = [palette.brick, palette.brickDark, palette.brickLite, palette.mortar] as const;
const sparks = [palette.muzzle, palette.explosion, palette.aim, palette.enemyLane] as const;

/**
 * Ошметки удара. Летят так же, как щепа жердей и бочек: дуга и падение.
 * Песок — пыль, камень и кирпич — крошка, ржавое железо — искры.
 * Поле рисуется перед мешками и кирпичом, стена — перед листом у ног.
 */
export class Debris {
  private chips: Chip[] = [];
  private readonly fieldGfx: Phaser.GameObjects.Graphics;
  private readonly wallGfx: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene) {
    this.fieldGfx = scene.add.graphics().setDepth(3.2);
    this.wallGfx = scene.add.graphics().setDepth(3.6);
  }

  step(delta: number): void {
    const dt = delta / 1000;
    const next: Chip[] = [];
    for (const chip of this.chips) {
      chip.life -= delta;
      if (chip.life <= 0) continue;
      chip.vy += 920 * dt;
      chip.x += chip.vx * dt;
      chip.y += chip.vy * dt;
      next.push(chip);
    }
    this.chips = next;
  }

  draw(): void {
    this.fieldGfx.clear();
    this.wallGfx.clear();
    for (const chip of this.chips) {
      const k = chip.life / chip.max;
      if (k <= 0) continue;
      const alpha = k > 0.4 ? 1 : k / 0.4;
      const spun = chip.spin && Math.floor((chip.max - chip.life) / 80) % 2 === 1;
      const w = spun ? chip.h : chip.w;
      const h = spun ? chip.w : chip.h;
      const x = Math.round(chip.x);
      const y = Math.round(chip.y);
      const gfx = chip.layer === 'wall' ? this.wallGfx : this.fieldGfx;
      gfx.fillStyle(chip.color, alpha);
      gfx.fillRect(x, y, w, h);
      if (chip.rim) {
        gfx.fillStyle(chip.rim, alpha);
        if (w >= 5 && h >= 2) gfx.fillRect(x, y, w, 1);
        else gfx.fillRect(x, y, 1, 1);
      }
    }
  }

  /** Лёгкий удар или обрушение. heavy сыплет гуще и крупнее. */
  burst(x: number, y: number, kind: DebrisKind, heavy: boolean, layer: DebrisLayer): void {
    const power = heavy ? 1 : 0.55;
    if (kind === 'sand') {
      this.dust(x, y, power, heavy, layer);
      return;
    }
    if (kind === 'spark') {
      this.glint(x, y, power, heavy, layer);
      return;
    }
    this.rubble(x, y, power, heavy, layer, kind);
  }

  private dust(x: number, y: number, power: number, heavy: boolean, layer: DebrisLayer): void {
    const count = heavy ? 14 : 7;
    const spread = heavy ? 16 : 4;
    for (let i = 0; i < count; i += 1) {
      const dir = Math.random() < 0.5 ? -1 : 1;
      const wide = Math.random() > 0.55;
      this.chips.push(
        chip(
          x + (Math.random() - 0.5) * spread,
          y + (Math.random() - 0.5) * 4,
          dir * (30 + Math.random() * 70) * power,
          -(40 + Math.random() * 100) * power,
          wide ? 3 : 2,
          2,
          pick(sands),
          palette.creamLite,
          280 + Math.random() * 180,
          true,
          layer,
        ),
      );
    }
  }

  private glint(x: number, y: number, power: number, heavy: boolean, layer: DebrisLayer): void {
    const count = heavy ? 12 : 6;
    for (let i = 0; i < count; i += 1) {
      const dir = Math.random() < 0.5 ? -1 : 1;
      const dash = Math.random() > 0.45;
      this.chips.push(
        chip(
          x + (Math.random() - 0.5) * 4,
          y + (Math.random() - 0.5) * 4,
          dir * (100 + Math.random() * 180) * power,
          -(120 + Math.random() * 180) * power,
          dash ? 2 : 1,
          1,
          pick(sparks),
          0,
          150 + Math.random() * 130,
          false,
          layer,
        ),
      );
    }
  }

  private rubble(
    x: number,
    y: number,
    power: number,
    heavy: boolean,
    layer: DebrisLayer,
    kind: 'stone' | 'brick',
  ): void {
    const colors = kind === 'brick' ? bricks : stones;
    const body = kind === 'brick' ? palette.brick : palette.wall;
    const rim = kind === 'brick' ? palette.brickLite : palette.wallLite;
    const count = heavy ? 8 : 4;
    const slabs = heavy ? 2 : 0;
    for (let i = 0; i < count; i += 1) {
      const dir = Math.random() < 0.5 ? -1 : 1;
      this.chips.push(
        chip(
          x,
          y,
          dir * (70 + Math.random() * 140) * power,
          -(80 + Math.random() * 170) * power,
          2 + Math.floor(Math.random() * 3),
          1 + Math.floor(Math.random() * 2),
          pick(colors),
          0,
          400 + Math.random() * 240,
          true,
          layer,
        ),
      );
    }
    for (let i = 0; i < slabs; i += 1) {
      const dir = Math.random() < 0.5 ? -1 : 1;
      this.chips.push(
        chip(
          x,
          y,
          dir * (40 + Math.random() * 90) * power,
          -(50 + Math.random() * 120) * power,
          6 + Math.floor(Math.random() * 4),
          2,
          body,
          rim,
          520 + Math.random() * 200,
          true,
          layer,
        ),
      );
    }
  }
}

/** Точка удара на кладке. Мимо лица прижимается к краю. */
export function onFace(
  face: { left: number; right: number; top: number; bottom: number } | null,
  x: number,
  y: number,
): { x: number; y: number } {
  if (!face) return { x, y };
  return {
    x: Math.min(face.right, Math.max(face.left, x)),
    y: Math.min(face.bottom, Math.max(face.top, y)),
  };
}

function pick(colors: readonly number[]): number {
  return colors[Math.floor(Math.random() * colors.length)]!;
}

function chip(
  x: number,
  y: number,
  vx: number,
  vy: number,
  w: number,
  h: number,
  color: number,
  rim: number,
  life: number,
  spin: boolean,
  layer: DebrisLayer,
): Chip {
  return { x: x - w / 2, y: y - h / 2, vx, vy, w, h, color, rim, life, max: life, spin, layer };
}
