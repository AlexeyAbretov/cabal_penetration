import { grenade, hud } from '../constants';
import { pictureAt, route } from './route';
import type { Picture } from './picture';

/** Заход между картинками. Ствол сюда не входит: на границе он сгорает. */
export type March = {
  level: number;
  picture: number;
  score: number;
  lives: number;
  grenades: number;
  continues: number;
  /** Ключ из списка сложностей. Пусто, пока игрок не выбрал. */
  difficulty: string | null;
};

function blankMarch(): March {
  return {
    level: 0,
    picture: 0,
    score: 0,
    lives: hud.lives,
    grenades: grenade.stock,
    continues: hud.continues,
    difficulty: null,
  };
}

/** Новый заход с уже выбранной сложностью. Первая картинка, счёт и жизни со старта. */
export function openMarch(difficulty: string): March {
  return { ...blankMarch(), difficulty };
}

/** Первый старт сцены приходит без захода. Пустой объект от Phaser — тоже не заход. */
export function marchFrom(data: unknown): March {
  if (!data || typeof data !== 'object') return blankMarch();
  const row = data as Partial<March>;
  if (typeof row.level !== 'number' || typeof row.picture !== 'number') return blankMarch();
  return {
    level: row.level,
    picture: row.picture,
    score: row.score ?? 0,
    lives: row.lives ?? hud.lives,
    grenades: row.grenades ?? grenade.stock,
    continues: row.continues ?? hud.continues,
    difficulty: typeof row.difficulty === 'string' ? row.difficulty : null,
  };
}

export function marchPicture(march: March): Picture {
  return pictureAt(march.level, march.picture);
}

/** Проигрыш. Тот же уровень с первой картинки: счёт и гранаты со старта, жизни стартовые. */
export function restartLevel(march: March): March {
  return {
    level: march.level,
    picture: 0,
    score: 0,
    lives: hud.lives,
    grenades: grenade.stock,
    continues: Math.max(0, march.continues - 1),
    difficulty: march.difficulty,
  };
}

/**
 * Следующая картинка того же уровня.
 * После последней — лишняя жизнь. Если уровень в маршруте не последний, заход идёт дальше.
 */
export function afterPicture(march: March): { march: March; done: boolean } {
  const level = route[march.level];
  if (!level) return { march, done: true };
  if (march.picture + 1 < level.pictures.length) {
    return { march: { ...march, picture: march.picture + 1 }, done: false };
  }
  const lives = march.lives + 1;
  if (march.level + 1 < route.length) {
    return { march: { ...march, level: march.level + 1, picture: 0, lives }, done: false };
  }
  return { march: { ...march, lives }, done: true };
}
