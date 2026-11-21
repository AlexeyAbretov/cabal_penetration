import Phaser from 'phaser';
import { centerBox } from '../../combat';
import { frame, grenade, infantry, palette, volley } from '../../constants';
import { pointHidden, shotReaches, type Cover } from '../../cover';
import { infantrySheet } from '../../infantrySheet';
import { fieldScale, wallTopY, type FrameLayout } from '../../layout';
import type { InfantryGroup, Wait } from '../../wave';
import type { Sparks } from './sparks';
import type { FrontWall } from './wall';

type Phase = 'run' | 'hold' | 'aim' | 'burst' | 'recover';

type Soldier = {
  alive: boolean;
  hp: number;
  score: number;
  flash: number;
  lane: number;
  heading: -1 | 1;
  sx: number;
  tx: number;
  moveT: number;
  runMs: number;
  phase: Phase;
  wait: number;
  column: number;
  anim: number;
  x: number;
  y: number;
  w: number;
  h: number;
};

type Shot = {
  column: number;
  elapsed: number;
  travelMs: number;
  fromX: number;
  fromY: number;
};

type SideLane = {
  groups: readonly InfantryGroup[];
  index: number;
  sent: number;
  nextAt: number;
};

/**
 * Пехота картинки. Группы описаны в волне: сколько, с какого края, на какой глубине.
 * Левый и правый край выпускают бойцов одновременно. На сцене не больше шести.
 * Между бойцами и между группами одного края пауза случайная.
 * Боец пробегает часть ширины, стреляет одной пулей и снова выбирает сторону.
 * Выстрел и разрыв не берут того, кто закрыт ближним объектом.
 */
export class Infantry {
  private readonly lanes: SideLane[];
  private units: Soldier[] = [];
  private incoming: Shot[] = [];
  private clock = 0;
  private frozen = false;
  private pixels: ImageData | null = null;
  private readonly scene: Phaser.Scene;
  private readonly bodies: Phaser.GameObjects.Graphics;
  private readonly sparks: Sparks;
  private readonly onKill: (points: number) => void;

  constructor(scene: Phaser.Scene, groups: readonly InfantryGroup[], sparks: Sparks, onKill: (points: number) => void) {
    this.scene = scene;
    this.lanes = sideLanes(groups);
    this.sparks = sparks;
    this.onKill = onKill;
    this.bodies = scene.add.graphics().setDepth(3);
  }

  freeze(): void {
    this.frozen = true;
    this.incoming.length = 0;
  }

  bind(view: FrameLayout): void {
    this.place(view);
  }

  step(delta: number, playerColumn: number, view: FrameLayout, columns: FrontWall): void {
    if (!this.frozen) {
      this.clock += delta;
      for (const soldier of this.units) this.advance(soldier, delta, playerColumn, view, columns);
      this.units = this.units.filter((soldier) => soldier.alive);
      this.spawn();
    }
    this.place(view);
  }

  arrive(delta: number): number[] {
    if (this.frozen) return [];
    const landed: number[] = [];
    const pending: Shot[] = [];
    for (const shot of this.incoming) {
      shot.elapsed += delta;
      if (shot.elapsed < shot.travelMs) pending.push(shot);
      else landed.push(shot.column);
    }
    this.incoming = pending;
    return landed;
  }

  hit(box: { left: number; right: number; top: number; bottom: number }, amount: number, covers: readonly Cover[]): void {
    for (const soldier of this.units) {
      if (!soldier.alive) continue;
      const body = centerBox(soldier.x, soldier.y, soldier.w, soldier.h);
      if (!shotReaches(body, box, this.foot(soldier), covers)) continue;
      this.wound(soldier, amount);
    }
    this.units = this.units.filter((soldier) => soldier.alive);
  }

  blast(x: number, y: number, covers: readonly Cover[]): void {
    const radius = grenade.blastRadius;
    for (const soldier of this.units) {
      if (!soldier.alive) continue;
      if (Math.hypot(soldier.x - x, soldier.y - y) > radius) continue;
      if (pointHidden(soldier.x, soldier.y, this.foot(soldier), covers)) continue;
      this.wound(soldier, soldier.hp);
    }
    this.units = this.units.filter((soldier) => soldier.alive);
  }

  draw(covers: readonly Cover[]): void {
    const gfx = this.bodies;
    gfx.clear();
    const sheet = this.sheet();
    const ordered = [...this.units].sort((a, b) => a.y - b.y);
    for (const soldier of ordered) {
      if (sheet) this.stamp(gfx, sheet, soldier, covers);
      else this.fallback(gfx, soldier, covers);
    }
  }

  drawBullets(gfx: Phaser.GameObjects.Graphics, view: FrameLayout, columns: FrontWall): void {
    for (const shot of this.incoming) {
      const to = columns.impact(view, shot.column);
      const t = Math.min(1, shot.elapsed / shot.travelMs);
      const x = shot.fromX + (to.x - shot.fromX) * t;
      const y = shot.fromY + (to.y - shot.fromY) * t;
      gfx.save();
      gfx.translateCanvas(x, y);
      gfx.rotateCanvas(Math.atan2(to.y - shot.fromY, to.x - shot.fromX));
      gfx.fillStyle(palette.enemyBullet, 1);
      gfx.fillRect(-volley.length, -volley.thickness / 2, volley.length, volley.thickness);
      gfx.restore();
    }
  }

