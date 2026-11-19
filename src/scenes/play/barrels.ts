import Phaser from 'phaser';
import { circleHitsRect, rectsOverlap, type HitBox } from '../../combat';
import { barrel, grenade, palette } from '../../constants';
import type { BarrelMark } from '../../types/barrel';
import { fieldScale, fitScale, type FrameLayout } from '../../layout';
import { blit, ensureCanvas } from './blit';
import { disc, hash, Pix } from './pix';

type Keg = {
  rx: number;
  ry: number;
  score: number;
  hp: number;
  flash: number;
  whole: boolean;
  x: number;
  y: number;
  w: number;
  h: number;
  image: Phaser.GameObjects.Image;
  key: string;
  sig: string;
};

type Chip = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  w: number;
  h: number;
  color: number;
  life: number;
  max: number;
  spin: boolean;
};

const woods = [palette.wood, palette.woodLite, palette.woodDark] as const;

/**
 * Бочки на поле. Стоят перед жердями: свой спрайт, не дырка в заборе.
 * Очередь колет, граната снимает сразу. Щепа летит, как у жердей.
 * Сломанная не пропадает: остаётся рваная нижняя треть.
 * Один бонус из списка картинки.
 */
export class Barrels {
  private readonly kegs: Keg[];
  private chips: Chip[] = [];
  private view: FrameLayout | null = null;
  private readonly scene: Phaser.Scene;
  private readonly chipsGfx: Phaser.GameObjects.Graphics;
  private readonly onBreak: (score: number, rx: number, ry: number) => void;

  constructor(
    scene: Phaser.Scene,
    marks: readonly BarrelMark[],
    field: Phaser.GameObjects.Container,
    onBreak: (score: number, rx: number, ry: number) => void,
  ) {
    this.scene = scene;
    this.onBreak = onBreak;
    this.chipsGfx = scene.add.graphics().setDepth(3.2);
    this.kegs = marks.map((mark, index) => {
      const key = `barrel-${index}`;
      const image = scene.add
        .image(0, 0, ensureCanvas(scene, key))
        .setOrigin(0.5, 0.5)
        .setDepth(0.4)
        .setVisible(false);
      field.add(image);
      return {
        rx: mark.x,
        ry: mark.y,
        score: mark.score ?? barrel.score,
        hp: barrel.hp,
        flash: 0,
        whole: true,
        x: 0,
        y: 0,
        w: 0,
        h: 0,
        image,
        key,
        sig: '',
      };
    });
  }

  bind(view: FrameLayout): void {
    this.view = view;
    this.place();
  }

  step(delta: number): void {
    for (const keg of this.kegs) {
      keg.flash = Math.max(0, keg.flash - delta);
      if (keg.flash > 0) keg.image.setTint(palette.ink);
      else keg.image.clearTint();
    }
    this.tickChips(delta);
  }

  /** Квадрат креста колет бочку, в которую попал. */
  hit(box: HitBox, amount: number): void {
    const at = { x: (box.left + box.right) / 2, y: (box.top + box.bottom) / 2 };
    for (const keg of this.kegs) {
      if (!keg.whole || !rectsOverlap(box, body(keg))) continue;
      this.wound(keg, amount, at.x, at.y);
    }
  }

  /** Разрыв снимает бочку, чьё тело входит в круг. */
  blast(x: number, y: number): void {
    for (const keg of this.kegs) {
      if (!keg.whole || !circleHitsRect(x, y, grenade.blastRadius, body(keg))) continue;
      this.wound(keg, keg.hp, x, y);
    }
  }

  draw(): void {
    const gfx = this.chipsGfx;
    gfx.clear();
    for (const chip of this.chips) {
      const k = chip.life / chip.max;
      if (k <= 0) continue;
      const alpha = k > 0.4 ? 1 : k / 0.4;
      const spun = chip.spin && Math.floor((chip.max - chip.life) / 80) % 2 === 1;
      const w = spun ? chip.h : chip.w;
      const h = spun ? chip.w : chip.h;
      const x = Math.round(chip.x);
      const y = Math.round(chip.y);
      gfx.fillStyle(chip.color, alpha);
      gfx.fillRect(x, y, w, h);
      if (w >= 5 && h >= 2) {
        gfx.fillStyle(palette.woodLite, alpha);
        gfx.fillRect(x, y, w, 1);
      }
    }
  }

  private place(): void {
    const view = this.view;
    if (!view) return;
    const field = view.field;
    for (const keg of this.kegs) {
      const y = field.y + keg.ry * field.height;
      const scale = fieldScale(y, field) * fitScale(field);
      keg.x = field.x + keg.rx * field.width;
      keg.y = y;
      keg.w = Math.max(8, Math.round(barrel.width * scale));
      keg.h = Math.max(10, Math.round(barrel.height * scale));
      keg.image.setDepth(0.4 + keg.y / 10000);
      this.paint(keg);
    }
  }

