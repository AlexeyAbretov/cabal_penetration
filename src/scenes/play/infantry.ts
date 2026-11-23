import Phaser from 'phaser';
import { centerBox, circleHitsRect, flightSample, type FlightArrival, type FlightBlock, type HitBox } from '../../combat';
import { frame, grenade, infantry, palette, volley } from '../../constants';
import { scaleHp } from '../../difficulty';
import { pointHidden, shotReaches, type Cover } from '../../cover';
import { infantrySheet } from '../../infantrySheet';
import { belowHorizon, fieldScale, wallTopY, type FrameLayout } from '../../layout';
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

type Corpse = {
  lane: number;
  rx: number;
  flip: boolean;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Момент смерти по часам пехоты. */
  born: number;
};

type Shot = {
  column: number;
  elapsed: number;
  travelMs: number;
  fromX: number;
  fromY: number;
  /** Горизонталь цели в момент выстрела. Середина колонки сюда не подставляется. */
  aimX: number;
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
 * Убитый лежит трупом на той же глубине три секунды, затем пропадает вместе с лужей.
 * Лужа — фигура под клеткой трупа. В попадание и в предел шести она не входит.
 */
export class Infantry {
  private readonly lanes: SideLane[];
  private units: Soldier[] = [];
  private corpses: Corpse[] = [];
  private incoming: Shot[] = [];
  private clock = 0;
  private frozen = false;
  /** Где стоял солдат, когда пехота шагала. Пуля открытой колонки целится сюда. */
  private playerX = 0;
  private pixels: ImageData | null = null;
  /** Непрозрачный край клетки. Пустая кромка кадра в удар не входит. */
  private readonly ink = new Map<number, { x0: number; y0: number; x1: number; y1: number }>();
  /** Уже уменьшенные клетки: кадр, зеркало и размер. */
  private readonly cells = new Map<string, ImageData>();
  private readonly scene: Phaser.Scene;
  private readonly bodies: Phaser.GameObjects.Graphics;
  private readonly sparks: Sparks;
  private readonly onKill: (points: number) => void;
  private readonly hpMul: number;

  constructor(
    scene: Phaser.Scene,
    groups: readonly InfantryGroup[],
    sparks: Sparks,
    onKill: (points: number) => void,
    hpMul = 1,
  ) {
    this.scene = scene;
    this.lanes = sideLanes(groups);
    this.sparks = sparks;
    this.onKill = onKill;
    this.hpMul = hpMul;
    this.bodies = scene.add.graphics().setDepth(3);
  }

  freeze(): void {
    this.frozen = true;
    this.incoming.length = 0;
  }

  bind(view: FrameLayout): void {
    this.place(view);
  }

  step(delta: number, playerColumn: number, view: FrameLayout, columns: FrontWall, playerX: number): void {
    this.playerX = playerX;
    if (!this.frozen) {
      this.clock += delta;
      for (const soldier of this.units) this.advance(soldier, delta, playerColumn, view, columns);
      this.units = this.units.filter((soldier) => soldier.alive);
      this.corpses = this.corpses.filter((corpse) => this.clock - corpse.born < infantry.corpseMs);
      this.spawn();
    }
    this.place(view);
  }

  /**
   * Пули, которые в этом кадре дошли до колонки или раньше упёрлись в кладку.
   * Наклонный отрезок к дыре останавливает соседняя секция.
   */
  arrive(delta: number, view: FrameLayout, columns: FrontWall, blocks: readonly FlightBlock[]): FlightArrival[] {
    if (this.frozen) return [];
    const landed: FlightArrival[] = [];
    const pending: Shot[] = [];
    for (const shot of this.incoming) {
      shot.elapsed += delta;
      const to = this.flightEnd(view, columns, shot);
      const pose = flightSample(shot.fromX, shot.fromY, to.x, to.y, shot.elapsed, shot.travelMs, blocks);
      if (!pose.arrived) pending.push(shot);
      else landed.push({ ...pose, column: shot.column });
    }
    this.incoming = pending;
    return landed;
  }

  hit(box: { left: number; right: number; top: number; bottom: number }, amount: number, covers: readonly Cover[]): void {
    for (const soldier of this.units) {
      if (!soldier.alive) continue;
      const body = this.bodyBox(soldier);
      if (!shotReaches(body, box, this.foot(soldier), covers)) continue;
      this.wound(soldier, amount);
    }
    this.units = this.units.filter((soldier) => soldier.alive);
  }

  blast(x: number, y: number, covers: readonly Cover[]): void {
    const radius = grenade.blastRadius;
    for (const soldier of this.units) {
      if (!soldier.alive) continue;
      const body = this.bodyBox(soldier);
      if (!circleHitsRect(x, y, radius, body)) continue;
      const cx = (body.left + body.right) / 2;
      const cy = (body.top + body.bottom) / 2;
      if (pointHidden(cx, cy, this.foot(soldier), covers)) continue;
      this.wound(soldier, soldier.hp);
    }
    this.units = this.units.filter((soldier) => soldier.alive);
  }

  draw(covers: readonly Cover[]): void {
    const gfx = this.bodies;
    gfx.clear();
    const sheet = this.sheet();
    const marks: ({ y: number; soldier: Soldier } | { y: number; corpse: Corpse })[] = [
      ...this.units.map((soldier) => ({ y: soldier.y, soldier })),
      ...this.corpses.map((corpse) => ({ y: corpse.y, corpse })),
    ];
    marks.sort((a, b) => a.y - b.y);
    for (const mark of marks) {
      if ('corpse' in mark) {
        this.puddle(gfx, mark.corpse, covers);
        if (sheet) this.stampCorpse(gfx, sheet, mark.corpse, covers);
        else this.fallbackCorpse(gfx, mark.corpse, covers);
      } else if (sheet) this.stamp(gfx, sheet, mark.soldier, covers);
      else this.fallback(gfx, mark.soldier, covers);
    }
  }

  drawBullets(
    gfx: Phaser.GameObjects.Graphics,
    view: FrameLayout,
    columns: FrontWall,
    blocks: readonly FlightBlock[],
  ): void {
    for (const shot of this.incoming) {
      const to = this.flightEnd(view, columns, shot);
      const pose = flightSample(shot.fromX, shot.fromY, to.x, to.y, shot.elapsed, shot.travelMs, blocks);
      const x = pose.x;
      const y = pose.y;
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
      hp: scaleHp(infantry.hp, this.hpMul),
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
      this.launch(soldier, view, columns);
      soldier.phase = 'burst';
      soldier.wait = infantry.muzzleMs;
      return;
    }
    if (soldier.phase === 'burst') {
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
    const to = columns.impact(view, soldier.column, { column: soldier.column, x: this.playerX });
    const dist = Math.hypot(to.x - soldier.x, to.y - soldier.y);
    const span = view.width / frame.width;
    const travelMs = Math.max(volley.minTravelMs, (dist / (volley.speed * span)) * 1000);
    this.incoming.push({
      column: soldier.column,
      elapsed: 0,
      travelMs,
      fromX: soldier.x,
      fromY: soldier.y - soldier.h * 0.15,
      aimX: to.x,
    });
  }

  /** Высота следует за стеной. По горизонтали пуля держит тело, в которое целились. */
  private flightEnd(view: FrameLayout, columns: FrontWall, shot: Shot): { x: number; y: number } {
    return columns.impact(view, shot.column, { column: shot.column, x: shot.aimX });
  }

  private wound(soldier: Soldier, amount: number): void {
    if (!soldier.alive || amount <= 0) return;
    const mark = this.bodyBox(soldier);
    const x = (mark.left + mark.right) / 2;
    const y = (mark.top + mark.bottom) / 2;
    soldier.hp -= amount;
    if (soldier.hp > 0) {
      soldier.flash = 70;
      this.sparks.add(x, y, 80, 'pop');
      return;
    }
    soldier.alive = false;
    this.corpses.push(this.remains(soldier));
    this.sparks.add(x, y, 160, 'land');
    this.onKill(soldier.score);
  }

  private remains(soldier: Soldier): Corpse {
    const u = soldier.moveT >= 1 ? 1 : 1 - (1 - soldier.moveT) * (1 - soldier.moveT);
    return {
      lane: soldier.lane,
      rx: soldier.sx + (soldier.tx - soldier.sx) * u,
      flip: soldier.heading < 0,
      x: soldier.x,
      y: soldier.y,
      w: soldier.w,
      h: soldier.h,
      born: this.clock,
    };
  }

  private place(view: FrameLayout): void {
    const field = view.field;
    const ceiling = wallTopY(view.track);
    for (const soldier of this.units) {
      const u = soldier.moveT >= 1 ? 1 : 1 - (1 - soldier.moveT) * (1 - soldier.moveT);
      const rx = soldier.sx + (soldier.tx - soldier.sx) * u;
      // Та же шкала, что у домов: доля опорного поля от горизонта.
      // Лишняя высота окна остаётся впереди и полосу не опускает.
      let y = field.y + belowHorizon(soldier.lane, field);
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
    for (const corpse of this.corpses) this.placeCorpse(corpse, field, ceiling);
  }

  private placeCorpse(corpse: Corpse, field: FrameLayout['field'], ceiling: number): void {
    let y = field.y + belowHorizon(corpse.lane, field);
    let scale = fieldScale(y, field);
    const maxY = ceiling - (infantry.height * scale) / 2 - 6;
    if (y > maxY) {
      y = maxY;
      scale = fieldScale(y, field);
    }
    corpse.x = field.x + corpse.rx * field.width;
    corpse.y = y;
    corpse.w = infantry.width * scale;
    corpse.h = infantry.height * scale;
  }

  private foot(soldier: Soldier): number {
    return soldier.y + soldier.h / 2;
  }

  /** Прямоугольник непрозрачных пикселей текущей клетки. Пустая кромка кадра удар не берёт. */
  private bodyBox(soldier: Soldier): HitBox {
    const pose = this.pose(soldier);
    const sheet = this.sheet();
    const depth = soldier.h / infantry.height;
    const dh = Math.max(1, Math.round(infantrySheet.frameHeight * depth));
    const dw = Math.max(1, Math.round((dh * infantrySheet.frameWidth) / infantrySheet.frameHeight));
    const foot = this.foot(soldier);
    const left = soldier.x - dw / 2;
    const top = foot - dh;
    const ink = sheet ? this.frameInk(sheet, pose.frame) : null;
    if (!ink) return centerBox(soldier.x, soldier.y, soldier.w, soldier.h);
    const fw = infantrySheet.frameWidth;
    const x0 = pose.flip ? fw - 1 - ink.x1 : ink.x0;
    const x1 = pose.flip ? fw - 1 - ink.x0 : ink.x1;
    return {
      left: left + (x0 / fw) * dw,
      right: left + ((x1 + 1) / fw) * dw,
      top: top + (ink.y0 / infantrySheet.frameHeight) * dh,
      bottom: top + ((ink.y1 + 1) / infantrySheet.frameHeight) * dh,
    };
  }

  private frameInk(
    sheet: ImageData,
    frame: number,
  ): { x0: number; y0: number; x1: number; y1: number } | null {
    const cached = this.ink.get(frame);
    if (cached) return cached;
    const fw = infantrySheet.frameWidth;
    const fh = infantrySheet.frameHeight;
    const origin = frame * fw;
    let x0: number = fw;
    let y0: number = fh;
    let x1 = -1;
    let y1 = -1;
    for (let y = 0; y < fh; y += 1) {
      for (let x = 0; x < fw; x += 1) {
        const i = (y * sheet.width + origin + x) * 4;
        if ((sheet.data[i + 3] ?? 0) < 16) continue;
        if (x < x0) x0 = x;
        if (y < y0) y0 = y;
        if (x > x1) x1 = x;
        if (y > y1) y1 = y;
      }
    }
    if (x1 < 0) return null;
    const box = { x0, y0, x1, y1 };
    this.ink.set(frame, box);
    return box;
  }

  private pose(soldier: Soldier): { frame: number; flip: boolean } {
    if (soldier.phase === 'run') {
      return { frame: Math.floor(soldier.anim / 120) % infantrySheet.run, flip: soldier.heading < 0 };
    }
    return { frame: soldier.phase === 'burst' ? infantrySheet.fire : infantrySheet.aim, flip: false };
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
    this.paint(gfx, sheet, pose.frame, pose.flip, soldier.flash > 0, soldier.x, soldier.h, this.foot(soldier), covers);
  }

  private paint(
    gfx: Phaser.GameObjects.Graphics,
    sheet: ImageData,
    frame: number,
    flip: boolean,
    flash: boolean,
    x: number,
    height: number,
    sole: number,
    covers: readonly Cover[],
  ): void {
    const depth = height / infantry.height;
    const dh = Math.max(1, Math.round(infantrySheet.frameHeight * depth));
    const dw = Math.max(1, Math.round((dh * infantrySheet.frameWidth) / infantrySheet.frameHeight));
    const cell = this.cell(sheet, frame, flip, dw, dh);
    const data = cell.data;
    const foot = Math.round(sole);
    const left = Math.round(x - dw / 2);
    const top = foot - dh;
    for (let dy = 0; dy < dh; dy += 1) {
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
        const i = (dy * dw + dx) * 4;
        if ((data[i + 3] ?? 0) < 16) {
          flush();
          continue;
        }
        if (pointHidden(left + dx + 0.5, destY + 0.5, foot, covers)) {
          flush();
          continue;
        }
        const color = flash ? palette.ink : ((data[i] ?? 0) << 16) | ((data[i + 1] ?? 0) << 8) | (data[i + 2] ?? 0);
        const px = left + dx;
        if (runW > 0 && color === runColor && px === runX + runW) runW += 1;
        else {
          flush();
          runX = px;
          runW = 1;
          runColor = color;
        }
      }
      flush();
    }
  }

  /** Клетка в экранный размер. Пиксели площади усредняются, прозрачный край цвет не тянет. */
  private cell(sheet: ImageData, frame: number, flip: boolean, dw: number, dh: number): ImageData {
    const key = `${frame}:${flip ? 1 : 0}:${dw}x${dh}`;
    const cached = this.cells.get(key);
    if (cached) return cached;
    const scaled = scaleCell(sheet, frame, flip, dw, dh);
    this.cells.set(key, scaled);
    return scaled;
  }

  private fallback(gfx: Phaser.GameObjects.Graphics, soldier: Soldier, covers: readonly Cover[]): void {
    const body = centerBox(soldier.x, soldier.y, soldier.w, soldier.h);
    if (pointHidden(soldier.x, soldier.y, this.foot(soldier), covers)) return;
    gfx.fillStyle(soldier.flash > 0 ? palette.ink : palette.enemy, 1);
    gfx.fillRect(body.left, body.top, soldier.w, soldier.h);
  }

  private stampCorpse(
    gfx: Phaser.GameObjects.Graphics,
    sheet: ImageData,
    corpse: Corpse,
    covers: readonly Cover[],
  ): void {
    this.paint(gfx, sheet, infantrySheet.dead, corpse.flip, false, corpse.x, corpse.h, this.sole(corpse), covers);
  }

  private fallbackCorpse(gfx: Phaser.GameObjects.Graphics, corpse: Corpse, covers: readonly Cover[]): void {
    const foot = this.sole(corpse);
    const dh = Math.max(2, Math.round(corpse.h * 0.28));
    const dw = Math.max(4, Math.round(corpse.w * 0.9));
    const left = Math.round(corpse.x - dw / 2);
    const top = foot - dh;
    if (pointHidden(corpse.x, top + dh / 2, foot, covers)) return;
    gfx.fillStyle(palette.enemyShade, 1);
    gfx.fillRect(left, top, dw, dh);
  }

  /** Лужа на земле. Дальний дом закрывает её так же, как тело. */
  private puddle(gfx: Phaser.GameObjects.Graphics, corpse: Corpse, covers: readonly Cover[]): void {
    const dh = Math.max(1, Math.round(corpse.h));
    const dw = Math.max(1, Math.round((dh * infantrySheet.frameWidth) / infantrySheet.frameHeight));
    const foot = this.sole(corpse);
    const cx = Math.round(corpse.x);
    const cy = foot - Math.max(1, Math.round(dh * 0.12));
    this.ellipse(gfx, cx, cy, Math.max(3, Math.round(dw * 0.48)), Math.max(2, Math.round(dh * 0.16)), palette.bloodDeep, foot, covers);
    this.ellipse(gfx, cx, cy, Math.max(2, Math.round(dw * 0.3)), Math.max(1, Math.round(dh * 0.09)), palette.blood, foot, covers);
  }

  private ellipse(
    gfx: Phaser.GameObjects.Graphics,
    cx: number,
    cy: number,
    rx: number,
    ry: number,
    color: number,
    foot: number,
    covers: readonly Cover[],
  ): void {
    gfx.fillStyle(color, 1);
    for (let dy = -ry; dy <= ry; dy += 1) {
      const span = 1 - (dy * dy) / (ry * ry);
      if (span <= 0) continue;
      const half = Math.round(rx * Math.sqrt(span));
      const y = cy + dy;
      let runX = 0;
      let runW = 0;
      const flush = (): void => {
        if (runW <= 0) return;
        gfx.fillRect(runX, y, runW, 1);
        runW = 0;
      };
      for (let dx = -half; dx <= half; dx += 1) {
        const x = cx + dx;
        if (pointHidden(x + 0.5, y + 0.5, foot, covers)) {
          flush();
          continue;
        }
        if (runW > 0) runW += 1;
        else {
          runX = x;
          runW = 1;
        }
      }
      flush();
    }
  }

  private sole(corpse: Corpse): number {
    return corpse.y + corpse.h / 2;
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

/** Ужимает клетку листа. Цвет — среднее непрозрачных пикселей площади, не один угол. */
function scaleCell(sheet: ImageData, frame: number, flip: boolean, dw: number, dh: number): ImageData {
  const fw = infantrySheet.frameWidth;
  const fh = infantrySheet.frameHeight;
  const sheetW = fw * infantrySheet.frames;
  const src = sheet.data;
  const out = new Uint8ClampedArray(dw * dh * 4);
  for (let dy = 0; dy < dh; dy += 1) {
    const y0 = (dy * fh) / dh;
    const y1 = ((dy + 1) * fh) / dh;
    const sy0 = Math.floor(y0);
    const sy1 = Math.min(fh - 1, Math.ceil(y1) - 1);
    for (let dx = 0; dx < dw; dx += 1) {
      const x0 = (dx * fw) / dw;
      const x1 = ((dx + 1) * fw) / dw;
      const sx0 = Math.floor(x0);
      const sx1 = Math.min(fw - 1, Math.ceil(x1) - 1);
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = sy0; sy <= sy1; sy += 1) {
        const wy = Math.min(sy + 1, y1) - Math.max(sy, y0);
        if (wy <= 0) continue;
        for (let sx = sx0; sx <= sx1; sx += 1) {
          const wx = Math.min(sx + 1, x1) - Math.max(sx, x0);
          if (wx <= 0) continue;
          const srcX = flip ? fw - 1 - sx : sx;
          const i = (sy * sheetW + frame * fw + srcX) * 4;
          const alpha = (src[i + 3] ?? 0) / 255;
          if (alpha <= 0) continue;
          const w = wx * wy * alpha;
          r += (src[i] ?? 0) * w;
          g += (src[i + 1] ?? 0) * w;
          b += (src[i + 2] ?? 0) * w;
          a += wx * wy * alpha;
        }
      }
      const area = (x1 - x0) * (y1 - y0);
      if (area <= 0 || (a / area) * 255 < 16) continue;
      const o = (dy * dw + dx) * 4;
      out[o] = Math.round(r / a);
      out[o + 1] = Math.round(g / a);
      out[o + 2] = Math.round(b / a);
      out[o + 3] = Math.round((a / area) * 255);
    }
  }
  return new ImageData(out, dw, dh);
}
