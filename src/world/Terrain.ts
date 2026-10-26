import * as THREE from 'three';
import { CONFIG } from '../data/config';
import { createNoise2D, fbm } from '../core/noise';
import { smoothstep } from '../core/math';
import type { Biomes } from './Biomes';
import type { HeightField } from './Height';

/** Ground vertices per chunk side: 1 m, matching the height cache. */
const SEGMENTS = CONFIG.world.chunkSize;

const ROCK = new THREE.Color('#4f4a42');
const CLIFF = new THREE.Color('#3c3934');
const WET = new THREE.Color('#2c2822');
const SCORCH = new THREE.Color('#2a2724');
const WATER_DEEP = new THREE.Color('#1f2d2e');
const WATER_SHALLOW = new THREE.Color('#4d5a52');
const TOXIC_DEEP = new THREE.Color('#3f6512');
const TOXIC_SHALLOW = new THREE.Color('#86a630');
const FOAM = new THREE.Color('#9aa39a');

const groundMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 });
const waterMaterial = new THREE.MeshStandardMaterial({
  vertexColors: true, transparent: true, roughness: 0.08, metalness: 0.25, depthWrite: false,
});
const waterTime = { value: 0 };
const waterSky = { value: new THREE.Color('#7d8782') };
attachRipples(waterMaterial);
const roadMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });
const dashMaterial = new THREE.MeshStandardMaterial({ color: '#8f7f3f', roughness: 0.9 });
const dashGeometry = new THREE.PlaneGeometry(1.8, 0.14).rotateX(-Math.PI / 2);

const cutPlayer = new THREE.Vector3();

attachCutout(groundMaterial);
attachCutout(roadMaterial);

/** Ground marks get the same see-through-the-hill cutout as the ground they lie on. */
export function addTerrainCutout(mat: THREE.MeshStandardMaterial): void {
  attachCutout(mat);
}

/** Shared by every ground tile, so weather can darken the whole world in one place. */
export function getGroundMaterial(): THREE.MeshStandardMaterial {
  return groundMaterial;
}

/** Drives the ripple shimmer on every water sheet; `sky` is what the surface reflects (the fog colour). */
export function setWaterTime(t: number, sky?: THREE.Color): void {
  waterTime.value = t;
  if (sky) waterSky.value.copy(sky);
}

/** Point the terrain cutout at the player so a hill never hides the hazmat suit. */
export function setTerrainCutout(x: number, y: number, z: number): void {
  cutPlayer.set(x, y, z);
  for (const mat of [groundMaterial, roadMaterial]) {
    const u = mat.userData.cutout as { uCutPlayer: { value: THREE.Vector3 } } | undefined;
    if (u) u.uCutPlayer.value.copy(cutPlayer);
  }
}

/**
 * Builds the ground one chunk at a time. Heights and colours come from world-space fields, so
 * neighboring tiles agree on their shared edge and the seams never show.
 */
export class Ground {
  private readonly roadNoise: ReturnType<typeof createNoise2D>;
  private readonly color = new THREE.Color();
  private readonly normal = new THREE.Vector3();

  constructor(
    private readonly biomes: Biomes,
    private readonly height: HeightField,
    private readonly seed: number,
  ) {
    this.roadNoise = createNoise2D(seed + 7);
  }

