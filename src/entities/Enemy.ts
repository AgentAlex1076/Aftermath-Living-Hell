import * as THREE from 'three';
import { clamp, damp, dampAngle } from '../core/math';
import type { EnemyDef } from '../data/enemies';
import { models } from '../models/ModelRegistry';
import { mergeStatic } from '../models/merge';

export type EnemyState = 'idle' | 'walk' | 'attack' | 'dead';
/** What the current attack does when it lands. */
export type AttackKind = 'melee' | 'spit' | 'scream' | 'slam';

/**
 * One mutant: pose, HP and a small procedural walk/attack/death on named body parts.
 * Pooled — `spawn` arms a recycled instance, `kill` starts the collapse, `reset` hides it.
 */
export class Enemy {
  readonly object: THREE.Object3D;
  readonly def: EnemyDef;
  readonly position = new THREE.Vector3();
  facing = 0;
  hp = 0;
  maxHp = 0;
  state: EnemyState = 'idle';
  raid = false;
  /** 0..1 of the current attack. Impact lands at 0.55. */
  attackT = 0;
  /** The current attack has already landed (it lands once). */
  attackImpact = false;
  attackKind: AttackKind = 'melee';
  attackTime = 0;
  readonly attackAt = new THREE.Vector2();
  cooldown = 0;
  /** Timer for the def's special move (spit, scream, slam). */
  specialT = 0;
  flinch = 0;
  deadT = 0;
  ventT = 0;
  stuck = 0;
  speed = 0;
  /** Seconds of Screamer frenzy left. */
  buffT = 0;
  /** How high a climber is up a wall. */
  lift = 0;
  /** Current opacity for cloaking mutants (1 for everyone else). */
  opacity = 1;
  calls = 0;
  broodStage = 0;
  voiceT = 0;
  readonly wish = new THREE.Vector2();
  private readonly nodes: Record<string, THREE.Object3D>;
  private readonly cloakMats: THREE.MeshStandardMaterial[] = [];
  private phase = 0;
  private crawl = false;

  constructor(def: EnemyDef, seed: number) {
    this.def = def;
    this.object = models.create(def.model, seed);
    mergeStatic(this.object);
    this.object.visible = false;
    this.nodes = {};
    for (const name of ['body', 'hips', 'head', 'armL', 'armR', 'legL', 'legR']) {
      const n = this.object.getObjectByName(name);
      if (n) this.nodes[name] = n;
    }
    this.crawl = def.id === 'crawler';
    if (def.cloak) this.makeCloakable();
  }

  get alive(): boolean {
    return this.state !== 'dead' && this.object.visible;
  }

  /** Hard to see: hidden from the minimap and from turrets. */
  get cloaked(): boolean {
    return this.opacity < 0.35;
  }

  get frenzied(): boolean {
    return this.buffT > 0;
  }

  spawn(x: number, z: number, raid: boolean, hpMul = 1): void {
    this.position.set(x, 0, z);
    this.facing = Math.atan2(-x, -z);
    this.maxHp = this.def.hp * hpMul;
    this.hp = this.maxHp;
    this.state = 'walk';
    this.raid = raid;
    this.attackT = 0;
    this.attackImpact = false;
    this.attackKind = 'melee';
    this.cooldown = 0.2;
    this.specialT = 1.5 + Math.random() * 1.5;
    this.flinch = 0;
    this.deadT = 0;
    this.ventT = this.def.vent ? this.def.vent.every * (0.3 + Math.random() * 0.4) : 0;
    this.stuck = 0;
    this.speed = 0;
    this.buffT = 0;
    this.lift = 0;
    this.calls = 0;
    this.broodStage = 0;
    this.voiceT = 2 + Math.random() * 6;
    this.wish.set(0, 0);
    this.setOpacity(1);
    this.object.visible = true;
    this.object.position.set(x, 0, z);
    this.object.rotation.set(0, this.facing, 0);
    this.object.scale.setScalar(1);
  }

  beginAttack(kind: AttackKind = 'melee', time = this.def.attackTime): void {
    this.state = 'attack';
    this.attackT = 0;
    this.attackImpact = false;
    this.attackKind = kind;
    this.attackTime = time;
  }

  hit(amount: number): boolean {
    if (!this.alive) return false;
    this.hp -= amount;
    this.flinch = 1;
    if (this.hp <= 0) {
      this.state = 'dead';
      this.deadT = 0;
      return true;
    }
    return false;
  }

  hide(): void {
    this.object.visible = false;
    this.state = 'idle';
    this.raid = false;
  }

  /** Eases toward `target` opacity. Eyes stay faintly lit so a cloaked stalker is never quite gone. */
  fadeTo(target: number, dt: number): void {
    if (!this.cloakMats.length) return;
    const next = damp(this.opacity, target, 5, dt);
    if (Math.abs(next - this.opacity) > 0.002) this.setOpacity(next);
  }