  private spawn(): void {
    const due = this.lanes
      .filter((lane) => lane.index < lane.groups.length && this.clock >= lane.nextAt)
      .sort((a, b) => a.nextAt - b.nextAt);
    for (const lane of due) {
      if (this.units.length >= infantry.cap) return;
      this.release(lane);
    }
  }

  private release(lane: SideLane): void {
    const group = lane.groups[lane.index];
    if (!group) return;
    this.units.push(this.birth(group));
    lane.sent += 1;
    if (lane.sent < group.count) {
      lane.nextAt = this.clock + waitMs(group.step);
      return;
    }
    lane.index += 1;
    lane.sent = 0;
    const next = lane.groups[lane.index];
    if (!next) return;
    lane.nextAt = this.clock + waitMs(next.gap);
  }

  private birth(group: InfantryGroup): Soldier {
    const lane = group.band.far + Math.random() * (group.band.near - group.band.far);
    const heading: -1 | 1 = group.from === 'left' ? 1 : -1;
    const x0 = group.from === 'left' ? infantry.edge : 1 - infantry.edge;
    const leg = this.pickLeg(x0, heading);
    return {
      alive: true,
      hp: infantry.hp,
      score: infantry.score,
      flash: 0,
      lane,
      heading: leg.heading,
      sx: x0,
      tx: leg.to,
      moveT: 0,
      runMs: this.legMs(Math.abs(leg.to - x0)),
      phase: 'run',
      wait: 0,
      column: 0,
      anim: 0,
      x: 0,
      y: 0,
      w: infantry.width,
      h: infantry.height,
    };
  }

  private advance(
    soldier: Soldier,
    delta: number,
    playerColumn: number,
    view: FrameLayout,
    columns: FrontWall,
  ): void {
    soldier.flash = Math.max(0, soldier.flash - delta);
    if (soldier.phase === 'run') {
      soldier.anim += delta;
      soldier.moveT = Math.min(1, soldier.moveT + delta / soldier.runMs);
      if (soldier.moveT >= 1) {
        soldier.phase = 'hold';
        soldier.wait = infantry.holdMs;
      }
      return;
    }
    soldier.wait -= delta;
    if (soldier.wait > 0) return;
    if (soldier.phase === 'hold') {
      soldier.phase = 'aim';
      soldier.column = playerColumn;
      soldier.wait = volley.leadMs;
      return;
    }
    if (soldier.phase === 'aim') {
      soldier.phase = 'burst';
      soldier.wait = 0;
      return;
    }
    if (soldier.phase === 'burst') {
      this.launch(soldier, view, columns);
      soldier.phase = 'recover';
      soldier.wait = volley.recoverMs;
      return;
    }
    const leg = this.pickLeg(soldier.tx, Math.random() < 0.5 ? soldier.heading : this.flip(soldier.heading));
    soldier.sx = soldier.tx;
    soldier.tx = leg.to;
    soldier.heading = leg.heading;
    soldier.moveT = 0;
    soldier.runMs = this.legMs(Math.abs(leg.to - soldier.sx));
    soldier.phase = 'run';
    soldier.anim = 0;
  }

  /** В выбранную сторону, если там есть кусок пути. Иначе разворот. */
  private pickLeg(from: number, heading: -1 | 1): { heading: -1 | 1; to: number } {
    const room = this.room(from, heading);
    const face = room < infantry.leg.min ? this.flip(heading) : heading;
    const span = Math.max(0, this.room(from, face));
    const want = infantry.leg.min + Math.random() * (infantry.leg.max - infantry.leg.min);
    return { heading: face, to: from + face * Math.min(span, want) };
  }

  private room(from: number, heading: -1 | 1): number {
    return heading > 0 ? 1 - infantry.edge - from : from - infantry.edge;
  }

  private flip(heading: -1 | 1): -1 | 1 {
    return heading > 0 ? -1 : 1;
  }

  private legMs(distance: number): number {
    return Math.max(280, (distance / infantry.speed) * 1000);
  }

  private launch(soldier: Soldier, view: FrameLayout, columns: FrontWall): void {
    const to = columns.impact(view, soldier.column);
    const dist = Math.hypot(to.x - soldier.x, to.y - soldier.y);
    const span = view.width / frame.width;
    const travelMs = Math.max(volley.minTravelMs, (dist / (volley.speed * span)) * 1000);
    this.incoming.push({
      column: soldier.column,
      elapsed: 0,
      travelMs,
      fromX: soldier.x,
      fromY: soldier.y - soldier.h * 0.15,
    });
  }

  private wound(soldier: Soldier, amount: number): void {
    if (!soldier.alive || amount <= 0) return;
    soldier.hp -= amount;
    if (soldier.hp > 0) {
      soldier.flash = 70;
      this.sparks.add(soldier.x, soldier.y, 80, 'pop');
      return;
    }
    soldier.alive = false;
    this.sparks.add(soldier.x, soldier.y, 160, 'land');
    this.onKill(soldier.score);
  }

