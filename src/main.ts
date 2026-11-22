import Phaser from 'phaser';
import { frame, palette } from './constants';
import { Play } from './scenes/Play';
import { readScreenPixel, screenPixel, setScreenPixel } from './screen';

const pixel = readScreenPixel();
setScreenPixel(pixel);

const game = new Phaser.Game({
  type: Phaser.AUTO,
  width: frame.width,
  height: frame.height,
  backgroundColor: palette.black,
  pixelArt: true,
  parent: 'game',
  input: {
    /** Стик, крест, граната и пауза могут быть зажаты вместе. */
    activePointers: 4,
  },
  scale: {
    mode: pixel > 1 ? Phaser.Scale.NONE : Phaser.Scale.EXPAND,
    autoCenter: pixel > 1 ? Phaser.Scale.NO_CENTER : Phaser.Scale.CENTER_BOTH,
    autoRound: true,
    zoom: pixel,
  },
  scene: [Play],
});

if (pixel > 1) fitDenseScreen(game);

/**
 * EXPAND на узком стекле уменьшает игровой пиксель ниже CSS.
 * Здесь буфер реже родителя в полтора раза, а стиль холста снова на всё окно:
 * один игровой пиксель занимает 1.2 CSS, без чёрной кромки.
 */
function fitDenseScreen(game: Phaser.Game): void {
  const fit = (): void => {
    const parent = game.scale.parentSize;
    const cssW = parent.width || window.innerWidth;
    const cssH = parent.height || window.innerHeight;
    if (cssW < 2 || cssH < 2) return;
    const zoom = screenPixel();
    const width = Math.max(1, Math.floor(cssW / zoom));
    const height = Math.max(1, Math.floor(cssH / zoom));
    const size = game.scale.gameSize;
    if (size.width !== width || size.height !== height) game.scale.resize(width, height);
    const canvas = game.canvas;
    canvas.style.width = '100%';
    canvas.style.height = '100%';
  };

  const kick = (): void => {
    fit();
    requestAnimationFrame(fit);
  };
  if (game.isBooted) kick();
  else game.events.once(Phaser.Core.Events.READY, kick);
  window.addEventListener('resize', fit);
  window.visualViewport?.addEventListener('resize', fit);
}
