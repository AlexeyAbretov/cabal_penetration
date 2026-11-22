import Phaser from 'phaser';
import {
  centerBox,
  flightSample,
  rectsOverlap,
  type FlightArrival,
  type FlightBlock,
  type HitBox,
} from '../../combat';
import { frame, green, grenade, palette, tank, tankVolley, truck, volley, wheel } from '../../constants';
import { scaleHp } from '../../difficulty';
import { type EnemyKind, type WaveGroup } from '../../wave';
import { fieldScale, wallTopY, type FrameLayout } from '../../layout';
import type { Sparks } from './sparks';
import type { FrontWall } from './wall';

type Phase = 'run' | 'hold' | 'aim' | 'burst' | 'recover' | 'leave';

type Actor = {
  kind: EnemyKind;
  alive: boolean;
  hp: number;
  maxHp: number;
  score: number;
  flash: number;
  sx: number;
  sy: number;
  tx: number;
  ty: number;
  moveT: number;
  phase: Phase;
  wait: number;
  shotsLeft: number;
  column: number;
  x: number;
  y: number;
  w: number;
  h: number;
  baseW: number;
  baseH: number;
  runMs: number;
  holdMs: number;
  leadMs: number;
  burst: number;
  gapMs: number;
  recoverMs: number;
  /** 1 — кабина справа, грузовик едет вправо. */
  heading: -1 | 1;
  ridersLeft: number;
};

type Pocket = {
  spec: WaveGroup;
  sent: number;
};

type Incoming = {
  column: number;
  elapsed: number;
  heavy: boolean;
  travelMs: number;
  fromX: number;
  fromY: number;
};

/**
 * Волна из фиксированных точек: зелёные, два танка и грузовик.
 * Оба танка встают, дают один залп и едут дальше. Колёсный быстрее.
 * Грузовик едет поперёк, высаживает зелёных и уходит. Сам не стреляет.
 * Зелёный выпускает одну пулю из себя. Она летит в запертую колонку медленнее, чем залп танка.
 * Граната по обоим танкам и грузовику смертельна: её место не очередь в одного зелёного.
 */
export class Enemies {
  private readonly pockets: Pocket[];
  private units: Actor[] = [];
  private incoming: Incoming[] = [];
  private clock = 0;
  private frozen = false;
  private readonly bodies: Phaser.GameObjects.Graphics;
  private readonly sparks: Sparks;
  private readonly onKill: (points: number) => void;
  private readonly onRelease: (count: number) => void;
  private readonly hpMul: number;
  private readonly riders: number;
  /** Высадка в этом кадре. В список волны попадает после прохода, чтобы не шагать дважды. */
  private dropped: Actor[] = [];

  constructor(
    scene: Phaser.Scene,
    wave: readonly WaveGroup[],
    sparks: Sparks,
    onKill: (points: number) => void,
    onRelease: (count: number) => void,
    hpMul = 1,
    riders: number = truck.riders,
  ) {
    this.sparks = sparks;
    this.onKill = onKill;
    this.onRelease = onRelease;
    this.hpMul = hpMul;
    this.riders = riders;
    this.pockets = wave.map((spec) => ({ spec, sent: 0 }));
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
      this.spawn();
      for (const enemy of this.units) this.advance(enemy, delta, playerColumn, view, columns);
      if (this.dropped.length > 0) {
        this.units.push(...this.dropped);
        this.dropped.length = 0;
      }
      this.units = this.units.filter((enemy) => enemy.alive);
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
    const pending: Incoming[] = [];
    for (const shot of this.incoming) {
      shot.elapsed += delta;
      const to = columns.impact(view, shot.column);
      const pose = flightSample(shot.fromX, shot.fromY, to.x, to.y, shot.elapsed, shot.travelMs, blocks);
      if (!pose.arrived) pending.push(shot);
      else landed.push({ ...pose, column: shot.column });
    }
    this.incoming = pending;
    return landed;
  }

  /** Квадрат креста. Каждый, кто в него попал, получает удар, а не только ближний. */
  hit(box: HitBox, amount: number): void {
    for (const enemy of this.units) {
      if (!enemy.alive || !rectsOverlap(box, centerBox(enemy.x, enemy.y, enemy.w, enemy.h))) continue;
      this.wound(enemy, amount);
    }
    this.bury();
  }

