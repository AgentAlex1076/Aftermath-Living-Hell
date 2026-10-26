import * as THREE from 'three';
import { CONFIG } from '../data/config';
import { events } from '../core/EventBus';
import { clamp, wrapAngle } from '../core/math';
import { sfx } from '../audio/AudioEngine';
import { evaluateBuild, type GunInstance, type GunStats } from '../data/guns';
import type { ItemId } from '../data/items';
import type { Player } from '../entities/Player';
import { assembleGun } from '../models/guns';
import type { LightEmitter, LightPool } from '../render/LightPool';
import type { Debris } from '../render/Debris';
import type { FloatingText } from '../ui/FloatingText';
import type { World } from '../world/World';
import type { Building, Piece } from './Building';
import type { Horde } from './Horde';
import type { Shooting } from './Shooting';

const D = CONFIG.defenses;
const RING_GEO = new THREE.RingGeometry(D.powerRadius - 0.55, D.powerRadius, 72);
const RING_MAT = new THREE.MeshBasicMaterial({
  color: '#e3b21b', transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: false,
});

interface Runtime {
  piece: Piece;
  armT: number;
  cooldown: number;
  yaw: number;
  loaded: number;
  fuelT: number;
  /** Seconds until a running generator next reports its noise. */
  noiseT: number;
  /** Ammo / chemicals owed by a simulated siege, spent a whole unit at a time. */
  siegeT: number;
  powered: boolean;
  running: boolean;
  spent: boolean;
  lights: LightEmitter[];
  ring: THREE.Mesh | null;
  head: THREE.Object3D | null;
  gunObject: THREE.Object3D | null;
  gunKey: string;
}

/**
 * Traps, turrets and generators. Power is a radius around a fueled generator —
 * no cable-laying, just "close enough to hear it running."
 */
