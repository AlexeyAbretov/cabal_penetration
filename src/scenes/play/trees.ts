import Phaser from 'phaser';
import { circleHitsRect, rectsOverlap, type HitBox } from '../../combat';
import type { Cover } from '../../cover';
import { grenade, palette, tree as treeStats } from '../../constants';
import { belowHorizon, fitScale, type FrameLayout } from '../../layout';
import type { TreeMark } from '../../types/tree';
import { blit, ensureCanvas } from './blit';
import { hash, type Pix } from './pix';
import { paintTree, type TreeBox } from './treeDraw';

type Tree = {
  mark: TreeMark;
  live: boolean;
  dir: 1 | -1;
  hp: number;
  flash: number;
  whole: boolean;
  pile: boolean;
  x: number;
  sole: number;
  height: number;
  ox: number;
  pixW: number;
  pixH: number;
  hit: TreeBox;
  /** Плотные пиксели кадра. Дырки листвы закрыты соседней кроной. */
  mask: Uint8Array | null;
  crown: { left: number; right: number; top: number; sole: number };
  image: Phaser.GameObjects.Image;
  key: string;
  sig: string;
};

type Bit = {
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
  leaf: boolean;
};

const woods = [palette.wood, palette.woodLite, palette.woodDark] as const;
const leaves = [palette.leaf, palette.leafLite, palette.leafDark] as const;

/**
 * Деревья картинки. Стоят отдельно от земли: сухое позади домов, живое перед фасадом.
 * Очередь колет, граната валит сразу. Щепки летят с места удара, у живого ещё листья.
 * С первой раны у живого на земле куча по ширине кроны.
 * Слом не убирает ствол. Оба типа ставят один лист: пень стоит, крона лежит рядом.
 * Сторона падения зеркалится. У живого куча остаётся.
 * Лежащее дерево закрывает пехоту за подошвой теми же плотными пикселями.
 * Один бонус из списка картинки.
 */
export class Trees {
  private readonly trees: Tree[];
  private bits: Bit[] = [];
  private view: FrameLayout | null = null;
  private readonly scene: Phaser.Scene;
  private readonly bitsGfx: Phaser.GameObjects.Graphics;
  private readonly onBreak: (score: number, rx: number, ry: number) => void;

