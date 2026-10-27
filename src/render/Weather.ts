import * as THREE from 'three';
import { damp } from '../core/math';
import { Rng } from '../core/random';
import { sfx } from '../audio/AudioEngine';
import { getGroundMaterial } from '../world/Terrain';

const DROPS = 3200;
const SPLASH_EVENTS = 260;
const SPLASH_PARTS = 5;
const BOX = new THREE.Vector3(64, 26, 64);

export type WeatherKind = 'clear' | 'drizzle' | 'storm';

const rainVertex = /* glsl */ `
  uniform float uTime;
  uniform float uIntensity;
  uniform vec3 uFocus;
  uniform vec3 uBox;
  uniform vec2 uWind;
  attribute vec3 aDrop;
  attribute vec2 aCorner;
  varying float vAlpha;
  void main() {
    float speed = 21.0 + aDrop.z * 9.0;
    vec3 vel = vec3(uWind.x, -speed, uWind.y);
    vec3 base = position;
    float y = mod(base.y - uTime * speed, uBox.y);
    float fall = (uBox.y - y) / speed;
    vec2 xz = mod(base.xz + uWind * fall - uFocus.xz + uBox.xz * 0.5, uBox.xz) + uFocus.xz - uBox.xz * 0.5;
    vec3 p = vec3(xz.x, y + uFocus.y - 4.0, xz.y);
    float len = 0.55 + aDrop.z * 0.5;
    p -= normalize(vel) * len * aCorner.y;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    mv.x += aCorner.x * 0.018;
    gl_Position = projectionMatrix * mv;
    vAlpha = step(aDrop.x, uIntensity) * (0.32 + aDrop.y * 0.2) * (1.0 - aCorner.y * 0.85) * smoothstep(5.0, 11.0, -mv.z);
  }
`;

const rainFragment = /* glsl */ `
  varying float vAlpha;
  void main() {
    if (vAlpha < 0.01) discard;
    gl_FragColor = vec4(0.74, 0.8, 0.84, vAlpha);
  }
`;

const splashVertex = /* glsl */ `
  uniform float uTime;
  uniform float uIntensity;
  uniform vec3 uFocus;
  uniform vec3 uBox;
  attribute vec3 aSeed;
  attribute float aPart;
  attribute vec2 aCorner;
  varying float vLife;
  varying float vOn;
  varying float vRing;
  varying vec2 vUv;
  float hash(float n) { return fract(sin(n) * 43758.5453); }
  void main() {
    float rate = 1.35 + aSeed.y * 1.1;
    float cycle = uTime * rate + aSeed.x * 10.0;
    float k = floor(cycle);
    vLife = fract(cycle);
    vec2 r = vec2(hash(k * 12.9 + aSeed.z * 91.0), hash(k * 7.3 + aSeed.x * 53.0));
    vec2 xz = uFocus.xz + (r - 0.5) * uBox.xz * 0.55;
    vOn = step(aSeed.z, uIntensity);
    vRing = step(aPart, 0.5);
    vUv = aCorner * 0.5 + 0.5;
    vec3 p;
    if (aPart < 0.5) {
      float rad = 0.05 + vLife * 0.62;
      p = vec3(xz.x + aCorner.x * rad, uFocus.y + 0.03, xz.y + aCorner.y * rad);
    } else {
      float ang = aPart * 1.67 + aSeed.y * 6.2832;
      float dist = vLife * (0.16 + aSeed.z * 0.28);
      float h = vLife * (1.0 - vLife) * 0.52;
      vec3 world = vec3(xz.x + cos(ang) * dist, uFocus.y + 0.04 + h, xz.y + sin(ang) * dist);
      vec4 mv = modelViewMatrix * vec4(world, 1.0);
      mv.xy += aCorner * (0.028 + (1.0 - vLife) * 0.02);
      gl_Position = projectionMatrix * mv;
      return;
    }
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;

const splashFragment = /* glsl */ `
  varying float vLife;
  varying float vOn;
  varying float vRing;
  varying vec2 vUv;
  void main() {
    vec2 q = vUv - 0.5;
    float d = length(q) * 2.0;
    float a;
    if (vRing > 0.5) {
      float ring = smoothstep(0.55, 0.78, d) * smoothstep(1.0, 0.84, d);
      a = ring * (1.0 - vLife) * 0.55 * vOn;
    } else {
      a = (1.0 - d) * (1.0 - vLife) * 0.7 * vOn;
    }
    if (a < 0.01) discard;
    gl_FragColor = vec4(0.78, 0.85, 0.9, a);
  }
