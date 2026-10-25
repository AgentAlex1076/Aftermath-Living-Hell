import * as THREE from 'three';
import { events } from '../core/EventBus';
import {
  ALL_GUN_PART_IDS,
  CATEGORY_LABEL,
  GUN_GRID,
  GUN_PARTS,
  RARITY_COLOR,
  STAT_BARS,
  canPlace,
  evaluateBuild,
  gunPart,
  makeGun,
  nextPartUid,
  type GunNote,
  type PartCategory,
  type PlacedPart,
} from '../data/guns';
import { gunPower } from '../data/score';
import { ITEMS, type ItemDef, type ItemId } from '../data/items';
import type { Inventory } from '../gameplay/Inventory';
import { assembleGun, gunNameFromParts } from '../models/guns';
import { el, q } from './dom';
import { stackIcon } from './IconRenderer';

type Icons = Record<string, string>;

interface Blueprint {
  name: string;
  parts: { part: string; x: number; y: number }[];
}

const BP_KEY = 'aftermath.gunBlueprints';

function loadBlueprints(): Blueprint[] {
  try {
    const raw = localStorage.getItem(BP_KEY);
    return raw ? (JSON.parse(raw) as Blueprint[]) : [];
  } catch {
    return [];
  }
}

function saveBlueprints(list: Blueprint[]): void {
  localStorage.setItem(BP_KEY, JSON.stringify(list.slice(0, 12)));
}

const CATS: { id: PartCategory | 'all' | 'guns'; label: string }[] = [
  { id: 'all', label: 'ALL' },
  { id: 'receiver', label: 'CORE' },
  { id: 'barrel', label: 'BARREL' },
  { id: 'trigger', label: 'FIRE' },
  { id: 'magazine', label: 'MAG' },
  { id: 'guns', label: 'GUNS' },
];

/**
 * Full-screen Gun Bench: drag parts from the tray onto a 12×6 side-view grid,
 * watch stats and a spinning 3D preview, then take the assembled gun.
 */
export class GunBench {
  readonly root: HTMLDivElement;
  private readonly gridEl: HTMLElement;
  private readonly trayEl: HTMLElement;
  private readonly notesEl: HTMLElement;
  private readonly statsEl: HTMLElement;
  private readonly modeEl: HTMLElement;
  private readonly nameInput: HTMLInputElement;
  private readonly takeBtn: HTMLButtonElement;
  private readonly ghost: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly preview = new THREE.Scene();
  private readonly previewCam = new THREE.PerspectiveCamera(32, 1, 0.05, 20);
  private readonly previewRenderer: THREE.WebGLRenderer;
  private previewGun: THREE.Object3D | null = null;
  private previewSpin = 0;

  private open = false;
  private parts: PlacedPart[] = [];
  private filter: PartCategory | 'all' | 'guns' = 'all';
  private drag: { part: string; uid: number; fromGrid: boolean } | null = null;
  private hover: { x: number; y: number } | null = null;
  private lastEval = '';

