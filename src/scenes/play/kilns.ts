import Phaser from 'phaser';
import type { GroundAt } from '../../campaign/ground';
import { circleHitsRect, crossHitsSolid, rectsOverlap, type HitBox } from '../../combat';
import type { Cover } from '../../cover';
import { grenade, kiln as kilnStats, palette } from '../../constants';
import { readNum, readRecord, type HpPhase } from '../../keep';
import { fitScale, type FrameLayout } from '../../layout';
import type { KilnMark } from '../../types/kiln';
import { blit, ensureCanvas } from './blit';
import { Debris, onFace } from './debris';
import { hash, Pix } from './pix';
import { RuinFire } from './ruinFire';
import { paintSeat } from './seat';

type Phase = 'up' | 'collapse' | 'scrap' | 'down';

type Oven = {
  root: Phaser.GameObjects.Container;
  image: Phaser.GameObjects.Image;
  scrap: Phaser.GameObjects.Image;
  key: string;
  scrapKey: string;
  id: number;
  mark: KilnMark;
  /** Экватор купола на экране. Подошва на три пикселя ниже. */
  ground: number;
  r: number;
  w: number;
  h: number;
  hp: number;
  maxHp: number;
  flash: number;
  stage: number;
  phase: Phase;
  collapse: number;
  clock: number;
  dust: number;
  art: Pix | null;
};

type Puff = {
  x: number;
  y: number;
  ox: number;
  oy: number;
  r: number;
  life: number;
  max: number;
  spin: number;
  tone: number;
  left: number;
  right: number;
};

const dustTones = [palette.cream, palette.wallLite, palette.mortar, palette.pebble] as const;

/**
 * Печи картинки. Очередь колет, четыре гранаты роняют.
 * Обрушение от игрока берёт один бонус из списка картинки. Пустая полоска печь не трогает и бонус не даёт.
 * Попадание сыплет кирпичом с места удара. Обрушение сыплет гуще.
 * Падение: тряска и уход купола под землю. Клубы пыли — только у подошвы лома.
 * Лом остаётся, с кучи идут дым и огонь. Прямой низ закрывает земля картинки. Бока купола трава не красит.
 */
export class Kilns {
  private readonly ovens: Oven[];
  private puffs: Puff[] = [];
  private view: FrameLayout | null = null;
  private readonly scene: Phaser.Scene;
  private readonly seatGfx: Phaser.GameObjects.Graphics;
  private readonly dustGfx: Phaser.GameObjects.Graphics;
  private readonly fire: RuinFire;
  private readonly debris: Debris;
  private readonly at: GroundAt;
  private readonly onBreak: (score: number, rx: number, ry: number) => void;

  constructor(
    scene: Phaser.Scene,
    marks: readonly KilnMark[],
    at: GroundAt,
    debris: Debris,
    onBreak: (score: number, rx: number, ry: number) => void,
  ) {
    this.scene = scene;
    this.at = at;
    this.debris = debris;
    this.onBreak = onBreak;
    // Выше земли, ниже поля: жерди и дома остаются впереди. Пыль чуть над посадкой.
    this.seatGfx = scene.add.graphics().setDepth(0.5);
    this.dustGfx = scene.add.graphics().setDepth(0.6);
    this.fire = new RuinFire(scene, 0.66);
    const maxHp = kilnStats.blasts * grenade.propHits;
    this.ovens = marks.map((mark, index) => {
      const key = ensureCanvas(scene, `kiln-${index}`);
      const scrapKey = ensureCanvas(scene, `kiln-scrap-${index}`);
      const image = scene.add.image(0, 0, key).setOrigin(0.5, 1).setVisible(false);
      const scrap = scene.add.image(0, 0, scrapKey).setOrigin(0.5, 1).setVisible(false);
      const root = scene.add.container(0, 0).setDepth(0.45);
      root.add(scrap);
      root.add(image);
      return {
        root,
        image,
        scrap,
        key,
        scrapKey,
        id: index,
        mark,
        ground: 0,
        r: 0,
        w: 0,
        h: 0,
        hp: maxHp,
        maxHp,
        flash: 0,
        stage: 0,
        phase: 'up',
        collapse: 0,
        clock: 0,
        dust: 0,
        art: null,
      };
    });
  }

