import * as THREE from 'three';
import { damp } from '../core/math';
import { Rng } from '../core/random';
import { sfx } from '../audio/AudioEngine';

const DROPS = 3200;
const SPLASHES = 700;
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
    vec3 p = vec3(xz.x, y, xz.y);
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
  uniform float uScale;
  attribute vec3 aSeed;
  varying float vLife;
  varying float vOn;
  float hash(float n) { return fract(sin(n) * 43758.5453); }
  void main() {
    float rate = 1.6 + aSeed.y * 1.4;
    float cycle = uTime * rate + aSeed.x * 10.0;
    float k = floor(cycle);
    vLife = fract(cycle);
    vec2 r = vec2(hash(k * 12.9 + aSeed.z * 91.0), hash(k * 7.3 + aSeed.x * 53.0));
    vec2 xz = uFocus.xz + (r - 0.5) * uBox.xz * 0.7;
    vOn = step(aSeed.z, uIntensity);
    vec4 mv = modelViewMatrix * vec4(xz.x, 0.22, xz.y, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = (0.06 + vLife * 0.26) * uScale / -mv.z;
  }
`;

const splashFragment = /* glsl */ `
  varying float vLife;
  varying float vOn;
  void main() {
    vec2 q = gl_PointCoord - 0.5;
    float d = length(q) * 2.0;
    float ring = smoothstep(0.6, 0.85, d) * smoothstep(1.0, 0.85, d);
    float a = ring * (1.0 - vLife) * 0.5 * vOn;
    if (a < 0.01) discard;
    gl_FragColor = vec4(0.78, 0.84, 0.88, a);
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
  private readonly splashPoints: THREE.Points;
  private readonly wind = new THREE.Vector2(2.2, 0.8);
  private readonly ground: THREE.MeshStandardMaterial | null;
  private readonly groundColor = new THREE.Color();

  constructor(scene: THREE.Scene, seed: number) {
    this.rng = new Rng(seed ^ 0x7a1e);
    this.timer = this.rng.range(50, 120);

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
      uniforms: { ...shared, uScale: { value: 300 } },
      vertexShader: splashVertex,
      fragmentShader: splashFragment,
      transparent: true,
      depthWrite: false,
    });
    const sg = new THREE.BufferGeometry();
    const seeds = new Float32Array(SPLASHES * 3);
    for (let i = 0; i < seeds.length; i++) seeds[i] = this.rng.next();
    sg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SPLASHES * 3), 3));
    sg.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 3));
    this.splashPoints = new THREE.Points(sg, this.splashMat);
    this.splashPoints.frustumCulled = false;
    this.splashPoints.renderOrder = 4;
    this.splashPoints.name = 'splashes';
    scene.add(this.splashPoints);

    const terrain = scene.getObjectByName('terrain') as THREE.Mesh | undefined;
    this.ground = (terrain?.material as THREE.MeshStandardMaterial | undefined) ?? null;
    if (this.ground) this.groundColor.copy(this.ground.color);
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

  /** Drawing-buffer height and vertical FOV, so splash sprites can be sized in metres. */
  setPixelScale(heightPx: number, fovDeg = 38): void {
    this.splashMat.uniforms.uScale.value = heightPx / (2 * Math.tan((fovDeg * Math.PI) / 360));
  }

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
    this.splashPoints.visible = this.rain > 0.05;

    if (this.ground) {
      this.ground.color.copy(this.groundColor).multiplyScalar(1 - this.wet * 0.28);
      this.ground.roughness = 1 - this.wet * 0.42;
    }

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
      this.timer = this.rng.range(45, 120);
    } else {
      this.setKind('clear');
      this.timer = this.rng.range(70, 200);
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
