/** Режим запуска: бой с волной или полигон без врагов. */
export type RuntimeKind = 'battle' | 'range';

export class GameRuntime {
  readonly kind: RuntimeKind;

  constructor(kind: RuntimeKind) {
    this.kind = kind;
  }

  get withoutEnemies(): boolean {
    return this.kind === 'range';
  }

  /** Запись вкладки. Полигон не смешивается с обычным боем. */
  get keepKey(): string {
    return this.kind === 'range' ? 'cabal-keep-range' : 'cabal-keep';
  }

  /** Полигон сразу в бой, без экрана сложности. */
  get skipDifficultyMenu(): boolean {
    return this.kind === 'range';
  }

  /** Сложность захода на полигоне — только для шкалы урона объектов, врагов нет. */
  get defaultDifficulty(): string {
    return 'easy';
  }
}

let active = new GameRuntime('battle');

export function setRuntime(runtime: GameRuntime): void {
  active = runtime;
}

export function gameRuntime(): GameRuntime {
  return active;
}