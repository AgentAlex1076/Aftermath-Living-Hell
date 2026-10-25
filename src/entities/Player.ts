import * as THREE from 'three';
import { CONFIG } from '../data/config';
import { events } from '../core/EventBus';
import type { Input } from '../core/Input';
import { dampAngle, dampFactor } from '../core/math';
import type { CameraRig } from '../render/CameraRig';
import type { CollisionWorld } from '../physics/Collision';

export type PlayerState = 'normal' | 'dodging';

/** Fraction of a swing at which the hit lands. */
export const SWING_IMPACT = 0.45;

const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const _wish = new THREE.Vector3();
const _target = new THREE.Vector3();

export class Player {
  readonly object: THREE.Object3D;
  readonly position = new THREE.Vector3();
  readonly prevPosition = new THREE.Vector3();
  readonly velocity = new THREE.Vector3();
  /** Displacement per second after collision; what the animator should react to. */
  readonly actualVelocity = new THREE.Vector3();
  readonly aimPoint = new THREE.Vector3();
  readonly dodgeDir = new THREE.Vector3();

  facing = 0;
  prevFacing = 0;
  state: PlayerState = 'normal';
  health: number = CONFIG.player.maxHealth;
  filter: number = CONFIG.player.maxFilter;
  hunger: number = CONFIG.survival.startHunger;
  stamina: number = CONFIG.player.stamina.max;
  exhausted = false;
  sprinting = false;
  infiniteStamina = false;
  godMode = false;

  /** Extra mass from the equipped gun; applied as a move-speed penalty. */
  load = 0;
  aiming = false;
  /** Recoil kick, 0..1, decays each tick. */
  kick = 0;

  swinging = false;
  swingElapsed = 0;
  swingDuration = 0;
  /** What the current swing is with, so the animator can pick a punch or a tool chop. */
  swingArmed = false;
  private swingImpactDone = false;
  /** Set for exactly one tick when a swing reaches its impact frame. */
  swingImpact = false;

  dodgeElapsed = 0;
  private dodgeCooldown = 0;
  private staminaRegenDelay = 0;
  private hasAim = false;

  constructor(model: THREE.Object3D) {
    this.object = model;
  }

  get invulnerable(): boolean {
    return this.state === 'dodging' && this.dodgeElapsed < CONFIG.player.dodge.invulnerableTime;
  }

  get dodgeProgress(): number {
    return this.state === 'dodging' ? Math.min(this.dodgeElapsed / CONFIG.player.dodge.duration, 1) : 0;
  }

  get hasAimPoint(): boolean {
    return this.hasAim;
  }

  get swingProgress(): number {
    return this.swinging ? Math.min(this.swingElapsed / this.swingDuration, 1) : 0;
  }

  get alive(): boolean {
    return this.health > 0;
  }

  /** Starts a gathering swing. Returns false if busy (already swinging or rolling). */
  startSwing(duration: number, armed: boolean): boolean {
    if (this.swinging || this.state !== 'normal') return false;
    this.swinging = true;
    this.swingElapsed = 0;
    this.swingDuration = duration;
    this.swingArmed = armed;
    this.swingImpactDone = false;
    return true;
  }

  damage(amount: number): void {
    if (this.godMode || amount <= 0) return;
    this.health = Math.max(0, this.health - amount);
  }

  heal(amount: number): void {
    this.health = Math.min(CONFIG.player.maxHealth, this.health + amount);
  }

  teleport(x: number, z: number): void {
    this.position.set(x, 0, z);
    this.prevPosition.copy(this.position);
    this.velocity.set(0, 0, 0);
  }

  setAim(point: THREE.Vector3 | null): void {
    this.hasAim = point !== null;
    if (point) this.aimPoint.copy(point);
  }

