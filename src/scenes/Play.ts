import Phaser from 'phaser';
import { afterPicture, marchFrom, marchPicture, type March } from '../campaign/march';
import type { Picture } from '../campaign/picture';
import { resolveColumnHit } from '../combat';
import { hud as hudNumbers, palette, pickup, star, type DropKind } from '../constants';
import { waveQuota, type FenceKind, type FenceMark } from '../data/wave';
import { frameLayout, type FrameLayout } from '../layout';
import { loadFenceSheets, registerFenceAnims } from '../fenceSheet';
import { Aim } from './play/aim';
import { Controls } from './play/input';
import { Drops } from './play/drops';
import { Enemies } from './play/enemies';
import { Fences } from './play/fences';
import { Grenades } from './play/grenades';
import { Gun } from './play/gun';
import { Houses } from './play/houses';
import { Hud, hudIcons } from './play/hud';
import { Props } from './play/props';
import { registerSoldierAnims, soldierSheet, soldierSheetReady } from '../soldierSheet';
import { Soldier } from './play/soldier';
import { Sparks } from './play/sparks';
import { Stage } from './play/stage';
import { FrontWall } from './play/wall';

/**
 * Картинка из маршрута. Гранаты, счёт и жизни приходят с захода, ствол — нет.
 * Куст и ящик проходят стадии и роняют на дорожку пачку, ствол или звезду. Подбор телом.
 * Частый ствол бьёт в точку, широкий — пятном. На конце сцены оба сгорают, автомат остаётся.
 * Танк-прямоугольник ест полоску. Очки за него и за крупные объекты выше, чем за зелёного.
 * Глубина сзади вперёд: небо и дома, замах, дорожка, кусты и ящики, зелёные и танк,
 * стена, дроп, солдат, очередь, прицел, рамка.
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
  private enemies!: Enemies;
  private props!: Props;
  private drops!: Drops;
  private houses!: Houses;
  private fences!: Fences;
  private sparks!: Sparks;
  private battleGfx!: Phaser.GameObjects.Graphics;
  private paused = false;
  private cleared = false;
  private down: 'continue' | 'over' | null = null;
  private handoff: March | null = null;
  private settled = false;
  private march: March = marchFrom(undefined);
  private picture!: Picture;

  constructor() {
    super('Play');
  }

  preload(): void {
    if (!this.textures.exists(hudIcons.heart)) this.load.image(hudIcons.heart, hudIcons.heartUrl);
    if (!this.textures.exists(hudIcons.grenade)) this.load.image(hudIcons.grenade, hudIcons.grenadeUrl);
    loadFenceSheets(this, fenceKinds(this.picture.fences));
  }

  init(data?: object): void {
    this.march = marchFrom(data);
    this.picture = marchPicture(this.march);
    this.paused = false;
    this.cleared = false;
    this.down = null;
    this.handoff = null;
    this.settled = false;
  }

  create(): void {
    this.cameras.main.setBackgroundColor(palette.black);
    this.wall = new FrontWall(this.picture.wall);
    this.sparks = new Sparks();
    this.stage = new Stage(this);
    this.battleGfx = this.add.graphics().setDepth(4);
    this.gun = new Gun(this);
    this.aim = new Aim(this);
    this.soldier = new Soldier(this);
    this.hud = new Hud(this, this.stage.hud);
    this.grenades = new Grenades(this, this.sparks);
    this.grenades.setStock(this.march.grenades);
    this.hud.setGrenades(this.grenades.count());
    this.drops = new Drops(this, this.sparks, (kind) => this.takeDrop(kind));
    this.props = new Props(this, this.picture.props, this.sparks, (drop, score, rx, ry) => {
      this.hud.addScore(score);
      this.drops.spawn(drop, rx, ry);
    });
    this.enemies = new Enemies(this, this.picture.wave, this.sparks, (points) => this.onKill(points), (count) =>
      this.onGone(count),
    );
    this.houses = new Houses(this, this.picture.houses, this.stage.field);
    registerFenceAnims(this, fenceKinds(this.picture.fences));
    this.fences = new Fences(this, this.picture.fences, this.picture.wall);
    this.grenades.onLand((x, y) => {
      if (this.cleared) return;
      this.enemies.blast(x, y);
      this.props.blast(x, y);
    });
    this.controls = new Controls(this, () => this.onRightClick());
    this.hud.setQuota(waveQuota(this.picture.wave));
    this.hud.carry(this.march.score, this.march.lives);

    this.scale.on(Phaser.Scale.Events.RESIZE, this.layout, this);
    this.layout();
    // Центр секции, не стык. Стык у дыры читается как «стою в проломе».
    this.soldier.standInColumn(Math.min(4, Math.max(0, this.picture.wall.length - 1)));
    this.placeSoldier();
    void this.attachSoldierSheet();
  }

  /**
   * Лист необязателен. Нет файла или размер не контракт — остаётся прямоугольник,
   * загрузчик Phaser при этом не ругается на пустой путь.
   */
  private async attachSoldierSheet(): Promise<void> {
    let response: Response;
    try {
      response = await fetch(soldierSheet.url, { method: 'HEAD' });
    } catch {
      return;
    }
    if (!response.ok) return;
    const type = response.headers.get('content-type') ?? '';
    if (type.includes('text/html')) return;
    if (this.textures.exists(soldierSheet.key)) {
      this.mountSoldierSheet();
      return;
    }
    this.load.spritesheet(soldierSheet.key, soldierSheet.url, {
      frameWidth: soldierSheet.frameWidth,
      frameHeight: soldierSheet.frameHeight,
    });
    this.load.once(Phaser.Loader.Events.COMPLETE, () => this.mountSoldierSheet());
    this.load.start();
  }

  private mountSoldierSheet(): void {
    if (!soldierSheetReady(this)) {
      if (!this.textures.exists(soldierSheet.key)) return;
      const source = this.textures.get(soldierSheet.key).getSourceImage();
      const width = soldierSheet.frameWidth * soldierSheet.columns;
      const height = soldierSheet.frameHeight * soldierSheet.rows;
      console.warn(`Лист солдата ${source.width}×${source.height}, контракт ${width}×${height}.`);
      return;
    }
    registerSoldierAnims(this);
    this.soldier.useSheet();
  }

  update(_time: number, delta: number): void {
    if (this.handoff) {
      const next = this.handoff;
      this.handoff = null;
      this.scene.restart(next);
      return;
    }
    if (this.controls.escPressed() && !this.down) this.setPaused(!this.paused);
    if (this.paused || this.down) {
      this.controls.sample();
      if (this.down === 'continue' && this.controls.enterPressed()) this.acceptContinue();
      return;
    }
    if (this.cleared) {
      const pointer = this.controls.pointer;
      if (pointer) this.aim.aimAt(pointer.x, pointer.y, this.view.field);
      this.stepClear(Math.min(delta, 50));
      this.drawBattle();
      return;
    }

    const input = this.controls.sample();
    const pointer = this.controls.pointer;
    if (pointer) this.aim.aimAt(pointer.x, pointer.y, this.view.field);
    if (input.grenadePressed) this.throwGrenade();

    const step = Math.min(delta, 50);
    if (this.soldier.tryRoll(input)) this.gun.interrupt(input.firing);
    if (this.soldier.rolling) this.soldier.advanceRoll(step);
    else this.soldier.step(step, input, input.firing && this.gun.acceptsTrigger(), this.aim.x, this.aim.y);

    this.enemies.step(step, this.soldier.column(), this.view, this.wall);
    if (this.cleared) {
      this.stepClear(step);
      this.drawBattle();
      return;
    }
    this.gun.step(step, {
      rolling: this.soldier.rolling,
      triggerDown: input.firing,
      aimX: this.aim.x,
      aimY: this.aim.y,
      muzzlePoint: () => this.soldier.barrelPoint(),
      onShot: (from, at) => this.resolvePlayerShot(from, at),
    });
    if (this.cleared) {
      this.stepClear(step);
      this.drawBattle();
      return;
    }
    for (const column of this.enemies.arrive(step)) {
      if (this.down || this.handoff) break;
      this.resolveIncoming(column);
    }
    this.soldier.setAlpha(this.hud.stepHurt(step));
    this.sparks.step(step);
    this.props.step(step);
    this.drops.step(this.view, this.soldier.body());
    this.drawBattle();
  }

  private onRightClick(): void {
    if (!this.view || this.paused || this.cleared || this.down) return;
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
    this.stage.paint(this.view, this.picture.id);
    this.soldier.bind(this.view, this.wall);
    this.grenades.bind(this.view);
    this.houses.place(this.view);
    this.enemies.bind(this.view);
    this.props.bind(this.view);
    this.fences.sync(this.view, this.wall);
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
  }

  private throwGrenade(): void {
    this.grenades.throw({
      paused: this.paused,
      rolling: this.soldier.rolling,
      from: this.soldier.muzzlePoint(),
      aimX: this.aim.x,
      aimY: this.aim.y,
    });
    this.hud.setGrenades(this.grenades.count());
  }

  private resolvePlayerShot(from: { x: number; y: number }, at: { x: number; y: number }): void {
    if (this.cleared) return;
    if (this.grenades.intercept(from.x, from.y, at.x, at.y)) return;
    if (this.enemies.hit(at.x, at.y)) return;
    if (this.props.hit(at.x, at.y)) return;
    const painted = this.fences.hitColumn(at.x, at.y);
    if (painted !== null) {
      this.wall.chip(painted, at.x, at.y, this.sparks);
      return;
    }
    const column = this.wall.aimColumn(this.view, at.x, at.y);
    if (column !== null && !this.fences.columns().has(column)) this.wall.chip(column, at.x, at.y, this.sparks);
  }

  private resolveIncoming(column: number): void {
    const x = this.wall.columnCenter(this.view, column);
    const section = this.fences.sectionAt(x);
    const cover = section !== null && this.wall.up(section);
    const wallUp = cover || (!this.fences.columns().has(column) && this.wall.up(column));
    const verdict = resolveColumnHit({
      column,
      soldierColumn: this.soldier.column(),
      wallUp,
      invulnerable: this.soldier.rolling || this.hud.hurt,
    });
    const point = cover ? { x, y: this.wall.geom(this.view).top } : this.wall.impact(this.view, column);
    if (verdict === 'wall') {
      this.wall.chip(section ?? column, point.x, point.y, this.sparks);
      return;
    }
    this.sparks.add(point.x, point.y, 120, 'puff');
    if (verdict === 'hurt') this.onLifeLost();
  }

  /**
   * Обычная картинка остаётся как есть: жизнь снята, волна на месте.
   * Босс обнуляется. Нулевая жизнь ждёт Enter, пока континуэ не кончились.
   * Континуэ обнуляет счёт, как в порте, и возвращает стартовые жизни.
   */
  private onLifeLost(): void {
    if (this.down || this.handoff) return;
    const spent = this.hud.hurtSoldier();
    this.march.lives = this.hud.livesLeft;
    this.march.score = this.hud.points;
    this.march.grenades = this.grenades.count();
    if (this.picture.boss && this.march.lives > 0) {
      this.handoff = { ...this.march };
      return;
    }
    if (!spent) return;
    if (this.march.continues > 0) {
      this.down = 'continue';
      this.hud.setHold('continue', this.march.continues);
    } else {
      this.down = 'over';
      this.hud.setHold('over');
    }
    this.tweens.pauseAll();
  }

  private acceptContinue(): void {
    this.march.continues -= 1;
    this.march.score = 0;
    this.march.lives = hudNumbers.lives;
    this.march.grenades = this.grenades.count();
    this.down = null;
    this.hud.setHold(null);
    if (this.picture.boss) {
      this.handoff = { ...this.march };
      return;
    }
    this.hud.carry(0, hudNumbers.lives);
    this.tweens.resumeAll();
  }

  /** Дома уже падают. Солдат убегает, затем следующая картинка или лишняя жизнь. */
  private stepClear(delta: number): void {
    this.sparks.step(delta);
    if (this.settled) return;
    if (!this.soldier.leave(delta)) return;
    this.march.lives = this.hud.livesLeft;
    this.march.score = this.hud.points;
    this.march.grenades = this.grenades.count();
    const next = afterPicture(this.march);
    this.march = next.march;
    if (next.done) {
      this.settled = true;
      this.hud.carry(this.march.score, this.march.lives);
      return;
    }
    this.handoff = this.march;
  }

  private onKill(points: number): void {
    this.hud.addScore(points);
    if (this.cleared) return;
    if (this.hud.eat()) this.finish();
  }

  /** Грузовик уехал или кузов не высадился. Очков нет. */
  private onGone(count: number): void {
    if (this.cleared) return;
    if (this.hud.release(count)) this.finish();
  }

  private takeDrop(kind: DropKind): void {
    if (kind === 'grenades') {
      this.grenades.add(pickup.grenades);
      this.hud.setGrenades(this.grenades.count());
      return;
    }
    if (kind === 'star') {
      this.hud.addScore(star.score);
      return;
    }
    this.gun.equip(kind);
    this.aim.setWeapon(kind);
    this.hud.setWeapon(kind);
  }

  private finish(): void {
    if (this.cleared) return;
    this.cleared = true;
    this.enemies.freeze();
    this.gun.burn();
    this.aim.setWeapon('rifle');
    this.hud.setWeapon('rifle');
    this.drops.freeze();
    this.houses.fall();
  }

  private drawBattle(): void {
    if (!this.view) return;
    const gfx = this.battleGfx;
    gfx.clear();
    this.props.draw();
    this.enemies.draw(this.view, this.wall);
    this.fences.sync(this.view, this.wall);
    this.wall.draw(gfx, this.view, this.fences.columns());
    this.drops.draw(this.view);
    this.soldier.draw();
    this.enemies.drawBullets(gfx, this.view, this.wall);
    this.grenades.draw(gfx);
    this.sparks.draw(gfx);
  }

  private setPaused(paused: boolean): void {
    this.paused = paused;
    this.hud.setHold(paused ? 'pause' : null);
    if (paused) this.tweens.pauseAll();
    else this.tweens.resumeAll();
  }
}

function fenceKinds(marks: readonly FenceMark[]): FenceKind[] {
  return [...new Set(marks.map((mark) => mark.kind))];
}
