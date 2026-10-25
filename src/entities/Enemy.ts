import * as THREE from 'three';
import { clamp, damp, dampAngle } from '../core/math';
import type { EnemyDef } from '../data/enemies';
import { models } from '../models/ModelRegistry';
import { mergeStatic } from '../models/merge';

export type EnemyState = 'idle' | 'walk' | 'attack' | 'dead';

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
  state: EnemyState = 'idle';
  raid = false;
  /** 0..1 of the current attack. Impact lands at 0.55. */
  attackT = 0;
  attackImpact = false;
  cooldown = 0;
  flinch = 0;
  deadT = 0;
  ventT = 0;
  stuck = 0;
  speed = 0;
  readonly wish = new THREE.Vector2();
  private readonly nodes: Record<string, THREE.Object3D>;
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
  }

  get alive(): boolean {
    return this.state !== 'dead' && this.object.visible;
  }

  spawn(x: number, z: number, raid: boolean): void {
    this.position.set(x, 0, z);
    this.facing = Math.atan2(-x, -z);
    this.hp = this.def.hp;
    this.state = 'walk';
    this.raid = raid;
    this.attackT = 0;
    this.attackImpact = false;
    this.cooldown = 0.2;
    this.flinch = 0;
    this.deadT = 0;
    this.ventT = this.def.vent ? this.def.vent.every * 0.4 : 0;
    this.stuck = 0;
    this.speed = 0;
    this.wish.set(0, 0);
    this.object.visible = true;
    this.object.position.set(x, 0, z);
    this.object.rotation.set(0, this.facing, 0);
    this.object.scale.setScalar(1);
  }

  beginAttack(): void {
    this.state = 'attack';
    this.attackT = 0;
    this.attackImpact = false;
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

  /** Pose the mesh. `alpha` is unused — enemies are stepped on the fixed tick. */
  animate(dt: number): void {
    const n = this.nodes;
    const d = this.def;
    this.object.position.set(this.position.x, 0, this.position.z);
    this.object.rotation.y = this.facing;

    if (this.state === 'dead') {
      this.deadT += dt;
      const t = clamp(this.deadT / 0.85, 0, 1);
      const ease = t * t;
      this.object.rotation.z = ease * (this.crawl ? 0.4 : 1.35);
      this.object.position.y = -ease * 0.35;
      this.object.scale.setScalar(1 - ease * 0.15);
      return;
    }

    this.flinch = Math.max(0, this.flinch - dt * 6);
    this.phase += dt * (1.6 + this.speed * 2.4);
    const swing = Math.sin(this.phase) * clamp(this.speed / Math.max(d.speed, 0.2), 0, 1);
    const bob = Math.abs(Math.sin(this.phase)) * 0.04 * clamp(this.speed, 0, 1);

    if (n.body) n.body.position.y = bob + this.flinch * 0.05;
    if (n.hips) {
      n.hips.rotation.x = (this.crawl ? 0 : 0.08) + swing * 0.06;
      n.hips.rotation.z = swing * 0.05 + this.flinch * 0.15;
    }
    if (n.head) n.head.rotation.x = -0.05 + Math.sin(this.phase * 0.5) * 0.08 + this.flinch * 0.2;

    let arm = 0.7 * swing;
    let leg = 0.7 * swing;
    if (this.state === 'attack') {
      const p = this.attackT;
      const strike = p < 0.55 ? p / 0.55 : 1 - (p - 0.55) / 0.45;
      arm = -1.6 * strike;
      if (n.hips) n.hips.rotation.x += strike * 0.35;
    }

    if (n.armL) n.armL.rotation.set(arm, 0, this.crawl ? 0.4 : -0.15);
    if (n.armR) n.armR.rotation.set(-arm - (this.state === 'attack' ? 0.8 : 0), 0, this.crawl ? -0.4 : 0.15);
    if (n.legL) n.legL.rotation.x = this.crawl ? swing * 0.8 : -leg;
    if (n.legR) n.legR.rotation.x = this.crawl ? -swing * 0.8 : leg;
  }
}

export function dampEnemyFacing(e: Enemy, target: number, dt: number): void {
  e.facing = dampAngle(e.facing, target, 8, dt);
}

export function blendSpeed(e: Enemy, target: number, dt: number): void {
  e.speed = damp(e.speed, target, 8, dt);
}
