import '@fontsource/bangers/index.css';
import '@fontsource/barlow/500.css';
import '@fontsource/barlow/600.css';
import '@fontsource/barlow-condensed/600.css';
import '@fontsource/barlow-condensed/700.css';
import '@fontsource/barlow-condensed/800-italic.css';
import './ui/styles.css';
import { Game } from './game/Game';

const app = document.getElementById('app');
const ui = document.getElementById('ui');
if (!app || !ui) throw new Error('Missing #app or #ui root element');

const game = new Game(app, ui);
game.start();

if (import.meta.env.DEV) {
  (window as unknown as { game: Game }).game = game;
}
