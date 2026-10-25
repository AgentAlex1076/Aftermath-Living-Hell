import * as THREE from 'three';
import { CONFIG } from '../data/config';
import { DEG2RAD, clamp, dampFactor, lerp, smoothstep } from '../core/math';

export type PerspectiveMode = 'first-person' | 'third-person';

/**
 * Camera rig supporting both 3/4 top-down view and immersive First-Person mode.
 * In First-Person mode, entering Build Mode triggers a smooth, fast camera swoop
 * up to top-down view for easy placement, and swoops back into first person on exit.
 */
export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  private readonly offsetDir = new THREE.Vector3();
  private readonly focus = new THREE.Vector3();
  private readonly desiredFocus = new THREE.Vector3();
  private readonly lead = new THREE.Vector3();
  private readonly shakeOffset = new THREE.Vector3();
  private readonly lookTarget = new THREE.Vector3();

  // Scratch vectors for interpolation
  private readonly fpPos = new THREE.Vector3();
  private readonly fpTarget = new THREE.Vector3();
  private readonly tdPos = new THREE.Vector3();
  private readonly tdTarget = new THREE.Vector3();

  private distance: number = CONFIG.camera.distance;
  private targetDistance: number = CONFIG.camera.distance;
  private trauma = 0;
  private time = 0;

  // First-person state
  perspective: PerspectiveMode = 'third-person';
  fpYaw = 0;
  fpPitch = 0;
  eyeHeight = 1.55;
  eyeForward = 0.12;
  readonly sensitivity = 0.0022;

  // Build mode transition (0 = first person, 1 = top-down build view)
  buildTransition = 0;
  private targetBuildTransition = 0;

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

  get isFirstPerson(): boolean {
    return this.perspective === 'first-person';
  }

  get isBuildModeActive(): boolean {
    return this.targetBuildTransition === 1;
  }

  setPerspective(p: PerspectiveMode): void {
    this.perspective = p;
    this.camera.fov = CONFIG.camera.fov;
    this.camera.near = 0.5;
    this.camera.updateProjectionMatrix();
  }

  setYaw(yaw: number): void {
    this.fpYaw = yaw;
  }

  setBuildMode(active: boolean): void {
    this.targetBuildTransition = active ? 1 : 0;
  }

  snapTo(target: THREE.Vector3): void {
    this.focus.copy(target);
    this.applyTransform();
  }

  addTrauma(amount: number): void {
    this.trauma = clamp(this.trauma + amount, 0, 1);
  }

  /** Directly positions the camera for cinematic cutscenes while preserving trauma shake. */
  updateCutscene(dt: number, target: THREE.Vector3, yawDeg: number, pitchDeg: number, distance: number): void {
    const c = CONFIG.camera;
    this.time += dt;
    this.focus.copy(target);
    this.distance = distance;
    this.targetDistance = distance;

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

  /** Pans and zooms the camera from the cinematic angle smoothly into the survivor's eyes/view. */
  updateCutscenePanToFirstPerson(
    dt: number,
    playerPos: THREE.Vector3,
    facing: number,
    progress: number,
    fromYawDeg = 75,
    fromPitchDeg = 22,
    fromDist = 5.8,
    fromFocusY = 0.85,
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

    // Dynamic cutscene vantage point matching the current cutscene Steadicam shot
    const initYaw = fromYawDeg * DEG2RAD;
    const initPitch = fromPitchDeg * DEG2RAD;
    const initFocus = this.focus.set(playerPos.x, fromFocusY, playerPos.z);
    const initDir = this.offsetDir.set(
      Math.sin(initYaw) * Math.cos(initPitch),
      Math.sin(initPitch),
      Math.cos(initYaw) * Math.cos(initPitch),
    );
    this.tdPos.copy(initFocus).addScaledVector(initDir, fromDist);
    this.tdTarget.copy(initFocus);

    // Final eye level position & forward target
    const groundY = Math.abs(playerPos.y - 1.0) < 0.2 ? playerPos.y - 1.0 : playerPos.y;
    const fwdOffsetX = Math.sin(facing) * this.eyeForward;
    const fwdOffsetZ = Math.cos(facing) * this.eyeForward;
    this.fpPos.set(playerPos.x + fwdOffsetX, groundY + this.eyeHeight, playerPos.z + fwdOffsetZ);
    this.fpTarget.set(
      this.fpPos.x + Math.sin(facing) * 5,
      this.fpPos.y,
      this.fpPos.z + Math.cos(facing) * 5,
    );

    // Interpolate smoothly
    const u = clamp(progress, 0, 1);
    const e = smoothstep(0, 1, u);
    this.camera.position.lerpVectors(this.tdPos, this.fpPos, e).add(this.shakeOffset);
    this.lookTarget.lerpVectors(this.tdTarget, this.fpTarget, e).addScaledVector(this.shakeOffset, 0.5);
    this.camera.lookAt(this.lookTarget);

    const targetFov = lerp(c.fov, 76, e);
    if (Math.abs(this.camera.fov - targetFov) > 0.05) {
      this.camera.fov = targetFov;
      this.camera.near = lerp(0.5, 0.08, e);
      this.camera.updateProjectionMatrix();
    }
  }

  update(
    dt: number,
    target: THREE.Vector3,
    aim: THREE.Vector3 | null,
    wheelDelta: number,
    mouseDx = 0,
    mouseDy = 0,
    dodgeProgress = 0,
    walkBobY = 0,
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

    if (this.perspective === 'first-person') {
      this.updateFirstPerson(dt, target, wheelDelta, mouseDx, mouseDy, dodgeProgress, walkBobY);
      return;
    }

    // Classic Top-Down update
    const yaw = c.yawDeg * DEG2RAD;
    const pitch = c.pitchDeg * DEG2RAD;
    this.offsetDir.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));

    if (wheelDelta !== 0) {
      this.targetDistance = clamp(this.targetDistance * (1 + wheelDelta * c.zoomStep), c.minDistance, c.maxDistance);
    }
    this.distance += (this.targetDistance - this.distance) * dampFactor(c.zoomSharpness, dt);

    this.lead.set(0, 0, 0);
    if (aim) {
      this.lead.set(aim.x - target.x, 0, aim.z - target.z).multiplyScalar(c.lookAhead);
      if (this.lead.length() > c.maxLookAhead) this.lead.setLength(c.maxLookAhead);
    }
    const groundY = Math.abs(target.y - 1.0) < 0.2 ? target.y - 1.0 : target.y;
    this.desiredFocus.copy(target).setY(groundY + 1.0).add(this.lead);
    this.focus.lerp(this.desiredFocus, dampFactor(c.followSharpness, dt));

    this.applyTransform();
  }

  private updateFirstPerson(
    dt: number,
    target: THREE.Vector3,
    wheelDelta: number,
    mouseDx: number,
    mouseDy: number,
    dodgeProgress: number,
    walkBobY: number,
  ): void {
    const c = CONFIG.camera;

    // Mouse look when in first-person (not in build mode or early transition)
    if (this.buildTransition < 0.85) {
      this.fpYaw -= mouseDx * this.sensitivity;
      this.fpPitch = clamp(this.fpPitch - mouseDy * this.sensitivity, -1.45, 1.45);
    }

    // Smooth, somewhat fast build mode swoop animation (~0.35s)
    const buildSharpness = 12;
    this.buildTransition += (this.targetBuildTransition - this.buildTransition) * dampFactor(buildSharpness, dt);
    if (Math.abs(this.buildTransition - this.targetBuildTransition) < 0.002) {
      this.buildTransition = this.targetBuildTransition;
    }

    // Smoothly interpolate FOV between FP (76) and Top-Down (CONFIG.camera.fov = 38)
    const targetFov = lerp(76, c.fov, this.buildTransition);
    if (Math.abs(this.camera.fov - targetFov) > 0.05) {
      this.camera.fov = targetFov;
      this.camera.near = lerp(0.08, 0.5, this.buildTransition);
      this.camera.updateProjectionMatrix();
    }

    // Top-down target parameters during build mode
    const yaw = c.yawDeg * DEG2RAD;
    const pitch = c.pitchDeg * DEG2RAD;
    this.offsetDir.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
    if (wheelDelta !== 0 && this.buildTransition > 0.5) {
      this.targetDistance = clamp(this.targetDistance * (1 + wheelDelta * c.zoomStep), c.minDistance, c.maxDistance);
    }
    this.distance += (this.targetDistance - this.distance) * dampFactor(c.zoomSharpness, dt);

    const groundY = Math.abs(target.y - 1.0) < 0.2 ? target.y - 1.0 : target.y;
    this.desiredFocus.copy(target).setY(groundY + 1.0);
    this.focus.lerp(this.desiredFocus, dampFactor(c.followSharpness, dt));

    // 1. Calculate Top-Down Camera position & target
    this.tdPos.copy(this.focus).addScaledVector(this.offsetDir, this.distance);
    this.tdTarget.copy(this.focus);

    // 2. Calculate First-Person Camera position & target
    const tuck = Math.sin(dodgeProgress * Math.PI);
    const dodgeDip = tuck * 0.38;
    const dodgeRoll = tuck * 0.12;

    const eyeY = this.eyeHeight - dodgeDip + walkBobY;
    const fwdOffsetX = Math.sin(this.fpYaw) * this.eyeForward;
    const fwdOffsetZ = Math.cos(this.fpYaw) * this.eyeForward;
    this.fpPos.set(target.x + fwdOffsetX, groundY + eyeY, target.z + fwdOffsetZ);

    const cosP = Math.cos(this.fpPitch);
    const fwdX = Math.sin(this.fpYaw) * cosP;
    const fwdY = Math.sin(this.fpPitch);
    const fwdZ = Math.cos(this.fpYaw) * cosP;
    this.fpTarget.set(this.fpPos.x + fwdX * 5, this.fpPos.y + fwdY * 5, this.fpPos.z + fwdZ * 5);

    // 3. Interpolate between First-Person and Top-Down
    const u = this.buildTransition;
    this.camera.position.lerpVectors(this.fpPos, this.tdPos, u).add(this.shakeOffset);
    this.lookTarget.lerpVectors(this.fpTarget, this.tdTarget, u).addScaledVector(this.shakeOffset, 0.5);
    this.camera.lookAt(this.lookTarget);

    // Add dodge roll tilt in first-person
    if (u < 0.5 && dodgeRoll !== 0) {
      this.camera.rotation.z += dodgeRoll;
    }
  }

  /** Unit vector on the ground plane pointing "up" on screen / forward in movement direction. */
  groundForward(out: THREE.Vector3): THREE.Vector3 {
    if (this.perspective === 'first-person' && this.buildTransition < 0.5) {
      return out.set(Math.sin(this.fpYaw), 0, Math.cos(this.fpYaw)).normalize();
    }
    return out.set(-this.offsetDir.x, 0, -this.offsetDir.z).normalize();
  }

  /** Unit vector on the ground plane pointing "right" on screen / strafe right direction. */
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
