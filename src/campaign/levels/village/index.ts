import type { Level } from '../../picture';
import { picture as opening } from './11';
import { picture as approach } from './12';

/** Деревня. Новая картинка — файл рядом и одна строка в списке. */
export const level: Level = {
  id: 'village',
  pictures: [opening, approach],
};
