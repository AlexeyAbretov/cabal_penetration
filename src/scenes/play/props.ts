import Phaser from 'phaser';
import { grenade, palette, scenery, wall, type DropKind, type PropKind } from '../../constants';
import { drillProps } from '../../data/wave';
import { fieldScale, type FrameLayout } from '../../layout';
import type { Sparks } from './sparks';

type Prop = {
  kind: PropKind;
  drop: DropKind;
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
};

/**
 * Куст и ящик. Хитбокс не сжимается со стадией: лист встанет в тот же прямоугольник.
 * Разрушение роняет один дроп. Гранату по ним тратить незачем — она их только надкалывает.
 */
export class Props {
  private props: Prop[];
  private view: FrameLayout | null = null;
  private readonly gfx: Phaser.GameObjects.Graphics;
  private readonly sparks: Sparks;
  private readonly onBreak: (drop: DropKind, score: number, rx: number, ry: number) => void;

  constructor(
    scene: Phaser.Scene,
    sparks: Sparks,
    onBreak: (drop: DropKind, score: number, rx: number, ry: number) => void,
  ) {
    this.sparks = sparks;
    this.onBreak = onBreak;
    this.props = drillProps.map((mark) => {
      const spec = scenery[mark.kind];
      return {
        kind: mark.kind,
        drop: mark.drop,
        rx: mark.x,
        ry: mark.y,
        hp: spec.hp,
        flash: 0,
        alive: true,
        x: 0,
        y: 0,
        w: spec.width,
        h: spec.height,
        baseW: spec.width,
        baseH: spec.height,
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

  hit(aimX: number, aimY: number): boolean {
    const target = this.pick(aimX, aimY);
    if (!target) return false;
    this.wound(target, 1);
    this.bury();
    return true;
  }

  blast(x: number, y: number): void {
    for (const prop of this.props) {
      if (!prop.alive) continue;
      if (Math.hypot(prop.x - x, prop.y - y) > grenade.blastRadius) continue;
      this.wound(prop, grenade.propHits);
    }
    this.bury();
  }

  draw(): void {
    const gfx = this.gfx;
    gfx.clear();
    const ordered = this.props.filter((prop) => prop.alive).sort((a, b) => a.y - b.y);
    for (const prop of ordered) {
      if (prop.kind === 'bush') this.drawBush(gfx, prop);
      else this.drawCrate(gfx, prop);
    }
  }

  private place(): void {
    const view = this.view;
    if (!view) return;
    const field = view.field;
    const ceiling = view.track.y - wall.intoField;
    for (const prop of this.props) {
      if (!prop.alive) continue;
      let y = field.y + prop.ry * field.height;
      let scale = fieldScale(y, field);
      let h = prop.baseH * scale;
      const maxY = ceiling - h / 2 - 4;
      if (y > maxY) {
        y = maxY;
        scale = fieldScale(y, field);
        h = prop.baseH * scale;
      }
      prop.x = field.x + prop.rx * field.width;
      prop.y = y;
      prop.w = prop.baseW * scale;
      prop.h = h;
    }
  }

  private pick(x: number, y: number): Prop | null {
    let target: Prop | null = null;
    for (const prop of this.props) {
      if (!prop.alive || !covers(prop, x, y)) continue;
      if (!target || prop.y > target.y) target = prop;
    }
    return target;
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
    this.onBreak(prop.drop, scenery[prop.kind].score, rx, ry);
  }

  private bury(): void {
    this.props = this.props.filter((prop) => prop.alive);
  }

  private drawBush(gfx: Phaser.GameObjects.Graphics, prop: Prop): void {
    const left = Math.round(prop.x - prop.w / 2);
    const top = Math.round(prop.y - prop.h / 2);
    const w = Math.max(1, Math.round(prop.w));
    const h = Math.max(1, Math.round(prop.h));
    const stage = stageOf(prop.kind, prop.hp);
    const mass = stage === 0 ? 1 : stage === 1 ? 0.72 : 0.42;
    const bite = stage === 1 ? Math.round(w * 0.24) : 0;
    const mw = Math.max(4, w - bite);
    const mh = Math.max(4, Math.round(h * mass));
    const my = top + h - mh;
    gfx.fillStyle(palette.black, 0.28);
    gfx.fillRect(left, top, w, h);
    gfx.fillStyle(palette.black, 1);
    gfx.fillRect(left - 1, my - 1, mw + 2, mh + 2);
    const flash = prop.flash > 0;
    gfx.fillStyle(flash ? palette.ink : stage === 2 ? palette.bushStump : stage === 1 ? palette.bushHurt : palette.bush, 1);
    gfx.fillRect(left, my, mw, mh);
    if (flash) return;
    if (stage === 0) {
      gfx.fillStyle(palette.bushLeaf, 1);
      gfx.fillRect(left, my, mw, Math.max(3, Math.round(mh * 0.38)));
    }
    if (stage < 2) {
      gfx.fillStyle(palette.bushStump, 1);
      const foot = Math.max(3, Math.round(mh * 0.22));
      gfx.fillRect(left, my + mh - foot, mw, foot);
    }
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

function covers(prop: Prop, aimX: number, aimY: number): boolean {
  return (
    aimX >= prop.x - prop.w / 2 &&
    aimX <= prop.x + prop.w / 2 &&
    aimY >= prop.y - prop.h / 2 &&
    aimY <= prop.y + prop.h / 2
  );
}
