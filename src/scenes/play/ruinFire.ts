import Phaser from 'phaser';
import { palette } from '../../constants';

type Focus = { dx: number; dy: number; power: number };

/**
 * Очаги танка над обломками, сдвинутые к своему центру.
 * На куче множатся на ширину лома: у танка это около 80 пикселей.
 */
const foci: readonly Focus[] = [
  { dx: -7, dy: -6, power: 1.15 },
  { dx: -41, dy: -2, power: 0.75 },
  { dx: 39, dy: 1, power: 0.85 },
  { dx: 9, dy: 6, power: 0.55 },
];

const tankSpan = 80;

type Jet = {
  emitter: Phaser.GameObjects.Particles.ParticleEmitter;
  dx: number;
  dy: number;
};

type Hearth = {
  id: number;
  x: number;
  y: number;
  span: number;
  due: number;
  scale: number;
  jets: Jet[];
};

type Wisp = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  grow: number;
  life: number;
  max: number;
  spin: number;
  tone: number;
};

const smokeTones = [palette.wallGone, palette.mount, palette.cloudShade, palette.mountFar] as const;

/**
 * Дым и огонь на куче после обрушения.
 * Дым — клубы над гребнем. Огонь — те же очаги, что у танка над обломками.
 * Пыль падения сюда не входит.
 */
export class RuinFire {
  private hearths: Hearth[] = [];
  private wisps: Wisp[] = [];
  private readonly scene: Phaser.Scene;
  private readonly depth: number;
  private readonly gfx: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene, depth: number) {
    this.scene = scene;
    this.depth = depth;
    this.gfx = scene.add.graphics().setDepth(depth);
  }

  /** Зажечь кучу или сдвинуть уже горящую. Повтор не плодит новый столб дыма. */
  light(id: number, x: number, y: number, span: number): void {
    const scale = Math.max(0.28, span / tankSpan);
    const found = this.hearths.find((hearth) => hearth.id === id);
    if (found) {
      const resized = Math.abs(found.scale - scale) > 0.04;
      found.x = x;
      found.y = y;
      found.span = span;
      found.scale = scale;
      if (resized) {
        this.clearJets(found);
        this.spawnFlames(found);
      } else {
        this.placeJets(found);
      }
      return;
    }
    const hearth: Hearth = { id, x, y, span, due: 0, scale, jets: [] };
    this.hearths.push(hearth);
    this.spawnFlames(hearth);
    this.seed(hearth);
  }

  step(delta: number): void {
    const dt = delta / 1000;
    for (const hearth of this.hearths) {
      hearth.due += delta;
      while (hearth.due >= 220) {
        hearth.due -= 220;
        this.puff(hearth, 0);
      }
    }
    const next: Wisp[] = [];
    for (const wisp of this.wisps) {
      wisp.life -= delta;
      if (wisp.life <= 0) continue;
      wisp.x += wisp.vx * dt;
      wisp.y += wisp.vy * dt;
      wisp.spin += dt * 2.2;
      next.push(wisp);
    }
    this.wisps = next;
  }

  draw(): void {
    const gfx = this.gfx;
    gfx.clear();
    for (const wisp of this.wisps) {
      const age = 1 - wisp.life / wisp.max;
      const fadeIn = age < 0.1 ? age / 0.1 : 1;
      const fadeOut = age > 0.5 ? (1 - age) / 0.5 : 1;
      const alpha = 0.78 * fadeIn * fadeOut;
      if (alpha <= 0) continue;
      drawSmoke(gfx, wisp.x + Math.sin(wisp.spin) * 3, wisp.y, wisp.r + wisp.grow * age, wisp.tone, alpha);
    }
  }

  private spawnFlames(hearth: Hearth): void {
    const texture = flameKey(this.scene);
    const scale = hearth.scale;
    for (const focus of foci) {
      const power = focus.power * scale;
      const x = hearth.x + focus.dx * scale;
      const y = hearth.y + focus.dy * scale;
      const flame = this.scene.add.particles(x, y, texture, {
        x: { min: -17 * power, max: 17 * power },
        y: { min: 0, max: 8 * power },
        lifespan: { min: 380, max: 820 },
        frequency: Math.max(28, Math.round(48 / focus.power)),
        quantity: 2,
        speedX: { min: -28 * power, max: 28 * power },
        speedY: { min: -110 * power, max: -48 * power },
        scale: { start: 0.85 * power, end: 2.6 * power },
        alpha: { start: 0.95, end: 0 },
        color: [0xfff6c8, 0xffcc44, 0xff7a18, 0xe03808, 0x6a1408],
        blendMode: Phaser.BlendModes.ADD,
        gravityY: -40 * power,
      });
      flame.setDepth(this.depth - 0.03);
      hearth.jets.push({ emitter: flame, dx: focus.dx, dy: focus.dy });
      const core = this.scene.add.particles(x, y + 2 * scale, texture, {
        x: { min: -8 * power, max: 8 * power },
        y: { min: -2 * power, max: 4 * power },
        lifespan: { min: 180, max: 360 },
        frequency: Math.max(36, Math.round(60 / focus.power)),
        quantity: 1,
        speedX: { min: -12 * power, max: 12 * power },
        speedY: { min: -50 * power, max: -18 * power },
        scale: { start: 0.45 * power, end: 1.1 * power },
        alpha: { start: 1, end: 0.15 },
        color: [0xffffff, 0xfff0a0, 0xffaa33],
        blendMode: Phaser.BlendModes.ADD,
      });
      core.setDepth(this.depth - 0.02);
      hearth.jets.push({ emitter: core, dx: focus.dx, dy: focus.dy + 2 });
    }
    const mid = foci[0]!;
    const embers = this.scene.add.particles(hearth.x + mid.dx * scale, hearth.y + mid.dy * scale, texture, {
      x: { min: -35 * scale, max: 35 * scale },
      y: { min: -4 * scale, max: 10 * scale },
      lifespan: { min: 700, max: 1400 },
      frequency: 70,
      quantity: 1,
      speedX: { min: -40 * scale, max: 40 * scale },
      speedY: { min: -130 * scale, max: -60 * scale },
      scale: { start: 0.22 * scale, end: 0.05 * scale },
      alpha: { start: 1, end: 0 },
      color: [0xffe080, 0xff6010, 0xc03008],
      blendMode: Phaser.BlendModes.ADD,
      gravityY: -10 * scale,
    });
    embers.setDepth(this.depth - 0.01);
    hearth.jets.push({ emitter: embers, dx: mid.dx, dy: mid.dy });
  }

  private placeJets(hearth: Hearth): void {
    for (const jet of hearth.jets) {
      jet.emitter.setPosition(hearth.x + jet.dx * hearth.scale, hearth.y + jet.dy * hearth.scale);
    }
  }

  private clearJets(hearth: Hearth): void {
    for (const jet of hearth.jets) jet.emitter.destroy();
    hearth.jets = [];
  }

  private seed(hearth: Hearth): void {
    for (const age of [0.18, 0.38, 0.58, 0.78]) this.puff(hearth, age);
  }

  private puff(hearth: Hearth, age: number): void {
    const life = 1500 + Math.random() * 700;
    const spent = age * life;
    if (spent >= life - 40) return;
    const big = Math.random() < 0.4;
    const wisp: Wisp = {
      x: hearth.x + (Math.random() - 0.5) * hearth.span * 0.55,
      y: hearth.y - 3,
      vx: (Math.random() - 0.5) * 14,
      vy: -(big ? 20 : 32) - Math.random() * 12,
      r: Math.max(4, hearth.span * (big ? 0.13 : 0.08)),
      grow: Math.max(6, hearth.span * (big ? 0.2 : 0.11)),
      life: life - spent,
      max: life,
      spin: Math.random() * Math.PI * 2,
      tone: smokeTones[Math.floor(Math.random() * smokeTones.length)]!,
    };
    this.rewind(wisp, spent);
    this.wisps.push(wisp);
  }

  private rewind(wisp: Wisp, ms: number): void {
    if (ms <= 0) return;
    const dt = ms / 1000;
    wisp.x += wisp.vx * dt;
    wisp.y += wisp.vy * dt;
  }
}

