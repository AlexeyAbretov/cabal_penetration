import { bootGame } from './boot';
import { GameRuntime, setRuntime } from './runtime';

setRuntime(new GameRuntime('battle'));
bootGame();