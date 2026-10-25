import { events, type ToastTone } from '../core/EventBus';
import { bossFor, ENEMIES } from '../data/enemies';
import { el, q } from './dom';

const TOAST_LIFETIME_MS = 3200;
const MAX_TOASTS = 3;

/** In-game HUD overlay. Pure view: the game pushes state into it every frame. */
export class Hud {
  readonly root: HTMLDivElement;
  private readonly healthBar: HTMLElement;
  private readonly healthValue: HTMLElement;
  private readonly staminaBar: HTMLElement;
  private readonly staminaValue: HTMLElement;
  private readonly hungerBar: HTMLElement;
  private readonly hungerValue: HTMLElement;
  private readonly craftChip: HTMLElement;
  private readonly ovenChip: HTMLElement;
  private lastCraftKey = '';
  private lastOvenKey = '';
  private readonly filterBar: HTMLElement;
  private readonly filterValue: HTMLElement;
  private readonly gasOverlay: HTMLElement;
  private readonly gasWarning: HTMLElement;
  private readonly gasText: HTMLElement;
  private lastGasState = '';
  private readonly zoneChip: HTMLElement;
  private readonly zoneText: HTMLElement;
  private readonly zoneDist: HTMLElement;
  private readonly raidChip: HTMLElement;
  private readonly raidLabel: HTMLElement;
  private readonly raidClock: HTMLElement;
  private readonly raidSplash: HTMLElement;
  private readonly dangerPulse: HTMLElement;
  private readonly prompt: HTMLElement;
  private readonly promptText: HTMLElement;
  private readonly toasts: HTMLElement;
  private readonly help: HTMLElement;
  private readonly crosshair: HTMLElement;
  private lastPrompt = '';
  private lastZoneInside: boolean | null = null;
  private readonly ammoChip: HTMLElement;
  private lastAmmo = '';
  private readonly bossBar: HTMLElement;
  private readonly bossName: HTMLElement;
  private readonly bossFill: HTMLElement;
  private lastBoss: string | null = null;