  blast(x: number, y: number): void {
    for (const enemy of [...this.units]) {
      if (!enemy.alive) continue;
      if (Math.hypot(enemy.x - x, enemy.y - y) > grenade.blastRadius) continue;
      this.wound(enemy, enemy.hp);
    }
    this.bury();
  }

  draw(): void {
    this.drawBodies();
  }

  drawBullets(
    gfx: Phaser.GameObjects.Graphics,
    view: FrameLayout,
    columns: FrontWall,
    blocks: readonly FlightBlock[],
  ): void {
    for (const shot of this.incoming) {
      const to = columns.impact(view, shot.column);
      const pose = flightSample(shot.fromX, shot.fromY, to.x, to.y, shot.elapsed, shot.travelMs, blocks);
      const x = pose.x;
      const y = pose.y;
      const thick = shot.heavy ? volley.thickness + 3 : volley.thickness;
      const length = shot.heavy ? volley.length + 6 : volley.length;
      gfx.save();
      gfx.translateCanvas(x, y);
      gfx.rotateCanvas(Math.atan2(to.y - shot.fromY, to.x - shot.fromX));
      gfx.fillStyle(shot.heavy ? palette.tankBullet : palette.enemyBullet, 1);
      gfx.fillRect(-length, -thick / 2, length, thick);
      gfx.restore();
    }
  }

  private spawn(): void {
    for (const pocket of this.pockets) {
      const count = pocket.spec.composition.length;
      while (pocket.sent < count) {
        const due = pocket.spec.delayMs + pocket.sent * green.gapMs;
        if (this.clock < due) break;
        const kind = pocket.spec.composition[pocket.sent];
        this.birth(pocket.spec, pocket.sent, count, kind);
        pocket.sent += 1;
      }
    }
  }

  private birth(spec: WaveGroup, index: number, count: number, kind: EnemyKind): void {
    if (kind === 'truck') {
      this.units.push(this.truckUnit(spec));
      return;
    }
    if (kind === 'tank' || kind === 'wheel') {
      this.units.push(this.armorUnit(spec, kind));
      return;
    }
    const span = (count - 1) / 2;
    const shift = (index - span) * green.spread;
    const tx = Math.min(0.92, Math.max(0.08, spec.point.x + shift));
    const ty = Math.min(0.84, spec.point.y + green.run);
    this.units.push(this.unit(kind, spec.point.x, spec.point.y, tx, ty));
  }

  /** Заезд с края к точке волны. Точка — стоянка залпа, не место появления. */
  private armorUnit(spec: WaveGroup, kind: 'tank' | 'wheel'): Actor {
    const fromRight = spec.point.x >= 0.5;
    const startX = fromRight ? 1.14 : -0.14;
    const body = this.unit(kind, startX, spec.point.y, spec.point.x, spec.point.y);
    body.heading = fromRight ? -1 : 1;
    body.runMs = this.legMs(startX, spec.point.x, kind === 'wheel' ? wheel.speed : tank.speed);
    return body;
  }

  /** Горизонтальный заезд к точке волны. Точка — остановка, не место появления. */
  private truckUnit(spec: WaveGroup): Actor {
    const fromRight = spec.point.x >= 0.5;
    const body = this.unit('truck', fromRight ? 1.16 : -0.16, spec.point.y, spec.point.x, spec.point.y);
    body.heading = fromRight ? -1 : 1;
    body.ridersLeft = this.riders;
    body.hp = scaleHp(truck.hp, this.hpMul);
    body.maxHp = scaleHp(truck.hp, this.hpMul);
    body.score = truck.score;
    body.baseW = truck.width;
    body.baseH = truck.height;
    body.w = truck.width;
    body.h = truck.height;
    body.runMs = truck.driveMs;
    return body;
  }

  private dropRider(enemy: Actor): void {
    const pos = this.fieldPos(enemy);
    const index = this.riders - enemy.ridersLeft;
    const span = (this.riders - 1) / 2;
    const shift = (index - span) * green.spread * 0.65;
    const tx = Math.min(0.92, Math.max(0.08, pos.x + shift));
    const ty = Math.min(0.84, pos.y + green.run);
    this.dropped.push(this.unit('green', pos.x, pos.y, tx, ty));
  }