/** Белое мягкое пятно. Цвет пламени задаёт tint частиц, как у танка. */
function flameKey(scene: Phaser.Scene): string {
  const key = 'ruin-flame';
  if (scene.textures.exists(key)) return key;
  const g = scene.add.graphics();
  g.fillStyle(0xffffff, 0.12);
  g.fillCircle(16, 16, 15);
  g.fillStyle(0xffffff, 0.35);
  g.fillCircle(16, 16, 10);
  g.fillStyle(0xffffff, 0.7);
  g.fillCircle(16, 16, 5);
  g.fillStyle(0xffffff, 1);
  g.fillCircle(16, 16, 2);
  g.generateTexture(key, 32, 32);
  g.destroy();
  scene.textures.get(key).setFilter(Phaser.Textures.FilterMode.LINEAR);
  return key;
}

function drawSmoke(
  gfx: Phaser.GameObjects.Graphics,
  cx: number,
  cy: number,
  r: number,
  tone: number,
  alpha: number,
): void {
  const lobes: readonly [number, number, number, number][] = [
    [0, r * 0.2, 0.92, palette.wallGone],
    [-r * 0.4, r * 0.02, 0.6, tone],
    [r * 0.38, 0, 0.56, tone],
    [0, -r * 0.36, 0.62, palette.mount],
    [r * 0.08, -r * 0.58, 0.36, palette.cloudShade],
  ];
  for (const [dx, dy, scale, color] of lobes) fillDisc(gfx, cx + dx, cy + dy, r * scale, color, alpha);
}

function fillDisc(
  gfx: Phaser.GameObjects.Graphics,
  cx: number,
  cy: number,
  r: number,
  color: number,
  alpha: number,
): void {
  if (r < 1.5) return;
  const r2 = r * r;
  const y0 = Math.floor(cy - r);
  const y1 = Math.ceil(cy + r);
  gfx.fillStyle(color, alpha);
  for (let y = y0; y <= y1; y += 1) {
    const dy = y + 0.5 - cy;
    const span = r2 - dy * dy;
    if (span <= 0) continue;
    const half = Math.sqrt(span);
    const x0 = Math.ceil(cx - half);
    const x1 = Math.floor(cx + half);
    if (x1 >= x0) gfx.fillRect(x0, y, x1 - x0 + 1, 1);
  }
}
