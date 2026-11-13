import Phaser from 'phaser';
import { palette } from '../../constants';
import { drillHouses } from '../../data/wave';
import type { FrameLayout } from '../../layout';

type House = {
  root: Phaser.GameObjects.Container;
  x: number;
  y: number;
  falling: boolean;
};

/** Прямоугольники деревни. Пока целы, стоят. Пустая полоска роняет все уцелевшие. */
export class Houses {
  private readonly houses: House[];
  private readonly scene: Phaser.Scene;

  constructor(scene: Phaser.Scene, field: Phaser.GameObjects.Container) {
    this.scene = scene;
    this.houses = drillHouses.map((mark) => {
      const roofH = 14;
      const root = scene.add.container(0, 0);
      const body = scene.add.rectangle(0, roofH / 2, mark.w, mark.h - roofH, palette.house);
      const roof = scene.add.rectangle(0, -mark.h / 2 + roofH / 2, mark.w + 8, roofH, palette.houseRoof);
      root.add(body);
      root.add(roof);
      field.add(root);
      return { root, x: mark.x, y: mark.y, falling: false };
    });
  }

  place(view: FrameLayout): void {
    const field = view.field;
    for (const house of this.houses) {
      if (house.falling) continue;
      house.root.setPosition(field.x + house.x * field.width, field.y + house.y * field.height);
    }
  }

  fall(): void {
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
