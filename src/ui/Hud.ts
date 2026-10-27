import { events, type ToastTone } from '../core/EventBus';
import { bossFor, ENEMIES } from '../data/enemies';
import type { ActiveBuff } from '../gameplay/Buffs';
import { el, q } from './dom';

const TOAST_LIFETIME_MS = 3200;
const MAX_TOASTS = 3;

/** In-game HUD overlay. Pure view: the game pushes state into it every frame. */
export class Hud {
  readonly root: HTMLDivElement;
  private readonly letterboxRoot: HTMLDivElement;
  private readonly healthBar: HTMLElement;
  private readonly healthValue: HTMLElement;
  private readonly staminaBar: HTMLElement;
  private readonly staminaValue: HTMLElement;
  private readonly buffChip: HTMLElement;
  private lastBuffKey = '';
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
  private readonly zoneArrow: HTMLElement;
  private lastZoneState = '';
  private readonly raidChip: HTMLElement;
  private readonly raidLabel: HTMLElement;
  private readonly raidClock: HTMLElement;
  private readonly raidMeter: HTMLElement;
  private readonly dayChip: HTMLElement;
  private readonly dayClock: HTMLElement;
  private readonly dayNum: HTMLElement;
  private lastDayKey = '';
  private readonly raidSplash: HTMLElement;
  private readonly dangerPulse: HTMLElement;
  private readonly cureAlert: HTMLElement;
  private readonly cureClock: HTMLElement;
  private readonly carryChip: HTMLElement;
  private lastCure = '';
  private readonly prompt: HTMLElement;
  private readonly promptText: HTMLElement;
  private readonly toasts: HTMLElement;
  private readonly help: HTMLElement;
  private readonly crosshair: HTMLElement;
  private lastPrompt = '';
  private readonly lampChip: HTMLElement;
  private readonly ammoChip: HTMLElement;
  private lastAmmo = '';
  private readonly bossBar: HTMLElement;
  private readonly bossName: HTMLElement;
  private readonly bossFill: HTMLElement;
  private lastBoss: string | null = null;
  private readonly camFixed: HTMLElement;
  private readonly camFree: HTMLElement;
  private readonly camLock: HTMLElement;

