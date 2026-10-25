import { events } from '../core/EventBus';
import { ITEMS, type ItemDef, type ItemId } from '../data/items';
import { OVEN_FUEL, OVEN_RECIPES, RECIPES, type Recipe, type RecipeCategory } from '../data/recipes';
import type { Crafting } from '../gameplay/Crafting';
import type { Inventory } from '../gameplay/Inventory';
import type { Oven } from '../gameplay/Oven';
import { el, q } from './dom';

type Icons = Record<string, string>;

const iconStyle = (icons: Icons, item: ItemId) => (icons[item] ? `style="background-image:url(${icons[item]})"` : '');
const itemName = (item: ItemId) => (ITEMS[item] as ItemDef).name.toUpperCase();

function inputChips(inv: Inventory, icons: Icons, inputs: readonly { item: ItemId; qty: number }[]): string {
  return inputs
    .map((a) => {
      const have = inv.count(a.item);
      return `<span class="chip ${have >= a.qty ? 'ok' : 'missing'}" title="${itemName(a.item)}"><i ${iconStyle(icons, a.item)}></i>${Math.min(have, 999)}/${a.qty}</span>`;
    })
    .join('');
}

const CATEGORIES: { id: RecipeCategory | 'all'; label: string }[] = [
  { id: 'all', label: 'ALL' },
  { id: 'tools', label: 'TOOLS' },
  { id: 'survival', label: 'SURVIVAL' },
  { id: 'parts', label: 'PARTS' },
];

/** Recipe list + queue, shown beside the backpack. Workbench recipes need the Crafting Table. */
export class CraftingPanel {
  readonly root: HTMLDivElement;
  private readonly list: HTMLElement;
  private readonly queueList: HTMLElement;
  private readonly stationChip: HTMLElement;
  private category: RecipeCategory | 'all' = 'all';
  private queueSignature: string | null = null;

  constructor(
    parent: HTMLElement,
    private readonly crafting: Crafting,
    private readonly inv: Inventory,
    private readonly icons: Icons,
    private readonly nearWorkbench: () => boolean,
  ) {
    this.root = el('div', 'side-panel craft-panel');
    this.root.innerHTML = `
      <div class="side-header"><span class="side-title">CRAFTING</span><span class="station-chip"></span></div>
      <div class="craft-tabs">${CATEGORIES.map((c) => `<button type="button" data-cat="${c.id}">${c.label}</button>`).join('')}</div>
      <div class="recipe-list"></div>
      <div class="queue">
        <div class="queue-title">QUEUE <span>CLICK TO CANCEL</span></div>
        <div class="queue-list"></div>
      </div>
    `;
    parent.appendChild(this.root);
    this.list = q(this.root, '.recipe-list');
    this.queueList = q(this.root, '.queue-list');
    this.stationChip = q(this.root, '.station-chip');

    this.root.querySelectorAll<HTMLButtonElement>('[data-cat]').forEach((b) =>
      b.addEventListener('click', () => {
        this.category = b.dataset.cat as RecipeCategory | 'all';
        this.refresh();
      }),
    );
    this.list.addEventListener('click', (e) => {
      const btn = (e.target as Element).closest<HTMLButtonElement>('button[data-craft]');
      if (!btn || btn.disabled) return;
      const recipe = RECIPES.find((r) => r.id === btn.dataset.craft);
      if (recipe) this.crafting.enqueue(recipe, Number(btn.dataset.n), this.nearWorkbench());
    });
    this.queueList.addEventListener('click', (e) => {
      const job = (e.target as Element).closest<HTMLElement>('.job');
      if (job) this.crafting.cancel(Number(job.dataset.i));
    });

    crafting.onChange(() => this.refresh());
    inv.onChange(() => this.refresh());
  }

  setVisible(visible: boolean): void {
    this.root.hidden = !visible;
    if (visible) this.refresh();
  }

