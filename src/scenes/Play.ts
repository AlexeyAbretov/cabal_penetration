import Phaser from 'phaser';
import { resolveColumnHit } from '../combat';
import { palette } from '../constants';
import { frameLayout, type FrameLayout } from '../layout';
import { Aim } from './play/aim';
import { Controls } from './play/input';
import { Grenades } from './play/grenades';
import { Gun } from './play/gun';
import { Hud } from './play/hud';
import { Pressure } from './play/pressure';
import { Soldier } from './play/soldier';
import { Sparks } from './play/sparks';
import { Stage } from './play/stage';
import { FrontWall } from './play/wall';

/**
 * Срез 2. Колено, два переката, граната, передняя стена.
 * Пуля таймера бьёт колонку: секция цела или идёт перекат — жизнь на месте.
 * Глубина сзади вперёд: небо, поле, дорожка, стена, бой, прицел, рамка HUD.
 * Здесь только порядок кадра. Ноги, огонь, стена и очередь таймера лежат рядом, в play/.
 */
export class Play extends Phaser.Scene {
  private view!: FrameLayout;
  private stage!: Stage;
  private controls!: Controls;
  private hud!: Hud;
  private soldier!: Soldier;
  private aim!: Aim;
  private gun!: Gun;
  private wall!: FrontWall;
  private grenades!: Grenades;
  private pressure!: Pressure;
  private sparks!: Sparks;
  private battleGfx!: Phaser.GameObjects.Graphics;
  private paused = false;

  constructor() {
    super('Play');
  }

  create(): void {
    this.cameras.main.setBackgroundColor(palette.black);
    this.wall = new FrontWall();
    this.sparks = new Sparks();
    this.stage = new Stage(this);
    this.battleGfx = this.add.graphics().setDepth(4);
    this.gun = new Gun(this);
    this.aim = new Aim(this);
    this.soldier = new Soldier(this, this.stage.track);
    this.hud = new Hud(this, this.stage.hud);
    this.grenades = new Grenades(this, this.sparks);
    this.pressure = new Pressure();
    this.controls = new Controls(this, () => this.onRightClick());

    this.scale.on(Phaser.Scale.Events.RESIZE, this.layout, this);
    this.layout();
    // Центр секции, не стык. Стык у дыры читается как «стою в проломе».
    this.soldier.standInColumn(4);
    this.placeSoldier();
  }

  update(_time: number, delta: number): void {
    if (this.controls.escPressed()) this.setPaused(!this.paused);
    if (this.paused) {
      this.controls.sample();
      return;
    }

    const input = this.controls.sample();
    const pointer = this.controls.pointer;
    if (pointer) this.aim.aimAt(pointer.x, pointer.y, this.view.field);
    if (input.grenadePressed) this.throwGrenade();

    const step = Math.min(delta, 50);
    if (this.soldier.tryRoll(input)) this.gun.interrupt(input.firing);
    if (this.soldier.rolling) this.soldier.advanceRoll(step);
    else this.soldier.step(step, input);

    this.gun.step(step, {
      rolling: this.soldier.rolling,
      triggerDown: input.firing,
      aimX: this.aim.x,
      aimY: this.aim.y,
      muzzle: this.soldier.muzzle,
      muzzlePoint: () => this.soldier.muzzlePoint(),
      onShot: (from) => this.resolvePlayerShot(from),
    });
    this.pressure.step(step, this.soldier.column());
    for (const column of this.pressure.arrive(step)) this.resolveIncoming(column);
    this.soldier.setAlpha(this.hud.stepHurt(step));
    this.sparks.step(step);
    this.grenades.sync(this.soldier.x);
    this.drawBattle();
  }

  private onRightClick(): void {
    if (!this.view || this.paused) return;
    const pointer = this.controls.pointer;
    if (!pointer) return;
    this.aim.aimAt(pointer.x, pointer.y, this.view.field);
    this.throwGrenade();
  }

  private layout(): void {
    const width = Math.floor(this.scale.gameSize.width);
    const height = Math.floor(this.scale.gameSize.height);
    this.cameras.resize(width, height);
    this.view = frameLayout(width, height);
    this.stage.paint(this.view);
    this.soldier.bind(this.view, this.wall);
    this.grenades.bind(this.view);
    this.placeSoldier();
    const pointer = this.controls.pointer;
    if (pointer) {
      this.aim.aimAt(pointer.x, pointer.y, this.view.field);
    } else {
      const field = this.view.field;
      this.aim.aimAt(field.x + field.width / 2, field.y + field.height / 2, field);
    }
    this.hud.draw(this.view, width, height);
    this.drawBattle();
  }

  private placeSoldier(): void {
    this.soldier.place();
    this.grenades.sync(this.soldier.x);
  }

  private throwGrenade(): void {
    this.grenades.throw({
      paused: this.paused,
      rolling: this.soldier.rolling,
      from: this.soldier.muzzlePoint(),
      aimX: this.aim.x,
      aimY: this.aim.y,
    });
    this.grenades.sync(this.soldier.x);
  }

  private resolvePlayerShot(from: { x: number; y: number }): void {
    if (this.grenades.intercept(from.x, from.y, this.aim.x, this.aim.y)) return;
    const column = this.wall.aimColumn(this.view, this.aim.x, this.aim.y);
    if (column !== null) this.wall.chip(column, this.aim.x, this.aim.y, this.sparks);
  }

  private resolveIncoming(column: number): void {
    const verdict = resolveColumnHit({
      column,
      soldierColumn: this.soldier.column(),
      wallUp: this.wall.up(column),
      invulnerable: this.soldier.rolling || this.hud.hurt,
    });
    const point = this.wall.impact(this.view, column);
    if (verdict === 'wall') {
      this.wall.chip(column, point.x, point.y, this.sparks);
      return;
    }
    this.sparks.add(point.x, point.y, 120, 'puff');
    if (verdict === 'hurt') this.hud.hurtSoldier();
  }

  private drawBattle(): void {
    if (!this.view) return;
    const gfx = this.battleGfx;
    gfx.clear();
    this.wall.draw(gfx, this.view);
    this.pressure.draw(gfx, this.view, this.wall);
    this.grenades.draw(gfx);
    this.sparks.draw(gfx);
    this.wall.drawNotch(gfx, this.view, this.soldier.column());
  }

  private setPaused(paused: boolean): void {
    this.paused = paused;
    this.hud.setPaused(paused);
    if (paused) this.tweens.pauseAll();
    else this.tweens.resumeAll();
  }
}