  constructor(parent: HTMLElement) {
    this.letterboxRoot = el('div', 'letterbox-container');
    this.letterboxRoot.innerHTML = `
      <div class="letterbox letterbox-top"></div>
      <div class="letterbox letterbox-bottom"></div>
    `;
    parent.appendChild(this.letterboxRoot);

    this.root = el('div', 'hud');
    this.root.innerHTML = `
      <div class="gas-overlay"></div>
      <div class="danger-pulse"></div>
      <div class="cure-alert"><span class="cure-alert-label">CURE BREACH</span><span class="cure-alert-clock">0:30</span></div>
      <div class="carry-chip">CARRYING THE CURE</div>
      <div class="build-tag">AFTERMATH // BUILD 1.0 — LIVING HELL</div>
      <div class="boss-bar"><span class="boss-name"></span><div class="boss-track"><div class="boss-fill"></div></div></div>
      <div class="gas-warning"><span class="gas-icon"></span><span class="gas-text">TOXIC GAS</span></div>
      <div class="raid-timer" data-state="calm">
        <span class="raid-label">HORDE</span>
        <span class="raid-meter"><span class="raid-meter-fill"></span></span>
        <span class="raid-clock">0%</span>
      </div>
      <div class="day-chip" data-phase="day">
        <span class="day-icon"></span><span class="day-clock">07:30</span><span class="day-num">DAY 1</span>
      </div>
      <div class="zone-chip" data-state="inside">
        <span class="zone-icon"></span><span class="zone-text">HOME ZONE</span><span class="zone-dist"></span><span class="zone-arrow"></span>
      </div>
      <div class="raid-splash"></div>
      <div class="player-card">
        <div class="buff-chip" hidden>
          <span class="buff-label"></span>
          <span class="buff-effects"></span>
          <span class="buff-time"></span>
        </div>
        <div class="bar bar-health">
          <span class="bar-value">100</span>
          <div class="bar-main">
            <div class="bar-head"><span class="card-name">SURVIVOR</span><span class="bar-label">HEALTH</span></div>
            <div class="bar-track"><div class="bar-fill"></div><i class="bar-cap"></i></div>
          </div>
        </div>
        <div class="bar short bar-filter"><span class="bar-label">FILTER</span><div class="bar-track"><div class="bar-fill"></div><i class="bar-cap"></i></div><span class="bar-value">100</span></div>
        <div class="bar short bar-stamina"><span class="bar-label">STAMINA</span><div class="bar-track"><div class="bar-fill"></div><i class="bar-cap"></i></div><span class="bar-value">100</span></div>
      </div>
      <div class="prompt"><span class="key">E</span><span class="prompt-text"></span></div>
      <div class="cam-controls" data-ui-capture>
        <button type="button" class="cam-btn" data-cam="fixed" title="Normal camera">CAM</button>
        <button type="button" class="cam-btn" data-cam="free" title="Free camera — drag RMB to orbit">FREE</button>
        <button type="button" class="cam-btn cam-lock" data-cam="lock" title="Lock free-cam view">LOCK</button>
      </div>
      <div class="lamp-chip"><i></i><span>LAMP</span></div>
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
          <kbd>RMB</kbd><span>Orbit (free cam)</span>
          <kbd>CAM</kbd><span>Normal / free / lock view</span>
          <kbd>L</kbd><span>Flashlight</span>
          <kbd>R</kbd><span>Reload / clear jam</span>
          <kbd>1 – 6</kbd><span>Hotbar</span>
          <kbd>I / TAB</kbd><span>Backpack</span>
          <kbd>SHIFT</kbd><span>Sprint</span>
          <kbd>SPACE</kbd><span>Dodge roll</span>
          <kbd>E</kbd><span>Interact / search</span>
          <kbd>E HOLD</kbd><span>Unhook the cure · move a station</span>
          <kbd>B</kbd><span>Build mode · Q switches tabs</span>
          <kbd>HAMMER</kbd><span>LMB fix · R upgrade · 5 hits scrap</span>
          <kbd>AXE / PICK</kbd><span>5 hits scrap a build (2s window)</span>
          <kbd>GUN MOD</kbd><span>Drag a part onto a gun in the backpack</span>
          <kbd>WHEEL</kbd><span>Zoom</span>
          <kbd>ESC</kbd><span>Pause</span>
          <kbd>M</kbd><span>Map</span>
          <kbd>N</kbd><span>Mute sound</span>
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
    this.buffChip = q(this.root, '.buff-chip');
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
    this.zoneArrow = q(this.root, '.zone-arrow');
    this.raidChip = q(this.root, '.raid-timer');
    this.raidLabel = q(this.root, '.raid-label');
    this.raidClock = q(this.root, '.raid-clock');
    this.raidMeter = q(this.root, '.raid-meter-fill');
    this.dayChip = q(this.root, '.day-chip');
    this.dayClock = q(this.root, '.day-clock');
    this.dayNum = q(this.root, '.day-num');
    this.raidSplash = q(this.root, '.raid-splash');
    this.dangerPulse = q(this.root, '.danger-pulse');
    this.cureAlert = q(this.root, '.cure-alert');
    this.cureClock = q(this.root, '.cure-alert-clock');
    this.carryChip = q(this.root, '.carry-chip');
    this.prompt = q(this.root, '.prompt');
    this.promptText = q(this.root, '.prompt-text');
    this.toasts = q(this.root, '.toasts');
    this.help = q(this.root, '.help');
    this.crosshair = q(this.root, '.crosshair');
    this.lampChip = q(this.root, '.lamp-chip');
    this.ammoChip = q(this.root, '.ammo-chip');
    this.bossBar = q(this.root, '.boss-bar');
    this.bossName = q(this.root, '.boss-name');
    this.bossFill = q(this.root, '.boss-fill');
    this.camFixed = q(this.root, '[data-cam="fixed"]');
    this.camFree = q(this.root, '[data-cam="free"]');
    this.camLock = q(this.root, '[data-cam="lock"]');
    this.setCameraMode('fixed', false);

    events.on('toast', ({ text, tone }) => this.toast(text, tone));
    events.on('raid:warning', ({ seconds, away }) => this.splash(
      seconds >= 60 ? '1 MINUTE' : `${seconds}`,
      away ? 'GET HOME' : seconds >= 60 ? 'GET READY' : seconds >= 30 ? "THEY'RE CLOSE" : 'HOLD THE HUT',
      away ? 'danger' : 'warn',
    ));
    events.on('horde:stir', ({ level }) => this.splash(
      level >= 75 ? "THEY'RE GATHERING" : 'THE HORDE STIRS',
      `ATTENTION ${level}%`,
      level >= 75 ? 'danger' : 'warn',
    ));
    events.on('raid:calling', ({ seconds, night }) => this.splash(
      'SIREN',
      `${night ? 'NIGHT RAID' : 'THEY HEARD IT'} — ${seconds} SECONDS`,
      'warn',
    ));
    events.on('raid:inbound', ({ seconds }) => {
      const mins = Math.round(seconds / 60);
      this.splash('HORDE INBOUND', `GET HOME — ${seconds >= 60 ? `${mins} MINUTE${mins > 1 ? 'S' : ''}` : `${Math.round(seconds)} SECONDS`}`, 'danger');
    });
    events.on('raid:siege', ({ raid, reason }) => {
      this.splash(`RAID ${raid}`, 'THE BASE IS ON ITS OWN', 'danger');
      this.toast(reason === 'left'
        ? 'You walked away. The walls and turrets will have to hold.'
        : "You weren't home. The horde hit the base without you. Get back there.", 'danger');
    });
    events.on('raid:engage', ({ left }) => this.splash('BACK IN IT', `${left} STILL AT THE WALLS`, 'danger'));
    events.on('raid:start', ({ raid }) => {
      const boss = bossFor(raid);
      this.splash(`RAID ${raid}`, boss ? ENEMIES[boss.id].title : 'THEY ARE HERE', 'danger');
    });
    events.on('raid:end', ({ raid, result, points }) => {
      if (result === 'breached') {
        this.splash('BREACHED', `RAID ${raid} GOT IN`, 'danger');
        this.toast('They broke through and ransacked the storage on that side. It does not count.', 'danger');
        return;
      }
      this.splash(result === 'held' ? 'HELD' : 'CLEAR', `RAID ${raid} OVER · +${points.toLocaleString('en-US')}`, 'info');
    });
    events.on('raid:reward', ({ entries }) => {
      const cache = entries.find((e) => e.kind === 'cache');
      if (cache && cache.kind === 'cache' && cache.items.length) this.toast('The horde left something behind. Salvage cache by the hut.', 'info');
    });
  }

  setVisible(visible: boolean): void {
    this.root.classList.toggle('visible', visible);
  }

  /** Small camera mode buttons: normal view, free orbit, lock free view. */
  onCameraControls(handlers: { fixed: () => void; free: () => void; lock: () => void }): void {
    this.camFixed.addEventListener('click', (e) => {
      e.stopPropagation();
      handlers.fixed();
    });
    this.camFree.addEventListener('click', (e) => {
      e.stopPropagation();
      handlers.free();
    });
    this.camLock.addEventListener('click', (e) => {
      e.stopPropagation();
      handlers.lock();
    });
  }

  setCameraMode(mode: 'fixed' | 'free', locked: boolean): void {
    this.camFixed.classList.toggle('on', mode === 'fixed');
    this.camFree.classList.toggle('on', mode === 'free' && !locked);
    this.camLock.classList.toggle('on', mode === 'free' && locked);
    this.camLock.hidden = mode === 'fixed';
  }

  setCutsceneLetterbox(active: boolean): void {
    this.letterboxRoot.classList.toggle('cinematic-bars', active);
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

  setHealth(value: number, baseMax: number, effectiveMax: number = baseMax): void {
    this.setBar(this.healthBar, this.healthValue, value, baseMax, effectiveMax);
    this.healthBar.classList.toggle('low', value < baseMax * 0.3);
  }

  setStamina(value: number, baseMax: number, effectiveMax: number, exhausted: boolean): void {
    this.setBar(this.staminaBar, this.staminaValue, value, baseMax, effectiveMax);
    this.staminaBar.classList.toggle('exhausted', exhausted);
  }

  setBuff(buff: ActiveBuff | null): void {
    const key = buff ? `${buff.def.label}|${Math.ceil(buff.remaining)}|${buff.def.effects.join(',')}` : '';
    if (key !== this.lastBuffKey) {
      this.lastBuffKey = key;
      this.buffChip.hidden = !buff;
      if (buff) {
        q(this.buffChip, '.buff-label').textContent = buff.def.label;
        q(this.buffChip, '.buff-effects').textContent = buff.def.effects.join(' · ');
      }
    }
    if (!buff) return;
    q(this.buffChip, '.buff-time').textContent = `${Math.ceil(buff.remaining)}s`;
    this.buffChip.style.setProperty('--t', String(Math.max(0, buff.remaining / buff.def.duration)));
  }

  /** Same track always; a comic ink cap marks where the boost zone starts. */
  private setBar(bar: HTMLElement, valueEl: HTMLElement, value: number, baseMax: number, effectiveMax: number): void {
    const boosted = effectiveMax > baseMax + 0.5;
    bar.style.setProperty('--v', String(Math.max(0, value / effectiveMax)));
    bar.style.setProperty('--cap', String(baseMax / effectiveMax));
    bar.classList.toggle('boosted', boosted);
    valueEl.textContent = String(Math.ceil(value));
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
  /** `water`: the exposure is poisoned water around the legs, not gas in the air. */
  setGas(gas: number, filterEmpty: boolean, water = false): void {
    this.gasOverlay.style.opacity = String(Math.min(1, gas) * (filterEmpty ? 0.9 : 0.35));
    const state = gas < 0.05 ? 'off' : filterEmpty ? 'choking' : 'on';
    const key = `${state}${water}`;
    if (key === this.lastGasState) return;
    this.lastGasState = key;
    this.gasWarning.dataset.state = state;
    this.gasText.textContent = state === 'choking' ? 'FILTER EMPTY — CHOKING' : water ? 'TOXIC WATER — FILTER DRAINING' : 'TOXIC GAS — FILTER DRAINING';
  }

  /**
   * Home Zone chip. Away from home it shows the distance and an arrow pointing home (`homeAngle`,
   * radians clockwise from screen-up). `urgent` (a raid coming or on) turns it red and pulses the edges.
   */
  setZone(inside: boolean, metersOutside: number, homeAngle: number, urgent: boolean): void {
    const state = inside ? 'inside' : urgent ? 'urgent' : 'away';
    if (state !== this.lastZoneState) {
      this.lastZoneState = state;
      this.zoneChip.dataset.state = state;
      this.zoneText.textContent = inside ? 'HOME ZONE' : urgent ? 'GET HOME' : 'AWAY FROM HOME';
      this.dangerPulse.classList.toggle('on', state === 'urgent');
    }
    this.zoneDist.textContent = inside ? '' : `${Math.ceil(metersOutside)}M`;
    if (!inside) this.zoneArrow.style.transform = `rotate(${homeAngle.toFixed(3)}rad)`;
  }

  /** Horde meter while calm; a countdown during the siren wind-up or a forced raid; mutants left in a raid. */
  setRaid(raid: { state: 'calm' | 'calling' | 'inbound' | 'raid' | 'siege'; attention: number; timeLeft: number; raidNumber: number; remaining: number }): void {
    const { state, attention, timeLeft } = raid;
    let view: string;
    if (state === 'raid' || state === 'siege') view = 'raid';
    else if (state === 'calling') view = 'calling';
    else if (state === 'inbound') view = timeLeft <= 10 ? 'imminent' : 'inbound';
    else view = attention >= 75 ? 'gathering' : attention >= 50 ? 'stirring' : 'calm';
    this.raidChip.dataset.state = view;
    this.raidLabel.textContent =
      state === 'raid' ? `RAID ${Math.max(1, raid.raidNumber)}`
      : state === 'siege' ? 'BASE UNDER ATTACK'
      : state === 'calling' ? 'SIREN'
      : state === 'inbound' ? 'HORDE INBOUND'
      : 'HORDE';
    this.raidClock.textContent =
      state === 'raid' || state === 'siege' ? `${raid.remaining} LEFT`
      : state === 'calm' ? `${Math.floor(attention)}%`
      : formatClock(timeLeft);
    this.raidMeter.style.transform = `scaleX(${(state === 'calm' ? attention / 100 : 1).toFixed(3)})`;
  }

  /** Time of day, top left. */
  setDay(clock: string, day: number, phase: string): void {
    const key = `${clock}|${day}|${phase}`;
    if (key === this.lastDayKey) return;
    this.lastDayKey = key;
    this.dayChip.dataset.phase = phase;
    this.dayClock.textContent = clock;
    this.dayNum.textContent = `DAY ${day}`;
  }

  private splash(title: string, sub: string, tone: ToastTone): void {
    this.raidSplash.dataset.tone = tone;
    this.raidSplash.innerHTML = `<span class="rs-title">${title}</span><span class="rs-sub">${sub}</span>`;
    this.raidSplash.classList.remove('show');
    void this.raidSplash.offsetWidth;
    this.raidSplash.classList.add('show');
  }

  setCureBreach(on: boolean, seconds: number): void {
    const key = on ? seconds.toFixed(1) : '';
    this.cureAlert.classList.toggle('on', on);
    this.dangerPulse.classList.toggle('cure', on);
    if (!on) {
      if (this.lastCure !== '') this.lastCure = '';
      return;
    }
    if (key === this.lastCure) return;
    this.lastCure = key;
    const s = Math.max(0, Math.ceil(seconds));
    const m = Math.floor(s / 60);
    this.cureClock.textContent = `${m}:${String(s % 60).padStart(2, '0')}`;
  }

  setCarrying(on: boolean): void {
    this.carryChip.classList.toggle('on', on);
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

  setFlashlight(on: boolean): void {
    this.lampChip.classList.toggle('on', on);
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
