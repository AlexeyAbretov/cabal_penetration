import { bootGame } from './boot';
import { initMobileLandscape } from './mobile-landscape';
import { GameRuntime, setRuntime } from './runtime';

initMobileLandscape();
setRuntime(new GameRuntime('battle'));
bootGame();