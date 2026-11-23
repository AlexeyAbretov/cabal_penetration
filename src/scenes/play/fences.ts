import Phaser from 'phaser';
import { circleHitsRect, rectsOverlap, type FlightBlock, type HitBox } from '../../combat';
import { fence, wall } from '../../constants';
import type { GroundAt } from '../../campaign/ground';
import type { FenceMark } from '../../types/fence';
import { fenceBreakKey, fenceIdleKey, fenceInk, fenceRuinKey, ruinVariants } from '../../fenceSheet';
import type { FrameLayout } from '../../layout';
import { Debris, onFace } from './debris';
import { paintSeat } from './seat';
import { type FrontWall, type WallGeom } from './wall';

type InkRect = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

type Piece = {
  column: number;
  kind: FenceMark['kind'];
  sprite: Phaser.GameObjects.Sprite;
  breaking: boolean;
  gone: boolean;
  /** Кладка на экране. Пустые поля листа сюда не входят. */
  hit: InkRect | null;
};

/**
 * Лист на передней стене, позади солдата. Колонка пулю не пускает, пока цела.
 * Наклонный полёт останавливает первая кладка на отрезке, не только колонка цели.
 * Когда жизни колонки кончаются, секция играет ролик и оставляет кучу на ширине кладки.
 * Куча пулю не держит. У картинки свой список: какие колонки каким листом закрыты.
 * Удар по камню сыплет осколки, по ржавому железу — искры.
 */
export class Fences {
  private readonly pieces: Piece[];
  private readonly owned: Set<number>;
  private readonly columnCount: number;
  private readonly scene: Phaser.Scene;
  private readonly seatGfx: Phaser.GameObjects.Graphics;
  private readonly at: GroundAt;
  private seatSig = '';

  constructor(
    scene: Phaser.Scene,
    marks: readonly FenceMark[],
    mask: readonly boolean[],
    private readonly debris: Debris,
    at: GroundAt,
  ) {
    this.scene = scene;
    this.at = at;
    this.seatGfx = scene.add.graphics().setDepth(3.52);
    this.pieces = [];
    this.owned = new Set();
    this.columnCount = mask.length;
    for (const mark of marks) {
      const last = Math.min(mark.to, mask.length - 1);
      for (let column = Math.max(0, mark.from); column <= last; column += 1) {
        if (!mask[column] || this.owned.has(column)) continue;
        this.owned.add(column);
        const sprite = scene.add
          .sprite(0, 0, fenceIdleKey(mark.kind))
          .setOrigin(0.5, 1)
          .setDepth(3.5)
          .setVisible(false);
        this.pieces.push({ column, kind: mark.kind, sprite, breaking: false, gone: false, hit: null });
      }
    }
  }

  /** Колонки, которые рисует лист. Заглушка их не закрашивает. */
  columns(): ReadonlySet<number> {
    return this.owned;
  }

  /** Живые секции, чья кладка входит в квадрат креста. */
  hitColumns(box: HitBox): number[] {
    const columns: number[] = [];
    for (const piece of this.pieces) {
      const hit = piece.hit;
      if (!hit || piece.gone || piece.breaking) continue;
      if (!rectsOverlap(box, hit)) continue;
      columns.push(piece.column);
    }
    return columns;
  }

  /** Живая кладка и ролик слома. Куча пулю не держит: у неё hit уже снят. */
  blocks(): FlightBlock[] {
    const blocks: FlightBlock[] = [];
    for (const piece of this.pieces) {
      const hit = piece.hit;
      if (!hit || piece.gone) continue;
      blocks.push({
        column: piece.column,
        left: hit.left,
        right: hit.right,
        top: hit.top,
        bottom: hit.bottom,
      });
    }
    return blocks;
  }

  /** Секция, чья кладка закрывает эту точку по горизонтали. */
  sectionAt(x: number): number | null {
    let found: number | null = null;
    for (const piece of this.pieces) {
      const hit = piece.hit;
      if (!hit || piece.gone) continue;
      if (x < hit.left || x >= hit.right) continue;
      found = piece.column;
    }
    return found;
  }

  /**
   * Крошка с кладки этой колонки. heavy — секция только что упала:
   * осколки идут и от удара, и выше-ниже по лицу.
   */
  spray(column: number, x: number, y: number, heavy: boolean): void {
    const piece = this.pieces.find((item) => item.column === column);
    if (!piece || piece.gone) return;
    const kind = piece.kind === 'rust' ? 'spark' : 'stone';
    const spot = onFace(piece.hit, x, y);
    this.debris.burst(spot.x, spot.y, kind, heavy, 'wall');
    const hit = piece.hit;
    if (!heavy || !hit) return;
    const mid = (hit.left + hit.right) / 2;
    const upper = hit.top + (hit.bottom - hit.top) * 0.28;
    const lower = hit.top + (hit.bottom - hit.top) * 0.72;
    if (Math.abs(upper - spot.y) > 6) this.debris.burst(mid, upper, kind, false, 'wall');
    if (Math.abs(lower - spot.y) > 6) this.debris.burst(mid, lower, kind, false, 'wall');
  }

  /** Живые секции, чья кладка входит в круг разрыва. */
  blastColumns(x: number, y: number, radius: number): number[] {
    const columns: number[] = [];
    for (const piece of this.pieces) {
      const hit = piece.hit;
      if (!hit || piece.gone || piece.breaking) continue;
      if (!circleHitsRect(x, y, radius, hit)) continue;
      columns.push(piece.column);
    }
    return columns;
  }

