import { audio } from '../audio/AudioEngine';
import { ALL_ENEMY_IDS, ENEMIES } from '../data/enemies';
import { formatClock, formatScore } from '../data/score';
import type { Meta, RecordedRun, RunRecord } from '../gameplay/Meta';
import { el, q } from './dom';

/** Hidden screens must not keep focus or receive keyboard activation (e.g. Space on a stale button). */
export function setScreenHidden(root: HTMLElement, hidden: boolean): void {
  root.classList.toggle('hidden', hidden);
  root.inert = hidden;
  if (hidden && root.contains(document.activeElement)) (document.activeElement as HTMLElement).blur();
}

export class StartScreen {
  private readonly root: HTMLDivElement;

  constructor(
    parent: HTMLElement,
    meta: Meta,
    handlers: { onStart: () => void; onCodex: () => void; onLedger: () => void },
  ) {
    const issue = meta.nextIssue;
    const kicker = issue === 1 ? 'DAY ZERO' : 'ANOTHER DAWN';
    const life = meta.lifetime;
    const record = life.runs
      ? `<div class="cover-record">RECORD <b>${formatScore(life.bestScore)}</b> · ${life.bestRaids} RAIDS · ${life.runs} ${life.runs === 1 ? 'ISSUE' : 'ISSUES'}</div>`
      : '';
    this.root = el('div', 'screen start-screen');
    this.root.innerHTML = `
      <div class="cover-watermark" aria-hidden="true">ISSUE ${String(issue).padStart(2, '0')}</div>
      <div class="cover">
        <div class="cover-issue"><b>#${issue}</b><span>${kicker}</span></div>
        <h1 class="cover-title">AFTERMATH</h1>
        <div class="cover-sub">LIVING HELL</div>
        <p class="cover-tagline">
          The lab breached. The gas took everyone. Keep your mask on, hold the hut,
          and survive whatever crawls out of the fog.
        </p>
        ${record}
        <nav class="cover-menu">
          <button class="btn" type="button" data-a="start">ENTER THE WASTELAND</button>
          <button class="btn secondary" type="button" data-a="codex">CODEX</button>
          <button class="btn secondary" type="button" data-a="ledger">THE LEDGER</button>
        </nav>
      </div>
    `;
    parent.appendChild(this.root);
    q(this.root, '[data-a="start"]').addEventListener('click', () => {
      setScreenHidden(this.root, true);
      handlers.onStart();
    });
    q(this.root, '[data-a="codex"]').addEventListener('click', handlers.onCodex);
    q(this.root, '[data-a="ledger"]').addEventListener('click', handlers.onLedger);
  }
}

export class DeathScreen {
  private readonly root: HTMLDivElement;
  private readonly frame: HTMLElement;

  constructor(
    parent: HTMLElement,
    handlers: { onNewRun: () => void; onCodex: () => void; onLedger: () => void },
  ) {
    this.root = el('div', 'screen death-screen');
    this.root.innerHTML = `<div class="death-cover"></div>`;
    parent.appendChild(this.root);
    setScreenHidden(this.root, true);
    this.frame = q(this.root, '.death-cover');
    this.root.addEventListener('click', (e) => {
      const t = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-a]');
      if (!t) return;
      if (t.dataset.a === 'new') handlers.onNewRun();
      if (t.dataset.a === 'codex') handlers.onCodex();
      if (t.dataset.a === 'ledger') handlers.onLedger();
    });
  }

  show(rec: RecordedRun): void {
    this.frame.innerHTML = deathCover(rec);
    setScreenHidden(this.root, false);
  }
}

export class PauseScreen {
  private readonly root: HTMLDivElement;
  private readonly runEl: HTMLElement;
  private readonly volume: HTMLInputElement;
  private readonly muteBtn: HTMLElement;

  constructor(
    parent: HTMLElement,
    seed: number,
    handlers: { onResume: () => void; onAbandon: () => void; onCodex: () => void; onLedger: () => void },
  ) {
    this.root = el('div', 'screen pause-screen');
    this.root.innerHTML = `
      <div class="pause-panel">
        <div class="pause-title">PAUSED</div>
        <div class="pause-run"></div>
        <nav class="cover-menu">
          <button class="btn" type="button" data-a="resume">RESUME</button>
          <button class="btn secondary" type="button" data-a="codex">CODEX</button>
          <button class="btn secondary" type="button" data-a="ledger">THE LEDGER</button>
          <button class="btn secondary danger" type="button" data-a="new">ABANDON RUN</button>
        </nav>
        <label class="pause-sound">
          <span>SOUND</span>
          <input type="range" min="0" max="100" step="5" aria-label="Volume" />
          <button class="btn secondary" type="button" data-a="mute">MUTE</button>
          <em>M</em>
        </label>
        <div class="pause-seed">WORLD SEED #${seed}</div>
      </div>
    `;
    parent.appendChild(this.root);
    setScreenHidden(this.root, true);
    this.runEl = q(this.root, '.pause-run');
    this.volume = q<HTMLInputElement>(this.root, '.pause-sound input');
    this.muteBtn = q(this.root, '[data-a="mute"]');
    this.volume.addEventListener('input', () => {
      audio.setVolume(Number(this.volume.value) / 100);
      if (audio.muted) audio.toggleMute();
      this.syncSound();
    });
    this.muteBtn.addEventListener('click', (e) => {
      e.preventDefault();
      audio.toggleMute();
      this.syncSound();
    });
    q(this.root, '[data-a="resume"]').addEventListener('click', handlers.onResume);
    q(this.root, '[data-a="new"]').addEventListener('click', handlers.onAbandon);
    q(this.root, '[data-a="codex"]').addEventListener('click', handlers.onCodex);
    q(this.root, '[data-a="ledger"]').addEventListener('click', handlers.onLedger);
  }

