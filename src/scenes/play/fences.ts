import Phaser from 'phaser';
import { wall } from '../../constants';
import type { FenceMark } from '../../data/wave';
import { fenceBreakKey, fenceIdleKey } from '../../fenceSheet';
import type { FrameLayout } from '../../layout';
import type { FrontWall } from './wall';

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

  constructor(scene: Phaser.Scene, marks: readonly FenceMark[], mask: readonly boolean[]) {
    this.pieces = [];
    this.owned = new Set();
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
    const bottom = geom.top + geom.height;
    const width = Math.max(1, geom.colW - wall.seam);
    for (const piece of this.pieces) {
      const sprite = piece.sprite;
      if (piece.gone) {
        sprite.setVisible(false);
        continue;
      }
      sprite.setPosition(Math.round(front.columnCenter(view, piece.column)), Math.round(bottom));
      sprite.setDisplaySize(width, Math.max(1, geom.height));
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
}