  note(): HpPhase[] {
    return this.ovens.map((oven) => ({
      hp: oven.hp,
      phase: oven.phase === 'down' ? 'down' : oven.phase === 'up' ? 'up' : 'scrap',
    }));
  }

  /** Фаза и жизни. Начатое обрушение встаёт кучей: бонус уже взят. */
  recall(data: unknown): void {
    if (!Array.isArray(data)) return;
    data.forEach((item, index) => {
      const oven = this.ovens[index];
      const row = readRecord(item);
      if (!oven || !row) return;
      const phase = row.phase;
      if (phase === 'down') {
        oven.phase = 'down';
        oven.hp = 0;
        return;
      }
      if (phase === 'scrap') {
        oven.phase = 'scrap';
        oven.hp = 0;
        oven.stage = kilnStats.blasts - 1;
        return;
      }
      if (phase !== 'up') return;
      const hp = readNum(row.hp);
      if (hp === null) return;
      oven.phase = 'up';
      oven.hp = Math.min(oven.maxHp, Math.max(0, hp));
      oven.stage = woundStage(oven.hp, oven.maxHp);
    });
  }

  place(view: FrameLayout): void {
    this.view = view;
    const field = view.field;
    for (const oven of this.ovens) {
      if (oven.phase === 'down') continue;
      const r = Math.max(8, Math.round(kilnStats.radius * fitScale(field)));
      const w = r * 2 + 1;
      const h = r + 3;
      const resized = w !== oven.w || h !== oven.h;
      const cx = field.x + Math.round(oven.mark.x * field.width);
      const ground = field.y + Math.round(oven.mark.y * field.height);
      oven.ground = ground;
      oven.r = r;
      oven.root.setPosition(cx, ground + 3);
      if (resized) {
        oven.w = w;
        oven.h = h;
      }
      if (oven.phase === 'up' && (resized || !oven.image.visible)) this.paintStanding(oven);
      if (oven.phase === 'collapse' && resized) this.paintStanding(oven);
      if ((oven.phase === 'collapse' || oven.phase === 'scrap') && resized) this.paintScrap(oven);
      if (oven.phase === 'collapse' && oven.art) this.sink(oven);
      if (oven.phase === 'scrap') {
        oven.image.setVisible(false);
        oven.scrap.setVisible(true);
        this.ignite(oven);
      }
      if (oven.phase === 'up') {
        oven.image.x = 0;
        oven.image.y = 0;
      }
    }
    this.paintSeats(view);
  }

  step(delta: number): void {
    for (const oven of this.ovens) {
      oven.flash = Math.max(0, oven.flash - delta);
      if (oven.phase === 'up' || oven.phase === 'collapse') {
        if (oven.flash > 0) oven.image.setTint(palette.ink);
        else oven.image.clearTint();
      }
      if (oven.phase === 'collapse') this.advance(oven, delta);
    }
    this.tickDust(delta);
    this.fire.step(delta);
  }

  /** Квадрат креста колет купол, в который попал, и сыплет кирпичом с точки удара. */
  hit(box: HitBox, amount: number): void {
    const at = { x: (box.left + box.right) / 2, y: (box.top + box.bottom) / 2 };
    for (const oven of this.ovens) {
      if (oven.phase !== 'up' || oven.r < 1 || !hitsDome(oven, box)) continue;
      this.wound(oven, amount, at.x, at.y, false);
    }
  }

  /** Целая печь закрывает пехоту за куполом. */
  shields(): Cover[] {
    const out: Cover[] = [];
    for (const oven of this.ovens) {
      if (oven.phase !== 'up' || oven.r < 1) continue;
      const box = bounds(oven);
      out.push({ box, sole: box.bottom });
    }
    return out;
  }

  /** Разрыв снимает долю жизни, если купол входит в круг. Четыре таких доли роняют печь. */
  blast(x: number, y: number): void {
    for (const oven of this.ovens) {
      if (oven.phase !== 'up' || oven.r < 1 || !blastHitsDome(x, y, oven)) continue;
      this.wound(oven, grenade.propHits, x, y, true);
    }
  }

