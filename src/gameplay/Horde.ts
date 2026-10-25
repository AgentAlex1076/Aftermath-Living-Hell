import * as THREE from 'three';
import { CONFIG } from '../data/config';
import { events } from '../core/EventBus';
import { wrapAngle } from '../core/math';
import { ENEMIES, type EnemyId } from '../data/enemies';
import { ITEMS, type ItemDef } from '../data/items';
import type { ItemAmount } from '../data/loot';
import { Enemy, dampEnemyFacing } from '../entities/Enemy';
import type { Player } from '../entities/Player';
import { HALF_TAG, type CollisionWorld } from '../physics/Collision';
import type { Debris } from '../render/Debris';
import type { FloatingText } from '../ui/FloatingText';
import type { World } from '../world/World';
import type { Building } from './Building';
import type { FlowField } from './FlowField';
import type { Inventory } from './Inventory';

const POOL: Record<EnemyId, number> = { shambler: 28, crawler: 16, bloater: 10, brute: 6, chemist: 2 };
const _p = new THREE.Vector3();

export interface SpawnJob {
  id: EnemyId;
  x: number;
  z: number;
  delay: number;
  raid: boolean;
}

/**
 * Pooled mutants: raid waves, a few roamers, melee against the player and the walls,
 * and the loot / gas they leave behind.
 */