export class Defenses {
  private readonly run = new Map<number, Runtime>();
  private pulse = 0;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly building: Building,
    private readonly horde: Horde,
    private readonly shooting: Shooting,
    private readonly player: Player,
    private readonly world: World,
    private readonly lights: LightPool,
    private readonly debris: Debris,
    private readonly floaters: FloatingText,
  ) {
    this.horde.hazardMul = (x, z) => this.speedMul(x, z);
    this.horde.revealAt = (x, z) => this.litAt(x, z);
  }

  /** Inside the beam of a powered floodlight. */
  litAt(x: number, z: number): boolean {
    for (const p of this.building.pieces) {
      if (p.def.id !== 'floodlight' || !this.run.get(p.uid)?.powered) continue;
      if (Math.hypot(p.x - x, p.z - z) < 11) return true;
    }
    return false;
  }

  /** 1 = full speed. Spikes and wire drag mutants down while they walk through. */
  speedMul(x: number, z: number): number {
    let m = 1;
    for (const p of this.building.pieces) {
      const id = p.def.id;
      if (id !== 'spikeStrip' && id !== 'barbedWire') continue;
      if (this.building.distanceTo(p, x, z) > 0.02) continue;
      m = Math.min(m, id === 'spikeStrip' ? D.spikeSlow : D.barbedSlow);
    }
    return m;
  }

  // --- Simulated sieges (the base fighting without the player) ----------------------------------

  /**
   * Damage the base's guns and contact traps deal in `dt` to a wave attacking from `heading`
   * (radians around the hut). Spends turret ammo, shotgun shells and flame-vent chemicals.
   */
  siegeFire(dt: number, heading: number): number {
    let dmg = 0;
    for (const p of this.building.pieces) {
      const rt = this.run.get(p.uid);
      if (!rt || rt.spent) continue;
      switch (p.def.id) {
        case 'autoTurret': {
          const gun = this.mountedGun(p);
          const ev = gun ? evaluateBuild(gun.parts) : null;
          if (!rt.powered || !ev?.ok) break;
          const s = ev.stats;
          const shots = this.siegeSpend(p, rt, 'ammo', s.fireRate * s.ammoPerShot * dt) / Math.max(1, s.ammoPerShot);
          dmg += shots * s.damage * Math.max(1, s.projectiles) * 0.55;
          break;
        }
        case 'shotgunTrap': {
          if (!facing(p, heading)) break;
          const shells = this.siegeSpend(p, rt, 'ammo', dt / D.shotgunCooldown);
          dmg += shells * D.shotgun.damage * D.shotgun.projectiles * 0.5;
          break;
        }
        case 'flameVent': {
          if (!rt.powered || !facing(p, heading)) break;
          if (this.siegeSpend(p, rt, 'chemicals', D.flameChemPerSecond * dt) > 0) dmg += D.flameDps * 0.5 * dt;
          break;
        }
        case 'spikeStrip':
        case 'barbedWire':
          if (inSector(p, heading)) dmg += (p.def.id === 'spikeStrip' ? D.spikeDps : D.barbedDps) * 0.6 * dt;
          break;
        default:
          break;
      }
    }
    return dmg;
  }

  /** Mines, tripwires and gas traps on the attacked side all go off once. Returns the total damage. */
  siegeTraps(heading: number): number {
    let dmg = 0;
    for (const p of [...this.building.pieces]) {
      const rt = this.run.get(p.uid);
      if (!rt || rt.spent || !inSector(p, heading)) continue;
      const hit = p.def.id === 'landmine' ? D.mineDamage * 2.5 : p.def.id === 'tripwire' ? D.tripDamage * 2.5 : p.def.id === 'gasTrap' ? 45 : 0;
      if (!hit) continue;
      dmg += hit;
      rt.spent = true;
      this.building.destroy(p, 'destroyed', true);
    }
    return dmg;
  }

  /** Spends `owed` units of `item` (fractions carry over, a turret's loaded rounds go first). Returns `owed`, or 0 if it's dry. */
  private siegeSpend(p: Piece, rt: Runtime, item: ItemId, owed: number): number {
    const have = (item === 'ammo' ? rt.loaded : 0) + this.countItem(p, item);
    if (have <= 0) {
      rt.siegeT = 0;
      return 0;
    }
    rt.siegeT += owed;
    while (rt.siegeT >= 1) {
      if (item === 'ammo' && rt.loaded > 0) rt.loaded--;
      else if (this.takeItem(p, item, 1) <= 0) {
        rt.siegeT = 0;
        break;
      }
      rt.siegeT -= 1;
    }
    return owed;
  }

  poweredAt(x: number, z: number): boolean {
    for (const p of this.building.pieces) {
      if (p.def.id !== 'generator') continue;
      const rt = this.run.get(p.uid);
      if (!rt || !this.hasFuel(p, rt)) continue;
      if (Math.hypot(p.x - x, p.z - z) <= D.powerRadius) return true;
    }
    return false;
  }

  update(dt: number): void {
    this.pulse += dt;
    this.sync();
    for (const p of this.building.pieces) {
      const rt = this.run.get(p.uid);
      if (rt) rt.powered = !p.def.needsPower || this.poweredAt(p.x, p.z);
    }

    const loads = new Set<number>();
    for (const p of this.building.pieces) {
      if (!p.def.needsPower) continue;
      const rt = this.run.get(p.uid);
      if (!rt) continue;
      if (p.def.id === 'autoTurret' && !this.mountedGun(p)) continue;
      if (p.def.id === 'flameVent' && this.countItem(p, 'chemicals') <= 0) continue;
      for (const g of this.building.pieces) {
        if (g.def.id !== 'generator') continue;
        if (Math.hypot(g.x - p.x, g.z - p.z) <= D.powerRadius) loads.add(g.uid);
      }
    }

    for (const p of this.building.pieces) {
      const rt = this.run.get(p.uid);
      if (!rt || rt.spent) continue;
      switch (p.def.id) {
        case 'spikeStrip':
        case 'barbedWire':
          this.tickContact(p, dt);
          break;
        case 'landmine':
          this.tickMine(p, rt, dt);
          break;
        case 'tripwire':
          this.tickTrip(p, rt, dt);
          break;
        case 'gasTrap':
          this.tickGas(p, rt, dt);
          break;
        case 'shotgunTrap':
          this.tickShotgun(p, rt, dt);
          break;
        case 'generator':
          this.tickGenerator(p, rt, dt, loads.has(p.uid));
          break;
        case 'autoTurret':
          this.tickTurret(p, rt, dt);
          break;
        case 'floodlight':
          this.tickFlood(rt);
          break;
        case 'flameVent':
          this.tickFlame(p, rt, dt);
          break;
        default:
          break;
      }
    }
  }

  private sync(): void {
    for (const [uid, rt] of this.run) {
      if (this.building.pieces.has(rt.piece)) continue;
      this.dispose(rt);
      this.run.delete(uid);
    }
    for (const p of this.building.pieces) {
      if (this.run.has(p.uid)) continue;
      if (p.def.kind !== 'deployable') continue;
      const id = p.def.id;
      if (id === 'storageBox' || id === 'sandbags') continue;
      this.run.set(p.uid, this.make(p));
    }
  }

  private make(p: Piece): Runtime {
    const lights = this.lights.addFromObject(p.object);
    let ring: THREE.Mesh | null = null;
    if (p.def.id === 'generator') {
      ring = new THREE.Mesh(RING_GEO, RING_MAT);
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(p.x, 0.04, p.z);
      ring.renderOrder = 2;
      ring.visible = false;
      this.scene.add(ring);
    }
    return {
      piece: p, armT: 0, cooldown: 0, yaw: p.rot, loaded: 0, fuelT: 0, noiseT: 2, siegeT: 0,
      powered: !p.def.needsPower, running: false, spent: false, lights, ring,
      head: p.object.getObjectByName('head') ?? null,
      gunObject: null, gunKey: '',
    };
  }

  private dispose(rt: Runtime): void {
    this.lights.removeAll(rt.lights);
    rt.ring?.removeFromParent();
    rt.gunObject?.removeFromParent();
  }

  private countItem(p: Piece, item: ItemId): number {
    return p.storage?.count(item) ?? 0;
  }

  private takeItem(p: Piece, item: ItemId, qty: number): number {
    return p.storage?.remove(item, qty) ?? 0;
  }

  private mountedGun(p: Piece): GunInstance | null {
    if (!p.storage) return null;
    for (const s of p.storage.slots) if (s?.gun) return s.gun;
    return null;
  }

  private hasFuel(p: Piece, rt: Runtime): boolean {
    return this.countItem(p, 'wood') > 0 || rt.fuelT > 0;
  }

  private inside(p: Piece, x: number, z: number, pad = 0.02): boolean {
    return this.building.distanceTo(p, x, z) <= pad;
  }

  private tickContact(p: Piece, dt: number): void {
    const rt = this.run.get(p.uid);
    if (!rt) return;
    rt.cooldown += dt;
    if (rt.cooldown < 0.32) return;
    const pulse = rt.cooldown;
    rt.cooldown = 0;
    const dps = p.def.id === 'spikeStrip' ? D.spikeDps : D.barbedDps;
    const word = p.def.id === 'spikeStrip' ? 'SHNK!' : 'RIIP!';
    for (const e of this.horde.enemies) {
      if (!e.alive || !this.inside(p, e.position.x, e.position.z)) continue;
      this.horde.hurt(e, dps * pulse, word);
    }
  }

  private tickMine(p: Piece, rt: Runtime, dt: number): void {
    rt.armT += dt;
    if (rt.armT < D.mineArm) return;
    const pl = this.player.position;
    const hit = this.horde.near(p.x, p.z, 0.7) || Math.hypot(pl.x - p.x, pl.z - p.z) < 0.7;
    if (hit) this.detonate(p, rt, D.mineRadius, D.mineDamage, true);
  }

  private tickTrip(p: Piece, rt: Runtime, dt: number): void {
    rt.armT += dt;
    if (rt.armT < D.tripArm) return;
    const half = p.size.w / 2;
    const c = Math.cos(p.rot);
    const s = Math.sin(p.rot);
    const ax = p.x - c * half;
    const az = p.z + s * half;
    const bx = p.x + c * half;
    const bz = p.z - s * half;
    const tripped = this.horde.enemies.some((e) => e.alive && distToSeg(e.position.x, e.position.z, ax, az, bx, bz) < D.tripWidth)
      || distToSeg(this.player.position.x, this.player.position.z, ax, az, bx, bz) < D.tripWidth;
    if (tripped) this.detonate(p, rt, D.tripRadius, D.tripDamage, true);
  }

  private tickGas(p: Piece, rt: Runtime, dt: number): void {
    rt.armT += dt;
    if (rt.armT < D.gasArm) return;
    if (!this.horde.near(p.x, p.z, D.gasTrigger)) return;
    rt.spent = true;
    this.world.addPuff(p.x, p.z, D.gasR, D.gasLife);
    this.debris.burst(p.x, 0.6, p.z, '#8cff3a', 22);
    sfx('gas.burst', { x: p.x, z: p.z });
    this.floaters.spawn(new THREE.Vector3(p.x, 1.4, p.z), 'PSSSH!', 'word', '#8cff3a');
    events.emit('toast', { text: 'A gas trap popped. The air went green.', tone: 'toxic' });
    this.building.destroy(p, 'destroyed');
  }

  private tickShotgun(p: Piece, rt: Runtime, dt: number): void {
    rt.cooldown = Math.max(0, rt.cooldown - dt);
    if (rt.cooldown > 0 || this.countItem(p, 'ammo') <= 0) return;
    const yaw = p.rot;
    if (!this.enemyInCone(p.x, p.z, yaw, D.shotgunRange, D.shotgunCone)) return;
    this.takeItem(p, 'ammo', 1);
    rt.cooldown = D.shotgunCooldown;
    const mx = p.x + Math.sin(yaw) * 0.45;
    const mz = p.z + Math.cos(yaw) * 0.45;
    this.shooting.fireFrom(mx, p.y + 0.95, mz, yaw, D.shotgun as GunStats);
    this.floaters.spawn(new THREE.Vector3(p.x, 1.5, p.z), 'BOOM!', 'word', '#f2b705');
  }

  private tickGenerator(p: Piece, rt: Runtime, dt: number, loaded: boolean): void {
    rt.running = loaded && this.hasFuel(p, rt);
    if (rt.running) {
      rt.fuelT -= dt;
      if (rt.fuelT <= 0) {
        if (this.takeItem(p, 'wood', 1) > 0) rt.fuelT += D.fuelBurn;
        else rt.running = false;
      }
      rt.noiseT -= dt;
      if (rt.noiseT <= 0) {
        rt.noiseT += 2;
        events.emit('noise', { x: p.x, z: p.z, attention: CONFIG.horde.noise.generator * 2, radius: CONFIG.horde.hearing.generator });
      }
    }
    if (rt.ring) {
      rt.ring.visible = this.hasFuel(p, rt);
      rt.ring.material = RING_MAT;
      (rt.ring.material as THREE.MeshBasicMaterial).opacity = 0.4 + 0.16 * Math.sin(this.pulse * 2);
    }
    for (const l of rt.lights) l.gain = rt.running ? 1 : 0.12;
  }

  private tickTurret(p: Piece, rt: Runtime, dt: number): void {
    const gun = this.mountedGun(p);
    this.syncGunMesh(p, rt, gun);
    for (const l of rt.lights) l.gain = rt.powered && gun ? 1 : 0.08;
    if (!rt.powered || !gun) return;
    const ev = evaluateBuild(gun.parts);
    if (!ev.ok) return;
    const stats = ev.stats;
    if (rt.loaded < stats.ammoPerShot && this.countItem(p, 'ammo') > 0) {
      const need = stats.magSize - rt.loaded;
      rt.loaded += this.takeItem(p, 'ammo', Math.max(1, need));
    }
    rt.cooldown = Math.max(0, rt.cooldown - dt);

    const target = this.acquire(p.x, p.z, Math.min(stats.range, 22));
    if (!target) return;
    const desired = Math.atan2(target.position.x - p.x, target.position.z - p.z);
    const err = wrapAngle(desired - rt.yaw);
    const max = D.turretTurn * dt;
    rt.yaw += clamp(err, -max, max);
    if (rt.head) rt.head.rotation.y = rt.yaw - p.rot;
    if (Math.abs(wrapAngle(desired - rt.yaw)) > 0.18 || rt.cooldown > 0) return;
    if (rt.loaded < stats.ammoPerShot) return;

    rt.loaded -= stats.ammoPerShot;
    rt.cooldown = 1 / Math.max(0.4, stats.fireRate);
    const mx = p.x + Math.sin(rt.yaw) * 0.55;
    const mz = p.z + Math.cos(rt.yaw) * 0.55;
    this.shooting.fireFrom(mx, p.y + 1.05, mz, rt.yaw, stats, stats.fireMode === 'semi');
  }

  private tickFlood(rt: Runtime): void {
    for (const l of rt.lights) l.gain = rt.powered ? 1 : 0;
  }

  private tickFlame(p: Piece, rt: Runtime, dt: number): void {
    const chem = this.countItem(p, 'chemicals');
    const firing = rt.powered && chem > 0 && this.enemyInCone(p.x, p.z, p.rot, D.flameRange, D.flameCone);
    for (const l of rt.lights) l.gain = firing ? 1 : 0.1;
    if (!firing) return;
    rt.fuelT += dt * D.flameChemPerSecond;
    if (rt.fuelT >= 1) {
      this.takeItem(p, 'chemicals', 1);
      rt.fuelT -= 1;
    }
    rt.cooldown += dt;
    const yaw = p.rot;
    const reach = D.flameRange;
    if (rt.cooldown >= 0.2) {
      const pulse = rt.cooldown;
      rt.cooldown = 0;
      sfx('flame', { x: p.x, z: p.z });
      for (const e of this.horde.enemies) {
        if (!e.alive) continue;
        const dx = e.position.x - p.x;
        const dz = e.position.z - p.z;
        const dist = Math.hypot(dx, dz);
        if (dist > reach || dist < 0.2) continue;
        const ang = Math.abs(wrapAngle(Math.atan2(dx, dz) - yaw));
        if (ang > D.flameCone) continue;
        this.horde.hurt(e, D.flameDps * pulse, 'FSSSH!');
      }
    }
    if (Math.sin(this.pulse * 18) > 0.4) {
      this.debris.burst(
        p.x + Math.sin(yaw) * 0.8, 0.4, p.z + Math.cos(yaw) * 0.8,
        '#ff7a2a', 5, Math.sin(yaw), Math.cos(yaw),
      );
    }
  }

  private detonate(p: Piece, rt: Runtime, radius: number, damage: number, hurtPlayer: boolean): void {
    rt.spent = true;
    this.horde.blast(p.x, p.z, radius, damage);
    const wall = this.building.pieceNear(p.x, p.z, radius * 0.6);
    if (wall && wall !== p) this.building.damage(wall, damage * 0.35);
    if (hurtPlayer) {
      const d = Math.hypot(this.player.position.x - p.x, this.player.position.z - p.z);
      if (d < radius && !this.player.invulnerable) this.player.damage(damage * (1 - d / radius));
    }
    this.debris.burst(p.x, 0.7, p.z, '#f2b705', 28);
    sfx('explosion', { x: p.x, z: p.z });
    events.emit('noise', { x: p.x, z: p.z, attention: CONFIG.horde.noise.explosion, radius: CONFIG.horde.hearing.explosion });
    this.floaters.spawn(new THREE.Vector3(p.x, 1.6, p.z), 'KRA-KOOM!', 'word', '#f2b705', 0, 0, damage);
    events.emit('camera:shake', { amount: 0.45 });
    this.building.destroy(p, 'destroyed');
  }

  private acquire(x: number, z: number, range: number) {
    let best = null as (typeof this.horde.enemies)[number] | null;
    let bestD = range;
    for (const e of this.horde.enemies) {
      if (!e.alive || e.cloaked) continue;
      const d = Math.hypot(e.position.x - x, e.position.z - z);
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    return best;
  }

  private enemyInCone(x: number, z: number, yaw: number, range: number, cone: number): boolean {
    for (const e of this.horde.enemies) {
      if (!e.alive) continue;
      const dx = e.position.x - x;
      const dz = e.position.z - z;
      const dist = Math.hypot(dx, dz);
      if (dist > range || dist < 0.25) continue;
      if (Math.abs(wrapAngle(Math.atan2(dx, dz) - yaw)) <= cone) return true;
    }
    return false;
  }

  private syncGunMesh(_p: Piece, rt: Runtime, gun: GunInstance | null): void {
    const key = gun ? `${gun.id}:${gun.parts.map((x) => x.part).join()}` : '';
    if (key === rt.gunKey) return;
    rt.gunKey = key;
    rt.gunObject?.removeFromParent();
    rt.gunObject = null;
    if (!gun) return;
    const mount = rt.head?.getObjectByName('gunMount') ?? rt.head;
    if (!mount) return;
    const mesh = assembleGun(gun.parts);
    mesh.scale.setScalar(3.2);
    mesh.rotation.y = Math.PI / 2;
    mesh.position.set(0, 0.04, 0.16);
    mount.add(mesh);
    rt.gunObject = mesh;
  }
}

/** Half-width of the side of the base a siege wave hits. */
const SECTOR = 1.0;

/** A piece is on the attacked side: within the wedge around `heading`, or right up against the hut. */
export function inSector(p: { x: number; z: number }, heading: number): boolean {
  if (Math.hypot(p.x, p.z) < 5) return true;
  return Math.abs(wrapAngle(Math.atan2(p.x, p.z) - heading)) < SECTOR;
}

/** A directional trap on the attacked side that points roughly outward, toward the wave. */
function facing(p: Piece, heading: number): boolean {
  return inSector(p, heading) && Math.abs(wrapAngle(p.rot - heading)) < 1.3;
}

function distToSeg(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax;
  const dz = bz - az;
  const len2 = dx * dx + dz * dz || 1;
  const t = clamp(((px - ax) * dx + (pz - az) * dz) / len2, 0, 1);
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
}
