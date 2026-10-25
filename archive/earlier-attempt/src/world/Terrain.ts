import * as THREE from 'three';
import { smoothstep } from '../core/math';
import { fbm } from '../core/noise';
import { Rng } from '../core/rng';
import { mat, PALETTE } from '../render/materials';

export const WORLD_HALF_SIZE = 120;

export interface TerrainLayout {
  seed: number;
  roadZ: number;
  roadHalfWidth: number;
  homeRadiusFlat: number;
  stains: { x: number; z: number; r: number }[];
}

export type HeightFn = (x: number, z: number) => number;

export function makeHeightFn(layout: TerrainLayout): HeightFn {
  return (x, z) => {
    const h = (fbm(x * 0.035, z * 0.035, layout.seed, 3) - 0.5) * 1.4;
    const nearHome = smoothstep(layout.homeRadiusFlat, layout.homeRadiusFlat + 10, Math.hypot(x, z));
    const nearRoad = smoothstep(layout.roadHalfWidth + 0.5, layout.roadHalfWidth + 6, Math.abs(z - layout.roadZ));
    return h * nearHome * nearRoad;
  };
}

export function buildGround(layout: TerrainLayout, heightAt: HeightFn) {
  const size = WORLD_HALF_SIZE * 2 + 40;
  const segments = 140;
  const geo = new THREE.PlaneGeometry(size, size, segments, segments);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const dirt = new THREE.Color(PALETTE.dirt);
  const ash = new THREE.Color(PALETTE.ash);
  const grass = new THREE.Color(PALETTE.deadGrass);
  const stain = new THREE.Color(0x3d5a1c);
  const c = new THREE.Color();

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    pos.setY(i, heightAt(x, z));
    const n1 = fbm(x * 0.06, z * 0.06, layout.seed + 101, 3);
    const n2 = fbm(x * 0.11, z * 0.11, layout.seed + 202, 2);
    c.copy(dirt).lerp(ash, smoothstep(0.35, 0.7, n1));
    c.lerp(grass, smoothstep(0.55, 0.75, n2) * 0.8);
    for (const s of layout.stains) {
      const d = Math.hypot(x - s.x, z - s.z);
      c.lerp(stain, (1 - smoothstep(s.r * 0.4, s.r, d)) * 0.85);
    }
    const shade = 0.85 + fbm(x * 0.4, z * 0.4, layout.seed + 303, 2) * 0.3;
    c.multiplyScalar(shade);
    colors.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();

  const ground = new THREE.Mesh(geo, mat(0xffffff, { vertexColors: true, roughness: 1 }));
  ground.receiveShadow = true;
  ground.name = 'ground';
  return ground;
}

export function buildRoad(layout: TerrainLayout, rng: Rng) {
  const group = new THREE.Group();
  const length = WORLD_HALF_SIZE * 2 + 40;
  const width = layout.roadHalfWidth * 2;
  const geo = new THREE.PlaneGeometry(length, width, 160, 3);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const base = new THREE.Color(PALETTE.asphalt);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const n = fbm(x * 0.3, z * 0.3, layout.seed + 404, 3);
    c.copy(base).multiplyScalar(0.75 + n * 0.6);
    colors.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const road = new THREE.Mesh(geo, mat(0xffffff, { vertexColors: true, roughness: 0.95 }));
  road.position.set(0, 0.03, layout.roadZ);
  road.receiveShadow = true;
  group.add(road);

  const dashMat = mat(PALETTE.hazardFaded, { roughness: 0.9 });
  const dashGeo = new THREE.PlaneGeometry(2, 0.18);
  dashGeo.rotateX(-Math.PI / 2);
  const dashCount = Math.floor(length / 5);
  const dashes = new THREE.InstancedMesh(dashGeo, dashMat, dashCount);
  const m = new THREE.Matrix4();
  let used = 0;
  for (let i = 0; i < dashCount; i++) {
    if (rng.chance(0.25)) continue;
    m.makeTranslation(-length / 2 + i * 5, 0.045, layout.roadZ);
    dashes.setMatrixAt(used++, m);
  }
  dashes.count = used;
  dashes.receiveShadow = true;
  group.add(dashes);
  return group;
}
