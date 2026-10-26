import { evaluateBuild, formatStatDelta, isGunPart, planGunMod } from '../data/guns';
import { gunPower } from '../data/score';
import { ITEMS, type ItemDef } from '../data/items';
import type { Inventory, Stack } from '../gameplay/Inventory';
import { events } from '../core/EventBus';
import { el, q } from './dom';
import { stackIcon } from './IconRenderer';

type Icons = Record<string, string>;

function fillSlot(node: HTMLElement, stack: Stack | null, icons: Icons): void {
  const parts = stack?.gun?.parts.map((p) => p.part).join(',') ?? '';
  const key = stack ? `${stack.item}:${stack.qty}:${stack.gun?.id ?? ''}:${stack.gun?.loaded ?? ''}:${parts}` : '';
  if (node.dataset.key === key) return;
  node.dataset.key = key;
  node.classList.toggle('empty', !stack);
  const icon = q(node, '.slot-icon');
  const qty = q(node, '.slot-qty');
  icon.style.backgroundImage = stack ? `url(${stackIcon(stack, icons)})` : 'none';
  qty.textContent = stack && stack.qty > 1 ? String(stack.qty) : '';
}

function slotNode(index: number, label?: string): HTMLElement {
  const node = el('div', 'slot empty');
  node.dataset.index = String(index);
  node.innerHTML = `<span class="slot-icon"></span><span class="slot-qty"></span>${label ? `<span class="slot-key">${label}</span>` : ''}`;
  return node;
}

function describe(def: ItemDef, stack?: Stack | null): string {
  const lines: string[] = [];
  if (stack?.gun) {
    const s = evaluateBuild(stack.gun.parts).stats;
    lines.push(`<span class="tt-stat">${s.fireMode.toUpperCase()} · ${Math.round(s.damage)} DMG · ${s.magSize} MAG</span>`);
    lines.push(`<span class="tt-stat">${stack.gun.loaded}/${s.magSize} LOADED</span>`);
  }
  if (def.tool?.kind === 'hammer') lines.push('<span class="tt-stat">REPAIR · UPGRADE · 5× SCRAP</span>');
  if (def.tool?.kind === 'axe' || def.tool?.kind === 'pickaxe') lines.push('<span class="tt-stat">GATHER · 5× SCRAP BUILDS</span>');
  else if (def.tool) lines.push(`<span class="tt-stat">${def.tool.kind.toUpperCase()} · POWER ${def.tool.power} · ${(1 / def.tool.swingTime).toFixed(1)} SWINGS/S</span>`);
  if (def.consumable?.heal) lines.push(`<span class="tt-stat">${def.consumable.heal > 0 ? '+' : ''}${def.consumable.heal} HEALTH</span>`);
  if (def.consumable?.filter) lines.push(`<span class="tt-stat">+${def.consumable.filter} FILTER</span>`);
  if (def.consumable?.buff) {
    const b = def.consumable.buff;
    lines.push(`<span class="tt-stat">${b.label} · ${b.duration}s</span>`);
    lines.push(`<span class="tt-stat">${b.effects.join(' · ')}</span>`);
  }
  return lines.join('');
}

/** The always-visible hotbar at the bottom of the screen. */
export class HotbarView {
  private readonly root: HTMLDivElement;
  private readonly slots: HTMLElement[] = [];
  private readonly nameTag: HTMLElement;
  private nameTimer = 0;
  private lastSelected = '';

  constructor(parent: HTMLElement, private readonly inv: Inventory, private readonly icons: Icons) {
    this.root = el('div', 'hotbar');
    this.nameTag = el('div', 'hotbar-name');
    this.root.appendChild(this.nameTag);
    const row = el('div', 'hotbar-row');
    for (let i = 0; i < inv.hotbarSize; i++) {
      const s = slotNode(i, String(i + 1));
      this.slots.push(s);
      row.appendChild(s);
    }
    this.root.appendChild(row);
    parent.appendChild(this.root);
    inv.onChange(() => this.refresh());
    this.refresh();
  }

