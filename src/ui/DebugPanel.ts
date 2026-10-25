import { el, q } from './dom';

export interface DebugActions {
  toggleColliders: (on: boolean) => void;
  toggleInfiniteStamina: (on: boolean) => void;
  toggleGodMode: (on: boolean) => void;
  setTimeScale: (scale: number) => void;
  teleportHome: () => void;
  giveKit: () => void;
  shake: () => void;
  toggleFreeBuild: (on: boolean) => void;
  damageBuilds: () => void;
  skipRaid: (seconds: number) => void;
  startRaid: () => void;
  spawnEnemy: (id: 'shambler' | 'crawler' | 'bloater' | 'brute' | 'chemist') => void;
  toggleFlow: (on: boolean) => void;
}

/** Developer overlay (F1 or `). Shows performance + player state and exposes cheat toggles. */
export class DebugPanel {
  private readonly root: HTMLDivElement;
  private readonly stats: HTMLElement;
  private frames = 0;
  private accum = 0;
  private fps = 0;

  constructor(parent: HTMLElement, actions: DebugActions) {
    this.root = el('div', 'debug');
    this.root.innerHTML = `
      <h4>DEBUG</h4>
      <pre class="stats"></pre>
      <label><input type="checkbox" data-k="colliders" /> Show colliders</label>
      <label><input type="checkbox" data-k="stamina" /> Infinite stamina</label>
      <label><input type="checkbox" data-k="god" /> God mode (no damage)</label>
      <label><input type="checkbox" data-k="freeBuild" /> Free building</label>
      <label><input type="checkbox" data-k="flow" /> Flow field</label>
      <div class="row">
        <button data-ts="0.25">0.25x</button>
        <button data-ts="1">1x</button>
        <button data-ts="2">2x</button>
      </div>
      <div class="row">
        <button data-a="home">Teleport home</button>
        <button data-a="kit">Give kit</button>
        <button data-a="shake">Test shake</button>
      </div>
      <div class="row">
        <button data-a="damageBuilds">Damage builds nearby</button>
      </div>
      <div class="row">
        <button data-a="raid30">Raid in 30s</button>
        <button data-a="raid10">Raid in 10s</button>
        <button data-a="raidNow">Start raid</button>
      </div>
      <div class="row">
        <button data-a="spawn-shambler">Shambler</button>
        <button data-a="spawn-crawler">Crawler</button>
        <button data-a="spawn-bloater">Bloater</button>
        <button data-a="spawn-brute">Brute</button>
        <button data-a="spawn-chemist">Chemist</button>
      </div>
    `;
    parent.appendChild(this.root);
    this.stats = q(this.root, '.stats');

    q<HTMLInputElement>(this.root, '[data-k="colliders"]').addEventListener('change', (e) =>
      actions.toggleColliders((e.target as HTMLInputElement).checked),
    );
    q<HTMLInputElement>(this.root, '[data-k="stamina"]').addEventListener('change', (e) =>
      actions.toggleInfiniteStamina((e.target as HTMLInputElement).checked),
    );
    this.root.querySelectorAll<HTMLButtonElement>('[data-ts]').forEach((b) =>
      b.addEventListener('click', () => actions.setTimeScale(Number(b.dataset.ts))),
    );
    q<HTMLInputElement>(this.root, '[data-k="god"]').addEventListener('change', (e) =>
      actions.toggleGodMode((e.target as HTMLInputElement).checked),
    );
    q(this.root, '[data-a="home"]').addEventListener('click', actions.teleportHome);
    q(this.root, '[data-a="kit"]').addEventListener('click', actions.giveKit);
    q(this.root, '[data-a="shake"]').addEventListener('click', actions.shake);
    q<HTMLInputElement>(this.root, '[data-k="freeBuild"]').addEventListener('change', (e) =>
      actions.toggleFreeBuild((e.target as HTMLInputElement).checked),
    );
    q(this.root, '[data-a="damageBuilds"]').addEventListener('click', actions.damageBuilds);
    q<HTMLInputElement>(this.root, '[data-k="flow"]').addEventListener('change', (e) =>
      actions.toggleFlow((e.target as HTMLInputElement).checked),
    );
    q(this.root, '[data-a="raid30"]').addEventListener('click', () => actions.skipRaid(30));
    q(this.root, '[data-a="raid10"]').addEventListener('click', () => actions.skipRaid(10));
    q(this.root, '[data-a="raidNow"]').addEventListener('click', actions.startRaid);
    for (const id of ['shambler', 'crawler', 'bloater', 'brute', 'chemist'] as const) {
      q(this.root, `[data-a="spawn-${id}"]`).addEventListener('click', () => actions.spawnEnemy(id));
    }
  }

  get visible(): boolean {
    return this.root.classList.contains('visible');
  }

  toggle(): void {
    this.root.classList.toggle('visible');
  }

  /** Call once per rendered frame; text refreshes ~4 times per second. */
  update(frameDt: number, lines: () => Record<string, string | number>): void {
    this.frames++;
    this.accum += frameDt;
    if (this.accum < 0.25) return;
    this.fps = this.frames / this.accum;
    this.frames = 0;
    this.accum = 0;
    if (!this.visible) return;
    const data = { fps: this.fps.toFixed(0), ...lines() };
    this.stats.textContent = Object.entries(data)
      .map(([k, v]) => `${k.padEnd(11)} ${v}`)
      .join('\n');
  }
}