  constructor(parent: HTMLElement) {
    this.root = el('div', 'hud');
    this.root.innerHTML = `
      <div class="gas-overlay"></div>
      <div class="danger-pulse"></div>
      <div class="build-tag">AFTERMATH // BUILD 1.0 — LIVING HELL</div>
      <div class="boss-bar"><span class="boss-name"></span><div class="boss-track"><div class="boss-fill"></div></div></div>
      <div class="gas-warning"><span class="gas-icon"></span><span class="gas-text">TOXIC GAS</span></div>
      <div class="raid-timer" data-state="countdown">
        <span class="raid-label">NEXT RAID</span><span class="raid-clock">—</span>
      </div>
      <div class="zone-chip" data-state="inside">
        <span class="zone-icon"></span><span class="zone-text">HOME ZONE</span><span class="zone-dist"></span>
      </div>
      <div class="raid-splash"></div>
      <div class="player-card">
        <div class="bar bar-health">
          <span class="bar-value">100</span>
          <div class="bar-main">
            <div class="bar-head"><span class="card-name">SURVIVOR</span><span class="bar-label">HEALTH</span></div>
            <div class="bar-track"><div class="bar-fill"></div></div>
          </div>
        </div>
        <div class="bar short bar-hunger"><span class="bar-label">HUNGER</span><div class="bar-track"><div class="bar-fill"></div></div><span class="bar-value">100</span></div>
        <div class="bar short bar-filter"><span class="bar-label">FILTER</span><div class="bar-track"><div class="bar-fill"></div></div><span class="bar-value">100</span></div>
        <div class="bar short bar-stamina"><span class="bar-label">STAMINA</span><div class="bar-track"><div class="bar-fill"></div></div><span class="bar-value">100</span></div>
      </div>
      <div class="prompt"><span class="key">E</span><span class="prompt-text"></span></div>
      <div class="ammo-chip">
        <span class="ammo-mag">0</span><span class="ammo-sep">/</span><span class="ammo-pack">0</span>
        <span class="ammo-mode">SEMI</span>
        <span class="ammo-bar"><span></span></span>
      </div>
      <div class="work-chips">
        <div class="work-chip craft-chip"><span class="wc-icon"></span><span class="wc-bar"><span></span></span><span class="wc-text"></span></div>
        <div class="work-chip oven-chip"><span class="wc-flame"></span><span class="wc-text"></span></div>
      </div>
      <div class="toasts"></div>
      <div class="help">
        <div class="help-tab"><kbd>H</kbd><span>CONTROLS</span></div>
        <div class="help-grid">
          <kbd>WASD</kbd><span>Move</span>
          <kbd>MOUSE</kbd><span>Aim</span>
          <kbd>LMB</kbd><span>Fire / melee / gather / use</span>
          <kbd>RMB</kbd><span>Aim (tighter spread)</span>
          <kbd>R</kbd><span>Reload / clear jam</span>
          <kbd>1 – 6</kbd><span>Hotbar</span>
          <kbd>I / TAB</kbd><span>Backpack</span>
          <kbd>SHIFT</kbd><span>Sprint</span>
          <kbd>SPACE</kbd><span>Dodge roll</span>
          <kbd>E</kbd><span>Interact / search</span>
          <kbd>B</kbd><span>Build mode · Q switches tabs</span>
          <kbd>HAMMER</kbd><span>LMB fix · R upgrade · hold X scrap</span>
          <kbd>WHEEL</kbd><span>Zoom</span>
          <kbd>ESC</kbd><span>Pause</span>
          <kbd>M</kbd><span>Mute sound</span>
          <kbd>F1 / \`</kbd><span>Debug panel</span>
          <kbd>H</kbd><span>Hide controls</span>
        </div>
      </div>
      <div class="crosshair"></div>
    `;
    parent.appendChild(this.root);

    this.healthBar = q(this.root, '.bar-health');
    this.healthValue = q(this.healthBar, '.bar-value');
    this.staminaBar = q(this.root, '.bar-stamina');
    this.staminaValue = q(this.staminaBar, '.bar-value');
    this.hungerBar = q(this.root, '.bar-hunger');
    this.hungerValue = q(this.hungerBar, '.bar-value');
    this.craftChip = q(this.root, '.craft-chip');
    this.ovenChip = q(this.root, '.oven-chip');
    this.filterBar = q(this.root, '.bar-filter');
    this.filterValue = q(this.filterBar, '.bar-value');
    this.gasOverlay = q(this.root, '.gas-overlay');
    this.gasWarning = q(this.root, '.gas-warning');
    this.gasText = q(this.root, '.gas-text');
    this.zoneChip = q(this.root, '.zone-chip');
    this.zoneText = q(this.root, '.zone-text');
    this.zoneDist = q(this.root, '.zone-dist');
    this.raidChip = q(this.root, '.raid-timer');
    this.raidLabel = q(this.root, '.raid-label');
    this.raidClock = q(this.root, '.raid-clock');
    this.raidSplash = q(this.root, '.raid-splash');
    this.dangerPulse = q(this.root, '.danger-pulse');
    this.prompt = q(this.root, '.prompt');
    this.promptText = q(this.root, '.prompt-text');
    this.toasts = q(this.root, '.toasts');
    this.help = q(this.root, '.help');
    this.crosshair = q(this.root, '.crosshair');
    this.ammoChip = q(this.root, '.ammo-chip');
    this.bossBar = q(this.root, '.boss-bar');
    this.bossName = q(this.root, '.boss-name');
    this.bossFill = q(this.root, '.boss-fill');

    events.on('toast', ({ text, tone }) => this.toast(text, tone));
    events.on('raid:warning', ({ seconds }) => this.splash(
      seconds >= 60 ? '1 MINUTE' : `${seconds}`,
      seconds >= 60 ? 'GET HOME' : seconds >= 30 ? "THEY'RE CLOSE" : 'HOLD THE HUT',
      'warn',
    ));
    events.on('raid:start', ({ raid }) => {
      const boss = bossFor(raid);
      this.splash(`RAID ${raid}`, boss ? ENEMIES[boss.id].title : 'THEY ARE HERE', 'danger');
    });
    events.on('raid:end', ({ raid }) => this.splash('CLEAR', `RAID ${raid} OVER`, 'info'));
    events.on('raid:penalty', ({ reason }) => this.splash(
      'CAUGHT OUTSIDE',
      reason === 'timer' ? 'GEAR WIPED' : 'GET BACK',
      'danger',
    ));
  }

