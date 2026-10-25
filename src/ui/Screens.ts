import { el, q } from './dom';
import { sound } from '../core/Sound';

/** Hidden screens must not keep focus or receive keyboard activation (e.g. Space on a stale button). */
function setScreenHidden(root: HTMLElement, hidden: boolean): void {
  root.classList.toggle('hidden', hidden);
  root.inert = hidden;
  if (hidden && root.contains(document.activeElement)) (document.activeElement as HTMLElement).blur();
}

export class StartScreen {
  private readonly root: HTMLDivElement;
  private started = false;
  private selectedPerspective: 'first-person' | 'third-person' =
    (localStorage.getItem('aftermath_perspective') as 'first-person' | 'third-person') || 'first-person';

  constructor(parent: HTMLElement, onStart: (perspective: 'first-person' | 'third-person') => void) {
    this.root = el('div', 'screen start-screen');
    this.root.innerHTML = `
      <svg class="acid-defs" aria-hidden="true" width="0" height="0">
        <defs>
          <filter id="acid-melt" x="-20%" y="-20%" width="140%" height="160%" color-interpolation-filters="sRGB">
            <feTurbulence type="fractalNoise" baseFrequency="0.04 0.07" numOctaves="2" seed="5" result="noise" />
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="14" xChannelSelector="R" yChannelSelector="G" />
          </filter>
        </defs>
      </svg>
      <div class="yellow-wipe"></div>
      <div class="cover">
        <div class="cover-issue acid-target" style="--acid-delay: 0s">ISSUE #1 — DAY ZERO</div>
        <h1 class="cover-title acid-target" style="--acid-delay: 0.06s">AFTERMATH</h1>
        <div class="cover-sub acid-target" style="--acid-delay: 0.12s">LIVING HELL</div>
        <p class="cover-tagline acid-target" style="--acid-delay: 0.18s">
          The lab breached. The gas took everyone. Keep your mask on, hold the hut,
          and survive whatever crawls out of the fog.
        </p>
        <div class="perspective-picker acid-target" style="--acid-delay: 0.22s">
          <div class="picker-label">PERSPECTIVE</div>
          <div class="picker-group">
            <button class="picker-btn ${this.selectedPerspective === 'first-person' ? 'active' : ''}" type="button" data-val="first-person">
              <span class="p-radio"></span>
              <span class="p-info">
                <span class="p-title">FIRST PERSON</span>
                <span class="p-sub">Immersive FPS · Pointer Lock</span>
              </span>
            </button>
            <button class="picker-btn ${this.selectedPerspective === 'third-person' ? 'active' : ''}" type="button" data-val="third-person">
              <span class="p-radio"></span>
              <span class="p-info">
                <span class="p-title">TOP DOWN</span>
                <span class="p-sub">Classic 3/4 Isometric View</span>
              </span>
            </button>
          </div>
        </div>
        <button class="btn play-btn" type="button">
          <span class="btn-label acid-target" style="--acid-delay: 0.03s">ENTER THE WASTELAND</span>
        </button>
      </div>
    `;
    parent.appendChild(this.root);

    const pickerButtons = this.root.querySelectorAll<HTMLButtonElement>('.picker-btn');
    pickerButtons.forEach((pb) => {
      pb.addEventListener('click', () => {
        if (this.started) return;
        const val = pb.dataset.val as 'first-person' | 'third-person';
        if (!val) return;
        this.selectedPerspective = val;
        localStorage.setItem('aftermath_perspective', val);
        pickerButtons.forEach((btn) => btn.classList.toggle('active', btn === pb));
      });
    });

    const btn = q(this.root, '.play-btn');
    btn.addEventListener('click', () => {
      if (this.started) return;
      this.started = true;
      btn.blur();
      this.root.inert = true;
      this.playIntroTransition(btn, () => onStart(this.selectedPerspective));
    });
  }

  private playIntroTransition(btn: HTMLElement, onStart: () => void): void {
    // Sound: toxic sizzle & bubbling
    sound.playAcidMelt();

    // Spawn acid bubbles & rising vapor particles on every text element
    const targets = this.root.querySelectorAll<HTMLElement>('.acid-target');
    targets.forEach((target) => {
      const rect = target.getBoundingClientRect();
      const count = Math.max(10, Math.min(36, Math.round(rect.width / 16)));
      for (let i = 0; i < count; i++) {
        const drop = document.createElement('span');
        const isFume = i % 2 === 0;
        drop.className = isFume ? 'acid-particle fume' : 'acid-particle drip';
        drop.style.setProperty('--x', `${(Math.random() * 100).toFixed(1)}%`);
        drop.style.setProperty('--y', `${(Math.random() * 80 + 10).toFixed(1)}%`);
        drop.style.setProperty('--dx', `${((Math.random() - 0.5) * 60).toFixed(1)}px`);
        drop.style.setProperty('--dy', `${(isFume ? -55 - Math.random() * 90 : 30 + Math.random() * 55).toFixed(1)}px`);
        drop.style.setProperty('--sz', `${(isFume ? 8 + Math.random() * 18 : 5 + Math.random() * 10).toFixed(1)}px`);
        drop.style.setProperty('--d', `${(Math.random() * 0.45).toFixed(2)}s`);
        target.appendChild(drop);
      }
    });

    this.root.classList.add('melting');

    // Stage 2: Zoom into the yellow button so hazard yellow fills the entire screen
    window.setTimeout(() => {
      sound.playZoomWhoosh();
      const r = btn.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const dx = window.innerWidth / 2 - cx;
      const dy = window.innerHeight / 2 - cy;
      btn.style.setProperty('--zoom-tx', `${dx.toFixed(1)}px`);
      btn.style.setProperty('--zoom-ty', `${dy.toFixed(1)}px`);
      this.root.classList.add('zooming');
    }, 950);

    // Stage 3: Screen is full hazard yellow -> start 3D fall cutscene & dissolve yellow curtain
    window.setTimeout(() => {
      onStart();
      this.root.classList.add('wipe-out');
    }, 1580);

    // Stage 4: Fully hide start screen DOM once yellow curtain finishes revealing the cutscene
    window.setTimeout(() => {
      setScreenHidden(this.root, true);
    }, 2150);
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
