import * as THREE from 'three';
import { CONFIG } from '../data/config';
import type { Biomes } from './Biomes';

/** One vertex-colored ground mesh for the whole run, tinted by biome, toxicity and the world edge. */
export function buildTerrain(biomes: Biomes): THREE.Mesh {
  const size = CONFIG.world.halfSize * 2 + 90;
  const segments = 230;
  const geo = new THREE.PlaneGeometry(size, size, segments, segments);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    biomes.groundColor(pos.getX(i), pos.getZ(i), c);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 }));
  mesh.receiveShadow = true;
  mesh.name = 'terrain';
  return mesh;
}