  refresh(): void {
    this.slots.forEach((s, i) => {
      fillSlot(s, this.inv.slots[i], this.icons);
      s.classList.toggle('selected', i === this.inv.selected);
    });
    const st = this.inv.selectedStack;
    const key = `${this.inv.selected}:${st?.item ?? ''}`;
    if (key !== this.lastSelected) {
      this.lastSelected = key;
      this.nameTag.textContent = st?.gun ? st.gun.name.toUpperCase() : st ? (ITEMS[st.item] as ItemDef).name.toUpperCase() : 'BARE HANDS';
      this.nameTag.classList.remove('show');
      void this.nameTag.offsetWidth;
      this.nameTag.classList.add('show');
      window.clearTimeout(this.nameTimer);
      this.nameTimer = window.setTimeout(() => this.nameTag.classList.remove('show'), 1400);
    }
  }
}

interface SlotRef {
  inv: Inventory;
  i: number;
}

interface OpenContainer {
  inv: Inventory;
  slots: HTMLElement[];
  off: () => void;
}

/**
 * Backpack panel: drag and drop, shift-click to move, right-click to use. While a storage box is
 * open its slots join in: drag between them, or shift/right-click to send a stack across.
 */
export class InventoryView {
  private readonly root: HTMLDivElement;
  private readonly slots: HTMLElement[] = [];
  private readonly tooltip: HTMLElement;
  private readonly ghost: HTMLElement;
  private readonly hint: HTMLElement;
  private dragFrom: SlotRef | null = null;
  private container: OpenContainer | null = null;
  private acceptInto: ((stack: Stack) => boolean) | null = null;
  private isOpen = false;

