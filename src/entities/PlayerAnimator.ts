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

const RELAX: ArmPose = { armLx: 0.05, armLz: -0.12, armRx: 0.05, armRz: 0.12, foreLx: -0.3, foreRx: -0.3, twist: 0 };
const READY: ArmPose = { ...RELAX, armRx: -0.35, armRz: 0.18, foreRx: -1.0 };
const SPRINT: ArmPose = { armLx: -0.35, armLz: -0.25, armRx: -0.35, armRz: 0.25, foreLx: -1.25, foreRx: -1.1, twist: 0 };

/** Keyframes as [progress, pose overrides]; the swing hits at ~0.45 (see SWING_IMPACT). */
const CHOP: [number, Partial<ArmPose>][] = [
  [0, {}],
  [0.36, { armRx: -2.55, armRz: 0.32, foreRx: -1.35, armLx: -0.5, foreLx: -0.9, twist: -0.35 }],
  [0.47, { armRx: -0.85, armRz: 0.1, foreRx: -0.1, armLx: -0.3, foreLx: -0.6, twist: 0.3 }],
  [1, {}],
];
const PUNCH: [number, Partial<ArmPose>][] = [
  [0, {}],
  [0.3, { armRx: -0.9, armRz: 0.5, foreRx: -1.9, armLx: -0.8, foreLx: -1.6, twist: -0.4 }],
  [0.45, { armRx: -1.55, armRz: 0.02, foreRx: -0.05, armLx: -0.4, foreLx: -1.4, twist: 0.35 }],
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
  setHeld(model: THREE.Object3D | null): void {
    if (this.held) this.held.removeFromParent();
    this.held = model;
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
    this.armedBlend = damp(this.armedBlend, this.held ? 1 : 0, 10, dt);
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