  constructor(
    parent: HTMLElement,
    private readonly inv: Inventory,
    private readonly icons: Icons,
  ) {
    this.root = el('div', 'gun-bench');
    this.root.innerHTML = `
      <div class="gb-panel">
        <div class="gb-head">
          <span class="gb-title">GUN BENCH</span>
          <span class="gb-mode">DROP A RECEIVER</span>
          <button type="button" class="r-btn ghost gb-close">CLOSE</button>
        </div>
        <div class="gb-body">
          <div class="gb-tray-col">
            <div class="gb-tabs">${CATS.map((c) => `<button type="button" data-cat="${c.id}">${c.label}</button>`).join('')}</div>
            <div class="gb-tray"></div>
            <div class="section-hint">DRAG PARTS ONTO THE GRID · DROP A GUN TO TEAR IT DOWN</div>
          </div>
          <div class="gb-grid-wrap">
            <div class="gb-axis rear">STOCK</div>
            <div class="gb-grid"></div>
            <div class="gb-axis front">MUZZLE</div>
          </div>
          <div class="gb-side">
            <canvas class="gb-preview" width="280" height="180"></canvas>
            <div class="gb-stats"></div>
            <div class="gb-notes"></div>
            <label class="gb-name"><span>NAME</span><input type="text" maxlength="22" placeholder="UNNAMED" /></label>
            <div class="gb-actions">
              <button type="button" class="r-btn gb-take" disabled>TAKE GUN</button>
              <button type="button" class="r-btn small gb-save">SAVE PRINT</button>
            </div>
            <div class="gb-prints"></div>
          </div>
        </div>
      </div>
      <div class="drag-ghost"></div>
    `;
    parent.appendChild(this.root);
    this.root.inert = true;
    this.gridEl = q(this.root, '.gb-grid');
    this.trayEl = q(this.root, '.gb-tray');
    this.notesEl = q(this.root, '.gb-notes');
    this.statsEl = q(this.root, '.gb-stats');
    this.modeEl = q(this.root, '.gb-mode');
    this.nameInput = q(this.root, '.gb-name input');
    this.takeBtn = q(this.root, '.gb-take');
    this.ghost = q(this.root, '.drag-ghost');
    this.canvas = q(this.root, '.gb-preview');

    this.previewRenderer = new THREE.WebGLRenderer({ canvas: this.canvas, alpha: true, antialias: true });
    this.previewRenderer.setPixelRatio(1);
    this.previewRenderer.setSize(280, 180, false);
    this.previewRenderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.previewRenderer.toneMappingExposure = 1.3;
    this.previewRenderer.setClearColor(0x000000, 0);
    this.preview.add(new THREE.HemisphereLight('#fff1c8', '#2a3228', 1.8));
    const key = new THREE.DirectionalLight('#ffffff', 2.2);
    key.position.set(2, 3, 2);
    this.preview.add(key);
    this.previewCam.position.set(0.55, 0.35, 1.15);
    this.previewCam.lookAt(0, 0.05, 0);

    this.buildGrid();
    this.root.querySelectorAll<HTMLButtonElement>('[data-cat]').forEach((b) =>
      b.addEventListener('click', () => {
        this.filter = b.dataset.cat as typeof this.filter;
        this.refreshTray();
      }),
    );
    q(this.root, '.gb-close').addEventListener('click', () => this.setOpen(false));
    this.takeBtn.addEventListener('click', () => this.takeGun());
    q(this.root, '.gb-save').addEventListener('click', () => this.savePrint());
    this.gridEl.addEventListener('pointerdown', this.onGridDown);
    this.trayEl.addEventListener('pointerdown', this.onTrayDown);
    window.addEventListener('pointermove', this.onMove);
    window.addEventListener('pointerup', this.onUp);
    this.inv.onChange(() => {
      if (this.open) this.refreshTray();
    });
  }

  get isOpen(): boolean {
    return this.open;
  }

  setOpen(open: boolean): void {
    if (open === this.open) return;
    if (!open) this.returnParts();
    this.open = open;
    this.root.classList.toggle('open', open);
    this.root.inert = !open;
    if (open) {
      this.filter = 'all';
      this.nameInput.value = '';
      this.refreshAll();
    } else {
      this.cancelDrag();
    }
  }

  update(dt: number): void {
    if (!this.open) return;
    this.previewSpin += dt * 0.7;
    if (this.previewGun) this.previewGun.rotation.y = this.previewSpin;
    this.previewRenderer.render(this.preview, this.previewCam);
  }

  private buildGrid(): void {
    this.gridEl.style.gridTemplateColumns = `repeat(${GUN_GRID.cols}, 1fr)`;
    this.gridEl.style.gridTemplateRows = `repeat(${GUN_GRID.rows}, 1fr)`;
    for (let y = GUN_GRID.rows - 1; y >= 0; y--) {
      for (let x = 0; x < GUN_GRID.cols; x++) {
        const cell = el('div', 'gb-cell');
        cell.dataset.x = String(x);
        cell.dataset.y = String(y);
        this.gridEl.appendChild(cell);
      }
    }
  }

  private refreshAll(): void {
    this.refreshTray();
    this.refreshGrid();
    this.refreshStats();
    this.refreshPrints();
  }

  private refreshTray(): void {
    this.root.querySelectorAll<HTMLButtonElement>('[data-cat]').forEach((b) =>
      b.classList.toggle('active', b.dataset.cat === this.filter),
    );
    const chips: string[] = [];
    if (this.filter === 'guns') {
      this.inv.slots.forEach((s, i) => {
        if (!s?.gun) return;
        chips.push(this.trayChip(i, s.item, s.qty, stackIcon(s, this.icons), s.gun.name, 'gun'));
      });
    } else {
      for (const id of ALL_GUN_PART_IDS) {
        const def = GUN_PARTS[id];
        if (this.filter !== 'all' && def.category !== this.filter) continue;
        const n = this.inv.count(id);
        if (n <= 0) continue;
        chips.push(this.trayChip(-1, id, n, this.icons[id] ?? '', def.name, def.category));
      }
    }
    this.trayEl.innerHTML = chips.length ? chips.join('') : '<div class="queue-empty">NOTHING HERE</div>';
  }

