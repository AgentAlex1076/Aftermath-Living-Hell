import * as THREE from 'three';
import { CONFIG } from '../data/config';
import { clamp, damp, lerp, smoothstep, TAU } from '../core/math';
import type { Player } from './Player';

interface ArmPose {
  armLx: number;
  armLz: number;
  armRx: number;
  armRz: number;
  foreLx: number;
  foreRx: number;
  twist: number;
}

const RELAX: ArmPose = { armLx: 0.05, armLz: 0.14, armRx: 0.05, armRz: -0.14, foreLx: -0.28, foreRx: -0.28, twist: 0 };
const READY: ArmPose = { ...RELAX, armRx: -0.32, armRz: -0.16, foreRx: -0.95 };
const AIM: ArmPose = { armLx: -1.02, armLz: 0.12, armRx: -1.12, armRz: -0.06, foreLx: -0.2, foreRx: -0.12, twist: 0.08 };
const SPRINT: ArmPose = { armLx: -0.32, armLz: 0.18, armRx: -0.32, armRz: -0.18, foreLx: -1.2, foreRx: -1.1, twist: 0 };

/** Keyframes as [progress, pose overrides]; the swing hits at ~0.45 (see SWING_IMPACT). */
const CHOP: [number, Partial<ArmPose>][] = [
  [0, {}],
  [0.36, { armRx: -2.55, armRz: -0.25, foreRx: -1.35, armLx: -0.5, armLz: 0.18, foreLx: -0.9, twist: -0.35 }],
  [0.47, { armRx: -0.85, armRz: -0.1, foreRx: -0.1, armLx: -0.3, armLz: 0.14, foreLx: -0.6, twist: 0.3 }],
  [1, {}],
];
const PUNCH: [number, Partial<ArmPose>][] = [
  [0, {}],
  [0.3, { armRx: -0.9, armRz: -0.38, foreRx: -1.9, armLx: -0.8, armLz: 0.22, foreLx: -1.6, twist: -0.4 }],
  [0.45, { armRx: -1.55, armRz: -0.05, foreRx: -0.05, armLx: -0.4, armLz: 0.16, foreLx: -1.4, twist: 0.35 }],
  [1, {}],
];

const _axis = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _pose: ArmPose = { ...RELAX };

/** Procedural animation for the hazmat model: walk cycle, lean, breathing, swings, sprint, dodge roll. */
export class PlayerAnimator {
  private readonly n: Record<string, THREE.Object3D>;
  private phase = 0;
  private moveBlend = 0;
  private sprintBlend = 0;
  private armedBlend = 0;
  private time = 0;
  private dirX = 0;
  private dirZ = 1;
  private held: THREE.Object3D | null = null;
  private heldKind: 'none' | 'tool' | 'gun' = 'none';
  private gunBlend = 0;
  private climbPhase = 0;

  constructor(root: THREE.Object3D) {
    const names = ['rollPivot', 'body', 'hips', 'head', 'armL', 'armR', 'forearmL', 'forearmR', 'handR', 'legL', 'legR', 'shinL', 'shinR'];
    this.n = {};
    for (const name of names) {
      const node = root.getObjectByName(name);
      if (!node) throw new Error(`Hazmat model missing node "${name}"`);
      this.n[name] = node;
    }
  }

  /** Puts a model in the right hand (or empties it). */
  setHeld(model: THREE.Object3D | null, kind: 'tool' | 'gun' = 'tool'): void {
    if (this.held && this.held.parent === this.n.handR) this.held.removeFromParent();
    this.held = model;
    this.heldKind = model ? kind : 'none';
    if (model) {
      model.traverse((o) => {
        if (o instanceof THREE.Mesh) o.castShadow = true;
      });
      this.n.handR.add(model);
    }
  }