  refresh(): void {
    if (this.root.hidden) return;
    const bench = this.nearWorkbench();
    this.stationChip.textContent = bench ? 'CRAFTING TABLE' : 'HANDS ONLY';
    this.stationChip.dataset.bench = String(bench);
    this.root.querySelectorAll<HTMLButtonElement>('[data-cat]').forEach((b) => b.classList.toggle('active', b.dataset.cat === this.category));

    const recipes = RECIPES.filter((r) => this.category === 'all' || r.category === this.category);
    this.list.innerHTML = recipes.map((r) => this.recipeRow(r, bench)).join('');
    this.renderQueue();
  }

  private recipeRow(r: Recipe, bench: boolean): string {
    const check = this.crafting.check(r, bench);
    const five = this.crafting.affordable(r, 5);
    const locked = r.station === 'workbench' && !bench;
    return `
      <div class="recipe ${check.ok ? '' : 'unavailable'} ${locked ? 'locked' : ''}">
        <span class="r-icon" ${iconStyle(this.icons, r.output)}></span>
        <div class="r-body">
          <div class="r-name">${itemName(r.output)}${r.qty > 1 ? ` <b>×${r.qty}</b>` : ''}</div>
          <div class="r-inputs">${inputChips(this.inv, this.icons, r.inputs)}</div>
          ${check.ok ? '' : `<div class="r-reason">${check.reason}</div>`}
        </div>
        <div class="r-actions">
          <button type="button" class="r-btn" data-craft="${r.id}" data-n="1" ${check.ok ? '' : 'disabled'}>CRAFT</button>
          <button type="button" class="r-btn small" data-craft="${r.id}" data-n="5" ${check.ok && five > 1 ? '' : 'disabled'}>×${Math.max(2, five)}</button>
          <span class="r-time">${r.time}s</span>
        </div>
      </div>`;
  }

  private renderQueue(): void {
    const sig = this.crafting.queue.map((j) => j.recipe.id + (j.blocked ? '!' : '')).join(',');
    if (sig === this.queueSignature) return;
    this.queueSignature = sig;
    this.queueList.innerHTML = this.crafting.queue.length
      ? this.crafting.queue
          .map((j, i) => `<div class="job ${j.blocked ? 'blocked' : ''}" data-i="${i}" title="Cancel ${itemName(j.recipe.output)}"><span class="j-icon" ${iconStyle(this.icons, j.recipe.output)}></span>${i === 0 ? '<span class="j-bar"><span></span></span>' : ''}</div>`)
          .join('')
      : '<div class="queue-empty">NOTHING QUEUED</div>';
  }

  /** Per-frame: animates the progress bar of the job being crafted. */
  update(): void {
    if (this.root.hidden) return;
    this.renderQueue();
    const bar = this.queueList.querySelector<HTMLElement>('.j-bar span');
    if (bar) bar.style.transform = `scaleX(${this.crafting.progress})`;
  }
}

/** A storage box's slots beside the backpack. The slots themselves are run by `InventoryView`. */
export class StoragePanel {
  readonly root: HTMLDivElement;
  readonly grid: HTMLElement;
  private readonly count: HTMLElement;
  private inv: Inventory | null = null;
  private into: Inventory | null = null;
  private off: (() => void) | null = null;

  constructor(parent: HTMLElement) {
    this.root = el('div', 'side-panel storage-panel');
    this.root.innerHTML = `
      <div class="side-header"><span class="side-title">STORAGE BOX</span><span class="station-chip storage-count"></span></div>
      <div class="inv-grid storage-grid"></div>
      <div class="section-hint">STASHED LOOT SURVIVES A RAID PENALTY. YOUR BACKPACK DOES NOT.</div>
      <button type="button" class="r-btn take-all">TAKE ALL</button>
    `;
    parent.appendChild(this.root);
    this.root.hidden = true;
    this.grid = q(this.root, '.storage-grid');
    this.count = q(this.root, '.storage-count');
    q(this.root, '.take-all').addEventListener('click', () => this.takeAll());
  }