export class Horde {
  readonly enemies: Enemy[] = [];
  kills = 0;
  readonly killsByType: Partial<Record<EnemyId, number>> = {};
  private readonly pool = new Map<EnemyId, Enemy[]>();
  private readonly queue: SpawnJob[] = [];
  private seed = 1;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly collision: CollisionWorld,
    private readonly flow: FlowField,
    private readonly building: Building,
    private readonly world: World,
    private readonly player: Player,
    private readonly inventory: Inventory,
    private readonly debris: Debris,
    private readonly floaters: FloatingText,
    private readonly onMauled: () => void,
  ) {
    for (const id of Object.keys(POOL) as EnemyId[]) {
      const list: Enemy[] = [];
      for (let i = 0; i < POOL[id]; i++) {
        const e = new Enemy(ENEMIES[id], i * 9973 + 11);
        this.scene.add(e.object);
        list.push(e);
      }
      this.pool.set(id, list);
    }
  }

  get raidAlive(): number {
    let n = 0;
    for (const e of this.enemies) if (e.alive && e.raid) n++;
    for (const j of this.queue) if (j.raid) n++;
    return n;
  }

  get roamAlive(): number {
    let n = 0;
    for (const e of this.enemies) if (e.alive && !e.raid) n++;
    return n;
  }

  get aliveCount(): number {
    let n = 0;
    for (const e of this.enemies) if (e.alive) n++;
    return n;
  }

  enqueue(jobs: readonly SpawnJob[]): void {
    this.queue.push(...jobs);
  }

  spawn(id: EnemyId, x: number, z: number, raid: boolean): Enemy | null {
    const list = this.pool.get(id);
    const e = list?.find((m) => !m.object.visible && m.state !== 'dead') ?? list?.find((m) => !m.alive);
    if (!e) return null;
    if (this.enemies.includes(e)) {
      // Recycle a finished corpse.
    } else this.enemies.push(e);
    e.spawn(x, z, raid);
    return e;
  }

  findInCone(pos: THREE.Vector3, facing: number, reach: number, coneDeg: number): Enemy | null {
    const half = (coneDeg * Math.PI) / 360;
    let best: Enemy | null = null;
    let bestScore = Infinity;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const dx = e.position.x - pos.x;
      const dz = e.position.z - pos.z;
      const center = Math.hypot(dx, dz);
      const dist = center - e.def.radius;
      if (dist > reach) continue;
      const ang = Math.abs(wrapAngle(Math.atan2(dx, dz) - facing));
      if (ang > half && dist > 0.2) continue;
      const score = dist + ang * 0.7;
      if (score < bestScore) {
        bestScore = score;
        best = e;
      }
    }
    return best;
  }

  /** Player swing landed. Returns true if it hit a mutant. */
  strike(power: number): boolean {
    const p = this.player;
    const e = this.findInCone(p.position, p.facing, CONFIG.gathering.reach + 0.15, CONFIG.gathering.coneDeg);
    if (!e) return false;
    const dead = e.hit(power);
    _p.set(e.position.x, e.def.height * 0.65, e.position.z);
    this.debris.burst(e.position.x, 0.9, e.position.z, e.def.debrisColor, dead ? 18 : 7);
    this.floaters.spawn(_p, e.def.hitWords[Math.floor(Math.random() * e.def.hitWords.length)], 'word');
    events.emit('camera:shake', { amount: dead ? 0.22 : 0.08 });
    if (dead) this.finishKill(e);
    return true;
  }

  update(dt: number): void {
    for (let i = this.queue.length - 1; i >= 0; i--) {
      this.queue[i].delay -= dt;
      if (this.queue[i].delay > 0) continue;
      const j = this.queue.splice(i, 1)[0];
      this.spawn(j.id, j.x, j.z, j.raid);
    }

    const p = this.player;
    for (const e of this.enemies) {
      if (!e.object.visible) continue;
      if (e.state === 'dead') {
        e.animate(dt);
        if (e.deadT > 1.1) e.hide();
        continue;
      }
      this.step(e, dt, p);
      e.animate(dt);
    }
    this.separate();
  }

  private step(e: Enemy, dt: number, p: Player): void {
    const d = e.def;
    e.cooldown = Math.max(0, e.cooldown - dt);
    e.attackImpact = false;
    if (d.vent) {
      e.ventT -= dt;
      if (e.ventT <= 0) {
        e.ventT = d.vent.every;
        this.world.addPuff(e.position.x, e.position.z, d.vent.gasR, 5);
        const dist = Math.hypot(p.position.x - e.position.x, p.position.z - e.position.z);
        if (dist < d.vent.radius && !p.invulnerable) {
          p.damage(8);
          this.onMauled();
        }
      }
    }

    const toPlayer = Math.hypot(p.position.x - e.position.x, p.position.z - e.position.z);
    const structure = this.building.pieceNear(e.position.x, e.position.z, CONFIG.raid.structureReach + e.def.radius);
    const canHitPlayer = toPlayer < d.attackRange + CONFIG.player.radius;
    const canHitWall = !!structure && this.building.distanceTo(structure, e.position.x, e.position.z) < CONFIG.raid.structureReach + 0.05;

    if (e.state === 'attack') {
      e.attackT += dt / d.attackTime;
      if (!e.attackImpact && e.attackT >= 0.55) {
        e.attackImpact = true;
        if (canHitPlayer && !p.invulnerable) {
          p.damage(d.damage);
          this.onMauled();
          this.floaters.spawn(p.position.clone().setY(1.7), d.id === 'brute' ? 'CRACK!' : 'RIP!', 'word', '#e0302a');
          events.emit('camera:shake', { amount: 0.2 });
        } else if (canHitWall && structure) {
          this.building.damage(structure, d.structureDamage);
        }
      }
      if (e.attackT >= 1) {
        e.state = 'walk';
        e.cooldown = d.attackCooldown;
      }
      return;
    }

    if (e.cooldown <= 0 && (canHitPlayer || (canHitWall && (e.stuck > 0.35 || toPlayer > CONFIG.raid.playerAggro)))) {
      const tx = canHitPlayer ? p.position.x : structure!.x;
      const tz = canHitPlayer ? p.position.z : structure!.z;
      dampEnemyFacing(e, Math.atan2(tx - e.position.x, tz - e.position.z), dt);
      e.beginAttack();
      return;
    }

    let wx = 0;
    let wz = 0;
    if (toPlayer < CONFIG.raid.playerAggro && (e.raid || toPlayer < CONFIG.raid.playerAggro)) {
      const inv = toPlayer || 1;
      wx = (p.position.x - e.position.x) / inv;
      wz = (p.position.z - e.position.z) / inv;
    } else if (e.raid) {
      const f = this.flow.sample(e.position.x, e.position.z, !!d.slips);
      wx = f.x;
      wz = f.z;
      if (wx === 0 && wz === 0) {
        const tx = structure ? structure.x : 0;
        const tz = structure ? structure.z : 0;
        const inv = Math.hypot(tx - e.position.x, tz - e.position.z) || 1;
        wx = (tx - e.position.x) / inv;
        wz = (tz - e.position.z) / inv;
      }
    } else {
      this.seed = (this.seed + 1) >>> 0;
      const wander = Math.sin(e.position.x * 0.15 + e.position.z * 0.11 + this.seed * 0.001);
      wx = Math.sin(e.facing + wander * 0.4);
      wz = Math.cos(e.facing + wander * 0.4);
    }

    const len = Math.hypot(wx, wz);
    if (len > 0.05) {
      wx /= len;
      wz /= len;
      dampEnemyFacing(e, Math.atan2(wx, wz), dt);
      e.wish.set(wx, wz);
      e.speed = d.speed;
    } else {
      e.wish.set(0, 0);
      e.speed = 0;
    }

    const prevX = e.position.x;
    const prevZ = e.position.z;
    e.position.x += e.wish.x * e.speed * dt;
    e.position.z += e.wish.y * e.speed * dt;
    this.collision.resolveCircle(e.position, d.radius, d.slips ? [HALF_TAG] : []);
    const moved = Math.hypot(e.position.x - prevX, e.position.z - prevZ);
    e.stuck = e.speed > 0.4 && moved < e.speed * dt * 0.25 ? e.stuck + dt : 0;
  }

  private separate(): void {
    const list = this.enemies;
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      if (!a.alive) continue;
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        if (!b.alive) continue;
        const dx = b.position.x - a.position.x;
        const dz = b.position.z - a.position.z;
        const min = a.def.radius + b.def.radius;
        const d2 = dx * dx + dz * dz;
        if (d2 >= min * min || d2 < 1e-6) continue;
        const d = Math.sqrt(d2);
        const push = (min - d) * 0.5;
        const nx = dx / d;
        const nz = dz / d;
        a.position.x -= nx * push;
        a.position.z -= nz * push;
        b.position.x += nx * push;
        b.position.z += nz * push;
      }
    }
  }

  private finishKill(e: Enemy): void {
    this.kills++;
    this.killsByType[e.def.id] = (this.killsByType[e.def.id] ?? 0) + 1;
    _p.set(e.position.x, e.def.height * 0.8, e.position.z);
    this.floaters.spawn(_p.clone().setY(_p.y + 0.4), e.def.deathWord, 'word', '#f2b705', 0.05);
    this.give(e.def.loot, _p);
    if (e.def.explode) {
      const x = e.def.explode;
      this.world.addPuff(e.position.x, e.position.z, x.gasR, x.gasLife);
      this.debris.burst(e.position.x, 1.1, e.position.z, e.def.debrisColor, 28);
      const dist = Math.hypot(this.player.position.x - e.position.x, this.player.position.z - e.position.z);
      if (dist < x.radius && !this.player.invulnerable) {
        this.player.damage(x.damage * (1 - dist / x.radius));
        this.onMauled();
      }
      for (const o of this.enemies) {
        if (!o.alive || o === e) continue;
        const od = Math.hypot(o.position.x - e.position.x, o.position.z - e.position.z);
        if (od < x.radius && o.hit(x.damage * 0.45 * (1 - od / x.radius))) this.finishKill(o);
      }
      const wall = this.building.pieceNear(e.position.x, e.position.z, x.radius);
      if (wall) this.building.damage(wall, 40);
      events.emit('toast', { text: 'A bloater burst. The air went green.', tone: 'toxic' });
    }
  }

  private give(items: readonly ItemAmount[], at: THREE.Vector3): void {
    items.forEach((a, i) => {
      const got = a.qty - this.inventory.add(a.item, a.qty);
      if (got > 0) {
        const def: ItemDef = ITEMS[a.item];
        this.floaters.spawn(at.clone().setY(1.1), `+${got} ${def.name.toUpperCase()}`, 'gain', def.color, 0.08 + i * 0.1, i);
      }
    });
  }
}

export function meleePower(toolPower: number | undefined): number {
  return toolPower && toolPower > 0 ? toolPower : CONFIG.gathering.handPower;
}