  update(dt: number, player: Player, facing: number): void {
    const n = this.n;
    this.time += dt;

    const vx = player.actualVelocity.x;
    const vz = player.actualVelocity.z;
    const speed = Math.hypot(vx, vz);
    const cos = Math.cos(facing);
    const sin = Math.sin(facing);
    if (speed > 0.2) {
      const lx = (vx * cos - vz * sin) / speed;
      const lz = (vx * sin + vz * cos) / speed;
      this.dirX = damp(this.dirX, lx, 12, dt);
      this.dirZ = damp(this.dirZ, lz, 12, dt);
    }

    const dodging = player.state === 'dodging';
    this.moveBlend = damp(this.moveBlend, dodging ? 0 : clamp(speed / CONFIG.player.walkSpeed, 0, 1.25), 10, dt);
    this.sprintBlend = damp(this.sprintBlend, player.sprinting ? 1 : 0, 8, dt);
    this.armedBlend = damp(this.armedBlend, this.heldKind === 'tool' ? 1 : 0, 10, dt);
    this.gunBlend = damp(this.gunBlend, this.heldKind === 'gun' ? 1 : 0, 10, dt);
    this.phase = (this.phase + dt * speed * 2.5) % TAU;

    const blend = Math.min(this.moveBlend, 1);
    const swing = Math.sin(this.phase) * (0.5 + 0.2 * this.sprintBlend) * blend;
    const kneeL = Math.max(0, Math.cos(this.phase)) * (0.7 + 0.4 * this.sprintBlend) * blend;
    const kneeR = Math.max(0, -Math.cos(this.phase)) * (0.7 + 0.4 * this.sprintBlend) * blend;

    n.legL.rotation.set(-swing * this.dirZ, 0, swing * this.dirX * 0.6);
    n.legR.rotation.set(swing * this.dirZ, 0, -swing * this.dirX * 0.6);
    n.shinL.rotation.x = kneeL + 0.05;
    n.shinR.rotation.x = kneeR + 0.05;

    // Base arm pose: relaxed or tool-ready, blended toward the sprint pump.
    blendPose(_pose, RELAX, READY, this.armedBlend, ['armRx', 'armRz', 'foreRx']);
    if (this.gunBlend > 0.01) {
      for (const k of Object.keys(_pose) as (keyof ArmPose)[]) _pose[k] = lerp(_pose[k], AIM[k], this.gunBlend);
      _pose.armRx -= player.kick * 0.35;
      _pose.armLx -= player.kick * 0.2;
    }
    const armSwing = Math.sin(this.phase) * 0.55 * blend;
    _pose.armLx += armSwing * this.dirZ;
    _pose.armRx -= armSwing * this.dirZ * (1 - this.armedBlend * 0.7);
    const s = this.sprintBlend;
    for (const k of Object.keys(_pose) as (keyof ArmPose)[]) _pose[k] = lerp(_pose[k], SPRINT[k], s);
    _pose.armLx += Math.sin(this.phase) * 0.3 * s;
    _pose.armRx -= Math.sin(this.phase) * 0.3 * s;

    if (player.swinging) applySwing(_pose, player.swingArmed ? CHOP : PUNCH, player.swingProgress);

    const breathe = Math.sin(this.time * 1.8);
    n.hips.position.y = 0.9 + (1 - Math.abs(Math.sin(this.phase))) * 0.05 * blend + breathe * 0.008 - 0.03 * blend;
    n.hips.rotation.set(
      this.dirZ * 0.1 * blend + this.sprintBlend * 0.14,
      Math.sin(this.phase) * 0.07 * blend * this.dirZ + _pose.twist,
      -this.dirX * 0.08 * blend,
    );
    n.head.rotation.set(breathe * 0.03 - this.sprintBlend * 0.1, -n.hips.rotation.y * 0.8, 0);

    n.armL.rotation.set(_pose.armLx + breathe * 0.02, 0, _pose.armLz);
    n.armR.rotation.set(_pose.armRx + breathe * 0.02, 0, _pose.armRz);
    n.forearmL.rotation.x = _pose.foreLx;
    n.forearmR.rotation.x = _pose.foreRx;

    this.updateRoll(player, facing);
    if (player.state === 'climbing') this.applyClimb(dt, player.linkDir);
  }