  update(dt: number, input: Input, cam: CameraRig, world: CollisionWorld): void {
    const cfg = CONFIG.player;
    this.prevPosition.copy(this.position);
    this.prevFacing = this.facing;

    cam.groundForward(_fwd);
    cam.groundRight(_right);
    _wish
      .set(0, 0, 0)
      .addScaledVector(_fwd, input.axis('down', 'up'))
      .addScaledVector(_right, input.axis('left', 'right'));
    const moving = _wish.lengthSq() > 0;
    if (moving) _wish.normalize();

    this.dodgeCooldown = Math.max(0, this.dodgeCooldown - dt);

    this.swingImpact = false;
    if (this.swinging) {
      this.swingElapsed += dt;
      if (!this.swingImpactDone && this.swingProgress >= SWING_IMPACT) {
        this.swingImpactDone = true;
        this.swingImpact = true;
      }
      if (this.swingProgress >= 1) this.swinging = false;
    }

    if (this.state === 'dodging') {
      this.dodgeElapsed += dt;
      const t = this.dodgeElapsed / cfg.dodge.duration;
      if (t >= 1) {
        this.state = 'normal';
        this.velocity.copy(this.dodgeDir).multiplyScalar(cfg.walkSpeed);
      } else {
        const ease = 1 - t * t * 0.75;
        this.velocity.copy(this.dodgeDir).multiplyScalar(cfg.dodge.speed * ease);
        this.facing = dampAngle(this.facing, Math.atan2(this.dodgeDir.x, this.dodgeDir.z), 30, dt);
      }
    }

    if (this.state === 'normal') {
      if (input.wasPressed('dodge') && this.dodgeCooldown <= 0 && this.spendStamina(cfg.dodge.staminaCost)) {
        this.startDodge(moving ? _wish : null);
      } else {
        this.updateLocomotion(dt, input, moving);
      }
    }

    this.updateStamina(dt);

    this.position.addScaledVector(this.velocity, dt);
    world.resolveCircle(this.position, cfg.radius);
    this.actualVelocity.subVectors(this.position, this.prevPosition).divideScalar(dt);
  }

  private updateLocomotion(dt: number, input: Input, moving: boolean): void {
    const cfg = CONFIG.player;

    if (this.hasAim) {
      const aimYaw = Math.atan2(this.aimPoint.x - this.position.x, this.aimPoint.z - this.position.z);
      this.facing = dampAngle(this.facing, aimYaw, cfg.turnSpeed, dt);
    } else if (moving) {
      this.facing = dampAngle(this.facing, Math.atan2(_wish.x, _wish.z), cfg.turnSpeed * 0.6, dt);
    }

    this.kick = Math.max(0, this.kick - dt * 4);
    this.sprinting = moving && !this.swinging && !this.aiming && input.isDown('sprint') && !this.exhausted && this.stamina > 0;
    let speed = this.sprinting ? cfg.sprintSpeed : cfg.walkSpeed;
    if (this.swinging) speed *= cfg.swingMoveMultiplier;
    if (this.load > 0) speed *= CONFIG.guns.weightSoft / (CONFIG.guns.weightSoft + this.load);
    if (this.aiming) speed *= CONFIG.combat.aimMove;
    if (moving) {
      const facingX = Math.sin(this.facing);
      const facingZ = Math.cos(this.facing);
      if (facingX * _wish.x + facingZ * _wish.z < -0.3) speed *= cfg.backpedalMultiplier;
    }

    _target.copy(_wish).multiplyScalar(moving ? speed : 0);
    this.velocity.lerp(_target, dampFactor(cfg.acceleration, dt));
  }

  private startDodge(dir: THREE.Vector3 | null): void {
    if (dir) this.dodgeDir.copy(dir);
    else this.dodgeDir.set(Math.sin(this.facing), 0, Math.cos(this.facing));
    this.state = 'dodging';
    this.dodgeElapsed = 0;
    this.swinging = false;
    this.velocity.copy(this.dodgeDir).multiplyScalar(CONFIG.player.dodge.speed);
    this.dodgeCooldown = CONFIG.player.dodge.duration + CONFIG.player.dodge.cooldown;
    this.sprinting = false;
    events.emit('player:dodge', { x: this.dodgeDir.x, z: this.dodgeDir.z });
  }

  private spendStamina(amount: number): boolean {
    if (this.infiniteStamina) return true;
    if (this.stamina < amount * 0.5) return false;
    this.stamina = Math.max(0, this.stamina - amount);
    this.staminaRegenDelay = CONFIG.player.stamina.regenDelay;
    if (this.stamina <= 0) this.exhausted = true;
    return true;
  }

  private updateStamina(dt: number): void {
    const s = CONFIG.player.stamina;
    if (this.infiniteStamina) {
      this.stamina = s.max;
      this.exhausted = false;
      return;
    }
    if (this.sprinting && this.actualVelocity.lengthSq() > 1) {
      this.stamina = Math.max(0, this.stamina - s.sprintDrain * dt);
      this.staminaRegenDelay = s.regenDelay;
      if (this.stamina <= 0) {
        this.exhausted = true;
        this.sprinting = false;
      }
    } else if (this.state !== 'dodging') {
      this.staminaRegenDelay -= dt;
      if (this.staminaRegenDelay <= 0) this.stamina = Math.min(s.max, this.stamina + s.regen * dt);
    }
    if (this.exhausted && this.stamina >= s.exhaustedThreshold) this.exhausted = false;
  }
}
