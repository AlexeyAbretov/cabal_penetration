import Phaser from 'phaser';
import { frame, palette } from './constants';
import { Play } from './scenes/Play';

new Phaser.Game({
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
    mode: Phaser.Scale.EXPAND,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    autoRound: true,
  },
  scene: [Play],
});