  private wound(keg: Keg, amount: number, x: number, y: number): void {
    if (!keg.whole || amount <= 0) return;
    keg.hp -= amount;
    keg.flash = 80;
    if (keg.hp > 0) {
      this.spawn(x, y, 0.55, 0, 4);
      return;
    }
    keg.whole = false;
    const field = this.view?.field;
    const rx = field ? (keg.x - field.x) / Math.max(1, field.width) : keg.rx;
    const ry = field ? (keg.y - field.y) / Math.max(1, field.height) : keg.ry;
    this.onBreak(keg.score, rx, ry);
    this.spawn(keg.x, keg.y - keg.h * 0.28, 1, 2, 8);
    this.spawn(x, y, 0.85, 1, 4);
    this.paint(keg);
  }

  private tickChips(delta: number): void {
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

  private spawn(x: number, y: number, power: number, planks: number, count: number): void {
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
          woods[Math.floor(Math.random() * woods.length)]!,
          400 + Math.random() * 240,
          true,
        ),
      );
    }
    for (let i = 0; i < planks; i += 1) {
      const dir = Math.random() < 0.5 ? -1 : 1;
      this.chips.push(
        chip(
          x,
          y,
          dir * (40 + Math.random() * 90) * power,
          -(50 + Math.random() * 120) * power,
          6 + Math.floor(Math.random() * 4),
          2,
          palette.wood,
          520 + Math.random() * 200,
          true,
        ),
      );
    }
  }

  private paint(keg: Keg): void {
    if (keg.w < 1 || keg.h < 1) {
      keg.image.setVisible(false);
      keg.sig = '';
      return;
    }
    const sig = `${keg.w}.${keg.h}.${keg.whole ? 0 : 1}`;
    if (sig === keg.sig) {
      keg.image.setPosition(Math.round(keg.x), Math.round(keg.y));
      return;
    }
    keg.sig = sig;
    blit(this.scene, keg.key, paintBarrel(keg.w, keg.h, !keg.whole));
    keg.image.setTexture(keg.key);
    keg.image.setDisplaySize(keg.w, keg.h);
    keg.image.setPosition(Math.round(keg.x), Math.round(keg.y));
    keg.image.setVisible(true);
  }
}

function body(keg: Keg): HitBox {
  return {
    left: keg.x - keg.w / 2,
    right: keg.x + keg.w / 2,
    top: keg.y - keg.h / 2,
    bottom: keg.y + keg.h / 2,
  };
}

function chip(
  x: number,
  y: number,
  vx: number,
  vy: number,
  w: number,
  h: number,
  color: number,
  life: number,
  spin: boolean,
): Chip {
  return { x: x - w / 2, y: y - h / 2, vx, vy, w, h, color, life, max: life, spin };
}

/** Целая бочка или её нижняя треть с рваным краем. Холст тот же: низ не прыгает. */
function paintBarrel(w: number, h: number, broken: boolean): Pix {
  const pix = new Pix(w, h);
  const cx = (w - 1) / 2;
  const cy = (h - 1) / 2;
  const rx = Math.max(2, w / 2 - 1);
  const ry = Math.max(3, h / 2 - 1);
  const rx2 = rx * rx;
  const ry2 = ry * ry;
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y += 1) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x += 1) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      if ((dx * dx) / rx2 + (dy * dy) / ry2 > 1) continue;
      const edge = lipY(x, cy, ry);
      if (broken && y < edge) continue;
      if (broken && y < edge + 2 && hash(x, y) % 4 === 0) continue;
      const stave = Math.floor((x - (cx - rx)) / 3) % 2 === 0;
      let color: number = stave ? palette.wood : palette.woodDark;
      if (!broken && (Math.abs(dy + ry * 0.35) < 1.2 || Math.abs(dy - ry * 0.15) < 1.2)) color = palette.iron;
      if (dx < -rx * 0.6) color = palette.woodLite;
      if (broken && y <= edge + 1) color = hash(x, y) % 2 === 0 ? palette.woodLite : palette.woodDark;
      pix.px(x, y, color);
    }
  }
  if (!broken) {
    disc(pix, cx, cy - ry * 0.72, rx * 0.72, ry * 0.28, palette.woodDark);
    disc(pix, cx, cy - ry * 0.78, rx * 0.4, ry * 0.12, palette.line);
    pix.px(Math.round(cx - rx * 0.2), Math.round(cy - ry * 0.86), palette.ironLite);
    return pix;
  }
  for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x += 1) {
    if (hash(x, 4) % 3 !== 0) continue;
    const top = lipY(x, cy, ry);
    const n = 1 + (hash(x, 6) % 3);
    for (let k = 1; k <= n; k += 1) pix.px(x, Math.round(top) - k, k === n ? palette.woodLite : palette.wood);
  }
  const band = Math.round(cy + ry * 0.55);
  for (let x = Math.floor(cx - rx * 0.8); x <= Math.ceil(cx + rx * 0.8); x += 1) {
    if (hash(x, 2) % 5 === 0) continue;
    const dx = x + 0.5 - cx;
    const dy = band + 0.5 - cy;
    if ((dx * dx) / rx2 + (dy * dy) / ry2 > 1) continue;
    pix.px(x, band, palette.iron);
  }
  return pix;
}

/** Верх оставшейся трети. Столбик клёпки то короче, то торчит щепкой. */
function lipY(x: number, cy: number, ry: number): number {
  const n = hash(Math.round(x), 9);
  let y = cy + ry / 3 + ((n % 5) - 2);
  if (n % 5 === 0) y += 2 + (n % 3);
  return y;
}
