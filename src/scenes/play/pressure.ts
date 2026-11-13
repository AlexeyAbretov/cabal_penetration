import Phaser from 'phaser';
import { palette, volley, wall } from '../../constants';
import type { FrameLayout } from '../../layout';
import type { FrontWall } from './wall';

type Incoming = {
  column: number;
  elapsed: number;
};

/**
 * Очередь таймера без спрайта врага.
 * Замах запирается на колонку солдата. Стена или перекат эту очередь держат.
 */
export class Pressure {
  private incoming: Incoming[] = [];
  private pressure: { column: number; phase: 'recover' | 'volley'; wait: number; shotsLeft: number } = {
    column: 0,
    phase: 'recover',
    wait: volley.openMs,
    shotsLeft: 0,
  };

  step(delta: number, soldierColumn: number): void {
    this.pressure.wait -= delta;
    if (this.pressure.wait > 0) return;
    if (this.pressure.phase !== 'volley') {
      this.pressure.column = soldierColumn;
      this.pressure.shotsLeft = volley.burst;
      this.pressure.phase = 'volley';
      this.pressure.wait = volley.leadMs;
      return;
    }
    this.incoming.push({ column: this.pressure.column, elapsed: 0 });
    this.pressure.shotsLeft -= 1;
    if (this.pressure.shotsLeft > 0) {
      this.pressure.wait = volley.gapMs;
      return;
    }
    this.pressure.phase = 'recover';
    this.pressure.wait = volley.recoverMs;
  }

  /** Колонки, чья пуля дошла в этом кадре, в том порядке, в каком летели. */
  arrive(delta: number): number[] {
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

  draw(gfx: Phaser.GameObjects.Graphics, view: FrameLayout, columns: FrontWall): void {
    this.drawLanes(gfx, view, columns);
    this.drawIncoming(gfx, view, columns);
  }

  private drawLanes(gfx: Phaser.GameObjects.Graphics, view: FrameLayout, columns: FrontWall): void {
    const marked = new Set<number>();
    if (this.pressure.phase === 'volley') marked.add(this.pressure.column);
    for (const shot of this.incoming) marked.add(shot.column);
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

  private drawIncoming(gfx: Phaser.GameObjects.Graphics, view: FrameLayout, columns: FrontWall): void {
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
}