  setVisible(visible: boolean): void {
    this.root.classList.toggle('visible', visible);
  }

  /** Boss health across the top; `name` null hides it. */
  setBoss(name: string | null, frac: number, enraged: boolean): void {
    if (name !== this.lastBoss) {
      this.lastBoss = name;
      this.bossBar.classList.toggle('on', !!name);
      if (name) this.bossName.textContent = name.toUpperCase();
    }
    this.bossBar.classList.toggle('enraged', enraged);
    this.bossFill.style.transform = `scaleX(${Math.max(0, frac).toFixed(3)})`;
  }

  setHealth(value: number, max: number): void {
    this.healthBar.style.setProperty('--v', String(Math.max(0, value / max)));
    this.healthValue.textContent = String(Math.ceil(value));
    this.healthBar.classList.toggle('low', value < max * 0.3);
  }

  setStamina(value: number, max: number, exhausted: boolean): void {
    this.staminaBar.style.setProperty('--v', String(Math.max(0, value / max)));
    this.staminaValue.textContent = String(Math.floor(value));
    this.staminaBar.classList.toggle('exhausted', exhausted);
  }

  setHunger(value: number, max: number): void {
    this.hungerBar.style.setProperty('--v', String(Math.max(0, value / max)));
    this.hungerValue.textContent = String(Math.ceil(value));
    this.hungerBar.classList.toggle('low', value < max * 0.25);
  }

  /** The item being crafted (icon URL), its progress and how many jobs are queued. */
  setCraft(icon: string | null, progress: number, count: number, blocked: boolean): void {
    const key = `${icon}|${count}|${blocked}`;
    if (key !== this.lastCraftKey) {
      this.lastCraftKey = key;
      this.craftChip.classList.toggle('on', !!icon);
      this.craftChip.classList.toggle('blocked', blocked);
      q(this.craftChip, '.wc-icon').style.backgroundImage = icon ? `url(${icon})` : 'none';
      q(this.craftChip, '.wc-text').textContent = blocked ? 'BACKPACK FULL' : count > 1 ? `×${count}` : 'CRAFTING';
    }
    q(this.craftChip, '.wc-bar span').style.transform = `scaleX(${progress})`;
  }

  setOven(lit: boolean, jobs: number, ready: number): void {
    const key = `${lit}|${jobs}|${ready}`;
    if (key === this.lastOvenKey) return;
    this.lastOvenKey = key;
    const on = lit || ready > 0 || jobs > 0;
    this.ovenChip.classList.toggle('on', on);
    this.ovenChip.classList.toggle('lit', lit);
    q(this.ovenChip, '.wc-text').textContent = ready > 0 ? `OVEN · ${ready} READY` : lit ? `OVEN · ${jobs} COOKING` : 'OVEN · NO FUEL';
  }

  setFilter(value: number, max: number): void {
    this.filterBar.style.setProperty('--v', String(Math.max(0, value / max)));
    this.filterValue.textContent = String(Math.ceil(value));
    this.filterBar.classList.toggle('low', value < max * 0.25);
  }