  constructor(
    scene: Phaser.Scene,
    marks: readonly TreeMark[],
    onBreak: (score: number, rx: number, ry: number) => void,
  ) {
    this.scene = scene;
    this.onBreak = onBreak;
    this.bitsGfx = scene.add.graphics().setDepth(3.2);
    this.trees = marks.map((mark, index) => {
      const key = `tree-${index}`;
      const live = mark.live;
      const image = scene.add
        .image(0, 0, ensureCanvas(scene, key))
        .setOrigin(0.5, 1)
        .setDepth(live ? 1.2 : 0.55)
        .setVisible(false);
      const dir: 1 | -1 = hash(Math.round(mark.x * 1000), Math.round(mark.y * 1000)) % 2 === 0 ? 1 : -1;
      return {
        mark,
        live,
        dir,
        hp: treeStats.hp,
        flash: 0,
        whole: true,
        pile: false,
        x: 0,
        sole: 0,
        height: 0,
        ox: 0.5,
        pixW: 1,
        pixH: 1,
        hit: { left: 0, right: 0, top: 0, bottom: 0 },
        mask: null,
        crown: { left: 0, right: 0, top: 0, sole: 0 },
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
    for (const tree of this.trees) {
      tree.flash = Math.max(0, tree.flash - delta);
      if (tree.flash > 0) tree.image.setTint(palette.ink);
      else tree.image.clearTint();
    }
    this.tickBits(delta);
  }

  /** Квадрат креста колет дерево, в которое попал. */
  hit(box: HitBox, amount: number): void {
    const at = { x: (box.left + box.right) / 2, y: (box.top + box.bottom) / 2 };
    for (const tree of this.trees) {
      if (!tree.whole || tree.pixH < 2 || !rectsOverlap(box, body(tree))) continue;
      const face = body(tree);
      this.wound(
        tree,
        amount,
        Math.min(face.right, Math.max(face.left, at.x)),
        Math.min(face.bottom, Math.max(face.top, at.y)),
      );
    }
  }

  /** Стоящее и сломанное дерево закрывает дальнюю пехоту плотными пикселями. */
  shields(): Cover[] {
    const out: Cover[] = [];
    for (const tree of this.trees) {
      if (tree.pixH < 2 || !tree.mask) continue;
      const box = spriteBox(tree);
      out.push({ box, sole: box.bottom, opaque: (x, y) => treeOpaque(tree, x, y) });
    }
    return out;
  }

  /** Разрыв валит дерево, чьё тело входит в круг. */
  blast(x: number, y: number): void {
    for (const tree of this.trees) {
      if (!tree.whole || tree.pixH < 2 || !circleHitsRect(x, y, grenade.blastRadius, body(tree))) continue;
      const face = body(tree);
      this.wound(
        tree,
        tree.hp,
        Math.min(face.right, Math.max(face.left, x)),
        Math.min(face.bottom, Math.max(face.top, y)),
      );
    }
  }

  draw(): void {
    const gfx = this.bitsGfx;
    gfx.clear();
    for (const bit of this.bits) {
      const k = bit.life / bit.max;
      if (k <= 0) continue;
      const alpha = k > 0.4 ? 1 : k / 0.4;
      const spun = bit.spin && Math.floor((bit.max - bit.life) / 80) % 2 === 1;
      const w = spun ? bit.h : bit.w;
      const h = spun ? bit.w : bit.h;
      const x = Math.round(bit.x);
      const y = Math.round(bit.y);
      gfx.fillStyle(bit.color, alpha);
      gfx.fillRect(x, y, w, h);
      if (bit.leaf) {
        gfx.fillStyle(palette.leafLite, alpha);
        gfx.fillRect(x, y, 1, 1);
      } else if (w >= 5 && h >= 2) {
        gfx.fillStyle(palette.woodLite, alpha);
        gfx.fillRect(x, y, w, 1);
      }
    }
  }

  private place(): void {
    const view = this.view;
    if (!view) return;
    const field = view.field;
    const fit = fitScale(field);
    for (const tree of this.trees) {
      tree.height = Math.max(8, Math.round(tree.mark.h * fit));
      tree.x = field.x + Math.round(tree.mark.x * field.width);
      tree.sole = Math.round(field.y + belowHorizon(tree.mark.y, field));
      this.paint(tree);
    }
  }

  private wound(tree: Tree, amount: number, x: number, y: number): void {
    if (!tree.whole || amount <= 0) return;
    tree.hp -= amount;
    tree.flash = 80;
    const shed = tree.live && !tree.pile;
    if (tree.live) tree.pile = true;
    if (tree.hp > 0) {
      this.spawn(x, y, 0.55, false);
      if (tree.live) this.spawn(x, y, 0.7, true);
      if (shed) this.paint(tree);
      return;
    }
    tree.whole = false;
    const field = this.view?.field;
    const rx = field ? (tree.x - field.x) / Math.max(1, field.width) : tree.mark.x;
    const ry = field ? (y - field.y) / Math.max(1, field.height) : tree.mark.y;
    this.onBreak(treeStats.score, rx, ry);
    this.spawn(x, y, 1, false);
    this.spawn(tree.x, tree.sole - tree.height * 0.35, 0.85, false);
    if (tree.live) this.shedCrown(tree);
    this.paint(tree);
  }

  /** Листва кроны срывается по всей её ширине. Куча на земле уже лежит. */
  private shedCrown(tree: Tree): void {
    const span = tree.crown.right - tree.crown.left;
    const y = tree.crown.top + (tree.crown.sole - tree.crown.top) * 0.45;
    const count = 8;
    for (let i = 0; i < count; i += 1) {
      const px = tree.crown.left + (span * (i + 0.5)) / count;
      const at = local(tree, px, y);
      this.spawn(at.x, at.y, 0.9, true);
    }
  }

  private tickBits(delta: number): void {
    const dt = delta / 1000;
    const next: Bit[] = [];
    for (const bit of this.bits) {
      bit.life -= delta;
      if (bit.life <= 0) continue;
      bit.vy += 920 * dt;
      bit.x += bit.vx * dt;
      bit.y += bit.vy * dt;
      next.push(bit);
    }
    this.bits = next;
  }

  private spawn(x: number, y: number, power: number, leaf: boolean): void {
    const count = leaf ? 6 : 4;
    const colors = leaf ? leaves : woods;
    for (let i = 0; i < count; i += 1) {
      const dir = Math.random() < 0.5 ? -1 : 1;
      const w = leaf ? 2 + Math.floor(Math.random() * 2) : 2 + Math.floor(Math.random() * 3);
      const h = leaf ? 2 : 1 + Math.floor(Math.random() * 2);
      this.bits.push(
        bit(
          x,
          y,
          dir * (60 + Math.random() * 130) * power,
          -(70 + Math.random() * 160) * power,
          w,
          h,
          colors[Math.floor(Math.random() * colors.length)]!,
          (leaf ? 360 : 400) + Math.random() * 220,
          true,
          leaf,
        ),
      );
    }
    if (leaf || power < 0.8) return;
    for (let i = 0; i < 2; i += 1) {
      const dir = Math.random() < 0.5 ? -1 : 1;
      this.bits.push(
        bit(
          x,
          y,
          dir * (40 + Math.random() * 90) * power,
          -(50 + Math.random() * 120) * power,
          6 + Math.floor(Math.random() * 4),
          2,
          palette.wood,
          520 + Math.random() * 200,
          true,
          false,
        ),
      );
    }
  }

  private paint(tree: Tree): void {
    const painted = paintTree(tree.height, tree.live, !tree.whole, tree.pile, tree.dir);
    if (!painted) {
      tree.image.setVisible(false);
      tree.mask = null;
      tree.sig = '';
      return;
    }
    const sig = `${painted.pix.w}.${painted.pix.h}.${tree.whole ? 0 : 1}.${tree.pile ? 1 : 0}`;
    tree.ox = painted.ox;
    tree.pixW = painted.pix.w;
    tree.pixH = painted.pix.h;
    tree.hit = painted.hit;
    tree.crown = painted.crown;
    if (sig === tree.sig && tree.mask) {
      tree.image.setPosition(tree.x, tree.sole);
      return;
    }
    tree.mask = shade(painted.pix);
    tree.sig = sig;
    blit(this.scene, tree.key, painted.pix);
    tree.image.setTexture(tree.key);
    tree.image.setOrigin(painted.ox, 1);
    tree.image.setDisplaySize(painted.pix.w, painted.pix.h);
    tree.image.setPosition(tree.x, tree.sole);
    tree.image.setVisible(true);
  }
}

function spriteBox(tree: Tree): HitBox {
  const left = tree.x - tree.ox * tree.pixW;
  const top = tree.sole - tree.pixH;
  return { left, right: left + tree.pixW, top, bottom: tree.sole };
}

function treeOpaque(tree: Tree, x: number, y: number): boolean {
  const mask = tree.mask;
  if (!mask) return false;
  const lx = Math.floor(x - tree.x + tree.ox * tree.pixW);
  const ly = Math.floor(y - tree.sole + tree.pixH);
  if (lx < 0 || ly < 0 || lx >= tree.pixW || ly >= tree.pixH) return false;
  return mask[ly * tree.pixW + lx] === 1;
}

/** Плотный пиксель и его соседи. Одинокая дырка в листве пехоту не показывает. */
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

function body(tree: Tree): HitBox {
  return placed(tree, tree.hit);
}

function placed(tree: Tree, box: TreeBox): HitBox {
  const ox = tree.ox * tree.pixW;
  return {
    left: tree.x + box.left - ox,
    right: tree.x + box.right - ox,
    top: tree.sole + box.top - tree.pixH,
    bottom: tree.sole + box.bottom - tree.pixH,
  };
}

function local(tree: Tree, x: number, y: number): { x: number; y: number } {
  return {
    x: tree.x + x - tree.ox * tree.pixW,
    y: tree.sole + y - tree.pixH,
  };
}

function bit(
  x: number,
  y: number,
  vx: number,
  vy: number,
  w: number,
  h: number,
  color: number,
  life: number,
  spin: boolean,
  leaf: boolean,
): Bit {
  return { x: x - w / 2, y: y - h / 2, vx, vy, w, h, color, life, max: life, spin, leaf };
}
