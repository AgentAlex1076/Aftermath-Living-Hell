import * as THREE from 'three';
import { CONFIG } from '../data/config';
import { events } from '../core/EventBus';
import { sfx } from '../audio/AudioEngine';
import { evaluateBuild, type GunInstance, type GunStats } from '../data/guns';
import type { Player } from '../entities/Player';
import type { Debris } from '../render/Debris';
import type { FloatingText } from '../ui/FloatingText';
import type { Building } from './Building';
import type { Horde } from './Horde';
import type { Inventory } from './Inventory';

interface Shot {
  mesh: THREE.Mesh;
  vx: number;
  vz: number;
  life: number;
  damage: number;
  active: boolean;
}

const WORDS = CONFIG.combat.hitWords;
const _p = new THREE.Vector3();

/** 0 = pea shooter, 1 = hand cannon; drives how deep the shot sounds. */
function shotWeight(stats: GunStats): number {
  return Math.min(1, (stats.damage * Math.max(1, stats.projectiles * 0.5)) / 55);
}

/** Firing, reload, jam and a pooled spray of projectiles. */
export class Shooting {
  heat = 0;
  jammed = false;
  reloading = false;
  reloadT = 0;
  cooldown = 0;
  burstLeft = 0;
  private fireWasDown = false;
  private readonly pool: Shot[] = [];
  // Brighter than white so the bloom pass picks them up.
  private readonly tracerMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.4, 1.7, 0.25) });
  private readonly slugMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.2, 3.6, 0.5) });
  private readonly tracerGeo = new THREE.CylinderGeometry(0.025, 0.018, 0.28, 5);
  readonly group = new THREE.Group();

  constructor(
    scene: THREE.Scene,
    private readonly player: Player,
    private readonly inv: Inventory,
    private readonly horde: Horde,
    private readonly building: Building,
    private readonly debris: Debris,
    private readonly floaters: FloatingText,
  ) {
    this.tracerGeo.rotateX(Math.PI / 2);
    this.group.name = 'tracers';
    scene.add(this.group);
    for (let i = 0; i < CONFIG.combat.pool; i++) {
      const mesh = new THREE.Mesh(this.tracerGeo, this.tracerMat);
      mesh.visible = false;
      mesh.castShadow = false;
      this.group.add(mesh);
      this.pool.push({ mesh, vx: 0, vz: 0, life: 0, damage: 0, active: false });
    }
  }

  get gun(): GunInstance | null {
    return this.inv.equippedGun;
  }

  get stats(): GunStats | null {
    const g = this.gun;
    return g ? evaluateBuild(g.parts).stats : null;
  }

  get busy(): boolean {
    return this.reloading || this.jammed;
  }

  update(dt: number, fireHeld: boolean, reloadPressed: boolean, aiming: boolean): void {
    const gun = this.gun;
    const stats = this.stats;
    this.player.load = stats ? stats.weight : 0;
    this.player.aiming = !!gun && aiming;

    this.heat = Math.max(0, this.heat - CONFIG.combat.heatDecay * dt);
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.stepShots(dt);

    if (!gun || !stats) {
      this.reloading = false;
      this.jammed = false;
      this.burstLeft = 0;
      this.fireWasDown = fireHeld;
      return;
    }

    if (this.reloading) {
      this.reloadT += dt;
      if (this.reloadT >= (this.jammed ? CONFIG.combat.jamClearTime : stats.reloadTime)) {
        if (this.jammed) {
          this.jammed = false;
          this.reloading = false;
          events.emit('toast', { text: 'Cleared the jam.', tone: 'info' });
        } else {
          this.finishReload(gun, stats);
        }
      }
      this.fireWasDown = fireHeld;
      return;
    }

    if (reloadPressed) {
      if (this.jammed) this.startReload(true);
      else this.startReload(false);
      this.fireWasDown = fireHeld;
      return;
    }

    if (this.jammed) {
      this.fireWasDown = fireHeld;
      return;
    }

    const pressed = fireHeld && !this.fireWasDown;
    this.fireWasDown = fireHeld;

    if (this.burstLeft > 0 && this.cooldown <= 0) {
      this.discharge(gun, stats, aiming);
      return;
    }

    if (stats.fireMode === 'semi') {
      if (pressed) this.tryFire(gun, stats, aiming);
    } else if (stats.fireMode === 'burst') {
      if (pressed && this.burstLeft <= 0) {
        this.burstLeft = stats.burstCount;
        this.tryFire(gun, stats, aiming);
      }
    } else if (fireHeld) {
      this.tryFire(gun, stats, aiming);
    }
  }

  private tryFire(gun: GunInstance, stats: GunStats, aiming: boolean): void {
    if (this.cooldown > 0 || this.reloading || this.jammed) return;
    if (gun.loaded < stats.ammoPerShot) {
      if (this.inv.count('ammo') > 0) this.startReload(false);
      else {
        events.emit('toast', { text: 'Empty. No cartridges.', tone: 'warn' });
        sfx('gun.dry');
        this.cooldown = 0.35;
      }
      return;
    }
    if (Math.random() < this.heat * stats.heat) {
      this.jammed = true;
      this.burstLeft = 0;
      sfx('gun.jam');
      events.emit('toast', { text: 'JAMMED. Hit R.', tone: 'danger' });
      this.floaters.spawn(this.player.position.clone().setY(2.1), 'KLICK', 'warn');
      return;
    }
    this.discharge(gun, stats, aiming);
  }

  /** Turrets and traps fire through here: same tracers, no player heat or magazine. */
  fireFrom(x: number, y: number, z: number, yaw: number, stats: GunStats, word = true): void {
    const spread = (stats.spread * Math.PI) / 180;
    for (let i = 0; i < stats.projectiles; i++) {
      const a = yaw + (Math.random() * 2 - 1) * spread + (i - (stats.projectiles - 1) / 2) * spread * 0.35;
      this.spawnShot(x, y, z, Math.sin(a) * stats.velocity, Math.cos(a) * stats.velocity, stats);
    }
    this.debris.burst(x, y, z, '#f2b705', 4, Math.sin(yaw), Math.cos(yaw));
    sfx('gun.shot', { x, z, param: shotWeight(stats), pitch: 1.05 + Math.random() * 0.1, volume: 0.8 });
    events.emit('camera:shake', { amount: 0.04 + stats.recoil * 0.004 });
    if (word) {
      this.floaters.spawn(
        new THREE.Vector3(x, y + 0.45, z),
        WORDS[Math.floor(Math.random() * WORDS.length)],
        'word',
        '#f2b705',
      );
    }
  }

  private discharge(gun: GunInstance, stats: GunStats, aiming: boolean): void {
    gun.loaded -= stats.ammoPerShot;
    this.cooldown = 1 / Math.max(0.4, stats.fireRate);
    this.heat = Math.min(1, this.heat + 0.08 + stats.heat * 2);
    if (this.burstLeft > 0) this.burstLeft--;
    this.player.kick = Math.min(1, this.player.kick + stats.recoil * 0.04);

    const p = this.player;
    const facing = p.facing;
    const spread = (stats.spread * (aiming ? CONFIG.combat.aimSpread : 1) + this.heat * stats.recoil * 0.15) * (Math.PI / 180);
    const muzzle = 0.85;
    const sx = p.position.x + Math.sin(facing) * muzzle;
    const sz = p.position.z + Math.cos(facing) * muzzle;

    for (let i = 0; i < stats.projectiles; i++) {
      const yaw = facing + (Math.random() * 2 - 1) * spread + (i - (stats.projectiles - 1) / 2) * spread * 0.35;
      this.spawnShot(sx, 1.15, sz, Math.sin(yaw) * stats.velocity, Math.cos(yaw) * stats.velocity, stats);
    }

    this.debris.burst(sx, 1.15, sz, '#f2b705', 4, Math.sin(facing), Math.cos(facing));
    sfx('gun.shot', { param: shotWeight(stats), pitch: 0.94 + Math.random() * 0.12 });
    events.emit('camera:shake', { amount: 0.06 + stats.recoil * 0.008 });
    this.floaters.spawn(
      new THREE.Vector3(sx, 1.7, sz),
      WORDS[Math.floor(Math.random() * WORDS.length)],
      'word',
      '#f2b705',
      0,
      0,
      stats.damage * Math.max(1, stats.projectiles * 0.6),
    );
    this.inv.notify();
  }

  private spawnShot(x: number, y: number, z: number, vx: number, vz: number, stats: GunStats): void {
    const shot = this.pool.find((s) => !s.active);
    if (!shot) return;
    shot.active = true;
    shot.vx = vx;
    shot.vz = vz;
    shot.damage = stats.damage;
    shot.life = stats.range / Math.max(8, stats.velocity);
    shot.mesh.material = stats.ammoPerShot > 1 ? this.slugMat : this.tracerMat;
    shot.mesh.position.set(x, y, z);
    shot.mesh.rotation.y = Math.atan2(vx, vz);
    shot.mesh.visible = true;
  }

  private stepShots(dt: number): void {
    const r = CONFIG.combat.radius;
    for (const s of this.pool) {
      if (!s.active) continue;
      const nx = s.mesh.position.x + s.vx * dt;
      const nz = s.mesh.position.z + s.vz * dt;
      s.life -= dt;

      const enemy = this.horde.near(nx, nz, r + 0.35);
      if (enemy) {
        this.horde.hurt(enemy, s.damage);
        this.killShot(s, nx, nz);
        continue;
      }
      const wall = this.building.pieceNear(nx, nz, r + 0.15);
      if (wall) {
        this.building.damage(wall, s.damage * 0.45);
        this.killShot(s, nx, nz);
        continue;
      }
      if (s.life <= 0) {
        this.killShot(s, nx, nz, false);
        continue;
      }
      s.mesh.position.set(nx, s.mesh.position.y, nz);
      s.mesh.rotation.y = Math.atan2(s.vx, s.vz);
    }
  }

  private killShot(s: Shot, x: number, z: number, spark = true): void {
    if (spark) this.debris.burst(x, 1.1, z, '#f2b705', 5);
    s.active = false;
    s.mesh.visible = false;
  }

  private startReload(jam: boolean): void {
    if (this.reloading) return;
    const gun = this.gun;
    const stats = this.stats;
    if (!gun || !stats) return;
    if (!jam && gun.loaded >= stats.magSize) return;
    if (!jam && this.inv.count('ammo') <= 0) {
      events.emit('toast', { text: 'No cartridges left.', tone: 'warn' });
      return;
    }
    this.reloading = true;
    this.reloadT = 0;
    this.burstLeft = 0;
    if (jam) this.jammed = true;
    sfx(jam ? 'gun.jam' : 'gun.reload');
    this.floaters.spawn(this.player.position.clone().setY(2), jam ? 'TINK-TINK' : 'CHK-CHK', 'word');
  }

  private finishReload(gun: GunInstance, stats: GunStats): void {
    const need = stats.magSize - gun.loaded;
    const take = this.inv.remove('ammo', Math.max(0, need));
    gun.loaded += take;
    this.reloading = false;
    this.jammed = false;
    this.inv.notify();
    if (take > 0) sfx('gun.ready');
    _p.copy(this.player.position).setY(2.05);
    this.floaters.spawn(_p, take > 0 ? `+${take}` : 'EMPTY', take > 0 ? 'gain' : 'warn', '#d4b46a');
  }
}
