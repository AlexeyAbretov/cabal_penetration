import Phaser from 'phaser';
import {
  aimMark,
  fireIntervalMs,
  frame,
  motion,
  palette,
  soldierBox,
  muzzleFlashMs,
  tracerLength,
  tracerTravelMs,
} from '../constants';
import { clampToRect, frameLayout, type FrameLayout } from '../layout';

type Shot = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  life: number;
};

/**
 * Срез 1. Ноги по дорожке, прицел по полю.
 * Пока зажата левая кнопка, тело стоит. Курсор ведёт только точку выстрела.
 * Глубина сзади вперёд: небо, поле, дорожка, трассеры, прицел, рамка HUD.
 */
export class Play extends Phaser.Scene {
  private view!: FrameLayout;
  private skyFill!: Phaser.GameObjects.Graphics;
  private fieldFill!: Phaser.GameObjects.Graphics;
  private trackFill!: Phaser.GameObjects.Graphics;
  private hudFill!: Phaser.GameObjects.Graphics;
  private edge!: Phaser.GameObjects.Graphics;
  private soldier!: Phaser.GameObjects.Rectangle;
  private muzzle!: Phaser.GameObjects.Rectangle;
  private aimGfx!: Phaser.GameObjects.Graphics;
  private shotsGfx!: Phaser.GameObjects.Graphics;
  private pauseVeil!: Phaser.GameObjects.Graphics;
  private pauseLabel!: Phaser.GameObjects.Text;
  private keys!: {
    left: Phaser.Input.Keyboard.Key;
    right: Phaser.Input.Keyboard.Key;
    leftArrow: Phaser.Input.Keyboard.Key;
    rightArrow: Phaser.Input.Keyboard.Key;
    shift: Phaser.Input.Keyboard.Key;
    esc: Phaser.Input.Keyboard.Key;
  };

  /** 0 — левый край хитбокса, 1 — правый. На ресайзе солдат остаётся на той же доле. */
  private soldierRatio = 0.5;
  private soldierX = 0;
  /** Бег держится, пока Shift в связке с направлением. Огонь связку рвёт. */
  private runLatched = false;
  private aimX = 0;
  private aimY = 0;
  private livePointer: { x: number; y: number } | null = null;
  private paused = false;
  private fireCooldown = 0;
  private muzzleLife = 0;
  private shots: Shot[] = [];

  constructor() {
    super('Play');
  }

