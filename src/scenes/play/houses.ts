import Phaser from 'phaser';
import type { GroundAt } from '../../campaign/ground';
import { grenade, house as houseStats, palette } from '../../constants';
import type { HouseMark } from '../../types/house';
import { circleHitsRect, rectsOverlap, type HitBox } from '../../combat';
import { belowHorizon, type FrameLayout } from '../../layout';
import { blit, ensureCanvas } from './blit';
import { buildingBox, drawBuilding, drawScrap, facadeBands, scrapHeight } from './buildings';
import { Debris, onFace, type DebrisKind } from './debris';
import { paintSeat } from './seat';
import { Pix } from './pix';
import { RuinFire } from './ruinFire';

type Phase = 'up' | 'collapse' | 'scrap' | 'down';

type House = {
  root: Phaser.GameObjects.Container;
  image: Phaser.GameObjects.Image;
  scrap: Phaser.GameObjects.Image;
  key: string;
  scrapKey: string;
  id: number;
  mark: HouseMark;
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
 * Дома картинки. Очередь колет, четыре гранаты роняют.
 * Обрушение от игрока берёт один бонус из списка картинки. Пустая полоска роняет дом без бонуса.
 * Попадание сыплет ошметками с места удара. Обрушение сыплет гуще.
 * Падение: тряска и уход фасада под землю. Клубы пыли — только у цоколя лома.
 * Лом остаётся, с кучи идут дым и огонь. Пустая полоска роняет тех, кто ещё стоит.
 * Прямой низ фасада закрывает земля картинки, как у забора.
 */
export class Houses {
  private readonly houses: House[];
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
    marks: readonly HouseMark[],
    field: Phaser.GameObjects.Container,
    at: GroundAt,
    debris: Debris,
    onBreak: (score: number, rx: number, ry: number) => void,
  ) {
    this.scene = scene;
    this.at = at;
    this.debris = debris;
    this.onBreak = onBreak;
    // Выше контейнера поля (дома), ниже кроны живого дерева. Пыль чуть над посадкой.
    this.seatGfx = scene.add.graphics().setDepth(1.1);
    this.dustGfx = scene.add.graphics().setDepth(1.16);
    this.fire = new RuinFire(scene, 1.18);
    const maxHp = houseStats.blasts * grenade.propHits;
    this.houses = marks.map((mark, index) => {
      const key = ensureCanvas(scene, `house-${index}`);
      const scrapKey = ensureCanvas(scene, `house-scrap-${index}`);
      const image = scene.add.image(0, 0, key).setOrigin(0.5, 1).setVisible(false);
      const scrap = scene.add.image(0, 0, scrapKey).setOrigin(0.5, 1).setVisible(false);
      const root = scene.add.container(0, 0);
      root.add(scrap);
      root.add(image);
      field.add(root);
      return {
        root,
        image,
        scrap,
        key,
        scrapKey,
        id: index,
        mark,
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

  place(view: FrameLayout): void {
    this.view = view;
    const field = view.field;
    for (const house of this.houses) {
      if (house.phase === 'down') continue;
      const box = buildingBox(house.mark.w, house.mark.h, house.mark.y, field);
      const resized = box.w !== house.w || box.h !== house.h;
      house.root.setPosition(field.x + house.mark.x * field.width, field.y + belowHorizon(house.mark.y, field));
      if (resized) {
        house.w = box.w;
        house.h = box.h;
      }
      if (house.phase === 'up' && (resized || !house.image.visible)) this.paintStanding(house);
      if (house.phase === 'collapse' && resized) this.paintStanding(house);
      if ((house.phase === 'collapse' || house.phase === 'scrap') && resized) this.paintScrap(house);
      if (house.phase === 'collapse' && house.art) this.sink(house);
      if (house.phase === 'scrap') {
        house.image.setVisible(false);
        house.scrap.setVisible(true);
        this.ignite(house);
      }
      if (house.phase === 'up') {
        house.image.x = 0;
        house.image.y = 0;
      }
    }
    this.paintSeats(view);
  }

  step(delta: number): void {
    for (const house of this.houses) {
      house.flash = Math.max(0, house.flash - delta);
      if (house.phase === 'up' || house.phase === 'collapse') {
        if (house.flash > 0) house.image.setTint(palette.ink);
        else house.image.clearTint();
      }
      if (house.phase === 'collapse') this.advance(house, delta);
    }
    this.tickDust(delta);
    this.fire.step(delta);
  }

  /** Квадрат креста колет фасад, в который попал, и сыплет крошкой с точки удара. */
  hit(box: HitBox, amount: number): void {
    const at = { x: (box.left + box.right) / 2, y: (box.top + box.bottom) / 2 };
    for (const house of this.houses) {
      if (house.phase !== 'up' || house.w < 1 || !rectsOverlap(box, facade(house))) continue;
      this.wound(house, amount, at.x, at.y, false);
    }
  }

  /** Разрыв снимает долю жизни, если фасад входит в круг. Четыре таких доли роняют дом. */
  blast(x: number, y: number): void {
    for (const house of this.houses) {
      if (house.phase !== 'up' || house.w < 1 || !circleHitsRect(x, y, grenade.blastRadius, facade(house))) continue;
      this.wound(house, grenade.propHits, x, y, true);
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
   * Прямую подошву закрывает та же земля, что под фасадом.
   * На падении и уходе под землю посадка уходит: клочья не едут с домом и не закрывают пыль.
   */
  private paintSeats(view: FrameLayout): void {
    this.seatGfx.clear();
    for (const house of this.houses) {
      if (house.phase === 'down' || house.phase === 'collapse') continue;
      const image = house.phase === 'scrap' ? house.scrap : house.image;
      if (!image.visible) continue;
      paintSeat(
        this.seatGfx,
        this.scene,
        {
          x: house.root.x,
          y: house.root.y,
          displayWidth: image.displayWidth,
          displayHeight: image.displayHeight,
          texture: image.texture,
        },
        view.field,
        view.track,
        3,
        { left: true, right: true, tuft: true },
        this.at,
      );
    }
  }

  fall(): void {
    this.houses.forEach((house, index) => {
      if (house.phase !== 'up') return;
      house.phase = 'down';
      this.scene.tweens.add({
        targets: house.root,
        y: house.root.y + 180,
        angle: index % 2 === 0 ? 10 : -8,
        duration: 680,
        delay: index * 100,
        ease: 'Quad.easeIn',
      });
    });
    this.refreshSeats();
  }

  private wound(house: House, amount: number, x: number, y: number, heavy: boolean): void {
    if (house.phase !== 'up' || amount <= 0) return;
    house.hp -= amount;
    house.flash = 80;
    const killing = house.hp <= 0;
    this.spray(house, x, y, heavy, killing);
    if (killing) {
      this.beginCollapse(house);
      return;
    }
    const stage = woundStage(house.hp, house.maxHp);
    if (stage === house.stage) return;
    house.stage = stage;
    this.paintStanding(house);
  }

  /** Крошка с того места фасада, куда пришёлся удар. Обрушение сыплет ещё с крыши, стены и цоколя. */
  private spray(house: House, x: number, y: number, heavy: boolean, collapse: boolean): void {
    const face = facade(house);
    const spot = onFace(face, x, y);
    this.debris.burst(spot.x, spot.y, chipOf(house, spot.y), heavy || collapse, 'field');
    if (!collapse) return;
    const mid = (face.left + face.right) / 2;
    for (const along of [0.18, 0.5, 0.88]) {
      const py = face.top + house.h * along;
      if (Math.abs(py - spot.y) < 8) continue;
      this.debris.burst(mid, py, chipOf(house, py), false, 'field');
    }
  }

  private beginCollapse(house: House): void {
    house.phase = 'collapse';
    house.stage = houseStats.blasts - 1;
    house.collapse = 0;
    house.clock = 0;
    house.dust = 0;
    house.image.x = 0;
    house.image.y = 0;
    this.paintStanding(house);
    this.paintScrap(house);
    house.scrap.setVisible(true);
    const field = this.view?.field;
    const x = house.root.x;
    const y = house.root.y - house.h * 0.45;
    const rx = field ? (x - field.x) / Math.max(1, field.width) : house.mark.x;
    const ry = field ? (y - field.y) / Math.max(1, field.height) : house.mark.y;
    this.onBreak(houseStats.score, rx, ry);
    this.spawnDust(house);
    this.refreshSeats();
  }

  private advance(house: House, delta: number): void {
    house.clock += delta;
    house.collapse += delta / houseStats.collapseMs;
    house.dust += delta;
    const t = Math.min(1, house.collapse);
    const amp = Math.max(1, Math.round(house.w * 0.018));
    const fade = 1 - easeIn(t);
    house.image.x = Math.round(Math.sin(house.clock * 0.046) * amp * fade);
    house.image.y = Math.round(Math.sin(house.clock * 0.037) * Math.max(1, amp * 0.5) * fade);
    this.sink(house);
    while (house.dust >= 100) {
      house.dust -= 100;
      this.spawnDust(house);
    }
    if (house.collapse < 1) return;
    house.phase = 'scrap';
    house.image.clearTint();
    house.image.setVisible(false);
    house.image.x = 0;
    house.image.y = 0;
    house.scrap.setVisible(true);
    this.ignite(house);
    this.refreshSeats();
  }

  /** Гребень кучи. Пламя стоит здесь, дым уходит вверх. */
  private ignite(house: House): void {
    const pile = scrapHeight(house.h);
    this.fire.light(house.id, house.root.x, house.root.y - pile * 0.56, Math.max(16, house.w * 0.46));
  }

  private sink(house: House): void {
    if (!house.art) return;
    const drop = Math.round(easeIn(Math.min(1, house.collapse)) * house.h);
    blit(this.scene, house.key, sinkArt(house.art, drop));
    house.image.setTexture(house.key);
    house.image.setDisplaySize(house.w, house.h);
  }

  private paintStanding(house: House): void {
    if (house.w < 1 || house.h < 1) return;
    const art = drawBuilding(house.mark.kind, house.w, house.h, house.stage);
    house.art = art;
    blit(this.scene, house.key, art);
    house.image.setTexture(house.key);
    house.image.setDisplaySize(house.w, house.h);
    house.image.setVisible(true);
  }

  private paintScrap(house: House): void {
    const h = scrapHeight(house.h);
    blit(this.scene, house.scrapKey, drawScrap(house.w, h));
    house.scrap.setTexture(house.scrapKey);
    house.scrap.setDisplaySize(house.w, h);
  }

  private spawnDust(house: House): void {
    const band = plinthBand(house);
    const count = Math.max(3, Math.round(house.w / 48));
    const spanX = band.right - band.left;
    for (let i = 0; i < count; i += 1) {
      const r = Math.max(8, Math.round(house.w * (0.08 + Math.random() * 0.04)));
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

/** Черепица с крыши, штукатурка со стены, кирпич с цоколя. Руина — кирпич, синяя дверь — искры. */
function chipOf(house: House, y: number): DebrisKind {
  const kind = house.mark.kind;
  if (kind === 'gate') return 'spark';
  if (kind === 'ruin') return 'brick';
  const bands = facadeBands(kind);
  const along = (y - (house.root.y - house.h)) / Math.max(1, house.h);
  if (!bands || along > bands.found) return 'brick';
  if (along < bands.roof) return 'tile';
  return kind === 'manor' ? 'stucco' : 'plaster';
}

function facade(house: House): HitBox {
  return {
    left: house.root.x - house.w / 2,
    right: house.root.x + house.w / 2,
    top: house.root.y - house.h,
    bottom: house.root.y,
  };
}

/** Подошва лома. Центры клубов стоят здесь, сами шары поднимаются над цоколем. */
function plinthBand(house: House): { left: number; right: number; bottom: number } {
  return {
    left: house.root.x - house.w / 2,
    right: house.root.x + house.w / 2,
    bottom: house.root.y,
  };
}

function woundStage(hp: number, maxHp: number): number {
  const lost = maxHp - Math.max(0, hp);
  return Math.min(houseStats.blasts - 1, Math.floor(lost / grenade.propHits));
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

/** Клуб: тёмный низ, боковые шары, светлая макушка. Каждый шар круглый. */
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