`;

/**
 * Rain that comes and goes on a seeded schedule, with lightning in storms. Rain streaks and
 * ground splashes are animated entirely on the GPU around the camera focus.
 */
export class Weather {
  kind: WeatherKind = 'clear';
  /** 0..1 how hard it's raining right now. */
  rain = 0;
  /** 0..1 how soaked the ground is; lags behind the rain. */
  wet = 0;
  /** 0..1 lightning flash this frame. */
  flash = 0;
  private target = 0;
  private timer: number;
  private boltT = 8;
  private bolts: { at: number; power: number }[] = [];
  private time = 0;
  private forced: WeatherKind | null = null;
  private readonly rng: Rng;
  private readonly rainMat: THREE.ShaderMaterial;
  private readonly splashMat: THREE.ShaderMaterial;
  private readonly rainMesh: THREE.Mesh;
  private readonly splashMesh: THREE.Mesh;
  private readonly wind = new THREE.Vector2(2.2, 0.8);
  private readonly ground: THREE.MeshStandardMaterial;
  private readonly groundColor = new THREE.Color();

  constructor(scene: THREE.Scene, seed: number) {
    this.rng = new Rng(seed ^ 0x7a1e);
    this.timer = this.rng.range(90, 200);

    const shared = {
      uTime: { value: 0 },
      uIntensity: { value: 0 },
      uFocus: { value: new THREE.Vector3() },
      uBox: { value: BOX.clone() },
    };
    this.rainMat = new THREE.ShaderMaterial({
      uniforms: { ...shared, uWind: { value: this.wind } },
      vertexShader: rainVertex,
      fragmentShader: rainFragment,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.rainMesh = new THREE.Mesh(buildRainGeometry(this.rng), this.rainMat);
    this.rainMesh.frustumCulled = false;
    this.rainMesh.renderOrder = 6;
    this.rainMesh.name = 'rain';
    scene.add(this.rainMesh);

    this.splashMat = new THREE.ShaderMaterial({
      uniforms: { ...shared },
      vertexShader: splashVertex,
      fragmentShader: splashFragment,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.splashMesh = new THREE.Mesh(buildSplashGeometry(this.rng), this.splashMat);
    this.splashMesh.frustumCulled = false;
    this.splashMesh.renderOrder = 4;
    this.splashMesh.name = 'splashes';
    scene.add(this.splashMesh);

    this.ground = getGroundMaterial();
    this.groundColor.copy(this.ground.color);
  }

  /** Debug: pin the weather (null returns it to the schedule). */
  force(kind: WeatherKind | null): void {
    this.forced = kind;
    if (kind) this.setKind(kind);
    if (kind === 'storm') this.boltT = 0.5;
  }

  /** Debug: a bolt right now. */
  strike(): void {
    this.bolt(0.2);
  }

  /** Kept so Game can still call it after a resize; splashes are now world-sized quads. */
  setPixelScale(_heightPx: number, _fovDeg = 38): void {}

  update(dt: number, focus: THREE.Vector3): void {
    this.time += dt;
    if (!this.forced) {
      this.timer -= dt;
      if (this.timer <= 0) this.advance();
    }
    this.rain = damp(this.rain, this.target, 0.35, dt);
    this.wet = damp(this.wet, this.rain > 0.1 ? 1 : 0, this.rain > 0.1 ? 0.06 : 0.025, dt);
    this.wind.set(2.2 + Math.sin(this.time * 0.17) * 1.4 + this.rain * 2, 0.8 + Math.cos(this.time * 0.11) * 0.9);

    for (const m of [this.rainMat, this.splashMat]) {
      m.uniforms.uTime.value = this.time;
      m.uniforms.uIntensity.value = this.rain;
      m.uniforms.uFocus.value.copy(focus);
    }
    this.rainMesh.visible = this.rain > 0.01;
    this.splashMesh.visible = this.rain > 0.05;

    this.ground.color.copy(this.groundColor).multiplyScalar(1 - this.wet * 0.28);
    this.ground.roughness = 1 - this.wet * 0.42;

    if (this.kind === 'storm' && this.rain > 0.6) {
      this.boltT -= dt;
      if (this.boltT <= 0) {
        this.boltT = this.rng.range(6, 18);
        this.bolt(this.rng.next());
      }
    }
    this.flash = 0;
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i];
      b.at -= dt;
      if (b.at > 0) continue;
      const age = -b.at;
      if (age > 0.5) {
        this.bolts.splice(i, 1);
        continue;
      }
      this.flash = Math.max(this.flash, b.power * Math.exp(-age * 9));
    }
  }

  private advance(): void {
    if (this.kind === 'clear') {
      this.setKind(this.rng.chance(0.35) ? 'storm' : 'drizzle');
      this.timer = this.rng.range(28, 80);
    } else {
      this.setKind('clear');
      this.timer = this.rng.range(160, 360);
    }
  }

  private setKind(kind: WeatherKind): void {
    this.kind = kind;
    this.target = kind === 'clear' ? 0 : kind === 'drizzle' ? this.rng.range(0.35, 0.55) : this.rng.range(0.8, 1);
  }

  /** `distance` 0 = right overhead, 1 = far off. */
  private bolt(distance: number): void {
    const power = 1 - distance * 0.6;
    this.bolts.push({ at: 0, power }, { at: 0.09, power: power * 0.6 }, { at: 0.22 + this.rng.range(0, 0.1), power: power * 0.85 });
    sfx('thunder', { param: distance, delay: 0.25 + distance * 2.4 });
  }
}

function buildRainGeometry(rng: Rng): THREE.BufferGeometry {
  const pos = new Float32Array(DROPS * 4 * 3);
  const drop = new Float32Array(DROPS * 4 * 3);
  const corner = new Float32Array(DROPS * 4 * 2);
  const index = new Uint32Array(DROPS * 6);
  const corners = [[-1, 0], [1, 0], [-1, 1], [1, 1]];
  for (let i = 0; i < DROPS; i++) {
    const x = rng.range(0, BOX.x);
    const y = rng.range(0, BOX.y);
    const z = rng.range(0, BOX.z);
    const a = rng.next();
    const b = rng.next();
    const c = rng.next();
    for (let k = 0; k < 4; k++) {
      const v = i * 4 + k;
      pos.set([x, y, z], v * 3);
      drop.set([a, b, c], v * 3);
      corner.set(corners[k], v * 2);
    }
    index.set([i * 4, i * 4 + 2, i * 4 + 1, i * 4 + 1, i * 4 + 2, i * 4 + 3], i * 6);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aDrop', new THREE.BufferAttribute(drop, 3));
  g.setAttribute('aCorner', new THREE.BufferAttribute(corner, 2));
  g.setIndex(new THREE.BufferAttribute(index, 1));
  return g;
}

function buildSplashGeometry(rng: Rng): THREE.BufferGeometry {
  const quads = SPLASH_EVENTS * SPLASH_PARTS;
  const pos = new Float32Array(quads * 4 * 3);
  const seed = new Float32Array(quads * 4 * 3);
  const part = new Float32Array(quads * 4);
  const corner = new Float32Array(quads * 4 * 2);
  const index = new Uint32Array(quads * 6);
  const corners: [number, number][] = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
  for (let e = 0; e < SPLASH_EVENTS; e++) {
    const sx = rng.next();
    const sy = rng.next();
    const sz = rng.next();
    for (let p = 0; p < SPLASH_PARTS; p++) {
      const i = e * SPLASH_PARTS + p;
      for (let k = 0; k < 4; k++) {
        const v = i * 4 + k;
        seed.set([sx, sy, sz], v * 3);
        part[v] = p;
        corner.set(corners[k], v * 2);
      }
      index.set([i * 4, i * 4 + 2, i * 4 + 1, i * 4 + 1, i * 4 + 2, i * 4 + 3], i * 6);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 3));
  g.setAttribute('aPart', new THREE.BufferAttribute(part, 1));
  g.setAttribute('aCorner', new THREE.BufferAttribute(corner, 2));
  g.setIndex(new THREE.BufferAttribute(index, 1));
  return g;
}
