import * as THREE from 'three';
import { smoothstep } from '../core/math';
import { Rng } from '../core/random';
import type { BiomeId } from './Biomes';
import type { Decal } from './Regions';
import { addTerrainCutout } from './Terrain';

const gasVertex = /* glsl */ `
  #include <common>
  #include <fog_pars_vertex>
  uniform float uTime;
  uniform vec3 uPlayer;
  uniform vec2 uPocket;
  varying vec2 vUv;
  varying float vAlpha;
  varying float vSeed;
  void main() {
    vUv = uv;
    vSeed = instanceColor.g;
    vec4 center = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    // Clear a pocket around the player so the hazmat suit stays readable inside clouds.
    vAlpha = instanceColor.r * smoothstep(uPocket.x, uPocket.y, distance(center.xz, uPlayer.xz));
    float s = length(instanceMatrix[0].xyz);
    // Ground-parallel sheets: camera-facing billboards would slice into the ground with hard edges.
    float ang = vSeed * 6.2831 + uTime * 0.07 * (vSeed - 0.5);
    vec2 p = mat2(cos(ang), -sin(ang), sin(ang), cos(ang)) * position.xy * s;
    vec3 drift = vec3(sin(uTime * 0.11 + vSeed * 9.0), sin(uTime * 0.35 + vSeed * 20.0) * 0.08, cos(uTime * 0.09 + vSeed * 7.0)) * 0.6;
    // (x, -y) keeps the plane's front face pointing up at the camera.
    vec4 mvPosition = modelViewMatrix * vec4(center.xyz + vec3(p.x, 0.0, -p.y) + drift, 1.0);
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

/** Highest ground under a flat gas sheet, so its uphill edge doesn't slice into a slope. */
export function groundUnder(heightAt: (x: number, z: number) => number, x: number, z: number, r: number): number {
  return Math.max(heightAt(x, z), heightAt(x + r, z), heightAt(x - r, z), heightAt(x, z + r), heightAt(x, z - r));
}

let gasMaterial: THREE.ShaderMaterial | null = null;
export const gasGeometry = new THREE.PlaneGeometry(1, 1);

/**
 * Drifting ground-parallel gas sheets for an InstancedMesh. Per instance, `instanceColor.r` is
 * opacity and `.g` a random seed. `pocket` is the inner/outer radius of the clear area around the player.
 */
export function createGasMaterial(colorA: string, colorB: string, pocket: [number, number]): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
      uTime: { value: 0 },
      uPlayer: { value: new THREE.Vector3() },
      uPocket: { value: new THREE.Vector2(...pocket) },
      uOpacity: { value: 1 },
      uColorA: { value: new THREE.Color(colorA) },
      uColorB: { value: new THREE.Color(colorB) },
    },
    vertexShader: gasVertex,
    fragmentShader: gasFragment,
    transparent: true,
    depthWrite: false,
    fog: true,
  });
}

export function getGasMaterial(): THREE.ShaderMaterial {
  gasMaterial ??= createGasMaterial('#6f8f2a', '#a8d23a', [2.5, 7]);
  return gasMaterial;
}

/** Billboard gas puffs on a jittered grid wherever `gasAt` is above a threshold. */
export function buildGasClouds(
  x0: number,
  z0: number,
  size: number,
  seed: number,
  gasAt: (x: number, z: number) => number,
  heightAt: (x: number, z: number) => number = () => 0,
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
        const y0 = groundUnder(heightAt, x, z, s * 0.4);
        m.makeScale(s, s, s).setPosition(x + rng.range(-1, 1), y0 + (layer === 0 ? rng.range(0.25, 0.7) : rng.range(1.1, 2.0)), z + rng.range(-1, 1));
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
  mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(x0 + size / 2, heightAt(x0 + size / 2, z0 + size / 2) + 1, z0 + size / 2), size * 0.75 + 8);
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
  heightAt: (x: number, z: number) => number,
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
      dummy.position.set(x, heightAt(x, z), z);
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
  mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(x0 + size / 2, heightAt(x0 + size / 2, z0 + size / 2) + 0.3, z0 + size / 2), size * 0.8 + 8);
  mesh.receiveShadow = true;
  mesh.name = 'grass';
  return mesh;
}

const decalMatte = new THREE.MeshStandardMaterial({
  vertexColors: true, transparent: true, depthWrite: false, roughness: 0.95,
  polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
});
const decalGloss = new THREE.MeshStandardMaterial({
  vertexColors: true, transparent: true, depthWrite: false, roughness: 0.1, metalness: 0.25,
  polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
});
addTerrainCutout(decalMatte);
addTerrainCutout(decalGloss);

const DECAL = {
  pad: { a: new THREE.Color('#7a776d'), b: new THREE.Color('#57544c'), lift: 0.03, res: 2 },
  field: { a: new THREE.Color('#2b231a'), b: new THREE.Color('#64523a'), lift: 0.025, res: 0.85 },
  puddle: { a: new THREE.Color('#1a2022'), b: new THREE.Color('#25302f'), lift: 0.045, res: 0.6 },
  scorch: { a: new THREE.Color('#131110'), b: new THREE.Color('#2a2622'), lift: 0.04, res: 0.6 },
  spill: { a: new THREE.Color('#46661a'), b: new THREE.Color('#141310'), lift: 0.042, res: 0.6 },
  tracks: { a: new THREE.Color('#1c1b19'), b: new THREE.Color('#2a2824'), lift: 0.06, res: 0.5 },
} as const;

interface DecalBuffers {
  pos: number[];
  col: number[];
  idx: number[];
}

/**
 * Ground marks for one chunk, draped over the height field on small grids and merged into one
 * matte and one glossy (puddles) mesh. Shapes come from per-vertex alpha, so no textures.
 */
export function buildDecals(
  decals: readonly Decal[],
  heightAt: (x: number, z: number) => number,
  waterDepth: (x: number, z: number) => number,
): THREE.Mesh[] {
  const matte: DecalBuffers = { pos: [], col: [], idx: [] };
  const gloss: DecalBuffers = { pos: [], col: [], idx: [] };
  const c = new THREE.Color();
  for (const d of decals) {
    const def = DECAL[d.kind];
    const out = d.kind === 'puddle' ? gloss : matte;
    const rng = new Rng(d.seed);
    const s1 = rng.range(0, 6.3);
    const s2 = rng.range(0, 6.3);
    const oil = d.kind === 'spill' && rng.chance(0.4);
    const nx = Math.max(2, Math.ceil(d.w / def.res) + 1);
    const nz = Math.max(2, Math.ceil(d.d / def.res) + 1);
    const cos = Math.cos(d.rot);
    const sin = Math.sin(d.rot);
    const base = out.pos.length / 3;
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const u = (i / (nx - 1) - 0.5) * d.w;
        const v = (j / (nz - 1) - 0.5) * d.d;
        const x = d.x + u * cos + v * sin;
        const z = d.z - u * sin + v * cos;
        const edge = Math.min(d.w / 2 - Math.abs(u), d.d / 2 - Math.abs(v));
        let a = 0;
        let t = 0;
        switch (d.kind) {
          case 'pad':
            t = (0.5 + 0.5 * Math.sin(u * 0.45 + s1) * Math.sin(v * 0.6 + s2)) * 0.6;
            a = 0.95 * smoothstep(0, 0.6, edge);
            break;
          case 'field':
            t = smoothstep(-0.2, 0.6, Math.sin((v * Math.PI * 2) / 1.7));
            a = 0.94 * smoothstep(0, 1.4, edge);
            break;
          case 'tracks': {
            const lane = Math.abs(Math.abs(v) - 0.75);
            t = 0.5 + 0.5 * Math.sin(u * 9);
            a = 0.55 * (1 - smoothstep(0.08, 0.22, lane)) * (1 - smoothstep(d.w * 0.3, d.w * 0.5, Math.abs(u)));
            break;
          }
          default: {
            const ang = Math.atan2(v, u);
            const wob = 1 + 0.18 * Math.sin(ang * 3 + s1) + 0.1 * Math.sin(ang * 5 + s2);
            const q = Math.hypot(u / (d.w / 2), v / (d.d / 2));
            t = q;
            const strength = d.kind === 'puddle' ? 0.82 : d.kind === 'scorch' ? 0.8 : 0.72;
            a = strength * (1 - smoothstep(0.55 * wob, wob, q));
          }
        }
        if (waterDepth(x, z) > 0) a = 0;
        if (d.kind === 'spill' && oil) c.copy(def.b).lerp(def.a, 0.1 * t);
        else c.copy(def.a).lerp(def.b, Math.min(1, t));
        out.pos.push(x, heightAt(x, z) + def.lift, z);
        out.col.push(c.r, c.g, c.b, a);
      }
    }
    for (let j = 0; j < nz - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        const k = base + j * nx + i;
        out.idx.push(k, k + nx, k + 1, k + 1, k + nx, k + nx + 1);
      }
    }
  }
  const meshes: THREE.Mesh[] = [];
  for (const [buf, mat] of [[matte, decalMatte], [gloss, decalGloss]] as const) {
    if (!buf.idx.length) continue;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(buf.pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(buf.col, 4));
    geo.setIndex(buf.idx);
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    mesh.name = 'decals';
    mesh.userData.disposable = true;
    meshes.push(mesh);
  }
  return meshes;
}
