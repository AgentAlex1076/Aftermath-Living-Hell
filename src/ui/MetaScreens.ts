import { PIECES } from '../data/buildables';
import { ENEMIES } from '../data/enemies';
import { CATEGORY_LABEL, GUN_PARTS, RARITY_LABEL } from '../data/guns';
import { ITEMS, type ItemDef } from '../data/items';
import { OVEN_RECIPES, RECIPES } from '../data/recipes';
import { formatClock, formatScore } from '../data/score';
import {
  CODEX_IDS,
  CODEX_TOTALS,
  type CodexKind,
  type Meta,
  type RunRecord,
} from '../gameplay/Meta';
import { el, q } from './dom';
import { setScreenHidden } from './Screens';

type Icons = Record<string, string>;
type Page = 'codex' | 'ledger';
type CodexTab = CodexKind;
type LedgerTab = 'board' | 'history';

const CODEX_TABS: { id: CodexTab; label: string }[] = [
  { id: 'enemy', label: 'MUTANTS' },
  { id: 'part', label: 'PARTS' },
  { id: 'buildable', label: 'BUILDS' },
  { id: 'recipe', label: 'RECIPES' },
];

const LEDGER_TABS: { id: LedgerTab; label: string }[] = [
  { id: 'board', label: 'HIGH SCORES' },
  { id: 'history', label: 'ISSUE FILE' },
];

/**
 * Full-screen Codex and Ledger. Opened from the cover, the pause menu or the death page.
 * Esc / BACK returns to whatever was underneath.
 */
export class MetaOverlay {
  readonly root: HTMLDivElement;
  private page: Page = 'codex';
  private codexTab: CodexTab = 'enemy';
  private ledgerTab: LedgerTab = 'board';
  private readonly title: HTMLElement;
  private readonly tabs: HTMLElement;
  private readonly body: HTMLElement;
  private readonly progress: HTMLElement;

  constructor(
    parent: HTMLElement,
    private readonly meta: Meta,
    private readonly icons: Icons,
    private readonly onReplay: (seed: number) => void,
  ) {
    this.root = el('div', 'screen meta-screen');
    this.root.innerHTML = `
      <div class="meta-frame">
        <div class="meta-head">
          <div class="meta-title"></div>
          <div class="meta-progress"></div>
        </div>
        <div class="meta-tabs"></div>
        <div class="meta-body"></div>
        <button class="btn secondary meta-back" type="button">BACK</button>
      </div>
    `;
    parent.appendChild(this.root);
    setScreenHidden(this.root, true);
    this.title = q(this.root, '.meta-title');
    this.tabs = q(this.root, '.meta-tabs');
    this.body = q(this.root, '.meta-body');
    this.progress = q(this.root, '.meta-progress');
    q(this.root, '.meta-back').addEventListener('click', () => this.hide());
  }

  get open(): boolean {
    return !this.root.classList.contains('hidden');
  }

  showCodex(): void {
    this.page = 'codex';
    this.paint();
    setScreenHidden(this.root, false);
  }

  showLedger(): void {
    this.page = 'ledger';
    this.paint();
    setScreenHidden(this.root, false);
  }

  hide(): void {
    setScreenHidden(this.root, true);
  }

  private paint(): void {
    if (this.page === 'codex') this.paintCodex();
    else this.paintLedger();
  }

  private paintCodex(): void {
    const known = CODEX_TABS.reduce((n, t) => n + this.meta.logged(t.id), 0);
    const total = CODEX_TABS.reduce((n, t) => n + CODEX_TOTALS[t.id], 0);
    this.title.textContent = 'THE CODEX';
    this.progress.textContent = `${known} / ${total} LOGGED`;
    this.tabs.innerHTML = CODEX_TABS.map((t) => {
      const on = t.id === this.codexTab ? ' on' : '';
      return `<button type="button" class="meta-tab${on}" data-tab="${t.id}">${t.label} ${this.meta.logged(t.id)}/${CODEX_TOTALS[t.id]}</button>`;
    }).join('');
    this.tabs.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((b) => {
      b.addEventListener('click', () => {
        this.codexTab = b.dataset.tab as CodexTab;
        this.paintCodex();
      });
    });
    this.body.className = 'meta-body codex-grid';
    this.body.innerHTML = CODEX_IDS[this.codexTab].map((id) => this.codexCard(this.codexTab, id)).join('');
  }