  create(): void {
    this.cameras.main.setBackgroundColor(palette.black);

    const sky = this.layer('sky', 0);
    const field = this.layer('field', 1);
    const track = this.layer('track', 2);
    this.shotsGfx = this.add.graphics().setDepth(3);
    this.aimGfx = this.add.graphics().setDepth(4);
    const hud = this.layer('hud', 5);

    this.skyFill = this.bandFill(sky);
    this.fieldFill = this.bandFill(field);
    this.trackFill = this.bandFill(track);
    this.hudFill = this.bandFill(hud);

    this.soldier = this.add
      .rectangle(0, 0, soldierBox.width, soldierBox.height, palette.soldier)
      .setOrigin(0.5, 0.5);
    track.add(this.soldier);
    this.muzzle = this.add
      .rectangle(0, 0, 10, 4, palette.muzzle)
      .setOrigin(0.5, 1)
      .setVisible(false);
    track.add(this.muzzle);

    this.pauseVeil = this.add.graphics().setVisible(false);
    hud.add(this.pauseVeil);
    this.pauseLabel = this.add
      .text(0, 0, 'ПАУЗА', {
        fontFamily: 'Consolas, "Courier New", monospace',
        fontSize: '32px',
        color: '#e7dcc4',
      })
      .setOrigin(0.5)
      .setVisible(false);
    hud.add(this.pauseLabel);

    this.edge = this.add.graphics();
    hud.add(this.edge);

    this.bindInput();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.layout, this);
    this.layout();
  }

  update(_time: number, delta: number): void {
    if (Phaser.Input.Keyboard.JustDown(this.keys.esc)) {
      this.setPaused(!this.paused);
    }
    if (this.paused) return;

    if (this.livePointer) {
      this.aimAt(this.livePointer.x, this.livePointer.y);
    }

    const step = Math.min(delta, 50);
    this.stepSoldier(step);
    this.stepFire(step);
    this.stepShots(step);
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
      shift: cursors.shift,
      esc: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ESC),
    };
    keyboard.addCapture('LEFT,RIGHT,SHIFT');
    this.input.mouse?.disableContextMenu();
    this.input.setDefaultCursor('none');

    const trackPointer = (pointer: Phaser.Input.Pointer) => {
      this.livePointer = { x: pointer.worldX, y: pointer.worldY };
    };
    this.input.on('pointermove', trackPointer);
    this.input.on('pointerdown', trackPointer);
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
  }

  private stepSoldier(delta: number): void {
    const firing = this.input.activePointer.leftButtonDown();
    const left = this.keys.left.isDown || this.keys.leftArrow.isDown;
    const right = this.keys.right.isDown || this.keys.rightArrow.isDown;
    const shift = this.keys.shift.isDown;

    if (firing) {
      this.runLatched = false;
      // Нажатия за время очереди съедаются: после отпускания старый Shift бег не продолжает.
      this.eatKeyEdges();
      return;
    }

    const directionPressed =
      Phaser.Input.Keyboard.JustDown(this.keys.left) ||
      Phaser.Input.Keyboard.JustDown(this.keys.right) ||
      Phaser.Input.Keyboard.JustDown(this.keys.leftArrow) ||
      Phaser.Input.Keyboard.JustDown(this.keys.rightArrow);
    const shiftPressed = Phaser.Input.Keyboard.JustDown(this.keys.shift);
    const oneWay = left !== right;

    if (!shift) {
      this.runLatched = false;
    } else if (oneWay && (directionPressed || shiftPressed)) {
      // После очереди старый Shift бег не продолжает: нужна новая связка.
      this.runLatched = true;
    }

    if (!oneWay) return;

    const span = this.view.width / frame.width;
    const speed = (this.runLatched ? motion.run : motion.walk) * span;
    const distance = (right ? 1 : -1) * speed * (delta / 1000);
    const { min, max } = this.walkSpan();
    this.soldierX = Math.min(max, Math.max(min, this.soldierX + distance));
    this.soldierRatio = max > min ? (this.soldierX - min) / (max - min) : 0.5;
    this.placeSoldier();
  }

  private stepFire(delta: number): void {
    if (!this.input.activePointer.leftButtonDown()) {
      this.fireCooldown = 0;
      return;
    }

    this.fireCooldown -= delta;
    if (this.fireCooldown > 0) return;

    this.shoot();
    this.fireCooldown = fireIntervalMs;
  }

  private shoot(): void {
    this.shots.push({
      x1: this.soldier.x,
      y1: this.soldier.y - soldierBox.height / 2,
      x2: this.aimX,
      y2: this.aimY,
      life: tracerTravelMs,
    });
    this.muzzleLife = muzzleFlashMs;
    this.placeMuzzle();
    this.muzzle.setVisible(true);
  }

  private stepShots(delta: number): void {
    this.muzzleLife = Math.max(0, this.muzzleLife - delta);
    this.muzzle.setVisible(this.muzzleLife > 0);

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
    for (const shot of this.shots) {
      this.drawShot(shot);
    }
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
    const { min, max } = this.walkSpan();
    this.soldierX = min + (max - min) * this.soldierRatio;
    const y = Math.round(this.view.track.y + this.view.track.height / 2);
    this.soldier.setPosition(Math.round(this.soldierX), y);
    this.placeMuzzle();
  }

  private placeMuzzle(): void {
    this.muzzle.setPosition(this.soldier.x, this.soldier.y - soldierBox.height / 2);
  }

  private eatKeyEdges(): void {
    Phaser.Input.Keyboard.JustDown(this.keys.left);
    Phaser.Input.Keyboard.JustDown(this.keys.right);
    Phaser.Input.Keyboard.JustDown(this.keys.leftArrow);
    Phaser.Input.Keyboard.JustDown(this.keys.rightArrow);
    Phaser.Input.Keyboard.JustDown(this.keys.shift);
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