  private unit(kind: EnemyKind, sx: number, sy: number, tx: number, ty: number): Actor {
    const profile =
      kind === 'tank' || kind === 'wheel'
        ? {
            hp: tank.hp,
            score: tank.score,
            baseW: kind === 'wheel' ? wheel.width : tank.width,
            baseH: kind === 'wheel' ? wheel.height : tank.height,
            runMs: 1000,
            holdMs: kind === 'wheel' ? wheel.holdMs : tank.holdMs,
            leadMs: tankVolley.leadMs,
            burst: tankVolley.burst,
            gapMs: tankVolley.gapMs,
            recoverMs: 0,
          }
        : kind === 'truck'
          ? {
              hp: truck.hp,
              score: truck.score,
              baseW: truck.width,
              baseH: truck.height,
              runMs: truck.driveMs,
              holdMs: truck.pauseMs,
              leadMs: 0,
              burst: 0,
              gapMs: truck.dropGapMs,
              recoverMs: 0,
            }
          : {
              hp: green.hp,
              score: green.score,
              baseW: green.width,
              baseH: green.height,
              runMs: green.runMs,
              holdMs: green.holdMs,
              leadMs: volley.leadMs,
              burst: 1,
              gapMs: 0,
              recoverMs: volley.recoverMs,
            };
    return {
      kind,
      alive: true,
      hp: scaleHp(profile.hp, this.hpMul),
      maxHp: scaleHp(profile.hp, this.hpMul),
      score: profile.score,
      flash: 0,
      sx,
      sy,
      tx,
      ty,
      moveT: 0,
      phase: 'run',
      wait: 0,
      shotsLeft: 0,
      column: 0,
      x: 0,
      y: 0,
      w: profile.baseW,
      h: profile.baseH,
      baseW: profile.baseW,
      baseH: profile.baseH,
      runMs: profile.runMs,
      holdMs: profile.holdMs,
      leadMs: profile.leadMs,
      burst: profile.burst,
      gapMs: profile.gapMs,
      recoverMs: profile.recoverMs,
      heading: 1,
      ridersLeft: 0,
    };
  }

  private advance(
    enemy: Actor,
    delta: number,
    playerColumn: number,
    view: FrameLayout,
    columns: FrontWall,
  ): void {
    enemy.flash = Math.max(0, enemy.flash - delta);
    if (enemy.kind === 'truck') {
      this.advanceTruck(enemy, delta);
      return;
    }
    if (enemy.kind === 'tank' || enemy.kind === 'wheel') {
      this.advanceArmor(enemy, delta, playerColumn, view, columns);
      return;
    }
    if (enemy.phase === 'run') {
      enemy.moveT = Math.min(1, enemy.moveT + delta / enemy.runMs);
      if (enemy.moveT >= 1) {
        enemy.phase = 'hold';
        enemy.wait = enemy.holdMs;
      }
      return;
    }
    enemy.wait -= delta;
    if (enemy.wait > 0) return;
    if (enemy.phase === 'hold' || enemy.phase === 'recover') {
      enemy.phase = 'aim';
      enemy.column = playerColumn;
      enemy.wait = enemy.leadMs;
      return;
    }
    if (enemy.phase === 'aim') {
      enemy.phase = 'burst';
      enemy.shotsLeft = enemy.burst;
      enemy.wait = 0;
      return;
    }
    this.launch(enemy, false, volley.speed, view, columns);
    enemy.shotsLeft -= 1;
    if (enemy.shotsLeft > 0) {
      enemy.wait = enemy.gapMs;
      return;
    }
    enemy.phase = 'recover';
    enemy.wait = enemy.recoverMs;
  }

  /** Заезд, стоянка с высадкой, уход за край. Из стоянки в стрельбу не переходит. */
  private advanceTruck(enemy: Actor, delta: number): void {
    if (enemy.phase === 'run' || enemy.phase === 'leave') {
      enemy.moveT = Math.min(1, enemy.moveT + delta / enemy.runMs);
      if (enemy.moveT < 1) return;
      if (enemy.phase === 'leave') {
        this.dismiss(enemy);
        return;
      }
      enemy.phase = 'hold';
      enemy.wait = truck.pauseMs;
      return;
    }
    enemy.wait -= delta;
    if (enemy.wait > 0) return;
    if (enemy.ridersLeft > 0) {
      this.dropRider(enemy);
      enemy.ridersLeft -= 1;
      enemy.wait = enemy.ridersLeft > 0 ? truck.dropGapMs : truck.pauseMs;
      return;
    }
    this.driveAway(enemy);
  }

