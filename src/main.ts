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
  scale: {
    mode: Phaser.Scale.EXPAND,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    autoRound: true,
  },
  scene: [Play],
});
