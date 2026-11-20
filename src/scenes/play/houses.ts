import Phaser from 'phaser';
import type { GroundAt } from '../../campaign/ground';
import type { HouseMark } from '../../types/house';
import { belowHorizon, type FrameLayout } from '../../layout';
import { blit, ensureCanvas } from './blit';
import { buildingBox, drawBuilding } from './buildings';
import { paintSeat } from './seat';

type House = {
  root: Phaser.GameObjects.Container;
  image: Phaser.GameObjects.Image;
  key: string;
  mark: HouseMark;
  w: number;
  h: number;
  falling: boolean;
};

/**
 * Дома картинки. Пустая полоска роняет уцелевшие. Пока по ним не стреляют.
 * Прямой низ фасада закрывает земля картинки, как у забора: иначе дом читается наклейкой.
 */
export class Houses {
  private readonly houses: House[];
  private readonly scene: Phaser.Scene;
  private readonly seatGfx: Phaser.GameObjects.Graphics;
  private readonly at: GroundAt;

  constructor(
    scene: Phaser.Scene,
    marks: readonly HouseMark[],
    field: Phaser.GameObjects.Container,
    at: GroundAt,
  ) {
    this.scene = scene;
    this.at = at;
    // Выше контейнера поля (дома), ниже кроны живого дерева.
    this.seatGfx = scene.add.graphics().setDepth(1.1);
    this.houses = marks.map((mark, index) => {
      const key = ensureCanvas(scene, `house-${index}`);
      const image = scene.add.image(0, 0, key).setOrigin(0.5, 1).setVisible(false);
      const root = scene.add.container(0, 0);
      root.add(image);
      field.add(root);
      return { root, image, key, mark, w: 0, h: 0, falling: false };
    });
  }

  place(view: FrameLayout): void {
    const field = view.field;
    for (const house of this.houses) {
      if (house.falling) continue;
      const box = buildingBox(house.mark.w, house.mark.h, house.mark.y, field);
      if (box.w !== house.w || box.h !== house.h) {
        blit(this.scene, house.key, drawBuilding(house.mark.kind, box.w, box.h));
        house.image.setTexture(house.key);
        house.image.setDisplaySize(box.w, box.h);
        house.image.setVisible(true);
        house.w = box.w;
        house.h = box.h;
      }
      house.root.setPosition(field.x + house.mark.x * field.width, field.y + belowHorizon(house.mark.y, field));
    }
    this.paintSeats(view);
  }

  /**
   * Прямую подошву закрывает та же земля, что под фасадом.
   * На падении посадка уходит: клочья газона не должны ехать вместе с домом.
   */
  private paintSeats(view: FrameLayout): void {
    this.seatGfx.clear();
    for (const house of this.houses) {
      if (house.falling || !house.image.visible) continue;
      paintSeat(
        this.seatGfx,
        this.scene,
        {
          x: house.root.x,
          y: house.root.y,
          displayWidth: house.image.displayWidth,
          displayHeight: house.image.displayHeight,
          texture: house.image.texture,
        },
        view.field,
        view.track,
        3,
        { left: true, right: true, tuft: true },
        this.at,
      );
    }
  }

  fall(): void {
    this.seatGfx.clear();
    this.houses.forEach((house, index) => {
      if (house.falling) return;
      house.falling = true;
      this.scene.tweens.add({
        targets: house.root,
        y: house.root.y + 180,
        angle: index % 2 === 0 ? 10 : -8,
        duration: 680,
        delay: index * 100,
        ease: 'Quad.easeIn',
      });
    });
  }
}