  private trayChip(slot: number, item: ItemId, qty: number, icon: string, name: string, kind: string): string {
    const def: ItemDef = ITEMS[item];
    return `<div class="gb-chip" data-item="${item}" data-slot="${slot}" data-kind="${kind}" title="${name}">
      <span class="gb-chip-icon" style="background-image:url(${icon})"></span>
      <span class="gb-chip-name">${name.toUpperCase()}</span>
      ${qty > 1 ? `<b>${qty}</b>` : ''}
      <i style="background:${def.color}"></i>
    </div>`;
  }

  private refreshGrid(): void {
    this.gridEl.querySelectorAll('.gb-part').forEach((n) => n.remove());
    for (const p of this.parts) {
      const def = gunPart(p.part);
      if (!def) continue;
      const node = el('div', `gb-part rarity-${def.rarity}`);
      node.dataset.uid = String(p.uid);
      node.style.gridColumn = `${p.x + 1} / span ${def.w}`;
      node.style.gridRow = `${GUN_GRID.rows - p.y - def.h + 1} / span ${def.h}`;
      node.style.setProperty('--c', RARITY_COLOR[def.rarity]);
      node.innerHTML = `<span>${CATEGORY_LABEL[def.category]}</span>`;
      this.gridEl.appendChild(node);
    }
    this.paintHover();
  }

  private refreshStats(): void {
    const ev = evaluateBuild(this.parts);
    const sig = `${this.parts.map((p) => `${p.part}:${p.x}:${p.y}`).join('|')}|${this.hover?.x},${this.hover?.y},${this.drag?.part}`;
    if (sig === this.lastEval && !this.drag) {
      this.takeBtn.disabled = !ev.ok;
      return;
    }
    this.lastEval = sig;

    const ghost = this.ghostEval();
    const stats = ghost?.stats ?? ev.stats;
    const base = ev.stats;
    this.statsEl.innerHTML = STAT_BARS.map((bar) => {
      const v = Number(stats[bar.key]);
      const old = Number(base[bar.key]);
      const delta = ghost && this.drag ? v - old : 0;
      const shown = bar.format ? bar.format(v) : v.toFixed(bar.key === 'heat' ? 2 : 0);
      const up = delta > 0.02;
      const down = delta < -0.02;
      const good = bar.better === 'high' ? up : down;
      const bad = bar.better === 'high' ? down : up;
      return `<div class="gb-bar ${good ? 'up' : ''} ${bad ? 'down' : ''}">
        <span class="gb-bar-l">${bar.label}</span>
        <span class="gb-bar-track"><i style="width:${Math.min(100, (v / bar.max) * 100)}%"></i></span>
        <span class="gb-bar-v">${bar.key === 'fireMode' ? '' : shown}</span>
      </div>`;
    }).join('');

    const mode = ghost?.stats.fireMode ?? ev.stats.fireMode;
    this.modeEl.textContent = ev.reason || (this.parts.length === 0 ? 'DROP A RECEIVER' : mode.toUpperCase());
    this.modeEl.dataset.ok = String(ev.ok);

    const notes: GunNote[] = (ghost?.notes ?? ev.notes).slice(0, 8);
    this.notesEl.innerHTML = notes.length
      ? notes.map((n) => `<div class="gb-note ${n.kind}">${n.text}</div>`).join('')
      : '<div class="gb-note">Start with a receiver. Everything has to touch it.</div>';

    this.takeBtn.disabled = !ev.ok;
    if (!this.nameInput.value && ev.ok) this.nameInput.placeholder = gunNameFromParts(this.parts);
    this.refreshPreview();
  }

  private ghostEval(): ReturnType<typeof evaluateBuild> | null {
    if (!this.drag || !this.hover) return null;
    const ignore = this.drag.fromGrid ? this.drag.uid : -1;
    const check = canPlace(this.parts, this.drag.part, this.hover.x, this.hover.y, ignore);
    if (!check.ok) return null;
    const next = this.parts.filter((p) => p.uid !== ignore);
    next.push({ uid: -3, part: this.drag.part, x: this.hover.x, y: this.hover.y });
    return evaluateBuild(next);
  }

