import { bands } from './constants';

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

/** Небо, поле, дорожка, рамка. Сумма высот равна кадру: поле забирает остаток. */
export function frameLayout(width: number, height: number): FrameLayout {
  let skyH = bandHeight(height, bands.sky);
  let trackH = bandHeight(height, bands.track);
  let hudH = bandHeight(height, bands.hud);
  let fieldH = height - skyH - trackH - hudH;

  if (fieldH < bands.fieldMin) {
    let need = bands.fieldMin - fieldH;
    const shrink = (current: number, floor: number): number => {
      const cut = Math.min(Math.max(0, need), Math.max(0, current - floor));
      need -= cut;
      return current - cut;
    };
    skyH = shrink(skyH, bands.sky.min);
    trackH = shrink(trackH, bands.track.min);
    hudH = shrink(hudH, bands.hud.min);
    fieldH = height - skyH - trackH - hudH;
  }

  // Окно ниже минимумов: делим кадр пропорциями, чтобы полосы всё равно закрыли его без щели.
  if (fieldH < 0) {
    skyH = Math.round(height * bands.sky.ratio);
    trackH = Math.round(height * bands.track.ratio);
    hudH = Math.round(height * bands.hud.ratio);
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

/** Точка прицела остаётся внутри поля, включая кромку. */
export function clampToRect(x: number, y: number, rect: Rect): { x: number; y: number } {
  const maxX = rect.x + Math.max(0, rect.width - 1);
  const maxY = rect.y + Math.max(0, rect.height - 1);
  return {
    x: Math.round(Math.min(maxX, Math.max(rect.x, x))),
    y: Math.round(Math.min(maxY, Math.max(rect.y, y))),
  };
}
