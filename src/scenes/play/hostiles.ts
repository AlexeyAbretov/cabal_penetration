import Phaser from 'phaser';
import type { FlightArrival, FlightBlock, HitBox } from '../../combat';
import type { Cover } from '../../cover';
import type { Picture } from '../../campaign/picture';
import { riderCount, scaleHurt, scaleWave, type Difficulty } from '../../difficulty';
import { gameRuntime } from '../../runtime';
import { isInfantry, isPack, waveQuota } from '../../wave';
import type { DropKind } from '../../constants';
import type { FrameLayout } from '../../layout';
import { EnemyBag } from './drops';
import { Enemies } from './enemies';
import { Infantry } from './infantry';
import type { Sparks } from './sparks';
import type { FrontWall } from './wall';

export type HostileNote = {
  infantry: unknown;
  enemies: unknown;
  enemyBag: DropKind[][] | null;
};

export type HostileRecall = {
  infantry: unknown;
  enemies: unknown;
  enemyBag: DropKind[][] | null;
  slain: number;
};

export type HostileMount = {
  layer: Hostiles;
  /** Сколько жизней снимает одно вражеское попадание. На полигоне ноль. */
  strike: number;
};

/**
 * Всё, что спавнит волну, ест полоску ENEMY и стреляет в колонку.
 * Play зовёт один фасад; бой и полигон подставляют свою реализацию.
 */
export abstract class Hostiles {
  abstract quota(): number;

  abstract bind(view: FrameLayout): void;

  abstract step(
    delta: number,
    playerColumn: number,
    view: FrameLayout,
    columns: FrontWall,
    playerX: number,
  ): void;

  abstract arrive(
    delta: number,
    view: FrameLayout,
    columns: FrontWall,
    blocks: readonly FlightBlock[],
  ): FlightArrival[];

  abstract hit(box: HitBox, amount: number, covers: readonly Cover[]): void;

  abstract blast(x: number, y: number, covers: readonly Cover[]): void;

  abstract freeze(): void;

  abstract draw(covers: readonly Cover[]): void;

  abstract drawBullets(
    gfx: Phaser.GameObjects.Graphics,
    view: FrameLayout,
    columns: FrontWall,
    blocks: readonly FlightBlock[],
  ): void;

  abstract recall(kept: HostileRecall): void;

  abstract note(): HostileNote;

  /** Доля дропа за одно убийство. На полигоне пусто. */
  abstract takeKillDrops(): readonly DropKind[];
}

/** Волна картинки: пехота, техника, доли дропа с убийств. */
class WaveHostiles extends Hostiles {
  private readonly spoils: EnemyBag;
  private readonly enemies: Enemies;
  private readonly infantry: Infantry;
  private readonly quotaTotal: number;

  constructor(
    scene: Phaser.Scene,
    picture: Picture,
    sparks: Sparks,
    onKill: (points: number, rx: number, ry: number) => void,
    onGone: (count: number) => void,
    difficulty: Difficulty | null,
  ) {
    super();
    const enemies = difficulty?.enemies ?? 1;
    const hp = difficulty?.hp ?? 1;
    const wave = scaleWave(picture.wave, enemies);
    const riders = riderCount(enemies);
    this.quotaTotal = waveQuota(wave, riders);
    this.spoils = new EnemyBag(picture.enemyDrops, waveQuota(wave, riders));
    this.enemies = new Enemies(
      scene,
      wave.filter(isPack),
      sparks,
      onKill,
      onGone,
      hp,
      riders,
    );
    this.infantry = new Infantry(scene, wave.filter(isInfantry), sparks, onKill, hp);
  }

  quota(): number {
    return this.quotaTotal;
  }

  bind(view: FrameLayout): void {
    this.enemies.bind(view);
    this.infantry.bind(view);
  }

  step(
    delta: number,
    playerColumn: number,
    view: FrameLayout,
    columns: FrontWall,
    playerX: number,
  ): void {
    this.enemies.step(delta, playerColumn, view, columns, playerX);
    this.infantry.step(delta, playerColumn, view, columns, playerX);
  }

  arrive(
    delta: number,
    view: FrameLayout,
    columns: FrontWall,
    blocks: readonly FlightBlock[],
  ): FlightArrival[] {
    return [...this.enemies.arrive(delta, view, columns, blocks), ...this.infantry.arrive(delta, view, columns, blocks)];
  }

  hit(box: HitBox, amount: number, covers: readonly Cover[]): void {
    this.enemies.hit(box, amount);
    this.infantry.hit(box, amount, covers);
  }

  blast(x: number, y: number, covers: readonly Cover[]): void {
    this.enemies.blast(x, y);
    this.infantry.blast(x, y, covers);
  }

  freeze(): void {
    this.enemies.freeze();
    this.infantry.freeze();
  }

  draw(covers: readonly Cover[]): void {
    this.enemies.draw();
    this.infantry.draw(covers);
  }

  drawBullets(
    gfx: Phaser.GameObjects.Graphics,
    view: FrameLayout,
    columns: FrontWall,
    blocks: readonly FlightBlock[],
  ): void {
    this.enemies.drawBullets(gfx, view, columns, blocks);
    this.infantry.drawBullets(gfx, view, columns, blocks);
  }

  recall(kept: HostileRecall): void {
    if (!this.spoils.recall(kept.enemyBag)) this.spoils.skip(kept.slain);
    this.infantry.recall(kept.infantry);
    this.enemies.recall(kept.enemies);
  }

  note(): HostileNote {
    return {
      enemyBag: this.spoils.note(),
      infantry: this.infantry.note(),
      enemies: this.enemies.note(),
    };
  }

  takeKillDrops(): readonly DropKind[] {
    return this.spoils.take();
  }
}

/** Полигон: стрельба по декору, полоска ENEMY скрыта, волны нет. */
class QuietHostiles extends Hostiles {
  quota(): number {
    return 0;
  }

  bind(_view: FrameLayout): void {}

  step(
    _delta: number,
    _playerColumn: number,
    _view: FrameLayout,
    _columns: FrontWall,
    _playerX: number,
  ): void {}

  arrive(
    _delta: number,
    _view: FrameLayout,
    _columns: FrontWall,
    _blocks: readonly FlightBlock[],
  ): FlightArrival[] {
    return [];
  }

  hit(_box: HitBox, _amount: number, _covers: readonly Cover[]): void {}

  blast(_x: number, _y: number, _covers: readonly Cover[]): void {}

  freeze(): void {}

  draw(_covers: readonly Cover[]): void {}

  drawBullets(
    _gfx: Phaser.GameObjects.Graphics,
    _view: FrameLayout,
    _columns: FrontWall,
    _blocks: readonly FlightBlock[],
  ): void {}

  recall(_kept: HostileRecall): void {}

  note(): HostileNote {
    return { enemyBag: null, infantry: null, enemies: null };
  }

  takeKillDrops(): readonly DropKind[] {
    return [];
  }
}

export function openHostiles(
  scene: Phaser.Scene,
  picture: Picture,
  sparks: Sparks,
  onKill: (points: number, rx: number, ry: number) => void,
  onGone: (count: number) => void,
  difficulty: Difficulty | null,
): HostileMount {
  if (gameRuntime().withoutEnemies) {
    return { layer: new QuietHostiles(), strike: 0 };
  }
  const strike = difficulty ? scaleHurt(difficulty.damage) : 1;
  return {
    layer: new WaveHostiles(scene, picture, sparks, onKill, onGone, difficulty),
    strike,
  };
}