  draw(): void {
    const gfx = this.dustGfx;
    gfx.clear();
    for (const puff of this.puffs) {
      const age = 1 - puff.life / puff.max;
      const alpha = age < 0.12 ? (age / 0.12) * 0.94 : age > 0.55 ? ((1 - age) / 0.45) * 0.94 : 0.94;
      if (alpha <= 0) continue;
      drawCloud(gfx, puff.x, puff.y, puff.r * (0.72 + age * 0.38), puff.tone, alpha);
    }
    this.fire.draw();
  }

  /**
   * Прямую подошву закрывает та же земля, что под куполом.
   * Бока, которые не доходят до земли, не сажаются: иначе трава висит на кладке.
   * На падении и уходе под землю посадка уходит.
   */
  private paintSeats(view: FrameLayout): void {
    this.seatGfx.clear();
    for (const oven of this.ovens) {
      if (oven.phase === 'down' || oven.phase === 'collapse') continue;
      const image = oven.phase === 'scrap' ? oven.scrap : oven.image;
      if (!image.visible) continue;
      paintSeat(
        this.seatGfx,
        this.scene,
        {
          x: oven.root.x,
          y: oven.root.y,
          displayWidth: image.displayWidth,
          displayHeight: image.displayHeight,
          texture: image.texture,
        },
        view.field,
        view.track,
        3,
        { left: true, right: true, tuft: true },
        this.at,
        2,
      );
    }
  }

  fall(): void {
    this.ovens.forEach((oven, index) => {
      if (oven.phase !== 'up') return;
      oven.phase = 'down';
      this.scene.tweens.add({
        targets: oven.root,
        y: oven.root.y + 180,
        angle: index % 2 === 0 ? 10 : -8,
        duration: 680,
        delay: index * 100,
        ease: 'Quad.easeIn',
      });
    });
    this.refreshSeats();
  }

  private wound(oven: Oven, amount: number, x: number, y: number, heavy: boolean): void {
    if (oven.phase !== 'up' || amount <= 0) return;
    oven.hp -= amount;
    oven.flash = 80;
    const killing = oven.hp <= 0;
    this.spray(oven, x, y, heavy, killing);
    if (killing) {
      this.beginCollapse(oven);
      return;
    }
    const stage = woundStage(oven.hp, oven.maxHp);
    if (stage === oven.stage) return;
    oven.stage = stage;
    this.paintStanding(oven);
  }

  /** Кирпич с того места купола, куда пришёлся удар. Обрушение сыплет ещё с макушки, бока и пода. */
  private spray(oven: Oven, x: number, y: number, heavy: boolean, collapse: boolean): void {
    const face = bounds(oven);
    const spot = onFace(face, x, y);
    this.debris.burst(spot.x, spot.y, 'brick', heavy || collapse, 'field');
    if (!collapse) return;
    for (const along of [0.18, 0.5, 0.88]) {
      const py = face.top + (face.bottom - face.top) * along;
      if (Math.abs(py - spot.y) < 8) continue;
      this.debris.burst(oven.root.x, py, 'brick', false, 'field');
    }
  }

  private beginCollapse(oven: Oven): void {
    oven.phase = 'collapse';
    oven.stage = kilnStats.blasts - 1;
    oven.collapse = 0;
    oven.clock = 0;
    oven.dust = 0;
    oven.image.x = 0;
    oven.image.y = 0;
    this.paintStanding(oven);
    this.paintScrap(oven);
    oven.scrap.setVisible(true);
    const field = this.view?.field;
    const x = oven.root.x;
    const y = oven.root.y - oven.h * 0.45;
    const rx = field ? (x - field.x) / Math.max(1, field.width) : oven.mark.x;
    const ry = field ? (y - field.y) / Math.max(1, field.height) : oven.mark.y;
    this.onBreak(kilnStats.score, rx, ry);
    this.spawnDust(oven);
    this.refreshSeats();
  }

