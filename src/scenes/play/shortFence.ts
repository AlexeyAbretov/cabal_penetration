import Phaser from 'phaser';
import { circleHitsRect, rectsOverlap, type HitBox } from '../../combat';
import { grenade, palette, shortFence } from '../../constants';
import type { GroundAt } from '../../campaign/ground';
import type { ShortMark } from '../../types/shortFence';
import { shortFenceBreakKey, shortFenceIdleKey } from '../../fenceSheet';
import { fieldScale, fitScale, type FrameLayout } from '../../layout';
import { paintSeat } from './seat';
import type { Sparks } from './sparks';

type InkRect = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

type Run = {
  mark: ShortMark;
  hp: number;
  flash: number;
  alive: boolean;
  breaking: boolean;
  gone: boolean;
  hit: InkRect | null;
  sprites: Phaser.GameObjects.Sprite[];
};

/**
 * Короткий кирпич на траве. Стену у ног не закрывает.
 * Секции одного забора стоят встык и ломаются вместе: один бонус из списка картинки на весь прогон.
 * Подошва на линии прежней кладки, выше низа сцены, чем одиночный лист у стены.
 */
export class ShortFences {
  private readonly runs: Run[];
  private view: FrameLayout | null = null;
  private readonly scene: Phaser.Scene;
  private readonly seatGfx: Phaser.GameObjects.Graphics;
  private seatSig = '';
  private readonly onBreak: (score: number, rx: number, ry: number) => void;
  private readonly at: GroundAt;

  constructor(
    scene: Phaser.Scene,
    marks: readonly ShortMark[],
    private readonly sparks: Sparks,
    onBreak: (score: number, rx: number, ry: number) => void,
    at: GroundAt,
  ) {
    this.scene = scene;
    this.seatGfx = scene.add.graphics().setDepth(2.51);
    this.onBreak = onBreak;
    this.at = at;
    this.runs = marks.map((mark) => ({
      mark,
      hp: shortFence.hp,
      flash: 0,
      alive: true,
      breaking: false,
      gone: false,
      hit: null,
      sprites: Array.from({ length: Math.max(1, mark.sections) }, () =>
        scene.add.sprite(0, 0, shortFenceIdleKey()).setOrigin(0.5, 1).setDepth(2.5).setVisible(false),
      ),
    }));
  }

  bind(view: FrameLayout): void {
    this.view = view;
    this.place();
  }

  step(delta: number): void {
    for (const run of this.runs) run.flash = Math.max(0, run.flash - delta);
    this.place();
  }

  /** Квадрат креста бьёт забор, чья кладка в него попала. */
  hit(box: HitBox, amount: number): void {
    for (const run of this.runs) {
      const hit = run.hit;
      if (!run.alive || !hit || !rectsOverlap(box, hit)) continue;
      this.wound(run, amount);
    }
  }

  /** Разрыв снимает забор, чья кладка входит в круг. */
  blast(x: number, y: number): void {
    for (const run of this.runs) {
      const hit = run.hit;
      if (!run.alive || !hit || !circleHitsRect(x, y, grenade.blastRadius, hit)) continue;
      this.wound(run, run.hp);
    }
  }

  private place(): void {
    const view = this.view;
    if (!view) return;
    const field = view.field;
    const fit = fitScale(field);
    for (const run of this.runs) {
      if (run.gone) {
        run.hit = null;
        for (const sprite of run.sprites) sprite.setVisible(false);
        continue;
      }
      const sole = Math.round(field.y + field.height - 60 - 2 * fit);
      const scale = fieldScale(sole, field) * fit;
      const displayW = Math.max(1, Math.round(shortFence.width * scale));
      const displayH = Math.max(1, Math.round(shortFence.height * scale));
      const scaleX = displayW / shortFence.width;
      const scaleY = displayH / shortFence.height;
      const pad = (shortFence.height - shortFence.ink.y - shortFence.ink.h) * scaleY;
      const ground = Math.round(sole + pad);
      const step = inkStep(scaleX);
      const right = field.x + run.mark.x * field.width + run.mark.span * fit + 20 * fit;
      const lastCenter = right - inkRight(scaleX);
      const firstCenter = lastCenter - (run.sprites.length - 1) * step;
      let left = Number.POSITIVE_INFINITY;
      let edge = Number.NEGATIVE_INFINITY;
      let top = Number.POSITIVE_INFINITY;
      let bottom = Number.NEGATIVE_INFINITY;
      for (let i = 0; i < run.sprites.length; i += 1) {
        const sprite = run.sprites[i];
        const x = Math.round(firstCenter + i * step);
        sprite.setPosition(x, ground);
        sprite.setDisplaySize(displayW, displayH);
        sprite.setDepth(2.5 + ground / 10000);
        sprite.setVisible(true);
        if (run.flash > 0 && run.alive) sprite.setTint(palette.ink);
        else sprite.clearTint();
        const box = inkRect(x, ground, displayW, displayH);
        left = Math.min(left, box.left);
        edge = Math.max(edge, box.right);
        top = Math.min(top, box.top);
        bottom = Math.max(bottom, box.bottom);
      }
      run.hit = run.alive ? { left, right: edge, top, bottom } : null;
    }
    this.paintSeats();
  }

