import { ALL_ENEMY_IDS, ENEMIES, type EnemyId } from '../data/enemies';
import type { WeatherKind } from '../render/Weather';
import type { DayPhase } from '../world/DayNight';
import type { FeatureKind } from '../world/World';
import { el, q } from './dom';

export interface DebugActions {
  toggleColliders: (on: boolean) => void;
  toggleInfiniteStamina: (on: boolean) => void;
  toggleGodMode: (on: boolean) => void;
  setTimeScale: (scale: number) => void;
  teleportHome: () => void;
  teleportAway: () => void;
  teleportFar: () => void;
  giveKit: () => void;
  giveGun: () => void;
  shake: () => void;
  toggleFreeBuild: (on: boolean) => void;
  damageBuilds: () => void;
  addAttention: (amount: number) => void;
  crankSiren: () => void;
  startRaid: () => void;
  skipCountdown: () => void;
  killRaid: () => void;
  setDayPhase: (phase: DayPhase) => void;
  spawnEnemy: (id: EnemyId) => void;
  toggleFlow: (on: boolean) => void;
  togglePost: (on: boolean) => void;
  setWeather: (kind: WeatherKind | null) => void;
  lightning: () => void;
  openGunBench: () => void;
  teleportTo: (kind: FeatureKind) => void;
  checkReach: () => void;
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
    this.root.dataset.uiCapture = '';
    const spawns = ALL_ENEMY_IDS.map((id) => `<button data-spawn="${id}">${ENEMIES[id].name.replace(/^The /, '')}</button>`).join('');
    this.root.innerHTML = `
      <header class="debug-head">
        <span class="debug-title">DEBUG</span>
        <span class="debug-key">F1 / \`</span>
        <button class="debug-close" data-a="close" aria-label="Close debug panel">&times;</button>
      </header>
      <div class="debug-body">
        <pre class="debug-stats"></pre>
        <details open>
          <summary>Toggles</summary>
          <div class="debug-toggles">
            <label><input type="checkbox" data-k="god" /> God mode</label>
            <label><input type="checkbox" data-k="stamina" /> Infinite stamina</label>
            <label><input type="checkbox" data-k="freeBuild" /> Free building</label>
            <label><input type="checkbox" data-k="post" checked /> Post-processing</label>
            <label><input type="checkbox" data-k="colliders" /> Colliders</label>
            <label><input type="checkbox" data-k="flow" /> Flow field</label>
          </div>
        </details>
        <details open>
          <summary>Time</summary>
          <div class="debug-row" data-group>
            <button data-ts="0.25">0.25x</button>
            <button data-ts="1" class="on">1x</button>
            <button data-ts="2">2x</button>
          </div>
          <div class="debug-row" data-group>
            <button data-day="dawn">Dawn</button>
            <button data-day="day">Day</button>
            <button data-day="dusk">Dusk</button>
            <button data-day="night">Night</button>
          </div>
        </details>
        <details open>
          <summary>Weather</summary>
          <div class="debug-row" data-group>
            <button data-w="auto" class="on">Auto</button>
            <button data-w="clear">Clear</button>
            <button data-w="drizzle">Rain</button>
            <button data-w="storm">Storm</button>
          </div>
          <div class="debug-row">
            <button data-a="bolt">Lightning</button>
            <button data-a="shake">Test shake</button>
          </div>
        </details>
        <details open>
          <summary>Player</summary>
          <div class="debug-row">
            <button data-a="home">Teleport home</button>
            <button data-a="far">Teleport 90m out</button>
            <button data-a="farther">Teleport 1 km out</button>
            <button data-a="kit">Give kit</button>
            <button data-a="pipe">Give gun</button>
            <button data-a="gun">Gun bench</button>
            <button data-a="codex">Unlock Codex</button>
            <button data-a="kill" class="danger">Kill self</button>
          </div>
        </details>
        <details open>
          <summary>Terrain</summary>
          <div class="debug-row">
            <button data-go="water">To water</button>
            <button data-go="ford">To ford</button>
            <button data-go="toxicWater">To toxic water</button>
            <button data-go="bridge">To bridge</button>
            <button data-go="crater">To crater</button>
            <button data-go="town">To town</button>
            <button data-go="industrial">To yards</button>
            <button data-go="farm">To farm</button>
            <button data-a="reach">Check reach</button>
          </div>
        </details>
        <details open>
          <summary>Base &amp; raid</summary>
          <div class="debug-row">
            <button data-a="att25">Attention +25</button>
            <button data-a="att100">Fill attention</button>
            <button data-a="siren">Crank siren</button>
            <button data-a="raidNow">Start raid</button>
            <button data-a="skipCd">Skip countdown</button>
            <button data-a="killRaid">Kill raid</button>
            <button data-a="damageBuilds" class="danger">Damage builds nearby</button>
          </div>
        </details>
        <details open>
          <summary>Spawn</summary>
          <div class="debug-row">${spawns}</div>
        </details>
      </div>
    `;
    parent.appendChild(this.root);
    this.stats = q(this.root, '.debug-stats');

    // Mark the picked option in single-choice rows, and drop focus so Space / keys go back to the game.
    this.root.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const btn = target.closest('button');
      const group = btn?.closest('[data-group]');
      if (btn && group) group.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === btn));
      if (btn || target instanceof HTMLInputElement) (btn ?? target).blur();
    });
    q(this.root, '[data-a="close"]').addEventListener('click', () => this.toggle());

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
    q(this.root, '[data-a="far"]').addEventListener('click', actions.teleportAway);
    q(this.root, '[data-a="farther"]').addEventListener('click', actions.teleportFar);
    q(this.root, '[data-a="kit"]').addEventListener('click', actions.giveKit);
    q(this.root, '[data-a="pipe"]').addEventListener('click', actions.giveGun);
    q(this.root, '[data-a="gun"]').addEventListener('click', actions.openGunBench);
    q(this.root, '[data-a="shake"]').addEventListener('click', actions.shake);
    q(this.root, '[data-a="damageBuilds"]').addEventListener('click', actions.damageBuilds);
    q(this.root, '[data-a="att25"]').addEventListener('click', () => actions.addAttention(25));
    q(this.root, '[data-a="att100"]').addEventListener('click', () => actions.addAttention(100));
    q(this.root, '[data-a="siren"]').addEventListener('click', actions.crankSiren);
    q(this.root, '[data-a="raidNow"]').addEventListener('click', actions.startRaid);
    q(this.root, '[data-a="skipCd"]').addEventListener('click', actions.skipCountdown);
    q(this.root, '[data-a="killRaid"]').addEventListener('click', actions.killRaid);
    this.root.querySelectorAll<HTMLButtonElement>('[data-day]').forEach((b) =>
      b.addEventListener('click', () => actions.setDayPhase(b.dataset.day as DayPhase)),
    );
    q(this.root, '[data-a="bolt"]').addEventListener('click', actions.lightning);
    q(this.root, '[data-a="kill"]').addEventListener('click', actions.killSelf);
    q(this.root, '[data-a="codex"]').addEventListener('click', actions.unlockCodex);
    q(this.root, '[data-a="reach"]').addEventListener('click', actions.checkReach);
    this.root.querySelectorAll<HTMLButtonElement>('[data-go]').forEach((b) =>
      b.addEventListener('click', () => actions.teleportTo(b.dataset.go as FeatureKind)),
    );
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
