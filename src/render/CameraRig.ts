import * as THREE from 'three';
import { CONFIG } from '../data/config';
import { DEG2RAD, clamp, dampFactor } from '../core/math';

/** Angled 3/4 top-down follow camera with zoom, aim look-ahead and trauma-based shake. */
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
  private trauma = 0;
  private time = 0;

  constructor(aspect: number) {
    const c = CONFIG.camera;
    this.camera = new THREE.PerspectiveCamera(c.fov, aspect, 0.5, 400);
    const yaw = c.yawDeg * DEG2RAD;
    const pitch = c.pitchDeg * DEG2RAD;
    this.offsetDir.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
  }

  get currentFocus(): THREE.Vector3 {
    return this.focus;
  }

  snapTo(target: THREE.Vector3): void {
    this.focus.copy(target);
    this.applyTransform();
  }

  addTrauma(amount: number): void {
    this.trauma = clamp(this.trauma + amount, 0, 1);
  }

  update(dt: number, target: THREE.Vector3, aim: THREE.Vector3 | null, wheelDelta: number): void {
    const c = CONFIG.camera;
    this.time += dt;

    if (wheelDelta !== 0) {
      this.targetDistance = clamp(this.targetDistance * (1 + wheelDelta * c.zoomStep), c.minDistance, c.maxDistance);
    }
    this.distance += (this.targetDistance - this.distance) * dampFactor(c.zoomSharpness, dt);

    this.lead.set(0, 0, 0);
    if (aim) {
      this.lead.set(aim.x - target.x, 0, aim.z - target.z).multiplyScalar(c.lookAhead);
      if (this.lead.length() > c.maxLookAhead) this.lead.setLength(c.maxLookAhead);
    }
    this.desiredFocus.copy(target).add(this.lead);
    this.focus.lerp(this.desiredFocus, dampFactor(c.followSharpness, dt));

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

  /** Unit vector on the ground plane pointing "up" on screen. */
  groundForward(out: THREE.Vector3): THREE.Vector3 {
    return out.set(-this.offsetDir.x, 0, -this.offsetDir.z).normalize();
  }

  /** Unit vector on the ground plane pointing "right" on screen. */
  groundRight(out: THREE.Vector3): THREE.Vector3 {
    this.groundForward(out);
    return out.set(-out.z, 0, out.x);
  }

  resize(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  private applyTransform(): void {
    this.camera.position.copy(this.focus).addScaledVector(this.offsetDir, this.distance).add(this.shakeOffset);
    this.lookTarget.copy(this.focus).addScaledVector(this.shakeOffset, 0.5);
    this.camera.lookAt(this.lookTarget);
  }
}
