import * as THREE from 'three';
import { box, cyl, group, sphere, torus } from './build';

export interface CureModel {
  root: THREE.Group;
  /** Glass, serum and collar. Reparented into the player's hand while carried. */
  flask: THREE.Group;
  glass: THREE.Mesh[];
  serum: THREE.Mesh;
  serumMat: THREE.MeshStandardMaterial;
  cracks: THREE.Mesh[];
  shards: THREE.Group;
  vapor: THREE.Group;
}

const brass = new THREE.MeshStandardMaterial({ color: '#c6a15a', roughness: 0.32, metalness: 0.78 });
const chainMat = new THREE.MeshStandardMaterial({ color: '#8d7848', roughness: 0.45, metalness: 0.7 });
const glassMat = new THREE.MeshStandardMaterial({
  color: '#c5eef8', roughness: 0.06, metalness: 0.15, transparent: true, opacity: 0.45, depthWrite: false,
});
const crackMat = new THREE.MeshStandardMaterial({
  color: '#e8fbff', roughness: 0.2, metalness: 0.05, transparent: true, opacity: 0.85, emissive: '#9ae7ff', emissiveIntensity: 0.4,
});
const shardMat = new THREE.MeshStandardMaterial({
  color: '#d7f6ff', roughness: 0.08, metalness: 0.2, transparent: true, opacity: 0.7,
});

/** Brass-collared flask, chains up to a ceiling anchor at the root origin. */
export function buildCure(): CureModel {
  const root = group('cure');
  const flask = group('flask');
  flask.position.y = -0.86;

  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const x = Math.cos(a) * 0.06;
    const z = Math.sin(a) * 0.06;
    root.add(cyl(0.012, 0.012, 0.86, chainMat, { pos: [x * 0.4, -0.43, z * 0.4], rot: [z * 0.15, 0, -x * 0.15], segments: 6 }));
  }
  root.add(torus(0.09, 0.012, brass, { pos: [0, -0.02, 0], rot: [Math.PI / 2, 0, 0] }));

  const neck = cyl(0.045, 0.07, 0.16, glassMat, { pos: [0, 0.22, 0], segments: 12 });
  const bowl = sphere(0.16, glassMat, { pos: [0, 0.02, 0], scale: [1, 1.25, 1], wSeg: 16, hSeg: 12 });
  const base = cyl(0.07, 0.05, 0.06, glassMat, { pos: [0, -0.16, 0], segments: 12 });
  flask.add(neck, bowl, base);
  flask.add(torus(0.075, 0.018, brass, { pos: [0, 0.28, 0], rot: [Math.PI / 2, 0, 0] }));
  flask.add(cyl(0.05, 0.05, 0.04, brass, { pos: [0, 0.32, 0], segments: 10 }));

  const serumMat = new THREE.MeshStandardMaterial({
    color: '#7ef6ff', roughness: 0.25, emissive: '#3ad7ff', emissiveIntensity: 2.2,
  });
  const serum = sphere(0.11, serumMat, { pos: [0, -0.01, 0], scale: [1, 1.15, 1], wSeg: 14, hSeg: 10 });
  flask.add(serum);

  const cracks: THREE.Mesh[] = [];
  const crackSpecs: [number, number, number, number, number, number][] = [
    [0.14, 0.22, 0.012, 0.12, 0.04, 0.4],
    [-0.1, -0.02, 0.012, -0.08, -0.06, -0.7],
    [0.02, -0.08, 0.13, 0.5, 0.2, 0.3],
  ];
  for (const [x, y, z, rx, ry, rz] of crackSpecs) {
    const c = box(0.012, 0.16, 0.09, crackMat, { pos: [x, y, z], rot: [rx, ry, rz] });
    c.visible = false;
    flask.add(c);
    cracks.push(c);
  }

  const shards = group('shards');
  shards.visible = false;
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    shards.add(box(0.08, 0.012, 0.05, shardMat, {
      pos: [Math.cos(a) * 0.12, -0.22, Math.sin(a) * 0.12],
      rot: [0.4, a, 0.6],
    }));
  }
  flask.add(shards);

  const vapor = group('vapor');
  const puffMat = new THREE.MeshBasicMaterial({ color: '#7ef6ff', transparent: true, opacity: 0.22, depthWrite: false });
  for (let i = 0; i < 4; i++) {
    const puff = sphere(0.18 + i * 0.05, puffMat, { pos: [0, 0.2 + i * 0.18, 0], wSeg: 8, hSeg: 6 });
    puff.name = `puff${i}`;
    vapor.add(puff);
  }
  vapor.visible = false;
  vapor.position.y = -0.7;
  root.add(vapor);

  root.add(flask);
  return { root, flask, glass: [neck, bowl, base], serum, serumMat, cracks, shards, vapor };
}