  /** Shows `inv` (or hides the panel with null); `into` is where TAKE ALL sends things. */
  show(inv: Inventory | null, into: Inventory | null = null, meta?: { title: string; hint: string }): void {
    this.off?.();
    this.off = null;
    this.inv = inv;
    this.into = into;
    this.root.hidden = !inv;
    q(this.root, '.side-title').textContent = meta?.title ?? 'STORAGE BOX';
    q(this.root, '.section-hint').textContent = meta?.hint ?? 'STASHED LOOT SURVIVES A RAID PENALTY. YOUR BACKPACK DOES NOT.';
    if (inv) {
      this.off = inv.onChange(() => this.refresh());
      this.refresh();
    }
  }

  private refresh(): void {
    if (!this.inv) return;
    const used = this.inv.slots.filter(Boolean).length;
    this.count.textContent = `${used} / ${this.inv.size}`;
    q<HTMLButtonElement>(this.root, '.take-all').disabled = used === 0;
  }

  private takeAll(): void {
    const from = this.inv;
    const to = this.into;
    if (!from || !to) return;
    let stuck = false;
    for (let i = 0; i < from.size; i++) {
      if (!from.slots[i]) continue;
      from.transfer(i, to);
      if (from.slots[i]) stuck = true;
    }
    if (stuck) events.emit('toast', { text: 'No room in your backpack.', tone: 'warn' });
  }
}

/** Fuel, cooking/smelting jobs and the output tray of the hut's Oven. */
export class OvenPanel {
  readonly root: HTMLDivElement;
  private readonly status: HTMLElement;
  private readonly fuelText: HTMLElement;
  private readonly recipes: HTMLElement;
  private readonly jobs: HTMLElement;
  private readonly output: HTMLElement;
  private jobsSignature: string | null = null;

  constructor(
    parent: HTMLElement,
    private readonly oven: Oven,
    private readonly inv: Inventory,
    private readonly icons: Icons,
  ) {
    this.root = el('div', 'side-panel oven-panel');
    this.root.innerHTML = `
      <div class="side-header"><span class="side-title">OVEN</span><span class="oven-status"></span></div>
      <div class="oven-section">
        <div class="section-title">FUEL</div>
        <div class="oven-fuel">
          <span class="r-icon" ${iconStyle(icons, OVEN_FUEL.item)}></span>
          <div class="fuel-text"></div>
          <button type="button" class="r-btn small" data-fuel="5">+5</button>
          <button type="button" class="r-btn small" data-fuel="20">+20</button>
          <button type="button" class="r-btn small ghost" data-fuel="take">TAKE</button>
        </div>
        <div class="section-hint">EACH LOG BURNS ${OVEN_FUEL.burnTime}S · ASH LEAVES CHARCOAL</div>
      </div>
      <div class="oven-section">
        <div class="section-title">COOK &amp; SMELT</div>
        <div class="oven-recipes"></div>
      </div>
      <div class="oven-section">
        <div class="section-title">IN THE FIRE <span>CLICK TO PULL OUT</span></div>
        <div class="oven-jobs queue-list"></div>
      </div>
      <div class="oven-section">
        <div class="section-title">TRAY</div>
        <div class="oven-output"></div>
        <button type="button" class="r-btn take-all">TAKE ALL</button>
      </div>
    `;
    parent.appendChild(this.root);
    this.status = q(this.root, '.oven-status');
    this.fuelText = q(this.root, '.fuel-text');
    this.recipes = q(this.root, '.oven-recipes');
    this.jobs = q(this.root, '.oven-jobs');
    this.output = q(this.root, '.oven-output');

    this.root.querySelectorAll<HTMLButtonElement>('[data-fuel]').forEach((b) =>
      b.addEventListener('click', () => {
        if (b.dataset.fuel === 'take') this.oven.takeFuel();
        else this.oven.addFuel(Number(b.dataset.fuel));
      }),
    );
    this.recipes.addEventListener('click', (e) => {
      const btn = (e.target as Element).closest<HTMLButtonElement>('button[data-add]');
      if (!btn || btn.disabled) return;
      const r = OVEN_RECIPES.find((x) => x.id === btn.dataset.add);
      if (r) this.oven.addJobs(r, Number(btn.dataset.n));
    });
    this.jobs.addEventListener('click', (e) => {
      const job = (e.target as Element).closest<HTMLElement>('.job');
      if (job) this.oven.cancelJob(Number(job.dataset.i));
    });
    q(this.root, '.take-all').addEventListener('click', () => {
      if (this.oven.takeOutput().length === 0) events.emit('toast', { text: 'No room in your backpack.', tone: 'warn' });
    });

    oven.onChange(() => this.refresh());
    inv.onChange(() => this.refresh());
  }