  buildTile(cx: number, cz: number): THREE.Group {
    const S = CONFIG.world.chunkSize;
    const x0 = cx * S;
    const z0 = cz * S;
    this.height.ensure(cx, cz);
    const tile = new THREE.Group();
    tile.name = `ground ${cx},${cz}`;

    const geo = new THREE.PlaneGeometry(S, S, SEGMENTS, SEGMENTS);
    geo.rotateX(-Math.PI / 2);
    geo.translate(x0 + S / 2, 0, z0 + S / 2);
    const pos = geo.attributes.position;
    const nor = geo.attributes.normal;
    const colors = new Float32Array(pos.count * 3);
    const c = this.color;
    let maxY = -Infinity;
    let minY = Infinity;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const y = this.height.at(x, z);
      pos.setY(i, y);
      if (y > maxY) maxY = y;
      if (y < minY) minY = y;
      this.height.normalAt(x, z, this.normal);
      nor.setXYZ(i, this.normal.x, this.normal.y, this.normal.z);
      this.biomes.groundColor(x, z, c);
      const crater = this.height.craterWeight(x, z);
      if (crater > 0) c.lerp(SCORCH, crater * 0.7);
      const slope = this.height.slopeDeg(x, z);
      c.lerp(ROCK, smoothstep(16, 34, slope) * 0.8);
      c.lerp(CLIFF, smoothstep(36, 54, slope) * 0.95);
      const wd = this.height.waterDepth(x, z);
      if (wd > -0.45) c.lerp(WET, smoothstep(-0.45, 0.05, wd) * 0.45);
      const shade = THREE.MathUtils.clamp(0.52 + this.normal.x * 0.28 + this.normal.y * 0.38, 0.38, 1.18);
      c.multiplyScalar(shade);
      c.toArray(colors, i * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeBoundingSphere();
    const ground = new THREE.Mesh(geo, groundMaterial);
    ground.receiveShadow = true;
    ground.userData.disposable = true;
    tile.add(ground);
    if (this.height.hasWater(cx, cz)) this.addWater(tile, x0, z0, S);

    this.addRoads(tile, cx, cz);
    return tile;
  }

  /**
   * One water sheet over the whole tile at the cached surface heights. Where there is no water the
   * surface sits under the ground, so the ground hides it and shorelines come out of the depth test.
   */
  private addWater(tile: THREE.Group, x0: number, z0: number, S: number): void {
    const geo = new THREE.PlaneGeometry(S, S, SEGMENTS, SEGMENTS);
    geo.rotateX(-Math.PI / 2);
    geo.translate(x0 + S / 2, 0, z0 + S / 2);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 4);
    const c = this.color;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const surface = this.height.waterSurface(x, z);
      const depth = surface - this.height.at(x, z);
      pos.setY(i, surface);
      const toxic = this.height.waterKind(x, z) === 'crater' || this.biomes.toxicity(x, z) > 0.3;
      const t = smoothstep(0, 1.4, depth);
      if (toxic) c.copy(TOXIC_SHALLOW).lerp(TOXIC_DEEP, t);
      else c.copy(WATER_SHALLOW).lerp(WATER_DEEP, t);
      const foam = 1 - smoothstep(0.02, 0.22, depth);
      c.lerp(FOAM, foam * (toxic ? 0.35 : 0.6));
      colors[i * 4] = c.r;
      colors[i * 4 + 1] = c.g;
      colors[i * 4 + 2] = c.b;
      colors[i * 4 + 3] = THREE.MathUtils.clamp(0.5 + depth * 0.4 + foam * 0.2, 0.5, toxic ? 0.92 : 0.88);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 4));
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    const water = new THREE.Mesh(geo, waterMaterial);
    water.receiveShadow = true;
    water.renderOrder = 1;
    water.name = 'water';
    water.userData.disposable = true;
    tile.add(water);
  }

  /**
   * Every road through this chunk as a ribbon over the graded ground: gravel shoulders, worn
   * asphalt, and a broken centre line on highways. Each quad belongs to the chunk holding its
   * midpoint, and vertices come from the road's global samples, so tiles meet without seams.
   */
  private addRoads(tile: THREE.Group, cx: number, cz: number): void {
    const S = CONFIG.world.chunkSize;
    const x0 = cx * S;
    const z0 = cz * S;
    const pos: number[] = [];
    const nor: number[] = [];
    const col: number[] = [];
    const idx: number[] = [];
    const dash = new THREE.Matrix4();
    const dashes: THREE.Matrix4[] = [];
    const base = new THREE.Color('#2c2d2e');
    const light = new THREE.Color('#3d3e3d');
    const dirt = new THREE.Color('#3a352c');
    const gravel = new THREE.Color('#4a463d');
    const c = new THREE.Color();
    const n = this.normal;
    const inside = (x: number, z: number) => x >= x0 && x < x0 + S && z >= z0 && z < z0 + S;
    for (const road of this.height.regions.roadsIn(cx, cz)) {
      const p = road.pts;
      const half = road.width / 2;
      const across = [-(half + 1.1), -half, -half * 0.5, 0, half * 0.5, half, half + 1.1];
      const tangent = (k: number): [number, number] => {
        const a = Math.max(0, k - 1);
        const b = Math.min(road.n - 1, k + 1);
        const dx = p[b * 2] - p[a * 2];
        const dz = p[b * 2 + 1] - p[a * 2 + 1];
        const l = Math.hypot(dx, dz) || 1;
        return [dx / l, dz / l];
      };
      let prevRow = -1;
      let prevK = -2;
      for (let k = 0; k < road.n - 1; k++) {
        const mx = (p[k * 2] + p[k * 2 + 2]) / 2;
        const mz = (p[k * 2 + 1] + p[k * 2 + 3]) / 2;
        if (!inside(mx, mz)) continue;
        for (const kk of prevK === k - 1 ? [k + 1] : [k, k + 1]) {
          const [tx, tz] = tangent(kk);
          const px = p[kk * 2];
          const pz = p[kk * 2 + 1];
          for (const o of across) {
            const x = px - tz * o;
            const z = pz + tx * o;
            pos.push(x, this.height.at(x, z) + road.lift, z);
            this.height.normalAt(x, z, n);
            nor.push(n.x, n.y, n.z);
            const e = Math.abs(o) / half;
            const w = fbm(this.roadNoise, x * 0.12, z * 0.12, 3);
            if (e > 1.01) c.copy(gravel).lerp(dirt, 0.5 + w * 0.5);
            else c.copy(base).lerp(light, THREE.MathUtils.smoothstep(w, 0.1, 0.5)).lerp(dirt, THREE.MathUtils.smoothstep(e + w * 0.4, 0.75, 1.05));
            col.push(c.r, c.g, c.b);
          }
          if (road.kind === 'highway' && kk % 2 === 0 && hash01(kk + road.n * 31, this.seed + road.id.length) > 0.2) {
            dash.makeRotationY(Math.atan2(-tz, tx)).setPosition(px, this.height.at(px, pz) + road.lift + 0.012, pz);
            dashes.push(dash.clone());
          }
        }
        const row = prevK === k - 1 ? prevRow : pos.length / 3 / across.length - 2;
        const next = row + 1;
        for (let a = 0; a < across.length - 1; a++) {
          const i0 = row * across.length + a;
          const i1 = next * across.length + a;
          idx.push(i0, i0 + 1, i1, i0 + 1, i1 + 1, i1);
        }
        prevRow = next;
        prevK = k;
      }
      prevK = -2;
    }
    if (!idx.length) return;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setIndex(idx);
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, roadMaterial);
    mesh.receiveShadow = true;
    mesh.userData.disposable = true;
    mesh.name = 'roads';
    tile.add(mesh);
    if (dashes.length) {
      const inst = new THREE.InstancedMesh(dashGeometry, dashMaterial, dashes.length);
      dashes.forEach((m, i) => inst.setMatrixAt(i, m));
      inst.receiveShadow = true;
      tile.add(inst);
    }
  }
}

