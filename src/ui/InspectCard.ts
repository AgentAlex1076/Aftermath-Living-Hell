import { ITEMS, type ItemDef, type ItemId } from '../data/items';
import { PIECES, type PieceDef, type PieceId } from '../data/buildables';
import type { Inventory } from '../gameplay/Inventory';
import { el } from './dom';

type Icons = Record<string, string>;

function iconUrl(icons: Icons, key: string): string {
  return icons[key] ? `url(${icons[key]})` : 'none';
}

function place(card: HTMLElement, around: DOMRect): void {
  const w = 300;
  const right = around.right + 14 + w < window.innerWidth;
  card.style.left = right ? `${around.right + 14}px` : `${Math.max(12, around.left - 14 - w)}px`;
  card.style.top = `${Math.max(12, Math.min(around.top, window.innerHeight - 220))}px`;
}

function itemBody(def: ItemDef, icons: Icons, have?: number, need?: number): string {
  const compare =
    need !== undefined
      ? `<div class="insp-need ${have !== undefined && have >= need ? 'ok' : 'short'}">HAVE ${have ?? 0} <span>/</span> NEED ${need}</div>`
      : '';
  return `
    <span class="insp-icon" style="background-image:${iconUrl(icons, def.id)}"></span>
    <div class="insp-copy">
      <div class="insp-name" style="--c:${def.color}">${def.name.toUpperCase()}</div>
      <div class="insp-kind">${def.kind}</div>
      <p>${def.description}</p>
      ${compare}
    </div>`;
}

function pieceBody(def: PieceDef, icons: Icons, inv: Inventory): string {
  const cost = def.cost ?? [];
  const chips = cost
    .map((a) => {
      const have = inv.count(a.item);
      const ok = have >= a.qty;
      const item = ITEMS[a.item] as ItemDef;
      return `<span class="insp-need ${ok ? 'ok' : 'short'}">${item.name.toUpperCase()} · ${have}/${a.qty}</span>`;
    })
    .join('');
  return `
    <span class="insp-icon" style="background-image:${iconUrl(icons, `build:${def.id}`)}"></span>
    <div class="insp-copy">
      <div class="insp-name">${def.name.toUpperCase()}</div>
      <div class="insp-kind">${def.tab} · ${def.kind}</div>
      <p>${def.description}</p>
      ${chips}
    </div>`;
}

/** Floating inspection card for recipe chips, craft rows and build pieces. */
export class InspectCard {
  private readonly card: HTMLDivElement;

  constructor(
    parent: HTMLElement,
    private readonly icons: Icons,
    private readonly inv: Inventory,
  ) {
    this.card = el('div', 'inspect-card');
    parent.appendChild(this.card);
  }

  attach(root: HTMLElement): void {
    root.addEventListener('pointerover', (e) => this.show(e.target as Element | null));
    root.addEventListener('pointerout', (e) => {
      const next = (e as PointerEvent).relatedTarget;
      if (next instanceof Node && root.contains(next)) return;
      this.hide();
    });
  }

  show(target: Element | null): void {
    const host = target?.closest<HTMLElement>('[data-inspect], [data-inspect-piece], [data-inspect-station]');
    if (!host) {
      this.hide();
      return;
    }
    if (host.dataset.inspectStation) {
      this.card.innerHTML = `
        <span class="insp-icon"></span>
        <div class="insp-copy">
          <div class="insp-name">CRAFTING TABLE</div>
          <div class="insp-kind">workbench</div>
          <p>Stand at the table in the hut to unlock workbench recipes. Hands-only crafts still work out in the yard.</p>
        </div>`;
    } else if (host.dataset.inspectPiece) {
      const def: PieceDef | undefined = PIECES[host.dataset.inspectPiece as PieceId];
      if (!def) {
        this.hide();
        return;
      }
      this.card.innerHTML = pieceBody(def, this.icons, this.inv);
    } else {
      const id = host.dataset.inspect as ItemId;
      const def: ItemDef | undefined = ITEMS[id];
      if (!def) {
        this.hide();
        return;
      }
      const need = host.dataset.need !== undefined ? Number(host.dataset.need) : undefined;
      this.card.innerHTML = itemBody(def, this.icons, this.inv.count(id), need);
    }
    place(this.card, host.getBoundingClientRect());
    this.card.classList.add('on');
  }

  hide(): void {
    this.card.classList.remove('on');
  }
}