  constructor(
    parent: HTMLElement,
    private readonly inv: Inventory,
    private readonly icons: Icons,
    private readonly onUse: (index: number) => void,
  ) {
    this.root = el('div', 'inventory');
    this.root.dataset.uiCapture = '';
    this.root.innerHTML = `
      <div class="inv-layout">
        <div class="inv-panel">
          <div class="inv-header"><span class="inv-title">BACKPACK</span><span class="inv-hint"></span></div>
          <div class="inv-grid backpack"></div>
          <div class="inv-sub">HOTBAR</div>
          <div class="inv-grid hotbar-grid"></div>
        </div>
        <div class="inv-side"></div>
      </div>
      <div class="inv-tooltip"></div>
    `;
    parent.appendChild(this.root);
    this.root.inert = true;
    const backpack = q(this.root, '.backpack');
    const hotbar = q(this.root, '.hotbar-grid');
    for (let i = 0; i < inv.size; i++) {
      const s = slotNode(i, i < inv.hotbarSize ? String(i + 1) : undefined);
      this.slots.push(s);
      (i < inv.hotbarSize ? hotbar : backpack).appendChild(s);
    }
    this.tooltip = q(this.root, '.inv-tooltip');
    this.hint = q(this.root, '.inv-hint');
    this.ghost = el('div', 'drag-ghost');
    this.root.appendChild(this.ghost);
    this.updateHint();

    this.root.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    this.root.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const ref = this.slotAt(e.target);
      if (!ref) return;
      if (this.container) this.sendAcross(ref);
      else this.onUse(ref.i);
    });
    this.root.addEventListener('pointerover', (e) => this.showTooltip(this.slotAt(e.target)));
    this.root.addEventListener('pointerleave', () => this.showTooltip(null));

    inv.onChange(() => {
      if (this.isOpen) this.refresh();
    });
  }

  get open(): boolean {
    return this.isOpen;
  }

  /** Container to the right of the backpack, where the crafting, oven or storage panel lives. */
  get side(): HTMLElement {
    return q(this.root, '.inv-side');
  }

  setOpen(open: boolean): void {
    this.isOpen = open;
    this.root.classList.toggle('open', open);
    this.root.inert = !open;
    if (open) this.refresh();
    else {
      this.cancelDrag();
      this.showTooltip(null);
    }
  }

  /** Shows a storage container's slots inside `grid` (or removes them with null). */
  setContainer(inv: Inventory | null, grid?: HTMLElement, accept?: (stack: Stack) => boolean): void {
    this.cancelDrag();
    this.acceptInto = accept ?? null;
    if (this.container) {
      this.container.off();
      for (const s of this.container.slots) s.remove();
      this.container = null;
    }
    if (inv && grid) {
      const slots: HTMLElement[] = [];
      for (let i = 0; i < inv.size; i++) {
        const s = slotNode(i);
        s.dataset.container = '1';
        slots.push(s);
        grid.appendChild(s);
      }
      const off = inv.onChange(() => {
        if (this.isOpen) this.refresh();
      });
      this.container = { inv, slots, off };
    }
    this.updateHint();
    if (this.isOpen) this.refresh();
  }

  private updateHint(): void {
    this.hint.textContent = this.container
      ? 'DRAG BETWEEN BAGS · SHIFT- OR RIGHT-CLICK TO SEND ACROSS'
      : 'DRAG TO MOVE · DROP A PART ON A GUN TO MOD · SHIFT-CLICK HOTBAR · RIGHT-CLICK USE';
  }

  private refresh(): void {
    this.slots.forEach((s, i) => {
      fillSlot(s, this.inv.slots[i], this.icons);
      s.classList.toggle('selected', i === this.inv.selected);
    });
    const c = this.container;
    if (c) c.slots.forEach((s, i) => fillSlot(s, c.inv.slots[i], this.icons));
  }

  private slotAt(target: EventTarget | Element | null): SlotRef | null {
    const slot = target instanceof Element ? (target.closest('.slot') as HTMLElement | null) : null;
    if (!slot || !this.root.contains(slot)) return null;
    const i = Number(slot.dataset.index);
    if (slot.dataset.container) return this.container ? { inv: this.container.inv, i } : null;
    return { inv: this.inv, i };
  }

  private nodeOf(ref: SlotRef): HTMLElement | undefined {
    return ref.inv === this.inv ? this.slots[ref.i] : this.container?.slots[ref.i];
  }

  private allowedInto(to: Inventory, stack: Stack | null): boolean {
    if (!stack) return false;
    if (to === this.inv || !this.acceptInto) return true;
    return this.acceptInto(stack);
  }

  /** Shift/right-click with a box open: moves the stack to the other side. */
  private sendAcross(ref: SlotRef): void {
    const c = this.container;
    if (!c) return;
    const to = ref.inv === this.inv ? c.inv : this.inv;
    const stack = ref.inv.slots[ref.i];
    if (!this.allowedInto(to, stack)) {
      events.emit('toast', { text: 'That does not go in here.', tone: 'warn' });
      return;
    }
    if (!ref.inv.transfer(ref.i, to)) this.flashFull(to);
  }

  private flashFull(target: Inventory): void {
    const nodes = target === this.inv ? this.slots : this.container?.slots;
    nodes?.forEach((n) => {
      n.classList.remove('full-flash');
      void n.offsetWidth;
      n.classList.add('full-flash');
    });
  }

  private showTooltip(ref: SlotRef | null): void {
    const st = ref ? ref.inv.slots[ref.i] : null;
    const node = ref ? this.nodeOf(ref) : undefined;
    if (!st || !node) {
      this.tooltip.classList.remove('on');
      return;
    }
    const def: ItemDef = ITEMS[st.item];
    const title = st.gun ? st.gun.name.toUpperCase() : def.name.toUpperCase();
    this.tooltip.innerHTML = `<div class="tt-name" style="--c:${def.color}">${title}</div><div class="tt-kind">${st.gun ? 'gun · drag parts onto it to mod' : def.kind}</div>${describe(def, st)}<p>${def.description}</p>`;
    const r = node.getBoundingClientRect();
    const right = r.right + 12 + 270 < window.innerWidth;
    this.tooltip.style.left = right ? `${r.right + 12}px` : `${r.left - 12 - 270}px`;
    this.tooltip.style.top = `${r.top}px`;
    this.tooltip.classList.add('on');
  }

  private onPointerDown = (e: PointerEvent): void => {
    if (!this.isOpen || e.button !== 0) return;
    const ref = this.slotAt(e.target);
    if (!ref || !ref.inv.slots[ref.i]) return;
    if (e.shiftKey) {
      if (this.container) this.sendAcross(ref);
      else this.inv.quickMove(ref.i);
      return;
    }
    this.dragFrom = ref;
    this.ghost.style.backgroundImage = `url(${stackIcon(ref.inv.slots[ref.i]!, this.icons)})`;
    this.moveGhost(e);
    this.ghost.classList.add('on');
    this.nodeOf(ref)?.classList.add('dragging');
  };

  private onPointerMove = (e: PointerEvent): void => {
    if (!this.dragFrom) return;
    this.moveGhost(e);
    this.showModPreview(this.dragFrom, this.slotAt(document.elementFromPoint(e.clientX, e.clientY)));
  };

  private onPointerUp = (e: PointerEvent): void => {
    const from = this.dragFrom;
    if (!from) return;
    const to = this.slotAt(document.elementFromPoint(e.clientX, e.clientY));
    this.cancelDrag();
    if (!to) return;

    // Part → gun in the same bag: mount / upgrade-swap instead of swapping stacks.
    if (to.inv === from.inv) {
      const mod = from.inv.tryModGun(from.i, to.i);
      if (mod.handled) {
        if (!mod.ok) events.emit('toast', { text: mod.reason || "That part won't fit.", tone: 'warn' });
        else {
          events.emit('toast', {
            text: mod.buff ? `Mod fitted · ${mod.buff}` : 'Mod fitted.',
            tone: 'toxic',
          });
          const g = to.inv.slots[to.i]?.gun;
          if (g) {
            const built = evaluateBuild(g.parts);
            events.emit('gun:assembled', {
              name: g.name,
              parts: g.parts.length,
              damage: built.stats.damage,
              mode: built.stats.fireMode,
              power: gunPower(built.stats),
            });
          }
        }
        return;
      }
      from.inv.move(from.i, to.i);
      return;
    }

    if (!this.allowedInto(to.inv, from.inv.slots[from.i])) {
      events.emit('toast', { text: 'That does not go in here.', tone: 'warn' });
    } else from.inv.transfer(from.i, to.inv, to.i);
  };

  private cancelDrag(): void {
    if (this.dragFrom) this.nodeOf(this.dragFrom)?.classList.remove('dragging');
    this.dragFrom = null;
    this.ghost.classList.remove('on');
    this.tooltip.classList.remove('on');
  }

  private moveGhost(e: PointerEvent): void {
    this.ghost.style.transform = `translate(${e.clientX - 32}px, ${e.clientY - 32}px)`;
  }

  /** While dragging a part over a gun, show whether it fits and the projected stat buff. */
  private showModPreview(from: SlotRef, to: SlotRef | null): void {
    const part = from.inv.slots[from.i];
    const gun = to && to.inv === from.inv && to.i !== from.i ? to.inv.slots[to.i] : null;
    const node = to ? this.nodeOf(to) : undefined;
    if (!part || !gun?.gun || !node || !isGunPart(part.item)) {
      this.tooltip.classList.remove('on');
      return;
    }

    const plan = planGunMod(gun.gun, part.item);
    const partDef = ITEMS[part.item] as ItemDef;
    const buff = plan.ok ? formatStatDelta(plan.before, plan.after) : '';
    const status = plan.ok
      ? `<span class="tt-stat tt-buff">${buff || 'NO STAT CHANGE'}</span>`
      : `<span class="tt-stat tt-bad">${plan.reason}</span>`;
    this.tooltip.innerHTML =
      `<div class="tt-name" style="--c:${partDef.color}">${partDef.name.toUpperCase()}</div>` +
      `<div class="tt-kind">onto ${gun.gun.name.toUpperCase()}</div>${status}`;
    const r = node.getBoundingClientRect();
    const right = r.right + 12 + 270 < window.innerWidth;
    this.tooltip.style.left = right ? `${r.right + 12}px` : `${r.left - 12 - 270}px`;
    this.tooltip.style.top = `${r.top}px`;
    this.tooltip.classList.add('on');
  }
}