  private advance(oven: Oven, delta: number): void {
    oven.clock += delta;
    oven.collapse += delta / kilnStats.collapseMs;
    oven.dust += delta;
    const t = Math.min(1, oven.collapse);
    const amp = Math.max(1, Math.round(oven.w * 0.018));
    const fade = 1 - easeIn(t);
    oven.image.x = Math.round(Math.sin(oven.clock * 0.046) * amp * fade);
    oven.image.y = Math.round(Math.sin(oven.clock * 0.037) * Math.max(1, amp * 0.5) * fade);
    this.sink(oven);
    while (oven.dust >= 100) {
      oven.dust -= 100;
      this.spawnDust(oven);
    }
    if (oven.collapse < 1) return;
    oven.phase = 'scrap';
    oven.image.clearTint();
    oven.image.setVisible(false);
    oven.image.x = 0;
    oven.image.y = 0;
    oven.scrap.setVisible(true);
    this.ignite(oven);
    this.refreshSeats();
  }

  /** Гребень кирпичной кучи. Пламя стоит здесь, дым уходит вверх. */
  private ignite(oven: Oven): void {
    const pile = Math.max(8, Math.round(oven.h * kilnStats.scrap));
    this.fire.light(oven.id, oven.root.x, oven.root.y - pile * 0.62, Math.max(14, oven.w * 0.42));
  }

  private sink(oven: Oven): void {
    if (!oven.art) return;
    const drop = Math.round(easeIn(Math.min(1, oven.collapse)) * oven.h);
    blit(this.scene, oven.key, sinkArt(oven.art, drop));
    oven.image.setTexture(oven.key);
    oven.image.setDisplaySize(oven.w, oven.h);
  }

  private paintStanding(oven: Oven): void {
    if (oven.w < 1 || oven.h < 1) return;
    const art = paintDome(oven.r, oven.stage);
    oven.art = art;
    blit(this.scene, oven.key, art);
    oven.image.setTexture(oven.key);
    oven.image.setDisplaySize(oven.w, oven.h);
    oven.image.setVisible(true);
  }

  private paintScrap(oven: Oven): void {
    const h = Math.max(8, Math.round(oven.h * kilnStats.scrap));
    blit(this.scene, oven.scrapKey, paintRubble(oven.w, h));
    oven.scrap.setTexture(oven.scrapKey);
    oven.scrap.setDisplaySize(oven.w, h);
  }

  private spawnDust(oven: Oven): void {
    const band = plinthBand(oven);
    const count = Math.max(3, Math.round(oven.w / 48));
    const spanX = band.right - band.left;
    for (let i = 0; i < count; i += 1) {
      const r = Math.max(6, Math.round(oven.w * (0.08 + Math.random() * 0.04)));
      const inset = Math.min(r * 0.4, spanX * 0.15);
      const ox = band.left + inset + Math.random() * Math.max(0, spanX - inset * 2);
      const oy = band.bottom - r * 0.22;
      const life = 460 + Math.random() * 180;
      this.puffs.push({
        x: ox,
        y: oy,
        ox,
        oy,
        r,
        life,
        max: life,
        spin: Math.random() * Math.PI * 2,
        tone: dustTones[Math.floor(Math.random() * dustTones.length)]!,
        left: band.left,
        right: band.right,
      });
    }
  }

  private tickDust(delta: number): void {
    const dt = delta / 1000;
    const next: Puff[] = [];
    for (const puff of this.puffs) {
      puff.life -= delta;
      if (puff.life <= 0) continue;
      puff.spin += dt * 5;
      puff.x = clamp(puff.ox + Math.sin(puff.spin) * 2, puff.left, puff.right);
      puff.y = puff.oy + Math.cos(puff.spin * 0.7) * 2;
      next.push(puff);
    }
    this.puffs = next;
  }

  private refreshSeats(): void {
    if (this.view) this.paintSeats(this.view);
  }
}

