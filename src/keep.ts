import { hud, type DropKind, type WeaponId } from './constants';
import { difficultyById } from './difficulty';
import { marchFrom, type March } from './campaign/march';
import { route } from './campaign/route';

/**
 * Бой этой вкладки. Обновление страницы читает запись обратно.
 * Закрытая вкладка её стирает: слота и меню «продолжить» нет.
 * Смена картинки пишет заход заново, поле и ствол туда не входят.
 */
const key = 'cabal-keep';

export type HpPhase = { hp: number; phase: 'up' | 'scrap' | 'down' };
export type RockRow = { hp: number; phase: 'up' | 'scrap' };
export type TreeRow = { hp: number; whole: boolean; pile: boolean };
export type BarrelRow = { hp: number; whole: boolean };
export type PropRow = { hp: number; alive: boolean };
export type GoneRow = { hp: number; gone: boolean };
export type RailRow = { hp: number; alive: boolean };
export type DropRow = { kind: DropKind; rx: number; ry: number };

export type Keep = {
  v: 1;
  fresh: boolean;
  march: March;
  paused: boolean;
  help: boolean;
  choosing: 'start' | 'restart' | null;
  down: 'continue' | 'over' | null;
  cleared: boolean;
  settled: boolean;
  clearWait: number;
  clearHold: number;
  angle: number;
  hurt: number;
  slain: number;
  quota: number;
  weapon: WeaponId;
  holdLeft: number;
  ratio: number;
  kneel: boolean;
  wall: number[];
  houses: HpPhase[];
  kilns: HpPhase[];
  rocks: RockRow[];
  trees: TreeRow[];
  barrels: BarrelRow[];
  props: PropRow[];
  shorts: GoneRow[];
  bags: GoneRow[];
  rails: RailRow[];
  pickets: boolean[][];
  drops: DropRow[];
  bag: DropKind[];
  infantry: unknown;
  enemies: unknown;
};

export function readNum(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return value;
}

export function readRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

/** Смена картинки. Поле ещё не собрано, обновление откроет её с начала. */
export function storeFresh(march: March): void {
  storeKeep(blank(march, true));
}

export function storeKeep(keep: Keep): void {
  try {
    sessionStorage.setItem(key, JSON.stringify(keep));
  } catch {
    // Квота или закрытое хранилище. Бой в этой вкладке просто не переживёт обновление.
  }
}

export function readKeep(): Keep | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const data = JSON.parse(raw) as Partial<Keep>;
    if (data.v !== 1) return null;
    const march = sanitizeMarch(data.march);
    if (!march) return null;
    return {
      v: 1,
      fresh: data.fresh === true,
      march,
      paused: data.paused === true,
      help: data.help === true,
      choosing: data.choosing === 'start' || data.choosing === 'restart' ? data.choosing : null,
      down: data.down === 'continue' || data.down === 'over' ? data.down : null,
      cleared: data.cleared === true,
      settled: data.settled === true,
      clearWait: count(data.clearWait, 120_000),
      clearHold: count(data.clearHold, 120_000),
      angle: readNum(data.angle) ?? -5,
      hurt: count(data.hurt, 20_000),
      slain: count(data.slain, 10_000),
      quota: count(data.quota, 10_000),
      weapon: data.weapon === 'rapid' || data.weapon === 'spread' ? data.weapon : 'rifle',
      holdLeft: count(data.holdLeft, 20_000),
      ratio: ratioOf(data.ratio),
      kneel: data.kneel === true,
      wall: numberList(data.wall),
      houses: Array.isArray(data.houses) ? (data.houses as HpPhase[]) : [],
      kilns: Array.isArray(data.kilns) ? (data.kilns as HpPhase[]) : [],
      rocks: Array.isArray(data.rocks) ? (data.rocks as RockRow[]) : [],
      trees: Array.isArray(data.trees) ? (data.trees as TreeRow[]) : [],
      barrels: Array.isArray(data.barrels) ? (data.barrels as BarrelRow[]) : [],
      props: Array.isArray(data.props) ? (data.props as PropRow[]) : [],
      shorts: Array.isArray(data.shorts) ? (data.shorts as GoneRow[]) : [],
      bags: Array.isArray(data.bags) ? (data.bags as GoneRow[]) : [],
      rails: Array.isArray(data.rails) ? (data.rails as RailRow[]) : [],
      pickets: Array.isArray(data.pickets) ? (data.pickets as boolean[][]) : [],
      drops: Array.isArray(data.drops) ? (data.drops as DropRow[]) : [],
      bag: Array.isArray(data.bag) ? (data.bag as DropKind[]) : [],
      infantry: data.infantry ?? null,
      enemies: data.enemies ?? null,
    };
  } catch {
    return null;
  }
}

function blank(march: March, fresh: boolean): Keep {
  return {
    v: 1,
    fresh,
    march,
    paused: false,
    help: false,
    choosing: difficultyById(march.difficulty) ? null : 'start',
    down: null,
    cleared: false,
    settled: false,
    clearWait: 0,
    clearHold: 0,
    angle: -5,
    hurt: 0,
    slain: 0,
    quota: 0,
    weapon: 'rifle',
    holdLeft: 0,
    ratio: 0.5,
    kneel: false,
    wall: [],
    houses: [],
    kilns: [],
    rocks: [],
    trees: [],
    barrels: [],
    props: [],
    shorts: [],
    bags: [],
    rails: [],
    pickets: [],
    drops: [],
    bag: [],
    infantry: null,
    enemies: null,
  };
}

function sanitizeMarch(data: unknown): March | null {
  const march = marchFrom(data);
  const row = readRecord(data);
  if (!row || typeof row.level !== 'number' || typeof row.picture !== 'number') return null;
  if (!Number.isInteger(march.level) || !Number.isInteger(march.picture)) return null;
  if (march.level < 0 || march.level >= route.length) return null;
  const level = route[march.level];
  if (!level || march.picture < 0 || march.picture >= level.pictures.length) return null;
  if (march.difficulty !== null && !difficultyById(march.difficulty)) return null;
  return {
    ...march,
    score: count(march.score, 99_999_999),
    lives: count(march.lives, 30),
    grenades: count(march.grenades, 999),
    continues: Math.min(hud.continues, count(march.continues, hud.continues)),
  };
}

function count(value: unknown, max: number): number {
  const n = readNum(value);
  if (n === null || n < 0) return 0;
  return Math.min(max, Math.floor(n));
}

function ratioOf(value: unknown): number {
  const n = readNum(value);
  if (n === null) return 0.5;
  return Math.min(1, Math.max(0, n));
}

function numberList(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  const out: number[] = [];
  for (const item of value) {
    const n = readNum(item);
    if (n !== null) out.push(n);
  }
  return out;
}
