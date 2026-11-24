import Phaser from 'phaser';
import { centerBox, circleHitsRect, flightSample, type FlightArrival, type FlightBlock, type HitBox } from '../../combat';
import { frame, grenade, infantry, palette, volley } from '../../constants';
import { scaleHp } from '../../difficulty';
import { readNum, readRecord } from '../../keep';
import { pointHidden, shotReaches, type Cover } from '../../cover';
import { infantryLooks, infantrySheet, type InfantryLook } from '../../infantrySheet';
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
  /** Какой лист: новый или прежний. Труп хранит тот же номер. */
  look: number;
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
  look: number;
  /** Момент смерти по часам пехоты. */
  born: number;
  /** Граната не кладёт клетку трупа: на земле только лужа. */
  torn: boolean;
};

type Pix = { x: number; y: number; color: number };

type Dot = { dx: number; dy: number; color: number };

type LimbKind = 'head' | 'torso' | 'armL' | 'armR' | 'legL' | 'legR';

/** Кусок фигуры или капля крови. Пиксели свои, от центра. */
type Limb = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Четверть оборота, пока кусок в воздухе. На земле замирает. */
  quarter: number;
  tumble: number;
  spin: -1 | 1;
  pixels: Dot[];
  life: number;
  max: number;
  /** Подошва в момент смерти: глубина для закрытия и земля, куда падает кусок. */
  foot: number;
  /** Порядок рисования — глубина бойца, не высота полёта. */
  sortY: number;
  rest: boolean;
  bounces: number;
  blood: boolean;
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
 * Пуля кладёт труп на той же глубине. Граната рвёт живую клетку на голову, руки, торс и ноги:
 * куски разлетаются, падают на эту глубину и лежат рядом с лужей. Через три секунды пропадают и труп, и куски, и лужа.
 * Лужа — фигура игры, не клетка листа. В попадание и в предел шести она не входит.
 */
export class Infantry {
  private readonly lanes: SideLane[];
  private units: Soldier[] = [];
  private corpses: Corpse[] = [];
  private limbs: Limb[] = [];
  private incoming: Shot[] = [];
  private clock = 0;
  private frozen = false;
  /** Где стоял солдат, когда пехота шагала. Пуля открытой колонки целится сюда. */
  private playerX = 0;
  private readonly pixels = new Map<number, ImageData>();
  /** Непрозрачный край клетки. Пустая кромка кадра в удар не входит. */
  private readonly ink = new Map<string, { x0: number; y0: number; x1: number; y1: number }>();
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

  note(): {
    clock: number;
    lanes: { index: number; sent: number; nextAt: number }[];
    units: {
      hp: number;
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
      look: number;
    }[];
  } {
    return {
      clock: this.clock,
      lanes: this.lanes.map((lane) => ({ index: lane.index, sent: lane.sent, nextAt: lane.nextAt })),
      units: this.units.filter((soldier) => soldier.alive).map((soldier) => ({
        hp: soldier.hp,
        lane: soldier.lane,
        heading: soldier.heading,
        sx: soldier.sx,
        tx: soldier.tx,
        moveT: soldier.moveT,
        runMs: soldier.runMs,
        phase: soldier.phase,
        wait: soldier.wait,
        column: soldier.column,
        anim: soldier.anim,
        look: soldier.look,
      })),
    };
  }

