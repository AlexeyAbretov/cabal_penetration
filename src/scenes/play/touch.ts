import Phaser from 'phaser';
import { palette, touch } from '../../constants';
import type { Rect } from '../../layout';

export type TouchChrome = 'play' | 'pause' | 'down' | 'off';

export type TouchMove = {
  left: boolean;
  right: boolean;
  shift: boolean;
  shiftPressed: boolean;
  kneel: boolean;
  ctrlPressed: boolean;
  /** Стик в шаге или беге. Колено и мёртвая зона — солдат стоит. */
  locomoting: boolean;
  /** Палец лежит на кресте. Очередь с него включает слой ввода, и только когда тело стоит. */
  aimHeld: boolean;
  grenadePressed: boolean;
};

/** Кнопка гранаты на пальце. Круг 128×128, кромка по краю кадра. */
export const touchGrenade = {
  key: 'touch-grenade',
  url: 'assets/touch-grenade.png',
} as const;

type Circle = { x: number; y: number; r: number };

type Hold = 'stick' | 'aim' | 'grenade' | 'pause';

/**
 * Палец. Слева стик: вбок шаг, у края бег, прямо вниз колено.
 * Второе нажатие в ту же сторону за короткое окно — один перекат.
 * Справа палец тащит крест и не переносит его на себя. Тот же палец стреляет, пока солдат стоит.
 * Гранату жмут над стиком, не отпуская очередь. Мышь этот слой не трогает.
 */
export class TouchLayer {
  private readonly input: Phaser.Input.InputPlugin;
  private readonly root: Phaser.GameObjects.Container;
  private readonly gfx: Phaser.GameObjects.Graphics;
  private readonly grenadeIcon: Phaser.GameObjects.Image | null;
  private readonly coarse: MediaQueryList | null;
  private readonly owns = new Map<number, Hold>();
  private readonly aimLast = new Map<number, { x: number; y: number }>();

  private chrome: TouchChrome = 'off';
  private shown = false;
  private touched = false;
  private touchAt = 0;
  private width = 0;
  private height = 0;
  private hudTop = 0;
  private aimRect: Rect | null = null;
  private aim: { x: number; y: number } | null = null;
  private stick: Circle = { x: 0, y: 0, r: 1 };
  private grenadeBtn: Circle = { x: 0, y: 0, r: 1 };
  private aimRest: Circle = { x: 0, y: 0, r: 1 };
  private pauseBtn: Circle = { x: 0, y: 0, r: 1 };
  private nx = 0;
  private ny = 0;
  /** Первое нажатие стика в сторону. Второе в ту же сторону за окно даёт перекат. */
  private sideTap: { dir: -1 | 1; at: number } | null = null;
  /** Сторона переката, пока кадр ввода её не забрал. */
  private rollDir: -1 | 1 | 0 = 0;
  private shiftHeld = false;
  private grenadeEdge = false;
  private pauseEdge = false;
  /** Крест сейчас ещё и спуск: палец на нём, стик тело не ведёт. */
  private aimFiring = false;

