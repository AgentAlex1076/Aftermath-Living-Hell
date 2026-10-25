import { el, q } from './dom';

/** Hidden screens must not keep focus or receive keyboard activation (e.g. Space on a stale button). */
function setScreenHidden(root: HTMLElement, hidden: boolean): void {
  root.classList.toggle('hidden', hidden);
  root.inert = hidden;
  if (hidden && root.contains(document.activeElement)) (document.activeElement as HTMLElement).blur();
}

export class StartScreen {
  private readonly root: HTMLDivElement;

  constructor(parent: HTMLElement, onStart: () => void) {
    this.root = el('div', 'screen start-screen');
    this.root.innerHTML = `
      <div class="cover">
        <div class="cover-issue">ISSUE #1 — DAY ZERO</div>
        <h1 class="cover-title">AFTERMATH</h1>
        <div class="cover-sub">LIVING HELL</div>
        <p class="cover-tagline">
          The lab breached. The gas took everyone. Keep your mask on, hold the hut,
          and survive whatever crawls out of the fog.
        </p>
        <button class="btn" type="button">ENTER THE WASTELAND</button>
      </div>
    `;
    parent.appendChild(this.root);
    q(this.root, '.btn').addEventListener('click', () => {
      setScreenHidden(this.root, true);
      onStart();
    });
  }
}

export interface RunSummary {
  cause: string;
  seconds: number;
  gathered: number;
  crafted: number;
  searched: number;
  built: number;
  raids: number;
  kills: number;
  seed: number;
}

export class DeathScreen {
  private readonly root: HTMLDivElement;
  private readonly stats: HTMLElement;
  private readonly cause: HTMLElement;

  constructor(parent: HTMLElement, onNewRun: () => void) {
    this.root = el('div', 'screen death-screen');
    this.root.innerHTML = `
      <div class="death-panel">
        <div class="death-title">YOU DIED</div>
        <div class="death-cause"></div>
        <div class="death-stats"></div>
        <button class="btn" type="button">NEW RUN</button>
      </div>
    `;
    parent.appendChild(this.root);
    setScreenHidden(this.root, true);
    this.stats = q(this.root, '.death-stats');
    this.cause = q(this.root, '.death-cause');
    q(this.root, '.btn').addEventListener('click', onNewRun);
  }

  show(s: RunSummary): void {
    const m = Math.floor(s.seconds / 60);
    const sec = Math.floor(s.seconds % 60);
    this.cause.textContent = s.cause;
    this.stats.innerHTML = `
      <div><b>${m}:${String(sec).padStart(2, '0')}</b><span>SURVIVED</span></div>
      <div><b>${s.gathered}</b><span>RESOURCES</span></div>
      <div><b>${s.crafted}</b><span>CRAFTED</span></div>
      <div><b>${s.searched}</b><span>SEARCHED</span></div>
      <div><b>${s.built}</b><span>BUILT</span></div>
      <div><b>${s.raids}</b><span>RAIDS</span></div>
      <div><b>${s.kills}</b><span>KILLS</span></div>
      <div><b>#${s.seed}</b><span>SEED</span></div>
    `;
    setScreenHidden(this.root, false);
  }
}

export class PauseScreen {
  private readonly root: HTMLDivElement;

  constructor(parent: HTMLElement, seed: number, onResume: () => void, onNewRun: () => void) {
    this.root = el('div', 'screen pause-screen');
    this.root.innerHTML = `
      <div class="pause-panel">
        <div class="pause-title">PAUSED</div>
        <button class="btn" type="button" data-a="resume">RESUME</button>
        <button class="btn secondary" type="button" data-a="new">ABANDON RUN</button>
        <div class="pause-seed">WORLD SEED #${seed}</div>
      </div>
    `;
    parent.appendChild(this.root);
    setScreenHidden(this.root, true);
    q(this.root, '[data-a="resume"]').addEventListener('click', onResume);
    q(this.root, '[data-a="new"]').addEventListener('click', onNewRun);
  }

  setVisible(visible: boolean): void {
    setScreenHidden(this.root, !visible);
  }
}