  setVisible(visible: boolean): void {
    setScreenHidden(this.root, !visible);
    if (visible) this.syncSound();
  }

  syncSound(): void {
    this.volume.value = String(Math.round(audio.volume * 100));
    this.muteBtn.textContent = audio.muted ? 'UNMUTE' : 'MUTE';
  }

  setRun(score: number, best: number, raids: number, seconds: number): void {
    this.runEl.innerHTML = `
      <div><span>SCORE</span><b>${formatScore(score)}</b></div>
      <div><span>RAIDS</span><b>${raids}</b></div>
      <div><span>TIME</span><b>${formatClock(seconds)}</b></div>
      ${best > 0 ? `<div><span>BEST</span><b>${formatScore(best)}</b></div>` : ''}`;
  }
}

function deathCover(rec: RecordedRun): string {
  const r = rec.run;
  const banner = rec.newBest
    ? rec.previousBest === 0
      ? 'FIRST ISSUE LOGGED'
      : 'NEW PERSONAL BEST'
    : rec.previousBest > 0
      ? `RECORD STILL ${formatScore(rec.previousBest)}`
      : '';
  return `
    <div class="death-band">
      <div class="cover-issue"><b>#${r.issue}</b><span>THE LAST PAGE</span></div>
      <div class="death-title">YOU DIED</div>
    </div>
    <div class="death-cause">${escapeHtml(r.cause)}</div>
    <div class="death-score ${rec.newBest ? 'best' : ''}">
      <span>FINAL SCORE</span>
      <b>${formatScore(r.score)}</b>
      ${banner ? `<em>${banner}</em>` : ''}
    </div>
    <div class="death-stats">
      ${stat(formatClock(r.seconds), 'SURVIVED')}
      ${stat(String(r.raids), 'RAIDS')}
      ${stat(String(r.kills), 'KILLS')}
      ${stat(String(r.bosses), 'BOSSES')}
      ${stat(String(r.built), 'BUILT')}
      ${stat(String(r.guns), 'GUNS')}
      ${stat(String(r.gathered), 'GATHERED')}
      ${stat(`#${r.seed}`, 'SEED')}
    </div>
    ${killStrip(r)}
    ${gunStrip(r)}
    ${breakdown(r)}
    <nav class="cover-row">
      <button class="btn" type="button" data-a="new">NEW RUN</button>
      <button class="btn secondary" type="button" data-a="codex">CODEX</button>
      <button class="btn secondary" type="button" data-a="ledger">THE LEDGER</button>
    </nav>
  `;
}

function stat(value: string, label: string): string {
  return `<div><span>${label}</span><b>${value}</b></div>`;
}

function killStrip(r: RunRecord): string {
  const bits = ALL_ENEMY_IDS.filter((id) => (r.killsByType[id] ?? 0) > 0)
    .map((id) => `<span style="--c:${ENEMIES[id].color}"><b>${r.killsByType[id]}</b> ${ENEMIES[id].name.toUpperCase()}</span>`)
    .join('');
  return bits ? `<div class="death-kills">${bits}</div>` : '';
}

function gunStrip(r: RunRecord): string {
  const g = r.bestGun;
  if (!g) return '';
  return `<div class="death-gun"><span>BEST GUN</span><b>${escapeHtml(g.name)}</b><em>${g.damage.toFixed(0)} DMG · ${g.mode.toUpperCase()} · ${g.parts} PARTS</em></div>`;
}

function breakdown(r: RunRecord): string {
  const b = r.breakdown;
  const parts = [
    b.raids && ['RAIDS', b.raids],
    b.kills && ['KILLS', b.kills],
    b.bosses && ['BOSSES', b.bosses],
    b.built && ['BUILT', b.built],
    b.guns && ['GUNS', b.guns],
    b.time && ['TIME', b.time],
  ].filter((p): p is [string, number] => !!p);
  const chips = parts.map(([label, n]) => `<span>${label} <b>+${formatScore(n)}</b></span>`);
  if (b.multiplier > 1) chips.push(`<span class="streak">STREAK <b>×${b.multiplier.toFixed(2)}</b></span>`);
  return chips.length ? `<div class="death-math">${chips.join('')}</div>` : '';
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