  /**
   * Живые и то, что ещё не вышло. Трупы и пули в воздухе не возвращаются:
   * полоска уже помнит убитых, выстрел в полёте просто пропадает.
   */
  recall(data: unknown): void {
    const row = readRecord(data);
    if (!row) return;
    const clock = readNum(row.clock);
    if (clock !== null) this.clock = Math.max(0, clock);
    if (Array.isArray(row.lanes) && row.lanes.length === this.lanes.length) {
      row.lanes.forEach((item, index) => {
        const lane = this.lanes[index];
        const saved = readRecord(item);
        if (!lane || !saved) return;
        const at = readNum(saved.index);
        const sent = readNum(saved.sent);
        const nextAt = readNum(saved.nextAt);
        if (at !== null) lane.index = Math.min(lane.groups.length, Math.max(0, Math.floor(at)));
        if (sent !== null) lane.sent = Math.max(0, Math.floor(sent));
        if (nextAt !== null) lane.nextAt = Math.max(0, nextAt);
      });
    }
    if (!Array.isArray(row.units)) return;
    const units: Soldier[] = [];
    for (const item of row.units) {
      if (units.length >= infantry.cap) break;
      const saved = readRecord(item);
      if (!saved) continue;
      const hp = readNum(saved.hp);
      const lane = readNum(saved.lane);
      const sx = readNum(saved.sx);
      const tx = readNum(saved.tx);
      const moveT = readNum(saved.moveT);
      const runMs = readNum(saved.runMs);
      if (hp === null || hp <= 0 || lane === null || sx === null || tx === null || moveT === null || runMs === null) {
        continue;
      }
      const look = readNum(saved.look);
      const wait = readNum(saved.wait);
      const column = readNum(saved.column);
      const anim = readNum(saved.anim);
      units.push({
        alive: true,
        hp,
        score: infantry.score,
        flash: 0,
        lane,
        heading: saved.heading === -1 ? -1 : 1,
        sx,
        tx,
        moveT: Math.min(1, Math.max(0, moveT)),
        runMs: Math.max(1, runMs),
        phase: phaseOf(saved.phase),
        wait: wait === null ? 0 : Math.max(0, wait),
        column: column === null ? 0 : Math.max(0, Math.floor(column)),
        anim: anim === null ? 0 : Math.max(0, anim),
        look: look === null ? 0 : Math.abs(Math.floor(look)) % infantryLooks.length,
        x: 0,
        y: 0,
        w: infantry.width,
        h: infantry.height,
      });
    }
    this.units = units;
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
      this.stepLimbs(delta);
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
      this.wound(soldier, soldier.hp, { x, y });
    }
    this.units = this.units.filter((soldier) => soldier.alive);
  }

  draw(covers: readonly Cover[]): void {
    const gfx = this.bodies;
    gfx.clear();
    const marks: ({ y: number; soldier: Soldier } | { y: number; corpse: Corpse } | { y: number; limb: Limb })[] = [
      ...this.units.map((soldier) => ({ y: soldier.y, soldier })),
      ...this.corpses.map((corpse) => ({ y: corpse.y, corpse })),
      ...this.limbs.map((limb) => ({ y: limb.sortY, limb })),
    ];
    marks.sort((a, b) => a.y - b.y);
    for (const mark of marks) {
      if ('limb' in mark) {
        this.paintLimb(gfx, mark.limb, covers);
      } else if ('corpse' in mark) {
        this.puddle(gfx, mark.corpse, covers);
        if (mark.corpse.torn) continue;
        const sheet = this.sheet(mark.corpse.look);
        if (sheet) this.stampCorpse(gfx, sheet, mark.corpse, covers);
        else this.fallbackCorpse(gfx, mark.corpse, covers);
      } else {
        const sheet = this.sheet(mark.soldier.look);
        if (sheet) this.stamp(gfx, sheet, mark.soldier, covers);
        else this.fallback(gfx, mark.soldier, covers);
      }
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
      look: Math.floor(Math.random() * infantryLooks.length),
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

  private wound(soldier: Soldier, amount: number, blast?: { x: number; y: number }): void {
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
    this.corpses.push(this.remains(soldier, blast !== undefined));
    if (blast) this.tear(soldier, blast);
    else this.sparks.add(x, y, 160, 'land');
    this.onKill(soldier.score);
  }

  private remains(soldier: Soldier, torn: boolean): Corpse {
    const u = soldier.moveT >= 1 ? 1 : 1 - (1 - soldier.moveT) * (1 - soldier.moveT);
    return {
      lane: soldier.lane,
      rx: soldier.sx + (soldier.tx - soldier.sx) * u,
      flip: soldier.heading < 0,
      x: soldier.x,
      y: soldier.y,
      w: soldier.w,
      h: soldier.h,
      look: soldier.look,
      born: this.clock,
      torn,
    };
  }

  /** Живая клетка рвётся по телу. Вспышка у дула в куски не входит: берётся стойка. */
  private tear(soldier: Soldier, blast: { x: number; y: number }): void {
    const spec = this.look(soldier.look);
    const sheet = this.sheet(soldier.look);
    const pose = this.pose(soldier);
    const frame = soldier.phase === 'burst' ? spec.aim : pose.frame;
    const dots = sheet
      ? this.frameDots(sheet, spec, frame, pose.flip, soldier)
      : this.blockDots(soldier);
    const foot = this.foot(soldier);
    for (const part of carve(dots)) {
      this.limbs.push(limbOf(part, blast, foot, soldier.y, infantry.corpseMs));
    }
    this.spray(soldier.x, (this.bodyBox(soldier).top + foot) / 2, foot, soldier.y);
  }

  private frameDots(
    sheet: ImageData,
    spec: InfantryLook,
    frame: number,
    flip: boolean,
    soldier: Soldier,
  ): Pix[] {
    const fw = spec.frameWidth;
    const fh = spec.frameHeight;
    const foot = Math.round(this.foot(soldier));
    const left = Math.round(soldier.x - fw / 2);
    const top = foot - fh;
    const dots: Pix[] = [];
    for (let dy = 0; dy < fh; dy += 1) {
      for (let dx = 0; dx < fw; dx += 1) {
        const srcX = flip ? fw - 1 - dx : dx;
        const i = (dy * sheet.width + frame * fw + srcX) * 4;
        if ((sheet.data[i + 3] ?? 0) < 16) continue;
        const color = ((sheet.data[i] ?? 0) << 16) | ((sheet.data[i + 1] ?? 0) << 8) | (sheet.data[i + 2] ?? 0);
        dots.push({ x: left + dx, y: top + dy, color });
      }
    }
    return dots;
  }

  /** Нет листа — зелёный прямоугольник режется теми же долями. */
  private blockDots(soldier: Soldier): Pix[] {
    const spec = this.look(soldier.look);
    const fw = spec.frameWidth;
    const fh = spec.frameHeight;
    const foot = Math.round(this.foot(soldier));
    const left = Math.round(soldier.x - fw / 2);
    const top = foot - fh;
    const bodyLeft = left + Math.round(fw * 0.28);
    const bodyRight = left + Math.round(fw * 0.72);
    const dots: Pix[] = [];
    for (let y = top + Math.round(fh * 0.08); y < top + Math.round(fh * 0.92); y += 1) {
      const band = (y - top) / fh;
      const color = band < 0.28 ? palette.ink : band > 0.66 ? palette.enemyShade : palette.enemy;
      for (let x = bodyLeft; x < bodyRight; x += 1) dots.push({ x, y, color });
    }
    return dots;
  }

  private spray(x: number, y: number, foot: number, sortY: number): void {
    for (let i = 0; i < 14; i += 1) {
      const ang = -Math.PI * (0.12 + Math.random() * 0.76);
      const speed = 40 + Math.random() * 120;
      const life = 480 + Math.random() * 360;
      const thick = Math.random() < 0.35;
      const color = Math.random() < 0.45 ? palette.bloodDeep : palette.blood;
      const pixels: Dot[] = [{ dx: 0, dy: 0, color }];
      if (thick) pixels.push({ dx: 1, dy: 0, color });
      this.limbs.push({
        x: x + (Math.random() - 0.5) * 6,
        y: y + (Math.random() - 0.5) * 4,
        vx: Math.cos(ang) * speed,
        vy: Math.sin(ang) * speed,
        quarter: 0,
        tumble: 0,
        spin: 1,
        pixels,
        life,
        max: life,
        foot,
        sortY,
        rest: false,
        bounces: 0,
        blood: true,
      });
    }
  }

  private stepLimbs(delta: number): void {
    const dt = delta / 1000;
    const next: Limb[] = [];
    for (const limb of this.limbs) {
      limb.life -= delta;
      if (limb.life <= 0) continue;
      if (!limb.rest) {
        limb.vy += 920 * dt;
        limb.x += limb.vx * dt;
        limb.y += limb.vy * dt;
        if (!limb.blood) {
          limb.tumble += delta;
          if (limb.tumble >= 80) {
            const steps = Math.floor(limb.tumble / 80);
            limb.tumble -= steps * 80;
            limb.quarter = (limb.quarter + steps * limb.spin) & 3;
          }
        }
        const drop = lowest(limb.pixels, limb.quarter);
        if (limb.y + drop >= limb.foot && limb.vy > 0) {
          limb.y = limb.foot - drop;
          limb.bounces += 1;
          if (limb.bounces >= 2 || limb.blood) {
            limb.rest = true;
            limb.vx = 0;
            limb.vy = 0;
          } else {
            limb.vy *= -0.32;
            limb.vx *= 0.55;
          }
        }
      }
      next.push(limb);
    }
    this.limbs = next;
  }

  private paintLimb(gfx: Phaser.GameObjects.Graphics, limb: Limb, covers: readonly Cover[]): void {
    const alpha = limb.blood ? Math.max(0, limb.life / limb.max) : limb.life < 400 ? Math.max(0, limb.life / 400) : 1;
    if (alpha <= 0) return;
    const rows = new Map<number, { x: number; color: number }[]>();
    for (const p of limb.pixels) {
      const spun = turn(p.dx, p.dy, limb.quarter);
      const x = Math.round(limb.x + spun.x);
      const y = Math.round(limb.y + spun.y);
      if (pointHidden(x + 0.5, y + 0.5, limb.foot, covers)) continue;
      const row = rows.get(y);
      const dot = { x, color: p.color };
      if (row) row.push(dot);
      else rows.set(y, [dot]);
    }
    for (const [y, row] of rows) {
      row.sort((a, b) => a.x - b.x);
      let runX = 0;
      let runW = 0;
      let runColor = 0;
      const flush = (): void => {
        if (runW <= 0) return;
        gfx.fillStyle(runColor, alpha);
        gfx.fillRect(runX, y, runW, 1);
        runW = 0;
      };
      for (const px of row) {
        if (runW > 0 && px.color === runColor && px.x === runX + runW) runW += 1;
        else {
          flush();
          runX = px.x;
          runW = 1;
          runColor = px.color;
        }
      }
      flush();
    }
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
    const look = this.look(soldier.look);
    const sheet = this.sheet(soldier.look);
    const dh = look.frameHeight;
    const dw = look.frameWidth;
    const foot = this.foot(soldier);
    const left = soldier.x - dw / 2;
    const top = foot - dh;
    const ink = sheet ? this.frameInk(sheet, soldier.look, pose.frame) : null;
    if (!ink) return centerBox(soldier.x, soldier.y, soldier.w, soldier.h);
    const fw = look.frameWidth;
    const x0 = pose.flip ? fw - 1 - ink.x1 : ink.x0;
    const x1 = pose.flip ? fw - 1 - ink.x0 : ink.x1;
    return {
      left: left + (x0 / fw) * dw,
      right: left + ((x1 + 1) / fw) * dw,
      top: top + (ink.y0 / look.frameHeight) * dh,
      bottom: top + ((ink.y1 + 1) / look.frameHeight) * dh,
    };
  }

  private frameInk(
    sheet: ImageData,
    look: number,
    frame: number,
  ): { x0: number; y0: number; x1: number; y1: number } | null {
    const key = `${look}:${frame}`;
    const cached = this.ink.get(key);
    if (cached) return cached;
    const spec = this.look(look);
    const fw = spec.frameWidth;
    const fh = spec.frameHeight;
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
    this.ink.set(key, box);
    return box;
  }

  private look(index: number): InfantryLook {
    return infantryLooks[index] ?? infantrySheet;
  }

  private pose(soldier: Soldier): { frame: number; flip: boolean } {
    const spec = this.look(soldier.look);
    if (soldier.phase === 'run') {
      return { frame: Math.floor(soldier.anim / 120) % spec.run, flip: soldier.heading < 0 };
    }
    return { frame: soldier.phase === 'burst' ? spec.fire : spec.aim, flip: false };
  }

  private sheet(index: number): ImageData | null {
    const cached = this.pixels.get(index);
    if (cached) return cached;
    const spec = this.look(index);
    if (!this.scene.textures.exists(spec.key)) return null;
    const source = this.scene.textures.get(spec.key).getSourceImage() as CanvasImageSource;
    const width = spec.frameWidth * spec.frames;
    const height = spec.frameHeight;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(source, 0, 0);
    const data = ctx.getImageData(0, 0, width, height);
    this.pixels.set(index, data);
    return data;
  }

  /** Пиксели листа. Клетка ближнего объекта не рисуется: дом остаётся поверх бойца. */
  private stamp(
    gfx: Phaser.GameObjects.Graphics,
    sheet: ImageData,
    soldier: Soldier,
    covers: readonly Cover[],
  ): void {
    const pose = this.pose(soldier);
    const spec = this.look(soldier.look);
    this.paint(gfx, sheet, spec, pose.frame, pose.flip, soldier.flash > 0, soldier.x, this.foot(soldier), covers);
  }

  private paint(
    gfx: Phaser.GameObjects.Graphics,
    sheet: ImageData,
    spec: InfantryLook,
    frame: number,
    flip: boolean,
    flash: boolean,
    x: number,
    sole: number,
    covers: readonly Cover[],
  ): void {
    const fw = spec.frameWidth;
    const fh = spec.frameHeight;
    const foot = Math.round(sole);
    const left = Math.round(x - fw / 2);
    const top = foot - fh;
    const sheetW = sheet.width;
    for (let dy = 0; dy < fh; dy += 1) {
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
      for (let dx = 0; dx < fw; dx += 1) {
        const srcX = flip ? fw - 1 - dx : dx;
        const i = (dy * sheetW + frame * fw + srcX) * 4;
        if ((sheet.data[i + 3] ?? 0) < 16) {
          flush();
          continue;
        }
        if (pointHidden(left + dx + 0.5, destY + 0.5, foot, covers)) {
          flush();
          continue;
        }
        const color = flash ? palette.ink : ((sheet.data[i] ?? 0) << 16) | ((sheet.data[i + 1] ?? 0) << 8) | (sheet.data[i + 2] ?? 0);
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
    const spec = this.look(corpse.look);
    this.paint(gfx, sheet, spec, spec.dead, corpse.flip, false, corpse.x, this.sole(corpse), covers);
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
    const spec = this.look(corpse.look);
    const dh = spec.frameHeight;
    const dw = spec.frameWidth;
    const foot = this.sole(corpse);
    const cx = Math.round(corpse.x);
    const cy = foot - Math.max(1, Math.round(dh * 0.12));
    const spread = corpse.torn ? 1.45 : 1;
    this.ellipse(gfx, cx, cy, Math.max(3, Math.round(dw * 0.48 * spread)), Math.max(2, Math.round(dh * 0.16 * spread)), palette.bloodDeep, foot, covers);
    this.ellipse(gfx, cx, cy, Math.max(2, Math.round(dw * 0.3 * spread)), Math.max(1, Math.round(dh * 0.09 * spread)), palette.blood, foot, covers);
    if (!corpse.torn) return;
    this.ellipse(gfx, cx - Math.round(dw * 0.28), cy + 1, Math.max(2, Math.round(dw * 0.16)), Math.max(1, Math.round(dh * 0.08)), palette.blood, foot, covers);
    this.ellipse(gfx, cx + Math.round(dw * 0.32), cy, Math.max(2, Math.round(dw * 0.14)), Math.max(1, Math.round(dh * 0.07)), palette.bloodDeep, foot, covers);
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

type Part = { kind: LimbKind; dots: Pix[] };

/** Доли роста: голова, руки с торсом, ноги. Узкий край сливается с соседом, а не летит крошкой. */
function carve(dots: Pix[]): Part[] {
  const first = dots[0];
  if (!first) return [];
  let minX = first.x;
  let maxX = first.x;
  let minY = first.y;
  let maxY = first.y;
  for (const dot of dots) {
    if (dot.x < minX) minX = dot.x;
    if (dot.x > maxX) maxX = dot.x;
    if (dot.y < minY) minY = dot.y;
    if (dot.y > maxY) maxY = dot.y;
  }
  const width = maxX - minX + 1;
  const height = maxY - minY + 1;
  const headY = minY + height * 0.3;
  const legY = minY + height * 0.64;
  const mid = (minX + maxX) / 2;
  const arm = Math.max(2, width * 0.22);
  const bins: Record<LimbKind, Pix[]> = { head: [], torso: [], armL: [], armR: [], legL: [], legR: [] };
  for (const dot of dots) {
    if (dot.y < headY) {
      if (dot.x < mid - arm) bins.armL.push(dot);
      else if (dot.x > mid + arm) bins.armR.push(dot);
      else bins.head.push(dot);
    } else if (dot.y >= legY) {
      if (dot.x < mid) bins.legL.push(dot);
      else bins.legR.push(dot);
    } else if (dot.x < mid - arm) bins.armL.push(dot);
    else if (dot.x > mid + arm) bins.armR.push(dot);
    else bins.torso.push(dot);
  }
  absorb(bins.armL, bins.torso, 3);
  absorb(bins.armR, bins.torso, 3);
  if (bins.legL.length < 3) absorb(bins.legL, bins.legR, 3);
  else if (bins.legR.length < 3) absorb(bins.legR, bins.legL, 3);
  absorb(bins.legL, bins.torso, 3);
  absorb(bins.legR, bins.torso, 3);
  absorb(bins.head, bins.torso, 3);
  seam(bins.head, (dot) => dot.y >= headY - 1);
  seam(bins.legL, (dot) => dot.y <= legY);
  seam(bins.legR, (dot) => dot.y <= legY);
  seam(bins.armL, (dot) => dot.x >= mid - arm - 1);
  seam(bins.armR, (dot) => dot.x <= mid + arm + 1);
  seam(bins.torso, (dot) => dot.y <= headY + 1 || dot.y >= legY - 1);
  const order: LimbKind[] = ['legL', 'legR', 'torso', 'armL', 'armR', 'head'];
  return order.filter((kind) => bins[kind].length >= 3).map((kind) => ({ kind, dots: bins[kind] }));
}

function absorb(small: Pix[], into: Pix[], min: number): void {
  if (small.length >= min) return;
  into.push(...small);
  small.length = 0;
}

function seam(dots: Pix[], edge: (dot: Pix) => boolean): void {
  for (const dot of dots) {
    if (edge(dot)) dot.color = palette.blood;
  }
}

function limbOf(part: Part, blast: { x: number; y: number }, foot: number, sortY: number, life: number): Limb {
  let sx = 0;
  let sy = 0;
  for (const dot of part.dots) {
    sx += dot.x;
    sy += dot.y;
  }
  const cx = sx / part.dots.length;
  const cy = sy / part.dots.length;
  const flight = kick(part.kind, cx, cy, blast);
  return {
    x: cx,
    y: cy,
    vx: flight.vx,
    vy: flight.vy,
    quarter: 0,
    tumble: 0,
    spin: Math.random() < 0.5 ? -1 : 1,
    pixels: part.dots.map((dot) => ({ dx: dot.x - cx, dy: dot.y - cy, color: dot.color })),
    life,
    max: life,
    foot,
    sortY,
    rest: false,
    bounces: 0,
    blood: false,
  };
}

function kick(kind: LimbKind, cx: number, cy: number, blast: { x: number; y: number }): { vx: number; vy: number } {
  const dx = cx - blast.x;
  const dy = cy - blast.y;
  const dist = Math.hypot(dx, dy) || 1;
  const awayX = dx / dist;
  const side = kind === 'armL' || kind === 'legL' ? -1 : kind === 'armR' || kind === 'legR' ? 1 : awayX < 0 ? -1 : 1;
  const up = kind === 'head' ? 190 : kind === 'torso' ? 80 : kind === 'armL' || kind === 'armR' ? 120 : 50;
  const wide = kind === 'head' ? 36 : kind === 'torso' ? 28 : kind === 'armL' || kind === 'armR' ? 110 : 90;
  return {
    vx: awayX * 55 + side * wide * (0.7 + Math.random() * 0.45),
    vy: -(up * (0.75 + Math.random() * 0.4)) + Math.min(0, (dy / dist) * 30),
  };
}

function lowest(pixels: readonly Dot[], quarter: number): number {
  let max = 0;
  for (const pixel of pixels) {
    const y = turn(pixel.dx, pixel.dy, quarter).y;
    if (y > max) max = y;
  }
  return max;
}

function turn(dx: number, dy: number, quarter: number): { x: number; y: number } {
  const q = quarter & 3;
  if (q === 1) return { x: -dy, y: dx };
  if (q === 2) return { x: -dx, y: -dy };
  if (q === 3) return { x: dy, y: -dx };
  return { x: dx, y: dy };
}

const phases: readonly Phase[] = ['run', 'hold', 'aim', 'burst', 'recover'];

function phaseOf(value: unknown): Phase {
  return phases.includes(value as Phase) ? (value as Phase) : 'hold';
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
