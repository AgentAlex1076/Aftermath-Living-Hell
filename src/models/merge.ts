import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const KEEP_ATTRIBUTES = new Set(['position', 'normal', 'uv']);
const _rel = new THREE.Matrix4();
const _inv = new THREE.Matrix4();

/**
 * Collapses a model's static meshes into one mesh per (material, shadow flag), so a prop made
 * of 30 primitives becomes a handful of draw calls. Named sub-groups listed in
 * `userData.occluders` / `userData.roof` / `userData.animated` are merged separately so they can
 * still fade or move on their own.
 * Merged geometries are unique and flagged `userData.disposable` for `disposeMerged`.
 */
export function mergeStatic(root: THREE.Object3D): void {
  const names = [...((root.userData.occluders as string[] | undefined) ?? []), ...((root.userData.animated as string[] | undefined) ?? [])];
  if (typeof root.userData.roof === 'string') names.push(root.userData.roof);
  const separate = new Set<THREE.Object3D>();
  for (const name of names) {
    const node = root.getObjectByName(name);
    if (node) separate.add(node);
  }
  for (const node of separate) mergeInto(node, separate);
  mergeInto(root, separate);
}

function mergeInto(root: THREE.Object3D, skip: Set<THREE.Object3D>): void {
  root.updateMatrixWorld(true);
  _inv.copy(root.matrixWorld).invert();

  const buckets = new Map<string, { material: THREE.Material; castShadow: boolean; geos: THREE.BufferGeometry[] }>();
  const merged: THREE.Mesh[] = [];

  const visit = (o: THREE.Object3D) => {
    if (o !== root && skip.has(o)) return;
    if (o instanceof THREE.Mesh && !(o instanceof THREE.InstancedMesh) && !Array.isArray(o.material) && !o.userData.noMerge) {
      let g = o.geometry.clone();
      g.applyMatrix4(_rel.multiplyMatrices(_inv, o.matrixWorld));
      if (g.index) {
        const flat = g.toNonIndexed();
        g.dispose();
        g = flat;
      }
      for (const name of Object.keys(g.attributes)) if (!KEEP_ATTRIBUTES.has(name)) g.deleteAttribute(name);
      if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      g.morphAttributes = {};
      g.clearGroups();

      const key = `${o.material.uuid}:${o.castShadow}`;
      let b = buckets.get(key);
      if (!b) {
        b = { material: o.material, castShadow: o.castShadow, geos: [] };
        buckets.set(key, b);
      }
      b.geos.push(g);
      merged.push(o);
    }
    for (const c of o.children) visit(c);
  };
  visit(root);

  if (merged.length < 2) {
    for (const b of buckets.values()) for (const g of b.geos) g.dispose();
    return;
  }

  for (const m of merged) {
    m.removeFromParent();
    // Meshes can have children (e.g. nested groups); keep anything we didn't merge.
    for (const c of [...m.children]) root.attach(c);
  }
  pruneEmpty(root, skip);

  for (const b of buckets.values()) {
    const geo = mergeGeometries(b.geos, false);
    for (const g of b.geos) g.dispose();
    if (!geo) continue;
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, b.material);
    mesh.castShadow = b.castShadow;
    mesh.receiveShadow = true;
    mesh.userData.disposable = true;
    root.add(mesh);
  }
}

function pruneEmpty(obj: THREE.Object3D, keep: Set<THREE.Object3D>): void {
  for (const child of [...obj.children]) {
    if (keep.has(child)) continue;
    pruneEmpty(child, keep);
    const isPlainGroup = child.type === 'Group' || child.type === 'Object3D';
    if (isPlainGroup && child.children.length === 0 && !child.userData.lights && !child.userData.keep && !child.name) {
      child.removeFromParent();
    }
  }
}

/**
 * Collapses a model into one vertex-colored mesh per shadow flag, all sharing `material`.
 * Each part keeps its palette color but not its own roughness/metalness. Used for player-built
 * pieces, where a big base would otherwise cost several draw calls per wall.
 * Nodes named in `userData.animated` are collapsed on their own so they can still move.
 */
export function mergeColored(root: THREE.Object3D, material: THREE.Material): void {
  const separate = new Set<THREE.Object3D>();
  for (const name of (root.userData.animated as string[] | undefined) ?? []) {
    const node = root.getObjectByName(name);
    if (node) separate.add(node);
  }
  for (const node of separate) colorInto(node, new Set(), material);
  colorInto(root, separate, material);
}

const _col = new THREE.Color();

function colorInto(root: THREE.Object3D, skip: Set<THREE.Object3D>, material: THREE.Material): void {
  root.updateMatrixWorld(true);
  _inv.copy(root.matrixWorld).invert();
  const buckets = new Map<boolean, THREE.BufferGeometry[]>();
  const merged: THREE.Mesh[] = [];

  const visit = (o: THREE.Object3D) => {
    if (o !== root && skip.has(o)) return;
    if (o instanceof THREE.Mesh && !(o instanceof THREE.InstancedMesh) && !Array.isArray(o.material)) {
      let g = o.geometry.clone();
      g.applyMatrix4(_rel.multiplyMatrices(_inv, o.matrixWorld));
      if (g.index) {
        const flat = g.toNonIndexed();
        g.dispose();
        g = flat;
      }
      for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
      _col.set((o.material as THREE.MeshStandardMaterial).color ?? '#ffffff');
      const n = g.attributes.position.count;
      const colors = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        colors[i * 3] = _col.r;
        colors[i * 3 + 1] = _col.g;
        colors[i * 3 + 2] = _col.b;
      }
      g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      g.morphAttributes = {};
      g.clearGroups();
      let list = buckets.get(o.castShadow);
      if (!list) buckets.set(o.castShadow, (list = []));
      list.push(g);
      merged.push(o);
    }
    for (const c of o.children) visit(c);
  };
  visit(root);

  for (const m of merged) {
    m.removeFromParent();
    for (const c of [...m.children]) root.attach(c);
  }
  pruneEmpty(root, skip);

  for (const [castShadow, geos] of buckets) {
    const geo = mergeGeometries(geos, false);
    for (const g of geos) g.dispose();
    if (!geo) continue;
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, material);
    mesh.castShadow = castShadow;
    mesh.receiveShadow = true;
    mesh.userData.disposable = true;
    root.add(mesh);
  }
}

/** Frees GPU memory for geometries created by `mergeStatic` (shared/cached geometries are left alone). */
export function disposeMerged(root: THREE.Object3D): void {
  root.traverse((o) => {
    if (o instanceof THREE.Mesh && o.userData.disposable) o.geometry.dispose();
    if (o instanceof THREE.InstancedMesh) o.dispose();
  });
}