  /** Стоянка, один залп, уход. Второй очереди нет: после залпа едет дальше. */
  private advanceArmor(
    enemy: Actor,
    delta: number,
    playerColumn: number,
    view: FrameLayout,
    columns: FrontWall,
  ): void {
    if (enemy.phase === 'run' || enemy.phase === 'leave') {
      enemy.moveT = Math.min(1, enemy.moveT + delta / enemy.runMs);
      if (enemy.moveT < 1) return;
      if (enemy.phase === 'leave') {
        this.dismiss(enemy);
        return;
      }
      enemy.phase = 'hold';
      enemy.wait = enemy.holdMs;
      return;
    }
    enemy.wait -= delta;
    if (enemy.wait > 0) return;
    if (enemy.phase === 'hold') {
      enemy.phase = 'aim';
      enemy.column = playerColumn;
      enemy.wait = enemy.leadMs;
      return;
    }
    if (enemy.phase === 'aim') {
      enemy.phase = 'burst';
      enemy.shotsLeft = enemy.burst;
      enemy.wait = 0;
      return;
    }
    this.launch(enemy, true, tankVolley.speed, view, columns);
    enemy.shotsLeft -= 1;
    if (enemy.shotsLeft > 0) {
      enemy.wait = enemy.gapMs;
      return;
    }
    this.driveAway(enemy);
  }

  /** Пуля стартует из стрелка. Время полёта — от расстояния, не одно на всех. */
  private launch(
    enemy: Actor,
    heavy: boolean,
    speed: number,
    view: FrameLayout,
    columns: FrontWall,
  ): void {
    const to = columns.impact(view, enemy.column);
    const dist = Math.hypot(to.x - enemy.x, to.y - enemy.y);
    const span = view.width / frame.width;
    const travelMs = Math.max(volley.minTravelMs, (dist / (speed * span)) * 1000);
    this.incoming.push({
      column: enemy.column,
      elapsed: 0,
      heavy,
      travelMs,
      fromX: enemy.x,
      fromY: enemy.y,
    });
  }

  private driveAway(enemy: Actor): void {
    const pos = this.fieldPos(enemy);
    enemy.sx = pos.x;
    enemy.sy = pos.y;
    enemy.tx = enemy.heading > 0 ? 1.18 : -0.18;
    enemy.ty = pos.y;
    enemy.moveT = 0;
    enemy.phase = 'leave';
    if (enemy.kind === 'truck') {
      enemy.runMs = truck.driveMs;
      return;
    }
    const speed = enemy.kind === 'wheel' ? wheel.speed : tank.speed;
    enemy.runMs = this.legMs(enemy.sx, enemy.tx, speed);
  }

  /** Доля ширины поля в секунду. Короткий заезд и длинный уход занимают разное время. */
  private legMs(from: number, to: number, speed: number): number {
    return Math.max(240, (Math.abs(to - from) / speed) * 1000);
  }

  /** Уехал. Очков нет, полоска отпускает его и тех, кто так и не вышел. */
  private dismiss(enemy: Actor): void {
    if (!enemy.alive) return;
    enemy.alive = false;
    const left = 1 + enemy.ridersLeft;
    enemy.ridersLeft = 0;
    this.onRelease(left);
  }

  private fieldPos(enemy: Actor): { x: number; y: number } {
    const u = enemy.moveT >= 1 ? 1 : 1 - (1 - enemy.moveT) * (1 - enemy.moveT);
    return {
      x: enemy.sx + (enemy.tx - enemy.sx) * u,
      y: enemy.sy + (enemy.ty - enemy.sy) * u,
    };
  }

  private place(view: FrameLayout): void {
    const field = view.field;
    const ceiling = wallTopY(view.track);
    for (const enemy of this.units) {
      const u = enemy.moveT >= 1 ? 1 : 1 - (1 - enemy.moveT) * (1 - enemy.moveT);
      const rx = enemy.sx + (enemy.tx - enemy.sx) * u;
      let y = field.y + (enemy.sy + (enemy.ty - enemy.sy) * u) * field.height;
      let scale = fieldScale(y, field);
      const maxY = ceiling - (enemy.baseH * scale) / 2 - 6;
      if (y > maxY) {
        y = maxY;
        scale = fieldScale(y, field);
      }
      enemy.x = field.x + rx * field.width;
      enemy.y = y;
      enemy.w = enemy.baseW * scale;
      enemy.h = enemy.baseH * scale;
    }
  }

