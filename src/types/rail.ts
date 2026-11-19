/**
 * Жерди вдоль дороги. Сторона, не точка: столбы считает кромка этой картинки.
 * Забор ломается целиком и берёт один бонус из списка картинки.
 */
export type RailMark = {
  side: 'left' | 'right';
};

/** Столб в пикселях поля. Куда его поставить, решает земля картинки. */
export type RailPost = {
  x: number;
  y: number;
  ph: number;
  w: number;
};

/** Столбы одной картинки и масштаб жерди. */
export type RailLayout = {
  left: RailPost[];
  right: RailPost[];
  fit: number;
};