  /** `gas` is the local intensity; `filterEmpty` switches the warning to "choking". */
  setGas(gas: number, filterEmpty: boolean): void {
    this.gasOverlay.style.opacity = String(Math.min(1, gas) * (filterEmpty ? 0.9 : 0.35));
    const state = gas < 0.05 ? 'off' : filterEmpty ? 'choking' : 'on';
    if (state === this.lastGasState) return;
    this.lastGasState = state;
    this.gasWarning.dataset.state = state;
    this.gasText.textContent = state === 'choking' ? 'FILTER EMPTY — CHOKING' : 'TOXIC GAS — FILTER DRAINING';
  }

  setZone(inside: boolean, metersOutside: number): void {
    if (inside !== this.lastZoneInside) {
      this.lastZoneInside = inside;
      this.zoneChip.dataset.state = inside ? 'inside' : 'outside';
      this.zoneText.textContent = inside ? 'HOME ZONE' : 'OUTSIDE HOME ZONE';
      this.dangerPulse.classList.toggle('on', !inside);
    }
    this.zoneDist.textContent = inside ? '' : `+${Math.ceil(metersOutside)}M`;
  }

  setRaid(active: boolean, timeLeft: number, raidNumber: number, remaining: number): void {
    const state = active ? 'raid' : timeLeft <= 10 ? 'imminent' : timeLeft <= 30 ? 'soon' : 'countdown';
    this.raidChip.dataset.state = state;
    this.raidLabel.textContent = active ? `RAID ${Math.max(1, raidNumber)}` : 'NEXT RAID';
    this.raidClock.textContent = active ? `${remaining} LEFT` : formatClock(timeLeft);
  }

  private splash(title: string, sub: string, tone: ToastTone): void {
    this.raidSplash.dataset.tone = tone;
    this.raidSplash.innerHTML = `<span class="rs-title">${title}</span><span class="rs-sub">${sub}</span>`;
    this.raidSplash.classList.remove('show');
    void this.raidSplash.offsetWidth;
    this.raidSplash.classList.add('show');
  }

  setPrompt(verb: string | null, label = ''): void {
    const key = verb ? `${verb}|${label}` : '';
    if (key === this.lastPrompt) return;
    this.lastPrompt = key;
    if (verb) this.promptText.innerHTML = `<b>${verb.toUpperCase()}</b> ${label.toUpperCase()}`;
    this.prompt.classList.toggle('visible', !!verb);
  }

  toggleHelp(): void {
    this.help.classList.toggle('open');
  }

  setAmmo(on: boolean, loaded: number, mag: number, reserve: number, mode: string, jammed: boolean, reload: number): void {
    const key = `${on}|${loaded}|${mag}|${reserve}|${mode}|${jammed}`;
    if (key !== this.lastAmmo) {
      this.lastAmmo = key;
      this.ammoChip.classList.toggle('on', on);
      this.ammoChip.classList.toggle('empty', on && loaded <= 0);
      this.ammoChip.classList.toggle('jammed', jammed);
      q(this.ammoChip, '.ammo-mag').textContent = jammed ? 'JAM' : String(loaded);
      q(this.ammoChip, '.ammo-pack').textContent = String(reserve);
      q(this.ammoChip, '.ammo-mode').textContent = jammed ? 'HIT R' : mode.toUpperCase();
    }
    q(this.ammoChip, '.ammo-bar span').style.transform = `scaleX(${on && reload > 0 && reload < 1 ? reload : 0})`;
  }

  setCrosshair(x: number, y: number, visible: boolean): void {
    this.crosshair.style.transform = `translate(${x}px, ${y}px)`;
    this.crosshair.classList.toggle('visible', visible);
  }

  toast(text: string, tone: ToastTone = 'info'): void {
    const node = el('div', 'toast');
    node.dataset.tone = tone;
    node.textContent = text;
    this.toasts.appendChild(node);
    while (this.toasts.children.length > MAX_TOASTS) this.toasts.firstElementChild?.remove();
    window.setTimeout(() => {
      node.classList.add('out');
      node.addEventListener('animationend', () => node.remove(), { once: true });
    }, TOAST_LIFETIME_MS);
  }
}

function formatClock(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}
