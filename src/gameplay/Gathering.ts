import * as THREE from 'three';
import { CONFIG } from '../data/config';
import { events } from '../core/EventBus';
import { sfx } from '../audio/AudioEngine';
import { ITEMS, type ItemDef, type ItemId } from '../data/items';
import type { ItemAmount } from '../data/loot';
import type { Player } from '../entities/Player';
import type { Debris } from '../render/Debris';
import type { FloatingText } from '../ui/FloatingText';
import type { ContainerInstance, World } from '../world/World';
import type { Inventory } from './Inventory';

const TOOL_NAME = { axe: 'HATCHET', pickaxe: 'PICKAXE', crowbar: 'CROWBAR', hammer: 'HAMMER' } as const;
const NODE_SOUND: Record<string, string> = {
  deadTree: 'hit.wood', rock: 'hit.stone', rubble: 'hit.stone', scrapPile: 'hit.metal', car: 'hit.metal',
  barrel: 'hit.metal', toxicBarrel: 'hit.metal', carcass: 'hit.flesh',
};
const _p = new THREE.Vector3();

/** Swinging at resource nodes, searching containers and using consumables. */
export class Gathering {
  gathered = 0;
  searched = 0;
  private useCooldown = 0;
  private fullWarnCooldown = 0;

  constructor(
    private readonly world: World,
    private readonly inv: Inventory,
    private readonly player: Player,
    private readonly debris: Debris,
    private readonly floaters: FloatingText,
    private readonly eat: (amount: number) => void,
    /** The hammer works on building pieces, not resource nodes. */
    private readonly hammerHit: () => void,
    /** Melee against mutants. Returns true if the swing connected. */
    private readonly melee: () => boolean,
  ) {}

  /** Called every tick while the fire button is held. */
  update(dt: number, fireHeld: boolean): void {
    this.useCooldown = Math.max(0, this.useCooldown - dt);
    this.fullWarnCooldown = Math.max(0, this.fullWarnCooldown - dt);

    if (fireHeld && !this.player.swinging && this.player.state === 'normal') {
      const st = this.inv.selectedStack;
      if (st?.gun) return;
      const def: ItemDef | null = st ? ITEMS[st.item] : null;
      if (def?.consumable) {
        if (this.useCooldown <= 0) {
          this.useCooldown = 0.6;
          this.use(this.inv.selected);
        }
      } else {
        const tool = def?.tool ?? null;
        if (this.player.startSwing(tool ? tool.swingTime : CONFIG.gathering.handSwingTime, !!tool)) sfx('swing', { pitch: tool ? 0.85 : 1.15 });
      }
    }

    if (this.player.swingImpact) this.impact();
  }

  private impact(): void {
    if (this.melee()) return;
    const p = this.player;
    const g = CONFIG.gathering;
    const tool = this.inv.equippedTool;
    if (tool?.kind === 'hammer') {
      this.hammerHit();
      return;
    }
    const node = this.world.findNodeInCone(p.position, p.facing, g.reach, g.coneDeg);
    if (!node) return;

    const def = node.def;
    let power: number;
    if (tool) power = tool.kind === def.tool ? tool.power : tool.power * g.wrongToolMultiplier;
    else power = g.handPower * def.handMultiplier;

    _p.set(node.x, 1.3, node.z);
    if (power <= 0) {
      this.floaters.spawn(_p, `NEED A ${TOOL_NAME[def.tool]}`, 'warn');
      node.shake = 0.5;
      events.emit('camera:shake', { amount: 0.05 });
      return;
    }

    const { gained, destroyed } = this.world.damageNode(node, power, p.position.x, p.position.z);
    sfx(NODE_SOUND[def.id] ?? 'hit.stone', { x: node.x, z: node.z, pitch: destroyed ? 0.8 : 0.92 + Math.random() * 0.16 });
    if (destroyed) sfx('build.break', { x: node.x, z: node.z, param: def.tool === 'pickaxe' && def.id !== 'rock' && def.id !== 'rubble' ? 1 : 0, volume: 0.7 });
    const dx = node.x - p.position.x;
    const dz = node.z - p.position.z;
    const d = Math.hypot(dx, dz) || 1;
    this.debris.burst(node.x - (dx / d) * node.radius * 0.6, 0.9, node.z - (dz / d) * node.radius * 0.6, def.debrisColor, destroyed ? 26 : 9, -dx / d, -dz / d);
    this.floaters.spawn(_p, def.hitWords[Math.floor(Math.random() * def.hitWords.length)], 'word');
    if (tool && tool.kind !== def.tool) this.floaters.spawn(_p.clone().setY(0.6), 'WRONG TOOL', 'warn');
    events.emit('camera:shake', { amount: destroyed ? 0.28 : 0.1 });
    if (destroyed) this.floaters.spawn(_p.clone().setY(1.9), def.toxic ? 'SPLOOSH!' : 'KRAKA-DOOM!', 'word', '#f2b705', 0.08);
    if (def.toxic) {
      sfx('gas.burst', { x: node.x, z: node.z, volume: destroyed ? 1 : 0.5 });
      events.emit('toast', { text: 'Toxic gas vented. Back off or burn filter.', tone: 'toxic' });
    }

    this.give(gained, _p);
  }

