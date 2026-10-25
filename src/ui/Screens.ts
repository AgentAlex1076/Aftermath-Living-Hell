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
      <div class="cover">
        <div class="cover-issue">ISSUE #${issue} — ${kicker}</div>
        <h1 class="cover-title">AFTERMATH</h1>
        <div class="cover-sub">LIVING HELL</div>
        <p class="cover-tagline">
          The lab breached. The gas took everyone. Keep your mask on, hold the hut,
          and survive whatever crawls out of the fog.
        </p>
        ${record}
        <button class="btn" type="button" data-a="start">ENTER THE WASTELAND</button>
        <div class="cover-row">
          <button class="btn secondary" type="button" data-a="codex">CODEX</button>
          <button class="btn secondary" type="button" data-a="ledger">THE LEDGER</button>
        </div>
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
        <button class="btn" type="button" data-a="resume">RESUME</button>
        <div class="cover-row">
          <button class="btn secondary" type="button" data-a="codex">CODEX</button>
          <button class="btn secondary" type="button" data-a="ledger">THE LEDGER</button>
        </div>
        <button class="btn secondary" type="button" data-a="new">ABANDON RUN</button>
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
    const pb = best > 0 ? ` · BEST ${formatScore(best)}` : '';
    this.runEl.innerHTML = `<b>${formatScore(score)}</b><span>${raids} RAIDS · ${formatClock(seconds)}${pb}</span>`;
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
    <div class="cover-issue">ISSUE #${r.issue} — THE LAST PAGE</div>
    <div class="death-title">YOU DIED</div>
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
    <button class="btn" type="button" data-a="new">NEW RUN</button>
    <div class="cover-row">
      <button class="btn secondary" type="button" data-a="codex">CODEX</button>
      <button class="btn secondary" type="button" data-a="ledger">THE LEDGER</button>
    </div>
  `;
}

function stat(value: string, label: string): string {
  return `<div><b>${value}</b><span>${label}</span></div>`;
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
    b.raids && `${formatScore(b.raids)} RAIDS`,
    b.kills && `${formatScore(b.kills)} KILLS`,
    b.bosses && `${formatScore(b.bosses)} BOSSES`,
    b.built && `${formatScore(b.built)} BUILT`,
    b.guns && `${formatScore(b.guns)} GUNS`,
    b.time && `${formatScore(b.time)} TIME`,
  ].filter(Boolean);
  const mult = b.multiplier > 1 ? `  ×${b.multiplier.toFixed(2)} STREAK` : '';
  return parts.length ? `<div class="death-math">${parts.join('  +  ')}${mult}</div>` : '';
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
