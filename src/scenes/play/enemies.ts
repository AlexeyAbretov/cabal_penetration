import Phaser from 'phaser';
import { green, grenade, palette, tank, tankVolley, volley, wall } from '../../constants';
import { drillWave, type EnemyKind, type WaveGroup } from '../../data/wave';
import { fieldScale, type FrameLayout } from '../../layout';
import type { Sparks } from './sparks';
import type { FrontWall } from './wall';

type Phase = 'run' | 'hold' | 'aim' | 'burst' | 'recover';

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
};

type Pocket = {
  spec: WaveGroup;
  sent: number;
};

type Incoming = {
  column: number;
  elapsed: number;
  heavy: boolean;
};

/**
 * Волна из фиксированных точек: зелёные и один танк.
 * Маркер точки горит до выхода пачки. У танка маркер прямоугольный.
 * Очередь бьёт колонку, на которой солдат стоял в момент замаха.
 * Граната по танку смертельна: её место не очередь в одного зелёного.
 */
export class Enemies {
  private readonly pockets: Pocket[];
  private units: Actor[] = [];
  private incoming: Incoming[] = [];
  private clock = 0;
  private frozen = false;
  private readonly lanes: Phaser.GameObjects.Graphics;
  private readonly bodies: Phaser.GameObjects.Graphics;
  private readonly sparks: Sparks;
  private readonly onKill: (points: number) => void;

  constructor(scene: Phaser.Scene, sparks: Sparks, onKill: (points: number) => void) {
    this.sparks = sparks;
    this.onKill = onKill;
    this.pockets = drillWave.map((spec) => ({ spec, sent: 0 }));
    this.lanes = scene.add.graphics().setDepth(1.5);
    this.bodies = scene.add.graphics().setDepth(3);
  }

  freeze(): void {
    this.frozen = true;
    this.incoming.length = 0;
  }

  bind(view: FrameLayout): void {
    this.place(view);
  }

  step(delta: number, playerColumn: number, view: FrameLayout): void {
    if (!this.frozen) {
      this.clock += delta;
      this.spawn();
      for (const enemy of this.units) this.advance(enemy, delta, playerColumn);
    }
    this.place(view);
  }

  /** Колонки, чья пуля дошла в этом кадре. */
  arrive(delta: number): number[] {
    if (this.frozen) return [];
    const landed: number[] = [];
    const pending: Incoming[] = [];
    for (const shot of this.incoming) {
      shot.elapsed += delta;
      if (shot.elapsed < volley.travelMs) pending.push(shot);
      else landed.push(shot.column);
    }
    this.incoming = pending;
    return landed;
  }

  /** Точка прицела на теле. Ближний к дорожке забирает пулю, если фигуры наложились. */
  hit(aimX: number, aimY: number): boolean {
    let target: Actor | null = null;
    for (const enemy of this.units) {
      if (!enemy.alive || !covers(enemy, aimX, aimY)) continue;
      if (!target || enemy.y > target.y) target = enemy;
    }
    if (!target) return false;
    this.wound(target, false);
    this.bury();
    return true;
  }

  blast(x: number, y: number): void {
    for (const enemy of [...this.units]) {
      if (!enemy.alive) continue;
      if (Math.hypot(enemy.x - x, enemy.y - y) > grenade.blastRadius) continue;
      this.wound(enemy, true);
    }
    this.bury();
  }

  draw(view: FrameLayout, columns: FrontWall): void {
    this.drawLanes(view, columns);
    this.drawBodies(view);
  }

