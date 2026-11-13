import Phaser from 'phaser';

export type MoveInput = {
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

/** Клавиатура ног и точка прицела. Правая кнопка — отдельный щелчок гранаты. */
export class Controls {
  private readonly scene: Phaser.Scene;
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

  private livePointer: { x: number; y: number } | null = null;

  constructor(scene: Phaser.Scene, onRightClick: () => void) {
    this.scene = scene;
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
      space: cursors.space,
      ctrl: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.CTRL),
      grenade: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.G),
      esc: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ESC),
    };
    keyboard.addCapture('LEFT,RIGHT,UP,DOWN,SHIFT,SPACE,A,D,S,G');
    scene.input.mouse?.disableContextMenu();
    scene.input.setDefaultCursor('none');

    scene.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      this.livePointer = { x: pointer.worldX, y: pointer.worldY };
    });
    scene.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      this.livePointer = { x: pointer.worldX, y: pointer.worldY };
      if (pointer.button !== 2) return;
      onRightClick();
    });
  }

  get pointer(): { x: number; y: number } | null {
    return this.livePointer;
  }

  escPressed(): boolean {
    return Phaser.Input.Keyboard.JustDown(this.keys.esc);
  }

  sample(): MoveInput {
    const left = this.keys.left.isDown || this.keys.leftArrow.isDown;
    const right = this.keys.right.isDown || this.keys.rightArrow.isDown;
    return {
      left,
      right,
      shift: this.keys.shift.isDown,
      kneel: this.keys.down.isDown || this.keys.downArrow.isDown,
      space: this.keys.space.isDown,
      ctrl: this.keys.ctrl.isDown,
      firing: this.scene.input.activePointer.leftButtonDown(),
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
}
