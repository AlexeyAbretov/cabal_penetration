import Phaser from 'phaser';
import { centerBox, circleHitsRect, rectsOverlap, type HitBox } from '../../combat';
import type { Cover } from '../../cover';
import { grenade, palette, scenery, type PropKind } from '../../constants';
import type { PropMark } from '../../types/prop';
import { fieldScale, fitScale, wallTopY, type FrameLayout } from '../../layout';
import { blit, ensureCanvas } from './blit';
import { paintBush } from './plants';
import type { Sparks } from './sparks';

type Prop = {
  kind: PropKind;
  rx: number;
  ry: number;
  hp: number;
  flash: number;
  alive: boolean;
  x: number;
  y: number;
  w: number;
  h: number;
  baseW: number;
  baseH: number;
  score: number;
  sprite: Phaser.GameObjects.Image | null;
  key: string;
  paintedW: number;
  paintedH: number;
  paintedStage: number;
  paintedFlash: boolean;
};

/**
 * Куст и ящик. Куст рисуется пикселями, ящик — цветным ящиком. Хитбокс со стадией не сжимается.
 * Разрушение берёт один бонус из списка картинки. Граната сносит куст и тоже роняет. Ящик она только колет.
 * С первой раны у куста на земле листья. После гибели куст пропадает, листья остаются.
 */
export class Props {
  private props: Prop[];
  private view: FrameLayout | null = null;
  private readonly scene: Phaser.Scene;
  private readonly gfx: Phaser.GameObjects.Graphics;
  private readonly sparks: Sparks;
  private readonly onBreak: (score: number, rx: number, ry: number) => void;

  constructor(
    scene: Phaser.Scene,
    marks: readonly PropMark[],
    sparks: Sparks,
    onBreak: (score: number, rx: number, ry: number) => void,
  ) {
    this.scene = scene;
    this.sparks = sparks;
    this.onBreak = onBreak;
    this.props = marks.map((mark, index) => {
      const spec = scenery[mark.kind];
      const key = `prop-${index}`;
      const sprite =
        mark.kind === 'bush'
          ? scene.add.image(0, 0, ensureCanvas(scene, key)).setOrigin(0.5, 0.5).setDepth(2.5).setVisible(false)
          : null;
      return {
        kind: mark.kind,
        rx: mark.x,
        ry: mark.y,
        hp: spec.hp,
        flash: 0,
        alive: true,
        x: 0,
        y: 0,
        w: mark.w ?? spec.width,
        h: mark.h ?? spec.height,
        baseW: mark.w ?? spec.width,
        baseH: mark.h ?? spec.height,
        score: mark.score ?? spec.score,
        sprite,
        key,
        paintedW: 0,
        paintedH: 0,
        paintedStage: -1,
        paintedFlash: false,
      };
    });
    this.gfx = scene.add.graphics().setDepth(2.5);
  }

  bind(view: FrameLayout): void {
    this.view = view;
    this.place();
  }

  step(delta: number): void {
    for (const prop of this.props) prop.flash = Math.max(0, prop.flash - delta);
    this.place();
  }

  /** Квадрат креста бьёт каждый куст и ящик, который в него попал. */
  hit(box: HitBox, amount: number): void {
    let any = false;
    for (const prop of this.props) {
      if (!prop.alive || !rectsOverlap(box, centerBox(prop.x, prop.y, prop.w, prop.h))) continue;
      this.wound(prop, amount);
      any = true;
    }
    if (any) this.bury();
  }

  /** Живой куст и ящик закрывают пехоту за собой. */
  shields(): Cover[] {
    const out: Cover[] = [];
    for (const prop of this.props) {
      if (!prop.alive) continue;
      const box = centerBox(prop.x, prop.y, prop.w, prop.h);
      out.push({ box, sole: box.bottom });
    }
    return out;
  }

  /** Куст берётся по листве: круг задел прямоугольник кроны. Ящик — по центру. */
  blast(x: number, y: number): void {
    for (const prop of this.props) {
      if (!prop.alive) continue;
      const foliage = centerBox(prop.x, prop.y, prop.w, prop.h);
      const hit =
        prop.kind === 'bush'
          ? circleHitsRect(x, y, grenade.blastRadius, foliage)
          : Math.hypot(prop.x - x, prop.y - y) <= grenade.blastRadius;
      if (!hit) continue;
      const amount = prop.kind === 'bush' ? prop.hp : grenade.propHits;
      this.wound(prop, amount);
    }
    this.bury();
  }