  drawBullets(gfx: Phaser.GameObjects.Graphics, view: FrameLayout, columns: FrontWall): void {
    for (const shot of this.incoming) {
      const from = view.field.y + 12;
      const to = columns.impact(view, shot.column).y;
      const t = Math.min(1, shot.elapsed / volley.travelMs);
      const tip = from + (to - from) * t;
      const x = columns.columnCenter(view, shot.column);
      const thick = shot.heavy ? volley.thickness + 4 : volley.thickness;
      const length = shot.heavy ? volley.length + 8 : volley.length;
      gfx.fillStyle(shot.heavy ? palette.tankBullet : palette.enemyBullet, 1);
      gfx.fillRect(Math.round(x - thick / 2), Math.round(tip - length), thick, length);
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
    const span = (count - 1) / 2;
    const shift = kind === 'green' ? (index - span) * green.spread : 0;
    const run = kind === 'tank' ? tank.run : green.run;
    const profile =
      kind === 'tank'
        ? {
            hp: tank.hp,
            score: tank.score,
            baseW: tank.width,
            baseH: tank.height,
            runMs: tank.runMs,
            holdMs: tank.holdMs,
            leadMs: tankVolley.leadMs,
            burst: tankVolley.burst,
            gapMs: tankVolley.gapMs,
            recoverMs: tankVolley.recoverMs,
          }
        : {
            hp: green.hp,
            score: green.score,
            baseW: green.width,
            baseH: green.height,
            runMs: green.runMs,
            holdMs: green.holdMs,
            leadMs: volley.leadMs,
            burst: volley.burst,
            gapMs: volley.gapMs,
            recoverMs: volley.recoverMs,
          };
    this.units.push({
      kind,
      alive: true,
      hp: profile.hp,
      maxHp: profile.hp,
      score: profile.score,
      flash: 0,
      sx: spec.point.x,
      sy: spec.point.y,
      tx: Math.min(0.92, Math.max(0.08, spec.point.x + shift)),
      ty: Math.min(0.84, spec.point.y + run),
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
    });
  }

  private advance(enemy: Actor, delta: number, playerColumn: number): void {
    enemy.flash = Math.max(0, enemy.flash - delta);
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
    this.incoming.push({ column: enemy.column, elapsed: 0, heavy: enemy.kind === 'tank' });
    enemy.shotsLeft -= 1;
    if (enemy.shotsLeft > 0) {
      enemy.wait = enemy.gapMs;
      return;
    }
    enemy.phase = 'recover';
    enemy.wait = enemy.recoverMs;
  }

  private place(view: FrameLayout): void {
    const field = view.field;
    const ceiling = view.track.y - wall.intoField;
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

  private wound(enemy: Actor, lethal: boolean): void {
    if (!enemy.alive) return;
    if (!lethal) {
      enemy.hp -= 1;
      enemy.flash = 70;
      if (enemy.hp > 0) {
        this.sparks.add(enemy.x, enemy.y, 80, 'pop');
        return;
      }
    }
    enemy.alive = false;
    this.sparks.add(enemy.x, enemy.y, 160, 'land');
    this.onKill(enemy.score);
  }

  private bury(): void {
    this.units = this.units.filter((enemy) => enemy.alive);
  }

  private drawLanes(view: FrameLayout, columns: FrontWall): void {
    const marked = new Set<number>();
    for (const enemy of this.units) {
      if (enemy.phase === 'aim' || enemy.phase === 'burst') marked.add(enemy.column);
    }
    for (const shot of this.incoming) marked.add(shot.column);
    const gfx = this.lanes;
    gfx.clear();
    const field = view.field;
    const geom = columns.geom(view);
    for (const column of marked) {
      const x = geom.trackX + column * geom.colW;
      gfx.fillStyle(palette.enemyLane, 0.28);
      gfx.fillRect(x, field.y, geom.colW, Math.max(0, geom.top - field.y));
      gfx.fillStyle(palette.enemyLane, 1);
      gfx.fillRect(x + wall.seam, field.y + 4, Math.max(1, geom.colW - wall.seam * 2), 5);
    }
  }

  private drawBodies(view: FrameLayout): void {
    const gfx = this.bodies;
    gfx.clear();
    this.drawMarkers(gfx, view);
    const ordered = [...this.units].sort((a, b) => a.y - b.y);
    for (const enemy of ordered) {
      if (enemy.kind === 'tank') this.drawTank(gfx, enemy);
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

  private drawMarkers(gfx: Phaser.GameObjects.Graphics, view: FrameLayout): void {
    const pulse = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(this.clock / 140));
    const field = view.field;
    for (const pocket of this.pockets) {
      if (!this.marking(pocket)) continue;
      const point = pocket.spec.point;
      const x = field.x + point.x * field.width;
      const y = field.y + point.y * field.height;
      if (pocket.spec.composition[0] === 'tank') {
        gfx.fillStyle(palette.enemyLane, pulse);
        gfx.fillRect(Math.round(x - 16), Math.round(y - 7), 32, 14);
        gfx.fillStyle(palette.tankBullet, 1);
        gfx.fillRect(Math.round(x - 3), Math.round(y - 13), 6, 6);
        gfx.fillRect(Math.round(x - 2), Math.round(y + 7), 4, 22);
        continue;
      }
      const s = 11;
      gfx.fillStyle(palette.enemyLane, pulse);
      gfx.fillTriangle(x, y - s, x + s, y, x, y + s);
      gfx.fillTriangle(x, y - s, x - s, y, x, y + s);
      gfx.fillRect(Math.round(x - 2), Math.round(y + s - 2), 4, 26);
    }
  }

  private marking(pocket: Pocket): boolean {
    const count = pocket.spec.composition.length;
    if (count === 0 || pocket.sent >= count) return false;
    const warn = pocket.spec.composition[0] === 'tank' ? tank.warnMs : green.warnMs;
    return this.clock >= pocket.spec.delayMs - warn;
  }
}

function covers(enemy: Actor, aimX: number, aimY: number): boolean {
  return (
    aimX >= enemy.x - enemy.w / 2 &&
    aimX <= enemy.x + enemy.w / 2 &&
    aimY >= enemy.y - enemy.h / 2 &&
    aimY <= enemy.y + enemy.h / 2
  );
}
