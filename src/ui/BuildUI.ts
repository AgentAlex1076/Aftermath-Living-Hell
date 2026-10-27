import { CONFIG } from '../data/config';
import { BUILD_TABS, PIECES, TIERS, nextTier, pieceCost, type PieceDef, type PieceId } from '../data/buildables';
import type { ToolKind } from '../data/items';
import type { ItemAmount } from '../data/loot';
import type { Inventory } from '../gameplay/Inventory';
import type { Building, Piece, Placement } from '../gameplay/Building';
import { el, q } from './dom';
import { InspectCard } from './InspectCard';

type Icons = Record<string, string>;

/** Key under which a build piece's icon is stored. */
export const pieceIconKey = (id: string) => `build:${id}`;

/** Build mode bar, placement tag at the cursor, and the hammer's piece card. */
export class BuildUI {
  private readonly mode: HTMLElement;
  private readonly bar: HTMLElement;
  private readonly desc: HTMLElement;
  private readonly tabs: HTMLElement;
  private readonly cursorTag: HTMLElement;
  private readonly card: HTMLElement;
  private barKey = '';
  private cursorKey = '';
  private cardKey = '';
  private readonly inspect: InspectCard;

  constructor(
    parent: HTMLElement,
    private readonly building: Building,
    private readonly inv: Inventory,
    private readonly icons: Icons,
    onTab: (i: number) => void,
  ) {
    this.mode = el('div', 'build-mode');
    this.mode.innerHTML = `
      <div class="build-banner">
        <span class="bm-title">BUILD MODE</span>
        <span class="bm-hint"><kbd>LMB</kbd> PLACE <kbd>R</kbd> ROTATE <kbd>Q</kbd> TAB <kbd>1–7</kbd> PIECE <kbd>B</kbd> EXIT</span>
      </div>
      <div class="bm-tabs">${BUILD_TABS.map((t, i) => `<button type="button" data-tab="${i}">${t.name.toUpperCase()}</button>`).join('')}</div>
      <div class="bm-desc"></div>
      <div class="build-bar"></div>
    `;
    this.bar = q(this.mode, '.build-bar');
    this.desc = q(this.mode, '.bm-desc');
    this.tabs = q(this.mode, '.bm-tabs');
    this.cursorTag = el('div', 'build-cursor');
    this.card = el('div', 'piece-card');
    parent.append(this.mode, this.cursorTag, this.card);
    this.inspect = new InspectCard(parent, icons, inv);
    this.inspect.attach(this.mode);
    this.tabs.addEventListener('click', (e) => {
      const btn = (e.target as Element).closest<HTMLButtonElement>('button[data-tab]');
      if (btn) onTab(Number(btn.dataset.tab));
    });
  }

  /** Cost chips (red when you can't afford them), or with `refund` the salvage you'd get back. */
  private chips(cost: readonly ItemAmount[], kind: 'cost' | 'refund' = 'cost'): string {
    return cost
      .map((a) => {
        const icon = this.icons[a.item] ? `style="background-image:url(${this.icons[a.item]})"` : '';
        if (kind === 'refund') return `<span class="chip refund"><i ${icon}></i>+${a.qty}</span>`;
        const ok = this.building.free || this.inv.count(a.item) >= a.qty;
        return `<span class="chip ${ok ? 'ok' : 'missing'}" data-inspect="${a.item}" data-need="${a.qty}"><i ${icon}></i>${a.qty}</span>`;
      })
      .join('');
  }