  /** Hand over hand up (or down) the rungs. */
  private applyClimb(dt: number, dir: number): void {
    const n = this.n;
    this.climbPhase += dt * 7 * dir;
    const s = Math.sin(this.climbPhase);
    n.armL.rotation.set(-2.45 + s * 0.35, 0, 0.12);
    n.armR.rotation.set(-2.45 - s * 0.35, 0, -0.12);
    n.forearmL.rotation.x = -0.45 - Math.max(0, s) * 0.5;
    n.forearmR.rotation.x = -0.45 - Math.max(0, -s) * 0.5;
    n.legL.rotation.set(-0.55 - s * 0.45, 0, 0);
    n.legR.rotation.set(-0.55 + s * 0.45, 0, 0);
    n.shinL.rotation.x = 0.85 + s * 0.4;
    n.shinR.rotation.x = 0.85 - s * 0.4;
    n.hips.rotation.set(0.1, 0, 0);
    n.head.rotation.set(-0.25, 0, 0);
  }

  private updateRoll(player: Player, facing: number): void {
    const n = this.n;
    const p = player.dodgeProgress;
    const tuck = Math.sin(p * Math.PI);

    if (p > 0) {
      const cos = Math.cos(facing);
      const sin = Math.sin(facing);
      const lx = player.dodgeDir.x * cos - player.dodgeDir.z * sin;
      const lz = player.dodgeDir.x * sin + player.dodgeDir.z * cos;
      _axis.set(lz, 0, -lx).normalize();
      const eased = p * p * (3 - 2 * p);
      _q.setFromAxisAngle(_axis, eased * TAU);
      n.rollPivot.quaternion.copy(_q);

      n.legL.rotation.x = lerp(n.legL.rotation.x, -1.3, tuck);
      n.legR.rotation.x = lerp(n.legR.rotation.x, -1.2, tuck);
      n.shinL.rotation.x = lerp(n.shinL.rotation.x, 2.0, tuck);
      n.shinR.rotation.x = lerp(n.shinR.rotation.x, 1.9, tuck);
      n.hips.rotation.x = lerp(n.hips.rotation.x, 0.6, tuck);
      n.armL.rotation.x = lerp(n.armL.rotation.x, -1.4, tuck);
      n.armR.rotation.x = lerp(n.armR.rotation.x, -1.4, tuck);
    } else {
      n.rollPivot.quaternion.identity();
    }
    n.rollPivot.position.y = 0.9 - 0.2 * tuck;
    n.body.scale.setScalar(1 - 0.3 * tuck);
  }

