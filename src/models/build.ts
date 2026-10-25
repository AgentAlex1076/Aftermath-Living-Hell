import * as THREE from 'three';

type V3 = readonly [number, number, number];

interface MeshOpts {
  pos?: V3;
  rot?: V3;
  scale?: V3;
  name?: string;
  shadow?: boolean;
}

const geoCache = new Map<string, THREE.BufferGeometry>();

function cachedGeo(key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
  let g = geoCache.get(key);
  if (!g) {
    g = make();
    geoCache.set(key, g);
  }
  return g;
}

export function mesh(geo: THREE.BufferGeometry, material: THREE.Material, opts: MeshOpts = {}): THREE.Mesh {
  const m = new THREE.Mesh(geo, material);
  if (opts.pos) m.position.set(...opts.pos);
  if (opts.rot) m.rotation.set(...opts.rot);
  if (opts.scale) m.scale.set(...opts.scale);
  if (opts.name) m.name = opts.name;
  const shadow = opts.shadow ?? true;
  m.castShadow = shadow;
  m.receiveShadow = true;
  return m;
}

export function box(w: number, h: number, d: number, material: THREE.Material, opts?: MeshOpts): THREE.Mesh {
  return mesh(cachedGeo(`box:${w}:${h}:${d}`, () => new THREE.BoxGeometry(w, h, d)), material, opts);
}

export function cyl(
  rTop: number,
  rBottom: number,
  h: number,
  material: THREE.Material,
  opts?: MeshOpts & { segments?: number; open?: boolean },
): THREE.Mesh {
  const seg = opts?.segments ?? 14;
  const open = opts?.open ?? false;
  return mesh(
    cachedGeo(`cyl:${rTop}:${rBottom}:${h}:${seg}:${open}`, () => new THREE.CylinderGeometry(rTop, rBottom, h, seg, 1, open)),
    material,
    opts,
  );
}

export function sphere(r: number, material: THREE.Material, opts?: MeshOpts & { wSeg?: number; hSeg?: number }): THREE.Mesh {
  const w = opts?.wSeg ?? 18;
  const h = opts?.hSeg ?? 14;
  return mesh(cachedGeo(`sph:${r}:${w}:${h}`, () => new THREE.SphereGeometry(r, w, h)), material, opts);
}

export function capsule(r: number, length: number, material: THREE.Material, opts?: MeshOpts): THREE.Mesh {
  return mesh(cachedGeo(`cap:${r}:${length}`, () => new THREE.CapsuleGeometry(r, length, 6, 14)), material, opts);
}

export function torus(r: number, tube: number, material: THREE.Material, opts?: MeshOpts & { arc?: number }): THREE.Mesh {
  const arc = opts?.arc ?? Math.PI * 2;
  return mesh(cachedGeo(`tor:${r}:${tube}:${arc}`, () => new THREE.TorusGeometry(r, tube, 8, 22, arc)), material, opts);
}

export function rock(r: number, material: THREE.Material, opts?: MeshOpts & { detail?: number }): THREE.Mesh {
  const detail = opts?.detail ?? 0;
  return mesh(cachedGeo(`rock:${r}:${detail}`, () => new THREE.DodecahedronGeometry(r, detail)), material, opts);
}

export function group(name: string, ...children: THREE.Object3D[]): THREE.Group {
  const g = new THREE.Group();
  g.name = name;
  if (children.length) g.add(...children);
  return g;
}
