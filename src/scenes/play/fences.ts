import Phaser from 'phaser';
import { fence, wall } from '../../constants';
import type { FenceMark } from '../../data/wave';
import { fenceBreakKey, fenceIdleKey, fenceInk } from '../../fenceSheet';
import type { FrameLayout } from '../../layout';
import { type FrontWall, type WallGeom } from './wall';

type Piece = {
  column: number;
  kind: FenceMark['kind'];
  sprite: Phaser.GameObjects.Sprite;
  breaking: boolean;
  gone: boolean;
};

/**
 * Лист на передней стене, позади солдата. Колонка пулю не пускает, пока цела.
 * Когда жизни колонки кончаются, секция играет ролик и пропадает.
 * У картинки свой список: какие колонки каким листом закрыты.
 */
export class Fences {
  private readonly pieces: Piece[];
  private readonly owned: Set<number>;
  private readonly columnCount: number;

  constructor(scene: Phaser.Scene, marks: readonly FenceMark[], mask: readonly boolean[]) {
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
        this.pieces.push({ column, kind: mark.kind, sprite, breaking: false, gone: false });
      }
    }
  }

  /** Колонки, которые рисует лист. Заглушка их не закрашивает. */
  columns(): ReadonlySet<number> {
    return this.owned;
  }

  sync(view: FrameLayout, front: FrontWall): void {
    const geom = front.geom(view);
    const bottom = Math.round(geom.top + geom.height);
    const width = Math.max(1, geom.colW - wall.seam);
    const height = Math.max(1, geom.height);
    const centers = joinedCenters(this.runs(), geom, width / fence.width, this.owned, this.columnCount);
    for (const piece of this.pieces) {
      const sprite = piece.sprite;
      if (piece.gone) {
        sprite.setVisible(false);
        continue;
      }
      sprite.setPosition(centers.get(piece.column) ?? Math.round(front.columnCenter(view, piece.column)), bottom);
      sprite.setDisplaySize(width, height);
      sprite.setVisible(true);
      if (front.up(piece.column) || piece.breaking) continue;
      piece.breaking = true;
      sprite.play(fenceBreakKey(piece.kind));
      sprite.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
        piece.gone = true;
        sprite.setVisible(false);
      });
    }
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
 * Кусок у дыры прижат к ней, запасная земля остаётся с внешнего края.
 */
function joinedCenters(
  runs: readonly Piece[][],
  geom: WallGeom,
  scaleX: number,
  owned: ReadonlySet<number>,
  columnCount: number,
): Map<number, number> {
  const centers = new Map<number, number>();
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
    const openLeft = first.column > 0 && !owned.has(first.column - 1);
    const openRight = last.column < columnCount - 1 && !owned.has(last.column + 1);
    const firstLeft = inkLeft(first.kind, scaleX);
    const lastRight = inkRight(last.kind, scaleX);
    let origin: number;
    if (openRight && !openLeft) {
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

function inkLeft(kind: Piece['kind'], scaleX: number): number {
  return (fenceInk(kind).x - fence.width / 2) * scaleX;
}

function inkRight(kind: Piece['kind'], scaleX: number): number {
  const box = fenceInk(kind);
  return (box.x + box.w - fence.width / 2) * scaleX;
}
