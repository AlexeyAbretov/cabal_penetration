import Phaser from 'phaser';
import { circleHitsRect, distanceToSegment, rectsOverlap, type HitBox } from '../../combat';
import type { Cover } from '../../cover';
import { grenade, palette, railFence } from '../../constants';
import { readNum, readRecord, type RailRow } from '../../keep';
import type { RailLayout, RailMark, RailPost } from '../../types/rail';
import type { FrameLayout } from '../../layout';
import { blit, ensureCanvas } from './blit';
import { hash, Pix } from './pix';

type Bay = {
  a: number;
  b: number | null;
  snapped: boolean;
};

type Run = {
  side: RailMark['side'];
  hp: number;
  flash: number;
  alive: boolean;
  fit: number;
  posts: RailPost[];
  bays: Bay[];
  image: Phaser.GameObjects.Image;
  key: string;
  sig: string;
  /** Подошва столба в каждом плотном пикселе. 0 — воздух. */
  depth: Uint16Array | null;
  near: number;
  ox: number;
  oy: number;
  pixW: number;
  pixH: number;
};

type Burst = {
  run: Run;
  bay: number;
  delay: number;
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
 * Жерди вдоль дороги. Стену у ног не закрывают.
 * Очередь колет, граната снимает забор сразу.
 * Слом идёт щепкой по пролётам. Сломанные жерди остаются стоять.
 * Целый забор закрывает пехоту своим пикселем и глубиной этого места.
 * Прямоугольник пролёта дырку во враге не вырезает.
 * Один бонус из списка картинки на весь забор.
 */
export class Rails {
  private readonly runs: Run[];
  private bursts: Burst[] = [];
  private chips: Chip[] = [];
  private view: FrameLayout | null = null;
  private readonly scene: Phaser.Scene;
  private readonly chipsGfx: Phaser.GameObjects.Graphics;
  private readonly onBreak: (score: number, rx: number, ry: number) => void;
  private readonly layout: (width: number, height: number) => RailLayout;

  constructor(
    scene: Phaser.Scene,
    marks: readonly RailMark[],
    field: Phaser.GameObjects.Container,
    onBreak: (score: number, rx: number, ry: number) => void,
    layout: (width: number, height: number) => RailLayout,
  ) {
    this.scene = scene;
    this.onBreak = onBreak;
    this.layout = layout;
    this.chipsGfx = scene.add.graphics().setDepth(3.2);
    this.runs = marks.map((mark, index) => {
      const key = `rail-${index}`;
      const image = scene.add.image(0, 0, ensureCanvas(scene, key)).setOrigin(0, 0).setDepth(-1).setVisible(false);
      field.add(image);
      return {
        side: mark.side,
        hp: railFence.hp,
        flash: 0,
        alive: true,
        fit: 1,
        posts: [],
        bays: [],
        key,
        sig: '',
        image,
        depth: null,
        near: 0,
        ox: 0,
        oy: 0,
        pixW: 0,
        pixH: 0,
      };
    });
  }

  note(): RailRow[] {
    return this.runs.map((run) => ({ hp: run.hp, alive: run.alive }));
  }

  /** Сломанный забор ставит рваные пролёты на первой раскладке. Бонус заново не берётся. */
  recall(data: unknown): void {
    if (!Array.isArray(data)) return;
    data.forEach((item, index) => {
      const run = this.runs[index];
      const row = readRecord(item);
      if (!run || !row) return;
      const hp = readNum(row.hp);
      if (hp !== null) run.hp = Math.min(railFence.hp, Math.max(0, hp));
      if (row.alive === false) {
        run.alive = false;
        run.hp = 0;
      }
    });
  }

  bind(view: FrameLayout): void {
    this.view = view;
    this.place();
  }

  step(delta: number): void {
    for (const run of this.runs) {
      run.flash = Math.max(0, run.flash - delta);
      if (run.flash > 0) run.image.setTint(palette.ink);
      else run.image.clearTint();
    }
    this.tickBursts(delta);
    this.tickChips(delta);
  }

  /** Квадрат креста колет забор, чья жердь или столб в него попали. */
  hit(box: HitBox, amount: number): void {
    const at = { x: (box.left + box.right) / 2, y: (box.top + box.bottom) / 2 };
    for (const run of this.runs) {
      if (!this.struck(run, box)) continue;
      this.wound(run, amount, at);
    }
  }

  /** Целый забор закрывает пехоту деревом. Воздух пролёта и дальний столб ближнего бойца не режут. */
  shields(): Cover[] {
    const out: Cover[] = [];
    for (const run of this.runs) {
      if (!run.alive || !run.depth || run.near <= 0 || run.pixW < 1) continue;
      const box = { left: run.ox, right: run.ox + run.pixW, top: run.oy, bottom: run.oy + run.pixH };
      out.push({ box, sole: run.near, soleAt: (x, y) => railSole(run, x, y) });
    }
    return out;
  }

  /** Разрыв снимает забор, чья жердь или столб входят в круг. */
  blast(x: number, y: number): void {
    for (const run of this.runs) {
      if (!this.blasted(run, x, y)) continue;
      this.wound(run, run.hp, { x, y });
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
    const layout = this.layout(field.width, field.height);
    for (const run of this.runs) {
      const src = run.side === 'left' ? layout.left : layout.right;
      run.fit = layout.fit;
      run.posts = src.map((post) => ({
        x: field.x + post.x,
        y: field.y + post.y,
        ph: post.ph,
        w: post.w,
      }));
      const count = run.posts.length <= 1 ? run.posts.length : run.posts.length - 1;
      if (run.bays.length !== count) {
        const dead = !run.alive;
        run.bays = Array.from({ length: count }, (_, index) => ({
          a: index,
          b: index + 1 < run.posts.length ? index + 1 : null,
          snapped: dead,
        }));
        this.dropBursts(run);
      }
      this.paint(run);
    }
  }

  private wound(run: Run, amount: number, at: { x: number; y: number }): void {
    if (!run.alive || amount <= 0 || run.bays.length === 0) return;
    run.hp -= amount;
    run.flash = 80;
    const spot = this.nearest(run, at.x, at.y);
    if (run.hp > 0) {
      this.spawn(spot.x, spot.y, run.side, 0.55, 0, 4);
      return;
    }
    run.alive = false;
    const field = this.view?.field;
    const rx = field ? (spot.x - field.x) / Math.max(1, field.width) : 0.5;
    const ry = field ? (spot.y - field.y) / Math.max(1, field.height) : 0.5;
    this.onBreak(railFence.score, rx, ry);
    this.snap(run, spot.bay, true, spot);
    for (let index = 0; index < run.bays.length; index += 1) {
      if (index === spot.bay) continue;
      this.bursts.push({ run, bay: index, delay: Math.abs(index - spot.bay) * 42 });
    }
    this.paint(run);
  }

  private tickBursts(delta: number): void {
    const due: Burst[] = [];
    this.bursts = this.bursts.filter((burst) => {
      burst.delay -= delta;
      if (burst.delay > 0) return true;
      due.push(burst);
      return false;
    });
    if (due.length === 0) return;
    const dirty = new Set<Run>();
    for (const burst of due) {
      if (this.snap(burst.run, burst.bay, false)) dirty.add(burst.run);
    }
    for (const run of dirty) this.paint(run);
  }

  /** Пролёт становится сломанным и сыплет щепой вдоль жердей. Уже сломанный молчит. */
  private snap(run: Run, index: number, heavy: boolean, at?: { x: number; y: number }): boolean {
    const bay = run.bays[index];
    if (!bay || bay.snapped) return false;
    bay.snapped = true;
    const power = heavy ? 1 : 0.85;
    const per = heavy ? 2 : 1;
    for (const spot of this.shatterPoints(run, bay, at)) {
      this.spawn(spot.x, spot.y, run.side, power, 0, per);
    }
    const mid = this.bayPoint(run, bay);
    this.spawn(mid.x, mid.y, run.side, power, heavy ? 2 : 1, 0);
    return true;
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

  private spawn(
    x: number,
    y: number,
    side: RailMark['side'],
    power: number,
    planks: number,
    count: number,
  ): void {
    const outward = side === 'left' ? -1 : 1;
    for (let i = 0; i < count; i += 1) {
      const along = (Math.random() - 0.5) * 140 * power;
      this.chips.push(
        chip(
          x,
          y,
          outward * (90 + Math.random() * 160) * power + along * 0.3,
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
      this.chips.push(
        chip(
          x,
          y,
          outward * (50 + Math.random() * 90) * power,
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
    if (run.posts.length === 0) {
      run.image.setVisible(false);
      run.sig = '';
      run.depth = null;
      run.near = 0;
      return;
    }
    const bits = run.bays.map((bay) => (bay.snapped ? '1' : '0')).join('');
    const sig = `${run.posts.map((post) => `${post.x}.${post.y}.${post.ph}.${post.w}`).join(',')}|${bits}`;
    if (sig === run.sig && (!run.alive || run.depth)) return;
    run.sig = sig;
    const drawn = drawRun(run.posts, run.bays, run.fit, run.side === 'left' ? -1 : 1);
    run.ox = drawn.ox;
    run.oy = drawn.oy;
    run.pixW = drawn.pix.w;
    run.pixH = drawn.pix.h;
    if (run.alive) {
      const cover = railCover(run.posts, drawn.pix, drawn.ox, drawn.oy);
      run.depth = cover.depth;
      run.near = cover.near;
    } else {
      run.depth = null;
      run.near = 0;
    }
    blit(this.scene, run.key, drawn.pix);
    run.image.setTexture(run.key);
    run.image.setDisplaySize(drawn.pix.w, drawn.pix.h);
    run.image.setPosition(drawn.ox, drawn.oy);
    run.image.setVisible(true);
  }

  private dropBursts(run: Run): void {
    this.bursts = this.bursts.filter((burst) => burst.run !== run);
  }

  private struck(run: Run, box: HitBox): boolean {
    if (!run.alive) return false;
    for (const post of run.posts) {
      if (rectsOverlap(box, postRect(post))) return true;
    }
    for (const line of railLines(run)) {
      if (segmentHitsRect(line.x0, line.y0, line.x1, line.y1, box, 3)) return true;
    }
    return false;
  }

  private blasted(run: Run, x: number, y: number): boolean {
    if (!run.alive) return false;
    const reach = grenade.blastRadius + 3;
    for (const post of run.posts) {
      if (circleHitsRect(x, y, grenade.blastRadius, postRect(post))) return true;
    }
    for (const line of railLines(run)) {
      if (distanceToSegment(x, y, line.x0, line.y0, line.x1, line.y1).distance <= reach) return true;
    }
    return false;
  }

  private nearest(run: Run, x: number, y: number): { x: number; y: number; bay: number } {
    let best = { x, y, bay: 0, d: Number.POSITIVE_INFINITY };
    const take = (px: number, py: number, bay: number, d: number) => {
      if (d < best.d) best = { x: px, y: py, bay, d };
    };
    run.bays.forEach((bay, index) => {
      const a = run.posts[bay.a];
      if (!a) return;
      const pcx = a.x + a.w / 2;
      const pcy = a.y - a.ph / 2;
      take(pcx, pcy, index, Math.hypot(x - pcx, y - pcy));
      if (bay.b === null) return;
      const b = run.posts[bay.b];
      if (!b) return;
      for (const frac of [0.72, 0.38]) {
        const x0 = a.x;
        const y0 = a.y - Math.round(a.ph * frac);
        const x1 = b.x;
        const y1 = b.y - Math.round(b.ph * frac);
        const hit = distanceToSegment(x, y, x0, y0, x1, y1);
        take(x0 + (x1 - x0) * hit.t, y0 + (y1 - y0) * hit.t, index, hit.distance);
      }
    });
    return best;
  }

  private shatterPoints(run: Run, bay: Bay, at?: { x: number; y: number }): { x: number; y: number }[] {
    const a = run.posts[bay.a];
    const points: { x: number; y: number }[] = [];
    if (at) points.push(at);
    if (!a) return points;
    if (bay.b === null) {
      points.push({ x: a.x + a.w / 2, y: a.y - a.ph * 0.55 });
      return points;
    }
    const b = run.posts[bay.b];
    if (!b) return points;
    for (const frac of [0.72, 0.38]) {
      const y0 = a.y - a.ph * frac;
      const y1 = b.y - b.ph * frac;
      for (const t of [0.18, 0.5, 0.82]) {
        points.push({ x: a.x + (b.x - a.x) * t, y: y0 + (y1 - y0) * t });
      }
    }
    return points;
  }

  private bayPoint(run: Run, bay: Bay): { x: number; y: number } {
    const a = run.posts[bay.a];
    if (!a) return { x: 0, y: 0 };
    if (bay.b === null) return { x: a.x + a.w / 2, y: a.y - a.ph * 0.55 };
    const b = run.posts[bay.b];
    if (!b) return { x: a.x + a.w / 2, y: a.y - a.ph * 0.55 };
    return {
      x: (a.x + b.x) / 2,
      y: (a.y - a.ph * 0.55 + (b.y - b.ph * 0.55)) / 2,
    };
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

type Line = { x0: number; y0: number; x1: number; y1: number };

function railLines(run: Run): Line[] {
  const lines: Line[] = [];
  for (const bay of run.bays) {
    if (bay.b === null) continue;
    const a = run.posts[bay.a];
    const b = run.posts[bay.b];
    if (!a || !b) continue;
    for (const frac of [0.72, 0.38]) {
      lines.push({
        x0: a.x,
        y0: a.y - Math.round(a.ph * frac),
        x1: b.x,
        y1: b.y - Math.round(b.ph * frac),
      });
    }
  }
  return lines;
}

function postRect(post: RailPost): HitBox {
  return {
    left: post.x - 1,
    right: post.x + post.w + 1,
    top: post.y - post.ph - 2,
    bottom: post.y + 1,
  };
}

function railSole(run: Run, x: number, y: number): number {
  const depth = run.depth;
  if (!depth) return 0;
  const lx = Math.floor(x - run.ox);
  const ly = Math.floor(y - run.oy);
  if (lx < 0 || ly < 0 || lx >= run.pixW || ly >= run.pixH) return 0;
  return depth[ly * run.pixW + lx] ?? 0;
}

/** Плотный пиксель помнит подошву своего столба. Сосед в один пиксель закрывает шов. */
function railCover(
  posts: readonly RailPost[],
  pix: Pix,
  ox: number,
  oy: number,
): { depth: Uint16Array; near: number } {
  const depth = new Uint16Array(pix.w * pix.h);
  const src = pix.data;
  let near = 0;
  for (let y = 0; y < pix.h; y += 1) {
    for (let x = 0; x < pix.w; x += 1) {
      if (src[(y * pix.w + x) * 4 + 3]! < 128) continue;
      const ground = Math.round(groundAt(posts, ox + x + 0.5, oy + y + 0.5));
      const stored = ground > 0 ? ground : 1;
      depth[y * pix.w + x] = stored;
      if (stored > near) near = stored;
    }
  }
  return { depth: expandDepth(depth, pix.w, pix.h), near };
}

function groundAt(posts: readonly RailPost[], x: number, y: number): number {
  let best = Number.POSITIVE_INFINITY;
  let ground = 0;
  const take = (d2: number, yGround: number): void => {
    if (d2 >= best) return;
    best = d2;
    ground = yGround;
  };
  for (const post of posts) {
    const left = post.x;
    const right = post.x + post.w;
    const top = post.y - post.ph;
    const dx = x < left ? left - x : x > right ? x - right : 0;
    const dy = y < top ? top - y : y > post.y ? y - post.y : 0;
    take(dx * dx + dy * dy, post.y);
  }
  for (let i = 0; i < posts.length - 1; i += 1) {
    const a = posts[i];
    const b = posts[i + 1];
    if (!a || !b) continue;
    for (const frac of [0.72, 0.38]) {
      const x0 = a.x;
      const y0 = a.y - a.ph * frac;
      const x1 = b.x;
      const y1 = b.y - b.ph * frac;
      const hit = distanceToSegment(x, y, x0, y0, x1, y1);
      take(hit.distance * hit.distance, a.y + (b.y - a.y) * hit.t);
    }
  }
  return ground;
}

function expandDepth(depth: Uint16Array, w: number, h: number): Uint16Array {
  const out = new Uint16Array(depth.length);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = y * w + x;
      const own = depth[i] ?? 0;
      if (own) {
        out[i] = own;
        continue;
      }
      let best = 0;
      for (let dy = -1; dy <= 1; dy += 1) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        const row = yy * w;
        for (let dx = -1; dx <= 1; dx += 1) {
          const xx = x + dx;
          if (xx < 0 || xx >= w) continue;
          const n = depth[row + xx] ?? 0;
          if (n > best) best = n;
        }
      }
      out[i] = best;
    }
  }
  return out;
}

function segmentHitsRect(x0: number, y0: number, x1: number, y1: number, box: HitBox, pad: number): boolean {
  const left = box.left - pad;
  const right = box.right + pad;
  const top = box.top - pad;
  const bottom = box.bottom + pad;
  const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 4));
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const x = x0 + (x1 - x0) * t;
    const y = y0 + (y1 - y0) * t;
    if (x >= left && x <= right && y >= top && y <= bottom) return true;
  }
  return false;
}

function drawRun(
  posts: readonly RailPost[],
  bays: readonly Bay[],
  fit: number,
  lean: number,
): { pix: Pix; ox: number; oy: number } {
  const thick = Math.max(1, Math.round(2 * fit));
  const box = bounds(posts, thick);
  const pix = new Pix(box.w, box.h);
  const local = posts.map((post) => ({
    x: post.x - box.ox,
    y: post.y - box.oy,
    ph: post.ph,
    w: post.w,
  }));
  for (let index = 0; index < local.length; index += 1) {
    const post = local[index]!;
    if (postDown(bays, index)) paintSnappedPost(pix, post, lean);
    else paintPost(pix, post.x, post.y, post.ph, post.w);
  }
  for (const bay of bays) {
    if (bay.b === null) continue;
    const a = local[bay.a];
    const b = local[bay.b];
    if (!a || !b) continue;
    if (bay.snapped) paintSnappedSpan(pix, a, b, thick, lean);
    else paintSpan(pix, a, b, thick);
  }
  return { pix, ox: box.ox, oy: box.oy };
}

function bounds(posts: readonly RailPost[], thick: number): { ox: number; oy: number; w: number; h: number } {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const post of posts) {
    minX = Math.min(minX, post.x - 6);
    maxX = Math.max(maxX, post.x + post.w + thick + 6);
    minY = Math.min(minY, post.y - post.ph - 8);
    maxY = Math.max(maxY, post.y + thick + 4);
  }
  return {
    ox: minX,
    oy: minY,
    w: Math.max(1, Math.ceil(maxX - minX + 1)),
    h: Math.max(1, Math.ceil(maxY - minY + 1)),
  };
}

function postDown(bays: readonly Bay[], index: number): boolean {
  if (bays[index]?.snapped) return true;
  return index > 0 && bays[index - 1]?.snapped === true;
}

function paintPost(pix: Pix, x: number, ground: number, height: number, width: number): void {
  pix.fill(x, ground - height, width, height, palette.woodDark);
  pix.fill(x, ground - height, 1, height, palette.woodLite);
  pix.fill(x - 1, ground - height - 1, width + 2, 2, palette.wood);
}

function paintSnappedPost(pix: Pix, post: RailPost, lean: number): void {
  const n = hash(post.x, post.y);
  const tall = Math.max(5, Math.round(post.ph * (0.4 + (n % 30) / 100)));
  const body = n % 2 === 0 ? palette.woodDark : palette.wood;
  const span = Math.max(1, tall - 1);
  for (let k = 0; k < tall; k += 1) {
    const shift = Math.round((lean * k * 3) / span);
    const y = post.y - 1 - k;
    pix.fill(post.x + shift, y, post.w, 1, body);
    pix.px(post.x + shift, y, palette.woodLite);
  }
  const shift = Math.round(lean * 3);
  const top = post.y - tall;
  pix.px(post.x + shift, top - 1, palette.woodLite);
  pix.px(post.x + shift + lean, top - 2, palette.wood);
  pix.px(post.x + shift - lean, top, palette.woodDark);
  if (n % 3 !== 0) pix.fill(post.x + shift, top - 3, 2, 1, palette.woodDark);
}

function paintSpan(pix: Pix, a: RailPost, b: RailPost, thick: number): void {
  paintRail(pix, a.x, a.y - Math.round(a.ph * 0.72), b.x, b.y - Math.round(b.ph * 0.72), thick);
  paintRail(pix, a.x, a.y - Math.round(a.ph * 0.38), b.x, b.y - Math.round(b.ph * 0.38), thick);
}

function paintSnappedSpan(pix: Pix, a: RailPost, b: RailPost, thick: number, lean: number): void {
  const n = hash(a.x, a.y);
  const upperCut = 0.3 + (n % 12) / 100;
  const upperBack = 0.66 + ((n >> 3) % 12) / 100;
  const lowerCut = 0.22 + ((n >> 5) % 14) / 100;
  const lowerBack = 0.58 + ((n >> 8) % 16) / 100;
  paintPartial(pix, a, b, 0.72, 0, upperCut, thick);
  paintPartial(pix, a, b, 0.72, upperBack, 1, thick);
  paintPartial(pix, a, b, 0.38, 0, lowerCut, thick);
  paintPartial(pix, a, b, 0.38, lowerBack, 1, thick);
  const y0 = a.y - Math.round(a.ph * 0.72);
  const y1 = b.y - Math.round(b.ph * 0.72);
  const breakX = Math.round(a.x + (b.x - a.x) * upperCut);
  const breakY = Math.round(y0 + (y1 - y0) * upperCut);
  pix.fill(breakX, breakY, 2, 4, palette.woodDark);
  pix.px(breakX + lean, breakY + 4, palette.wood);
  const foot = Math.max(a.y, b.y) - 2;
  const mid = (a.x + b.x) / 2;
  const len = Math.max(5, Math.round(Math.abs(b.x - a.x) * 0.34));
  paintRail(pix, mid, foot, mid + lean * len, foot - 3, thick);
}

function paintPartial(
  pix: Pix,
  a: RailPost,
  b: RailPost,
  frac: number,
  t0: number,
  t1: number,
  thick: number,
): void {
  const y0 = a.y - Math.round(a.ph * frac);
  const y1 = b.y - Math.round(b.ph * frac);
  paintRail(
    pix,
    a.x + (b.x - a.x) * t0,
    y0 + (y1 - y0) * t0,
    a.x + (b.x - a.x) * t1,
    y0 + (y1 - y0) * t1,
    thick,
  );
}

function paintRail(pix: Pix, x0: number, y0: number, x1: number, y1: number, thick: number): void {
  const steps = Math.max(1, Math.abs(x1 - x0) + Math.abs(y1 - y0));
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const x = Math.round(x0 + (x1 - x0) * t);
    const y = Math.round(y0 + (y1 - y0) * t);
    pix.fill(x, y, Math.max(2, thick + 1), thick, palette.wood);
    pix.px(x, y, palette.woodLite);
  }
}