  /** Per frame while playing. `placement` is null outside build mode. */
  setBuild(active: boolean, tab: number, selected: number, placement: Placement | null, mouseX: number, mouseY: number): void {
    this.mode.classList.toggle('on', active);
    if (!active) {
      this.cursorTag.classList.remove('on');
      this.cursorKey = '';
      this.inspect.hide();
      return;
    }

    const ids = BUILD_TABS[tab].pieces;
    const counts = ids.flatMap((id) => pieceCost(PIECES[id], 'wood').map((a) => this.inv.count(a.item))).join(',');
    const key = `${tab}|${selected}|${counts}|${this.building.free}`;
    if (key !== this.barKey) {
      this.barKey = key;
      this.tabs.querySelectorAll<HTMLButtonElement>('button').forEach((b, i) => b.classList.toggle('on', i === tab));
      this.bar.innerHTML = ids.map((id: PieceId, i) => {
        const def: PieceDef = PIECES[id];
        const icon = this.icons[pieceIconKey(id)];
        return `
          <div class="bb-card ${i === selected ? 'selected' : ''}" data-inspect-piece="${id}">
            <span class="bb-key">${i + 1}</span>
            <span class="bb-icon" ${icon ? `style="background-image:url(${icon})"` : ''}></span>
            <span class="bb-name">${def.name.toUpperCase()}</span>
            <span class="bb-cost">${this.chips(pieceCost(def, 'wood'))}</span>
          </div>`;
      }).join('');
      const def: PieceDef = PIECES[ids[Math.min(selected, ids.length - 1)]];
      this.desc.textContent = def.description;
    }

    const tagKey = placement ? `${placement.ok}|${placement.reason}|${placement.def.id}` : '';
    if (tagKey !== this.cursorKey) {
      this.cursorKey = tagKey;
      if (placement) {
        this.cursorTag.dataset.ok = String(placement.ok);
        this.cursorTag.innerHTML = placement.ok ? `<b>PLACE</b> ${placement.def.name.toUpperCase()}` : placement.reason;
      }
      this.cursorTag.classList.toggle('on', !!placement);
    }
    this.cursorTag.style.transform = `translate(${mouseX + 26}px, ${mouseY + 14}px)`;
  }

  /** The piece under a scrap tool, with repair / upgrade / salvage readout. */
  setPieceCard(piece: Piece | null, demolishProgress: number, tool: ToolKind | null): void {
    this.card.classList.toggle('on', !!piece);
    if (!piece) {
      this.cardKey = '';
      return;
    }
    const b = this.building;
    const needed = CONFIG.building.demolishHits;
    const damaged = piece.hp < piece.maxHp - 0.5;
    const hammer = tool === 'hammer';
    const repair = damaged && hammer ? b.repairCost(piece) : [];
    const upgrade = hammer ? b.upgradeCost(piece) : null;
    const refund = b.refund(piece);
    const scrapLabel = hammer && damaged
      ? `SCRAP · ${needed} HITS AT FULL HP`
      : `SCRAP · ${needed} HITS (2s)`;
    const counts = [...repair, ...(upgrade ?? [])].map((a) => this.inv.count(a.item)).join(',');
    const key = `${piece.uid}|${piece.tier}|${Math.round(piece.hp)}|${counts}|${b.free}|${tool}|${Math.round(demolishProgress * needed)}`;
    if (key !== this.cardKey) {
      this.cardKey = key;
      const tier = TIERS[piece.tier];
      const tiered = piece.def.kind !== 'deployable';
      const next = nextTier(piece.tier);
      const nextName = next ? TIERS[next].name.toUpperCase() : '';
      this.card.style.setProperty('--tier', tier.color);
      this.card.innerHTML = `
        <div class="pc-head">
          <span class="pc-name">${piece.def.name.toUpperCase()}</span>
          ${tiered ? `<span class="pc-tier">${tier.name.toUpperCase()}</span>` : ''}
        </div>
        <div class="pc-hp"><div class="pc-hp-fill"></div><span>${Math.ceil(piece.hp)} / ${piece.maxHp} HP</span></div>
        ${hammer ? `<div class="pc-row"><kbd>LMB</kbd><span>${damaged ? 'REPAIR' : 'NOT DAMAGED'}</span><span class="pc-cost">${damaged ? this.chips(repair) : ''}</span></div>` : ''}
        ${hammer && tiered ? `<div class="pc-row"><kbd>R</kbd><span>${upgrade ? `UPGRADE → ${nextName}` : 'MAX TIER'}</span><span class="pc-cost">${upgrade ? this.chips(upgrade) : ''}</span></div>` : ''}
        <div class="pc-row pc-demolish"><kbd>LMB</kbd><span>${scrapLabel}</span><span class="pc-cost">${this.chips(refund, 'refund')}</span><i class="pc-fill"></i></div>
      `;
    }
    q(this.card, '.pc-hp-fill').style.transform = `scaleX(${Math.max(0, piece.hp / piece.maxHp)})`;
    q(this.card, '.pc-fill').style.transform = `scaleX(${demolishProgress})`;
  }
}