  sync(view: FrameLayout, front: FrontWall): void {
    const geom = front.geom(view);
    const bottom = Math.round(geom.top + geom.height);
    const width = Math.max(1, geom.colW - wall.seam);
    const height = Math.max(1, geom.height);
    const centers = joinedCenters(this.runs(), geom, width / fence.width, this.owned, this.columnCount);
    for (const piece of this.pieces) {
      const sprite = piece.sprite;
      const x = centers.get(piece.column) ?? Math.round(front.columnCenter(view, piece.column));
      if (piece.gone) {
        piece.hit = null;
        front.setFace(piece.column, null);
        const ruin = fenceRuinKey(piece.kind, piece.column % ruinVariants);
        if (sprite.texture.key !== ruin) sprite.setTexture(ruin);
        sprite.setPosition(x, bottom);
        sprite.setDisplaySize(width, height);
        sprite.setVisible(true);
        continue;
      }
      sprite.setPosition(x, bottom);
      sprite.setDisplaySize(width, height);
      piece.hit = inkRect(piece.kind, x, bottom, width, height);
      front.setFace(piece.column, { left: piece.hit.left, right: piece.hit.right });
      sprite.setVisible(true);
      if (front.up(piece.column) || piece.breaking) continue;
      piece.breaking = true;
      sprite.play(fenceBreakKey(piece.kind));
      sprite.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
        piece.gone = true;
        piece.hit = null;
        sprite.anims.stop();
        sprite.setTexture(fenceRuinKey(piece.kind, piece.column % ruinVariants));
        sprite.setVisible(true);
      });
    }
    this.paintSeats(view);
  }

  /** Прямую подошву закрывает земля картинки. На ролике посадка пропадает, на куче возвращается. */
  private paintSeats(view: FrameLayout): void {
    const sig = this.pieces
      .map((piece) => {
        const sprite = piece.sprite;
        if (piece.breaking && !piece.gone) return '0';
        return `${sprite.x},${sprite.y},${sprite.displayWidth},${sprite.displayHeight}`;
      })
      .join('|');
    if (sig === this.seatSig) return;
    this.seatGfx.clear();
    let ready = true;
    for (const run of this.runs()) {
      const live = run.filter((piece) => piece.gone || !piece.breaking);
      live.forEach((piece, index) => {
        ready =
          paintSeat(this.seatGfx, this.scene, piece.sprite, view.field, view.track, 3, {
            left: index === 0,
            right: index === live.length - 1,
            tuft: true,
          }, this.at) && ready;
      });
    }
    if (ready) this.seatSig = sig;
  }

  /** Соседние колонки одним куском. Дыра маски кусок рвёт и в стык не входит. */
  private runs(): Piece[][] {
    const ordered = [...this.pieces].sort((a, b) => a.column - b.column);
    const runs: Piece[][] = [];
    for (const piece of ordered) {
      const run = runs[runs.length - 1];
      if (run && piece.column === run[run.length - 1].column + 1) run.push(piece);
      else runs.push([piece]);
    }
    return runs;
  }

}

/**
 * Кладка соседних секций сходится встык. Ширина и высота кадра те же:
 * сдвигается только середина, прозрачные поля наезжают друг на друга.
 * Кусок у края сцены начинается от этого края. Запасная земля остаётся у дыры.
 */
function joinedCenters(
  runs: readonly Piece[][],
  geom: WallGeom,
  scaleX: number,
  owned: ReadonlySet<number>,
  columnCount: number,
): Map<number, number> {
  const centers = new Map<number, number>();
  const sceneRight = geom.trackX + columnCount * geom.colW;
  for (const run of runs) {
    const first = run[0];
    const last = run[run.length - 1];
    const rel = [0];
    for (let i = 0; i < run.length - 1; i += 1) {
      const right = inkRight(run[i].kind, scaleX);
      const left = inkLeft(run[i + 1].kind, scaleX);
      rel.push(rel[i] + right - left - 1);
    }
    const colLeft = geom.trackX + first.column * geom.colW;
    const colRight = geom.trackX + (last.column + 1) * geom.colW;
    const atSceneLeft = first.column === 0;
    const atSceneRight = last.column === columnCount - 1;
    const openLeft = first.column > 0 && !owned.has(first.column - 1);
    const openRight = last.column < columnCount - 1 && !owned.has(last.column + 1);
    const firstLeft = inkLeft(first.kind, scaleX);
    const lastRight = inkRight(last.kind, scaleX);
    let origin: number;
    if (atSceneLeft) {
      origin = geom.trackX - firstLeft;
    } else if (atSceneRight) {
      origin = sceneRight - lastRight - rel[rel.length - 1];
    } else if (openRight && !openLeft) {
      origin = colRight - lastRight - rel[rel.length - 1];
    } else if (openLeft && !openRight) {
      origin = colLeft - firstLeft;
    } else {
      const opaqueW = rel[rel.length - 1] + lastRight - firstLeft;
      origin = colLeft + (colRight - colLeft - opaqueW) / 2 - firstLeft;
    }
    for (let i = 0; i < run.length; i += 1) centers.set(run[i].column, Math.round(origin + rel[i]));
  }
  return centers;
}

function inkRect(kind: Piece['kind'], center: number, bottom: number, displayW: number, displayH: number): InkRect {
  const box = fenceInk(kind);
  const scaleX = displayW / fence.width;
  const scaleY = displayH / fence.height;
  return {
    left: center + (box.x - fence.width / 2) * scaleX,
    right: center + (box.x + box.w - fence.width / 2) * scaleX,
    top: bottom - (fence.height - box.y) * scaleY,
    bottom: bottom - (fence.height - box.y - box.h) * scaleY,
  };
}

function inkLeft(kind: Piece['kind'], scaleX: number): number {
  return (fenceInk(kind).x - fence.width / 2) * scaleX;
}

function inkRight(kind: Piece['kind'], scaleX: number): number {
  const box = fenceInk(kind);
  return (box.x + box.w - fence.width / 2) * scaleX;
}
