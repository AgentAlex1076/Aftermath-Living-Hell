import * as THREE from 'three';
import { CONFIG } from '../data/config';
import { DEG2RAD, clamp, damp, dampFactor } from '../core/math';

export type CameraMode = 'fixed' | 'free';

/**
 * Camera rig providing the signature 3/4 top-down isometric view with smooth
 * lookahead, camera shake, cutscene positioning, and zoom controls.
 */
export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  private readonly offsetDir = new THREE.Vector3();
  private readonly focus = new THREE.Vector3();
  private readonly desiredFocus = new THREE.Vector3();
  private readonly lead = new THREE.Vector3();
  private readonly shakeOffset = new THREE.Vector3();
  private readonly lookTarget = new THREE.Vector3();

  private distance: number = CONFIG.camera.distance;
  private targetDistance: number = CONFIG.camera.distance;
  private yawDeg: number = CONFIG.camera.yawDeg;
  private pitchDeg: number = CONFIG.camera.pitchDeg;
  private targetYawDeg: number = CONFIG.camera.yawDeg;
  private targetPitchDeg: number = CONFIG.camera.pitchDeg;
  private trauma = 0;
  private time = 0;

  /** `fixed` = default isometric; `free` = player can orbit (unless locked). */
  mode: CameraMode = 'fixed';
  /** Free-cam only: keep the current orbit angles and ignore further RMB drag. */
  locked = false;

  constructor(aspect: number) {
    const c = CONFIG.camera;
    this.camera = new THREE.PerspectiveCamera(c.fov, aspect, 0.5, 520);
    this.applyAngles();
  }

  get currentFocus(): THREE.Vector3 {
    return this.focus;
  }

  get canOrbit(): boolean {
    return this.mode === 'free' && !this.locked;
  }

  snapTo(target: THREE.Vector3): void {
    this.focus.copy(target);
    this.applyTransform();
  }

  addTrauma(amount: number): void {
    this.trauma = clamp(this.trauma + amount, 0, 1);
  }

  /** Snap angles back to the default isometric view. */
  resetFixed(): void {
    const c = CONFIG.camera;
    this.mode = 'fixed';
    this.locked = false;
    this.targetYawDeg = c.yawDeg;
    this.targetPitchDeg = c.pitchDeg;
    this.yawDeg = c.yawDeg;
    this.pitchDeg = c.pitchDeg;
    this.applyAngles();
  }

  setFree(locked = false): void {
    this.mode = 'free';
    this.locked = locked;
    this.targetYawDeg = this.yawDeg;
    this.targetPitchDeg = this.pitchDeg;
  }

  toggleLock(): void {
    if (this.mode !== 'free') {
      this.setFree(true);
      return;
    }
    this.locked = !this.locked;
    if (this.locked) {
      this.targetYawDeg = this.yawDeg;
      this.targetPitchDeg = this.pitchDeg;
    }
  }

  /** Directly positions the camera for cinematic cutscenes while preserving trauma shake. */
  updateCutscene(dt: number, target: THREE.Vector3, yawDeg: number, pitchDeg: number, distance: number): void {
    const c = CONFIG.camera;
    this.time += dt;
    this.focus.copy(target);
    this.distance = distance;
    this.targetDistance = distance;
    this.yawDeg = yawDeg;
    this.pitchDeg = pitchDeg;
    this.targetYawDeg = yawDeg;
    this.targetPitchDeg = pitchDeg;

    const yaw = yawDeg * DEG2RAD;
    const pitch = pitchDeg * DEG2RAD;
    this.offsetDir.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));

    this.trauma = Math.max(0, this.trauma - dt * 1.6);
    const shake = this.trauma * this.trauma * c.maxShake;
    const t = this.time * 38;
    this.shakeOffset.set(
      Math.sin(t * 1.1) * Math.cos(t * 0.37) * shake,
      Math.sin(t * 0.9 + 1.3) * shake * 0.6,
      Math.cos(t * 1.3 + 0.6) * Math.sin(t * 0.53) * shake,
    );

    this.applyTransform();
  }

  update(
    dt: number,
    target: THREE.Vector3,
    aim: THREE.Vector3 | null,
    wheelDelta: number,
  ): void {
    const c = CONFIG.camera;
    this.time += dt;

    this.trauma = Math.max(0, this.trauma - dt * 1.6);
    const shake = this.trauma * this.trauma * c.maxShake;
    const t = this.time * 38;
    this.shakeOffset.set(
      Math.sin(t * 1.1) * Math.cos(t * 0.37) * shake,
      Math.sin(t * 0.9 + 1.3) * shake * 0.6,
      Math.cos(t * 1.3 + 0.6) * Math.sin(t * 0.53) * shake,
    );

    if (this.mode === 'fixed') {
      this.targetYawDeg = c.yawDeg;
      this.targetPitchDeg = c.pitchDeg;
    }
    this.yawDeg = damp(this.yawDeg, this.targetYawDeg, c.orbitSharpness, dt);
    this.pitchDeg = damp(this.pitchDeg, this.targetPitchDeg, c.orbitSharpness, dt);
    this.applyAngles();

    if (wheelDelta !== 0) {
      this.targetDistance = clamp(this.targetDistance * (1 + wheelDelta * c.zoomStep), c.minDistance, c.maxDistance);
    }
    this.distance += (this.targetDistance - this.distance) * dampFactor(c.zoomSharpness, dt);

    this.lead.set(0, 0, 0);
    if (aim) {
      this.lead.set(aim.x - target.x, 0, aim.z - target.z).multiplyScalar(c.lookAhead);
      if (this.lead.length() > c.maxLookAhead) this.lead.setLength(c.maxLookAhead);
    }
    this.desiredFocus.copy(target).setY(target.y + 1.0).add(this.lead);
    this.focus.lerp(this.desiredFocus, dampFactor(c.followSharpness, dt));

    this.applyTransform();
  }

  /** Unit vector on the ground plane pointing "up" on screen / forward in movement direction. */
  groundForward(out: THREE.Vector3): THREE.Vector3 {
    return out.set(-this.offsetDir.x, 0, -this.offsetDir.z).normalize();
  }

  /** Unit vector on the ground plane pointing "right" on screen / strafe right direction. */
  groundRight(out: THREE.Vector3): THREE.Vector3 {
    this.groundForward(out);
    return out.set(-out.z, 0, out.x);
  }

  /** Orbit around the focus from an RMB drag. `dx`/`dy` are pixels. */
  orbit(dx: number, dy: number): void {
    if (!this.canOrbit) return;
    const c = CONFIG.camera;
    // Drag right / up moves the view the same way (not inverted).
    this.targetYawDeg -= dx * c.orbitYaw;
    this.targetPitchDeg = clamp(this.targetPitchDeg + dy * c.orbitPitch, c.minPitchDeg, c.maxPitchDeg);
  }

  resize(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  private applyAngles(): void {
    const yaw = this.yawDeg * DEG2RAD;
    const pitch = this.pitchDeg * DEG2RAD;
    this.offsetDir.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
  }

  private applyTransform(): void {
    this.camera.position.copy(this.focus).addScaledVector(this.offsetDir, this.distance).add(this.shakeOffset);
    this.lookTarget.copy(this.focus).addScaledVector(this.shakeOffset, 0.5);
    this.camera.lookAt(this.lookTarget);
  }
}