  /** Прямой низ кирпича закрывает газон. На сломе посадка пропадает. */
  private paintSeats(): void {
    const view = this.view;
    if (!view) return;
    const sig = this.runs
      .map((run) => {
        if (run.gone || run.breaking) return '0';
        return run.sprites
          .map((sprite) => `${sprite.x},${sprite.y},${sprite.displayWidth},${sprite.displayHeight}`)
          .join(',');
      })
      .join('|');
    if (sig === this.seatSig) return;
    this.seatGfx.clear();
    let depth = 2.5;
    let ready = true;
    for (const run of this.runs) {
      if (run.gone || run.breaking) continue;
      depth = Math.max(depth, run.sprites[0]?.depth ?? depth);
      run.sprites.forEach((sprite, index) => {
        ready =
          paintSeat(this.seatGfx, this.scene, sprite, view.field, view.track, 3, {
            left: index === 0,
            right: index === run.sprites.length - 1,
            tuft: true,
          }, this.at) && ready;
      });
    }
    this.seatGfx.setDepth(depth + 0.002);
    if (ready) this.seatSig = sig;
  }

  private wound(run: Run, amount: number): void {
    if (!run.alive || amount <= 0) return;
    run.hp -= amount;
    run.flash = 70;
    const hit = run.hit;
    const sx = hit ? (hit.left + hit.right) / 2 : 0;
    const sy = hit ? (hit.top + hit.bottom) / 2 : 0;
    if (run.hp > 0) {
      this.sparks.add(sx, sy, 80, 'chip');
      return;
    }
    run.alive = false;
    run.hit = null;
    run.breaking = true;
    this.sparks.add(sx, sy, 160, 'land');
    const view = this.view;
    const field = view?.field;
    const rx = field ? (sx - field.x) / Math.max(1, field.width) : run.mark.x;
    const ry = field ? (sy - field.y) / Math.max(1, field.height) : 0.7;
    this.onBreak(shortFence.score, rx, ry);
    const key = shortFenceBreakKey();
    for (const sprite of run.sprites) sprite.play(key);
    run.sprites[0]?.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
      run.gone = true;
      for (const sprite of run.sprites) sprite.setVisible(false);
    });
  }
}

function inkRect(center: number, ground: number, displayW: number, displayH: number): InkRect {
  const box = shortFence.ink;
  const scaleX = displayW / shortFence.width;
  const scaleY = displayH / shortFence.height;
  return {
    left: center + (box.x - shortFence.width / 2) * scaleX,
    right: center + (box.x + box.w - shortFence.width / 2) * scaleX,
    top: ground - (shortFence.height - box.y) * scaleY,
    bottom: ground - (shortFence.height - box.y - box.h) * scaleY,
  };
}

function inkLeft(scaleX: number): number {
  return (shortFence.ink.x - shortFence.width / 2) * scaleX;
}

function inkRight(scaleX: number): number {
  const box = shortFence.ink;
  return (box.x + box.w - shortFence.width / 2) * scaleX;
}

/** Соседние секции сходятся кладкой. Прозрачные поля наезжают, в стыке нет щели. */
function inkStep(scaleX: number): number {
  return inkRight(scaleX) - inkLeft(scaleX) - 1;
}