  /** Pose the mesh. `alpha` is unused — enemies are stepped on the fixed tick. */
  animate(dt: number): void {
    const n = this.nodes;
    const d = this.def;
    this.object.position.set(this.position.x, this.lift, this.position.z);
    this.object.rotation.y = this.facing;

    if (this.state === 'dead') {
      this.deadT += dt;
      const t = clamp(this.deadT / 0.85, 0, 1);
      const ease = t * t;
      this.lift = Math.max(0, this.lift - dt * 9);
      this.object.rotation.z = ease * (this.crawl ? 0.4 : 1.35);
      this.object.position.y = this.lift - ease * 0.35;
      this.object.scale.setScalar(1 - ease * 0.15);
      return;
    }

    this.flinch = Math.max(0, this.flinch - dt * 6);
    this.phase += dt * (1.6 + this.speed * 2.4) * (this.frenzied ? 1.35 : 1);
    const swing = Math.sin(this.phase) * clamp(this.speed / Math.max(d.speed, 0.2), 0, 1);
    const bob = Math.abs(Math.sin(this.phase)) * 0.04 * clamp(this.speed, 0, 1);

    if (n.body) n.body.position.y = bob + this.flinch * 0.05;
    if (n.hips) {
      n.hips.rotation.x = (this.crawl ? 0 : 0.08) + swing * 0.06;
      n.hips.rotation.z = swing * 0.05 + this.flinch * 0.15;
    }
    if (n.head) n.head.rotation.x = -0.05 + Math.sin(this.phase * 0.5) * 0.08 + this.flinch * 0.2;

    let arm = 0.7 * swing;
    const leg = 0.7 * swing;
    if (this.state === 'attack') {
      const p = this.attackT;
      const strike = p < 0.55 ? p / 0.55 : 1 - (p - 0.55) / 0.45;
      switch (this.attackKind) {
        case 'spit':
          arm = 0.3 * strike;
          if (n.hips) n.hips.rotation.x += p < 0.55 ? -0.35 * strike : 0.5 * strike;
          if (n.head) n.head.rotation.x += p < 0.55 ? -0.5 * strike : 0.6 * strike;
          break;
        case 'scream':
          arm = -2.2 * strike;
          if (n.hips) n.hips.rotation.x -= 0.3 * strike;
          if (n.head) n.head.rotation.x -= 0.9 * strike;
          break;
        case 'slam':
          arm = p < 0.55 ? -2.6 * (p / 0.55) : -2.6 + 3.4 * Math.min(1, (p - 0.55) / 0.12);
          if (n.hips) n.hips.rotation.x += p < 0.55 ? -0.25 * strike : 0.45 * strike;
          break;
        default:
          arm = -1.6 * strike;
          if (n.hips) n.hips.rotation.x += strike * 0.35;
      }
    } else if (this.lift > 0.15) {
      arm = -2.4 + Math.sin(this.phase * 2) * 0.4;
    }

    const attacking = this.state === 'attack';
    const both = attacking ? this.attackKind !== 'melee' : this.lift > 0.15;
    const armR = both ? arm : -arm - (attacking ? 0.8 : 0);
    if (n.armL) n.armL.rotation.set(arm, 0, this.crawl ? 0.4 : -0.15);
    if (n.armR) n.armR.rotation.set(armR, 0, this.crawl ? -0.4 : 0.15);
    if (n.legL) n.legL.rotation.x = this.crawl ? swing * 0.8 : -leg;
    if (n.legR) n.legR.rotation.x = this.crawl ? -swing * 0.8 : leg;
  }

  private makeCloakable(): void {
    const swapped = new Map<THREE.Material, THREE.MeshStandardMaterial>();
    this.object.traverse((o) => {
      if (!(o instanceof THREE.Mesh) || Array.isArray(o.material)) return;
      let m = swapped.get(o.material);
      if (!m) {
        m = (o.material as THREE.MeshStandardMaterial).clone();
        m.transparent = true;
        swapped.set(o.material, m);
        this.cloakMats.push(m);
      }
      o.material = m;
    });
  }

  private setOpacity(v: number): void {
    this.opacity = v;
    if (!this.cloakMats.length) return;
    for (const m of this.cloakMats) {
      m.opacity = m.name === 'toxicGlow' ? Math.max(v, 0.7) : v;
      m.depthWrite = v > 0.6;
    }
    this.object.traverse((o) => {
      if (o instanceof THREE.Mesh) o.castShadow = v > 0.35;
    });
  }
}

export function dampEnemyFacing(e: Enemy, target: number, dt: number): void {
  e.facing = dampAngle(e.facing, target, 8, dt);
}

export function blendSpeed(e: Enemy, target: number, dt: number): void {
  e.speed = damp(e.speed, target, 8, dt);
}
