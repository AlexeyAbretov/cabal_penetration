import Phaser from 'phaser';
import { afterPicture, marchFrom, marchPicture, type March } from '../campaign/march';
import { route } from '../campaign/route';
import { bonusList, breakableCount, type Picture } from '../campaign/picture';
import { circleHitsRect, hitBox, resolveColumnHit, type HitBox } from '../combat';
import { bonus, grenade, grenadeBoom, grenadeFly, grenadeThrow, gunFire, hitFlash, hud as hudNumbers, medal, palette, pickup, star, ton, weapons, type DropKind } from '../constants';
import type { FenceKind, FenceMark } from '../types/fence';
import { waveQuota } from '../wave';
import { loadExplosion } from '../explosionSheet';
import { aimBounds, frameLayout, type FrameLayout } from '../layout';
import {
  loadFenceSheets,
  loadSandbag,
  loadShortFence,
  registerFenceAnims,
  registerSandbagAnim,
  registerShortFenceAnim,
} from '../fenceSheet';
import { treeBrokenAsset, treeWoodAsset } from './play/treeWood';
import { Aim } from './play/aim';
import { Barrels } from './play/barrels';
import { Controls } from './play/input';
import { Debris } from './play/debris';
import { DropBag, Drops } from './play/drops';
import { Enemies } from './play/enemies';
import { Fences } from './play/fences';
import { Grenades } from './play/grenades';
import { Gun, type ShotMark } from './play/gun';
import { Houses } from './play/houses';
import { Kilns } from './play/kilns';
import { Hud, hudIcons } from './play/hud';
import { Props } from './play/props';
import { plainAt } from './play/seat';
import { Pickets } from './play/pickets';
import { Rocks } from './play/rocks';
import { Rails } from './play/rails';
import { Sandbags } from './play/sandbag';
import { ShortFences } from './play/shortFence';
import { Trees } from './play/trees';
import { registerSoldierAnims, soldierSheet, soldierSheetReady } from '../soldierSheet';
import { Soldier } from './play/soldier';
import { Sparks } from './play/sparks';
import { Stage } from './play/stage';
import { FrontWall } from './play/wall';