  private refreshPreview(): void {
    if (this.previewGun) {
      this.preview.remove(this.previewGun);
      this.previewGun = null;
    }
    if (this.parts.length === 0) return;
    const gun = assembleGun(this.parts);
    const box = new THREE.Box3().setFromObject(gun);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);
    gun.position.sub(center);
    this.preview.add(gun);
    this.previewGun = gun;
    const radius = Math.max(0.15, size.length() / 2);
    this.previewCam.position.copy(new THREE.Vector3(0.7, 0.4, 1.1).normalize().multiplyScalar(radius * 2.4));
    this.previewCam.lookAt(0, 0, 0);
  }

  private refreshPrints(): void {
    const list = loadBlueprints();
    q(this.root, '.gb-prints').innerHTML = list.length
      ? list
          .map(
            (b, i) =>
              `<button type="button" class="gb-print" data-bp="${i}">${b.name.toUpperCase()}<span>LOAD</span></button>`,
          )
          .join('')
      : '';
    q(this.root, '.gb-prints').querySelectorAll<HTMLButtonElement>('[data-bp]').forEach((b) =>
      b.addEventListener('click', () => this.loadPrint(Number(b.dataset.bp))),
    );
  }

  private paintHover(): void {
    this.gridEl.querySelectorAll('.gb-cell').forEach((c) => c.classList.remove('ok', 'bad', 'cover'));
    if (!this.drag || !this.hover) return;
    const def = gunPart(this.drag.part);
    if (!def) return;
    const check = canPlace(this.parts, this.drag.part, this.hover.x, this.hover.y, this.drag.fromGrid ? this.drag.uid : -1);
    for (let x = 0; x < def.w; x++) {
      for (let y = 0; y < def.h; y++) {
        const cell = this.cellAt(this.hover.x + x, this.hover.y + y);
        if (!cell) continue;
        cell.classList.add('cover', check.ok ? 'ok' : 'bad');
      }
    }
  }

  private cellAt(x: number, y: number): HTMLElement | null {
    return this.gridEl.querySelector(`.gb-cell[data-x="${x}"][data-y="${y}"]`);
  }

  private cellFromPoint(clientX: number, clientY: number): { x: number; y: number } | null {
    const r = this.gridEl.getBoundingClientRect();
    if (clientX < r.left || clientY < r.top || clientX > r.right || clientY > r.bottom) return null;
    const x = Math.floor(((clientX - r.left) / r.width) * GUN_GRID.cols);
    const yFromTop = Math.floor(((clientY - r.top) / r.height) * GUN_GRID.rows);
    const y = GUN_GRID.rows - 1 - yFromTop;
    if (x < 0 || y < 0 || x >= GUN_GRID.cols || y >= GUN_GRID.rows) return null;
    return { x, y };
  }

  private onTrayDown = (e: PointerEvent): void => {
    if (!this.open || e.button !== 0) return;
    const chip = (e.target as Element).closest<HTMLElement>('.gb-chip');
    if (!chip) return;
    const item = chip.dataset.item as ItemId;
    if (chip.dataset.kind === 'gun') {
      const slot = Number(chip.dataset.slot);
      this.loadGun(slot);
      return;
    }
    if (this.inv.count(item) <= 0) return;
    this.drag = { part: item, uid: -1, fromGrid: false };
    this.ghost.style.backgroundImage = `url(${this.icons[item] ?? ''})`;
    this.ghost.classList.add('on');
    this.moveGhost(e);
  };

  private onGridDown = (e: PointerEvent): void => {
    if (!this.open || e.button !== 0) return;
    const partEl = (e.target as Element).closest<HTMLElement>('.gb-part');
    if (!partEl) return;
    const placed = this.parts.find((p) => p.uid === Number(partEl.dataset.uid));
    if (!placed) return;
    this.drag = { part: placed.part, uid: placed.uid, fromGrid: true };
    this.ghost.style.backgroundImage = `url(${this.icons[placed.part] ?? ''})`;
    this.ghost.classList.add('on');
    this.moveGhost(e);
  };

  private onMove = (e: PointerEvent): void => {
    if (!this.drag) return;
    this.moveGhost(e);
    this.hover = this.cellFromPoint(e.clientX, e.clientY);
    this.paintHover();
    this.refreshStats();
  };

  private onUp = (e: PointerEvent): void => {
    const drag = this.drag;
    if (!drag) return;
    const cell = this.cellFromPoint(e.clientX, e.clientY);
    const overGrid = !!cell && this.root.contains(document.elementFromPoint(e.clientX, e.clientY));
    if (cell && overGrid) {
      const ignore = drag.fromGrid ? drag.uid : -1;
      const check = canPlace(this.parts, drag.part, cell.x, cell.y, ignore);
      if (check.ok) {
        if (drag.fromGrid) {
          const p = this.parts.find((x) => x.uid === drag.uid);
          if (p) {
            p.x = cell.x;
            p.y = cell.y;
          }
        } else if (this.inv.remove(drag.part as ItemId, 1) === 1) {
          this.parts.push({ uid: nextPartUid(), part: drag.part, x: cell.x, y: cell.y });
        }
      } else if (!drag.fromGrid) {
        events.emit('toast', { text: check.reason, tone: 'warn' });
      }
    } else if (drag.fromGrid) {
      const p = this.parts.find((x) => x.uid === drag.uid);
      if (p) {
        this.parts = this.parts.filter((x) => x.uid !== p.uid);
        this.inv.add(p.part as ItemId, 1);
      }
    }
    this.cancelDrag();
    this.refreshAll();
  };

  private cancelDrag(): void {
    this.drag = null;
    this.hover = null;
    this.ghost.classList.remove('on');
    this.paintHover();
  }

  private moveGhost(e: PointerEvent): void {
    this.ghost.style.transform = `translate(${e.clientX - 32}px, ${e.clientY - 32}px)`;
  }

  private takeGun(): void {
    const ev = evaluateBuild(this.parts);
    if (!ev.ok) {
      events.emit('toast', { text: ev.reason, tone: 'warn' });
      return;
    }
    const name = this.nameInput.value.trim() || gunNameFromParts(this.parts);
    const gun = makeGun(this.parts, name);
    if (this.inv.add('craftedGun', 1, gun) > 0) {
      events.emit('toast', { text: 'No room in your backpack.', tone: 'warn' });
      return;
    }
    this.parts = [];
    this.nameInput.value = '';
    this.refreshAll();
    events.emit('gun:assembled', {
      name,
      parts: gun.parts.length,
      damage: ev.stats.damage,
      mode: ev.stats.fireMode,
      power: gunPower(ev.stats),
    });
    events.emit('toast', { text: `${name.toUpperCase()} is live. Point it at something that deserves it.`, tone: 'info' });
  }

  private loadGun(slot: number): void {
    const s = this.inv.slots[slot];
    if (!s?.gun) return;
    if (this.parts.length) this.returnParts();
    this.parts = s.gun.parts.map((p) => ({ uid: nextPartUid(), part: p.part, x: p.x, y: p.y }));
    this.nameInput.value = s.gun.name;
    this.inv.removeAt(slot, 1);
    this.refreshAll();
    events.emit('toast', { text: `${s.gun.name.toUpperCase()} on the bench.`, tone: 'info' });
  }

  private savePrint(): void {
    if (this.parts.length === 0) return;
    const name = this.nameInput.value.trim() || gunNameFromParts(this.parts);
    const list = loadBlueprints();
    list.unshift({ name, parts: this.parts.map((p) => ({ part: p.part, x: p.x, y: p.y })) });
    saveBlueprints(list);
    this.refreshPrints();
    events.emit('toast', { text: `Blueprint "${name}" saved.`, tone: 'info' });
  }

  private loadPrint(i: number): void {
    const bp = loadBlueprints()[i];
    if (!bp) return;
    const need = new Map<string, number>();
    for (const p of bp.parts) need.set(p.part, (need.get(p.part) ?? 0) + 1);
    for (const [id, n] of need) {
      if (this.inv.count(id as ItemId) < n) {
        events.emit('toast', { text: `Missing ${(ITEMS[id as ItemId] as ItemDef).name}.`, tone: 'warn' });
        return;
      }
    }
    if (this.parts.length) this.returnParts();
    for (const p of bp.parts) this.inv.remove(p.part as ItemId, 1);
    this.parts = bp.parts.map((p) => ({ uid: nextPartUid(), part: p.part, x: p.x, y: p.y }));
    this.nameInput.value = bp.name;
    this.refreshAll();
  }

  private returnParts(): void {
    for (const p of this.parts) this.inv.add(p.part as ItemId, 1);
    this.parts = [];
  }
}
