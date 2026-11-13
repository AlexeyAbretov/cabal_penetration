import Phaser from 'phaser';
import { arcPoint, columnIndex, distanceToSegment, resolveColumnHit } from '../combat';
import {
  aimMark,
  cssColor,
  fireIntervalMs,
  frame,
  grenade,
  hud,
  kneelScale,
  motion,
  muzzleFlashMs,
  palette,
  rollMove,
  soldierBox,
  tracerLength,
  tracerTravelMs,
  volley,
  wall,
} from '../constants';
import { rangeWall } from '../data/range';
import { clampToRect, frameLayout, type FrameLayout } from '../layout';

type Shot = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  life: number;
};

type MoveInput = {
  left: boolean;
  right: boolean;
  shift: boolean;
  kneel: boolean;
  space: boolean;
  ctrl: boolean;
  firing: boolean;
  dirPressed: boolean;
  shiftPressed: boolean;
  spacePressed: boolean;
  ctrlPressed: boolean;
  grenadePressed: boolean;
};

type Roll = {
  dir: -1 | 1;
  duration: number;
  elapsed: number;
  distance: number;
  originX: number;
};

type Grenade = {
  t: number;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  ctrlX: number;
  ctrlY: number;
  alive: boolean;
  tween: Phaser.Tweens.Tween | null;
};

type Incoming = {
  column: number;
  elapsed: number;
};

type Spark = {
  x: number;
  y: number;
  life: number;
  max: number;
  kind: 'land' | 'pop' | 'chip' | 'puff';
};

type Pose = 'stand' | 'kneel' | 'roll';

/**
 * Срез 2. Колено, два переката, граната, передняя стена.
 * Пуля таймера бьёт колонку: секция цела или идёт перекат — жизнь на месте.
 * Глубина сзади вперёд: небо, поле, дорожка, стена, бой, прицел, рамка HUD.
 */
export class Play extends Phaser.Scene {
  private view!: FrameLayout;
  private skyFill!: Phaser.GameObjects.Graphics;
  private fieldFill!: Phaser.GameObjects.Graphics;
  private trackFill!: Phaser.GameObjects.Graphics;
  private hudFill!: Phaser.GameObjects.Graphics;
  private edge!: Phaser.GameObjects.Graphics;
  private battleGfx!: Phaser.GameObjects.Graphics;
  private heartGfx!: Phaser.GameObjects.Graphics;
  private soldier!: Phaser.GameObjects.Rectangle;
  private muzzle!: Phaser.GameObjects.Rectangle;
  private aimGfx!: Phaser.GameObjects.Graphics;
  private shotsGfx!: Phaser.GameObjects.Graphics;
  private pauseVeil!: Phaser.GameObjects.Graphics;
  private pauseLabel!: Phaser.GameObjects.Text;
  private livesText!: Phaser.GameObjects.Text;
  private scoreText!: Phaser.GameObjects.Text;
  private grenadeLabel!: Phaser.GameObjects.Text;
  private keys!: {
    left: Phaser.Input.Keyboard.Key;
    right: Phaser.Input.Keyboard.Key;
    leftArrow: Phaser.Input.Keyboard.Key;
    rightArrow: Phaser.Input.Keyboard.Key;
    down: Phaser.Input.Keyboard.Key;
    downArrow: Phaser.Input.Keyboard.Key;
    shift: Phaser.Input.Keyboard.Key;
    space: Phaser.Input.Keyboard.Key;
    ctrl: Phaser.Input.Keyboard.Key;
    grenade: Phaser.Input.Keyboard.Key;
    esc: Phaser.Input.Keyboard.Key;
  };

  /** 0 — левый край хитбокса, 1 — правый. На ресайзе солдат остаётся на той же доле. */
  private soldierRatio = 0.5;
  private soldierX = 0;
  /** Бег держится, пока Shift в связке с направлением. Огонь и перекат связку рвут. */
  private runLatched = false;
  private kneeling = false;
  private pose: Pose = 'stand';
  private roll: Roll | null = null;
  /** Очередь не переживает кувырок: кнопку надо отпустить и нажать снова. */
  private blockFire = false;
  private aimX = 0;
  private aimY = 0;
  private livePointer: { x: number; y: number } | null = null;
  private paused = false;
  private fireCooldown = 0;
  private muzzleLife = 0;
  private shots: Shot[] = [];
  private wallHp: number[] = [];
  private grenadeStock = grenade.stock;
  private grenades: Grenade[] = [];
  private incoming: Incoming[] = [];
  private sparks: Spark[] = [];
  private lives: number = hud.lives;
  private score = 0;
  private hurtTimer = 0;
  private pressure: { column: number; phase: 'recover' | 'volley'; wait: number; shotsLeft: number } = {
    column: 0,
    phase: 'recover',
    wait: volley.openMs,
    shotsLeft: 0,
  };