  private place(view: FrameLayout): void {
    const field = view.field;
    const ceiling = wallTopY(view.track);
    for (const soldier of this.units) {
      const u = soldier.moveT >= 1 ? 1 : 1 - (1 - soldier.moveT) * (1 - soldier.moveT);
      const rx = soldier.sx + (soldier.tx - soldier.sx) * u;
      let y = field.y + soldier.lane * field.height;
      let scale = fieldScale(y, field);
      const maxY = ceiling - (infantry.height * scale) / 2 - 6;
      if (y > maxY) {
        y = maxY;
        scale = fieldScale(y, field);
      }
      soldier.x = field.x + rx * field.width;
      soldier.y = y;
      soldier.w = infantry.width * scale;
      soldier.h = infantry.height * scale;
    }
  }

  private foot(soldier: Soldier): number {
    return soldier.y + soldier.h / 2;
  }

  private pose(soldier: Soldier): { frame: number; flip: boolean } {
    if (soldier.phase === 'run') {
      return { frame: Math.floor(soldier.anim / 120) % infantrySheet.run, flip: soldier.heading < 0 };
    }
    const firing = soldier.phase === 'aim' || soldier.phase === 'burst';
    return { frame: firing ? infantrySheet.fire : infantrySheet.aim, flip: false };
  }

  private sheet(): ImageData | null {
    if (this.pixels) return this.pixels;
    if (!this.scene.textures.exists(infantrySheet.key)) return null;
    const source = this.scene.textures.get(infantrySheet.key).getSourceImage() as CanvasImageSource;
    const width = infantrySheet.frameWidth * infantrySheet.frames;
    const height = infantrySheet.frameHeight;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(source, 0, 0);
    this.pixels = ctx.getImageData(0, 0, width, height);
    return this.pixels;
  }

  /** Пиксели листа. Клетка ближнего объекта не рисуется: дом остаётся поверх бойца. */
  private stamp(
    gfx: Phaser.GameObjects.Graphics,
    sheet: ImageData,
    soldier: Soldier,
    covers: readonly Cover[],
  ): void {
    const pose = this.pose(soldier);
    const fw = infantrySheet.frameWidth;
    const fh = infantrySheet.frameHeight;
    const sheetW = fw * infantrySheet.frames;
    const dw = Math.max(1, Math.round(soldier.w));
    const dh = Math.max(1, Math.round(soldier.h));
    const left = Math.round(soldier.x - dw / 2);
    const top = Math.round(soldier.y - dh / 2);
    const foot = top + dh;
    const data = sheet.data;
    const flash = soldier.flash > 0;
    for (let dy = 0; dy < dh; dy += 1) {
      const sy = Math.min(fh - 1, Math.floor((dy * fh) / dh));
      const destY = top + dy;
      let runX = 0;
      let runW = 0;
      let runColor = 0;
      const flush = (): void => {
        if (runW <= 0) return;
        gfx.fillStyle(runColor, 1);
        gfx.fillRect(runX, destY, runW, 1);
        runW = 0;
      };
      for (let dx = 0; dx < dw; dx += 1) {
        const sx = Math.min(fw - 1, Math.floor((dx * fw) / dw));
        const srcX = pose.flip ? fw - 1 - sx : sx;
        const i = (sy * sheetW + pose.frame * fw + srcX) * 4;
        if ((data[i + 3] ?? 0) < 16) {
          flush();
          continue;
        }
        if (pointHidden(left + dx + 0.5, destY + 0.5, foot, covers)) {
          flush();
          continue;
        }
        const color = flash ? palette.ink : ((data[i] ?? 0) << 16) | ((data[i + 1] ?? 0) << 8) | (data[i + 2] ?? 0);
        const x = left + dx;
        if (runW > 0 && color === runColor && x === runX + runW) runW += 1;
        else {
          flush();
          runX = x;
          runW = 1;
          runColor = color;
        }
      }
      flush();
    }
  }

  private fallback(gfx: Phaser.GameObjects.Graphics, soldier: Soldier, covers: readonly Cover[]): void {
    const body = centerBox(soldier.x, soldier.y, soldier.w, soldier.h);
    if (pointHidden(soldier.x, soldier.y, this.foot(soldier), covers)) return;
    gfx.fillStyle(soldier.flash > 0 ? palette.ink : palette.enemy, 1);
    gfx.fillRect(body.left, body.top, soldier.w, soldier.h);
  }
}

function sideLanes(groups: readonly InfantryGroup[]): SideLane[] {
  return (['left', 'right'] as const).flatMap((from) => {
    const side = groups.filter((group) => group.from === from);
    const first = side[0];
    if (!first) return [];
    return [{ groups: side, index: 0, sent: 0, nextAt: waitMs(first.gap) }];
  });
}

function waitMs(span: Wait): number {
  return span.min + Math.random() * (span.max - span.min);
}