/**
 * Dissolves ground that sits on the camera–player line in front of the suit, so a hillside
 * never hides you. Same idea as the wall fade, but for terrain.
 */
function attachCutout(mat: THREE.MeshStandardMaterial): void {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uCutPlayer = { value: cutPlayer.clone() };
    shader.uniforms.uCutRadius = { value: 4.4 };
    mat.userData.cutout = shader.uniforms;

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vWorldCut;`,
      )
      .replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
        vWorldCut = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform vec3 uCutPlayer;
        uniform float uCutRadius;
        varying vec3 vWorldCut;`,
      )
      .replace(
        '#include <dithering_fragment>',
        `vec3 cutCam = cameraPosition;
        vec3 cutAb = uCutPlayer - cutCam;
        float cutLen2 = max(dot(cutAb, cutAb), 0.0001);
        float cutT = clamp(dot(vWorldCut - cutCam, cutAb) / cutLen2, 0.0, 1.0);
        vec3 cutClosest = cutCam + cutAb * cutT;
        float cutDist = length(vWorldCut.xz - cutClosest.xz);
        float cutFrag = length(vWorldCut - cutCam);
        float cutPly = length(uCutPlayer - cutCam);
        if (cutFrag < cutPly - 0.85 && cutT < 0.92) {
          float n = fract(sin(dot(vWorldCut.xz, vec2(12.9898, 78.233))) * 43758.5453);
          float cutA = smoothstep(uCutRadius * 0.42, uCutRadius, cutDist + n * 0.55);
          if (cutA < 0.38) discard;
        }
        #include <dithering_fragment>`,
      );
  };
  mat.customProgramCacheKey = () => 'terrain-cutout-v1';
}

/** Slow crossing ripples in the normal, so water catches the light without any textures. */
function attachRipples(mat: THREE.MeshStandardMaterial): void {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uWaterTime = waterTime;
    shader.uniforms.uWaterSky = waterSky;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        varying vec3 vWaterPos;`)
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
        vWaterPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uWaterTime;
        uniform vec3 uWaterSky;
        varying vec3 vWaterPos;`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        vec2 wp = vWaterPos.xz;
        float rA = sin(wp.x * 1.3 + uWaterTime * 1.1) * cos(wp.y * 1.1 - uWaterTime * 0.9);
        float rB = sin(wp.x * 0.47 - wp.y * 0.71 + uWaterTime * 0.6);
        normal = normalize(normal + vec3(rA * 0.07, rB * 0.06, 0.0));`)
      .replace('#include <opaque_fragment>', `float wView = clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0);
        float wRefl = 0.17 + 0.4 * pow(1.0 - wView, 2.0) + rA * 0.11 + rB * 0.07;
        outgoingLight = mix(outgoingLight, uWaterSky, clamp(wRefl, 0.0, 0.6));
        #include <opaque_fragment>`);
  };
  mat.customProgramCacheKey = () => 'water-ripple-v2';
}

/** Stable 0..1 value per integer index, so a dash looks the same every time its chunk reloads. */
function hash01(i: number, seed: number): number {
  let h = Math.imul(i ^ seed, 0x9e3779b1);
  h ^= h >>> 15;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}
