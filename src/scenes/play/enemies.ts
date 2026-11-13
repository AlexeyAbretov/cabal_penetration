import Phaser from 'phaser';
import { green, grenade, palette, volley, wall } from '../../constants';
import { drillWave, type WaveGroup } from '../../data/wave';
import { fieldScale, type FrameLayout } from '../../layout';
import type { Sparks } from './sparks';
import type { FrontWall } from './wall';

type Phase = 'run' | 'hold' | 'aim' | 'burst' | 'recover';

type Green = {
  alive: boolean;
  hp: number;
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
};

type Pocket = {
  spec: WaveGroup;
  sent: number;
};

type Incoming = {
  column: number;
  elapsed: number;
};

/**
 * Волна зелёных из фиксированных точек.
 * Маркер точки горит до выхода пачки и гаснет, когда последний уже на поле.
 * Очередь бьёт колонку, на которой солдат стоял в момент замаха.
 */
export class Enemies {
  private readonly pockets: Pocket[];
  private greens: Green[] = [];
  private incoming: Incoming[] = [];
  private clock = 0;
  private frozen = false;
  private readonly lanes: Phaser.GameObjects.Graphics;
  private readonly bodies: Phaser.GameObjects.Graphics;
  private readonly sparks: Sparks;
  private readonly onKill: () => void;

  constructor(scene: Phaser.Scene, sparks: Sparks, onKill: () => void) {
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
      for (const enemy of this.greens) this.advance(enemy, delta, playerColumn);
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
    let target: Green | null = null;
    for (const enemy of this.greens) {
      if (!enemy.alive || !covers(enemy, aimX, aimY)) continue;
      if (!target || enemy.y > target.y) target = enemy;
    }
    if (!target) return false;
    this.wound(target, false);
    this.bury();
    return true;
  }

  blast(x: number, y: number): void {
    for (const enemy of [...this.greens]) {
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
      gfx.fillStyle(palette.enemyBullet, 1);
      gfx.fillRect(
        Math.round(x - volley.thickness / 2),
        Math.round(tip - volley.length),
        volley.thickness,
        volley.length,
      );
    }
  }

  private spawn(): void {
    for (const pocket of this.pockets) {
      const count = pocket.spec.composition.length;
      while (pocket.sent < count) {
        const due = pocket.spec.delayMs + pocket.sent * green.gapMs;
        if (this.clock < due) break;
        const kind = pocket.spec.composition[pocket.sent];
        if (kind === 'green') this.birth(pocket.spec, pocket.sent, count);
        pocket.sent += 1;
      }
    }
  }

  private birth(spec: WaveGroup, index: number, count: number): void {
    const span = (count - 1) / 2;
    const shift = (index - span) * green.spread;
    this.greens.push({
      alive: true,
      hp: green.hp,
      flash: 0,
      sx: spec.point.x,
      sy: spec.point.y,
      tx: Math.min(0.92, Math.max(0.08, spec.point.x + shift)),
      ty: Math.min(0.84, spec.point.y + green.run),
      moveT: 0,
      phase: 'run',
      wait: 0,
      shotsLeft: 0,
      column: 0,
      x: 0,
      y: 0,
      w: green.width,
      h: green.height,
    });
  }

  private advance(enemy: Green, delta: number, playerColumn: number): void {
    enemy.flash = Math.max(0, enemy.flash - delta);
    if (enemy.phase === 'run') {
      enemy.moveT = Math.min(1, enemy.moveT + delta / green.runMs);
      if (enemy.moveT >= 1) {
        enemy.phase = 'hold';
        enemy.wait = green.holdMs;
      }
      return;
    }
    enemy.wait -= delta;
    if (enemy.wait > 0) return;
    if (enemy.phase === 'hold' || enemy.phase === 'recover') {
      enemy.phase = 'aim';
      enemy.column = playerColumn;
      enemy.wait = volley.leadMs;
      return;
    }
    if (enemy.phase === 'aim') {
      enemy.phase = 'burst';
      enemy.shotsLeft = volley.burst;
      enemy.wait = 0;
      return;
    }
    this.incoming.push({ column: enemy.column, elapsed: 0 });
    enemy.shotsLeft -= 1;
    if (enemy.shotsLeft > 0) {
      enemy.wait = volley.gapMs;
      return;
    }
    enemy.phase = 'recover';
    enemy.wait = volley.recoverMs;
  }

  private place(view: FrameLayout): void {
    const field = view.field;
    const ceiling = view.track.y - wall.intoField;
    for (const enemy of this.greens) {
      const u = enemy.moveT >= 1 ? 1 : 1 - (1 - enemy.moveT) * (1 - enemy.moveT);
      const rx = enemy.sx + (enemy.tx - enemy.sx) * u;
      let y = field.y + (enemy.sy + (enemy.ty - enemy.sy) * u) * field.height;
      let scale = fieldScale(y, field);
      const maxY = ceiling - (green.height * scale) / 2 - 6;
      if (y > maxY) {
        y = maxY;
        scale = fieldScale(y, field);
      }
      enemy.x = field.x + rx * field.width;
      enemy.y = y;
      enemy.w = green.width * scale;
      enemy.h = green.height * scale;
    }
  }

  private wound(enemy: Green, lethal: boolean): void {
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
    this.onKill();
  }

  private bury(): void {
    this.greens = this.greens.filter((enemy) => enemy.alive);
  }

  private drawLanes(view: FrameLayout, columns: FrontWall): void {
    const marked = new Set<number>();
    for (const enemy of this.greens) {
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
    const ordered = [...this.greens].sort((a, b) => a.y - b.y);
    for (const enemy of ordered) {
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
  }

  private drawMarkers(gfx: Phaser.GameObjects.Graphics, view: FrameLayout): void {
    const pulse = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(this.clock / 140));
    const field = view.field;
    for (const pocket of this.pockets) {
      if (!this.marking(pocket)) continue;
      const point = pocket.spec.point;
      const x = field.x + point.x * field.width;
      const y = field.y + point.y * field.height;
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
    return this.clock >= pocket.spec.delayMs - green.warnMs;
  }
}

function covers(enemy: Green, aimX: number, aimY: number): boolean {
  return (
    aimX >= enemy.x - enemy.w / 2 &&
    aimX <= enemy.x + enemy.w / 2 &&
    aimY >= enemy.y - enemy.h / 2 &&
    aimY <= enemy.y + enemy.h / 2
  );
}
