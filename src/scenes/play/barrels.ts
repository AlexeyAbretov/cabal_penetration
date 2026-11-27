import Phaser from 'phaser';
import { circleHitsRect, crossHitsMask, rectsOverlap, type HitBox } from '../../combat';
import type { Cover } from '../../cover';
import { barrel, grenade, palette } from '../../constants';
import { readNum, readRecord, type BarrelRow } from '../../keep';
import type { BarrelMark } from '../../types/barrel';
import { belowHorizon, fieldScale, fitScale, type FrameLayout } from '../../layout';
import { blit, ensureCanvas } from './blit';
import { disc, hash, Pix } from './pix';

type Keg = {
  rx: number;
  ry: number;
  dx: number;
  horizon: boolean;
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
  mask: Uint8Array | null;
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
 * Сломанная не пропадает: остаётся рваная нижняя половина.
 * Пехоту закрывает плотный пиксель, целый и сломанный. Пустой угол холста дырку не делает.
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
        dx: mark.dx ?? 0,
        horizon: mark.horizon ?? false,
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
        mask: null,
      };
    });
  }

  note(): BarrelRow[] {
    return this.kegs.map((keg) => ({ hp: keg.hp, whole: keg.whole }));
  }

  recall(data: unknown): void {
    if (!Array.isArray(data)) return;
    data.forEach((item, index) => {
      const keg = this.kegs[index];
      const row = readRecord(item);
      if (!keg || !row) return;
      const hp = readNum(row.hp);
      if (hp !== null) keg.hp = Math.min(barrel.hp, Math.max(0, hp));
      if (row.whole === false) {
        keg.whole = false;
        keg.hp = 0;
      }
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

  /** Квадрат креста колет бочку, в чьё дерево попал. Пустой угол холста промах. */
  hit(box: HitBox, amount: number): void {
    const at = { x: (box.left + box.right) / 2, y: (box.top + box.bottom) / 2 };
    for (const keg of this.kegs) {
      if (!keg.whole || !woodInBox(keg, box)) continue;
      this.wound(keg, amount, at.x, at.y);
    }
  }

  /** Плотный пиксель бочки закрывает пехоту за собой. Сбитый верх и углы холста — нет. */
  shields(): Cover[] {
    const out: Cover[] = [];
    for (const keg of this.kegs) {
      if (!keg.mask || keg.w < 1) continue;
      const box = body(keg);
      out.push({ box, sole: box.bottom, opaque: (x, y) => kegOpaque(keg, x, y) });
    }
    return out;
  }

  /** Разрыв снимает бочку, чьё дерево входит в круг. */
  blast(x: number, y: number): void {
    for (const keg of this.kegs) {
      if (!keg.whole || !woodInCircle(keg, x, y, grenade.blastRadius)) continue;
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
      const ground = keg.horizon
        ? field.y + belowHorizon(keg.ry, field)
        : field.y + keg.ry * field.height;
      let y = ground;
      let scale = fieldScale(y, field) * fitScale(field);
      if (keg.horizon) {
        const stand = Math.max(10, Math.round(barrel.height * scale));
        y = ground - stand / 2;
        scale = fieldScale(y, field) * fitScale(field);
        y = ground - Math.max(10, Math.round(barrel.height * scale)) / 2;
      }
      keg.x = field.x + keg.rx * field.width + keg.dx * scale;
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
      keg.mask = null;
      return;
    }
    const sig = `${keg.w}.${keg.h}.${keg.whole ? 0 : 1}`;
    if (sig === keg.sig && keg.mask) {
      keg.image.setPosition(Math.round(keg.x), Math.round(keg.y));
      return;
    }
    keg.sig = sig;
    const art = paintBarrel(keg.w, keg.h, !keg.whole);
    keg.mask = shade(art);
    blit(this.scene, keg.key, art);
    keg.image.setTexture(keg.key);
    keg.image.setDisplaySize(keg.w, keg.h);
    keg.image.setPosition(Math.round(keg.x), Math.round(keg.y));
    keg.image.setVisible(true);
  }
}

function body(keg: Keg): HitBox {
  const x = Math.round(keg.x);
  const y = Math.round(keg.y);
  return {
    left: x - keg.w / 2,
    right: x + keg.w / 2,
    top: y - keg.h / 2,
    bottom: y + keg.h / 2,
  };
}

function kegOpaque(keg: Keg, x: number, y: number): boolean {
  const mask = keg.mask;
  if (!mask || keg.w < 1) return false;
  const face = body(keg);
  const lx = Math.floor(x - face.left);
  const ly = Math.floor(y - face.top);
  if (lx < 0 || ly < 0 || lx >= keg.w || ly >= keg.h) return false;
  return mask[ly * keg.w + lx] === 1;
}

/** Плотный пиксель дерева в пересечении креста и холста бочки. */
function woodInBox(keg: Keg, box: HitBox): boolean {
  const face = body(keg);
  if (!rectsOverlap(box, face)) return false;
  const mask = keg.mask;
  if (!mask) return true;
  return crossHitsMask(box, face, keg.w, keg.h, mask);
}

function woodInCircle(keg: Keg, x: number, y: number, radius: number): boolean {
  const face = body(keg);
  if (!circleHitsRect(x, y, radius, face)) return false;
  const mask = keg.mask;
  if (!mask) return true;
  const r2 = radius * radius;
  for (let ly = 0; ly < keg.h; ly += 1) {
    for (let lx = 0; lx < keg.w; lx += 1) {
      if (mask[ly * keg.w + lx] !== 1) continue;
      const dx = face.left + lx + 0.5 - x;
      const dy = face.top + ly + 0.5 - y;
      if (dx * dx + dy * dy <= r2) return true;
    }
  }
  return false;
}

/** Плотный пиксель и его соседи. Угол холста пехоту не закрывает. */
function shade(pix: Pix): Uint8Array {
  const mask = new Uint8Array(pix.w * pix.h);
  const src = pix.data;
  for (let y = 0; y < pix.h; y += 1) {
    for (let x = 0; x < pix.w; x += 1) {
      let solid = false;
      for (let dy = -1; dy <= 1 && !solid; dy += 1) {
        const yy = y + dy;
        if (yy < 0 || yy >= pix.h) continue;
        const row = yy * pix.w;
        for (let dx = -1; dx <= 1; dx += 1) {
          const xx = x + dx;
          if (xx < 0 || xx >= pix.w) continue;
          if (src[(row + xx) * 4 + 3]! < 128) continue;
          solid = true;
          break;
        }
      }
      if (solid) mask[y * pix.w + x] = 1;
    }
  }
  return mask;
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

/** Целая бочка или её нижняя половина с рваным краем. Холст тот же: низ не прыгает. */
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
      const edge = lipY(x, cy);
      if (broken && y < edge) continue;
      if (broken && y < edge + 2 && hash(x, y) % 4 === 0) continue;
      const stave = Math.floor((x - (cx - rx)) / 3) % 2 === 0;
      let color: number = stave ? palette.wood : palette.woodDark;
      const lowerHoop = Math.abs(dy - ry * 0.15) < 1.2;
      const upperHoop = Math.abs(dy + ry * 0.35) < 1.2;
      if (lowerHoop || (!broken && upperHoop)) color = palette.iron;
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
    const top = lipY(x, cy);
    const n = 1 + (hash(x, 6) % 3);
    for (let k = 1; k <= n; k += 1) pix.px(x, Math.round(top) - k, k === n ? palette.woodLite : palette.wood);
  }
  return pix;
}

/** Верх оставшейся половины. Столбик клёпки то короче, то торчит щепкой. */
function lipY(x: number, cy: number): number {
  const n = hash(Math.round(x), 9);
  let y = cy + ((n % 5) - 2);
  if (n % 5 === 0) y += 2 + (n % 3);
  return y;
}