  private paintLedger(): void {
    this.title.textContent = this.ledgerTab === 'board' ? 'THE LEDGER' : 'ISSUE FILE';
    const life = this.meta.lifetime;
    this.progress.textContent = life.runs
      ? `${life.runs} RUNS · BEST ${formatScore(life.bestScore)} · ${life.bestRaids} RAIDS`
      : 'NO ISSUES FILED YET';
    this.tabs.innerHTML = LEDGER_TABS.map((t) => {
      const on = t.id === this.ledgerTab ? ' on' : '';
      return `<button type="button" class="meta-tab${on}" data-tab="${t.id}">${t.label}</button>`;
    }).join('');
    this.tabs.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((b) => {
      b.addEventListener('click', () => {
        this.ledgerTab = b.dataset.tab as LedgerTab;
        this.paintLedger();
      });
    });
    this.body.className = 'meta-body ledger-list';
    const rows = this.ledgerTab === 'board' ? this.meta.leaderboard() : this.meta.history;
    if (rows.length === 0) {
      this.body.innerHTML = `<div class="ledger-empty">The wasteland has not taken anyone yet. Or you have not walked out there.</div>`;
      return;
    }
    this.body.innerHTML = rows.map((r, i) => this.runRow(r, this.ledgerTab === 'board' ? i + 1 : r.issue)).join('');
    this.body.querySelectorAll<HTMLButtonElement>('[data-seed]').forEach((b) => {
      b.addEventListener('click', () => this.onReplay(Number(b.dataset.seed)));
    });
  }

  private runRow(r: RunRecord, rank: number): string {
    const gun = r.bestGun ? escapeHtml(r.bestGun.name) : '—';
    const tag = r.abandoned ? 'WALKED' : 'DIED';
    return `
      <div class="ledger-row">
        <div class="ledger-rank">#${rank}</div>
        <div class="ledger-score">${formatScore(r.score)}</div>
        <div class="ledger-meta">
          <b>ISSUE #${r.issue}</b>
          <span>${r.raids} RAIDS · ${r.kills} KILLS · ${formatClock(r.seconds)}</span>
          <span class="ledger-cause">${escapeHtml(r.cause)}</span>
        </div>
        <div class="ledger-gun">${gun}</div>
        <div class="ledger-tag">${tag}</div>
        <button type="button" class="btn secondary ledger-replay" data-seed="${r.seed}">SEED #${r.seed}</button>
      </div>
    `;
  }

  private codexCard(kind: CodexTab, id: string): string {
    const known = this.meta.known(kind, id);
    const info = entry(kind, id);
    const icon = this.icons[info.icon] ?? '';
    if (!known) {
      return `
        <div class="codex-card locked">
          <div class="codex-icon">${icon ? `<img alt="" src="${icon}" />` : ''}</div>
          <div class="codex-name">???</div>
          <div class="codex-sub">UNLOGGED</div>
        </div>
      `;
    }
    return `
      <div class="codex-card">
        <div class="codex-icon">${icon ? `<img alt="" src="${icon}" />` : ''}</div>
        <div class="codex-name">${escapeHtml(info.name)}</div>
        <div class="codex-sub">${escapeHtml(info.sub)}</div>
        <p class="codex-blurb">${escapeHtml(info.blurb)}</p>
      </div>
    `;
  }
}

interface Entry {
  name: string;
  sub: string;
  blurb: string;
  icon: string;
}

function entry(kind: CodexKind, id: string): Entry {
  if (kind === 'enemy') {
    const e = ENEMIES[id as keyof typeof ENEMIES];
    return { name: e.name, sub: e.title, blurb: `${e.blurb} ${e.hp} HP. ${e.speed.toFixed(1)} m/s.`, icon: `enemy:${id}` };
  }
  if (kind === 'part') {
    const p = GUN_PARTS[id as keyof typeof GUN_PARTS];
    return {
      name: p.name,
      sub: `${RARITY_LABEL[p.rarity]} · ${CATEGORY_LABEL[p.category]}`,
      blurb: p.description,
      icon: id,
    };
  }
  if (kind === 'buildable') {
    const b = PIECES[id as keyof typeof PIECES];
    return { name: b.name, sub: b.tab.toUpperCase(), blurb: b.description, icon: `build:${id}` };
  }
  const craft = RECIPES.find((r) => r.id === id);
  if (craft) {
    const out: ItemDef = ITEMS[craft.output];
    const needs = craft.inputs.map((a) => `${a.qty} ${ITEMS[a.item].name}`).join(', ');
    return {
      name: out.name,
      sub: craft.station === 'hand' ? 'HAND' : 'CRAFTING TABLE',
      blurb: `${needs} → ${craft.qty} ${out.name}.`,
      icon: craft.output,
    };
  }
  const oven = OVEN_RECIPES.find((r) => r.id === id);
  if (oven) {
    const out: ItemDef = ITEMS[oven.output.item];
    return {
      name: out.name,
      sub: 'OVEN',
      blurb: `${oven.input.qty} ${ITEMS[oven.input.item].name} → ${oven.output.qty} ${out.name}.`,
      icon: oven.output.item,
    };
  }
  return { name: id, sub: '', blurb: '', icon: id };
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