/** Верх купола — полукруг. Под экватором короткий прямой под, его и закрывает земля. */
function hitsDome(oven: Oven, box: HitBox): boolean {
  const face = bounds(oven);
  if (!rectsOverlap(box, face)) return false;
  const cx = oven.root.x;
  const half = oven.r * 0.92;
  return crossHitsSolid(box, face, (x, y) => {
    const dx = x - cx;
    const dy = y - oven.ground;
    if (dy <= 0 && dx * dx + dy * dy <= oven.r * oven.r) return true;
    return x >= cx - half && x <= cx + half && y >= oven.ground && y <= oven.ground + 2;
  });
}

function blastHitsDome(x: number, y: number, oven: Oven): boolean {
  const cx = oven.root.x;
  const dx = x - cx;
  const dy = y - oven.ground;
  if (dy <= 0) return Math.hypot(dx, dy) <= oven.r + grenade.blastRadius;
  const half = oven.r * 0.92;
  const nearest = {
    left: cx - half,
    right: cx + half,
    top: oven.ground,
    bottom: oven.ground + 2,
  };
  return circleHitsRect(x, y, grenade.blastRadius, nearest);
}

function bounds(oven: Oven): HitBox {
  return {
    left: oven.root.x - oven.r,
    right: oven.root.x + oven.r,
    top: oven.ground - oven.r,
    bottom: oven.ground + 2,
  };
}

function plinthBand(oven: Oven): { left: number; right: number; bottom: number } {
  const half = oven.r * 0.92;
  return {
    left: oven.root.x - half,
    right: oven.root.x + half,
    bottom: oven.root.y,
  };
}

function woundStage(hp: number, maxHp: number): number {
  const lost = maxHp - Math.max(0, hp);
  return Math.min(kilnStats.blasts - 1, Math.floor(lost / grenade.propHits));
}

function easeIn(t: number): number {
  const u = Math.min(1, Math.max(0, t));
  return u * u;
}

function sinkArt(src: Pix, dy: number): Pix {
  const out = new Pix(src.w, src.h);
  const shift = Math.max(0, Math.min(src.h, dy));
  const row = src.w * 4;
  for (let y = 0; y < src.h - shift; y += 1) {
    const from = y * row;
    out.data.set(src.data.subarray(from, from + row), (y + shift) * row);
  }
  return out;
}

function clamp(v: number, min: number, max: number): number {
  if (max < min) return (min + max) / 2;
  return Math.min(max, Math.max(min, v));
}

/** Купол с устьем. 0 — целый. 1–3 — трещины и проломы, по гранате на ступень. Под не трогается. */
function paintDome(r: number, stage: number): Pix {
  const w = r * 2 + 1;
  const h = r + 3;
  const pix = new Pix(w, h);
  const cx = r;
  for (let y = -r; y <= 2; y += 1) {
    const span = y < 0 ? Math.sqrt(Math.max(0, r * r - y * y)) : r * 0.92;
    const row = Math.floor((y + r) / 4);
    for (let x = Math.round(-span); x <= Math.round(span); x += 1) {
      const edge = Math.abs(x) >= span - 1.2;
      const gap = (x + row * 3) % 6 === 0;
      let color: number = row % 2 === 0 ? palette.brick : palette.brickLite;
      if (edge || gap || y >= 0) color = palette.brickDark;
      if (y === -r + row * 4) color = palette.mortar;
      pix.px(cx + x, y + r, color);
    }
  }
  const mouthW = Math.round(r * 0.34);
  const mouthH = Math.round(r * 0.42);
  const mouthBase = r - Math.round(r * 0.08);
  for (let y = -mouthH; y <= 0; y += 1) {
    const span = mouthW * Math.sqrt(Math.max(0, 1 - (y / mouthH) ** 2));
    for (let x = Math.round(-span); x <= Math.round(span); x += 1) {
      pix.px(cx + x, mouthBase + y, y < -mouthH + 2 ? palette.brickDark : palette.line);
    }
  }
  if (stage > 0) scar(pix, stage);
  return pix;
}

