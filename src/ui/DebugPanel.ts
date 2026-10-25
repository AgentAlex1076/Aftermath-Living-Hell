import { ALL_ENEMY_IDS, ENEMIES, type EnemyId } from '../data/enemies';
import type { WeatherKind } from '../render/Weather';
import { el, q } from './dom';

export interface DebugActions {
  toggleColliders: (on: boolean) => void;
  toggleInfiniteStamina: (on: boolean) => void;
  toggleGodMode: (on: boolean) => void;
  setTimeScale: (scale: number) => void;
  teleportHome: () => void;
  giveKit: () => void;
  giveGun: () => void;
  shake: () => void;
  toggleFreeBuild: (on: boolean) => void;
  damageBuilds: () => void;
  skipRaid: (seconds: number) => void;
  startRaid: () => void;
  spawnEnemy: (id: EnemyId) => void;
  toggleFlow: (on: boolean) => void;
  togglePost: (on: boolean) => void;
  setWeather: (kind: WeatherKind | null) => void;
  lightning: () => void;
  openGunBench: () => void;
  killSelf: () => void;
  unlockCodex: () => void;
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
    const spawns = ALL_ENEMY_IDS.map((id) => `<button data-spawn="${id}">${ENEMIES[id].name.replace(/^The /, '')}</button>`).join('');
    this.root.innerHTML = `
      <h4>DEBUG</h4>
      <pre class="stats"></pre>
      <label><input type="checkbox" data-k="colliders" /> Show colliders</label>
      <label><input type="checkbox" data-k="stamina" /> Infinite stamina</label>
      <label><input type="checkbox" data-k="god" /> God mode (no damage)</label>
      <label><input type="checkbox" data-k="freeBuild" /> Free building</label>
      <label><input type="checkbox" data-k="flow" /> Flow field</label>
      <label><input type="checkbox" data-k="post" checked /> Post-processing</label>
      <div class="row">
        <button data-ts="0.25">0.25x</button>
        <button data-ts="1">1x</button>
        <button data-ts="2">2x</button>
      </div>
      <div class="row">
        <button data-a="home">Teleport home</button>
        <button data-a="kit">Give kit</button>
        <button data-a="pipe">Give gun</button>
        <button data-a="gun">Gun bench</button>
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
        <button data-w="clear">Clear</button>
        <button data-w="drizzle">Rain</button>
        <button data-w="storm">Storm</button>
        <button data-w="auto">Auto</button>
        <button data-a="bolt">Lightning</button>
      </div>
      <div class="row">
        <button data-a="kill">Kill self</button>
        <button data-a="codex">Unlock Codex</button>
      </div>
      <div class="row">${spawns}</div>
    `;
    parent.appendChild(this.root);
    this.stats = q(this.root, '.stats');

    const check = (k: string, fn: (on: boolean) => void) =>
      q<HTMLInputElement>(this.root, `[data-k="${k}"]`).addEventListener('change', (e) => fn((e.target as HTMLInputElement).checked));
    check('colliders', actions.toggleColliders);
    check('stamina', actions.toggleInfiniteStamina);
    check('god', actions.toggleGodMode);
    check('freeBuild', actions.toggleFreeBuild);
    check('flow', actions.toggleFlow);
    check('post', actions.togglePost);
    this.root.querySelectorAll<HTMLButtonElement>('[data-ts]').forEach((b) =>
      b.addEventListener('click', () => actions.setTimeScale(Number(b.dataset.ts))),
    );
    this.root.querySelectorAll<HTMLButtonElement>('[data-w]').forEach((b) =>
      b.addEventListener('click', () => actions.setWeather(b.dataset.w === 'auto' ? null : (b.dataset.w as WeatherKind))),
    );
    this.root.querySelectorAll<HTMLButtonElement>('[data-spawn]').forEach((b) =>
      b.addEventListener('click', () => actions.spawnEnemy(b.dataset.spawn as EnemyId)),
    );
    q(this.root, '[data-a="home"]').addEventListener('click', actions.teleportHome);
    q(this.root, '[data-a="kit"]').addEventListener('click', actions.giveKit);
    q(this.root, '[data-a="pipe"]').addEventListener('click', actions.giveGun);
    q(this.root, '[data-a="gun"]').addEventListener('click', actions.openGunBench);
    q(this.root, '[data-a="shake"]').addEventListener('click', actions.shake);
    q(this.root, '[data-a="damageBuilds"]').addEventListener('click', actions.damageBuilds);
    q(this.root, '[data-a="raid30"]').addEventListener('click', () => actions.skipRaid(30));
    q(this.root, '[data-a="raid10"]').addEventListener('click', () => actions.skipRaid(10));
    q(this.root, '[data-a="raidNow"]').addEventListener('click', actions.startRaid);
    q(this.root, '[data-a="bolt"]').addEventListener('click', actions.lightning);
    q(this.root, '[data-a="kill"]').addEventListener('click', actions.killSelf);
    q(this.root, '[data-a="codex"]').addEventListener('click', actions.unlockCodex);
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