  constructor() {
    super('Play');
  }

  create(): void {
    this.cameras.main.setBackgroundColor(palette.black);
    this.wallHp = rangeWall.map((up) => (up ? wall.hits : 0));

    const sky = this.layer('sky', 0);
    const field = this.layer('field', 1);
    const track = this.layer('track', 2);
    this.battleGfx = this.add.graphics().setDepth(4);
    this.shotsGfx = this.add.graphics().setDepth(4);
    this.aimGfx = this.add.graphics().setDepth(5);
    const hudLayer = this.layer('hud', 6);

    this.skyFill = this.bandFill(sky);
    this.fieldFill = this.bandFill(field);
    this.trackFill = this.bandFill(track);
    this.hudFill = this.bandFill(hudLayer);

    this.soldier = this.add
      .rectangle(0, 0, soldierBox.width, soldierBox.height, palette.soldier)
      .setOrigin(0.5, 0.5);
    track.add(this.soldier);
    this.muzzle = this.add
      .rectangle(0, 0, 10, 4, palette.muzzle)
      .setOrigin(0.5, 1)
      .setVisible(false);
    track.add(this.muzzle);

    this.heartGfx = this.add.graphics();
    hudLayer.add(this.heartGfx);
    const font = {
      fontFamily: 'Consolas, "Courier New", monospace',
      fontSize: '22px',
      color: cssColor(palette.ink),
    };
    this.livesText = this.add.text(0, 0, '', font).setOrigin(0, 0.5);
    this.scoreText = this.add.text(0, 0, '', font).setOrigin(0, 0.5);
    hudLayer.add(this.livesText);
    hudLayer.add(this.scoreText);

    this.grenadeLabel = this.add
      .text(0, 0, '', {
        fontFamily: font.fontFamily,
        fontSize: '20px',
        color: cssColor(palette.ink),
      })
      .setOrigin(0.5, 0)
      .setDepth(5);

    this.pauseVeil = this.add.graphics().setVisible(false);
    hudLayer.add(this.pauseVeil);
    this.pauseLabel = this.add
      .text(0, 0, 'ПАУЗА', {
        fontFamily: font.fontFamily,
        fontSize: '32px',
        color: cssColor(palette.ink),
      })
      .setOrigin(0.5)
      .setVisible(false);
    hudLayer.add(this.pauseLabel);

    this.edge = this.add.graphics();
    hudLayer.add(this.edge);

    this.bindInput();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.layout, this);
    this.layout();
    // Центр секции, не стык. Стык у дыры читается как «стою в проломе».
    this.standInColumn(4);
    this.placeSoldier();
  }

  update(_time: number, delta: number): void {
    if (Phaser.Input.Keyboard.JustDown(this.keys.esc)) {
      this.setPaused(!this.paused);
    }
    if (this.paused) {
      this.sampleInput();
      return;
    }

    const input = this.sampleInput();
    if (this.livePointer) {
      this.aimAt(this.livePointer.x, this.livePointer.y);
    }
    if (input.grenadePressed) this.throwGrenade();

    const step = Math.min(delta, 50);
    this.tryRoll(input);
    if (this.roll) this.advanceRoll(step);
    else this.stepSoldier(step, input);
    this.stepFire(step);
    this.stepShots(step);
    this.stepPressure(step);
    this.stepIncoming(step);
    this.stepHurt(step);
    this.stepSparks(step);
    this.drawBattle();
  }

  private bindInput(): void {
    const keyboard = this.input.keyboard;
    if (!keyboard) {
      throw new Error('Клавиатура нужна: ей ходят ноги');
    }

    const cursors = keyboard.createCursorKeys();
    this.keys = {
      left: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      right: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D),
      leftArrow: cursors.left,
      rightArrow: cursors.right,
      down: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      downArrow: cursors.down,
      shift: cursors.shift,
      space: cursors.space,
      ctrl: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.CTRL),
      grenade: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.G),
      esc: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ESC),
    };
    keyboard.addCapture('LEFT,RIGHT,UP,DOWN,SHIFT,SPACE,A,D,S,G');
    this.input.mouse?.disableContextMenu();
    this.input.setDefaultCursor('none');

    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      this.livePointer = { x: pointer.worldX, y: pointer.worldY };
    });
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      this.livePointer = { x: pointer.worldX, y: pointer.worldY };
      if (!this.view || this.paused || pointer.button !== 2) return;
      this.aimAt(pointer.worldX, pointer.worldY);
      this.throwGrenade();
    });
  }

  private sampleInput(): MoveInput {
    const left = this.keys.left.isDown || this.keys.leftArrow.isDown;
    const right = this.keys.right.isDown || this.keys.rightArrow.isDown;
    return {
      left,
      right,
      shift: this.keys.shift.isDown,
      kneel: this.keys.down.isDown || this.keys.downArrow.isDown,
      space: this.keys.space.isDown,
      ctrl: this.keys.ctrl.isDown,
      firing: this.input.activePointer.leftButtonDown(),
      dirPressed:
        Phaser.Input.Keyboard.JustDown(this.keys.left) ||
        Phaser.Input.Keyboard.JustDown(this.keys.right) ||
        Phaser.Input.Keyboard.JustDown(this.keys.leftArrow) ||
        Phaser.Input.Keyboard.JustDown(this.keys.rightArrow),
      shiftPressed: Phaser.Input.Keyboard.JustDown(this.keys.shift),
      spacePressed: Phaser.Input.Keyboard.JustDown(this.keys.space),
      ctrlPressed: Phaser.Input.Keyboard.JustDown(this.keys.ctrl),
      grenadePressed: Phaser.Input.Keyboard.JustDown(this.keys.grenade),
    };
  }

  private layout(): void {
    const width = Math.floor(this.scale.gameSize.width);
    const height = Math.floor(this.scale.gameSize.height);
    this.cameras.resize(width, height);
    this.view = frameLayout(width, height);

    this.paint(this.skyFill, this.view.sky, palette.sky);
    this.paint(this.fieldFill, this.view.field, palette.field);
    this.paint(this.trackFill, this.view.track, palette.track);
    this.paint(this.hudFill, this.view.hud, palette.hud);

    this.placeSoldier();
    if (this.livePointer) {
      this.aimAt(this.livePointer.x, this.livePointer.y);
    } else {
      const field = this.view.field;
      this.aimAt(field.x + field.width / 2, field.y + field.height / 2);
    }

    this.drawHud(width, height);
    this.drawBattle();
  }

  private drawHud(width: number, height: number): void {
    const band = this.view.hud;
    const mid = band.y + Math.round(band.height / 2);
    this.heartGfx.clear();
    this.drawHeart(16, mid - 9);
    this.livesText.setPosition(16 + 7 * 3 + 10, mid);
    this.livesText.setText(String(this.lives));
    this.scoreText.setPosition(this.livesText.x + 36, mid);
    this.scoreText.setText(String(this.score).padStart(hud.scoreDigits, '0'));

    this.pauseVeil.clear();
    this.pauseVeil.fillStyle(palette.black, 0.55);
    this.pauseVeil.fillRect(0, 0, width, height);
    this.pauseLabel.setPosition(width / 2, height / 2);

    this.edge.clear();
    this.edge.fillStyle(palette.ink, 1);
    this.edge.fillRect(0, 0, width, 1);
    this.edge.fillRect(0, height - 1, width, 1);
    this.edge.fillRect(0, 0, 1, height);
    this.edge.fillRect(width - 1, 0, 1, height);
    this.syncGrenadeLabel();
  }

  private drawHeart(x: number, y: number): void {
    const rows = ['0110110', '1111111', '1111111', '0111110', '0011100', '0001000'];
    const step = 3;
    this.heartGfx.fillStyle(palette.heart, 1);
    rows.forEach((row, iy) => {
      [...row].forEach((cell, ix) => {
        if (cell === '1') this.heartGfx.fillRect(x + ix * step, y + iy * step, step, step);
      });
    });
  }

  private tryRoll(input: MoveInput): void {
    if (this.roll) return;
    if (input.left === input.right) return;
    const dir: -1 | 1 = input.right ? 1 : -1;
    const long = input.spacePressed || (input.dirPressed && input.space);
    const short = input.ctrlPressed || (input.dirPressed && input.ctrl);
    if (long) this.startRoll('long', dir);
    else if (short) this.startRoll('short', dir);
  }

  private startRoll(kind: 'short' | 'long', dir: -1 | 1): void {
    const spec = rollMove[kind];
    this.roll = {
      dir,
      duration: spec.durationMs,
      elapsed: 0,
      distance: spec.columns * this.columnWidth(),
      originX: this.soldierX,
    };
    this.kneeling = false;
    this.runLatched = false;
    this.fireCooldown = 0;
    if (this.input.activePointer.leftButtonDown()) this.blockFire = true;
    this.placeSoldier();
  }

  private advanceRoll(delta: number): void {
    const roll = this.roll;
    if (!roll) return;
    roll.elapsed += delta;
    const t = Math.min(1, roll.elapsed / roll.duration);
    const eased = 1 - (1 - t) * (1 - t);
    const { min, max } = this.walkSpan();
    this.soldierX = Math.min(max, Math.max(min, roll.originX + roll.dir * roll.distance * eased));
    this.soldierRatio = max > min ? (this.soldierX - min) / (max - min) : 0.5;
    if (t >= 1) this.roll = null;
    this.placeSoldier();
  }

  private stepSoldier(delta: number, input: MoveInput): void {
    if (input.firing) {
      this.runLatched = false;
      this.kneeling = input.kneel;
      this.placeSoldier();
      return;
    }

    const oneWay = input.left !== input.right;
    if (!input.shift) {
      this.runLatched = false;
    } else if (oneWay && (input.dirPressed || input.shiftPressed)) {
      this.runLatched = true;
    }

    if (input.kneel && !oneWay) {
      this.kneeling = true;
      this.placeSoldier();
      return;
    }

    this.kneeling = false;
    if (!oneWay) {
      this.placeSoldier();
      return;
    }

    const span = this.view.width / frame.width;
    const speed = (this.runLatched ? motion.run : motion.walk) * span;
    const distance = (input.right ? 1 : -1) * speed * (delta / 1000);
    const { min, max } = this.walkSpan();
    this.soldierX = Math.min(max, Math.max(min, this.soldierX + distance));
    this.soldierRatio = max > min ? (this.soldierX - min) / (max - min) : 0.5;
    this.placeSoldier();
  }

  private stepFire(delta: number): void {
    const down = this.input.activePointer.leftButtonDown();
    if (this.roll) {
      if (down) this.blockFire = true;
      return;
    }
    if (this.blockFire) {
      if (!down) {
        this.blockFire = false;
        this.fireCooldown = 0;
      }
      return;
    }
    if (!down) {
      this.fireCooldown = 0;
      return;
    }

    this.fireCooldown -= delta;
    if (this.fireCooldown > 0) return;
    this.shoot();
    this.fireCooldown = fireIntervalMs;
  }

  private shoot(): void {
    const muzzle = this.muzzlePoint();
    if (!this.interceptGrenade(muzzle.x, muzzle.y)) {
      const column = this.aimOnWall();
      if (column !== null) this.chipWall(column, this.aimX, this.aimY);
    }
    this.shots.push({
      x1: muzzle.x,
      y1: muzzle.y,
      x2: this.aimX,
      y2: this.aimY,
      life: tracerTravelMs,
    });
    this.muzzleLife = muzzleFlashMs;
    this.placeMuzzle();
    this.muzzle.setVisible(true);
  }

  /**
   * Прямая на точку прицела сбивает гранату в середине дуги.
   * У ствола и у самой точки своя очередь её не съедает: дуга там совпадает с лучом.
   */
  private interceptGrenade(x1: number, y1: number): boolean {
    let hit: Grenade | null = null;
    let nearest = Infinity;
    for (const item of this.grenades) {
      if (!item.alive) continue;
      // У ствола и у точки падения дуга совпадает с лучом в прицел.
      // Там своя очередь гранату не берёт. В середине полёта берёт и луч, и прицел на теле.
      if (item.t < grenade.armT || item.t > grenade.lateT) continue;
      const point = this.grenadePoint(item);
      const aimed = Math.hypot(this.aimX - point.x, this.aimY - point.y) <= grenade.aimRadius;
      const along = distanceToSegment(point.x, point.y, x1, y1, this.aimX, this.aimY);
      if ((!aimed && along.distance > grenade.hitRadius) || along.t >= nearest) continue;
      nearest = along.t;
      hit = item;
    }
    if (!hit) return false;
    this.popGrenade(hit);
    return true;
  }

  private aimOnWall(): number | null {
    const track = this.view.track;
    const top = track.y - wall.intoField;
    if (this.aimY < top || this.aimY >= track.y) return null;
    const index = this.columnAt(this.aimX);
    return this.wallHp[index] > 0 ? index : null;
  }

  private stepShots(delta: number): void {
    this.muzzleLife = Math.max(0, this.muzzleLife - delta);
    this.muzzle.setVisible(this.muzzleLife > 0 && !this.roll);

    let any = false;
    for (const shot of this.shots) {
      shot.life -= delta;
      if (shot.life > 0) any = true;
    }
    if (!any) {
      this.shots.length = 0;
      this.shotsGfx.clear();
      return;
    }

    this.shots = this.shots.filter((shot) => shot.life > 0);
    this.shotsGfx.clear();
    for (const shot of this.shots) this.drawShot(shot);
  }

  /** Короткий штрих летит к точке и гаснет. Целая линия от ствола читалась как лазер. */
  private drawShot(shot: Shot): void {
    const dx = shot.x2 - shot.x1;
    const dy = shot.y2 - shot.y1;
    const len = Math.hypot(dx, dy);
    if (len < 1) return;

    const head = Math.min(len, (1 - shot.life / tracerTravelMs) * len);
    const tail = Math.max(0, head - tracerLength);
    if (head - tail < 1) return;

    const ux = dx / len;
    const uy = dy / len;
    const nx = -uy * 1.5;
    const ny = ux * 1.5;
    const x1 = shot.x1 + ux * tail;
    const y1 = shot.y1 + uy * tail;
    const x2 = shot.x1 + ux * head;
    const y2 = shot.y1 + uy * head;

    this.shotsGfx.fillStyle(palette.tracer, 1);
    this.shotsGfx.fillTriangle(x1 + nx, y1 + ny, x1 - nx, y1 - ny, x2 - nx, y2 - ny);
    this.shotsGfx.fillTriangle(x1 + nx, y1 + ny, x2 - nx, y2 - ny, x2 + nx, y2 + ny);
  }

  private throwGrenade(): void {
    if (this.paused || this.roll || this.grenadeStock <= 0 || !this.view) return;
    this.grenadeStock -= 1;
    this.syncGrenadeLabel();

    const from = this.muzzlePoint();
    const toX = this.aimX;
    const toY = this.aimY;
    const lift = Math.min(grenade.arcLift, Math.max(48, this.view.field.height * 0.45));
    const item: Grenade = {
      t: 0,
      fromX: from.x,
      fromY: from.y,
      toX,
      toY,
      ctrlX: (from.x + toX) / 2,
      ctrlY: Math.max(this.view.sky.y + 8, Math.min(from.y, toY) - lift),
      alive: true,
      tween: null,
    };
    item.tween = this.tweens.add({
      targets: item,
      t: 1,
      duration: grenade.flightMs,
      onComplete: () => this.landGrenade(item),
    });
    this.grenades.push(item);
  }

  private landGrenade(item: Grenade): void {
    if (!item.alive) return;
    item.alive = false;
    this.dropGrenade(item);
    this.sparks.push({
      x: item.toX,
      y: item.toY,
      life: grenade.explodeMs,
      max: grenade.explodeMs,
      kind: 'land',
    });
  }

  private popGrenade(item: Grenade): void {
    if (!item.alive) return;
    const point = this.grenadePoint(item);
    item.alive = false;
    item.tween?.stop();
    this.dropGrenade(item);
    this.sparks.push({
      x: point.x,
      y: point.y,
      life: grenade.explodeMs * 0.7,
      max: grenade.explodeMs * 0.7,
      kind: 'pop',
    });
  }

  private dropGrenade(item: Grenade): void {
    this.grenades = this.grenades.filter((other) => other !== item);
  }

  private grenadePoint(item: Grenade): { x: number; y: number } {
    return arcPoint(item.t, item.fromX, item.fromY, item.ctrlX, item.ctrlY, item.toX, item.toY);
  }

  private stepPressure(delta: number): void {
    this.pressure.wait -= delta;
    if (this.pressure.wait > 0) return;
    if (this.pressure.phase !== 'volley') {
      this.pressure.column = this.soldierColumn();
      this.pressure.shotsLeft = volley.burst;
      this.pressure.phase = 'volley';
      this.pressure.wait = volley.leadMs;
      return;
    }
    this.incoming.push({ column: this.pressure.column, elapsed: 0 });
    this.pressure.shotsLeft -= 1;
    if (this.pressure.shotsLeft > 0) {
      this.pressure.wait = volley.gapMs;
      return;
    }
    this.pressure.phase = 'recover';
    this.pressure.wait = volley.recoverMs;
  }

  private stepIncoming(delta: number): void {
    const pending: Incoming[] = [];
    for (const shot of this.incoming) {
      shot.elapsed += delta;
      if (shot.elapsed < volley.travelMs) {
        pending.push(shot);
        continue;
      }
      this.resolveIncoming(shot.column);
    }
    this.incoming = pending;
  }

  private resolveIncoming(column: number): void {
    const verdict = resolveColumnHit({
      column,
      soldierColumn: this.soldierColumn(),
      wallUp: (this.wallHp[column] ?? 0) > 0,
      invulnerable: this.roll !== null || this.hurtTimer > 0,
    });
    const point = this.impactPoint(column);
    if (verdict === 'wall') {
      this.chipWall(column, point.x, point.y);
      return;
    }
    this.sparks.push({
      x: point.x,
      y: point.y,
      life: 120,
      max: 120,
      kind: 'puff',
    });
    if (verdict === 'hurt') this.hurt();
  }

  private chipWall(column: number, x: number, y: number): void {
    const hp = this.wallHp[column] ?? 0;
    if (hp <= 0) return;
    this.wallHp[column] = hp - 1;
    this.sparks.push({ x, y, life: 90, max: 90, kind: 'chip' });
  }

  private hurt(): void {
    this.lives = Math.max(0, this.lives - 1);
    this.hurtTimer = hud.hurtMs;
    this.livesText.setText(String(this.lives));
  }

  private stepHurt(delta: number): void {
    this.hurtTimer = Math.max(0, this.hurtTimer - delta);
    const blink = this.hurtTimer > 0 && Math.floor(this.hurtTimer / hud.blinkMs) % 2 === 0;
    this.soldier.setAlpha(blink ? 0.3 : 1);
  }

  private stepSparks(delta: number): void {
    this.sparks = this.sparks.filter((spark) => {
      spark.life -= delta;
      return spark.life > 0;
    });
  }

  private drawBattle(): void {
    if (!this.view) return;
    const gfx = this.battleGfx;
    gfx.clear();
    this.drawWall(gfx);
    this.drawLanes(gfx);
    this.drawIncoming(gfx);
    this.drawGrenades(gfx);
    this.drawSparks(gfx);
    this.drawNotch(gfx);
  }

  private drawWall(gfx: Phaser.GameObjects.Graphics): void {
    const geom = this.wallGeom();
    const gap = 3;
    const stripeH = (geom.height - gap * (wall.stripes - 1)) / wall.stripes;
    for (let i = 0; i < this.wallHp.length; i += 1) {
      const hp = this.wallHp[i] ?? 0;
      const x = Math.round(geom.trackX + i * geom.colW + wall.seam / 2);
      const width = Math.round(geom.colW - wall.seam);
      if (hp <= 0 || width <= 0) {
        gfx.fillStyle(palette.wallGone, 1);
        gfx.fillRect(x, geom.trackY, Math.max(0, width), 5);
        continue;
      }
      const lost = wall.hits - hp;
      const wounded = Math.ceil(lost / (wall.hits / wall.stripes));
      for (let stripe = 0; stripe < wall.stripes; stripe += 1) {
        const color =
          hp <= wall.hits / wall.stripes
            ? palette.wallCrit
            : stripe < wounded
              ? palette.wallHurt
              : stripe % 2 === 0
                ? palette.wall
                : palette.wallBand;
        const y = Math.round(geom.top + stripe * (stripeH + gap));
        gfx.fillStyle(color, 1);
        gfx.fillRect(x, y, width, Math.max(1, Math.round(stripeH)));
      }
    }
  }

  private drawLanes(gfx: Phaser.GameObjects.Graphics): void {
    const marked = new Set<number>();
    if (this.pressure.phase === 'volley') marked.add(this.pressure.column);
    for (const shot of this.incoming) marked.add(shot.column);
    const field = this.view.field;
    const geom = this.wallGeom();
    for (const column of marked) {
      const x = geom.trackX + column * geom.colW;
      gfx.fillStyle(palette.enemyLane, 0.28);
      gfx.fillRect(x, field.y, geom.colW, Math.max(0, geom.top - field.y));
      gfx.fillStyle(palette.enemyLane, 1);
      gfx.fillRect(x + wall.seam, field.y + 4, Math.max(1, geom.colW - wall.seam * 2), 5);
    }
  }

  private drawIncoming(gfx: Phaser.GameObjects.Graphics): void {
    for (const shot of this.incoming) {
      const from = this.view.field.y + 12;
      const to = this.impactPoint(shot.column).y;
      const t = Math.min(1, shot.elapsed / volley.travelMs);
      const tip = from + (to - from) * t;
      const x = this.columnCenter(shot.column);
      gfx.fillStyle(palette.enemyBullet, 1);
      gfx.fillRect(
        Math.round(x - volley.thickness / 2),
        Math.round(tip - volley.length),
        volley.thickness,
        volley.length,
      );
    }
  }

  private drawGrenades(gfx: Phaser.GameObjects.Graphics): void {
    for (const item of this.grenades) {
      if (!item.alive) continue;
      gfx.fillStyle(palette.grenadeArc, 1);
      for (let step = 0; step <= 16; step += 1) {
        const point = arcPoint(
          step / 16,
          item.fromX,
          item.fromY,
          item.ctrlX,
          item.ctrlY,
          item.toX,
          item.toY,
        );
        gfx.fillRect(Math.round(point.x) - 1, Math.round(point.y) - 1, 3, 3);
      }
      const body = this.grenadePoint(item);
      const size = grenade.body;
      gfx.fillStyle(palette.grenade, 1);
      gfx.fillRect(Math.round(body.x - size / 2), Math.round(body.y - size / 2), size, size);
      gfx.fillStyle(palette.grenadeArc, 1);
      gfx.fillRect(Math.round(body.x - 1), Math.round(body.y - size / 2), 2, 2);
    }
  }

  private drawSparks(gfx: Phaser.GameObjects.Graphics): void {
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

  private drawNotch(gfx: Phaser.GameObjects.Graphics): void {
    const geom = this.wallGeom();
    const column = this.soldierColumn();
    const x = Math.round(geom.trackX + column * geom.colW + wall.seam / 2);
    const width = Math.round(geom.colW - wall.seam);
    const y = Math.round(geom.trackY + geom.trackH - 5);
    gfx.fillStyle(palette.notch, 1);
    gfx.fillRect(x, y, Math.max(1, width), 3);
  }

  private aimAt(x: number, y: number): void {
    const point = clampToRect(x, y, this.view.field);
    this.aimX = point.x;
    this.aimY = point.y;
    this.drawAim();
  }

  private drawAim(): void {
    const x = this.aimX;
    const y = this.aimY;
    const { arm, gap, thickness } = aimMark;
    const half = Math.floor(thickness / 2);
    const reach = arm - gap;
    this.aimGfx.clear();
    this.aimGfx.fillStyle(palette.aim, 1);
    this.aimGfx.fillRect(x - arm, y - half, reach, thickness);
    this.aimGfx.fillRect(x + gap, y - half, reach, thickness);
    this.aimGfx.fillRect(x - half, y - arm, thickness, reach);
    this.aimGfx.fillRect(x - half, y + gap, thickness, reach);
  }

  private placeSoldier(): void {
    if (!this.view) return;
    this.applyPose();
    const { min, max } = this.walkSpan();
    this.soldierX = min + (max - min) * this.soldierRatio;
    const bottom = Math.round(this.view.track.y + this.view.track.height / 2 + soldierBox.height / 2);
    this.soldier.setPosition(Math.round(this.soldierX), Math.round(bottom - this.soldier.height / 2));
    this.placeMuzzle();
    this.syncGrenadeLabel();
  }

  private applyPose(): void {
    const next: Pose = this.roll ? 'roll' : this.kneeling ? 'kneel' : 'stand';
    if (next !== this.pose) {
      this.pose = next;
      const height =
        next === 'stand' ? soldierBox.height : next === 'kneel' ? soldierBox.height * kneelScale : soldierBox.height * 0.42;
      const width = next === 'roll' ? soldierBox.width * 1.35 : soldierBox.width;
      this.soldier
        .setSize(width, height)
        .setOrigin(0.5, 0.5)
        .setFillStyle(next === 'roll' ? palette.soldierRoll : palette.soldier);
    }
    if (!this.roll) {
      this.soldier.setAngle(0);
      return;
    }
    const t = Math.min(1, this.roll.elapsed / this.roll.duration);
    this.soldier.setAngle(this.roll.dir * t * 360);
  }

  private placeMuzzle(): void {
    const point = this.muzzlePoint();
    this.muzzle.setPosition(point.x, point.y);
  }

  /** Из-за целой стены ствол торчит над лицом секции, иначе очередь рисуется сквозь кладку. */
  private muzzlePoint(): { x: number; y: number } {
    let y = this.soldier.y - this.soldier.height / 2;
    const column = this.soldierColumn();
    if ((this.wallHp[column] ?? 0) > 0 && this.view) {
      const face = this.view.track.y - wall.intoField;
      if (y > face) y = face - 2;
    }
    return { x: this.soldier.x, y };
  }

  private syncGrenadeLabel(): void {
    if (!this.view) return;
    const feet = Math.round(this.view.track.y + this.view.track.height / 2 + soldierBox.height / 2 + 2);
    this.grenadeLabel.setPosition(Math.round(this.soldierX), feet);
    this.grenadeLabel.setText(String(this.grenadeStock));
    this.grenadeLabel.setColor(cssColor(this.grenadeStock > 0 ? palette.ink : palette.wallCrit));
  }

  private wallGeom(): {
    top: number;
    height: number;
    trackX: number;
    trackY: number;
    trackH: number;
    colW: number;
  } {
    const track = this.view.track;
    const bottom = Math.round(track.y + track.height / 2);
    const top = Math.round(track.y - wall.intoField);
    return {
      top,
      height: Math.max(1, bottom - top),
      trackX: track.x,
      trackY: track.y,
      trackH: track.height,
      colW: track.width / this.wallHp.length,
    };
  }

  private impactPoint(column: number): { x: number; y: number } {
    const geom = this.wallGeom();
    const y = (this.wallHp[column] ?? 0) > 0 ? geom.top : Math.round(this.view.track.y + this.view.track.height / 2);
    return { x: this.columnCenter(column), y };
  }

  private columnCenter(column: number): number {
    const geom = this.wallGeom();
    return geom.trackX + (column + 0.5) * geom.colW;
  }

  private columnWidth(): number {
    return this.view.track.width / this.wallHp.length;
  }

  private columnAt(x: number): number {
    const track = this.view.track;
    return columnIndex(x, track.x, track.width, this.wallHp.length);
  }

  private soldierColumn(): number {
    return this.columnAt(this.soldier.x);
  }

  /** Доля дорожки, на которой центр солдата совпадает с центром колонки. */
  private standInColumn(index: number): void {
    const { min, max } = this.walkSpan();
    const x = Math.min(max, Math.max(min, this.columnCenter(index)));
    this.soldierX = x;
    this.soldierRatio = max > min ? (x - min) / (max - min) : 0.5;
  }

  private walkSpan(): { min: number; max: number } {
    const half = soldierBox.width / 2;
    const track = this.view.track;
    return { min: track.x + half, max: track.x + track.width - half };
  }

  private setPaused(paused: boolean): void {
    this.paused = paused;
    this.pauseVeil.setVisible(paused);
    this.pauseLabel.setVisible(paused);
    if (paused) this.tweens.pauseAll();
    else this.tweens.resumeAll();
  }

  private paint(
    graphics: Phaser.GameObjects.Graphics,
    rect: FrameLayout['sky'],
    color: number,
  ): void {
    graphics.clear();
    graphics.fillStyle(color, 1);
    graphics.fillRect(rect.x, rect.y, rect.width, rect.height);
  }

  private bandFill(parent: Phaser.GameObjects.Container): Phaser.GameObjects.Graphics {
    const graphics = this.add.graphics();
    parent.add(graphics);
    return graphics;
  }

  private layer(name: string, depth: number): Phaser.GameObjects.Container {
    const layer = this.add.container(0, 0);
    layer.name = name;
    layer.setDepth(depth);
    return layer;
  }
}