  private wound(enemy: Actor, amount: number): void {
    if (!enemy.alive || amount <= 0) return;
    enemy.hp -= amount;
    if (enemy.hp > 0) {
      enemy.flash = 70;
      this.sparks.add(enemy.x, enemy.y, 80, 'pop');
      return;
    }
    enemy.alive = false;
    this.sparks.add(enemy.x, enemy.y, 160, 'land');
    if (enemy.kind === 'truck' && enemy.ridersLeft > 0) {
      const left = enemy.ridersLeft;
      enemy.ridersLeft = 0;
      this.onRelease(left);
    }
    this.onKill(enemy.score);
  }

  private bury(): void {
    this.units = this.units.filter((enemy) => enemy.alive);
  }

  private drawBodies(): void {
    const gfx = this.bodies;
    gfx.clear();
    const ordered = [...this.units].sort((a, b) => a.y - b.y);
    for (const enemy of ordered) {
      if (enemy.kind === 'tank') this.drawTank(gfx, enemy);
      else if (enemy.kind === 'wheel') this.drawWheel(gfx, enemy);
      else if (enemy.kind === 'truck') this.drawTruck(gfx, enemy);
      else this.drawGreen(gfx, enemy);
    }
  }

  private drawGreen(gfx: Phaser.GameObjects.Graphics, enemy: Actor): void {
    const x = Math.round(enemy.x - enemy.w / 2);
    const y = Math.round(enemy.y - enemy.h / 2);
    const w = Math.max(1, Math.round(enemy.w));
    const h = Math.max(1, Math.round(enemy.h));
    gfx.fillStyle(palette.black, 1);
    gfx.fillRect(x - 1, y - 1, w + 2, h + 2);
    gfx.fillStyle(enemy.flash > 0 ? palette.ink : palette.enemy, 1);
    gfx.fillRect(x, y, w, h);
    gfx.fillStyle(palette.enemyShade, 1);
    gfx.fillRect(x, y, w, Math.max(2, Math.round(h * 0.28)));
    if (enemy.phase === 'aim' || enemy.phase === 'burst') {
      gfx.fillStyle(palette.enemyBullet, 1);
      gfx.fillRect(x + Math.round(w * 0.35), y + Math.round(h * 0.4), Math.max(2, Math.round(w * 0.3)), 3);
    }
  }

  private drawTank(gfx: Phaser.GameObjects.Graphics, enemy: Actor): void {
    const x = Math.round(enemy.x - enemy.w / 2);
    const y = Math.round(enemy.y - enemy.h / 2);
    const w = Math.max(1, Math.round(enemy.w));
    const h = Math.max(1, Math.round(enemy.h));
    const flash = enemy.flash > 0;
    gfx.fillStyle(palette.black, 1);
    gfx.fillRect(x - 1, y - 1, w + 2, h + 2);
    gfx.fillStyle(flash ? palette.ink : palette.tank, 1);
    gfx.fillRect(x, y, w, h);
    if (!flash) {
      gfx.fillStyle(palette.tankShade, 1);
      gfx.fillRect(x, y + Math.round(h * 0.62), w, Math.max(3, Math.round(h * 0.38)));
      const treadY = y + h - Math.max(5, Math.round(h * 0.2));
      gfx.fillStyle(palette.black, 1);
      gfx.fillRect(x, treadY, w, Math.max(4, h - (treadY - y)));
      gfx.fillStyle(palette.tankShade, 1);
      const link = Math.max(3, Math.round(w / 6));
      for (let i = 0; i < 6; i += 1) {
        gfx.fillRect(x + i * link + 1, treadY + 1, Math.max(2, link - 3), Math.max(2, h - (treadY - y) - 2));
      }
      const turretW = Math.max(8, Math.round(w * 0.42));
      const turretH = Math.max(4, Math.round(h * 0.34));
      gfx.fillStyle(palette.tankTurret, 1);
      gfx.fillRect(x + Math.round((w - turretW) / 2), y + 6, turretW, Math.min(turretH, Math.max(4, h - 8)));
    }
    if (enemy.phase === 'aim' || enemy.phase === 'burst') {
      gfx.fillStyle(palette.tankBullet, 1);
      gfx.fillRect(x + Math.round(w * 0.42), y + Math.round(h * 0.28), Math.max(4, Math.round(w * 0.16)), 4);
    }
    this.drawPips(gfx, enemy, x, y, w);
  }

