import Phaser from 'phaser';
import type { Rect } from '../../layout';
import { TouchLayer, type TouchChrome } from './touch';

export type MoveInput = {
  left: boolean;
  right: boolean;
  shift: boolean;
  kneel: boolean;
  ctrl: boolean;
  firing: boolean;
  dirPressed: boolean;
  shiftPressed: boolean;
  ctrlPressed: boolean;
  grenadePressed: boolean;
};

/**
 * Клавиатура ног и точка прицела. Правая кнопка — отдельный щелчок гранаты.
 * Палец добавляет те же флаги. Палец на кресте стреляет, пока солдат не шагает, не бежит и не катится.
 */
export class Controls {
  private readonly scene: Phaser.Scene;
  private readonly touch: TouchLayer;
  private keys!: {
    left: Phaser.Input.Keyboard.Key;
    right: Phaser.Input.Keyboard.Key;
    leftArrow: Phaser.Input.Keyboard.Key;
    rightArrow: Phaser.Input.Keyboard.Key;
    down: Phaser.Input.Keyboard.Key;
    downArrow: Phaser.Input.Keyboard.Key;
    shift: Phaser.Input.Keyboard.Key;
    ctrl: Phaser.Input.Keyboard.Key;
    grenade: Phaser.Input.Keyboard.Key;
    esc: Phaser.Input.Keyboard.Key;
    enter: Phaser.Input.Keyboard.Key;
  };

  constructor(scene: Phaser.Scene, onRightClick: () => void) {
    this.scene = scene;
    this.touch = new TouchLayer(scene);
    const keyboard = scene.input.keyboard;
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
      ctrl: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.CTRL),
      grenade: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.G),
      esc: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ESC),
      enter: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER),
    };
    keyboard.addCapture('LEFT,RIGHT,UP,DOWN,SHIFT,SPACE,A,D,S,G,ENTER');
    scene.input.mouse?.disableContextMenu();
    scene.input.setDefaultCursor('none');

    scene.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (pointer.wasTouch) return;
      this.touch.placeAim(pointer.worldX, pointer.worldY);
    });
    scene.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (pointer.wasTouch) return;
      this.touch.placeAim(pointer.worldX, pointer.worldY);
      if (pointer.button !== 2) return;
      onRightClick();
    });
  }

  /** Бой, пауза, экран смерти или слой спрятан. Палец читает это раньше жестов. */
  setChrome(mode: TouchChrome): void {
    this.touch.setChrome(mode);
  }

  /** Размер кадра и прямоугольник, внутри которого живёт крест. */
  setFrame(width: number, height: number, aimRect: Rect, hudTop: number): void {
    this.touch.setFrame(width, height, aimRect, hudTop);
  }

  get pointer(): { x: number; y: number } | null {
    return this.touch.aimPoint();
  }

  escPressed(): boolean {
    return Phaser.Input.Keyboard.JustDown(this.keys.esc) || this.touch.takePause();
  }

  /** Континуэ на Enter. На пальце ту же роль берёт «Дальше». */
  enterPressed(): boolean {
    return Phaser.Input.Keyboard.JustDown(this.keys.enter) || this.touch.takeEnter();
  }

  /** rolling — кувырок ещё едет, даже если стик уже отпущен. С такого креста очередь не идёт. */
  sample(rolling = false): MoveInput {
    const finger = this.touch.sample();
    const left = this.keys.left.isDown || this.keys.leftArrow.isDown || finger.left;
    const right = this.keys.right.isDown || this.keys.rightArrow.isDown || finger.right;
    const moving = left !== right || finger.locomoting || rolling;
    const aimFire = finger.aimHeld && !moving;
    this.touch.noteAimFire(aimFire);
    const mouse = this.scene.input.mousePointer;
    const mouseFire = !!mouse && !mouse.wasTouch && mouse.primaryDown && this.touch.mouseLive();
    return {
      left,
      right,
      shift: this.keys.shift.isDown || finger.shift,
      kneel: this.keys.down.isDown || this.keys.downArrow.isDown || finger.kneel,
      ctrl: this.keys.ctrl.isDown,
      firing: mouseFire || aimFire,
      dirPressed:
        Phaser.Input.Keyboard.JustDown(this.keys.left) ||
        Phaser.Input.Keyboard.JustDown(this.keys.right) ||
        Phaser.Input.Keyboard.JustDown(this.keys.leftArrow) ||
        Phaser.Input.Keyboard.JustDown(this.keys.rightArrow),
      shiftPressed: Phaser.Input.Keyboard.JustDown(this.keys.shift) || finger.shiftPressed,
      ctrlPressed: Phaser.Input.Keyboard.JustDown(this.keys.ctrl) || finger.ctrlPressed,
      grenadePressed: Phaser.Input.Keyboard.JustDown(this.keys.grenade) || finger.grenadePressed,
    };
  }
}
