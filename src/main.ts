import '@fontsource/bangers/index.css';
import '@fontsource/inter/400.css';
import '@fontsource/inter/700.css';
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
