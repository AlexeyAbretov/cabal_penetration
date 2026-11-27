import { bands, depth, frame, soldierBox, wall } from './constants';
import { screenPixel } from './screen';
import { soldierSheet } from './soldierSheet';

export type Rect = { x: number; y: number; width: number; height: number };

export type FrameLayout = {
  width: number;
  height: number;
  sky: Rect;
  field: Rect;
  track: Rect;
  hud: Rect;
};

function bandHeight(
  height: number,
  spec: { ratio: number; min: number; max: number },
): number {
  const raw = Math.round(height * spec.ratio);
  return Math.min(spec.max, Math.max(spec.min, raw));
}

/**
 * Полосы заданы в пикселях опорного кадра.
 * На плотном стекле игровой пиксель крупнее, и те же доли занимают меньше клеток.
 */
function bandSpec(spec: { ratio: number; min: number; max: number }): {
  ratio: number;
  min: number;
  max: number;
} {
  const pixel = screenPixel();
  return {
    ratio: spec.ratio,
    min: Math.max(1, Math.round(spec.min / pixel)),
    max: Math.max(1, Math.round(spec.max / pixel)),
  };
}

function trackHeight(): number {
  return Math.max(1, Math.round(wall.path / screenPixel()));
}

/** Небо, поле, дорожка, рамка. Сумма высот равна кадру: поле забирает остаток. */
export function frameLayout(width: number, height: number): FrameLayout {
  const skyBand = bandSpec(bands.sky);
  const trackBand = bandSpec(bands.track);
  const hudBand = bandSpec(bands.hud);
  const path = trackHeight();
  const fieldFloor = Math.max(1, Math.round(bands.fieldMin / screenPixel()));
  let skyH = bandHeight(height, skyBand);
  let trackH = path;
  let hudH = bandHeight(height, hudBand);
  let fieldH = height - skyH - trackH - hudH;

  if (fieldH < fieldFloor) {
    let need = fieldFloor - fieldH;
    const shrink = (current: number, floor: number): number => {
      const cut = Math.min(Math.max(0, need), Math.max(0, current - floor));
      need -= cut;
      return current - cut;
    };
    skyH = shrink(skyH, skyBand.min);
    trackH = shrink(trackH, trackBand.min);
    hudH = shrink(hudH, hudBand.min);
    fieldH = height - skyH - trackH - hudH;
  }

  // Окно ниже минимумов: делим кадр пропорциями, чтобы полосы всё равно закрыли его без щели.
  if (fieldH < 0) {
    skyH = Math.round(height * skyBand.ratio);
    trackH = Math.min(path, Math.max(trackBand.min, Math.round(height * trackBand.ratio)));
    hudH = Math.round(height * hudBand.ratio);
    fieldH = height - skyH - trackH - hudH;
    if (fieldH < 0) {
      hudH = Math.max(0, hudH + fieldH);
      fieldH = height - skyH - trackH - hudH;
    }
  }

  const sky: Rect = { x: 0, y: 0, width, height: skyH };
  const field: Rect = { x: 0, y: skyH, width, height: fieldH };
  const track: Rect = { x: 0, y: field.y + field.height, width, height: trackH };
  const hud: Rect = { x: 0, y: track.y + track.height, width, height: hudH };
  return { width, height, sky, field, track, hud };
}

/**
 * Опорное поле в тех же игровых пикселях, что и текущий кадр.
 * На плотном стекле опорные 512×448 уже поделены на масштаб экрана.
 */
function homeField(): Rect {
  const pixel = screenPixel();
  return frameLayout(frame.width / pixel, frame.height / pixel).field;
}

/**
 * Окно меньше опорного кадра — сцена сжимается целиком.
 * Шире или выше опорного — пиксель тот же, лишнее место занимает земля.
 */
export function fitScale(field: Rect): number {
  const home = homeField();
  return Math.min(1, field.width / home.width, field.height / home.height);
}

/**
 * Пиксели опорного поля с учётом сжатия маленького окна.
 * Дальняя деревня меряется ими от горизонта: лишняя высота кадра остаётся впереди.
 */
export function sceneDepth(field: Rect): number {
  return homeField().height * fitScale(field);
}

/** Доля опорного поля вниз от горизонта, в пикселях текущего поля. */
export function belowHorizon(fraction: number, field: Rect): number {
  return fraction * sceneDepth(field);
}

/** Точка кадра долями поля: 0 слева и у дальнего края, 1 справа и у дорожки. */
export function fieldShare(field: Rect, x: number, y: number): { rx: number; ry: number } {
  return {
    rx: (x - field.x) / Math.max(1, field.width),
    ry: (y - field.y) / Math.max(1, field.height),
  };
}

/** 0 у верхнего края поля, 1 у дорожки. Дальние фигуры мельче. */
export function fieldScale(y: number, field: Rect): number {
  const t = Math.min(1, Math.max(0, (y - field.y) / Math.max(1, field.height)));
  return depth.far + (depth.near - depth.far) * t;
}

/** Ступни на нижнем крае дорожки, сразу над рамкой. */
export function soldierFeetY(track: Rect): number {
  return Math.round(track.y + track.height);
}

/** Низ забора: дальний край дорожки. Под ним остаётся земля, по которой ходят. */
export function wallBottomY(track: Rect): number {
  return track.y;
}

/** Верх забора: кадр солдата и небольшой запас над шлемом. */
export function wallTopY(track: Rect): number {
  return soldierFeetY(track) - soldierSheet.frameHeight - wall.aboveHead;
}

/** Середина хитбокса стойки. Искра, когда секции уже нет. */
export function soldierBodyY(track: Rect): number {
  return soldierFeetY(track) - Math.round(soldierBox.height / 2);
}

/**
 * Небо и поле. Горы стоят в небе, их подошва — верх поля.
 * Дорожка и рамка HUD снаружи: выстрел туда не уходит.
 */
export function aimBounds(layout: FrameLayout): Rect {
  return {
    x: layout.sky.x,
    y: layout.sky.y,
    width: layout.sky.width,
    height: layout.sky.height + layout.field.height,
  };
}

/** Точка остаётся внутри прямоугольника, включая кромку. */
export function clampToRect(x: number, y: number, rect: Rect): { x: number; y: number } {
  const maxX = rect.x + Math.max(0, rect.width - 1);
  const maxY = rect.y + Math.max(0, rect.height - 1);
  return {
    x: Math.round(Math.min(maxX, Math.max(rect.x, x))),
    y: Math.round(Math.min(maxY, Math.max(rect.y, y))),
  };
}
