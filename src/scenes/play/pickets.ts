import Phaser from 'phaser';
import { circleHitsRect, rectsOverlap, type HitBox } from '../../combat';
import type { Cover } from '../../cover';
import { grenade, palette, picket } from '../../constants';
import type { PicketMark } from '../../types/picket';
import { picketBays, picketFrame, picketGap, picketSlat } from '../../types/picket';
import type { FrameLayout } from '../../layout';
import { blit, ensureCanvas } from './blit';
import { hash, Pix } from './pix';

type Bay = {
  hp: number;
  alive: boolean;
  flash: number;
  start: number;
  end: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
};

type Run = {
  mark: PicketMark;
  score: number;
  ready: boolean;
  cuts: number[];
  bays: Bay[];
  x0: number;
  feet: number;
  height: number;
  span: number;
  fieldX: number;
  fieldY: number;
  ox: number;
  oy: number;
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
 * Штакетник на поле. Стену у ног не закрывает.
 * Толстый столб начинает секцию. Очередь колет, граната снимает секцию сразу.
 * Сломанная не пропадает: штакетики и жерди остаются рваными. Щепки как у жердей.
 * Один бонус из списка картинки на секцию.
 */
export class Pickets {
  private readonly runs: Run[];
  private chips: Chip[] = [];
  private view: FrameLayout | null = null;
  private readonly scene: Phaser.Scene;
  private readonly chipsGfx: Phaser.GameObjects.Graphics;
  private readonly onBreak: (score: number, rx: number, ry: number) => void;

  constructor(
    scene: Phaser.Scene,
    marks: readonly PicketMark[],
    field: Phaser.GameObjects.Container,
    onBreak: (score: number, rx: number, ry: number) => void,
  ) {
    this.scene = scene;
    this.onBreak = onBreak;
    this.chipsGfx = scene.add.graphics().setDepth(3.2);
    this.runs = marks.map((mark, index) => {
      const key = `picket-${index}`;
      const image = scene.add.image(0, 0, ensureCanvas(scene, key)).setOrigin(0, 0).setDepth(0.25).setVisible(false);
      field.add(image);
      return {
        mark,
        score: mark.score ?? picket.score,
        ready: false,
        cuts: [],
        bays: [],
        x0: 0,
        feet: 0,
        height: 0,
        span: 0,
        fieldX: 0,
        fieldY: 0,
        ox: 0,
        oy: 0,
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
    for (const run of this.runs) {
      let hot = false;
      for (const bay of run.bays) {
        bay.flash = Math.max(0, bay.flash - delta);
        if (bay.flash > 0) hot = true;
      }
      if (hot) run.image.setTint(palette.ink);
      else run.image.clearTint();
    }
    this.tickChips(delta);
  }

  /** Квадрат креста колет секцию, в которую попал. */
  hit(box: HitBox, amount: number): void {
    const x = (box.left + box.right) / 2;
    const y = (box.top + box.bottom) / 2;
    for (const run of this.runs) {
      for (const bay of run.bays) {
        if (!bay.alive || !rectsOverlap(box, bay)) continue;
        this.wound(run, bay, amount, x, y);
      }
    }
  }

  /** Целая секция штакетника закрывает пехоту за досками. */
  shields(): Cover[] {
    const out: Cover[] = [];
    for (const run of this.runs) {
      for (const bay of run.bays) {
        if (!bay.alive || bay.right <= bay.left) continue;
        const box = { left: bay.left, right: bay.right, top: bay.top, bottom: bay.bottom };
        out.push({ box, sole: box.bottom });
      }
    }
    return out;
  }

  /** Разрыв снимает каждую секцию, чьи доски входят в круг. */
  blast(x: number, y: number): void {
    for (const run of this.runs) {
      for (const bay of run.bays) {
        if (!bay.alive || !circleHitsRect(x, y, grenade.blastRadius, bay)) continue;
        this.wound(run, bay, bay.hp, x, y);
      }
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
    for (const run of this.runs) this.layout(run, field);
  }

  /**
   * Число секций фиксируется на первом кадре: мешок бонусов уже собран.
   * Дальше окно только растягивает те же пролёты.
   */
  private layout(run: Run, field: FrameLayout['field']): void {
    const frame = picketFrame(run.mark, field);
    run.x0 = frame.x0;
    run.feet = frame.feet;
    run.height = frame.height;
    run.span = frame.span;
    run.fieldX = field.x;
    run.fieldY = field.y;
    if (!run.ready) {
      const boxes = picketBays(frame.span, frame.height);
      const span = Math.max(1, frame.span);
      run.cuts = [...boxes.map((box) => box.start / span), 1];
      run.bays = boxes.map((box) => ({
        hp: picket.hp,
        alive: true,
        flash: 0,
        start: box.start,
        end: box.end,
        left: 0,
        right: 0,
        top: 0,
        bottom: 0,
      }));
      run.ready = true;
    } else {
      for (let i = 0; i < run.bays.length; i += 1) {
        const bay = run.bays[i]!;
        const start = Math.round((run.cuts[i] ?? 0) * run.span);
        const end = Math.round((run.cuts[i + 1] ?? 1) * run.span);
        bay.start = start;
        bay.end = Math.max(start + 1, end);
      }
    }
    const slat = picketSlat(run.height);
    const last = run.bays.length - 1;
    for (let i = 0; i < run.bays.length; i += 1) {
      const bay = run.bays[i]!;
      bay.left = run.x0 + bay.start - 1;
      bay.right = run.x0 + bay.end + (i === last ? slat + 1 : 0);
      bay.top = run.feet - run.height - 6;
      bay.bottom = run.feet + 2;
    }
    this.paint(run);
  }

  private wound(run: Run, bay: Bay, amount: number, x: number, y: number): void {
    if (!bay.alive || amount <= 0) return;
    bay.hp -= amount;
    bay.flash = 80;
    if (bay.hp > 0) {
      this.spawn(x, y, 0.55, 0, 4);
      return;
    }
    bay.alive = false;
    const field = this.view?.field;
    const sx = (bay.left + bay.right) / 2;
    const sy = (bay.top + bay.bottom) / 2;
    const rx = field ? (sx - field.x) / Math.max(1, field.width) : 0.5;
    const ry = field ? (sy - field.y) / Math.max(1, field.height) : 0.5;
    this.onBreak(run.score, rx, ry);
    this.shatter(run, bay);
    this.paint(run);
  }

  /** Щепки с каждого штакетика секции и с обеих жердей. */
  private shatter(run: Run, bay: Bay): void {
    const gap = picketGap(run.height);
    const x0 = run.x0 + bay.start;
    const x1 = run.x0 + bay.end;
    let slats = 0;
    for (let x = x0; x < x1; x += gap) {
      slats += 1;
      this.spawn(x, run.feet - run.height * 0.62, 0.9, 0, 2);
    }
    const mid = (x0 + x1) / 2;
    this.spawn(mid, run.feet - run.height * 0.68, 1, 1, 2);
    this.spawn(mid, run.feet - run.height * 0.36, 1, 1, 1);
    if (slats === 0) this.spawn(mid, run.feet - run.height * 0.5, 1, 2, 4);
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
      const along = (Math.random() - 0.5) * 140 * power;
      this.chips.push(
        chip(
          x,
          y,
          dir * (90 + Math.random() * 160) * power + along * 0.3,
          -(70 + Math.random() * 190) * power,
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
          dir * (50 + Math.random() * 90) * power,
          -(40 + Math.random() * 110) * power,
          6 + Math.floor(Math.random() * 4),
          2,
          palette.wood,
          520 + Math.random() * 200,
          true,
        ),
      );
    }
  }

  private paint(run: Run): void {
    if (run.span < 1 || run.bays.length === 0) {
      run.image.setVisible(false);
      run.sig = '';
      return;
    }
    const bits = run.bays.map((bay) => (bay.alive ? '0' : '1')).join('');
    const sig = `${run.x0}.${run.feet}.${run.height}.${run.span}.${bits}`;
    if (sig !== run.sig) {
      run.sig = sig;
      const drawn = drawFence(run);
      run.ox = drawn.ox;
      run.oy = drawn.oy;
      blit(this.scene, run.key, drawn.pix);
      run.image.setTexture(run.key);
      run.image.setDisplaySize(drawn.pix.w, drawn.pix.h);
    }
    run.image.setPosition(run.ox, run.oy);
    run.image.setDepth(0.25 + run.feet / 10000);
    run.image.setVisible(true);
  }
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

function drawFence(run: Run): { pix: Pix; ox: number; oy: number } {
  const pad = 8;
  const gap = picketGap(run.height);
  const slat = picketSlat(run.height);
  const ox = run.x0 - pad;
  const oy = run.feet - run.height - 6;
  const pix = new Pix(run.span + pad * 2 + slat + 4, run.height + 16);
  const ground = run.feet - oy;
  const hashY = run.feet - run.fieldY;
  for (let along = 0; along < run.span; along += gap) {
    const bay = bayAt(run, along);
    if (!bay) continue;
    const localX = pad + along;
    const hashX = run.x0 + along - run.fieldX;
    const thick = along < bay.start + gap;
    if (bay.alive) paintSlat(pix, localX, ground, slat, run.height, hashX, hashY, thick);
    else paintBrokenSlat(pix, localX, ground, slat, run.height, hashX, hashY, thick);
  }
  for (const bay of run.bays) {
    const y1 = ground - Math.round(run.height * 0.68);
    const y2 = ground - Math.round(run.height * 0.36);
    const a = pad + bay.start;
    const b = pad + bay.end;
    if (bay.alive) {
      paintBoard(pix, a, y1, b - a);
      paintBoard(pix, a, y2, b - a);
    } else {
      paintBrokenBoard(pix, a, b, y1);
      paintBrokenBoard(pix, a, b, y2);
      paintFallen(pix, a, b, ground, bay.start);
    }
  }
  return { pix, ox, oy };
}

function bayAt(run: Run, along: number): Bay | null {
  for (const bay of run.bays) {
    if (along >= bay.start && along < bay.end) return bay;
  }
  return run.bays[run.bays.length - 1] ?? null;
}

function paintSlat(
  pix: Pix,
  x: number,
  ground: number,
  slat: number,
  height: number,
  hashX: number,
  hashY: number,
  thick: boolean,
): void {
  const tall = height - (hash(hashX, hashY) % 3);
  const wood = hash(hashX, 8) % 3 === 0 ? palette.woodDark : palette.wood;
  pix.fill(x, ground - tall, slat, tall, wood);
  pix.fill(x, ground - tall, 1, tall, palette.woodLite);
  pix.px(x, ground - tall - 1, palette.woodLite);
  pix.px(x + slat - 1, ground - tall - 1, palette.wood);
  if (!thick) return;
  pix.fill(x - 1, ground - tall - 3, slat + 2, tall + 4, palette.woodDark);
  pix.fill(x, ground - tall - 2, 1, tall + 2, palette.woodLite);
}

function paintBrokenSlat(
  pix: Pix,
  x: number,
  ground: number,
  slat: number,
  height: number,
  hashX: number,
  hashY: number,
  thick: boolean,
): void {
  const n = hash(hashX, hashY);
  const frac = thick ? 0.42 + (n % 16) / 100 : 0.2 + (n % 22) / 100;
  const tall = Math.max(3, Math.round(height * frac));
  const lean = (n % 2 === 0 ? 1 : -1) * (thick ? 2 : 1);
  const body = n % 3 === 0 ? palette.woodDark : palette.wood;
  const width = thick ? slat + 2 : slat;
  const left = thick ? x - 1 : x;
  for (let k = 0; k < tall; k += 1) {
    const shift = Math.round((lean * k) / Math.max(1, tall - 1));
    pix.fill(left + shift, ground - 1 - k, width, 1, body);
    pix.px(left + shift, ground - 1 - k, palette.woodLite);
  }
  const tip = Math.round(lean);
  pix.px(left + tip, ground - tall - 1, palette.woodLite);
  pix.px(left + tip + lean, ground - tall - 2, palette.wood);
  if (n % 4 === 0) pix.fill(left, ground - 2, Math.max(3, width), 1, palette.woodDark);
}

function paintBoard(pix: Pix, x: number, y: number, width: number): void {
  if (width <= 0) return;
  pix.fill(x, y, width, 2, palette.woodDark);
  pix.fill(x, y, width, 1, palette.woodLite);
}

function paintBrokenBoard(pix: Pix, x0: number, x1: number, y: number): void {
  const span = x1 - x0;
  if (span <= 2) return;
  const n = hash(x0, y);
  const cut = 0.28 + (n % 14) / 100;
  const back = 0.62 + ((n >> 4) % 16) / 100;
  const leftW = Math.max(2, Math.round(span * cut));
  const rightW = Math.max(2, Math.round(span * (1 - back)));
  paintBoard(pix, x0, y, Math.min(leftW, span));
  paintBoard(pix, x1 - Math.min(rightW, span), y, Math.min(rightW, span));
  const breakX = x0 + leftW;
  pix.fill(breakX, y, 2, 3, palette.woodDark);
  pix.px(breakX + (n % 2 === 0 ? 1 : -1), y + 3, palette.wood);
}

function paintFallen(pix: Pix, x0: number, x1: number, ground: number, seed: number): void {
  const n = hash(seed, ground);
  const len = Math.max(5, Math.round((x1 - x0) * 0.34));
  const mid = (x0 + x1) / 2;
  const lean = n % 2 === 0 ? 1 : -1;
  paintLine(pix, mid, ground - 2, mid + lean * len, ground - 5);
}

function paintLine(pix: Pix, x0: number, y0: number, x1: number, y1: number): void {
  const steps = Math.max(1, Math.abs(x1 - x0) + Math.abs(y1 - y0));
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const x = Math.round(x0 + (x1 - x0) * t);
    const y = Math.round(y0 + (y1 - y0) * t);
    pix.fill(x, y, 3, 2, palette.wood);
    pix.px(x, y, palette.woodLite);
  }
}