  private drawWheel(gfx: Phaser.GameObjects.Graphics, enemy: Actor): void {
    const x = Math.round(enemy.x - enemy.w / 2);
    const y = Math.round(enemy.y - enemy.h / 2);
    const w = Math.max(1, Math.round(enemy.w));
    const h = Math.max(1, Math.round(enemy.h));
    const flash = enemy.flash > 0;
    const wheelH = Math.max(5, Math.round(h * 0.28));
    const bodyH = Math.max(6, h - wheelH + 2);
    gfx.fillStyle(palette.black, 1);
    gfx.fillRect(x - 1, y - 1, w + 2, h + 2);
    gfx.fillStyle(flash ? palette.ink : palette.wheel, 1);
    gfx.fillRect(x, y + 2, w, bodyH);
    if (!flash) {
      gfx.fillStyle(palette.wheelShade, 1);
      gfx.fillRect(x, y + Math.round(bodyH * 0.62), w, Math.max(3, Math.round(bodyH * 0.38)));
      const turretW = Math.max(8, Math.round(w * 0.3));
      gfx.fillStyle(palette.tankTurret, 1);
      gfx.fillRect(x + Math.round((w - turretW) / 2), y, turretW, Math.max(4, Math.round(h * 0.28)));
      const ww = Math.max(5, Math.round(w * 0.16));
      gfx.fillStyle(palette.black, 1);
      for (const slot of [0.1, 0.42, 0.74]) {
        gfx.fillRect(x + Math.round(w * slot), y + bodyH - 2, ww, wheelH);
      }
    }
    if (enemy.phase === 'aim' || enemy.phase === 'burst') {
      gfx.fillStyle(palette.tankBullet, 1);
      gfx.fillRect(x + Math.round(w * 0.44), y + Math.round(h * 0.22), Math.max(4, Math.round(w * 0.12)), 4);
    }
    this.drawPips(gfx, enemy, x, y, w);
  }

  private drawTruck(gfx: Phaser.GameObjects.Graphics, enemy: Actor): void {
    const x = Math.round(enemy.x - enemy.w / 2);
    const y = Math.round(enemy.y - enemy.h / 2);
    const w = Math.max(1, Math.round(enemy.w));
    const h = Math.max(1, Math.round(enemy.h));
    const flash = enemy.flash > 0;
    const cabW = Math.max(8, Math.round(w * 0.28));
    const cabX = enemy.heading > 0 ? x + w - cabW : x;
    gfx.fillStyle(palette.black, 1);
    gfx.fillRect(x - 1, y - 1, w + 2, h + 2);
    gfx.fillStyle(flash ? palette.ink : palette.truck, 1);
    gfx.fillRect(x, y + Math.round(h * 0.22), w, Math.max(4, h - Math.round(h * 0.22)));
    if (!flash) {
      gfx.fillStyle(palette.truckCab, 1);
      gfx.fillRect(cabX, y, cabW, Math.max(6, Math.round(h * 0.72)));
      gfx.fillStyle(palette.truckShade, 1);
      gfx.fillRect(x, y + Math.round(h * 0.62), w, Math.max(3, h - Math.round(h * 0.62)));
      gfx.fillStyle(palette.black, 1);
      const wheel = Math.max(3, Math.round(h * 0.16));
      gfx.fillRect(x + Math.round(w * 0.12), y + h - wheel, Math.max(4, Math.round(w * 0.12)), wheel);
      gfx.fillRect(x + Math.round(w * 0.72), y + h - wheel, Math.max(4, Math.round(w * 0.12)), wheel);
    }
    this.drawPips(gfx, enemy, x, y, w);
  }

  /** Четыре деления: очередь его колет, граната снимает сразу. */
  private drawPips(gfx: Phaser.GameObjects.Graphics, enemy: Actor, left: number, top: number, w: number): void {
    const pips = 4;
    const full = Math.ceil((enemy.hp / enemy.maxHp) * pips);
    const gap = 2;
    const pipW = Math.max(3, Math.round((w - gap * (pips - 1)) / pips));
    const y = top + 2;
    for (let i = 0; i < pips; i += 1) {
      gfx.fillStyle(i < full ? palette.wallHurt : palette.barTrack, 1);
      gfx.fillRect(left + i * (pipW + gap), y, pipW, 3);
    }
  }
}