/** Лом на месте печи. Низ прямой, выше рваная куча кирпича. */
function paintRubble(w: number, h: number): Pix {
  const pix = new Pix(w, h);
  const course = Math.max(3, Math.round(h / 3));
  const brickW = Math.max(4, Math.round(w / 8));
  for (let x = 0; x < w; x += 1) {
    const edge = Math.min(x, w - 1 - x);
    const fade = w * 0.14;
    const taper = edge < fade ? Math.round((1 - edge / Math.max(1, fade)) * h * 0.55) : 0;
    const jag = hash(x, 4) % Math.max(2, Math.round(h * 0.4));
    const top = Math.max(0, Math.min(h - 2, taper + jag));
    for (let y = top; y < h; y += 1) {
      const row = Math.floor((y - top) / course);
      const shift = row % 2 === 0 ? 0 : Math.floor(brickW / 2);
      const seam = (x + shift) % brickW === 0 || (y - top) % course === 0;
      if (seam && y < h - 1) {
        pix.px(x, y, palette.mortar);
        continue;
      }
      const n = hash(x, y);
      pix.px(x, y, n % 6 === 0 ? palette.brickDark : n % 5 === 0 ? palette.brickLite : palette.brick);
    }
  }
  return pix;
}

function scar(pix: Pix, stage: number): void {
  const w = pix.w;
  const h = pix.h;
  crack(pix, Math.round(w * 0.22), Math.round(h * 0.28), Math.round(w * 0.42), Math.round(h * 0.55));
  if (stage < 2) return;
  crack(pix, Math.round(w * 0.74), Math.round(h * 0.3), Math.round(w * 0.56), Math.round(h * 0.52));
  gouge(pix, w * 0.3, h * 0.4, Math.max(2, w * 0.06), Math.max(2, h * 0.05));
  if (stage < 3) return;
  gouge(pix, w * 0.66, h * 0.34, Math.max(3, w * 0.08), Math.max(2, h * 0.06));
}

function crack(pix: Pix, x0: number, y0: number, x1: number, y1: number): void {
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  if (steps < 1) return;
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const x = Math.round(x0 + (x1 - x0) * t + ((hash(i, x0) % 3) - 1));
    const y = Math.round(y0 + (y1 - y0) * t + ((hash(y0, i) % 3) - 1));
    if (!brickAt(pix, x, y)) continue;
    pix.px(x, y, palette.line);
    if (brickAt(pix, x + 1, y) && hash(x, y) % 2 === 0) pix.px(x + 1, y, palette.brickDark);
  }
}

function gouge(pix: Pix, cx: number, cy: number, rx: number, ry: number): void {
  if (!brickAt(pix, Math.round(cx), Math.round(cy))) return;
  const rx2 = rx * rx;
  const ry2 = ry * ry;
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y += 1) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x += 1) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const e = (dx * dx) / rx2 + (dy * dy) / ry2;
      if (e > 1 || !brickAt(pix, x, y)) continue;
      if (e > 0.72 && hash(x, y) % 3 === 0) continue;
      pix.erase(x, y);
    }
  }
}

/** Кладка купола. Устье и под не дырявятся: устье остаётся чёрным, под сажается на землю. */
function brickAt(pix: Pix, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= pix.w || y >= pix.h || y >= pix.h - 4) return false;
  const i = (y * pix.w + x) * 4;
  if (pix.data[i + 3]! < 16) return false;
  const color = (pix.data[i]! << 16) | (pix.data[i + 1]! << 8) | pix.data[i + 2]!;
  return color !== palette.line;
}

function drawCloud(
  gfx: Phaser.GameObjects.Graphics,
  cx: number,
  cy: number,
  r: number,
  tone: number,
  alpha: number,
): void {
  const lobes: readonly [number, number, number, number][] = [
    [0, r * 0.28, 0.92, palette.creamDark],
    [-r * 0.5, r * 0.06, 0.64, tone],
    [r * 0.52, r * 0.02, 0.6, tone],
    [0, -r * 0.06, 0.86, tone],
    [0, -r * 0.48, 0.52, palette.wallLite],
    [-r * 0.16, -r * 0.52, 0.3, palette.creamLite],
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
  const rad = r;
  const r2 = rad * rad;
  const y0 = Math.floor(cy - rad);
  const y1 = Math.ceil(cy + rad);
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