  draw(): void {
    const gfx = this.gfx;
    gfx.clear();
    const ordered = this.props.filter((prop) => prop.alive || prop.kind === 'bush').sort((a, b) => a.y - b.y);
    for (const prop of ordered) {
      if (prop.kind === 'bush') this.drawBush(prop);
      else this.drawCrate(gfx, prop);
    }
  }

  private place(): void {
    const view = this.view;
    if (!view) return;
    const field = view.field;
    const ceiling = wallTopY(view.track);
    for (const prop of this.props) {
      if (!prop.alive && prop.kind !== 'bush') continue;
      let y = field.y + prop.ry * field.height;
      let scale = fieldScale(y, field) * fitScale(field);
      let h = prop.baseH * scale;
      const maxY = ceiling - h / 2 - 4;
      if (y > maxY) {
        y = maxY;
        scale = fieldScale(y, field) * fitScale(field);
        h = prop.baseH * scale;
      }
      prop.x = field.x + prop.rx * field.width;
      prop.y = y;
      prop.w = prop.baseW * scale;
      prop.h = h;
    }
  }

  private wound(prop: Prop, amount: number): void {
    if (!prop.alive) return;
    prop.hp -= amount;
    prop.flash = 70;
    if (prop.hp > 0) {
      this.sparks.add(prop.x, prop.y, 80, 'chip');
      return;
    }
    prop.alive = false;
    this.sparks.add(prop.x, prop.y, 160, 'land');
    const view = this.view;
    const field = view?.field;
    const rx = field ? (prop.x - field.x) / Math.max(1, field.width) : prop.rx;
    const ry = field ? (prop.y - field.y) / Math.max(1, field.height) : prop.ry;
    this.onBreak(prop.score, rx, ry);
  }

  /** Ящик убирается. Куст остаётся: на его месте уже лежат листья. */
  private bury(): void {
    for (const prop of this.props) {
      if (prop.alive || prop.kind === 'bush' || !prop.sprite) continue;
      prop.sprite.destroy();
      prop.sprite = null;
    }
    this.props = this.props.filter((prop) => prop.alive || prop.kind === 'bush');
  }

  private drawBush(prop: Prop): void {
    const sprite = prop.sprite;
    if (!sprite) return;
    const w = Math.max(8, Math.round(prop.w));
    const h = Math.max(8, Math.round(prop.h));
    const stage = prop.alive ? stageOf(prop.kind, prop.hp) : 3;
    const flash = prop.flash > 0;
    if (w !== prop.paintedW || h !== prop.paintedH || stage !== prop.paintedStage || flash !== prop.paintedFlash) {
      blit(this.scene, prop.key, paintBush(w, h, stage, flash));
      sprite.setTexture(prop.key);
      sprite.setDisplaySize(w, h);
      prop.paintedW = w;
      prop.paintedH = h;
      prop.paintedStage = stage;
      prop.paintedFlash = flash;
    }
    sprite.setPosition(Math.round(prop.x), Math.round(prop.y));
    sprite.setDepth(2.5 + prop.y / 10000);
    sprite.setVisible(true);
  }

  private drawCrate(gfx: Phaser.GameObjects.Graphics, prop: Prop): void {
    const left = Math.round(prop.x - prop.w / 2);
    const top = Math.round(prop.y - prop.h / 2);
    const w = Math.max(1, Math.round(prop.w));
    const h = Math.max(1, Math.round(prop.h));
    const stage = stageOf(prop.kind, prop.hp);
    const flash = prop.flash > 0;
    gfx.fillStyle(palette.black, 1);
    gfx.fillRect(left - 1, top - 1, w + 2, h + 2);
    gfx.fillStyle(flash ? palette.ink : stage === 2 ? palette.crateCrit : stage === 1 ? palette.crateHurt : palette.crate, 1);
    gfx.fillRect(left, top, w, h);
    if (flash) return;
    gfx.fillStyle(palette.crateBand, 1);
    gfx.fillRect(left, top + Math.round(h * 0.28), w, Math.max(3, Math.round(h * 0.16)));
    if (stage >= 1) {
      gfx.fillStyle(palette.crateCrit, 1);
      gfx.fillRect(left + Math.round(w * 0.38), top + 2, 2, Math.max(2, h - 4));
    }
    if (stage >= 2) {
      gfx.fillStyle(palette.ink, 1);
      gfx.fillRect(left + 2, top + Math.round(h * 0.58), Math.max(2, w - 4), 2);
    }
  }
}

function stageOf(kind: PropKind, hp: number): number {
  const spec = scenery[kind];
  const lost = spec.hp - hp;
  if (lost <= 0) return 0;
  return Math.min(spec.stages - 1, Math.ceil(lost / (spec.hp / spec.stages)));
}

