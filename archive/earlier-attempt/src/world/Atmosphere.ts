import * as THREE from 'three';

export const FOG_COLOR = 0x48504a;

const ASH_COUNT = 900;
const ASH_HALF = 22;
const ASH_HEIGHT = 14;

/** Overcast lighting, fog and drifting ash that follows the player. */
export class Atmosphere {
  readonly sun: THREE.DirectionalLight;
  private ash: THREE.Points;
  private ashPositions: Float32Array;
  private ashSpeeds: Float32Array;
  private sunOffset = new THREE.Vector3(18, 34, 14);

  constructor(scene: THREE.Scene) {
    scene.background = new THREE.Color(FOG_COLOR);
    scene.fog = new THREE.FogExp2(FOG_COLOR, 0.018);

    scene.add(new THREE.HemisphereLight(0xa9b3b8, 0x3a332a, 2.1));

    this.sun = new THREE.DirectionalLight(0xd2d6c2, 2.6);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const cam = this.sun.shadow.camera;
    cam.left = -30;
    cam.right = 30;
    cam.top = 30;
    cam.bottom = -30;
    cam.near = 1;
    cam.far = 100;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.03;
    scene.add(this.sun, this.sun.target);

    this.ashPositions = new Float32Array(ASH_COUNT * 3);
    this.ashSpeeds = new Float32Array(ASH_COUNT);
    for (let i = 0; i < ASH_COUNT; i++) {
      this.ashPositions[i * 3] = (Math.random() * 2 - 1) * ASH_HALF;
      this.ashPositions[i * 3 + 1] = Math.random() * ASH_HEIGHT;
      this.ashPositions[i * 3 + 2] = (Math.random() * 2 - 1) * ASH_HALF;
      this.ashSpeeds[i] = 0.3 + Math.random() * 0.6;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.ashPositions, 3));
    this.ash = new THREE.Points(
      geo,
      new THREE.PointsMaterial({ color: 0xa8a89a, size: 0.07, transparent: true, opacity: 0.55, depthWrite: false }),
    );
    this.ash.frustumCulled = false;
    scene.add(this.ash);
  }

  update(dt: number, time: number, focus: THREE.Vector3) {
    this.sun.position.copy(focus).add(this.sunOffset);
    this.sun.target.position.copy(focus);

    const p = this.ashPositions;
    const windX = Math.sin(time * 0.2) * 0.6 + 0.4;
    for (let i = 0; i < ASH_COUNT; i++) {
      const k = i * 3;
      p[k] += (windX + Math.sin(time + i) * 0.2) * dt;
      p[k + 1] -= this.ashSpeeds[i] * dt;
      p[k + 2] += Math.cos(time * 0.7 + i) * 0.2 * dt;
      if (p[k + 1] < 0) p[k + 1] += ASH_HEIGHT;
      if (p[k] - focus.x > ASH_HALF) p[k] -= ASH_HALF * 2;
      else if (p[k] - focus.x < -ASH_HALF) p[k] += ASH_HALF * 2;
      if (p[k + 2] - focus.z > ASH_HALF) p[k + 2] -= ASH_HALF * 2;
      else if (p[k + 2] - focus.z < -ASH_HALF) p[k + 2] += ASH_HALF * 2;
    }
    this.ash.geometry.attributes.position.needsUpdate = true;
  }
}
