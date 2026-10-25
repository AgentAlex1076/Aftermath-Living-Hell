import * as THREE from 'three';

interface MatDef {
  color: string;
  roughness?: number;
  metalness?: number;
  emissive?: string;
  emissiveIntensity?: number;
  flatShading?: boolean;
}

const DEFS = {
  hazmat: { color: '#d9a21c', roughness: 0.55 },
  hazmatShade: { color: '#b07f12', roughness: 0.6 },
  rubber: { color: '#1d1d1f', roughness: 0.85 },
  tape: { color: '#2a2a2c', roughness: 0.7 },
  maskBody: { color: '#34383b', roughness: 0.55, metalness: 0.15 },
  lens: { color: '#9cc77a', roughness: 0.12, metalness: 0.3, emissive: '#4f7a22', emissiveIntensity: 0.9 },
  filter: { color: '#5a5f61', roughness: 0.4, metalness: 0.6 },
  tank: { color: '#7d837c', roughness: 0.45, metalness: 0.55 },
  gunMetal: { color: '#2c2f31', roughness: 0.42, metalness: 0.7 },
  gunGrip: { color: '#3b2f25', roughness: 0.8 },

  wood: { color: '#5d4b39', roughness: 0.95, flatShading: true },
  woodLight: { color: '#6f5a43', roughness: 0.95, flatShading: true },
  woodDark: { color: '#3c3127', roughness: 0.95, flatShading: true },
  woodRot: { color: '#4a4436', roughness: 1, flatShading: true },
  deadWood: { color: '#3a332c', roughness: 1, flatShading: true },

  corrugated: { color: '#5d6365', roughness: 0.7, metalness: 0.45, flatShading: true },
  rust: { color: '#6b3d24', roughness: 0.85, metalness: 0.3, flatShading: true },
  rustLight: { color: '#80502e', roughness: 0.85, metalness: 0.25, flatShading: true },
  metalDark: { color: '#363a3c', roughness: 0.55, metalness: 0.55 },
  iron: { color: '#2a2b2c', roughness: 0.6, metalness: 0.65 },
  concrete: { color: '#6a6964', roughness: 1, flatShading: true },
  concreteDark: { color: '#4e4d49', roughness: 1, flatShading: true },
  asphalt: { color: '#2b2c2d', roughness: 1 },
  cloth: { color: '#57524a', roughness: 1, flatShading: true },
  clothStain: { color: '#4a4636', roughness: 1, flatShading: true },
  paintRed: { color: '#6a2a24', roughness: 0.7, metalness: 0.3, flatShading: true },
  paintBlue: { color: '#2f4552', roughness: 0.7, metalness: 0.3, flatShading: true },
  glassDark: { color: '#1b2326', roughness: 0.15, metalness: 0.6 },
  hazardYellow: { color: '#d9a71a', roughness: 0.6, metalness: 0.2, flatShading: true },
  rock: { color: '#67635c', roughness: 0.95, flatShading: true },
  rockDark: { color: '#4b4842', roughness: 0.95, flatShading: true },
  brick: { color: '#6e4a3b', roughness: 0.95, flatShading: true },
  plaster: { color: '#8d877a', roughness: 1, flatShading: true },
  tile: { color: '#9c9a90', roughness: 0.6, flatShading: true },
  whiteMetal: { color: '#b8b5ab', roughness: 0.5, metalness: 0.35 },
  redPaint: { color: '#9a2b22', roughness: 0.55, metalness: 0.3 },
  greenBoard: { color: '#2f6a32', roughness: 0.5, metalness: 0.1 },
  chip: { color: '#1a1a1c', roughness: 0.4, metalness: 0.3 },
  copper: { color: '#b4733d', roughness: 0.35, metalness: 0.8 },
  meat: { color: '#9c4b4b', roughness: 0.55 },
  meatFat: { color: '#d9b2a0', roughness: 0.6 },
  bandage: { color: '#ddd6c5', roughness: 0.95 },
  canLabel: { color: '#a8452a', roughness: 0.6 },
  tin: { color: '#a3a7a8', roughness: 0.35, metalness: 0.8 },
  glass: { color: '#a9c2bc', roughness: 0.08, metalness: 0.1 },
  powder: { color: '#2e2e30', roughness: 1 },
  sack: { color: '#7a6a4c', roughness: 1, flatShading: true },
  hide: { color: '#6e5a52', roughness: 0.9, flatShading: true },
  hideDark: { color: '#4a3c37', roughness: 0.95, flatShading: true },
  bone: { color: '#d6ccb4', roughness: 0.7, flatShading: true },
  blood: { color: '#3d0f0d', roughness: 0.25 },
  cooked: { color: '#6b3a1c', roughness: 0.7, flatShading: true },
  char: { color: '#3b3734', roughness: 1, flatShading: true },
  ash: { color: '#8e8a84', roughness: 1, flatShading: true },

  toxicGlow: { color: '#79ff3a', roughness: 0.3, emissive: '#5dff1a', emissiveIntensity: 2.2 },
  ember: { color: '#ff7a2a', roughness: 0.5, emissive: '#ff4d0d', emissiveIntensity: 2.6 },
  bulbWarm: { color: '#ffd9a0', roughness: 0.3, emissive: '#ffb04a', emissiveIntensity: 3 },
} satisfies Record<string, MatDef>;

export type MaterialKey = keyof typeof DEFS;

const cache = new Map<MaterialKey, THREE.MeshStandardMaterial>();

/** Shared material by palette key. Do not mutate; use `uniqueMat` for per-instance changes. */
export function mat(key: MaterialKey): THREE.MeshStandardMaterial {
  let m = cache.get(key);
  if (!m) {
    m = uniqueMat(key);
    cache.set(key, m);
  }
  return m;
}

/** A fresh, unshared material instance (e.g. for flickering emissives). */
export function uniqueMat(key: MaterialKey): THREE.MeshStandardMaterial {
  const d: MatDef = DEFS[key];
  return new THREE.MeshStandardMaterial({
    color: d.color,
    roughness: d.roughness ?? 0.8,
    metalness: d.metalness ?? 0,
    emissive: d.emissive ?? '#000000',
    emissiveIntensity: d.emissiveIntensity ?? 1,
    flatShading: d.flatShading ?? false,
    name: key,
  });
}