  setVisible(visible: boolean): void {
    this.root.hidden = !visible;
    if (visible) this.refresh();
  }

  refresh(): void {
    if (this.root.hidden) return;
    const o = this.oven;
    this.status.textContent = o.lit ? 'BURNING' : 'COLD';
    this.status.dataset.lit = String(o.lit);
    this.fuelText.innerHTML = `<b>${o.fuel}</b> / ${OVEN_FUEL.maxFuel} WOOD<span>${this.inv.count(OVEN_FUEL.item)} IN BACKPACK</span>`;

    this.recipes.innerHTML = OVEN_RECIPES.map((r) => {
      const have = this.inv.count(r.input.item);
      const ok = have >= r.input.qty;
      const many = Math.floor(have / r.input.qty);
      return `
        <div class="recipe oven-recipe ${ok ? '' : 'unavailable'}">
          <span class="r-icon" ${iconStyle(this.icons, r.input.item)}></span>
          <span class="arrow">▶</span>
          <span class="r-icon" ${iconStyle(this.icons, r.output.item)}></span>
          <div class="r-body">
            <div class="r-name">${itemName(r.output.item)}</div>
            <div class="r-inputs"><span class="chip ${ok ? 'ok' : 'missing'}"><i ${iconStyle(this.icons, r.input.item)}></i>${Math.min(have, 999)}/${r.input.qty}</span><span class="r-time">${r.time}s EACH</span></div>
          </div>
          <div class="r-actions">
            <button type="button" class="r-btn" data-add="${r.id}" data-n="1" ${ok ? '' : 'disabled'}>ADD</button>
            <button type="button" class="r-btn small" data-add="${r.id}" data-n="99" ${many > 1 ? '' : 'disabled'}>ALL ${many > 1 ? many : ''}</button>
          </div>
        </div>`;
    }).join('');

    this.output.innerHTML = o.output.length
      ? o.output.map((s) => `<div class="tray-item" title="${itemName(s.item)}"><span class="r-icon" ${iconStyle(this.icons, s.item)}></span><b>${s.qty}</b></div>`).join('')
      : '<div class="queue-empty">EMPTY</div>';
    q<HTMLButtonElement>(this.root, '.take-all').disabled = o.output.length === 0;
    this.jobsSignature = null;
    this.renderJobs();
  }

  private renderJobs(): void {
    const sig = this.oven.jobs.map((j) => j.recipe.id).join(',');
    if (sig === this.jobsSignature) return;
    this.jobsSignature = sig;
    const jobs = this.oven.jobs;
    const shown = jobs.slice(0, 10);
    this.jobs.innerHTML = jobs.length
      ? shown.map((j, i) => `<div class="job" data-i="${i}"><span class="j-icon" ${iconStyle(this.icons, j.recipe.input.item)}></span>${i === 0 ? '<span class="j-bar"><span></span></span>' : ''}</div>`).join('') +
        (jobs.length > shown.length ? `<div class="job more">+${jobs.length - shown.length}</div>` : '')
      : '<div class="queue-empty">NOTHING COOKING</div>';
  }

  update(): void {
    if (this.root.hidden) return;
    this.renderJobs();
    const bar = this.jobs.querySelector<HTMLElement>('.j-bar span');
    if (bar) bar.style.transform = `scaleX(${this.oven.progress})`;
    this.root.classList.toggle('lit', this.oven.lit);
  }
}
