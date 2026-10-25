import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Flat sheet with vertical sine ridges, like corrugated scrap metal. */
export function corrugatedPanel(width: number, height: number, waves = 8, depth = 0.04) {
  const g = new THREE.PlaneGeometry(width, height, waves * 4, 1);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    pos.setZ(i, Math.sin((x / width) * waves * Math.PI * 2) * depth);
  }
  g.computeVertexNormals();
  return g;
}

/** Bakes a transform into a geometry clone so pieces can be merged into one draw call. */
export function placed(
  geometry: THREE.BufferGeometry,
  position: [number, number, number],
  rotation: [number, number, number] = [0, 0, 0],
  scale: [number, number, number] = [1, 1, 1],
) {
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(...position),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)),
    new THREE.Vector3(...scale),
  );
  const g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
  g.applyMatrix4(m);
  return g;
}

export function merge(geometries: THREE.BufferGeometry[]) {
  const normalized = geometries.map((g) => {
    const n = g.index ? g.toNonIndexed() : g;
    if (n.attributes.uv) n.deleteAttribute('uv');
    return n;
  });
  const merged = mergeGeometries(normalized, false);
  if (!merged) throw new Error('Geometry merge failed');
  merged.computeBoundingSphere();
  return merged;
}

/** A cylinder spanning two points, used for branches, pipes and rebar. */
export function segment(from: THREE.Vector3, to: THREE.Vector3, radiusBottom: number, radiusTop: number, radial = 6) {
  const dir = new THREE.Vector3().subVectors(to, from);
  const length = dir.length();
  const g = new THREE.CylinderGeometry(radiusTop, radiusBottom, length, radial, 1);
  g.translate(0, length / 2, 0);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  g.applyMatrix4(new THREE.Matrix4().compose(from, q, new THREE.Vector3(1, 1, 1)));
  return g;
}

/** Jagged rock: an icosphere displaced by a position hash so shared corners stay welded. */
export function rockGeometry(radius: number, seed: number, roughness = 0.35) {
  const g = new THREE.IcosahedronGeometry(radius, 1);
  const pos = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const key = Math.round(v.x * 1000) * 73856093 ^ Math.round(v.y * 1000) * 19349663 ^ Math.round(v.z * 1000) * 83492791 ^ seed;
    const n = ((Math.imul(key, 2654435761) >>> 0) % 1000) / 1000;
    v.multiplyScalar(1 + (n - 0.5) * roughness);
    v.y *= 0.7;
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}