/**
 * Картинка из маршрута. Гранаты, счёт и жизни приходят с захода, ствол — нет.
 * Куст, ящик, короткий кирпич, мешки, заборы у дороги, бочки, печь, камень, деревья и секции штакетника роняют на дорожку пачку, ствол или звезду. Подбор телом.
 * Дерево колет очередь, граната валит сразу. Щепки с места удара, у живого ещё листья и куча по ширине кроны. Ствол не пропадает: сухое на две части, живое падает под углом в треугольник.
 * Дом колет очередь и четыре гранаты. Попадание сыплет ошметками с места удара. На четвёртой он трясётся и уходит в землю, пыль стоит у цоколя лома, лом остаётся. Бонус дом не роняет.
 * Печь колет очередь и четыре гранаты, как дом: кирпич с места удара, тряска, уход в землю, пыль у подошвы, лом остаётся. Прямой низ закрывает газон.
 * Камень колет очередь, граната разбивает сразу. Крошка с места удара. Куча руин остаётся. Прямой низ закрывает газон.
 * Удар — прямоугольник креста: частый уже, широкий шире и ниже, и больнее. Оба держат десять секунд и сгорают на конце сцены.
 * Танк-прямоугольник ест полоску. Очки за него и за крупные объекты выше, чем за зелёного.
 * Глубина сзади вперёд: небо и дома, крона живого дерева, замах, дорожка, кусты и ящики, зелёные и танк,
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
  private kilns!: Kilns;
  private rocks!: Rocks;
  private fences!: Fences;
  private shorts!: ShortFences;
  private bags!: Sandbags;
  private rails!: Rails;
  private pickets!: Pickets;
  private barrels!: Barrels;
  private trees!: Trees;
  private sparks!: Sparks;
  private debris!: Debris;
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
    if (!this.textures.exists(treeWoodAsset.key)) this.load.image(treeWoodAsset.key, treeWoodAsset.url);
    if (!this.textures.exists(treeBrokenAsset.key)) this.load.image(treeBrokenAsset.key, treeBrokenAsset.url);
    if (!this.textures.exists(hudIcons.heart)) this.load.image(hudIcons.heart, hudIcons.heartUrl);
    if (!this.textures.exists(hudIcons.grenade)) this.load.image(hudIcons.grenade, hudIcons.grenadeUrl);
    if (!this.textures.exists(grenadeFly.key)) this.load.image(grenadeFly.key, grenadeFly.url);
    if (!this.textures.exists(hitFlash.key)) {
      this.load.spritesheet(hitFlash.key, hitFlash.url, {
        frameWidth: hitFlash.frameWidth,
        frameHeight: hitFlash.frameHeight,
      });
    }
    loadExplosion(this);
    loadFenceSheets(this, fenceKinds(this.picture.fences));
    if (this.picture.shorts.length > 0) loadShortFence(this);
    if (this.picture.sandbags.length > 0) loadSandbag(this);
    if (!this.cache.audio.exists(gunFire.key)) this.load.audio(gunFire.key, gunFire.url);
    if (!this.cache.audio.exists(grenadeThrow.key)) this.load.audio(grenadeThrow.key, grenadeThrow.url);
    if (!this.cache.audio.exists(grenadeBoom.key)) this.load.audio(grenadeBoom.key, grenadeBoom.url);
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
    this.debris = new Debris(this);
    this.stage = new Stage(this);
    this.battleGfx = this.add.graphics().setDepth(4);
    this.gun = new Gun(this);
    this.aim = new Aim(this);
    this.soldier = new Soldier(this);
    this.hud = new Hud(this, this.stage.hud);
    const level = route[this.march.level];
    this.hud.setPictures(
      level?.pictures.map((row) => row.id) ?? [this.picture.id],
      this.march.picture,
      (index) => this.jumpPicture(index),
    );
    this.grenades = new Grenades(this, this.sparks);
    this.grenades.setStock(this.march.grenades);
    this.hud.setGrenades(this.grenades.count());
    this.drops = new Drops(this, this.sparks, (kind) => this.takeDrop(kind));
    const opened = frameLayout(Math.floor(this.scale.gameSize.width), Math.floor(this.scale.gameSize.height)).field;
    const bag = new DropBag(bonusList(this.picture, opened), breakableCount(this.picture, opened), this.picture.id);
    const scatter = (score: number, rx: number, ry: number): void => {
      this.hud.addScore(score);
      this.drops.spawn(bag.take(), rx, ry);
    };
    this.props = new Props(this, this.picture.props, this.sparks, scatter);
    const earth = this.picture.ground?.at ?? plainAt;
    if (this.picture.shorts.length > 0) registerShortFenceAnim(this);
    this.shorts = new ShortFences(this, this.picture.shorts, this.debris, scatter, earth);
    if (this.picture.sandbags.length > 0) registerSandbagAnim(this);
    this.bags = new Sandbags(this, this.picture.sandbags, this.debris, scatter, earth);
    this.rails = new Rails(this, this.picture.rails, this.stage.field, scatter, (width, height) =>
      this.stage.railLayout(width, height),
    );
    this.barrels = new Barrels(this, this.picture.barrels, this.stage.field, scatter);
    this.trees = new Trees(this, this.picture.trees, scatter);
    this.pickets = new Pickets(this, this.picture.pickets, this.stage.field, scatter);
    this.enemies = new Enemies(this, this.picture.wave, this.sparks, (points) => this.onKill(points), (count) =>
      this.onGone(count),
    );
    this.houses = new Houses(this, this.picture.houses, this.stage.field, earth, this.debris, scatter);
    this.kilns = new Kilns(this, this.picture.kilns, earth, this.debris, scatter);
    this.rocks = new Rocks(this, this.picture.rocks, earth, this.debris, scatter);
    registerFenceAnims(this, fenceKinds(this.picture.fences));
    this.fences = new Fences(this, this.picture.fences, this.picture.wall, this.debris, earth);
    this.grenades.onLand((x, y) => {
      if (this.cleared) return;
      this.enemies.blast(x, y);
      this.props.blast(x, y);
      this.shorts.blast(x, y);
      this.bags.blast(x, y);
      this.rails.blast(x, y);
      this.barrels.blast(x, y);
      this.trees.blast(x, y);
      this.pickets.blast(x, y);
      this.houses.blast(x, y);
      this.kilns.blast(x, y);
      this.rocks.blast(x, y);
      this.blastFrontWall(x, y);
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
      this.gun.quiet();
      this.scene.restart(next);
      return;
    }
    if (this.controls.escPressed() && !this.down) this.setPaused(!this.paused);
    if (this.paused || this.down) {
      this.gun.quiet();
      this.controls.sample();
      if (this.down === 'continue' && this.controls.enterPressed()) this.acceptContinue();
      return;
    }
    this.grenades.step(Math.min(delta, 50));
    if (this.cleared) {
      this.gun.quiet();
      this.aim.step(Math.min(delta, 50));
      const pointer = this.controls.pointer;
      if (pointer) this.aim.aimAt(pointer.x, pointer.y, aimBounds(this.view));
      this.stepClear(Math.min(delta, 50));
      this.drawBattle();
      return;
    }

    const input = this.controls.sample();
    const pointer = this.controls.pointer;
    const step = Math.min(delta, 50);
    this.aim.step(step);
    if (pointer) this.aim.aimAt(pointer.x, pointer.y, aimBounds(this.view));
    if (input.grenadePressed) this.throwGrenade();
    if (this.soldier.tryRoll(input)) this.gun.interrupt(input.firing);
    if (this.soldier.rolling) this.soldier.advanceRoll(step);
    else this.soldier.step(step, input, input.firing && this.gun.acceptsTrigger(), this.aim.x, this.aim.y);

    this.enemies.step(step, this.soldier.column(), this.view, this.wall);
    if (this.cleared) {
      this.gun.quiet();
      this.stepClear(step);
      this.drawBattle();
      return;
    }
    const weaponSpent = this.gun.step(step, {
      rolling: this.soldier.rolling,
      triggerDown: input.firing,
      aimX: this.aim.x,
      aimY: this.aim.y,
      muzzlePoint: () => this.soldier.barrelPoint(),
      onShot: (from, at, mark) => {
        this.aim.flash();
        this.resolvePlayerShot(from, at, mark);
      },
    });
    if (weaponSpent) this.restoreRifle();
    if (this.cleared) {
      this.gun.quiet();
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
    this.debris.step(step);
    this.props.step(step);
    this.shorts.step(step);
    this.bags.step(step);
    this.rails.step(step);
    this.barrels.step(step);
    this.trees.step(step);
    this.pickets.step(step);
    this.houses.step(step);
    this.kilns.step(step);
    this.rocks.step(step);
    this.drops.step(this.view, this.soldier.body());
    this.drawBattle();
  }

  /** Смена картинки из рамки. Счёт, жизни и гранаты остаются, ствол сгорает вместе со сценой. */
  private jumpPicture(index: number): void {
    if (index === this.march.picture || this.handoff || this.cleared || this.down) return;
    const level = route[this.march.level];
    if (!level || index < 0 || index >= level.pictures.length) return;
    this.handoff = {
      ...this.march,
      picture: index,
      lives: this.hud.livesLeft,
      score: this.hud.points,
      grenades: this.grenades.count(),
    };
    this.gun.quiet();
  }

  private onRightClick(): void {
    if (!this.view || this.paused || this.cleared || this.down) return;
    const pointer = this.controls.pointer;
    if (!pointer) return;
    this.aim.aimAt(pointer.x, pointer.y, aimBounds(this.view));
    this.throwGrenade();
  }

  private layout(): void {
    const width = Math.floor(this.scale.gameSize.width);
    const height = Math.floor(this.scale.gameSize.height);
    this.cameras.resize(width, height);
    this.view = frameLayout(width, height);
    this.stage.paint(this.view, this.picture.ground ?? null);
    this.soldier.bind(this.view, this.wall);
    this.grenades.bind(this.view);
    this.houses.place(this.view);
    this.kilns.place(this.view);
    this.rocks.place(this.view);
    this.enemies.bind(this.view);
    this.props.bind(this.view);
    this.shorts.bind(this.view);
    this.bags.bind(this.view);
    this.rails.bind(this.view);
    this.barrels.bind(this.view);
    this.trees.bind(this.view);
    this.pickets.bind(this.view);
    this.fences.sync(this.view, this.wall);
    this.placeSoldier();
    const pointer = this.controls.pointer;
    if (pointer) {
      this.aim.aimAt(pointer.x, pointer.y, aimBounds(this.view));
    } else {
      const field = this.view.field;
      this.aim.aimAt(field.x + field.width / 2, field.y + field.height / 2, aimBounds(this.view));
    }
    this.hud.draw(this.view, width, height);
    this.drawBattle();
  }

  private placeSoldier(): void {
    this.soldier.place();
  }

  /** Разрыв снимает переднюю стену, если кладка входит в круг. Пустое место рядом стену не берёт. */
  private blastFrontWall(x: number, y: number): void {
    const doomed = new Set(this.fences.blastColumns(x, y, grenade.blastRadius));
    const sheet = this.fences.columns();
    for (let column = 0; column < this.wall.count(); column += 1) {
      if (sheet.has(column)) continue;
      const face = this.wall.stoneRect(this.view, column);
      if (!face || !circleHitsRect(x, y, grenade.blastRadius, face)) continue;
      doomed.add(column);
    }
    const geom = this.wall.geom(this.view);
    const mid = geom.top + geom.height / 2;
    for (const column of doomed) {
      this.breakCover(column, this.wall.columnCenter(this.view, column), mid);
    }
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

  /**
   * Прямоугольник креста бьёт всех, кто в него попал. Узкий выстрел, поймавший гранату
   * на луче, до поля не доходит. Широкий снимает гранаты в кресте и всё равно бьёт.
   */
  private resolvePlayerShot(from: { x: number; y: number }, at: { x: number; y: number }, shot: ShotMark): void {
    if (this.cleared || !this.view) return;
    const box = hitBox(at.x, at.y, shot.reach, shot.reachY);
    const along = this.grenades.intercept(from.x, from.y, at.x, at.y);
    const inCross = this.grenades.sweep(box);
    if (shot.reach <= weapons.rifle.reach && (along || inCross)) return;
    this.enemies.hit(box, shot.damage);
    this.props.hit(box, shot.damage);
    this.shorts.hit(box, shot.damage);
    this.bags.hit(box, shot.damage);
    this.rails.hit(box, shot.damage);
    this.barrels.hit(box, shot.damage);
    this.trees.hit(box, shot.damage);
    this.pickets.hit(box, shot.damage);
    this.houses.hit(box, shot.damage);
    this.kilns.hit(box, shot.damage);
    this.rocks.hit(box, shot.damage);
    this.chipCover(box, shot.damage, at);
  }

  /** Каждая секция стены, чья кладка входит в крест, теряет удар ствола. */
  private chipCover(box: HitBox, amount: number, at: { x: number; y: number }): void {
    const hit = new Set<number>();
    for (const column of this.fences.hitColumns(box)) hit.add(column);
    const sheet = this.fences.columns();
    for (const column of this.wall.hitColumns(this.view, box)) {
      if (!sheet.has(column)) hit.add(column);
    }
    for (const column of hit) {
      this.strikeCover(column, at.x, at.y, amount);
    }
  }

  /** Лист сыплет свою крошку. Голая стена оставляет крест. */
  private strikeCover(column: number, x: number, y: number, amount: number): void {
    const sheet = this.fences.columns().has(column);
    const flashX = this.wall.columnCenter(this.view, column);
    const verdict = this.wall.chip(column, flashX, y, this.sparks, amount, !sheet);
    if (sheet && verdict !== 'miss') this.fences.spray(column, x, y, verdict === 'down');
  }

  /** Граната снимает секцию. У листа вместо вспышки — осколки по лицу. */
  private breakCover(column: number, x: number, y: number): void {
    const sheet = this.fences.columns().has(column);
    const fell = this.wall.ruin(column, x, y, this.sparks, !sheet);
    if (sheet && fell) this.fences.spray(column, x, y, true);
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
      this.strikeCover(section ?? column, point.x, point.y, 1);
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
      this.gun.quiet();
      return;
    }
    if (!spent) return;
    this.gun.quiet();
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
    this.debris.step(delta);
    this.rails.step(delta);
    this.barrels.step(delta);
    this.trees.step(delta);
    this.pickets.step(delta);
    this.houses.step(delta);
    this.kilns.step(delta);
    this.rocks.step(delta);
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
    if (kind === 'bonus') {
      this.hud.addScore(bonus.score);
      return;
    }
    if (kind === 'medal') {
      this.hud.addScore(medal.score);
      return;
    }
    if (kind === 'ton') {
      this.hud.addScore(ton.score);
      return;
    }
    this.gun.equip(kind);
    this.aim.setWeapon(kind);
    this.hud.setWeapon(kind);
  }

  /** Десять секунд вышли или сцена кончилась: крест и значок снова от автомата. */
  private restoreRifle(): void {
    this.aim.setWeapon('rifle');
    this.hud.setWeapon('rifle');
  }

  private finish(): void {
    if (this.cleared) return;
    this.cleared = true;
    this.enemies.freeze();
    this.gun.burn();
    this.restoreRifle();
    this.drops.freeze();
    this.houses.fall();
    this.kilns.fall();
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
    this.debris.draw();
    this.rails.draw();
    this.barrels.draw();
    this.trees.draw();
    this.pickets.draw();
    this.houses.draw();
    this.kilns.draw();
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
