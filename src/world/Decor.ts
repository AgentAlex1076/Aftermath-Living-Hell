import * as THREE from 'three';
import { Rng } from '../core/random';
import type { BiomeId } from './Biomes';

const gasVertex = /* glsl */ `
  #include <common>
  #include <fog_pars_vertex>
  uniform float uTime;
  uniform vec3 uPlayer;
  varying vec2 vUv;
  varying float vAlpha;
  varying float vSeed;
  void main() {
    vUv = uv;
    vSeed = instanceColor.g;
    vec4 center = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    // Clear a pocket around the player so the hazmat suit stays readable inside clouds.
    vAlpha = instanceColor.r * smoothstep(2.5, 7.0, distance(center.xz, uPlayer.xz));
    float s = length(instanceMatrix[0].xyz);
    // Ground-parallel sheets: camera-facing billboards would slice into the ground with hard edges.
    float ang = vSeed * 6.2831 + uTime * 0.07 * (vSeed - 0.5);
    vec2 p = mat2(cos(ang), -sin(ang), sin(ang), cos(ang)) * position.xy * s;
    vec3 drift = vec3(sin(uTime * 0.11 + vSeed * 9.0), sin(uTime * 0.35 + vSeed * 20.0) * 0.08, cos(uTime * 0.09 + vSeed * 7.0)) * 0.6;
    vec4 mvPosition = modelViewMatrix * vec4(center.xyz + vec3(p.x, 0.0, p.y) + drift, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const gasFragment = /* glsl */ `
  #include <common>
  #include <fog_pars_fragment>
  uniform float uTime;
  uniform float uOpacity;
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  varying vec2 vUv;
  varying float vAlpha;
  varying float vSeed;
  float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vnoise(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash2(i), hash2(i + vec2(1.0, 0.0)), u.x), mix(hash2(i + vec2(0.0, 1.0)), hash2(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  void main() {
    vec2 q = vUv - 0.5;
    float r = length(q) * 2.0;
    float n = vnoise(vUv * 3.0 + vSeed * 17.0 + uTime * 0.05) * 0.6 + vnoise(vUv * 7.0 - uTime * 0.08 + vSeed * 5.0) * 0.4;
    float a = smoothstep(1.0, 0.15, r + (n - 0.5) * 0.7) * smoothstep(1.0, 0.75, r) * vAlpha * uOpacity;
    if (a < 0.004) discard;
    gl_FragColor = vec4(mix(uColorA, uColorB, n), a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;

let gasMaterial: THREE.ShaderMaterial | null = null;
const gasGeometry = new THREE.PlaneGeometry(1, 1);

export function getGasMaterial(): THREE.ShaderMaterial {
  if (!gasMaterial) {
    gasMaterial = new THREE.ShaderMaterial({
      uniforms: {
        ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
        uTime: { value: 0 },
        uPlayer: { value: new THREE.Vector3() },
        uOpacity: { value: 1 },
        uColorA: { value: new THREE.Color('#6f8f2a') },
        uColorB: { value: new THREE.Color('#a8d23a') },
      },
      vertexShader: gasVertex,
      fragmentShader: gasFragment,
      transparent: true,
      depthWrite: false,
      fog: true,
    });
  }
  return gasMaterial;
}

/** Billboard gas puffs on a jittered grid wherever `gasAt` is above a threshold. */
export function buildGasClouds(
  x0: number,
  z0: number,
  size: number,
  seed: number,
  gasAt: (x: number, z: number) => number,
): THREE.InstancedMesh | null {
  const rng = new Rng(seed);
  const step = 4;
  const per = Math.round(size / step);
  const max = per * per * 2;
  const mesh = new THREE.InstancedMesh(gasGeometry, getGasMaterial(), max);
  const m = new THREE.Matrix4();
  const c = new THREE.Color();
  let n = 0;
  for (let i = 0; i < per; i++) {
    for (let j = 0; j < per; j++) {
      const x = x0 + (i + 0.5) * step + rng.range(-1.6, 1.6);
      const z = z0 + (j + 0.5) * step + rng.range(-1.6, 1.6);
      const g = gasAt(x, z);
      if (g < 0.12) continue;
      for (let layer = 0; layer < 2 && n < max; layer++) {
        const s = rng.range(5, 9) * (0.7 + g * 0.4);
        m.makeScale(s, s, s).setPosition(x + rng.range(-1, 1), layer === 0 ? rng.range(0.25, 0.7) : rng.range(1.1, 2.0), z + rng.range(-1, 1));
        mesh.setMatrixAt(n, m);
        mesh.setColorAt(n, c.setRGB(Math.min(1, g) * (layer === 0 ? 0.4 : 0.26), rng.next(), 0));
        n++;
      }
    }
  }
  if (n === 0) {
    mesh.dispose();
    return null;
  }
  mesh.count = n;
  mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(x0 + size / 2, 1, z0 + size / 2), size * 0.75 + 6);
  mesh.renderOrder = 5;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.name = 'gas';
  return mesh;
}

const grassGeometry = (() => {
  const g = new THREE.ConeGeometry(0.045, 0.42, 3);
  g.translate(0, 0.21, 0);
  return g;
})();
const grassMaterial = new THREE.MeshStandardMaterial({ roughness: 1, flatShading: true });

const GRASS: Record<BiomeId, { clusters: number; a: string; b: string }> = {
  deadwood: { clusters: 230, a: '#5d5638', b: '#3b382a' },
  suburb: { clusters: 200, a: '#615a3a', b: '#433f2c' },
  industrial: { clusters: 70, a: '#57523a', b: '#3a382e' },
  toxic: { clusters: 150, a: '#6a7a2a', b: '#3f4c1a' },
};

/** Dead grass tufts for one chunk; `blocked` keeps them off roads, floors and the hut. */
export function buildGrass(
  x0: number,
  z0: number,
  size: number,
  seed: number,
  biomeAt: (x: number, z: number) => BiomeId,
  blocked: (x: number, z: number) => boolean,
): THREE.InstancedMesh | null {
  const rng = new Rng(seed);
  const biome = biomeAt(x0 + size / 2, z0 + size / 2);
  const def = GRASS[biome];
  const max = def.clusters * 5;
  const mesh = new THREE.InstancedMesh(grassGeometry, grassMaterial, max);
  const dummy = new THREE.Object3D();
  const colA = new THREE.Color(def.a);
  const colB = new THREE.Color(def.b);
  const col = new THREE.Color();
  let n = 0;
  // Every blade draws the same random numbers whether or not it's blocked, so blocking an area
  // later (a new foundation) only removes blades there instead of reshuffling the whole chunk.
  for (let k = 0; k < def.clusters; k++) {
    const cx = x0 + rng.range(0, size);
    const cz = z0 + rng.range(0, size);
    const blades = rng.int(3, 5);
    for (let b = 0; b < blades; b++) {
      const x = cx + rng.range(-0.25, 0.25);
      const z = cz + rng.range(-0.25, 0.25);
      dummy.rotation.set(rng.range(-0.35, 0.35), rng.range(0, Math.PI * 2), rng.range(-0.35, 0.35));
      const s = rng.range(0.6, 1.5);
      dummy.scale.set(s, s * rng.range(0.7, 1.3), s);
      const shade = rng.next();
      if (n >= max || blocked(x, z)) continue;
      dummy.position.set(x, 0, z);
      dummy.updateMatrix();
      mesh.setMatrixAt(n, dummy.matrix);
      mesh.setColorAt(n, col.copy(colA).lerp(colB, shade));
      n++;
    }
  }
  if (n === 0) {
    mesh.dispose();
    return null;
  }
  mesh.count = n;
  mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(x0 + size / 2, 0.3, z0 + size / 2), size * 0.75);
  mesh.receiveShadow = true;
  mesh.name = 'grass';
  return mesh;
}
