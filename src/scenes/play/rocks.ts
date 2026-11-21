import Phaser from 'phaser';
import type { GroundAt } from '../../campaign/ground';
import { circleHitsRect, type HitBox } from '../../combat';
import type { Cover } from '../../cover';
import { grenade, palette, rock as rockStats } from '../../constants';
import { belowHorizon, fieldScale, fitScale, type FrameLayout } from '../../layout';
import type { RockMark } from '../../types/rock';
import { blit, ensureCanvas } from './blit';
import { Debris, onFace } from './debris';
import { paintRock, paintRockRuin } from './rockDraw';
import { paintSeat } from './seat';

type Phase = 'up' | 'scrap';

type Stone = {
  root: Phaser.GameObjects.Container;
  image: Phaser.GameObjects.Image;
  scrap: Phaser.GameObjects.Image;
  key: string;
  scrapKey: string;
  mark: RockMark;
  sole: number;
  w: number;
  h: number;
  hp: number;
  maxHp: number;
  flash: number;
  stage: number;
  phase: Phase;
};

/**
 * Камни картинки. Очередь колет, граната разбивает сразу.
 * Попадание сыплет каменной крошкой с места удара. Слом сыплет гуще.
 * Остаётся низкая куча. Прямой низ закрывает газон.
 * Бонус берётся из списка картинки.
 */
export class Rocks {
  private readonly stones: Stone[];
  private view: FrameLayout | null = null;
  private readonly scene: Phaser.Scene;
  private readonly seatGfx: Phaser.GameObjects.Graphics;
  private readonly debris: Debris;
  private readonly at: GroundAt;
  private readonly onBreak: (score: number, rx: number, ry: number) => void;

  constructor(
    scene: Phaser.Scene,
    marks: readonly RockMark[],
    at: GroundAt,
    debris: Debris,
    onBreak: (score: number, rx: number, ry: number) => void,
  ) {
    this.scene = scene;
    this.at = at;
    this.debris = debris;
    this.onBreak = onBreak;
    // Выше земли, ниже кустов. Посадка чуть над камнем, чтобы газон закрыл подошву.
    this.seatGfx = scene.add.graphics().setDepth(0.5);
    this.stones = marks.map((mark, index) => {
      const key = ensureCanvas(scene, `rock-${index}`);
      const scrapKey = ensureCanvas(scene, `rock-ruin-${index}`);
      const image = scene.add.image(0, 0, key).setOrigin(0.5, 1).setVisible(false);
      const scrap = scene.add.image(0, 0, scrapKey).setOrigin(0.5, 1).setVisible(false);
      const root = scene.add.container(0, 0).setDepth(0.42);
      root.add(scrap);
      root.add(image);
      return {
        root,
        image,
        scrap,
        key,
        scrapKey,
        mark,
        sole: 0,
        w: 0,
        h: 0,
        hp: rockStats.hp,
        maxHp: rockStats.hp,
        flash: 0,
        stage: 0,
        phase: 'up',
      };
    });
  }

  place(view: FrameLayout): void {
    this.view = view;
    const field = view.field;
    const fit = fitScale(field);
    for (const stone of this.stones) {
      const sole = Math.round(field.y + belowHorizon(stone.mark.y, field));
      const scale = fieldScale(sole, field) * fit;
      const w = Math.max(16, Math.round(rockStats.width * scale));
      const h = Math.max(12, Math.round(rockStats.height * scale));
      const resized = w !== stone.w || h !== stone.h;
      stone.sole = sole;
      stone.root.setPosition(field.x + stone.mark.x * field.width, sole);
      stone.root.setDepth(0.42 + sole / 10000);
      if (resized) {
        stone.w = w;
        stone.h = h;
      }
      if (stone.phase === 'up' && (resized || !stone.image.visible)) this.paintStanding(stone);
      if (stone.phase === 'scrap' && (resized || !stone.scrap.visible)) this.paintRuin(stone);
    }
    this.paintSeats(view);
  }

  step(delta: number): void {
    for (const stone of this.stones) {
      if (stone.phase !== 'up') continue;
      stone.flash = Math.max(0, stone.flash - delta);
      if (stone.flash > 0) stone.image.setTint(palette.ink);
      else stone.image.clearTint();
    }
  }

  /** Квадрат креста колет камень и сыплет крошкой с точки удара. */
  hit(box: HitBox, amount: number): void {
    const at = { x: (box.left + box.right) / 2, y: (box.top + box.bottom) / 2 };
    for (const stone of this.stones) {
      if (stone.phase !== 'up' || !hitsBody(stone, box)) continue;
      this.wound(stone, amount, at.x, at.y, false);
    }
  }

  /** Целый камень закрывает пехоту за собой. */
  shields(): Cover[] {
    const out: Cover[] = [];
    for (const stone of this.stones) {
      if (stone.phase !== 'up') continue;
      const box = bounds(stone);
      out.push({ box, sole: box.bottom });
    }
    return out;
  }

