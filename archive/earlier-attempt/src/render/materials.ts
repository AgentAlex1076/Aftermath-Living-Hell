import * as THREE from 'three';

export const PALETTE = {
  suit: 0xe2a21c,
  suitDark: 0xa8740f,
  rubber: 0x1c1c1e,
  steel: 0x5b6166,
  steelDark: 0x363b3f,
  rust: 0x7a4a2a,
  rustDark: 0x55311d,
  oxidized: 0x4d5a52,
  wood: 0x5e4630,
  woodDark: 0x3f2f22,
  ash: 0x4a4a44,
  dirt: 0x4b4335,
  deadGrass: 0x5c5a3e,
  bark: 0x3b342c,
  toxic: 0x8cff3a,
  toxicDim: 0x4f7a22,
  hazard: 0xffcf1a,
  hazardFaded: 0x9a842a,
  concrete: 0x6b6b66,
  asphalt: 0x2c2d2f,
  glass: 0x10181a,
  fabric: 0x6b6250,
  reflective: 0xc8cfd2,
  ember: 0xff6a1a,
} as const;

export interface MatOptions {
  roughness?: number;
  metalness?: number;
  emissive?: number;
  emissiveIntensity?: number;
  flat?: boolean;
  doubleSided?: boolean;
  vertexColors?: boolean;
}

const cache = new Map<string, THREE.MeshStandardMaterial>();

/** Shared, cached standard material. Clone before mutating per-object. */
export function mat(color: number, o: MatOptions = {}) {
  const key = `${color}|${o.roughness}|${o.metalness}|${o.emissive}|${o.emissiveIntensity}|${o.flat}|${o.doubleSided}|${o.vertexColors}`;
  let m = cache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color,
      roughness: o.roughness ?? 0.85,
      metalness: o.metalness ?? 0.05,
      emissive: o.emissive ?? 0x000000,
      emissiveIntensity: o.emissiveIntensity ?? 1,
      flatShading: o.flat ?? false,
      side: o.doubleSided ? THREE.DoubleSide : THREE.FrontSide,
      vertexColors: o.vertexColors ?? false,
    });
    cache.set(key, m);
  }
  return m;
}

export function mesh(
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  { cast = true, receive = true }: { cast?: boolean; receive?: boolean } = {},
) {
  const m = new THREE.Mesh(geometry, material);
  m.castShadow = cast;
  m.receiveShadow = receive;
  return m;
}