  constructor(scene: Phaser.Scene) {
    this.input = scene.input;
    this.gfx = scene.add.graphics();
    this.grenadeIcon = scene.textures.exists(touchGrenade.key)
      ? scene.add
          .image(0, 0, touchGrenade.key)
          .setOrigin(0.5)
          .setVisible(false)
      : null;
    if (this.grenadeIcon) {
      scene.textures.get(touchGrenade.key).setFilter(Phaser.Textures.FilterMode.NEAREST);
    }
    const chrome: Phaser.GameObjects.GameObject[] = [this.gfx];
    if (this.grenadeIcon) chrome.push(this.grenadeIcon);
    this.root = scene.add.container(0, 0, chrome).setDepth(8);
    this.coarse = window.matchMedia?.('(pointer: coarse)') ?? null;
    this.shown = !!this.coarse?.matches;
    this.coarse?.addEventListener('change', this.onCoarse);
    scene.input.on('pointerdown', this.onDown);
    scene.input.on('pointermove', this.onMove);
    scene.input.on('pointerup', this.onUp);
    scene.input.on('pointerupoutside', this.onUp);
    scene.events.on(Phaser.Scenes.Events.UPDATE, this.paint, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.coarse?.removeEventListener('change', this.onCoarse);
      scene.input.off('pointerdown', this.onDown);
      scene.input.off('pointermove', this.onMove);
      scene.input.off('pointerup', this.onUp);
      scene.input.off('pointerupoutside', this.onUp);
      scene.events.off(Phaser.Scenes.Events.UPDATE, this.paint, this);
      this.root.destroy();
    });
  }

  /**
   * Мышь жива, пока палец не лежит на стекле и не только что поднялся.
   * Иначе браузерный щелчок вслед за касанием включает очередь и тащит крест под палец.
   */
  mouseLive(): boolean {
    if (performance.now() - this.touchAt < 350) return false;
    for (const pointer of this.input.manager.pointers) {
      if (pointer?.wasTouch && pointer.isDown) return false;
    }
    return true;
  }

  aimPoint(): { x: number; y: number } | null {
    return this.aim;
  }

  placeAim(x: number, y: number): void {
    if (!this.mouseLive()) return;
    this.aim = this.aimRect ? clampAim(x, y, this.aimRect) : { x, y };
  }

  setChrome(mode: TouchChrome): void {
    if (mode === this.chrome) return;
    const leftPlay = this.chrome === 'play' && mode !== 'play';
    this.chrome = mode;
    if (leftPlay) this.releasePlay();
    this.paint();
  }

  setFrame(width: number, height: number, aimRect: Rect, hudTop: number): void {
    this.width = width;
    this.height = height;
    this.hudTop = hudTop;
    this.aimRect = aimRect;
    if (!this.aim) {
      this.aim = {
        x: aimRect.x + aimRect.width / 2,
        y: aimRect.y + aimRect.height / 2,
      };
    } else {
      this.aim = clampAim(this.aim.x, this.aim.y, aimRect);
    }
    this.layout();
    this.paint();
  }

  sample(): TouchMove {
    const grenadePressed = this.grenadeEdge;
    this.grenadeEdge = false;
    const body = this.body();
    const aimHeld = this.chrome === 'play' && this.held('aim');
    return { ...body, aimHeld, grenadePressed };
  }

  /** Кольцо креста показывает, что этот палец сейчас стреляет. Клавиатура и перекат решаются снаружи. */
  noteAimFire(on: boolean): void {
    this.aimFiring = on;
  }

  takePause(): boolean {
    const pressed = this.pauseEdge;
    this.pauseEdge = false;
    return pressed;
  }

  private body(): Pick<TouchMove, 'left' | 'right' | 'shift' | 'shiftPressed' | 'kneel' | 'ctrlPressed' | 'locomoting'> {
    let left = false;
    let right = false;
    let kneel = false;
    let shift = false;
    let ctrlPressed = false;
    let locomoting = false;
    const mag = Math.hypot(this.nx, this.ny);
    if (this.chrome === 'play' && mag >= touch.dead) {
      if (this.ny >= touch.kneelY && Math.abs(this.nx) <= touch.kneelX) {
        kneel = true;
      } else if (Math.abs(this.nx) >= touch.dead) {
        locomoting = true;
        if (this.nx > 0) right = true;
        else left = true;
        shift = mag >= touch.run;
      }
    }
    if (this.rollDir !== 0 && this.chrome === 'play') {
      left = this.rollDir < 0;
      right = this.rollDir > 0;
      kneel = false;
      locomoting = true;
      ctrlPressed = true;
      this.rollDir = 0;
    } else if (this.chrome !== 'play') {
      this.rollDir = 0;
    }
    const shiftPressed = shift && !this.shiftHeld;
    this.shiftHeld = shift;
    return { left, right, shift, shiftPressed, kneel, ctrlPressed, locomoting };
  }

  private layout(): void {
    const short = Math.min(this.width, this.height);
    const radius = Math.round(Math.max(52, Math.min(78, short * 0.18)));
    const gap = 8;
    this.stick = {
      x: gap + radius,
      y: Math.max(radius + gap, this.hudTop - gap - radius),
      r: radius,
    };
    const grenadeR = Math.round(radius * 0.32);
    this.grenadeBtn = {
      x: this.stick.x,
      y: this.stick.y - radius - grenadeR - Math.round(radius * 0.35),
      r: grenadeR,
    };
    const restR = Math.round(radius * 0.72);
    this.aimRest = {
      x: this.width - gap - restR,
      y: Math.max(restR + gap, this.hudTop - gap - restR),
      r: restR,
    };
    this.pauseBtn = { x: this.width - 36, y: 32, r: 22 };
  }

  private readonly onCoarse = (): void => {
    this.shown = this.touched || !!this.coarse?.matches;
  };

  private noteTouch(): void {
    this.touchAt = performance.now();
    this.touched = true;
    this.shown = true;
  }

  private readonly onDown = (pointer: Phaser.Input.Pointer): void => {
    if (!pointer.wasTouch) return;
    this.noteTouch();
    const x = pointer.worldX;
    const y = pointer.worldY;
    if (this.chrome === 'down') return;
    if ((this.chrome === 'play' || this.chrome === 'pause') && this.hit(this.pauseBtn, x, y, 1.15)) {
      this.pauseEdge = true;
      this.owns.set(pointer.id, 'pause');
      return;
    }
    if (this.chrome !== 'play') return;
    if (this.hit(this.grenadeBtn, x, y, 1.2)) {
      this.grenadeEdge = true;
      this.owns.set(pointer.id, 'grenade');
      return;
    }
    if (this.hit(this.stick, x, y, 1.2) && !this.held('stick')) {
      this.owns.set(pointer.id, 'stick');
      this.placeStick(x, y);
      this.noteSideTap();
      return;
    }
    if (x >= this.width * 0.45 && !this.held('aim')) {
      this.owns.set(pointer.id, 'aim');
      this.aimLast.set(pointer.id, { x, y });
    }
  };

  private readonly onMove = (pointer: Phaser.Input.Pointer): void => {
    if (!pointer.wasTouch) return;
    this.noteTouch();
    const kind = this.owns.get(pointer.id);
    if (kind === 'stick') this.placeStick(pointer.worldX, pointer.worldY);
    if (kind !== 'aim' || this.chrome !== 'play') return;
    const last = this.aimLast.get(pointer.id);
    if (!last) return;
    const dx = pointer.worldX - last.x;
    const dy = pointer.worldY - last.y;
    this.aimLast.set(pointer.id, { x: pointer.worldX, y: pointer.worldY });
    if (!this.aim || !this.aimRect) return;
    this.aim = clampAim(this.aim.x + dx * touch.aimGain, this.aim.y + dy * touch.aimGain, this.aimRect);
  };

  private readonly onUp = (pointer: Phaser.Input.Pointer): void => {
    if (!pointer.wasTouch) return;
    this.noteTouch();
    const kind = this.owns.get(pointer.id);
    this.owns.delete(pointer.id);
    this.aimLast.delete(pointer.id);
    if (kind === 'stick') {
      this.nx = 0;
      this.ny = 0;
    }
  };

  private placeStick(x: number, y: number): void {
    const dx = x - this.stick.x;
    const dy = y - this.stick.y;
    const reach = Math.hypot(dx, dy) || 1;
    const clamped = Math.min(reach, this.stick.r);
    this.nx = (dx / reach) * (clamped / this.stick.r);
    this.ny = (dy / reach) * (clamped / this.stick.r);
  }

  /** Нажатие влево или вправо. Повтор в ту же сторону за окно ставит перекат в очередь кадра. */
  private noteSideTap(): void {
    const dir = this.sideDir();
    if (!dir) {
      this.sideTap = null;
      return;
    }
    const now = performance.now();
    const prev = this.sideTap;
    if (prev && prev.dir === dir && now - prev.at <= touch.doubleMs) {
      this.rollDir = dir;
      this.sideTap = null;
      return;
    }
    this.sideTap = { dir, at: now };
  }

  private sideDir(): -1 | 1 | 0 {
    if (Math.abs(this.nx) < touch.dead || Math.abs(this.nx) < Math.abs(this.ny)) return 0;
    return this.nx > 0 ? 1 : -1;
  }

  private releasePlay(): void {
    for (const [id, kind] of this.owns) {
      if (kind === 'pause') continue;
      this.owns.delete(id);
      this.aimLast.delete(id);
    }
    this.nx = 0;
    this.ny = 0;
    this.sideTap = null;
    this.rollDir = 0;
    this.shiftHeld = false;
    this.aimFiring = false;
  }

  private held(kind: Hold): boolean {
    for (const value of this.owns.values()) {
      if (value === kind) return true;
    }
    return false;
  }

  private hit(circle: Circle, x: number, y: number, slop: number): boolean {
    const reach = circle.r * slop;
    const dx = x - circle.x;
    const dy = y - circle.y;
    return dx * dx + dy * dy <= reach * reach;
  }

  private paint(): void {
    this.gfx.clear();
    this.grenadeIcon?.setVisible(false);
    if (!this.shown || this.chrome === 'off' || this.chrome === 'down' || this.width <= 0) return;
    this.paintPause();
    if (this.chrome !== 'play') return;
    this.paintStick();
    this.paintGrenade();
    this.paintAimRest();
  }

  private paintStick(): void {
    const { x, y, r } = this.stick;
    this.ring(x, y, r, 0.22);
    this.tick(x, y, r, -1, 0);
    this.tick(x, y, r, 1, 0);
    this.tick(x, y, r, 0, 1);
    this.gfx.fillStyle(palette.ink, 0.55);
    this.gfx.fillCircle(x + this.nx * r, y + this.ny * r, Math.round(r * 0.42));
  }

  private paintGrenade(): void {
    const { x, y, r } = this.grenadeBtn;
    const icon = this.grenadeIcon;
    if (icon) {
      icon.setPosition(x, y).setDisplaySize(r * 2, r * 2).setAlpha(0.7).setVisible(true);
      return;
    }
    this.ring(x, y, r, 0.3);
    this.gfx.fillStyle(palette.grenade, 1);
    this.gfx.fillCircle(x, y + 2, Math.round(r * 0.28));
    this.gfx.fillStyle(palette.ink, 1);
    this.gfx.fillRect(x - 1, y - Math.round(r * 0.34), 2, Math.round(r * 0.22));
  }

  /** Метка большого пальца. Кольцо не пружина: крест остаётся там, где палец его оставил. */
  private paintAimRest(): void {
    const { x, y, r } = this.aimRest;
    const held = this.held('aim');
    this.gfx.lineStyle(2, palette.ink, held ? 0.7 : 0.35);
    this.gfx.strokeCircle(x, y, r);
    if (this.aimFiring) {
      this.gfx.lineStyle(3, palette.aim, 0.9);
      this.gfx.strokeCircle(x, y, r);
    }
    const arm = Math.round(r * 0.28);
    this.gfx.lineStyle(2, palette.aim, 0.8);
    this.gfx.lineBetween(x - arm, y, x + arm, y);
    this.gfx.lineBetween(x, y - arm, x, y + arm);
  }

  private paintPause(): void {
    const { x, y, r } = this.pauseBtn;
    this.ring(x, y, r, 0.4);
    this.gfx.fillStyle(palette.ink, 0.9);
    const w = 3;
    const h = Math.round(r * 0.7);
    this.gfx.fillRect(x - 5, y - h / 2, w, h);
    this.gfx.fillRect(x + 2, y - h / 2, w, h);
  }

  private ring(x: number, y: number, r: number, alpha: number): void {
    this.gfx.fillStyle(palette.black, alpha);
    this.gfx.fillCircle(x, y, r);
    this.gfx.lineStyle(2, palette.ink, 0.75);
    this.gfx.strokeCircle(x, y, r);
  }

  private tick(x: number, y: number, r: number, dx: number, dy: number): void {
    this.gfx.lineStyle(2, palette.ink, 0.45);
    this.gfx.lineBetween(x + dx * r * 0.72, y + dy * r * 0.72, x + dx * r * 0.92, y + dy * r * 0.92);
  }
}

function clampAim(x: number, y: number, rect: Rect): { x: number; y: number } {
  const maxX = rect.x + Math.max(0, rect.width - 1);
  const maxY = rect.y + Math.max(0, rect.height - 1);
  return {
    x: Math.min(maxX, Math.max(rect.x, x)),
    y: Math.min(maxY, Math.max(rect.y, y)),
  };
}
