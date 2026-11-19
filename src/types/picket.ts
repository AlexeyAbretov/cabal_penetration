import { picket } from '../constants';
import { fieldScale, fitScale, type Rect } from '../layout';

/**
 * Штакетник. Картинка ставит его куда хочет: край, длина, подошва.
 * Секция — пролёт от толстого столба до следующего. На опорном кадре столб каждый четвёртый штакетик.
 */
export type PicketMark = {
  /** Левый край, доля ширины поля. */
  x: number;
  /**
   * Подошва.
   * Без floor: доля поля, 0 дальний край, 1 у дорожки.
   * С floor: пиксели над низом поля.
   */
  y: number;
  /** Длина, доля ширины поля. */
  span: number;
  /** Подошва в пикселях над низом поля, не доля. */
  floor?: boolean;
  /** Очки в момент слома секции. Нет — номинал штакетника. */
  score?: number;
};

export type PicketFrame = {
  x0: number;
  span: number;
  feet: number;
  height: number;
};

export type PicketBaySpan = {
  start: number;
  end: number;
};

/** Левый край, длина и высота досок на этом поле. */
export function picketFrame(mark: PicketMark, field: Rect): PicketFrame {
  const x0 = field.x + Math.round(mark.x * field.width);
  const x1 = field.x + Math.round((mark.x + mark.span) * field.width);
  const feet = mark.floor ? field.y + field.height - mark.y : field.y + Math.round(mark.y * field.height);
  const depth = mark.floor ? 1 : fieldScale(feet, field);
  const height = Math.round(picket.height * fitScale(field) * depth);
  return { x0, span: Math.max(0, x1 - x0), feet, height };
}

/** Шаг штакетика. Тот же, что был у рисунка на земле. */
export function picketGap(height: number): number {
  return Math.max(4, Math.round(height / 3.2));
}

export function picketSlat(height: number): number {
  return Math.max(2, Math.round(height / 10));
}

/**
 * Пролёты по толстым столбам. Столб стоит в начале пролёта.
 * Короткий хвост после последнего столба — тоже секция.
 */
export function picketBays(span: number, height: number): PicketBaySpan[] {
  if (span <= 0 || height < 6) return [];
  const period = picketGap(height) * 4;
  const starts: number[] = [];
  for (let x = 0; x < span; x += period) starts.push(x);
  return starts.map((start, index) => ({
    start,
    end: index + 1 < starts.length ? starts[index + 1]! : span,
  }));
}

/** Сколько секций на этом кадре. Широкое окно режет длинный забор чаще. */
export function picketTotal(marks: readonly PicketMark[], field: Rect): number {
  return marks.reduce((sum, mark) => {
    const frame = picketFrame(mark, field);
    return sum + picketBays(frame.span, frame.height).length;
  }, 0);
}
