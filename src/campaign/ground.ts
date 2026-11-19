import type { Rect } from '../layout';
import type { Pix } from '../scenes/play/pix';
import type { RailLayout } from '../types/rail';

export type GroundTone = {
  tone: number;
  dirt: boolean;
};

/**
 * Земля одной картинки. Папка уровня её пишет, сцена рисует.
 * Дорожка — низ того же листа. Нет земли — поле и дорожка одной заливкой.
 */
export type Ground = {
  backdrop(width: number, skyH: number, fieldH: number): Pix;
  track(width: number, height: number, fieldH: number): Pix;
  at(x: number, y: number, field: Rect, track: Rect): GroundTone;
  rails(width: number, height: number): RailLayout;
};

export type GroundAt = Ground['at'];