  /** Разрыв разбивает камень, чьё тело входит в круг. */
  blast(x: number, y: number): void {
    for (const stone of this.stones) {
      if (stone.phase !== 'up' || !circleHitsRect(x, y, grenade.blastRadius, bounds(stone))) continue;
      this.wound(stone, stone.hp, x, y, true);
    }
  }

  /**
   * Прямую подошву закрывает та же земля, что под камнем.
   * Бока, которые не доходят до земли, не сажаются.
   */
  private paintSeats(view: FrameLayout): void {
    this.seatGfx.clear();
    for (const stone of this.stones) {
      const image = stone.phase === 'scrap' ? stone.scrap : stone.image;
      if (!image.visible) continue;
      paintSeat(
        this.seatGfx,
        this.scene,
        {
          x: stone.root.x,
          y: stone.root.y,
          displayWidth: image.displayWidth,
          displayHeight: image.displayHeight,
          texture: image.texture,
        },
        view.field,
        view.track,
        3,
        { left: true, right: true, tuft: true },
        this.at,
        2,
      );
    }
  }

  private wound(stone: Stone, amount: number, x: number, y: number, heavy: boolean): void {
    if (stone.phase !== 'up' || amount <= 0) return;
    stone.hp -= amount;
    stone.flash = 80;
    const killing = stone.hp <= 0;
    this.spray(stone, x, y, heavy || killing);
    if (killing) {
      this.break(stone);
      return;
    }
    const stage = woundStage(stone.hp, stone.maxHp);
    if (stage === stone.stage) return;
    stone.stage = stage;
    this.paintStanding(stone);
  }

  /** Крошка с того места, куда пришёлся удар. Слом сыплет ещё с гребня и боков. */
  private spray(stone: Stone, x: number, y: number, heavy: boolean): void {
    const face = bounds(stone);
    const spot = onFace(face, x, y);
    this.debris.burst(spot.x, spot.y, 'stone', heavy, 'field');
    if (!heavy) return;
    for (const along of [0.22, 0.55, 0.82]) {
      const py = face.top + (face.bottom - face.top) * along;
      if (Math.abs(py - spot.y) < 6) continue;
      this.debris.burst(stone.root.x, py, 'stone', false, 'field');
    }
  }

  private break(stone: Stone): void {
    stone.phase = 'scrap';
    stone.image.clearTint();
    stone.image.setVisible(false);
    this.paintRuin(stone);
    const field = this.view?.field;
    const x = stone.root.x;
    const y = stone.sole - stone.h * 0.4;
    const rx = field ? (x - field.x) / Math.max(1, field.width) : stone.mark.x;
    const ry = field ? (y - field.y) / Math.max(1, field.height) : stone.mark.y;
    this.onBreak(rockStats.score, rx, ry);
    this.refreshSeats();
  }

  private paintStanding(stone: Stone): void {
    if (stone.w < 1 || stone.h < 1) return;
    blit(this.scene, stone.key, paintRock(stone.w, stone.h, stone.stage));
    stone.image.setTexture(stone.key);
    stone.image.setDisplaySize(stone.w, stone.h);
    stone.image.setVisible(true);
    stone.scrap.setVisible(false);
  }

  private paintRuin(stone: Stone): void {
    const h = Math.max(8, Math.round(stone.h * rockStats.ruin));
    blit(this.scene, stone.scrapKey, paintRockRuin(stone.w, h));
    stone.scrap.setTexture(stone.scrapKey);
    stone.scrap.setDisplaySize(stone.w, h);
    stone.scrap.setVisible(true);
  }

  private refreshSeats(): void {
    if (this.view) this.paintSeats(this.view);
  }
}

function hitsBody(stone: Stone, box: HitBox): boolean {
  const cx = stone.root.x;
  const cy = stone.sole - stone.h * 0.46;
  const rx = stone.w * 0.48;
  const ry = stone.h * 0.46;
  const x = clamp(cx, box.left, box.right);
  const y = clamp(cy, box.top, box.bottom);
  const dx = (x - cx) / rx;
  const dy = (y - cy) / ry;
  return dx * dx + dy * dy <= 1;
}

function bounds(stone: Stone): HitBox {
  return {
    left: stone.root.x - stone.w * 0.48,
    right: stone.root.x + stone.w * 0.48,
    top: stone.sole - stone.h * 0.92,
    bottom: stone.sole - 1,
  };
}

function woundStage(hp: number, maxHp: number): number {
  const lost = maxHp - Math.max(0, hp);
  if (lost >= 6) return 2;
  if (lost >= 3) return 1;
  return 0;
}

function clamp(v: number, min: number, max: number): number {
  if (max < min) return (min + max) / 2;
  return Math.min(max, Math.max(min, v));
}
