import { CONFIG } from '../data/config';
import { ENEMIES, type EnemyId } from '../data/enemies';
import type { Building, Piece } from './Building';
import { inSector, type Defenses } from './Defenses';
import type { Horde, SpawnJob } from './Horde';

export interface SiegeUnit {
  id: EnemyId;
  hp: number;
}

const H = CONFIG.horde;
const STEP = 0.5;

/**
 * A raid fought without the player, on paper. The wave walks in from one side, the base's
 * turrets and traps wear it down (spending their real ammo), and the front of the wave chews
 * through the outermost walls on that side. It ends `held` when the wave is gone (or gives up),
 * `breached` when nothing is left standing between it and the hut. The player can walk back in
 * at any point and `materialize` the survivors as real mutants.
 */
export class Siege {
  units: SiegeUnit[] = [];
  heading = 0;
  result: 'held' | 'breached' | null = null;
  /** Items lost from storage when the wave broke through. */
  lostStacks = 0;
  private approach = 0;
  private elapsed = 0;
  private acc = 0;
  private trapsFired = false;

  constructor(
    private readonly building: Building,
    private readonly defenses: Defenses,
    private readonly horde: Horde,
  ) {}

  get active(): boolean {
    return this.units.length > 0 && this.result === null;
  }

  /** Mutants still out there. */
  get count(): number {
    return this.units.length;
  }

  start(units: SiegeUnit[], heading: number, approach: number = H.siegeApproach): void {
    this.units = units.filter((u) => u.hp > 0);
    this.heading = heading;
    this.result = this.units.length ? null : 'held';
    this.lostStacks = 0;
    this.approach = approach;
    this.elapsed = 0;
    this.acc = 0;
    this.trapsFired = false;
  }

  update(dt: number): void {
    if (this.result) return;
    this.acc += dt;
    while (this.acc >= STEP && !this.result) {
      this.acc -= STEP;
      this.tick(STEP);
    }
  }

  /** The player is back: the survivors become real mutants just outside the walls they were hitting. */
  materialize(): SpawnJob[] {
    const walls = this.targets();
    const reach = walls.length ? Math.hypot(walls[0].x, walls[0].z) + 4 : CONFIG.raid.spawnMin;
    const r = Math.min(CONFIG.raid.spawnMax, Math.max(12, reach));
    const jobs = this.units.map((u, i) => {
      const a = this.heading + (Math.random() - 0.5) * 0.7;
      const d = r + Math.random() * 4;
      return { id: u.id, x: Math.sin(a) * d, z: Math.cos(a) * d, delay: 0.1 + i * 0.15, raid: true, hpMul: u.hp / ENEMIES[u.id].hp };
    });
    this.units = [];
    this.result = null;
    return jobs;
  }

  private tick(dt: number): void {
    this.elapsed += dt;
    if (this.approach > 0) {
      this.approach -= dt;
      return;
    }
    if (!this.trapsFired) {
      this.trapsFired = true;
      this.wound(this.defenses.siegeTraps(this.heading), true);
    }
    this.wound(this.defenses.siegeFire(dt, this.heading), false);
    if (this.units.length === 0) {
      this.result = 'held';
      return;
    }

    const front = this.units.slice(0, H.siegeFront);
    const wallDps = front.reduce((s, u) => s + ENEMIES[u.id].structureDamage / ENEMIES[u.id].attackCooldown, 0);
    const target = this.targets()[0];
    if (target) this.building.damage(target, wallDps * dt, true);
    else this.breach();
    if (!this.result && this.elapsed > H.siegeMaxTime) this.result = 'held';
  }

  /** Damage to the front of the wave. `spread` (blasts) shares it across the first few mutants instead. */
  private wound(amount: number, spread: boolean): void {
    let left = amount;
    if (spread && this.units.length) {
      const n = Math.min(this.units.length, 5);
      const each = amount / n;
      for (let i = 0; i < n; i++) this.units[i].hp -= each;
      left = 0;
    }
    while (left > 0 && this.units.length) {
      const u = this.units[0];
      const dealt = Math.min(left, u.hp);
      u.hp -= dealt;
      left -= dealt;
      if (u.hp <= 0.01) {
        this.units.shift();
        this.horde.creditKill(u.id);
      }
    }
    for (let i = this.units.length - 1; i >= 0; i--) {
      if (this.units[i].hp > 0.01) continue;
      this.horde.creditKill(this.units[i].id);
      this.units.splice(i, 1);
    }
  }

  /** What stands between the wave and the hut on its side, outermost first. Storage isn't a wall. */
  private targets(): Piece[] {
    const list: Piece[] = [];
    for (const p of this.building.pieces) {
      if (p.def.kind === 'foundation' || p.def.walkThrough || p.def.id === 'storageBox') continue;
      if (Math.hypot(p.x, p.z) > CONFIG.homeZone.radius + 12 || !inSector(p, this.heading)) continue;
      list.push(p);
    }
    return list.sort((a, b) => Math.hypot(b.x, b.z) - Math.hypot(a.x, a.z));
  }

  /** Nothing left in the way: they ransack the storage boxes on that side and leave. */
  private breach(): void {
    const [lo, hi] = H.breachLoss;
    for (const p of this.building.pieces) {
      if (p.def.id !== 'storageBox' || !p.storage || !inSector(p, this.heading)) continue;
      const box = p.storage;
      for (let i = 0; i < box.size; i++) {
        const s = box.slots[i];
        if (!s) continue;
        const frac = lo + Math.random() * (hi - lo);
        // Single items (a gun, one medkit) are a coin flip weighted by the same fraction.
        const take = s.qty === 1 ? (Math.random() < frac ? 1 : 0) : Math.round(s.qty * frac);
        if (take <= 0) continue;
        box.removeAt(i, take);
        this.lostStacks++;
      }
    }
    this.result = 'breached';
  }
}
