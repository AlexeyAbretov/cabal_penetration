import { bootGame } from './boot';
import { paintBootLabel } from './bootScreen';
import { initMobileLandscape } from './mobile-landscape';
import { GameRuntime, setRuntime } from './runtime';

paintBootLabel();
initMobileLandscape();
setRuntime(new GameRuntime('range'));
bootGame();