  /** Puts items in the inventory with pickup text. Returns what didn't fit. */
  give(items: readonly ItemAmount[], at: THREE.Vector3): ItemAmount[] {
    const leftover: ItemAmount[] = [];
    items.forEach((a, i) => {
      const left = this.inv.add(a.item, a.qty);
      const got = a.qty - left;
      if (got > 0) {
        const def: ItemDef = ITEMS[a.item];
        sfx('pickup', { delay: 0.05 + i * 0.12, pitch: 1 + i * 0.08 });
        this.floaters.spawn(at.clone().setY(1.0), `+${got} ${def.name.toUpperCase()}`, 'gain', def.color, 0.05 + i * 0.12, i);
        if (def.kind === 'resource') this.gathered += got;
      }
      if (left > 0) leftover.push({ item: a.item, qty: left });
    });
    if (leftover.length && this.fullWarnCooldown <= 0) {
      this.fullWarnCooldown = 2;
      events.emit('toast', { text: 'Backpack full. Drop or use something.', tone: 'warn' });
    }
    return leftover;
  }

  search(c: ContainerInstance): void {
    if (c.def.requires && !this.inv.hasTool(c.def.requires)) {
      events.emit('toast', { text: `Locked tight. You need a ${TOOL_NAME[c.def.requires].toLowerCase()} to pry it open.`, tone: 'warn' });
      this.floaters.spawn(new THREE.Vector3(c.x, 1.6, c.z), 'LOCKED', 'warn');
      return;
    }
    const contents = this.world.contentsOf(c);
    const at = new THREE.Vector3(c.x, 1.4, c.z);
    if (contents.length === 0) {
      this.world.setContents(c, []);
      return;
    }
    const firstTime = !c.object.userData.searchedOnce;
    c.object.userData.searchedOnce = true;
    if (firstTime) {
      this.searched++;
      const { noise, hearing } = CONFIG.horde;
      const attention = (c.def.requires ? noise.pry : 0) + (c.def.id === 'labLocker' ? noise.labLocker : 0);
      if (attention > 0) events.emit('noise', { x: c.x, z: c.z, attention, radius: hearing.pry });
    }
    this.floaters.spawn(at.clone().setY(1.9), c.def.requires ? 'KRRRK!' : 'RUMMAGE', 'word');
    sfx(c.def.requires ? 'hit.metal' : 'rummage', { x: c.x, z: c.z });
    const left = this.give(contents, at);
    this.world.setContents(c, left);
  }

  use(index: number): void {
    const st = this.inv.slots[index];
    if (!st) return;
    const def: ItemDef = ITEMS[st.item as ItemId];
    const c = def.consumable;
    if (!c) {
      if (index < this.inv.hotbarSize) this.inv.select(index);
      return;
    }
    const p = this.player;
    const filterFull = p.filter >= CONFIG.player.maxFilter - 1;
    const healthFull = p.health >= CONFIG.player.maxHealth - 0.5;
    const hungerFull = p.hunger >= CONFIG.survival.maxHunger - 1;
    if (c.filter && !c.heal && filterFull) {
      events.emit('toast', { text: 'Filter is already fresh.', tone: 'info' });
      return;
    }
    if (c.hunger && hungerFull && (!c.heal || c.heal < 0 || healthFull)) {
      events.emit('toast', { text: "You're stuffed. Save it for later.", tone: 'info' });
      return;
    }
    if (!c.hunger && c.heal && c.heal > 0 && !c.filter && healthFull) {
      events.emit('toast', { text: "You're not hurt.", tone: 'info' });
      return;
    }
    if (c.filter) p.filter = Math.min(CONFIG.player.maxFilter, p.filter + c.filter);
    if (c.hunger) this.eat(c.hunger);
    if (c.heal && c.heal > 0) p.heal(c.heal);
    if (c.heal && c.heal < 0) p.damage(-c.heal);
    this.inv.removeAt(index, 1);
    sfx(c.filter ? 'filter' : c.hunger ? 'eat' : 'rummage');
    events.emit('toast', { text: c.message, tone: c.heal && c.heal < 0 ? 'danger' : c.filter ? 'toxic' : 'info' });
    this.floaters.spawn(p.position.clone().setY(2.1), c.filter ? 'SKRRT-CLICK' : c.heal && c.heal < 0 ? 'BLEGH!' : c.hunger ? 'CHOMP!' : 'GULP!', 'word', def.color);
  }
}