  /**
   * Cinematic cutscene character animation:
   * 0.00..0.95s: Atmospheric sky drop (flailing & wind drag)
   * 0.95..1.40s: Ground impact & prone splat (damped natural compression)
   * 1.40..2.20s: Hands push floor, chest raises, knees tuck under hips (crawling/kneeling)
   * 2.20..2.90s: Driving through feet and knees, torso straightens up into standing
   * 2.90..3.60s: Grounded upright stance, subtle dazed head roll & glove dust-off
   * 3.60+s: Fully blended to natural idle
   */
  updateIntroCutscene(elapsed: number): void {
    const n = this.n;
    const tFallEnd = 0.95;
    const tImpactEnd = 1.40;
    const tKneelEnd = 2.20;
    const tStandEnd = 2.90;
    const tSettleEnd = 3.60;

    // Reset scales
    n.body.scale.set(1, 1, 1);

    if (elapsed < tFallEnd) {
      // 1. Plummeting: aerodynamic drag and desperate limb flailing
      const u = clamp(elapsed / tFallEnd, 0, 1);
      const w = elapsed * 24;
      n.rollPivot.position.y = 0.9;
      n.rollPivot.rotation.set(0.35 + Math.sin(w * 0.4) * 0.15, Math.sin(elapsed * 4) * 0.25, Math.cos(w * 0.3) * 0.15);

      const stretch = 1 + u * 0.18;
      n.body.scale.set(1 / Math.sqrt(stretch), stretch, 1 / Math.sqrt(stretch));

      n.hips.position.y = 0.9;
      n.hips.rotation.set(0.15, 0, 0);
      n.head.rotation.set(-0.4, Math.sin(w * 0.6) * 0.2, 0);

      // Arms reaching upwards trying to stabilize
      n.armL.rotation.set(-2.4 + Math.sin(w) * 0.45, 0, -0.5);
      n.armR.rotation.set(-2.4 + Math.cos(w) * 0.45, 0, 0.5);
      n.forearmL.rotation.x = -0.5 + Math.sin(w * 1.2) * 0.25;
      n.forearmR.rotation.x = -0.5 + Math.cos(w * 1.2) * 0.25;

      // Legs kicking in air
      n.legL.rotation.set(Math.sin(w * 0.9) * 0.6, 0, -0.15);
      n.legR.rotation.set(-Math.sin(w * 0.9) * 0.6, 0, 0.15);
      n.shinL.rotation.x = 0.5 + Math.max(0, Math.cos(w * 0.9)) * 0.7;
      n.shinR.rotation.x = 0.5 + Math.max(0, -Math.cos(w * 0.9)) * 0.7;
      return;
    }

    if (elapsed < tImpactEnd) {
      // 2. Heavy prone impact & organic body compression (smooth spring rebound)
      const u = (elapsed - tFallEnd) / (tImpactEnd - tFallEnd);
      const bounce = Math.exp(-u * 6.5) * Math.sin(u * Math.PI * 4);
      const sy = clamp(1 - 0.45 * Math.max(0, bounce), 0.55, 1.0);
      const sx = 1 + (1 - sy) * 0.6;
      n.body.scale.set(sx, sy, sx);

      // Flat on ground facing downward (rollPivot tilted down 90 deg)
      n.rollPivot.position.y = 0.25;
      n.rollPivot.rotation.set(Math.PI / 2, 0, 0);

      n.hips.position.y = 0.9;
      n.hips.rotation.set(0, 0, 0);
      n.head.rotation.set(-0.15, Math.sin(u * 14) * 0.08 * (1 - u), 0);

      // Limbs spread on ground
      n.armL.rotation.set(-1.1, 0, -0.9);
      n.armR.rotation.set(-1.1, 0, 0.9);
      n.forearmL.rotation.x = -0.15;
      n.forearmR.rotation.x = -0.15;

      n.legL.rotation.set(0.1, 0, -0.25);
      n.legR.rotation.set(0.1, 0, 0.25);
      n.shinL.rotation.x = 0.1;
      n.shinR.rotation.x = 0.1;
      return;
    }

    if (elapsed < tKneelEnd) {
      // 3. Hands push against the floor, chest rises, knees tuck under hips into kneeling
      const u = (elapsed - tImpactEnd) / (tKneelEnd - tImpactEnd);
      const e = smoothstep(0, 1, u);

      // Pitch decreases from 90 deg (prone) to 40 deg (kneeling on all fours)
      n.rollPivot.position.y = lerp(0.25, 0.58, e);
      n.rollPivot.rotation.set(lerp(Math.PI / 2, 0.65, e), 0, 0);

      // Hips arch up
      n.hips.position.y = 0.9;
      n.hips.rotation.set(lerp(0, 0.35, e), 0, 0);
      n.head.rotation.set(lerp(-0.15, -0.4, e), 0, 0);

      // Arms push down straight onto ground (elbows extend from bent to support)
      n.armL.rotation.set(lerp(-1.1, -0.85, e), 0, lerp(-0.9, -0.3, e));
      n.armR.rotation.set(lerp(-1.1, -0.85, e), 0, lerp(0.9, 0.3, e));
      n.forearmL.rotation.x = lerp(-0.15, -0.55, e);
      n.forearmR.rotation.x = lerp(-0.15, -0.55, e);

      // Legs pull forward under torso, shins bend beneath body
      n.legL.rotation.set(lerp(0.1, -0.9, e), 0, -0.15);
      n.legR.rotation.set(lerp(0.1, -0.7, e), 0, 0.15);
      n.shinL.rotation.x = lerp(0.1, 1.85, e);
      n.shinR.rotation.x = lerp(0.1, 1.6, e);
      return;
    }

    if (elapsed < tStandEnd) {
      // 4. Powering up from knees to full standing posture
      const u = (elapsed - tKneelEnd) / (tStandEnd - tKneelEnd);
      const e = smoothstep(0, 1, u);

      // rollPivot rises from 0.58 to 0.9 and pitch uncurls from 0.65 to 0
      n.rollPivot.position.y = lerp(0.58, 0.9, e);
      n.rollPivot.rotation.set(lerp(0.65, 0, e), 0, 0);

      n.hips.position.y = 0.9;
      n.hips.rotation.set(lerp(0.35, 0, e), 0, 0);

      // Head lifts up looking forward
      n.head.rotation.set(lerp(-0.4, 0.05, e), 0, 0);

      // Arms leave the floor, swing back then hang naturally
      n.armL.rotation.set(lerp(-0.85, RELAX.armLx, e), 0, lerp(-0.3, RELAX.armLz, e));
      n.armR.rotation.set(lerp(-0.85, RELAX.armRx, e), 0, lerp(0.3, RELAX.armRz, e));
      n.forearmL.rotation.x = lerp(-0.55, RELAX.foreLx, e);
      n.forearmR.rotation.x = lerp(-0.55, RELAX.foreRx, e);

      // Legs extend fully straight
      n.legL.rotation.set(lerp(-0.9, 0, e), 0, lerp(-0.15, 0, e));
      n.legR.rotation.set(lerp(-0.7, 0, e), 0, lerp(0.15, 0, e));
      n.shinL.rotation.x = lerp(1.85, 0.05, e);
      n.shinR.rotation.x = lerp(1.6, 0.05, e);
      return;
    }

    // 5. Standing tall: checking gas mask seal & regulator, clearing vision, deep gasping breath
    const u = clamp((elapsed - tStandEnd) / (tSettleEnd - tStandEnd), 0, 1);

    n.rollPivot.position.y = 0.9;
    n.rollPivot.rotation.set(0, 0, 0);

    // Deep heavy chest breathing heave inside suit
    const chestHeave = Math.sin(u * Math.PI * 3) * 0.08 * (1 - u);
    n.hips.position.y = 0.9 + chestHeave;
    n.hips.rotation.set(-chestHeave * 0.8, 0, 0);

    // Head groggy roll then checking surroundings
    const headRoll = u < 0.4 ? Math.sin(u * 18) * 0.2 * (1 - u * 2) : Math.sin((u - 0.4) * 6) * 0.25;
    n.head.rotation.set(0.1 + chestHeave * 1.2, headRoll, 0);

    // Right glove reaches up to check gas mask filter seal (0.1..0.7) then returns to side
    const maskCheckPhase = u > 0.05 && u < 0.75 ? Math.sin(((u - 0.05) / 0.7) * Math.PI) : 0;
    n.armR.rotation.set(
      lerp(RELAX.armRx, -1.65, maskCheckPhase),
      lerp(0, -0.4, maskCheckPhase),
      lerp(RELAX.armRz, 0.45, maskCheckPhase),
    );
    n.forearmR.rotation.x = lerp(RELAX.foreRx, -1.85, maskCheckPhase);

    // Left arm balances and relaxes
    n.armL.rotation.set(RELAX.armLx + chestHeave * 0.5, 0, RELAX.armLz - maskCheckPhase * 0.2);
    n.forearmL.rotation.x = RELAX.foreLx;

    n.legL.rotation.set(0, 0, 0);
    n.legR.rotation.set(0, 0, 0);
    n.shinL.rotation.x = 0.05;
    n.shinR.rotation.x = 0.05;
  }
}

function blendPose(out: ArmPose, a: ArmPose, b: ArmPose, t: number, keys: (keyof ArmPose)[]): void {
  Object.assign(out, a);
  for (const k of keys) out[k] = lerp(a[k], b[k], t);
}

/** Layers swing keyframes over the current pose; empty keyframes mean "the base pose". */
function applySwing(pose: ArmPose, keys: [number, Partial<ArmPose>][], p: number): void {
  let i = 0;
  while (i < keys.length - 2 && p > keys[i + 1][0]) i++;
  const [t0, k0] = keys[i];
  const [t1, k1] = keys[i + 1];
  const raw = clamp((p - t0) / (t1 - t0), 0, 1);
  // Fast strike into the impact key, eased everywhere else.
  const t = i === 1 ? raw * raw : smoothstep(0, 1, raw);
  const base = { ...pose };
  for (const k of Object.keys(pose) as (keyof ArmPose)[]) {
    pose[k] = lerp(k0[k] ?? base[k], k1[k] ?? base[k], t);
  }
}
