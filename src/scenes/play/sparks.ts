import Phaser from 'phaser';
import { palette } from '../../constants';

type SparkKind = 'land' | 'pop' | 'chip' | 'puff';

type Spark = {
  x: number;
  y: number;
  life: number;
  max: number;
  kind: SparkKind;
};

/** Короткие вспышки попадания, скола и разрыва. Рисуются в общий слой боя. */
export class Sparks {
  private sparks: Spark[] = [];

  add(x: number, y: number, life: number, kind: SparkKind): void {
    this.sparks.push({ x, y, life, max: life, kind });
  }

  step(delta: number): void {
    this.sparks = this.sparks.filter((spark) => {
      spark.life -= delta;
      return spark.life > 0;
    });
  }

  draw(gfx: Phaser.GameObjects.Graphics): void {
    for (const spark of this.sparks) {
      const k = 1 - spark.life / spark.max;
      const alpha = Math.max(0, spark.life / spark.max);
      const reach =
        spark.kind === 'land' ? 8 + Math.round(k * 26) : spark.kind === 'pop' ? 6 + Math.round(k * 14) : 5;
      const color =
        spark.kind === 'chip' ? palette.wallHurt : spark.kind === 'puff' ? palette.enemyBullet : palette.explosion;
      gfx.fillStyle(color, alpha);
      gfx.fillRect(spark.x - reach / 2, spark.y - 2, reach, 4);
      gfx.fillRect(spark.x - 2, spark.y - reach / 2, 4, reach);
    }
  }
}
